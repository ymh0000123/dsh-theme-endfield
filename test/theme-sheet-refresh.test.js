/* Regression guard for the 「代码明明改了，弹窗还是老样子」 trap.

   client.js mounts once per page (window.__dshThemeEndfieldApplied) because some
   boots run apply() twice (boot loader + cordis composition). A BOOLEAN could not
   tell a duplicate mount apart from a REBUILD SWAP: @deepseek-ai/dsh-client-modules
   pushes a changed bundle into a live tab through its rebuilt()/HMR hook, so the new
   module is evaluated in a page that already ran the previous build and never ran
   its dispose. That page has the flag AND the old stylesheet, so the old guard
   returned on its first line and the tab kept the previous CSS for the rest of its
   life — the theme silently looks "not applied" with no error anywhere, and it
   survives every navigation that reuses the tab. Pairing the flag with a build
   marker makes "flag set, marker missing/other" the signature of exactly that swap.

   Part A pins the wiring in the source. Part B proves the behaviour on a real DOM:
   same build re-applied must not churn the sheet, a swapped-in build must replace it.
   Part B renders through the shared headless-Chrome fixture, so it needs Chrome. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const { launch, boot } = require('./fixtures/chrome-cdp.js')

/* ---------- A. source wiring, no browser ---------- */
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const declared = src.match(/const SHEET_MARKER = '([^']+)'/)
assert.ok(declared, "client.js must declare const SHEET_MARKER = '…'")
const MARKER = declared[1]
assert.match(MARKER, /^endfield-build\//, 'the marker must name the build it belongs to')
// check.js forbids `${` inside the stylesheet literal, so the sheet's copy of the
// marker is a plain literal and this assertion is what keeps the two in step.
assert.ok(src.includes('/* ' + MARKER),
  'the mounted sheet must carry the marker as a CSS comment, so devtools can name the mounted build')
assert.ok(src.includes('window.__dshThemeEndfieldBuild === SHEET_MARKER'),
  'the guard must compare the page marker against this build instead of trusting the boolean')
assert.ok(src.includes('delete window.__dshThemeEndfieldBuild'),
  'dispose must release the marker together with the flag')
assert.equal((src.match(/__dshThemeEndfieldApplied = true/g) || []).length,
  (src.match(/__dshThemeEndfieldBuild = SHEET_MARKER/g) || []).length,
  'every claim of the flag must record the build marker alongside it')
console.log('PASS: marker wiring', MARKER)

/* ---------- B. behaviour on a real DOM ---------- */
;(async () => {
  const browser = await launch()
  try {
    await boot(browser, ROOT)
    const SHEETS = 'document.querySelectorAll(\'style[data-plugin="dsh-theme-endfield"]\')'
    const count = () => browser.evaluate(SHEETS + '.length')
    const carriesMarker = () => browser.evaluate(SHEETS + '[0].textContent.includes(' + JSON.stringify(MARKER) + ')')
    const sameSheet = () => browser.evaluate('window.__sheetRef === ' + SHEETS + '[0]')
    // Re-enter apply() exactly the way the loader does: a fresh factory call on the
    // already-evaluated module, i.e. the same code in the same page.
    const applyAgain = () => browser.evaluate(`window.__MOD__.factory(() => null).apply({
      get: n => n === 'settingsScope' ? __prefs.binder : n === 'theme' ? { overrideTokens: () => () => {} } : undefined,
      effect: f => { const d = f(); if (typeof d === 'function') __disposers.push(d); return d }
    })`)

    assert.equal(await count(), 1, 'boot must mount exactly one theme sheet')
    assert.equal(await carriesMarker(), true, 'the mounted sheet must name its build')
    assert.equal(await browser.evaluate('window.__dshThemeEndfieldApplied'), true)
    assert.equal(await browser.evaluate('window.__dshThemeEndfieldBuild'), MARKER)

    // Duplicate mount of the SAME build: the first mount stays the owner.
    await browser.evaluate('window.__sheetRef = ' + SHEETS + '[0]')
    await applyAgain()
    assert.equal(await count(), 1, 'a duplicate mount must not add a second sheet')
    assert.equal(await sameSheet(), true, 'a duplicate mount must not rebuild the sheet')
    console.log('PASS: duplicate mount of the same build keeps the mounted sheet')

    // REBUILD SWAP: the flag is set by the previous build, whose marker is absent
    // (pre-marker build) or different. Returning early here was the bug.
    await browser.evaluate('delete window.__dshThemeEndfieldBuild')
    await applyAgain()
    assert.equal(await count(), 1, 'the stale sheet must be replaced, never duplicated')
    assert.equal(await sameSheet(), false, 'the stale sheet must actually be gone')
    assert.equal(await carriesMarker(), true, 'the replacement sheet must name the new build')
    assert.equal(await browser.evaluate('window.__dshThemeEndfieldBuild'), MARKER)
    console.log('PASS: a build swapped into a live tab replaces the stale sheet')

    assert.deepEqual(browser.errors, [])
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
