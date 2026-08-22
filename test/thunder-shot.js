/**
 * thunder-shot.js — render the 雷霆大字 plate in a REAL browser and capture it.
 *
 * Every automated assertion for this feature is structural (element tree, stylesheet
 * source). None of them has seen a pixel, and the request is about how the word
 * LOOKS: 粗体、醒目的大号的白色文字. Two things can only be checked by rendering:
 *   - whether white type is actually legible over the theme's cream paper AND over
 *     its near-black dark surface (a text-shadow halo either works or it does not);
 *   - whether the word is genuinely centred and genuinely large at a real viewport.
 *
 * TWO MEASURED TRAPS, both hit while writing this:
 *
 * 1. `--virtual-time-budget` must land INSIDE the 3s hold. At 4000ms Chrome
 *    fast-forwarded past the plate's own auto-hide and wrote four screenshots of an
 *    empty page — which the first version of this script reported as success,
 *    because it only checked that a PNG file existed.
 *
 * 2. The entry animation does NOT reliably advance under virtual time: probing the
 *    live DOM showed the word correctly built (white, 900, 100px) but stuck on the
 *    animation's first keyframe (opacity 0, scale 2.4), so dark mode captured
 *    nothing while light happened to render.
 *
 * WHICH STATE IS CAPTURED. The entry animation is its own default-OFF switch, so the
 * shipped default already IS the static path — the word appears at full size and full
 * opacity, which is also what sidesteps trap 2 without any browser flag. These
 * captures therefore show the state a user actually gets out of the box.
 *
 * An earlier version passed --force-prefers-reduced-motion to dodge trap 2. That is
 * deliberately gone: the OS override reaches the SAME still path, so keeping the flag
 * would mean a broken default (e.g. the still marker never applied) still captured
 * perfectly and this test could no longer tell the two apart.
 *
 * Usage: node test/thunder-shot.js   (output: .kagent/shots/thunder-*.png)
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUTDIR = path.join(ROOT, '.kagent', 'shots')
fs.mkdirSync(OUTDIR, { recursive: true })

const chrome = [process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-thunder-'))
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(TMP, 'client.js'))

/** The theme's own token values, so the plate sits on the real cream/near-black. */
const mk = (dark) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden}
  body{
    --dsw-alias-bg-base:${dark ? '#101110' : '#e8e8e2'};
    --dsw-alias-bg-layer-1:${dark ? '#181a18' : '#f2f2ec'};
    --dsw-alias-label-primary:${dark ? '#f5f5f0' : '#101110'};
    --dsw-alias-label-secondary:${dark ? '#898d89' : '#4a4c48'};
    --dsw-alias-border-l1:${dark ? '#343633' : '#d8d9d5'};
    --dsw-alias-border-l2:${dark ? '#4a4d49' : '#b6b8b3'};
    --dsw-font-family:Arial,sans-serif;
    background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
    font-family:var(--dsw-font-family);
  }
  /* A stand-in for the conversation column, so the capture shows the word sitting
     on top of real text rather than on an empty page. */
  .col{max-width:760px;margin:0 auto;padding:56px 24px;line-height:1.7;font-size:14px}
  .who{font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin:18px 0 4px}
</style></head><body${dark ? ' data-ds-dark-theme' : ''}>
<div class="col">
  <div class="who">User</div>
  <div>帮我做个雷霆大字功能，归类到娱乐模式，默认关闭。</div>
  <div class="who">Assistant</div>
  <div>已加入「04 娱乐 / ENTERTAINMENT」分组，默认关闭。任务开始与结束时会在屏幕正中打出白色粗体大字，3 秒后自动隐藏。这段正文只是背景，用来确认大字压在正文之上仍然清晰可读，并且不会遮挡阅读之外的交互。</div>
  <div>再补几行文字，把版面填满一些，这样截图里可以同时看到压暗底、白色字形与下层正文之间的关系。等高线与水印在这张图里没有开启，避免干扰对比判断。</div>
