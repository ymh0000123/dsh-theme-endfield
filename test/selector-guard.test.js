/**
 * selector-guard.test.js — no hash-pinned CSS selectors, ever (issue #17 guard).
 *
 * THE BUG THIS EXISTS FOR. DSH 0.1.2-rc.1 rebuilt its CSS modules and every hex
 * module hash changed. The theme then pinned 33 selectors to those hashes
 * (.wSkVaW_root, .pXSMma_root, .YDXeBa_sessionRow, …) and ALL of them died
 * silently: the contour sheet only showed over the sidebar, the watermark never
 * mounted, and no error appeared anywhere — a screenshot diff is far too coarse
 * to catch "this one background stopped being transparent".
 *
 * The theme now matches SEMANTIC SUFFIXES only ([class$='_root'][data-phase],
 * [class*='_inspectButton'], …), which survive any rehash. This test keeps it
 * that way, in two parts:
 *
 *   1. ANTI-HASH: after stripping comments (which legitimately document dead
 *      hashes from past builds), the bundle must not contain a '<hash>_' class
 *      token anywhere. A hash is 6 alphanumerics with MIXED case (wSkVaW, DZ80Kq,
 *      _8JRpoa) immediately followed by '_'. Semantic suffixes never sit before
 *      an underscore, and all-lower / all-upper words ('endfield_', 'ENDFIELD_')
 *      are not hashes, so the rule is tight.
 *
 *   2. HOOKS PRESENT: the exact hash-free hooks the JS detectors and the sheet
 *      depend on must exist in the source. A renamed suffix or a bad refactor
 *      fails here instead of silently unmounting a feature on the real page.
 *
 * This checks the local client.js; test/live-check.js separately proves the
 * running GUI serves that exact byte stream, so the guard transitively covers
 * the live bundle too.
 *
 * Usage: node test/selector-guard.test.js
 */
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); failures++ }

/* ---------- 1. no hash-pinned class tokens outside comments ---------- */
const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '')
const hashPinned = new Set()
const hashToken = /([A-Za-z0-9]{6})_[A-Za-z]/g
for (const m of noComments.matchAll(hashToken)) {
  const h = m[1]
  if (/[a-z]/.test(h) && /[A-Z]/.test(h)) hashPinned.add(h + '_')
}
if (hashPinned.size === 0) {
  pass('no hash-pinned class tokens in live code (comments excluded)')
} else {
  fail('hash-pinned selectors are back — they die silently on the next app rehash: '
    + [...hashPinned].join(' ')
    + '\n      -> match the semantic suffix instead ([class$=\'_name\'] / [class*=\'_name\'])')
}

/* ---------- 2. the hash-free hooks are all present ---------- */
const hooks = [
  // JS detectors (client.js watermark/contour anchoring)
  ['[class$="_root"][data-phase="hero"]', 'hero detector (isHeroVisible)'],
  ['[class$="_root"][data-phase]', 'conversation-column detector (findConversationRoot)'],
  ['[class$="_headlineText"]', 'headline detector (findVisibleHeadline)'],
  ['[class$="_centerCol"], [class*="_centerCol "]', 'app-frame locator (findAppFrame)'],
  // stylesheet hooks
  ["[class$='_root']:has(> [data-endfield-watermark])", 'watermark host isolation'],
  ["[class*='_frame']:has(> [data-endfield-contour]) [class$='_centerCol'] [class$='_root']",
    'contour: conversation column transparency'],
  ["[class*='_frame']:has(> [data-endfield-contour]) [class$='_detailsCol'] [class$='_root']",
    'contour: details column transparency'],
  ["[class$='_sidebarCol'] [class*='_sessionRow']", 'sidebar workspace rows'],
  ["[class$='_sidebarCol'] [class*='_folder']", 'light-mode sidebar ink'],
  ["[class$='_centerCol'] [class$='_header'] > [class*='_label']", 'agent-preset header chip'],
  ["[class*='_colorMessages']", 'token meter messages segment'],
  ["[class*='_selected']", 'appearance cube warm border'],
  ["[class*='_previewBadge']", 'hero preview badge'],
  ["[class*='_add']:not([class*='_addButton'])", 'composer + button (addButton excluded)'],
  ["[class$='_composerSeat'], [class$='_composerHero']) button[class*='_primary']",
    'composer primary send/stop button'],
  ["[class*='_secondaryButton']", 'accent-filled secondary button ink'],
  ["[class*='_inspectButton']", 'inspect-panel button ink'],
  ["[class$='_composerSeat'], [class$='_composerHero']) [class*='_arrow']",
    'attachment carousel arrow (composer-scoped)'],
  ["[class*='_dangerButton']", 'danger button ink'],
]
for (const [needle, label] of hooks) {
  if (src.includes(needle)) pass('hook present: ' + label)
  else fail('hook missing: ' + label + ' (' + needle + ')')
}

console.log('')
if (failures) { console.error(failures + ' selector guard check(s) failed'); process.exit(1) }
console.log('all selector guard checks passed (' + hooks.length + ' hooks + anti-hash)')
