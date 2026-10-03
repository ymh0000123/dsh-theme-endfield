/**
 * menu-surface.test.js — prove the theme turns the app's TRANSLUCENT menu material
 * into an opaque panel.
 *
 * ── The bug, reported from the live app ──────────────────────────────────────
 * "菜单的背景没了" — the slash-command menu (type `/` in the composer) read as
 * having no background at all: the transcript behind it stayed legible straight
 * through the panel. Turning the contour layer OFF did not bring the background
 * back, which ruled out the theme's own `:has(> [data-endfield-contour])`
 * transparency rules before a line of code was written.
 *
 * ── Why it looked like that (measured, not guessed) ──────────────────────────
 * Every 0.2 menu is the shared MenuSurface primitive from
 * @deepseek-ai/dsh-client-ui-primitives (consumed by dsh-client-ui-commands,
 * dsh-client-ui-input-trigger, dsh-client-ui-model-selection, …). It is one
 * [data-menu-material="translucent"] box whose ONLY paint is a z-index:-1 child:
 *
 *     ._material_ri079_21 { position:absolute; inset:0; z-index:-1;
 *       border-radius:inherit;
 *       background: var(--dsw-menu-surface-fill);
 *       backdrop-filter: var(--dsw-menu-backdrop-filter); }
 *
 * and the design platform ships that fill TRANSLUCENT on every platform except
 * macOS (which gets an opaque macOS-only `data-menu-backing` element "because
 * Chromium cannot blur a transparent window"):
 *
 *     body                      { --dsw-menu-surface-fill:#f8f9fa94 }   (58% alpha)
 *     body[data-ds-dark-theme]  { --dsw-menu-surface-fill:#43454a73 }   (45% alpha)
 *     body                      { --dsw-specific-menu:var(--dsw-menu-surface-fill) }
 *     [data-menu-material]      { --dsw-menu-backdrop-filter:blur(40px) saturate(150%) }
 *
 * A 45% fill whose 40px blur does not composite leaves the page behind it legible
 * — "no background". The theme painted no menu rule at all (checked: client.js
 * contains no `menu-material`, no `specific-menu`, and no backdrop-filter outside
 * glass), so the fix is a TOKEN, not a selector: the theme already owns an opaque
 * popover colour, --dsw-alias-bg-overlay, and pins --dsw-menu-surface-fill to it.
 *
 * ── What is asserted, and why it takes two screenshots ───────────────────────
 * A computed `rgb(28,30,28)` fill would also be reported by a build where the
 * panel is somehow covered or never composited, so the decisive evidence is the
 * PIXELS: with a high-frequency striped backdrop behind the panel, the fix means
 * not one pixel inside the menu differs from its own fill.
 *
 *   1. The shipped default really IS translucent, in this very fixture (else the
 *      whole file is a test of nothing) — asserted from computed style AND from
 *      the plain render, where the stripes must bleed through.
 *   2. Themed run: the fill is the theme's opaque overlay colour and NOT ONE pixel
 *      inside the menu's text-free band differs from it.
 *   3. The platform's 40px blur is deliberately left in place (an opaque fill
 *      paints over whatever the filter produced, so the platform keeps its own
 *      compositing path and the macOS backing element still works).
 *   4. `--dsw-specific-menu` — which the design platform defines as
 *      var(--dsw-menu-surface-fill) and which the model-select dropdown paints —
 *      follows the same opaque value with no extra rule.
 *
 * The two renders are the SAME page built the same way: only the token layer
 * differs (applied / not applied). Menu geometry is a CSS literal, and both runs
 * report the rect the browser actually laid out, so a stale rect cannot silently
 * move the assertion window.
 *
 * Usage: node test/menu-surface.test.js [dark|light]
 *        (or ENDFIELD_SCHEME=light; the npm chain runs both)
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

const ROOT = path.resolve(__dirname, '..')
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

/* The scheme is an argument because the token is overridden per scheme and the two
   composite to different colours; an argument is used instead of an env var so the
   npm chain can run both without a portable-shell `set`. */
