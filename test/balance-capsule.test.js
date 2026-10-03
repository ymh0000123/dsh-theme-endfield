/* Balance-capsule shell probe.
 *
 * The capsule is raw DOM + a stylesheet, so nothing type-checks the two halves
 * against each other: a paint routine that writes into a slot the markup never
 * created, or a CSS selector aimed at an element that no longer exists, both
 * fail SILENTLY in the browser (a selector that matches nothing never throws —
 * see docs/engineering-notes.md). This probe pins the three contracts that make
 * the capsule a single object instead of three drifting ones:
 *
 *   1. MARKUP — the reference HUD's left-to-right order, with no glyph
 *      placeholders left behind (the old ◉ / ⚡ text seeds are gone).
 *   2. WIRING — every slot balancePaint/balancePaintWindow write to exists in
 *      that markup, and every element the stylesheet styles exists too.
 *   3. DIAL — the elapsed share reaches the ring through ONE custom property,
 *      and 33% of a window is 118.8deg starting at 12 o'clock.
 */
'use strict'
const fs = require('fs')
const path = require('path')

let pass = 0
let fail = 0
const check = (label, ok) => {
  if (ok) { pass += 1 } else { fail += 1; console.error('FAIL ' + label) }
}

const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')

/* ---------- 1. the markup the plugin actually builds ---------- */
/* Anchored on the capsule's own attribute first: `el.innerHTML =` also appears
   in the loader overlay, and slicing THAT would test the wrong object. */
const anchor = src.indexOf("el.setAttribute('data-endfield-balance', '')")
if (anchor < 0) { console.error('balance capsule mount not found in client.js'); process.exit(1) }
const mStart = src.indexOf('el.innerHTML =', anchor)
const mEnd = src.indexOf('document.body.appendChild(el)', mStart)
if (mStart < 0 || mEnd < 0 || mEnd <= mStart) {
  console.error('could not slice the balance-capsule markup out of client.js')
  process.exit(1)
}
const snippet = src.slice(mStart, mEnd).replace('el.innerHTML =', 'const __html =')
const markup = new Function(snippet + '\nreturn __html')()

/* ---------- 2. the live stylesheet ---------- */
const cssMarker = 'disposeStyles = insertCss(`'
const cssAt = src.indexOf(cssMarker)
if (cssAt < 0) { console.error('insertCss template literal not found'); process.exit(1) }
const cssRest = src.slice(cssAt + cssMarker.length)
const cssEnd = cssRest.indexOf('\n    `)')
if (cssEnd < 0) { console.error('closing backtick of the stylesheet not found'); process.exit(1) }
const css = cssRest.slice(0, cssEnd)

/* ---------- 3. the paint routines ---------- */
const pStart = src.indexOf('    const balancePaint = (data) => {')
const pEnd = src.indexOf('    const balanceFetch = async () => {')
if (pStart < 0 || pEnd < 0 || pEnd <= pStart) {
  console.error('could not slice the balance paint routines out of client.js')
  process.exit(1)
}
const paint = src.slice(pStart, pEnd)

const slotsInMarkup = new Set(
  (markup.match(/data-endfield-balance-[a-z-]+/g) || []))
const slotsWritten = new Set(
  (paint.match(/'data-endfield-balance-[a-z-]+'/g) || []).map((s) => s.slice(1, -1)))
const selectorsInCss = new Set(
  (css.match(/\[data-endfield-balance-[a-z-]+\]/g) || []).map((s) => s.slice(1, -1)))

/* --- MARKUP: order and shape ------------------------------------------- */
const order = (markup.match(/data-endfield-balance-[a-z-]+/g) || [])
  .filter((s, i, all) => all.indexOf(s) === i)
check('markup: icon leads the pill', order[0] === 'data-endfield-balance-icon')
check('markup: money group holds currency, int and frac, in that order',
  markup.indexOf('data-endfield-balance-money') < markup.indexOf('data-endfield-balance-currency') &&
  markup.indexOf('data-endfield-balance-currency') < markup.indexOf('data-endfield-balance-int') &&
  markup.indexOf('data-endfield-balance-int') < markup.indexOf('data-endfield-balance-frac'))
