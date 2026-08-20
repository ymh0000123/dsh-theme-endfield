/**
 * contour-a11y.test.js — prove the contour layer honours prefers-reduced-motion.
 *
 * The preference cannot be toggled from page script, so it is imposed on the whole
 * browser with --force-prefers-reduced-motion and the SAME shipped client.js is
 * loaded under it. Expected behaviour, matching the boot plate's existing policy:
 * the pattern still renders (a static texture is not motion), but neither the field
 * morph never starts — even though the switch is ON.
 *
 * Usage: node test/contour-a11y.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-a11y-'))
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
  :root{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-label-primary:#101110;
        --dsw-specific-sidebar-fill:#e8e8e2;--dsw-alias-border-l1:#d8d9d5;
        --dsw-alias-border-l2:#b6b8b3;--dsw-font-family:Arial,sans-serif}
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
const out=[]
const R=(n,p,d)=>out.push({name:n,pass:!!p,detail:d===undefined?'':String(d)})
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
const opaque=(cv)=>{if(!cv)return -1
  const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data
  let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>6)n++;return n}
window.addEventListener('load',async()=>{
  const LS=localStorage
  LS.setItem('dsh-theme-endfield-enabled','1')
  LS.setItem('dsh-theme-endfield-loader','0')
  LS.setItem('dsh-theme-endfield-contour','1')
  // The motion switch is deliberately ON: the OS preference must win over it.
  LS.setItem('dsh-theme-endfield-contour-anim','1')
  const mod=window.__MOD__.factory(()=>null)
  mod.apply({get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:undefined,effect:(f)=>f()})
  document.body.appendChild(document.createElement('span'))
  await sleep(400)
  R('reduced-motion is actually active in this run',
    matchMedia('(prefers-reduced-motion: reduce)').matches)
  const lines=document.querySelector('[data-endfield-contour-lines]')
  R('layer still mounts', !!lines)
  R('static pattern still renders', opaque(lines)>3000, 'opaquePx='+opaque(lines))
  const snap=()=>lines.getContext('2d').getImageData(0,0,lines.width,lines.height).data
  const a=snap().slice(0); await sleep(900); const b=snap()
  let diff=0; for(let i=3;i<a.length;i+=4) if(a[i]!==b[i]) diff++
  R('no field morph despite anim switch ON', diff===0, 'changedAlpha='+diff)
  document.title='A11Y '+JSON.stringify(out)
})
</script></body></html>`

fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
const page = path.join(OUT, 'a11y.html')
fs.writeFileSync(page, HTML)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-prof-'))
let dom = ''
try {
  dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    // This is the whole point of the file: impose the OS-level preference.
    '--force-prefers-reduced-motion',
    '--virtual-time-budget=12000', '--window-size=1400,900',
    '--user-data-dir=' + tmp, '--dump-dom',
    'file:///' + page.replace(/\\/g, '/'),
  ], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
} catch (e) { console.error('FAIL  browser run failed: ' + e.message); process.exit(1) }

const m = dom.match(/<title>A11Y (\[.*?\])<\/title>/s)
if (!m) { console.error('FAIL  page did not report results'); process.exit(1) }
const results = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
let bad = 0
for (const r of results) {
  if (r.pass) console.log('ok    ' + r.name + (r.detail ? '  (' + r.detail + ')' : ''))
  else { console.error('FAIL  ' + r.name + (r.detail ? '  -> ' + r.detail : '')); bad++ }
}
console.log('')
if (bad) { console.error(bad + ' a11y check(s) failed'); process.exit(1) }
console.log('all ' + results.length + ' reduced-motion checks passed')