const WANT = (process.argv[2] || process.env.ENDFIELD_SCHEME || 'dark').toLowerCase()
if (WANT !== 'dark' && WANT !== 'light') {
  console.error('FAIL  unknown colour scheme "' + WANT + '" (expected dark or light)')
  process.exit(1)
}
const DARK = WANT === 'dark'
const scheme = WANT
const W = 900
const H = 600
/* Geometry is a literal on purpose: the comparison window must be knowable
   WITHOUT trusting a rect measured in another browser run. Both runs report the
   laid-out rect anyway and it is asserted against these numbers. */
const MENU = { x: 200, y: 150, w: 360, h: 220 }
/* The rows sit in the top 88px of the surface; the band below them carries the
   material and nothing else, so a foreground glyph can never be mistaken for the
   backdrop leaking through. */
const BAND = { x: MENU.x + 8, y: MENU.y + 96, w: MENU.w - 16, h: MENU.h - 104 }

/* Chrome serialises #43454a73 (115/255) as 0.45 and #f8f9fa94 (148/255) as 0.58,
   so these are the computed strings the shipped design platform produces. */
const SHIPPED = DARK ? 'rgba(67, 69, 74, 0.45)' : 'rgba(248, 249, 250, 0.58)'
const FILL_RGB = DARK ? [28, 30, 28] : [242, 242, 236]        // theme --dsw-alias-bg-overlay
const FILL_CSS = DARK ? 'rgb(28, 30, 28)' : 'rgb(242, 242, 236)'
const STRIPE = [0, 200, 255]                                   // the mock backdrop's cyan

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-menu-'))
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

/* The mock carries the app's menu material exactly as shipped: the design
   platform's translucency + blur variables, the MenuSurface module rules copied
   from dsh-web-frontend/dist/assets/index-*.css, and a striped backdrop the panel
   floats over. `themed` decides ONLY whether the theme's token layer is applied
   the way @deepseek-ai/dsh-client-ui-layout applies it (inline on <body>, one
   setProperty per token, for the active scheme) — the DOM is identical. */
const mk = (themed) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  /* ---- the design platform's own menu defaults (shipped values) ---- */
  body{
    --dsw-menu-surface-fill:${DARK ? '#43454a73' : '#f8f9fa94'};
    --dsw-specific-menu:var(--dsw-menu-surface-fill);
    --dsw-alias-bg-base:${DARK ? '#101110' : '#e8e8e2'};
    --dsw-alias-bg-overlay:${DARK ? '#1c1e1c' : '#f2f2ec'};
    --dsw-alias-label-primary:${DARK ? '#f5f5f0' : '#101110'};
    --dsw-radius-lg:4px;--dsw-radius-md:3px;
    background:var(--dsw-alias-bg-base);
    color:var(--dsw-alias-label-primary);font:14px Arial,sans-serif}
  [data-menu-material]{--dsw-elevation-stroke-color:var(--dsw-alias-border-l4);
    --dsw-mask-blur:none;--dsw-menu-backdrop-filter:blur(40px) saturate(150%)}
  /* ---- MenuSurface.module.css (hashes _ri079_ from the installed shell) ---- */
  ._surface_ri079_1,._backing_ri079_2{border-radius:var(--dsw-radius-lg)}
  :where(._surface_ri079_1){position:relative}
  ._surface_ri079_1{isolation:isolate}
  ._material_ri079_21{position:absolute;inset:0;z-index:-1;border-radius:inherit;
    background:var(--dsw-menu-surface-fill);
    backdrop-filter:var(--dsw-menu-backdrop-filter);pointer-events:none}
  .ms_row{padding:7px 10px;position:relative}
  /* ---- what the menu floats over: a high-frequency backdrop, so a translucent
     fill is impossible to miss. An element (not body) so no theme rule can
     repaint it out from under the test. ---- */
  #backdrop{position:fixed;inset:0;z-index:0;
    background:repeating-linear-gradient(90deg,
      #000 0 8px, rgb(${STRIPE.join(',')}) 8px 16px)}
  #menu{position:absolute;left:${MENU.x}px;top:${MENU.y}px;
    width:${MENU.w}px;height:${MENU.h}px;z-index:5}
  /* the second consumer: anything painted with --dsw-specific-menu */
  #probe{position:absolute;left:20px;top:20px;width:60px;height:30px;
    background:var(--dsw-specific-menu)}
  /* the page's own base, so the test can prove the menu is not painted as the page */
  #base-probe{position:absolute;left:20px;top:60px;width:60px;height:30px;
    background:var(--dsw-alias-bg-base)}
