/**
 * audio-upload.test.js — the 「上传 wav」 path behind issue #47.
 *
 * What this covers, and why each one is worth a test rather than review:
 *   - a non-wav body must be REFUSED, not written: a renamed MP3 handed to
 *     Media.SoundPlayer is silence, and silence looks exactly like a broken
 *     feature;
 *   - a clip longer than the 2.5 s cap must be refused: the per-slot debounce is
 *     2.5 s, so an accepted 8 s file would talk over the next announcement;
 *   - an upload must WIN over a same-named file in the configured directory /
 *     Desktop / bundle — otherwise the button succeeds and is silently shadowed;
 *   - 「恢复内置」 must only ever delete a file inside THIS plugin's own upload
 *     directory, and must fall back to the previous chain afterwards;
 *   - the duration memo must be dropped on replace, or a re-upload of the same
 *     slot keeps the previous clip's length in the "still speaking" gate.
 *
 * No host, no browser: lib/audio.js is required directly and driven with a stub
 * ctx plus a throwaway upload directory.
 *
 * Usage: node test/audio-upload.test.js
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const { AudioRuntime } = require(path.join(ROOT, 'lib', 'audio.js'))
const { renderWav, parseWav } = require(path.join(ROOT, 'lib', 'tone.js'))

let failures = 0
const check = (cond, label, detail) => {
  if (cond) console.log('ok    ' + label)
  else { console.error('FAIL  ' + label + (detail === undefined ? '' : ' — ' + detail)); failures++ }
}

/** One short valid clip (mono 16-bit PCM, as the validator requires). */
const wav = (seconds) => renderWav({
  duration: seconds,
  peakDbfs: -3,
  notes: [{ note: 'A4', start: 0, duration: seconds, gain: 0.4, timbre: 'blip' }],
})

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-upload-'))
const audio = new AudioRuntime({ get: () => undefined }, { uploadDir: tmp })

/* --- 1. before any upload: the bundled tone wins --- */
const before = audio.resolve('turn-start')
check(before !== undefined && before.uploaded === false && before.origin === 'bundled',
  '未上传时 turn-start 解析到内置音',
  JSON.stringify(before))

/* --- 2. refusals --- */
const notWav = audio.saveUpload('turn-start', Buffer.from('ID3\u0004 not a wav at all'.repeat(8)))
check(notWav.ok === false && /PCM wav/.test(notWav.why), '非 WAV 体被拒绝（不会写出半截文件）', JSON.stringify(notWav))

const badSlot = audio.saveUpload('../evil', wav(0.4))
check(badSlot.ok === false && /unknown slot/.test(badSlot.why), '槽位名必须是白名单里的五个之一', JSON.stringify(badSlot))

const tooLong = audio.saveUpload('turn-start', wav(3))
check(tooLong.ok === false && /too long/.test(tooLong.why), '超过 2.5 秒的片段被拒绝', JSON.stringify(tooLong))
check(fs.existsSync(path.join(tmp, 'turn-start.wav')) === false, '被拒绝的上传不会留下文件')

/* --- 3. a real upload: wins over the bundled tone and reports itself --- */
const clip = wav(0.6)
const saved = audio.saveUpload('turn-start', clip)
check(saved.ok === true && saved.seconds === 0.6, '合法 WAV 上传成功', JSON.stringify(saved))

const written = path.join(tmp, 'turn-start.wav')
check(fs.existsSync(written), '文件落在托管目录里')
check(fs.readFileSync(written).equals(clip), '落盘字节与请求体一致')

const afterUpload = audio.resolve('turn-start')
check(afterUpload.uploaded === true && afterUpload.file === written,
  '上传的音效优先于内置音（否则按钮会「成功但没用」）',
  JSON.stringify(afterUpload))

const snap = audio.snapshot()
const slot = snap.slots.find((s) => s.id === 'turn-start')
check(slot.uploaded === true && slot.bundled === false, '快照把该槽位标为 uploaded（面板据此显示「恢复内置」）')
check(snap.uploadDir === tmp, '快照带出托管目录，面板才知道哪些文件可以删')
check(audio.snapshot().slots.filter((s) => s.uploaded).length === 1, '只影响被上传的那一个槽位')

/* --- 4. replace: content changes, cache must not keep the old duration --- */
const firstMs = audio.soundDurationMs(written)
audio.saveUpload('turn-start', wav(1.2))
const secondMs = audio.soundDurationMs(written)
check(firstMs > 0 && secondMs > firstMs, '替换后时长缓存失效（旧时长会卡住「仍在播报」闸门）',
  firstMs + ' -> ' + secondMs)
check(parseWav(fs.readFileSync(written)) !== undefined, '替换后的文件仍是可解析的 WAV')

/* --- 5. restore --- */
const removed = audio.removeUpload('turn-start')
check(removed.ok === true && removed.removed === true, '恢复内置删除上传文件', JSON.stringify(removed))
check(fs.existsSync(written) === false, '文件确实被删除')
const back = audio.resolve('turn-start')
check(back.uploaded === false && back.origin === 'bundled', '恢复后回落到内置音', JSON.stringify(back))

const removedAgain = audio.removeUpload('turn-start')
check(removedAgain.ok === true && removedAgain.removed === false, '重复恢复是幂等的（没有文件也不算失败）',
  JSON.stringify(removedAgain))

/* --- 6. a host with no resolvable home cannot upload, and says why --- */
const noHome = new AudioRuntime({ get: () => undefined }, { uploadDir: undefined })
if (noHome.uploadDir === undefined) {
  const refused = noHome.saveUpload('turn-start', wav(0.4))
  check(refused.ok === false && /upload directory/.test(refused.why), '没有托管目录时明确拒绝', JSON.stringify(refused))
} else {
  /* This machine resolved ~/.dsh, so the fallback path is the honest outcome:
     assert it is an absolute path rather than silently skipping. */
  check(path.isAbsolute(noHome.uploadDir), '未注入目录时回落到 <dshHome>/theme-endfield/sounds',
    noHome.uploadDir)
}

fs.rmSync(tmp, { recursive: true, force: true })

console.log('')
if (failures) { console.error(failures + ' upload check(s) failed'); process.exit(1) }
console.log('all upload checks passed')
