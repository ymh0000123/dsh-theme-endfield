/**
 * preset-chip.test.js — the agent-preset header chip must actually be themed.
 *
 * Bug it guards ("创造模式 的标签不是主题配色了"): the chip is styled by
 *
 *   ... [class$='_headerActions'] [class*='_label']:has(> svg)
 *
 * and the two previous attempts at that scope both matched NOTHING on the real
 * page while every test here passed — a selector that matches nothing reports
 * nothing, so both failures shipped.
 *
 *   1. '[class$='_header'] > [class*='_label']' demanded the label be a direct
 *      child of the header row, but the header renders its actions slot inside
 *      _titleCluster > _headerActions.
 *   2. '... [_headerActions'] > [class*='_label']' then demanded it be a direct
 *      child of the actions container, but the SLOT wraps every entry in a
 *      class-less <div> first.
 *
 * The fixture in this file was wrong the same way both times, which is why it kept
 * saying "ok": it was built to satisfy the selector instead of to describe the DOM.
 * It now reproduces the chain measured off the running GUI, wrapper included:
 *
 *   div._centerCol > header._header > div._titleRow > div._titleCluster
 *     > div._headerActions
 *       > div                       <- slot entry wrapper, NO class
 *         > span._label             <- the chip
 *           > svg._icon
 *
 * Assertions (page A has the chip; page B has only a jobs-style sibling):
 *   A  chip filled with the accent, black ink, no 180px cap, row filled
 *   B  no chip  -> container keeps the stock flex:none
 *   both       -> a deeper, text-only _label belonging to the jobs-style entry is
 *                 NOT themed (the whole reason this scope exists)
 *
 * Usage: node test/preset-chip.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-chip-'))
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

/* The stock layout the theme overrides: _headerActions is flex:none upstream,
   which is why the chip needs the container to grow, and the slot's entry wrapper
   is a plain block div. Class names are semantic fakes (never real module hashes)
   so a DSH rehash cannot make this test lie — the theme only matches suffixes. */
const STOCK = `
  html,body{margin:0}
  .probe_frame{display:grid;grid-template-columns:248px 1fr;height:100vh}
  .probe_sidebarCol{background:#101110}
  .probe_centerCol{display:flex;flex-direction:column;min-width:0;overflow:hidden}
  .probe_root{display:flex;flex-direction:column;flex:1;min-width:0}
  .probe_header{flex:none;min-height:76px;padding:10px 28px 0 20px;box-sizing:border-box}
  .probe_titleRow{display:flex;align-items:center;gap:0;min-height:30px}
  .probe_titleCluster{flex:1;display:flex;align-items:center;gap:10px;min-width:0}
  .probe_headerActions{flex:none;display:flex;align-items:center;gap:8px;min-width:0}
  .probe_label{background:rgb(200,200,200);max-width:180px;height:22px;
    color:rgb(90,90,90);border-radius:6px;display:inline-flex;align-items:center;
    gap:4px;padding:0 2px 0 0;font:12px/22px Arial;overflow:hidden}
  .probe_icon{opacity:.7;flex:none}
  /* A jobs-style sibling entry: its root HAS a class and its _label lives deep
     inside the menu, so a scope that merely descends from _headerActions would
     wrongly paint it. */
  .probe_jobsRoot{flex:none;display:flex;align-items:center}
  .probe_trigger{font:12px Arial;padding:3px 8px}
  .probe_menu{display:none}
  .probe_job_label{background:rgb(200,200,200);color:rgb(90,90,90);font:12px Arial}
  /* Negative control OUTSIDE the slot: a list label that merely ends in _label.
     It keeps this stock fill only if the theme's scope really stayed inside
     _headerActions. */
  .stray_label{background:rgb(200,200,200);color:rgb(90,90,90);font:12px Arial}
`

/**
 * @param chip whether the actions slot holds the preset chip (page A) or only the
 *             jobs-style sibling (page B)
 */