</div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
  localStorage.setItem('dsh-theme-endfield-enabled','1')
  localStorage.setItem('dsh-theme-endfield-thunder','1')
  localStorage.setItem('dsh-theme-endfield-loader','0')
  localStorage.setItem('dsh-theme-endfield-contour','0')
  localStorage.setItem('dsh-theme-endfield-watermark','0')

  // A sessions double shaped like the runtime contract, so the plate is produced by
  // the theme's real subscription path rather than by hand-built DOM.
  const mkObs = (init) => { let s=init; const subs=new Set(); return {
    getSnapshot:()=>s, subscribe:(f)=>{subs.add(f);return()=>subs.delete(f)},
    set(n){s=n;[...subs].forEach(f=>f())} } }
  const session = mkObs({ running:false })
  const list = mkObs({ current:'s1' })
  const sessions = { list, binding:(id)=> id==='s1' ? { sessionId:id, session } : undefined }

  const mod = window.__MOD__.factory(()=>null)
  mod.apply({
    get:(n)=> n==='theme' ? { overrideTokens:()=>()=>{} } : (n==='sessions' ? sessions : undefined),
    effect:()=>{},
  })
  // Fire the real edge. WORD is substituted per capture.
  session.set({ running: __RUNNING__ })
  // Let the entry animation settle on its held frame before the screenshot.
  setTimeout(()=>{ document.title = 'READY' }, 700)
