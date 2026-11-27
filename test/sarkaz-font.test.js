/**
 * sarkaz-font.test.js — the embedded Sarkaz typeface, and the rules that keep it
 * usable.
 *
 * WHY THIS FILE EXISTS. `src/styles/sarkaz-font.css` is a generated file whose
 * payload is 19KB of base64. Three things can silently go wrong with it and none
 * of them would break a page load:
 *
 *   1. it drifts from `assets/fonts/EndfieldByButan.ttf` (font updated, blob not
 *      regenerated) — the theme then renders a face nobody can find the source of;
 *   2. it lands OUTSIDE the stylesheet's template literal (manifest order is the
 *      only thing keeping it inside) — the CSS turns into JavaScript and the whole
 *      sheet fails to parse, which looks like "the theme stopped working";
 *   3. the licensing line disappears — this is the one asset in the repo that is
 *      NOT MIT, so its attribution is part of shipping it.
 *
 * It also proves the mapping claim the docs make: the face really does carry
 * glyphs at U+0041–U+005A and U+0030–U+0039, i.e. "type Latin, get Sarkaz" needs
 * no transliteration table. That is checked by parsing the font's `cmap` rather
 * than by trusting the README.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const FONT = path.join(ROOT, 'assets', 'fonts', 'EndfieldByButan.ttf')
const CSS = path.join(ROOT, 'src', 'styles', 'sarkaz-font.css')
const THEME = path.join(ROOT, 'src', 'styles', 'theme.css')
const MANIFEST = path.join(ROOT, 'src', 'client', 'manifest.js')
const BUNDLE = path.join(ROOT, 'client.js')
const NOTICE = path.join(ROOT, 'assets', 'fonts', 'README.md')

let checks = 0
let failures = 0
const pass = (m) => { checks += 1; console.log('ok    ' + m) }
const fail = (m) => { checks += 1; failures += 1; console.log('FAIL  ' + m) }

/* ---------- the font file itself ---------- */
const fontBytes = fs.readFileSync(FONT)
if (fontBytes.slice(0, 4).equals(Buffer.from([0x00, 0x01, 0x00, 0x00]))) pass('assets 里的字体是 TrueType（sfnt 0x00010000）')
else fail('assets/fonts/EndfieldByButan.ttf is not a TrueType file')

/* Minimal cmap reader: find the (3,1) or (0,3) format-4 subtable and ask it which
   codepoints have a glyph. Enough to prove A-Z / 0-9 coverage without a font lib. */
const coversCodepoint = (() => {
  const numTables = fontBytes.readUInt16BE(4)
  let cmapOff = -1
  for (let i = 0; i < numTables; i += 1) {
    const at = 12 + i * 16
    if (fontBytes.toString('latin1', at, at + 4) === 'cmap') cmapOff = fontBytes.readUInt32BE(at + 8)
  }
  if (cmapOff < 0) return () => false
  const count = fontBytes.readUInt16BE(cmapOff + 2)
  let best = -1
  for (let i = 0; i < count; i += 1) {
    const rec = cmapOff + 4 + i * 8
    const platform = fontBytes.readUInt16BE(rec)
    const encoding = fontBytes.readUInt16BE(rec + 2)
    const offset = cmapOff + fontBytes.readUInt32BE(rec + 4)
    const format = fontBytes.readUInt16BE(offset)
    if (format === 4 && (best < 0 || (platform === 3 && encoding === 1))) best = offset
  }
  if (best < 0) return () => false
  const segX2 = fontBytes.readUInt16BE(best + 6)
  const segs = segX2 / 2
  const endsAt = best + 14
  const startsAt = endsAt + segX2 + 2
  return (cp) => {
    for (let s = 0; s < segs; s += 1) {
      const end = fontBytes.readUInt16BE(endsAt + s * 2)
      const start = fontBytes.readUInt16BE(startsAt + s * 2)
      if (cp >= start && cp <= end) return true
    }
    return false
  }
})()

const missing = []
for (let cp = 0x41; cp <= 0x5A; cp += 1) if (!coversCodepoint(cp)) missing.push(String.fromCharCode(cp))
if (missing.length === 0) pass('字体覆盖 A-Z（写拉丁字母即得萨卡兹字形，无需转写表）')
else fail('font is missing uppercase glyphs: ' + missing.join(''))