</style></head><body>
  <div id="backdrop"></div>
  <div id="probe"></div>
  <div id="base-probe"></div>
  <div id="menu" data-menu-material="translucent" class="_surface_ri079_1">
    <div aria-hidden="true" class="_material_ri079_21"></div>
    <div class="ms_row">/命令</div>
    <div class="ms_row">/clear</div>
    <div class="ms_row">/compact</div>
  </div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}
window.onerror=function(m,s,l){ document.title='ERR '+m+' @line '+l }
</script>
<script src="./client.js"></script>
<script>
window.__RESULTS__=[]
${DARK ? "document.body.setAttribute('data-ds-dark-theme','')" : ''}
/* The theme reads its switches through the dsh settingsScope seam; contour and
   loader are off so this page measures the menu and nothing else. */
${BROWSER_SETTINGS_SCOPE_SNIPPET}
var __prefs=__endfieldSettingsScope({ enabled:'1', loader:'0', contour:'0' })
const R=(name,pass,detail)=>window.__RESULTS__.push({name,pass:!!pass,detail:detail===undefined?'':String(detail)})
const ACTIVE='${scheme}'
/* Apply tokens exactly as @deepseek-ai/dsh-client-ui-layout does: inline on
   <body>, one setProperty per token, picking the value for the active scheme.
   A :root stylesheet block instead would make this test pass while the real app
   broke — the same asymmetry palette-switch.test.js exists to catch. */
const applied=[]
const applyTokens=(tokens)=>{
  for(const [k,v] of Object.entries(tokens)){
    document.body.style.setProperty(k, v[ACTIVE]); applied.push(k)
  }
}
const mod=window.__MOD__.factory(()=>null)
mod.apply({
  get:(n)=> n==='theme'
    ? { overrideTokens:(_s,t)=>{ ${themed ? 'applyTokens(t)' : 'void t'}; return ()=>{} } }
    : (n==='settingsScope' ? __prefs.binder : undefined),
  effect:(f)=>{window.__dispose__=f()},
})
const mat=document.querySelector('._material_ri079_21')
const surf=document.querySelector('._surface_ri079_1')
const probe=document.getElementById('probe')
const baseProbe=document.getElementById('base-probe')
const box=surf.getBoundingClientRect()
const cs=getComputedStyle(mat)
const body=getComputedStyle(document.body)
const out={
  themed:${themed},
  materialBackground:cs.backgroundColor,
  materialBackdropFilter:cs.backdropFilter,
  probeBackground:getComputedStyle(probe).backgroundColor,
  baseBackground:getComputedStyle(baseProbe).backgroundColor,
  tokenOnBody:document.body.style.getPropertyValue('--dsw-menu-surface-fill').trim(),
  tokenComputed:body.getPropertyValue('--dsw-menu-surface-fill').trim(),
  overlayComputed:body.getPropertyValue('--dsw-alias-bg-overlay').trim(),
  menuBox:{x:Math.round(box.left),y:Math.round(box.top),
           w:Math.round(box.width),h:Math.round(box.height)},
}
R('menu surface mounted', mat!==null && surf!==null, 'mat='+(mat!==null))
R('menu rect = fixture geometry', out.menuBox.x===${MENU.x} && out.menuBox.y===${MENU.y}
  && out.menuBox.w===${MENU.w} && out.menuBox.h===${MENU.h}, JSON.stringify(out.menuBox))
