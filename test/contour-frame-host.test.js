/**
 * contour-frame-host.test.js — where the contour layer is allowed to mount.
 *
 * Issue #45: on DSH Desktop 0.14 the switch was ON, the console was clean, and no
 * contour ever appeared. The shell had grown an anonymous wrapper between the
 * frame and its columns, and that wrapper is `display: contents`. A contents box
 * generates no layout box, so `col.parentElement.getBoundingClientRect()` is 0x0
 * forever — the old locator measured the WRAPPER, failed its size test and
 * returned null, one level below the real frame. Nothing threw, so the only
 * symptom was a background that never showed up.
 *
 * This test loads the SHIPPED client.js against both shell shapes:
 *
 *   A. 0.14  frame > [display:contents] > column     <- regression under test
 *   B. 0.2.x frame > column                          <- must keep working
 *
 * and asserts the layer lands on the frame itself, not on a wrapper: the CSS that
 * clears the frame's opaque background is gated on
 * `[class*='_frame']:has(> [data-endfield-contour])`, so mounting one level deep
 * would silently paint the sheet UNDER an opaque surface instead.
 *
 * Usage: node test/contour-frame-host.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-frame-'))
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

/* The two shell shapes share everything above the frame on purpose: the frame is
   the only positioned ancestor, exactly as in the installed 0.14 bundle. */
const shell = (mode, columns) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
       font-family:Arial,sans-serif}
  :root{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-label-primary:#101110;
        --dsw-specific-sidebar-fill:#e8e8e2;--dsw-alias-border-l1:#d8d9d5;
        --dsw-alias-border-l2:#b6b8b3;--dsw-font-family:Arial,sans-serif}
  /* 0.14 shell: the outermost layout host is a plain block, and the slots that
     wrap the columns paint nothing at all. */
  .pI_x6G_shell{height:100%;display:block}
  .pI_x6G_slot{display:contents}
  .pI_x6G_frame{background:var(--dsw-alias-bg-base);height:100%;
    grid-template-columns:260px 1fr;grid-template-rows:100%;display:grid;
    position:relative;overflow:hidden}
  .pI_x6G_sidebarCol{background:var(--dsw-specific-sidebar-fill);
    border-right:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden}
  .pI_x6G_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}
  .wSkVaW_root{background:var(--dsw-alias-bg-base);flex-direction:column;
    min-width:0;height:100%;display:flex}
  .msg{font-size:15px;line-height:1.7;padding:40px 60px;max-width:640px}
</style></head><body><div id="root">
  <div class="pI_x6G_shell"><div class="pI_x6G_slot">
    <div class="pI_x6G_frame">
      ${columns}
    </div>
  </div></div>
</div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
/* The theme reads switches via the settingsScope seam (not localStorage). Seed a
   fake binder: theme on, contour ON, loader off. */
${BROWSER_SETTINGS_SCOPE_SNIPPET}
var __prefs=__endfieldSettingsScope({ enabled:'1', loader:'0', contour:'1' })
const MODE='${mode}'
const out=[]
const R=(n,p,d)=>out.push({name:n,pass:!!p,detail:d===undefined?'':String(d)})
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const opaque=(cv)=>{if(!cv)return -1
  const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data
  let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>6)n++;return n}
window.addEventListener('load',async()=>{
  const mod=window.__MOD__.factory(()=>null)
  mod.apply({get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:(n==='settingsScope'?__prefs.binder:undefined),effect:(f)=>f()})
  document.body.appendChild(document.createElement('span'))
  await sleep(500)
  const col=document.querySelector('[class$="_centerCol"]')
  const frame=document.querySelector('[class*="_frame"]')
  const layer=document.querySelector('[data-endfield-contour]')
  const lines=document.querySelector('[data-endfield-contour-lines]')
  R('column is on screen', !!col)
  /* The fixture is only worth anything if it reproduces the reported ancestor
     chain: a contents wrapper that measures 0x0 between the frame and the column. */
  const prem = (()=>{
    if(!col) return {ok:false,why:'no column'}
    const p=col.parentElement
    if(MODE==='direct') return {ok:p===frame,why:'parent is the frame'}
    const r=p.getBoundingClientRect()
    return {ok:p!==frame && getComputedStyle(p).display==='contents' && r.width===0 && r.height===0,
      why:getComputedStyle(p).display+' '+Math.round(r.width)+'x'+Math.round(r.height)}
  })()
  R(MODE==='direct'
    ? 'LOCATOR PREMISE: the column is a direct child of the frame'
    : 'LOCATOR PREMISE: the column\\'s parent is a 0x0, display:contents wrapper', prem.ok, prem.why)
  R('layer mounted', !!layer)
  R('layer sits ON THE FRAME, not on a wrapper', !!layer && layer.parentElement===frame,
    layer ? 'parent=' + (layer.parentElement.className || '(anonymous)') : 'no layer')
  R('layer is inside the frame subtree', !!layer && !!frame && frame.contains(layer))
  R('contour actually draws', opaque(lines)>1000, 'opaquePx='+opaque(lines))
  R('frame background cleared so the sheet is visible',
    !!frame && getComputedStyle(frame).backgroundColor==='rgba(0, 0, 0, 0)',
    frame ? getComputedStyle(frame).backgroundColor : 'no frame')
  document.title='FRAME '+JSON.stringify(out)
})
</script></body></html>`

const columns = {
  /* A. DSH 0.14: one anonymous contents wrapper per column, frame one level up. */
  contents: `<div class="pI_x6G_slot"><div class="pI_x6G_sidebarCol"></div></div>
      <div class="pI_x6G_slot"><div class="pI_x6G_centerCol"><div class="wSkVaW_root">
        <p class="msg">Legibility probe above the contour layer.</p>
      </div></div></div>`,
  /* B. 0.2.x: the column is a DIRECT child of the frame. */
  direct: `<div class="pI_x6G_sidebarCol"></div>
      <div class="pI_x6G_centerCol"><div class="wSkVaW_root">
        <p class="msg">Legibility probe above the contour layer.</p>
      </div></div>`,
}

fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

const run = (name) => {
  const page = path.join(OUT, 'frame-' + name + '.html')
  fs.writeFileSync(page, shell(name, columns[name]))
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'frame-prof-'))
  const dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--virtual-time-budget=12000', '--window-size=1400,900',
    '--user-data-dir=' + profile, '--dump-dom',
    'file:///' + page.replace(/\\/g, '/'),
  ], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
  const m = dom.match(/<title>FRAME (\[.*?\])<\/title>/s)
  if (!m) { console.error('FAIL  [' + name + '] page did not report results'); process.exit(1) }
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
}

let bad = 0
for (const name of Object.keys(columns)) {
  const results = run(name)
  const label = name === 'contents' ? '0.14 (display:contents wrappers)' : '0.2.x (direct column)'
  for (const r of results) {
    if (r.pass) console.log('ok    [' + label + '] ' + r.name + (r.detail ? '  (' + r.detail + ')' : ''))
    else { console.error('FAIL  [' + label + '] ' + r.name + (r.detail ? '  -> ' + r.detail : '')); bad++ }
  }
}
console.log('')
if (bad) { console.error(bad + ' frame-host check(s) failed'); process.exit(1) }
console.log('all frame-host checks passed')