check('markup: countdown run holds the phase label INSIDE it (「低谷时段剩余…」)',
  markup.indexOf('data-endfield-balance-window') < markup.indexOf('data-endfield-balance-phase') &&
  markup.indexOf('data-endfield-balance-phase') < markup.indexOf('data-endfield-balance-remain'))
check('markup: the countdown run carries the static 时段剩余 glue itself',
  markup.indexOf('</span>时段剩余') > -1)
check('markup: elapsed read sits between the countdown run and the dial',
  markup.indexOf('data-endfield-balance-remain') < markup.indexOf('data-endfield-balance-pct') &&
  markup.indexOf('data-endfield-balance-pct') < markup.indexOf('data-endfield-balance-badge'))
check('markup: the dial holds a progress ring and a clock face',
  markup.indexOf('data-endfield-balance-badge') < markup.indexOf('data-endfield-balance-ring') &&
  markup.indexOf('data-endfield-balance-ring') < markup.indexOf('data-endfield-balance-clock'))
check('markup: no glyph placeholder survives (◉ gone)', markup.indexOf('◉') === -1)
check('markup: no glyph placeholder survives (⚡ gone)', markup.indexOf('⚡') === -1)
check('markup: every slot carries exactly one attribute, no duplicates',
  order.length === (markup.match(/data-endfield-balance-/g) || []).length)

/* --- WIRING: the two halves agree --------------------------------------- */
/* Runtime STATE attributes are written onto an existing slot rather than being
   slots themselves: the paint flips -phase-peak and the stylesheet keys off it,
   and -boot is raised/cleared on the pill to switch poses. */
const STATE_ATTRS = new Set(['data-endfield-balance-phase-peak', 'data-endfield-balance-boot'])
const missing = [...slotsWritten].filter((s) => !STATE_ATTRS.has(s) && !slotsInMarkup.has(s))
check('wiring: every painted slot exists in the markup (' + (missing.join(', ') || 'none missing') + ')',
  missing.length === 0)
check('wiring: the peak state flag the paint flips is the one the stylesheet keys off',
  /\[data-endfield-balance-phase\]\[data-endfield-balance-phase-peak='1'\]/.test(css))
const orphanCss = [...selectorsInCss].filter((s) => !STATE_ATTRS.has(s) && !slotsInMarkup.has(s))
check('wiring: every styled slot exists in the markup (' + (orphanCss.join(', ') || 'none orphaned') + ')',
  orphanCss.length === 0)
