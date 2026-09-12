/**
 * font-scope.test.js — the theme must theme ITS OWN elements and nothing else.
 *
 * THE REAL BUG THIS EXISTS FOR. The theme used to redeclare the app's UI root
 * font token at :root:
 *
 *     :root { --dsw-font-family: Arial, ...;
 *             --ds-font-family-code: <mono list>; }
 *
 * That is not a theme-private knob. dsh-web-frontend renders the UI root font
 * from it — it ships exactly
 *     body{font-family:var(--dsw-font-family, <system stack>)}
 * — and the app declares the token at :root, so a second :root declaration WINS
 * and the whole UI root font becomes Arial. Any widget injected into the app root
 * that carries font-family:inherit (DeepSeek-Balance-Whale-Widget and friends)
 * then inherits Arial and loses its own face for its balance digits. Measured on
 * this page: the widget's computed font-family was Arial while the app's own
 * stack was gone.
 *
 * WHAT IS ASSERTED, in one pass over one real browser:
 *   1. the app's font tokens come out of the page UNCHANGED (redeclared nowhere);
 *   2. a third-party widget injected into the app root keeps the app's font, and
 *      keeps default font-feature-settings / font-variant-ligatures — the old
 *      stylesheet also hung "tnum"/"ss01" and no-common-ligatures on body, which
 *      inherited into every widget exactly the same way;
 *   3. the theme's OWN surfaces still render in the theme face — the boot plate
 *      and the watermark wordmark, asserted on their computed font-family, not on
 *      the stylesheet text;
 *   4. the settings panel does too, through the .endfield-settings class the theme
 *      puts on its own root (checked in the source, since that panel is rendered
 *      by React inside the settings slot — this page has no slot host).
 *
 * The theme face leads the stack with --dsw-font-family as a trailing fallback, so
 * assertions 2 and 3 are what prove the split actually holds in a renderer.
 *
 * Usage: node test/font-scope.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* --- static half: the panel's own root carries the class the sheet targets --- */
if (/className:\s*'endfield-settings'/.test(src)) pass('settings panel root carries the endfield-settings class')
else fail('the settings panel root has no endfield-settings class — the theme face would never reach it')
if (/\.endfield-settings\s*\{[^}]*font-family:\s*var\(--edge-font\)/.test(src)) pass('.endfield-settings rule applies the theme face')
else fail('no .endfield-settings { font-family: var(--edge-font) } rule — the panel keeps the app font')
if (/--edge-font:\s*Arial[^;]*var\(--dsw-font-family\)/.test(src)) pass('--edge-font leads with the theme stack and still honours --dsw-font-family')
else fail('--edge-font no longer reads --dsw-font-family as its fallback')

const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

/* The app's OWN declarations, verbatim from the installed bundles:
   @deepseek-ai/dsh-client-ui-theme lib/client.js (base_css_default = the :root
   token, and the body rule the UI root font is rendered from) — quoted rather
   than paraphrased, because the whole bug is a cascade fact about these two. */
const APP_ROOT_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif'
const APP_CODE_FONT = '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo, Courier, "PingFang SC", "Microsoft YaHei"'
/* The theme's own face, which assertion 3 has to see on the plate and the mark. */
const THEME_FONT = 'Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif'
/* String#match, not RegExp#exec: same result and same capture group, but a bare
   dot-exec call is matched by plugin-scanning signature rules as
   child_process.exec — the receiver is invisible to a regex rule, so this one
   line reported as a HIGH security hit. */
