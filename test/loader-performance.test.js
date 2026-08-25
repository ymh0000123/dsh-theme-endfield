/**
 * loader-performance.test.js — ensure the boot plate does not compete with
 * the hidden contour animation for the main thread during startup.
 *
 * Usage: node test/loader-performance.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-loader-'))
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  :root{--dsw-alias-bg-base:#101110;--dsw-alias-label-primary:#f5f5f0;
    --dsw-specific-sidebar-fill:#101110;--dsw-alias-border-l1:#343633;
    --dsw-font-family:Arial,sans-serif}
  body{background:var(--dsw-alias-bg-base)}
  .pI_x6G_frame{background:var(--dsw-alias-bg-base);height:100%;
    grid-template-columns:248px 1fr;display:grid;position:relative;overflow:hidden}
  .pI_x6G_centerCol{display:flex;flex-direction:column;overflow:hidden}
  .wSkVaW_root{background:var(--dsw-alias-bg-base);height:100%;display:flex}
</style></head><body><div id="root">
  <div class="pI_x6G_frame"><div class="pI_x6G_sidebarCol"></div>
  <div class="pI_x6G_centerCol"><div class="wSkVaW_root"></div></div></div></div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
  document.body.setAttribute('data-ds-dark-theme','')
  const LS=localStorage
  LS.setItem('dsh-theme-endfield-enabled','1')
  LS.setItem('dsh-theme-endfield-loader','1')
  LS.setItem('dsh-theme-endfield-contour','1')
  LS.setItem('dsh-theme-endfield-contour-anim','1')
  LS.setItem('dsh-theme-endfield-watermark','0')
  const originalClearRect=CanvasRenderingContext2D.prototype.clearRect
  let contourClears=0
  CanvasRenderingContext2D.prototype.clearRect=function(x,y,w,h){
    if(this.canvas && this.canvas.hasAttribute('data-endfield-contour-lines')) contourClears++
    return originalClearRect.call(this,x,y,w,h)
  }
  const mod=window.__MOD__.factory(()=>null)
  window.__dispose__=mod.apply({
    get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:undefined,
    effect:(f)=>f(),
  })
  document.body.appendChild(document.createElement('span'))
  const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms))
  ;(async()=>{
    await sleep(700)
    const loaderDuring=!!document.querySelector('[data-endfield-loader]')
    const clearsDuring=contourClears
    await sleep(500)
    const clearsWhileLoader=contourClears
    await sleep(600)
    const plate=document.querySelector('[data-endfield-loader]')
    const meter=plate && plate.querySelector('[data-endfield-loader-meter]')
    const pct=plate && plate.querySelector('[data-endfield-loader-pct]')
    const plateRect=plate ? plate.getBoundingClientRect() : null
    const meterRect=meter ? meter.getBoundingClientRect() : null
    const pctRect=pct ? pct.getBoundingClientRect() : null
    const loaderGeometry=plateRect && meterRect && pctRect ? {
      plateBottom: plateRect.bottom,
      meterBottom: meterRect.bottom,
      pctBottom: pctRect.bottom,
      pct: pct.textContent,
      meterTop: getComputedStyle(meter).top,
      meterBottomStyle: getComputedStyle(meter).bottom,
    } : null
    while(document.querySelector('[data-endfield-loader]')) await sleep(100)
    const clearsAtRemoval=contourClears
    const beforeToggle=contourClears
    LS.setItem('dsh-theme-endfield-contour-anim','0')
    document.body.appendChild(document.createElement('span'))
    await sleep(150)
    LS.setItem('dsh-theme-endfield-contour-anim','1')
    document.body.appendChild(document.createElement('span'))
    await sleep(300)
    const clearsAfterToggle=contourClears
    const loaderAfter=!document.querySelector('[data-endfield-loader]')
    document.title='LDR '+JSON.stringify({loaderDuring,loaderAfter,clearsDuring,clearsWhileLoader,clearsAtRemoval,beforeToggle,clearsAfterToggle,loaderGeometry})
  })()
</script></body></html>`

fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
const page = path.join(OUT, 'loader.html')
fs.writeFileSync(page, HTML)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-prof-'))
let dom = ''
try {
  dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=7000', '--window-size=334,900',
    '--user-data-dir=' + tmp, '--dump-dom',
    'file:///' + page.replace(/\\/g, '/'),
  ], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
} catch (e) {
  console.error('FAIL  browser run failed: ' + e.message)
  process.exit(1)
}
const m = dom.match(/<title>LDR (.*?)<\/title>/s)
if (!m) { console.error('FAIL  loader page did not report results'); process.exit(1) }
const r = JSON.parse(m[1].replace(/&quot;/g, '"'))
let failures = 0
const ok = (s) => console.log('ok    ' + s)
const fail = (s) => { console.error('FAIL  ' + s); failures++ }

if (r.loaderDuring) ok('boot plate is present during the startup window')
else fail('boot plate disappeared before the startup sample')
if (r.loaderAfter) ok('boot plate completes and is removed')
else fail('boot plate remained after its completion window')
if (r.loaderGeometry && r.loaderGeometry.pct === '100%' && r.loaderGeometry.meterBottomStyle === '64px' && r.loaderGeometry.meterBottom <= r.loaderGeometry.plateBottom - 64 + 0.5 && r.loaderGeometry.pctBottom <= r.loaderGeometry.plateBottom - 64 + 0.5) {
  ok('100% loader meter is bottom-anchored inside the plate (' + JSON.stringify(r.loaderGeometry) + ')')
} else {
  fail('100% loader meter exceeds the plate bounds or lost bottom anchoring: ' + JSON.stringify(r.loaderGeometry))
}
if (r.clearsWhileLoader === r.clearsDuring) ok('contour redraw is paused behind the boot plate (' + r.clearsWhileLoader + ' clears)')
else fail('contour kept redrawing behind the boot plate (' + r.clearsWhileLoader + ' clears; started at ' + r.clearsDuring + ')')
if (r.clearsAfterToggle > r.beforeToggle) ok('contour animation resumes after a normal switch reconciliation')
else fail('contour animation did not resume after switch reconciliation (' + r.beforeToggle + ' -> ' + r.clearsAfterToggle + ')')

if (failures) { console.error(failures + ' loader performance check(s) failed'); process.exit(1) }
console.log('all loader performance checks passed')
