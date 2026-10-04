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
 *   3. SUBSTRING HOOKS STAY SCOPED: a bare '[class*=\'_add\']' matches any upstream
 *      class that contains the substring, not just the composer's + button. That is
 *      how the settings 添加模型提供商 button ended up invisible (the '*_addActions'
 *      WRAPPER took the solid accent under it: 1.05:1). The hook must keep the
 *      composer scope the '_arrow' rule already uses.
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
  ['[class$="_headline"], [class$="_headlineText"]', 'headline detector (findVisibleHeadline)'],
  ['[class$="_centerCol"], [class*="_centerCol "]', 'app-frame locator (findAppFrame)'],
  // stylesheet hooks
  ["[class$='_root']:has(> [data-endfield-watermark])", 'watermark host isolation'],
  ["[class*='_frame']:has(> [data-endfield-contour]) [class$='_centerCol'] [class$='_root']",
    'contour: conversation column transparency'],
  ["[class*='_frame']:has(> [data-endfield-contour]) [class$='_rightbarCol']",
    'contour: right column transparency (0.2 rename of _detailsCol)'],
  // 0.2 moved the turn-status label from dsh-client-ui-conversation to
  // dsh-client-ui-chat and replaced its gradient text with a masked sweep, so the
  // recolour now rides these two tokens instead of a class selector.
  ["'--dsw-alias-label-deep-diving'", 'turn-status resting token (0.2 _running seam)'],
  ["'--dsw-alias-label-deep-diving-shimmer'", 'turn-status sweep token (0.2 _running seam)'],
  ["[class$='_sidebarCol'] [class*='_sessionRow']", 'sidebar workspace rows'],
  ["[class$='_sidebarCol'] [class*='_folder']", 'light-mode sidebar ink'],
  ["[class$='_centerCol'] [class$='_header'] [class$='_headerActions'] [class*='_label']:has(> svg)", 'agent-preset header chip'],
  ["[class*='_colorMessages']", 'token meter messages segment'],
  ["[class*='_selected']", 'appearance cube warm border'],
  ["[class*='_previewBadge']", 'hero preview badge'],
  ["[class*='_add']", 'composer + button (composer-scoped, see part 3)'],
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

/* ---------- 3. the '_add' hook stays scoped to the composer ---------- */
/* The reported 模型设置页面 bug. '[class*=\'_add\']' is a bare SUBSTRING, so it used
   to paint every upstream class that merely contains it — including the plain
   <div> ('*_addActions') that WRAPS 添加模型提供商 in Settings > 模型. Pointing at
   the button hovers that wrapper, and the theme filled the wrapper with the solid
   accent while the button kept label-primary: #f5f5f0 on #fff500 = 1.05:1, an
   invisible label. The fix scopes the hook to the composer, exactly like the
   '_arrow' rule. This part keeps it scoped: any reappearance of an unscoped
   '_add' hook — a new rule, or a revert — fails here instead of turning another
   page's text invisible. (test/hover-check.js measures the real pixels.) */
const addUses = [...src.matchAll(/\[class\*='_add'\]/g)].map((m) => m.index)
const unscoped = addUses.filter((i) => !/_composerSeat|_composerHero|data-composer-seat/.test(src.slice(Math.max(0, i - 200), i)))
if (addUses.length === 0) {
  fail("the composer + hook ('[class*='_add']') is gone entirely — the + button would lose its inversion")
} else if (unscoped.length > 0) {
  fail("unscoped '[class*='_add']' hook at offset(s) " + unscoped.join(', ')
    + " — it matches ANY class containing '_add' (the settings 添加模型提供商 wrapper is one)"
    + "\n      -> scope it to the composer: :is([data-composer-seat], [class$='_composerSeat'], [class$='_composerHero']) [class*='_add']")
} else {
  pass("the '_add' hook is composer-scoped in all " + addUses.length + ' place(s)')
}

console.log('')
if (failures) { console.error(failures + ' selector guard check(s) failed'); process.exit(1) }
console.log('all selector guard checks passed (' + hooks.length + ' hooks + anti-hash + substring-hook scoping)')