</script></body></html>`

let failures = 0
const shots = []
for (const dark of [false, true]) {
  for (const [label, running] of [['start', true], ['done', false]]) {
    // 'done' needs a true->false edge, so seed running=true first for that case.
    let html = mk(dark)
    if (running === false) {
      html = html.replace(
        'session.set({ running: __RUNNING__ })',
        'session.set({ running: true }); session.set({ running: false })')
    } else {
      html = html.replace('__RUNNING__', 'true')
    }
    const page = path.join(TMP, `p-${dark ? 'dark' : 'light'}-${label}.html`)
    fs.writeFileSync(page, html)
    const out = path.join(OUTDIR, `thunder-${dark ? 'dark' : 'light'}-${label}.png`)
    try {
      /* The virtual-time budget must land INSIDE the 3s hold (see the header note).
         No motion flag: the animation switch defaults to off, so this captures the
         real shipped default rather than an OS-forced variant of it. */
      execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox',
        '--hide-scrollbars', '--force-device-scale-factor=1',
        '--window-size=1280,720', '--virtual-time-budget=1400',
        '--screenshot=' + out, 'file:///' + page.replace(/\\/g, '/')],
        { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'ignore', 'ignore'] })
    } catch (e) { /* chrome returns non-zero in some headless builds; check the file */ }
    if (fs.existsSync(out) && fs.statSync(out).size > 2000) {
      console.log('ok    wrote ' + path.relative(ROOT, out) + '  (' + Math.round(fs.statSync(out).size / 1024) + ' KB)')
      shots.push({ file: out, dark, label })
    } else {
      console.error('FAIL  no screenshot for ' + (dark ? 'dark' : 'light') + '/' + label)
      failures++
    }
  }
}

/* A written PNG is not evidence the WORD is in it: the first version of this script
   used a 4000ms virtual-time budget, which fast-forwarded past the plate's own 3s
   auto-hide and cheerfully wrote four screenshots of an empty page. So each capture
   is decoded and checked for the two things that must be true — a large mass of
   near-white pixels (the glyphs) and a darkened backdrop (the scrim). */
const zlib = require('zlib')
/** Minimal PNG decoder: IHDR + IDAT, 8-bit RGB/RGBA, no interlace. */
const decodePng = (buf) => {
  let pos = 8, w = 0, h = 0, bd = 0, ct = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.slice(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bd !== 8) throw new Error('unexpected bit depth ' + bd)
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 0
  if (!ch) throw new Error('unsupported colour type ' + ct)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const px = Buffer.alloc(h * stride)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = Buffer.alloc(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0
      const b = prev[i]
      const c = i >= ch ? prev[i - ch] : 0
      let v = line[i]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[i] = v & 0xff
    }
    cur.copy(px, y * stride)
    prev = cur
  }
  return { w, h, ch, px }
}

for (const s of shots) {
  const { w, h, ch, px } = decodePng(fs.readFileSync(s.file))
  const tag = (s.dark ? 'dark' : 'light') + '/' + s.label
  let nearWhite = 0
  // Centre band only: the word is vertically centred, so this avoids counting the
  // light page background in light mode as if it were glyph ink.
  const y0 = Math.floor(h * 0.38), y1 = Math.ceil(h * 0.62)
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      if (px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235) nearWhite++
    }
  }
  /* The scrim: sample a corner, which the word never reaches.
     Light mode is where this is measurable — an ink scrim over cream MUST darken it.
     Dark mode deliberately has no headroom: rgba(16,17,16,0.28) over #101110 is the
     same colour, so a "corner got darker" assertion there would only ever measure
     rounding noise. Asserting it anyway is how a test starts lying, so dark mode
     asserts the honest thing instead: the corner stays at the near-black baseline
     (the scrim neither lightens the page nor washes it out). */
  const ci = (8 * w + 8) * ch
  const corner = (px[ci] + px[ci + 1] + px[ci + 2]) / 3
  const bandPx = (y1 - y0) * w
  const pctWhite = (nearWhite / bandPx) * 100

  if (pctWhite > 1.5) console.log('ok    ' + tag + ' 字形可见：中央带近白像素 ' + pctWhite.toFixed(1) + '%')
  else { console.error('FAIL  ' + tag + ' 中央带几乎没有白色字形（' + pctWhite.toFixed(2) + '%）— 大字没有出现在截图里'); failures++ }

  if (s.dark) {
    // No measurable headroom by design; assert it stays near-black rather than
    // pretending to measure a dimming that cannot exist.
    if (corner <= 24) console.log('ok    ' + tag + ' 底色仍为近黑（角落 ' + corner.toFixed(0) + ' ≤ 24，压暗层未冲淡页面）')
    else { console.error('FAIL  ' + tag + ' 角落被冲淡到 ' + corner.toFixed(0) + '（预期 ≤ 24）'); failures++ }
  } else {
    if (corner < 226) console.log('ok    ' + tag + ' 压暗底生效：角落 ' + corner.toFixed(0) + ' < 226（纸底 232）')
    else { console.error('FAIL  ' + tag + ' 没有压暗底（角落 ' + corner.toFixed(0) + '，纸底 232）'); failures++ }
  }

  /* The white glyphs must actually out-contrast the surface they sit on. In light
     mode that is the whole risk: white on cream is nearly invisible without the
     halo, so this measures the real composited gap rather than trusting the CSS. */
  const wl = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  const relLum = (r, g, b) => 0.2126 * wl(r) + 0.7152 * wl(g) + 0.0722 * wl(b)
  // Effective backdrop = the scrimmed page, sampled at the corner.
  const bgL = relLum(px[ci], px[ci + 1], px[ci + 2])
  const fgL = relLum(255, 255, 255)
  const ratio = (Math.max(fgL, bgL) + 0.05) / (Math.min(fgL, bgL) + 0.05)
  if (ratio >= 3) console.log('ok    ' + tag + ' 白字与压暗底对比 ' + ratio.toFixed(2) + ':1（≥3，大字号下限）')
  else { console.error('FAIL  ' + tag + ' 白字对比仅 ' + ratio.toFixed(2) + ':1（应 ≥3）'); failures++ }
}

console.log('')
if (failures) { console.error(failures + ' capture(s) failed'); process.exit(1) }
console.log('captured ' + shots.length + ' screenshot(s) into ' + path.relative(ROOT, OUTDIR))
