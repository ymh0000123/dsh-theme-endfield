/**
 * contour-specks.test.js — lock down the two reported contour defects:
 * "mysterious little dots" and "not actually random".
 *
 * ── A. specks ────────────────────────────────────────────────────────────────
 * Marching squares legitimately emits two kinds of debris that read as dots
 * rather than terrain, both measured on the real render before the fix:
 *   OFF-CANVAS SLIVERS. The grid is ceil(w/step)+1 wide, so its last row/column
 *     sits on or past the canvas edge (+8px / +7px at 1432x753). 33 of 85 paths
 *     held vertices outside the canvas and 3 had ZERO visible length.
 *   APEX RINGS. Near a gaussian peak the innermost level closes into a tiny
 *     circle: 4 rings with a bbox under 26x26, smallest 11.8x15.1px, against a
 *     measured median inter-line gap of 21px (7322 samples).
 *
 * ── B. randomness ────────────────────────────────────────────────────────────
 * contourBuild() seeded mulberry32 with the constant 0x5eed4242, so every visit
 * drew the SAME landscape -- two independent loads produced 85 paths and 42497px
 * of stroke, identical vertex for vertex. The seed is now per page load.
 *
 * ── C. the regression that randomness exposed ────────────────────────────────
 * A fixed seed had been hiding a real defect: with independent uniform bump
 * placement, layouts clump and leave voids. Measured over 12 random seeds, the
 * coverage test failed 5 times (up to 3 blank cells). Placement is now a
 * jittered grid, so this test also asserts the sheet stays gap-free -- otherwise
 * "random" would simply mean "sometimes broken".
 *
 * Every assertion is measured on the REAL client.js in a headless browser.
 * Paths are captured by intercepting the canvas path calls, because a rasterised
 * ring and a rasterised stroke are hard to tell apart after the fact.
 *
 * Usage: node test/contour-specks.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-specks-'))
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

// Thresholds mirror the constants in client.js; kept here so a silent loosening
// of either one is caught rather than rubber-stamped.
const MIN_LEN = 40
const MIN_RING = 21
const RUNS = 5          // independent page loads -> independent seeds

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
  LS.setItem('dsh-theme-endfield-loader','0')
  LS.setItem('dsh-theme-endfield-watermark','0')
  LS.setItem('dsh-theme-endfield-contour','1')
  LS.setItem('dsh-theme-endfield-contour-anim','0')
  /* Capture the stitched polylines as the plugin draws them. contourDrawLines()
     emits beginPath, then moveTo + quadraticCurveTo (or lineTo) per path, so this
     reconstructs each path's on-screen vertices exactly. */
  const C=CanvasRenderingContext2D.prototype
  const om=C.moveTo, oq=C.quadraticCurveTo, ol=C.lineTo, ob=C.beginPath
  window.__PATHS__=[]
  let cur=null
  C.beginPath=function(){ window.__PATHS__=[]; cur=null; return ob.apply(this,arguments) }
  C.moveTo=function(x,y){ cur=[x,y]; window.__PATHS__.push(cur); return om.apply(this,arguments) }
  C.lineTo=function(x,y){ if(cur){cur.push(x,y)} return ol.apply(this,arguments) }
  C.quadraticCurveTo=function(cx,cy,x,y){ if(cur){cur.push(x,y)} return oq.apply(this,arguments) }
  const mod=window.__MOD__.factory(()=>null)
  mod.apply({get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:undefined,effect:(f)=>f()})
  document.body.appendChild(document.createElement('span'))
  setTimeout(()=>{
    const cv=document.querySelector('[data-endfield-contour-lines]')
    const W=cv.width,H=cv.height
    const P=window.__PATHS__||[]
    const inside=(x,y)=>x>=0&&x<=W&&y>=0&&y<=H
    const info=P.map((p,i)=>{
      let vis=0, any=false
      let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity
      for(let k=0;k<p.length;k+=2){
        const x=p[k],y=p[k+1]
        if(inside(x,y)){ any=true
          if(x<minx)minx=x; if(x>maxx)maxx=x
          if(y<miny)miny=y; if(y>maxy)maxy=y }
        if(k>=2){
          const px=p[k-2],py=p[k-1]
          if(inside(x,y)&&inside(px,py)){
            const dx=x-px,dy=y-py; vis+=Math.sqrt(dx*dx+dy*dy) }
        }
      }
      const gx=p[0]-p[p.length-2], gy=p[1]-p[p.length-1]
      return {i, vis:+vis.toFixed(1), anyVisible:any,
              bw:any?+(maxx-minx).toFixed(1):0, bh:any?+(maxy-miny).toFixed(1):0,
              closed:(gx*gx+gy*gy)<4}
    })
    // ink coverage on an 8x5 grid: proves "no specks" was not achieved by erasing
    const d=cv.getContext('2d').getImageData(0,0,W,H).data
    const GX=8,GY=5,cells=[]
    for(let gy2=0;gy2<GY;gy2++)for(let gx2=0;gx2<GX;gx2++){
      const x0=Math.floor(gx2*W/GX),x1=Math.floor((gx2+1)*W/GX)
      const y0=Math.floor(gy2*H/GY),y1=Math.floor((gy2+1)*H/GY)
      let ink=0,tot=0
      for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){
        if(d[(y*W+x)*4+3]>10)ink++; tot++ }
      cells.push(+(100*ink/tot).toFixed(2))
    }
    let inkPx=0
    for(let i=3;i<d.length;i+=4) if(d[i]>10) inkPx++
    document.title='SPK '+JSON.stringify({
      canvas:W+'x'+H, paths:info.length,
      totalVis:+info.reduce((s,p)=>s+p.vis,0).toFixed(0),
      inkPx,
      invisible:info.filter(p=>!p.anyVisible).length,
      tooShort:info.filter(p=>p.anyVisible&&p.vis<${MIN_LEN}),
      tinyRings:info.filter(p=>p.anyVisible&&p.closed&&p.bw<${MIN_RING}&&p.bh<${MIN_RING}),
      emptyCells:cells.filter(c=>c<0.6).length, minCell:Math.min.apply(null,cells)
    })
  },1500)