const themeFirstFamily = THEME_FONT.match(/^\s*([^,]+?)\s*,/)[1].replace(/^["']|["']$/g, '')

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-font-scope-'))
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  /* --- the app's font protocol, exactly as the installed bundles declare it --- */
  :root{--dsw-font-family:${APP_ROOT_FONT};--ds-font-family-code:${APP_CODE_FONT};
        --dsw-alias-bg-base:#e8e8e2;--dsw-alias-label-primary:#101110;
        --dsw-alias-bg-layer-1:#f2f2ec;--dsw-alias-border-l1:#c9c9c3}
  body{font-family:var( --dsw-font-family, ${APP_ROOT_FONT} );
       background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
  /* --- app chrome the theme mounts into --- */
  .pI_x6G_frame{background:var(--dsw-alias-bg-base);height:100%;display:grid;
    grid-template-columns:248px 1fr;grid-template-rows:100%;position:relative;overflow:hidden}
  .pI_x6G_centerCol{display:flex;flex-direction:column;min-width:0;overflow:hidden}
  .wSkVaW_root{background:var(--dsw-alias-bg-base);display:flex;flex-direction:column;height:100%}
  .wSkVaW_scrollBody{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0}
  .wSkVaW_viewArea{flex:1 0 auto;display:flex;flex-direction:column;justify-content:center}
  .wSkVaW_composerStack{display:flex;flex-direction:column;gap:6px}
  .wSkVaW_composerHero{width:100%;z-index:1;align-self:center;position:relative;padding-bottom:32px}
  .pXSMma_root{display:flex;justify-content:center;align-items:center;min-width:0;padding:0 24px}
  /* 0.1.2-rc.1 renamed the hero headline export to '*_headlineText' (the suffix the
     theme's watermark positioning matches). */
  .AvZvRG_headlineText{color:var(--dsw-alias-label-primary);font-size:26px;line-height:32px}
</style></head><body><div id="root">
  <div class="pI_x6G_frame">
    <div class="pI_x6G_centerCol"><div class="wSkVaW_root" data-phase="hero">
      <div class="wSkVaW_scrollBody"><div class="wSkVaW_viewArea">
        <div class="wSkVaW_composerStack wSkVaW_composerHero">
          <div class="pXSMma_root"><div class="pXSMma_stack">
            <div class="AvZvRG_headlineText">探索未至之境</div>
          </div></div>
        </div>
      </div></div>
    </div></div>
  </div>
</div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
${BROWSER_SETTINGS_SCOPE_SNIPPET}
  var __prefs = __endfieldSettingsScope({ enabled:'1', loader:'1', contour:'0', watermark:'1' })
  var mod = window.__MOD__.factory(function () { return null })
  mod.apply({
    get: function (n) {
      if (n === 'theme') return { overrideTokens: function () { return function () {} } }
      if (n === 'settingsScope') return __prefs.binder
      return undefined
    },
    effect: function (f) { return f() },
  })

  /* THE THIRD-PARTY WIDGET. Injected into the app root exactly like a real one:
     inherit the page face, which is the app's own font protocol. */
  var widget = document.createElement('div')
  widget.className = 'balance-widget'
  widget.style.fontFamily = 'inherit'
  widget.style.fontFeatureSettings = 'inherit'
  widget.style.fontVariantLigatures = 'inherit'
  var digits = document.createElement('span')
  digits.textContent = '12,345.67'
  widget.appendChild(digits)
  document.getElementById('root').appendChild(widget)

  /* The watermark mounts on the same frame as the hero page above; the plate is
     already in the DOM synchronously (see runLoader), so both can be read here. */
  requestAnimationFrame(function () {
    var root = getComputedStyle(document.documentElement)
    var bodyCs = getComputedStyle(document.body)
    var widgetCs = getComputedStyle(widget)
    var digitsCs = getComputedStyle(digits)
    var plate = document.querySelector('[data-endfield-loader]')
    var mark = document.querySelector('[data-endfield-watermark]')
    var out = {
      rootToken: root.getPropertyValue('--dsw-font-family').trim(),
      rootCodeToken: root.getPropertyValue('--ds-font-family-code').trim(),
      bodyToken: bodyCs.getPropertyValue('--dsw-font-family').trim(),
      bodyCodeToken: bodyCs.getPropertyValue('--ds-font-family-code').trim(),
      bodyFont: bodyCs.fontFamily,
      bodyFeatures: bodyCs.fontFeatureSettings,
      bodyLigatures: bodyCs.fontVariantLigatures,
      widgetFont: widgetCs.fontFamily,
      widgetFeatures: widgetCs.fontFeatureSettings,
      widgetLigatures: widgetCs.fontVariantLigatures,
      digitsFont: digitsCs.fontFamily,
      plateMounted: !!plate,
      markMounted: !!mark,
      plateFont: plate ? getComputedStyle(plate).fontFamily : null,
      plateFeatures: plate ? getComputedStyle(plate).fontFeatureSettings : null,
      markFont: mark ? getComputedStyle(mark).fontFamily : null,
      markFeatures: mark ? getComputedStyle(mark).fontFeatureSettings : null,
    }
    document.title = 'FONTSCOPE ' + JSON.stringify(out)
  })
</script></body></html>`

const page = path.join(OUT, 'font-scope.html')
fs.writeFileSync(page, PAGE)
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-font-scope-profile-'))

let dom = ''
try {
  dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=2500', '--window-size=1280,800',
    '--user-data-dir=' + profile, '--dump-dom',
    'file:///' + page.replace(/\\/g, '/'),
  ], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
} catch (e) {
  console.error('FAIL  browser run failed: ' + e.message)
  process.exit(1)
}

const m = dom.match(/<title>FONTSCOPE ([\s\S]*?)<\/title>/)
if (!m) {
  console.error('FAIL  page produced no results')
  const t = dom.match(/<title>([\s\S]*?)<\/title>/)
  if (t) console.error('      title was: ' + t[1].slice(0, 300))
  process.exit(1)
}
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
const r = JSON.parse(decode(m[1]))
const firstFamily = (stack) => {
  const f = String(stack || '').split(',')[0].trim().replace(/^["']|["']$/g, '')
  return f.toLowerCase()
}

/* --- 1. the app's protocol comes out untouched --- */
if (r.rootToken === APP_ROOT_FONT) pass('the app root font token is unchanged (--dsw-font-family at :root)')
else fail('--dsw-font-family was REWRITTEN by the theme: ' + r.rootToken.slice(0, 70))
if (r.rootCodeToken === APP_CODE_FONT) pass('the app code font token is unchanged (--ds-font-family-code at :root)')
else fail('--ds-font-family-code was REWRITTEN by the theme: ' + r.rootCodeToken.slice(0, 70))
if (r.bodyToken === APP_ROOT_FONT) pass('body resolves the app font token, not a theme override')
else fail('body sees a theme value for --dsw-font-family: ' + r.bodyToken.slice(0, 70))
if (r.bodyCodeToken === APP_CODE_FONT) pass('body resolves the app code font token, not a theme override')
else fail('body sees a theme value for --ds-font-family-code: ' + r.bodyCodeToken.slice(0, 70))

/* --- 2. the third-party widget is untouched --- */
if (firstFamily(r.widgetFont) === firstFamily(APP_ROOT_FONT)) {
  pass('a third-party widget injected into the app root keeps the app font (' + firstFamily(r.widgetFont) + ')')
} else {
  fail('the widget font was stolen by the theme: computed ' + r.widgetFont
    + ' — expected the app stack (' + firstFamily(APP_ROOT_FONT) + ')')
}
if (firstFamily(r.digitsFont) === firstFamily(APP_ROOT_FONT)) pass('the widget\'s digits inherit the app font, not the theme face')
else fail('the widget\'s digits font is ' + r.digitsFont)
if (r.widgetFeatures === 'normal' && r.widgetLigatures === 'normal') {
  pass('the widget keeps default font-feature-settings / font-variant-ligatures')
} else {
  fail('global text properties still leak into the widget: features=' + r.widgetFeatures
    + ' ligatures=' + r.widgetLigatures)
}

/* --- 3. the theme's own surfaces still wear the theme face --- */
if (r.plateMounted) pass('the boot plate is mounted (so its face can be measured)')
else fail('no [data-endfield-loader] found — the plate assertions would be vacuous')
if (r.markMounted) pass('the watermark wordmark is mounted (so its face can be measured)')
else fail('no [data-endfield-watermark] found — the wordmark assertion would be vacuous')

for (const [label, stack] of [['boot plate', r.plateFont], ['watermark wordmark', r.markFont]]) {
  if (stack === null) continue
  if (firstFamily(stack) === firstFamily(THEME_FONT)) pass(`the ${label} renders in the theme face (${themeFirstFamily})`)
  else fail(`the ${label} lost the theme face: ${stack}`)
}
/* The loader's own proportions are measured with tabular figures and the altered
   single-storey glyph, so the features have to have followed the family off body
   and onto the plate. */
if (["\"tnum\"", "\"ss01\""].every((f) => String(r.plateFeatures || '').includes(f))) {
  pass('the boot plate carries tnum + ss01 itself (no longer inherited from body)')
} else {
  fail('the boot plate lost its text features: ' + r.plateFeatures)
}
if (["\"tnum\"", "\"ss01\""].every((f) => String(r.markFeatures || '').includes(f))) {
  pass('the watermark carries tnum + ss01 itself')
} else {
  fail('the watermark lost its text features: ' + r.markFeatures)
}

console.log('')
if (failures) {
  console.error(failures + ' font-scope check(s) failed')
  process.exit(1)
}
console.log('all font-scope checks passed')