function makePage(chip) {
  const jobsEntry = `
              <div class="probe_jobsRoot">
                <button class="probe_trigger" type="button">Jobs</button>
                <div class="probe_menu"><div><span class="probe_job_label">build</span></div></div>
              </div>`
  /* The chip's entry: note the class-less wrapper div — the thing two earlier
     versions of this fixture omitted, and the reason they passed while the real
     page kept the stock grey chip. */
  const chipEntry = `
              <div><span class="probe_label"><svg class="probe_icon" width="14" height="14"></svg>创造模式</span></div>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  :root{--dsw-alias-bg-base:#101110;--dsw-alias-label-primary:#f5f5f0;
    --dsw-specific-sidebar-fill:#101110;--dsw-alias-border-l1:#343633;
    --dsw-alias-fill-tsp-secondary:#2a2b28;--dsw-alias-label-secondary:#9a9d98;
    --dsw-font-family:Arial,sans-serif}
  ${STOCK}
</style></head><body><div id="root">
  <div class="probe_frame">
    <div class="probe_sidebarCol"></div>
    <div class="probe_centerCol"><div class="probe_root">
      <header class="probe_header">
        <div class="probe_titleRow">
          <div class="probe_titleCluster">
            <div class="probe_headerActions">${chip ? chipEntry : ''}${jobsEntry}</div>
          </div>
        </div>
      </header>
    </div></div>
  </div>
  <!-- negative control: a list label merely ENDING in _label, outside the slot -->
  <div><span class="stray_label">产物</span></div>
</div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
  document.body.setAttribute('data-ds-dark-theme','')
  ${BROWSER_SETTINGS_SCOPE_SNIPPET}
  var __prefs = __endfieldSettingsScope({ enabled:'1', loader:'0', contour:'0', watermark:'0', thunder:'0' })
  var mod = window.__MOD__.factory(function () { return null })
  window.__dispose__ = mod.apply({
    get: function (n) {
      return n === 'theme' ? { overrideTokens: function () { return function () {} } }
        : (n === 'settingsScope' ? __prefs.binder : undefined)
    },
    effect: function (f) { return f() },
  })
  setTimeout(function () {
    var actions = document.querySelector('.probe_headerActions')
    var chip = document.querySelector('.probe_headerActions .probe_label')
    var wrap = chip ? chip.parentElement : null
    var jobLabel = document.querySelector('.probe_job_label')
    var stray = document.querySelector('.stray_label')
    var cs = function (el) { return el ? getComputedStyle(el) : null }
    var c = cs(chip), a = cs(actions), w = cs(wrap), j = cs(jobLabel), s = cs(stray)
    document.title = 'CHIP ' + JSON.stringify({
      chipFound: !!chip,
      chipBg: c ? c.backgroundColor : null,
      chipInk: c ? c.color : null,
      chipMaxWidth: c ? c.maxWidth : null,
      chipRadius: c ? c.borderRadius : null,
      chipFlexGrow: c ? c.flexGrow : null,
      chipWidth: chip ? Math.round(chip.getBoundingClientRect().width) : null,
      wrapperDisplay: w ? w.display : null,
      actionsFlexGrow: a ? a.flexGrow : null,
      actionsWidth: actions ? Math.round(actions.getBoundingClientRect().width) : null,
      jobLabelBg: j ? j.backgroundColor : null,
      strayBg: s ? s.backgroundColor : null,
    })
  }, 400)
</script></body></html>`
}

function run(label, chip) {
  const page = path.join(OUT, 'chip-' + label + '.html')
  fs.writeFileSync(page, makePage(chip))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chip-prof-'))
  let dom = ''
  try {
    dom = execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=5000', '--window-size=1280,800',
      '--user-data-dir=' + tmp, '--dump-dom',
      'file:///' + page.replace(/\\/g, '/'),
    ], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) {
    console.error('FAIL  [' + label + '] browser run failed: ' + e.message)
    process.exit(1)
  }
  const m = dom.match(/<title>CHIP (.*?)<\/title>/s)
  if (!m) { console.error('FAIL  [' + label + '] page did not report results'); process.exit(1) }
  return JSON.parse(m[1].replace(/&quot;/g, '"'))
}

fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

let failures = 0
const ok = (s) => console.log('ok    ' + s)
const fail = (s) => { console.error('FAIL  ' + s); failures++ }

/* #fff500 -> the browser reports rgb(255, 245, 0). */
const ACCENT_RGB = 'rgb(255, 245, 0)'
const STOCK_RGB = 'rgb(200, 200, 200)'

const a = run('a', true)
console.log('      A: ' + JSON.stringify(a))
if (a.chipBg === ACCENT_RGB) ok('A: the preset chip is filled with the theme accent (' + a.chipBg + ')')
else fail('A: the preset chip is NOT themed — background is ' + a.chipBg + ', expected ' + ACCENT_RGB
  + '. The chip sits inside the slot\'s class-less wrapper; a selector without that level matches nothing.')
if (a.chipInk === 'rgb(0, 0, 0)') ok('A: the chip ink is black over the accent')
else fail('A: chip ink is ' + a.chipInk + ', expected rgb(0, 0, 0)')
if (a.chipMaxWidth === '180px') ok('A: the stock 180px cap is kept, so a long preset name cannot widen the chip into a bar')
else fail('A: chip max-width is ' + a.chipMaxWidth + ', expected the stock 180px cap')
if (a.chipRadius === '0px') ok('A: square radius mode squares the chip')
else fail('A: chip radius is ' + a.chipRadius + ', expected 0px (body has no theme-endfield-round)')

/* The chip must stay a CHIP. An earlier attempt at this fix reproduced the old
   "fills the action row" intent (flatten the slot wrapper + grow the container),
   which on the real header turned the accent fill into a full-width yellow bar
   (923px of a 976px row) and was reported straight back. The theme owns the
   COLOUR here, not the geometry, so the stock size has to survive: bounded width,
   and the container must not have been grown to make room for it. */
if (a.actionsFlexGrow === '0') ok('A: the actions container keeps the stock flex:none (no stretched bar)')
else fail('A: actions flex-grow is ' + a.actionsFlexGrow + ' — the chip will stretch into a full-width bar')
if (a.wrapperDisplay !== 'contents') ok('A: the slot wrapper is left alone (display:' + a.wrapperDisplay + ')')
else fail('A: the slot wrapper was flattened to display:contents — that is the stretched-bar recipe')
if (a.chipWidth !== null && a.chipWidth <= 180) {
  ok('A: the chip stays compact (' + a.chipWidth + 'px, within the stock 180px cap)')
} else {
  fail('A: the chip is ' + a.chipWidth + 'px wide — it has become a bar instead of a chip')
}

/* The scope's whole reason for existing: the jobs entry renders a _label too, but
   deep inside its menu. It must stay stock, both inside and outside the slot. */
if (a.jobLabelBg === STOCK_RGB) ok('A: the jobs-style _label deeper in the same slot stays stock')
else fail('A: the scope is too wide — a jobs-style _label inside the slot got themed: ' + a.jobLabelBg)
if (a.strayBg === STOCK_RGB) ok('A: a _label OUTSIDE the slot stays stock')
else fail('A: the scope is too wide — a plain list _label got themed: ' + a.strayBg)

/* B: the slot holds only the jobs-style entry. The theme must leave the container
   alone, or every session without a preset would get a stretched header. */
const b = run('b', false)
console.log('      B: ' + JSON.stringify(b))
if (b.chipFound === false) ok('B: no chip in the slot')
else fail('B: a chip was found where none was placed')
if (b.actionsFlexGrow === '0') ok('B: with no preset chip the actions container keeps the stock flex:none')
else fail('B: actions flex-grow is ' + b.actionsFlexGrow + ' with no chip present — the :has() scope is too wide')
if (b.jobLabelBg === STOCK_RGB) ok('B: the jobs-style _label stays stock')
else fail('B: the jobs-style _label got themed: ' + b.jobLabelBg)

if (failures) { console.error('\n' + failures + ' preset-chip check(s) failed'); process.exit(1) }
console.log('\nall preset-chip checks passed')