check('wiring: the countdown text no longer prefixes 剩余 (the markup owns it)',
  !/setText\('data-endfield-balance-remain',\s*'剩余'/.test(paint))

/* --- DIAL: one number, one ring ----------------------------------------- */
check('dial: the ring is a conic-gradient', /\[data-endfield-balance-ring\][\s\S]{0,400}conic-gradient\(/.test(css))
check('dial: the ring reads the --endfield-balance-sweep property',
  /\[data-endfield-balance-ring\][\s\S]{0,400}var\(--endfield-balance-sweep/.test(css))
check('dial: the ring is masked down to a band (a disc would swallow the pill)',
  /\[data-endfield-balance-ring\][\s\S]{0,600}mask: radial-gradient\(/.test(css))
check('dial: the paint writes the sweep property',
  paint.indexOf("setProperty('--endfield-balance-sweep'") > -1)
check('dial: 33% of the window is 118.8deg clockwise from 12 o\'clock',
  Math.abs(33 * 3.6 - 118.8) < 1e-9 && /elapsedPct \* 3\.6/.test(paint))
check('dial: the clock face carries the needle pseudo-element',
  /\[data-endfield-balance-clock\]::after/.test(css))
check('dial: the icon is drawn in three CSS layers, not a glyph',
  /\[data-endfield-balance-icon\]::before/.test(css) &&
  /\[data-endfield-balance-icon\]::after/.test(css))

/* --- PILL: the reference stadium, rebuilt at header-chip size ------------ */
check('pill: 32px stadium with fully rounded ends',
  /\[data-endfield-balance\] \{[\s\S]{0,1200}height: 32px;/.test(css) &&
  /\[data-endfield-balance\] \{[\s\S]{0,1200}border-radius: 999px;/.test(css))
/* The theme flattens every rounded corner it can reach (`body:not(.theme-endfield-round)
   [class] { border-radius: 0 !important }`), so the one shape that is a stadium by
   design pins its own radius inline, with priority. */
check('pill: the stadium survives the theme zero-radius pass',
  /* The boot pose hands the shape its 14px, the collapse hands it back; both
     writes carry inline priority, which is the only level that outranks the
     theme's author-!important flattening. */
  src.indexOf("el.style.setProperty('border-radius', bootAnimated ? '14px' : '999px', 'important')") > -1 &&
  src.indexOf("balanceEl.style.setProperty('border-radius', '999px', 'important')") > -1 &&
  src.indexOf('typeof el.style.setProperty === \'function\'') > -1)
check('pill: min-width reproduces the reference gap between the two reads, but yields to a narrow window',
  /\[data-endfield-balance\] \{[\s\S]{0,900}min-width: min\(300px, calc\(100vw - 16px\)\);/.test(css))
check('pill: the accent comes from the palette, never a hardcoded dial colour',
  !/#c6ca4c/i.test(css) && /var\(--edge-accent\)/.test(css))
check('pill: a narrow window drops the countdown rather than clipping the dial',
  /@media \(max-width: 316px\) \{[\s\S]{0,240}\[data-endfield-balance-window\] \{\s*display: none;/.test(css) &&
  /* The breakpoint must sit BELOW the pill's natural width (300 + 16 slack), or
     the reference layout would lose its countdown at the width it was shot at. */
  316 <= 300 + 16 && 316 > 300)

/* --- BOOT: the brand pose that collapses into the balance row ------------ */
check('boot: the pill opens at the reference panel size (448x72, 14px radius)',
  /\[data-endfield-balance\]\[data-endfield-balance-boot\] \{[\s\S]{0,300}height: 72px;/.test(css) &&
  /\[data-endfield-balance\]\[data-endfield-balance-boot\] \{[\s\S]{0,300}min-width: min\(448px, calc\(100vw - 16px\)\);/.test(css) &&
  /\[data-endfield-balance\]\[data-endfield-balance-boot\] \{[\s\S]{0,300}padding: 0 22px;/.test(css))
check('boot: the box geometry is what animates, so the pose is one object changing shape',
  /\[data-endfield-balance\] \{[\s\S]{0,2200}transition:[\s\S]{0,200}height 420ms/.test(css) &&
  /\[data-endfield-balance\] \{[\s\S]{0,2200}transition:[\s\S]{0,260}border-radius 420ms/.test(css))
check('boot: the brand block is absolutely placed over the row, hidden when the pose is off',
  /* The window has to clear the rule's own box + comment block, which is longer
     than the declaration list it documents. */
  /\[data-endfield-balance-brand\] \{[\s\S]{0,900}position: absolute;/.test(css) &&
  /\[data-endfield-balance-brand\] \{[\s\S]{0,900}opacity: 0;/.test(css) &&
  /\[data-endfield-balance\]\[data-endfield-balance-boot\] \[data-endfield-balance-brand\] \{\s*opacity: 1;/.test(css))
check('boot: the balance row keeps its layout and only fades (no second reflow)',
  /\[data-endfield-balance\]\[data-endfield-balance-boot\] > :not\(\[data-endfield-balance-brand\]\) \{[\s\S]{0,200}opacity: 0;/.test(css))
check('boot: the mark is a disc over the same three-layer square device',
  /\[data-endfield-balance-brand-mark\] \{[\s\S]{0,240}border-radius: 999px;/.test(css) &&
  /\[data-endfield-balance-brand-mark\]::before/.test(css) &&
  /\[data-endfield-balance-brand-mark\]::after/.test(css))
check('boot: the markup carries the brand lockup, /// DEEPSEEK API and all',
  markup.indexOf('data-endfield-balance-brand-mark') > -1 &&
  markup.indexOf('data-endfield-balance-brand-kicker>/// DEEPSEEK API<') > -1 &&
  markup.indexOf('data-endfield-balance-brand-title>DeepSeek 当前低谷<') > -1)
check('boot: the paint names the window the panel opens onto',
  paint.indexOf("? 'DeepSeek 当前高峰'") > -1 &&
  /* a statutory holiday is named instead of 低谷, so the pose cannot read as an
     ordinary night (DeepSeek 「API 峰谷时间补充说明」 2026-09-19) */
  paint.indexOf("'DeepSeek ' + (win.holiday === '' ? '当前低谷' : win.holiday + '低谷')") > -1)
check('boot: the holiday name is confined to the pose the settled row keeps its two glyphs',
  /* The pill is 300px wide and its 316px breakpoint was derived from that, so
     the holiday may never reach the phase / 「时段剩余」 row. */
  /phase\.textContent = win\.peak \? '高峰' : '低谷'/.test(paint) &&
  /setText\('data-endfield-balance-remain', balanceFormatCountdown\(win\.remainingMs\)\)/.test(paint) &&
  (() => {
    /* exactly one LINE reads it, and only inside the brand-title block */
    const lines = paint.split('\n').filter((l) => l.indexOf('win.holiday') > -1)
    return lines.length === 1 && paint.indexOf('win.holiday') < paint.indexOf('brandTitle.textContent !== label')
  })())
check('boot: the collapse waits for the first answer, a floor, a cap, and the boot plate',
  paint.indexOf("removeAttribute('data-endfield-balance-boot')") > -1 &&
  /waited >= BALANCE_BOOT_MIN_MS/.test(paint) &&
  /BALANCE_BOOT_MAX_MS/.test(paint) &&
  /loaderEl === null/.test(paint))
check('boot: regardless of motion preference the pill ends up a stadium',
  src.indexOf('const isBalanceBootAnimated = ()') > -1 &&
  src.indexOf("matchMedia('(prefers-reduced-motion: reduce)')") > -1 &&
  /\(prefers-reduced-motion: reduce\)/.test(src))

/* --- 预览: the settings row can replay the opening pose ------------------ */
check('preview: the handler remounts the capsule and forces the animated pose',
  src.indexOf('const previewBalanceBoot = () => {') > -1 &&
  /const previewBalanceBoot = \(\) => \{[\s\S]{0,220}destroyBalanceCapsule\(\)[\s\S]{0,80}showBalanceCapsule\(true\)/.test(src))
check('preview: forcing the pose is an explicit flag, so a plain sync stays motion-aware',
  /const showBalanceCapsule = \(forceBoot\) => \{/.test(src) &&
  src.indexOf('const bootAnimated = forceBoot === true || isBalanceBootAnimated()') > -1 &&
  /* the ordinary mount points must NOT pass the flag (client.js is CRLF, so the
     check is anchored on the call itself rather than on a line terminator) */
  /syncBalanceCapsule = \(\) => \{[\s\S]{0,400}showBalanceCapsule\(\)/.test(src))
check('preview: the button is gated on the theme and the capsule, and says why',
  /onClick: previewBalanceBoot,/.test(src) &&
  /onClick: previewBalanceBoot,[\s\S]{0,220}disabled: !balanceOn \|\| !enabled,/.test(src) &&
  /disabled: !balanceOn \|\| !enabled,[\s\S]{0,160}title: balanceOn \? '' : t\('balanceNeed'\)/.test(src) &&
  /t\('preview'\)/.test(src))

console.log('balance-capsule: ' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