const missingDigits = []
for (let cp = 0x30; cp <= 0x39; cp += 1) if (!coversCodepoint(cp)) missingDigits.push(String.fromCharCode(cp))
if (missingDigits.length === 0) pass('字体覆盖 0-9')
else fail('font is missing digit glyphs: ' + missingDigits.join(''))

/* ---------- the generated stylesheet ---------- */
const css = fs.readFileSync(CSS, 'utf8')
const embedded = css.match(/src: url\("data:font\/ttf;base64,([A-Za-z0-9+/=]+)"\) format\("truetype"\)/)
if (embedded !== null) pass('样式片段里有一条 data: 内嵌的 truetype')
else fail('sarkaz-font.css has no base64 truetype @font-face')

if (embedded !== null) {
  const decoded = Buffer.from(embedded[1], 'base64')
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
  if (sha(decoded) === sha(fontBytes)) pass('内嵌副本与 assets 里的 ttf 逐字节一致（SHA-256）')
  else fail('embedded font drifted from assets/fonts/EndfieldByButan.ttf — run: npm run font:build')
  if (decoded.length === fontBytes.length) pass('内嵌副本长度一致（' + decoded.length + ' 字节）')
  else fail('embedded copy is ' + decoded.length + ' bytes, file is ' + fontBytes.length)
}

/* A stray backtick or ${ in the fragment would terminate/interpret the template
   literal the stylesheet lives in — the failure mode is a syntax error in the
   bundle, far away from here. */
if (!css.includes('`') && !css.includes('${')) pass('片段里没有反引号与 ${（不会截断样式表的模板字面量）')
else fail('sarkaz-font.css would terminate the stylesheet template literal')

if (/@font-face\s*\{[\s\S]*?font-family:\s*"Endfield Sarkaz"/.test(css)) pass('@font-face 声明了 "Endfield Sarkaz" 这个族名')
else fail('the @font-face does not declare the Endfield Sarkaz family')

/* ---------- wiring: manifest order, bundle, licence ---------- */
const manifest = fs.readFileSync(MANIFEST, 'utf8')
const fontAt = manifest.indexOf("'../styles/sarkaz-font.css'")
const themeAt = manifest.indexOf("'../styles/theme.css'")
if (fontAt > 0 && themeAt > fontAt) pass('manifest 里字体片段排在 theme.css 之前（同一个模板字面量内）')
else fail('manifest must list sarkaz-font.css before theme.css')

const bundle = fs.readFileSync(BUNDLE, 'utf8')
const occurrences = bundle.split('data:font/ttf;base64,').length - 1
if (occurrences === 1) pass('client.js 里恰好内嵌一份字体')
else fail('client.js carries ' + occurrences + ' embedded fonts, expected exactly 1')

const theme = fs.readFileSync(THEME, 'utf8')
const rule = theme.match(/\[data-endfield-thunder-footer\]\s*\{([\s\S]*?)\}/)
if (rule !== null) pass('theme.css 有底部字母行的萨卡兹规则')
else fail('theme.css lost the [data-endfield-thunder-footer] rule')

if (rule !== null) {
  const body = rule[1]
  if (/font-family:\s*"Endfield Sarkaz"/.test(body)) pass('该规则把字体排在字体栈第一位（否则会输给等宽回退）')
  else fail('the Sarkaz rule does not lead its font stack with the face')
  /* The face ships Regular only: an inherited 700 asks the browser to synthesise a
     bold by smearing the outline, which turns the geometric glyphs into blobs. */
  if (/font-weight:\s*400/.test(body)) pass('该规则压掉继承来的 700，避免合成加粗把字形撑变形')
  else fail('the Sarkaz rule must pin font-weight: 400')
}

const notice = fs.readFileSync(NOTICE, 'utf8')
if (/CC BY-NC 4\.0/.test(notice) && /罗醭坦/.test(notice)) pass('字体目录里保留了作者与 CC BY-NC 4.0 授权说明')
else fail('assets/fonts/README.md lost the CC BY-NC 4.0 attribution')

const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
if (/EndfieldByButan|CC BY-NC/.test(readme)) pass('README 的素材归属里提到了这个字体')
else fail('README 素材归属 must name the font and its non-commercial licence')

console.log('')
if (failures) {
  console.error(failures + ' sarkaz-font check(s) failed')
  process.exit(1)
}
console.log('all sarkaz-font checks passed (' + checks + ')')