</script></body></html>`

fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
const page = path.join(OUT, 'specks.html')
fs.writeFileSync(page, HTML)

const runOnce = (n) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spk' + n + '-'))
  const dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--virtual-time-budget=9000',
    '--window-size=1440,900', '--user-data-dir=' + tmp, '--dump-dom',
    'file:///' + page.replace(/\\/g, '/'),
  ], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
  const m = dom.match(/<title>SPK (.*?)<\/title>/s)
  if (!m) { console.error('FAIL  run ' + n + ' did not report'); process.exit(1) }
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
}

const runs = []
for (let i = 0; i < RUNS; i++) runs.push(runOnce(i))

let failures = 0
const fail = (s) => { console.error('FAIL  ' + s); failures++ }
const pass = (s) => console.log('ok    ' + s)

console.log('canvas ' + runs[0].canvas + ',  ' + RUNS + ' independent page loads')
console.log('')
console.log(' run | paths | visible ink | invisible | <' + MIN_LEN
  + 'px | rings<' + MIN_RING + 'px | blank cells')
for (let i = 0; i < runs.length; i++) {
  const r = runs[i]
  console.log('  ' + i + '  |  ' + String(r.paths).padStart(3) + '  | '
    + String(r.totalVis).padStart(7) + 'px   |     ' + String(r.invisible).padStart(2)
    + '    |    ' + String(r.tooShort.length).padStart(2) + '    |     '
    + String(r.tinyRings.length).padStart(2) + '     |     ' + r.emptyCells
    + '  (min ' + r.minCell + '%)')
}
console.log('')

// ---- A. specks -----------------------------------------------------------
const invisible = runs.reduce((s, r) => s + r.invisible, 0)
if (invisible > 0) {
  fail(invisible + ' path(s) across ' + RUNS + ' runs lie ENTIRELY off-canvas'
    + '\n      -> grid overshoot debris is still being emitted')
} else {
  pass('no path lies entirely off-canvas (grid-overshoot slivers are pruned)')
}

const shortAll = runs.reduce((a, r) => a.concat(r.tooShort), [])
if (shortAll.length > 0) {
  fail(shortAll.length + ' path(s) have under ' + MIN_LEN + 'px of visible stroke'
    + '\n      e.g. ' + JSON.stringify(shortAll.slice(0, 3))
    + '\n      -> these read as dashes/specks, not contour lines')
} else {
  pass('every drawn path carries at least ' + MIN_LEN + 'px of visible stroke')
}

const ringsAll = runs.reduce((a, r) => a.concat(r.tinyRings), [])
if (ringsAll.length > 0) {
  fail(ringsAll.length + ' tiny CLOSED ring(s) with a bbox under ' + MIN_RING + 'px'
    + '\n      e.g. ' + JSON.stringify(ringsAll.slice(0, 3))
    + '\n      -> a ring smaller than one line spacing reads as a dot')
} else {
  pass('no closed ring is smaller than one median line spacing (' + MIN_RING + 'px)')
}

// ---- B. randomness -------------------------------------------------------
const sigs = runs.map((r) => r.paths + ':' + r.totalVis)
const distinct = new Set(sigs).size
if (distinct < 2) {
  fail('all ' + RUNS + ' page loads produced the SAME landscape (' + sigs[0] + ')'
    + '\n      -> the field seed is not per-load; the pattern is a fixed picture')
} else if (distinct < RUNS) {
  pass('landscape varies per load (' + distinct + '/' + RUNS
    + ' distinct signatures; a collision is possible by chance)')
} else {
  pass('every one of ' + RUNS + ' page loads produced a different landscape')
}

// ---- C. the defect randomness exposed ------------------------------------
const blank = runs.reduce((s, r) => s + r.emptyCells, 0)
if (blank > 0) {
  fail(blank + ' near-empty region(s) across ' + RUNS + ' random seeds'
    + '\n      -> bump placement clumps; a random seed must not mean "sometimes'
    + ' blank patches" (uniform placement measured 5 failures in 12 seeds)')
} else {
  pass('no blank patches in any of ' + RUNS + ' random layouts (stratified placement)')
}

// Debris removal must not have thinned the sheet.
const minInk = Math.min.apply(null, runs.map((r) => r.inkPx))
if (minInk < 30000) {
  fail('lowest ink coverage was only ' + minInk + ' px'
    + '\n      -> the speck filter is removing real strokes, not just debris')
} else {
  pass('sheet stays dense in every run (min ' + minInk + ' ink px)')
}

console.log('')
if (failures) { console.error(failures + ' contour speck/randomness check(s) failed'); process.exit(1) }
console.log('all checks passed')