document.title='MENU '+JSON.stringify(out)+'|'+JSON.stringify(window.__RESULTS__)
</script></body></html>`

const run = (themed, shot) => {
  const page = path.join(OUT, (themed ? 'themed' : 'plain') + '.html')
  fs.writeFileSync(page, mk(themed))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-prof-'))
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--virtual-time-budget=5000',
    '--window-size=' + W + ',' + H, '--user-data-dir=' + tmp,
  ]
  if (shot) args.push('--screenshot=' + shot)
  else args.push('--dump-dom')
  const o = execFileSync(chrome, args.concat(['file:///' + page.replace(/\\/g, '/')]),
    { encoding: 'utf8', timeout: 120000, stdio: ['ignore', shot ? 'ignore' : 'pipe', 'ignore'] })
  return o
}

const parse = (dom) => {
  const m = dom.match(/<title>MENU (.*?)\|(\[.*?\])<\/title>/s)
  if (!m) return null
  const dec = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#39;/g, "'")
  return { report: JSON.parse(dec(m[1])), results: JSON.parse(dec(m[2])) }
}

/* ---- 1. computed styles, in BOTH runs ---- */
const plainRaw = run(false, null)
const plainDom = parse(plainRaw)
const themedDom = parse(run(true, null))
if (!plainDom || !themedDom) {
  console.error('FAIL  a page produced no report (script error?)')
  const t = (plainRaw.match(/<title>([\s\S]{0,400})/) || [])[1]
  console.error('  raw length: ' + plainRaw.length
    + '   has __RESULTS__: ' + plainRaw.includes('__RESULTS__')
    + '   has material div: ' + plainRaw.includes('_material_ri079_21'))
  console.error('  <title>: ' + (t === undefined ? '(none)' : t))
  fs.mkdirSync(path.join(ROOT, '.dsh-vision-toolkit', 'tmp'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, '.dsh-vision-toolkit', 'tmp', 'menu-debug.html'), plainRaw)
  console.error('  raw DOM written to .dsh-vision-toolkit/tmp/menu-debug.html')
  process.exit(1)
}

/* ---- 2. two renders that differ ONLY in the token layer ---- */
const shotThemed = path.join(OUT, 'themed.png')
const shotPlain = path.join(OUT, 'plain.png')
run(true, shotThemed)
run(false, shotPlain)

/* Compare the PNGs by their pixels. Decoding happens inside headless Chrome, so
   this needs no image dependency; the menu window comes from the literal
   geometry above and the run-level rect assertion proves it still fits. */
const cmpPage = path.join(OUT, 'cmp.html')
fs.writeFileSync(cmpPage, `<!doctype html><meta charset="utf-8"><body><script>
const OVERLAY=${JSON.stringify(FILL_RGB)}
const STRIPE=${JSON.stringify(STRIPE)}
const BAND=${JSON.stringify(BAND)}
const load=(u)=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=u})
const scan=(d,W0)=>{
  const mode=new Map()
  let n=0,diff=-1,stripe=0
  for(let y=BAND.y;y<BAND.y+BAND.h;y++)for(let x=BAND.x;x<BAND.x+BAND.w;x++){
    const i=(y*W0+x)*4, r=d[i],g=d[i+1],b=d[i+2]
    const k=r+','+g+','+b
    mode.set(k,(mode.get(k)||0)+1)
    if(b>r+30&&b>60) stripe++
    n++
  }
  let best=null,bestN=-1
  for(const [k,c] of mode) if(c>bestN){bestN=c;best=k}
  const mc=best.split(',').map(Number)
  for(let y=BAND.y;y<BAND.y+BAND.h;y++)for(let x=BAND.x;x<BAND.x+BAND.w;x++){
    const i=(y*W0+x)*4
    const e=Math.max(Math.abs(d[i]-mc[0]),Math.abs(d[i+1]-mc[1]),Math.abs(d[i+2]-mc[2]))
    if(e>diff) diff=e
  }
  let notMode=0
  for(let y=BAND.y;y<BAND.y+BAND.h;y++)for(let x=BAND.x;x<BAND.x+BAND.w;x++){
    const i=(y*W0+x)*4
    const e=Math.max(Math.abs(d[i]-mc[0]),Math.abs(d[i+1]-mc[1]),Math.abs(d[i+2]-mc[2]))
    if(e>2) notMode++
  }
  return { pixels:n, modal:mc, modalShare:+(bestN/n).toFixed(4), notMode, maxDelta:diff,
           stripe, distinct:mode.size }
}
Promise.all([load('themed.png'),load('plain.png')]).then(([a,b])=>{
  const cv=document.createElement('canvas')
  const read=(img)=>{ cv.width=img.width; cv.height=img.height
    const c=cv.getContext('2d'); c.clearRect(0,0,cv.width,cv.height); c.drawImage(img,0,0)
    return c.getImageData(0,0,cv.width,cv.height).data }
  const dt=read(a), dp=read(b)
  const out={
    dims:[a.width,a.height,b.width,b.height],
    band:BAND,
    themed:scan(dt,a.width),
    plain:scan(dp,b.width),
    overlayPx:(()=>{let n=0
      for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){const i=(y*a.width+x)*4
        if(dt[i]===OVERLAY[0]&&dt[i+1]===OVERLAY[1]&&dt[i+2]===OVERLAY[2])n++}
      return n})(),
  }
  document.title='CMP '+JSON.stringify(out)
})
</script></body>`)
const cmpDom = execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--allow-file-access-from-files', '--virtual-time-budget=8000',
  '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'menu-cmp-')), '--dump-dom',
  'file:///' + cmpPage.replace(/\\/g, '/'),
], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
const cm = cmpDom.match(/<title>CMP (.*?)<\/title>/s)
if (!cm) { console.error('FAIL  pixel comparison did not report'); process.exit(1) }
const c = JSON.parse(cm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))

let failures = 0
const fail = (s) => { console.error('FAIL  ' + s); failures++ }
const pass = (s) => console.log('ok    ' + s)

console.log('=== colour scheme: ' + scheme + ' ===')
for (const r of themedDom.results) {
  if (!r.pass) { fail(r.name + (r.detail ? '  [' + r.detail + ']' : '')) }
}
console.log('shipped menu fill  : ' + plainDom.report.materialBackground
  + '  (blur ' + plainDom.report.materialBackdropFilter + ')')
console.log('themed  menu fill  : ' + themedDom.report.materialBackground
  + '  (blur ' + themedDom.report.materialBackdropFilter + ')')
console.log('themed  probe      : ' + themedDom.report.probeBackground
  + '   token on body: ' + (themedDom.report.tokenOnBody || '(none)'))
console.log('menu rect (runs)   : ' + JSON.stringify(plainDom.report.menuBox)
  + ' / ' + JSON.stringify(themedDom.report.menuBox))
console.log('band               : ' + JSON.stringify(c.band) + '  = ' + c.themed.pixels + ' px')
console.log('themed pixels      : modal ' + JSON.stringify(c.themed.modal)
  + ' share ' + c.themed.modalShare + '  differing ' + c.themed.notMode
  + '  max delta ' + c.themed.maxDelta + '  distinct ' + c.themed.distinct)
console.log('plain  pixels      : modal ' + JSON.stringify(c.plain.modal)
  + ' share ' + c.plain.modalShare + '  differing ' + c.plain.notMode
  + '  max delta ' + c.plain.maxDelta + '  distinct ' + c.plain.distinct
  + '  stripe-coloured ' + c.plain.stripe)
console.log('')

/* ---- the fixture is not vacuous: the SHIPPED default is translucent ---- */
if (plainDom.report.materialBackground.replace(/\s/g, '') !== SHIPPED.replace(/\s/g, '')) {
  fail('the shipped menu fill in this fixture is ' + plainDom.report.materialBackground
    + ', not the design platform\'s translucent ' + SHIPPED
    + '\n      -> fix the fixture before trusting the themed assertion')
} else {
  pass('fixture reproduces the shipped translucent fill ' + SHIPPED)
}
if (!/blur\(40px\)/.test(themedDom.report.materialBackdropFilter || '')) {
  fail('the theme removed the platform backdrop blur (' + themedDom.report.materialBackdropFilter
    + ')\n      -> the blur is deliberately kept; an opaque fill paints over it')
} else {
  pass('platform 40px menu blur left in place (deliberate)')
}

/* ---- the fix: opaque fill, from the theme's own token ---- */
if (themedDom.report.materialBackground.replace(/\s/g, '') !== FILL_CSS.replace(/\s/g, '')) {
  fail('themed menu fill is ' + themedDom.report.materialBackground + ', expected opaque '
    + FILL_CSS + '\n      -> --dsw-menu-surface-fill must resolve to --dsw-alias-bg-overlay')
} else {
  pass('menu fill is opaque ' + FILL_CSS + ' (theme --dsw-alias-bg-overlay)')
}
if (!/var\(--dsw-alias-bg-overlay\)/.test(themedDom.report.tokenOnBody || '')) {
  fail('--dsw-menu-surface-fill was not applied with the overlay token (got "'
    + themedDom.report.tokenOnBody + '")')
} else {
  pass('token layer pins --dsw-menu-surface-fill to var(--dsw-alias-bg-overlay)')
}
if (themedDom.report.probeBackground.replace(/\s/g, '') !== FILL_CSS.replace(/\s/g, '')) {
  fail('--dsw-specific-menu probe is ' + themedDom.report.probeBackground
    + ', expected the same opaque fill (the model-select dropdown paints that token)')
} else {
  pass('--dsw-specific-menu follows the same opaque fill with no extra rule')
}
/* An opaque fill painted in the PAGE colour would technically have no background
   anymore but would be invisible: the menu has to stay a surface of its own. The
   app's own macOS backing uses --dsw-alias-bg-base, so this is a real risk. */
if (themedDom.report.materialBackground.replace(/\s/g, '')
    === themedDom.report.baseBackground.replace(/\s/g, '')) {
  fail('the menu fill equals the page base (' + themedDom.report.baseBackground
    + ')\n      -> the panel would be invisible; it must stay a distinct surface')
} else {
  pass('menu fill ' + themedDom.report.materialBackground + ' differs from the page base '
    + themedDom.report.baseBackground + ' -- still a surface')
}

/* ---- the decisive evidence: not one backdrop pixel survives inside the panel ---- */
if (!c.themed || c.themed.pixels < 20000) {
  fail('the sample band is too small to prove anything (' + (c.themed && c.themed.pixels) + ' px)')
} else {
  if (c.themed.notMode !== 0) {
    fail(c.themed.notMode + ' px inside the themed menu differ from its own fill (max delta '
      + c.themed.maxDelta + ', distinct colours ' + c.themed.distinct + ')'
      + '\n      -> the backdrop is still showing through the panel')
  } else {
    pass('ZERO of ' + c.themed.pixels + ' px inside the themed menu differ from the fill'
      + ' -- nothing shows through')
  }
}
/* Negative control: the same band in the untinted render MUST show the backdrop.
   Without this the assertion above would also pass on a page where the menu is
   simply not there. */
if (c.plain.notMode < 200 || c.plain.stripe < 500) {
  fail('the untinted render does not show the backdrop through the menu ('
    + c.plain.notMode + ' px differing, ' + c.plain.stripe + ' stripe-coloured)'
    + '\n      -> the fixture no longer reproduces the bug; the assertion above is vacuous')
} else {
  pass('negative control: untinted fill lets the backdrop through (' + c.plain.notMode
    + ' px differing, ' + c.plain.stripe + ' stripe-coloured, ' + c.plain.distinct
    + ' distinct colours) -- the bug still reproduces in this fixture')
}
if (c.plain.modal.join(',') === c.themed.modal.join(',')) {
  fail('both renders show the same modal colour (' + JSON.stringify(c.plain.modal)
    + ')\n      -> the token layer changed nothing; do not trust the pass above')
} else {
  pass('tinted render is a different colour from the untinted one by construction ('
    + JSON.stringify(c.plain.modal) + ' -> ' + JSON.stringify(c.themed.modal) + ')')
}

console.log('')
if (failures) { console.error(failures + ' menu-surface check(s) failed'); process.exit(1) }
console.log('all menu-surface checks passed (' + (themedDom.results.length + 9) + ' assertions)')
