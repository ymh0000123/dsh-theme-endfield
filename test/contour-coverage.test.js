/**
 * coverage.js — measure contour coverage on the LINE CANVAS ITSELF.
 *
 * A screenshot cannot answer "does the field have blank patches?", because the
 * app's own opaque cards, the composer scrim and the message text all cover parts
 * of the sheet. Reading the canvas directly isolates the pattern from everything
 * painted above it.
 *
 * Splits the canvas into an 8x5 grid and reports the share of cells that contain
 * essentially no ink, which is the objective form of "large empty areas".
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
// Scratch files go to a temp dir so the package stays clean.
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-cov-'))
const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p))

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
  const LS=localStorage
  LS.setItem('dsh-theme-endfield-enabled','1')
  LS.setItem('dsh-theme-endfield-loader','0')
  LS.setItem('dsh-theme-endfield-contour','1')
  LS.setItem('dsh-theme-endfield-contour-anim','1')
  const mod=window.__MOD__.factory(()=>null)
  mod.apply({get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:undefined,effect:(f)=>f()})
  document.body.appendChild(document.createElement('span'))
  setTimeout(()=>{
    const cv=document.querySelector('[data-endfield-contour-lines]')
    const g=cv.getContext('2d'), W=cv.width, H=cv.height
    const d=g.getImageData(0,0,W,H).data
    const GX=8,GY=5, cells=[]
    for(let gy=0;gy<GY;gy++)for(let gx=0;gx<GX;gx++){
      const x0=Math.floor(gx*W/GX),x1=Math.floor((gx+1)*W/GX)
      const y0=Math.floor(gy*H/GY),y1=Math.floor((gy+1)*H/GY)
      let ink=0,tot=0
      for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){
        const a=d[(y*W+x)*4+3]; if(a>10)ink++; tot++
      }
      cells.push({gx,gy,pct:+(100*ink/tot).toFixed(2)})
    }
    const pcts=cells.map(c=>c.pct)
    const empty=cells.filter(c=>c.pct<0.6)
    document.title='COV '+JSON.stringify({
      min:Math.min.apply(null,pcts).toFixed(2),
      max:Math.max.apply(null,pcts).toFixed(2),
      mean:(pcts.reduce((a,b)=>a+b,0)/pcts.length).toFixed(2),
      emptyCells:empty.length, total:cells.length,
      worst:cells.slice().sort((a,b)=>a.pct-b.pct).slice(0,4)
    })
  },900)
</script></body></html>`

fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
const page = path.join(OUT, 'coverage.html')
fs.writeFileSync(page, HTML)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cov-'))
const dom = execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--virtual-time-budget=6000', '--window-size=1440,900',
  '--user-data-dir=' + tmp, '--dump-dom',
  'file:///' + page.replace(/\\/g, '/'),
], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
const m = dom.match(/<title>COV (.*?)<\/title>/s)
if (!m) { console.error('no result'); process.exit(1) }
const r = JSON.parse(m[1].replace(/&quot;/g, '"'))
console.log('ink coverage per cell (8x5 grid over the line canvas)')
console.log('  min ' + r.min + '%   mean ' + r.mean + '%   max ' + r.max + '%')
console.log('  near-empty cells: ' + r.emptyCells + ' / ' + r.total)
console.log('  sparsest: ' + r.worst.map((c) => '(' + c.gx + ',' + c.gy + ')=' + c.pct + '%').join('  '))
if (r.emptyCells > 0) { console.error('\nFAIL  ' + r.emptyCells + ' region(s) have essentially no contour'); process.exit(1) }
console.log('\nok  every region carries contour ink')
