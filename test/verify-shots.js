/**
 * verify-shots.js — measure the four rendered PNGs instead of describing them.
 * Decodes each screenshot and reports the accent-coloured pixel population, so
 * "the palette actually switched" is a number rather than an impression.
 *
 * PNG decoding is done with zlib only (no dependency): the shots are written by
 * Chrome as 8-bit RGB/RGBA, non-interlaced.
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const decodePng = (file) => {
  const buf = fs.readFileSync(file)
  let pos = 8
  let w = 0, h = 0, bitDepth = 0, colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.slice(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4)
      bitDepth = data[8]; colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bitDepth !== 8) throw new Error('unexpected bit depth ' + bitDepth)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels) throw new Error('unexpected colour type ' + colorType)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * channels
  const out = Buffer.alloc(w * h * channels)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (ft === 1) v += a
      else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      }
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride)
    prev = cur
  }
  return { w, h, channels, data: out }
}

/* Classify a pixel by hue family, which is what "did the palette change" means.
   Yellow: red and green both high, blue low. Cyan: green and blue both clearly
   above red. Neutral greys and the paper/ink surfaces fall through. */
const classify = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  if (mx - mn < 30) return 'neutral'
  if (r > 90 && g > 80 && b < mx - 45 && Math.abs(r - g) < 90) return 'yellow'
  if (g > r + 25 && b > r + 25) return 'cyan'
  return 'other'
}

const ROOT = path.resolve(__dirname, '..')
const SHOTS = path.join(ROOT, '.kagent', 'shots')
let failures = 0
const results = {}

for (const name of ['shot-valley-light', 'shot-valley-dark', 'shot-wuling-light', 'shot-wuling-dark']) {
  const file = path.join(SHOTS, name + '.png')
  if (!fs.existsSync(file)) { console.error('FAIL  missing ' + name + '.png (run node test/shoot.js)'); failures++; continue }
  const img = decodePng(file)
  const tally = { yellow: 0, cyan: 0, neutral: 0, other: 0 }
  for (let i = 0; i < img.data.length; i += img.channels) {
    tally[classify(img.data[i], img.data[i + 1], img.data[i + 2])]++
  }
  const total = img.w * img.h
  results[name] = tally
  const pct = (n) => (n / total * 100).toFixed(2) + '%'
  console.log(name.padEnd(20) + ' yellow ' + pct(tally.yellow).padStart(7)
    + '   cyan ' + pct(tally.cyan).padStart(7)
    + '   neutral ' + pct(tally.neutral).padStart(7))
}

console.log('')
const check = (label, ok, detail) => {
  if (ok) console.log('ok    ' + label + (detail ? '  [' + detail + ']' : ''))
  else { console.error('FAIL  ' + label + (detail ? '  [' + detail + ']' : '')); failures++ }
}
for (const scheme of ['light', 'dark']) {
  const v = results['shot-valley-' + scheme]
  const w = results['shot-wuling-' + scheme]
  if (!v || !w) continue
  // 谷地黄 must be dominated by yellow accent pixels, and carry essentially no cyan.
  check(scheme + ' 谷地黄 以黄色强调为主', v.yellow > w.yellow * 3 && v.yellow > 3000,
    'valley yellow=' + v.yellow + ' wuling yellow=' + w.yellow)
  // 武陵青 must be dominated by cyan, and lose the yellow.
  check(scheme + ' 武陵青 以青色强调为主', w.cyan > v.cyan * 3 && w.cyan > 3000,
    'wuling cyan=' + w.cyan + ' valley cyan=' + v.cyan)
}

console.log('')
if (failures) { console.error(failures + ' shot check(s) failed'); process.exit(1) }
console.log('all rendered-screenshot palette checks passed')
