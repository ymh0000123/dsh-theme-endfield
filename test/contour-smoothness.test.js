/**
 * contour-smoothness.test.js — assert the contour strokes are rendered as smooth
 * curves, not faceted polylines.
 *
 * Regression target, measured before the fix: marching squares emits one vertex per
 * grid-cell edge, so with a 10px grid the polylines had ~7.8px segments and interior
 * turn angles reaching 41.7 degrees at p99 — visible corners. ctx.lineJoin cannot
 * help a 1px stroke.
 *
 * The fix applies field smoothing, Chaikin filtering, and constrained cubic
 * Bézier curves. Smoothness is asserted on rendered pixels and on the actual
 * cubic segments: controls must be finite and adjacent segments must meet with
 * a continuous tangent.
 *
 * Usage: node test/contour-smoothness.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const chrome = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
function grab(name) {
  const at = src.indexOf('const ' + name + ' = ')
  if (at < 0) throw new Error('not found in client.js: ' + name)
  const i = src.indexOf('{', at)
  let d = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(at, j + 1) }
  }
  throw new Error('unbalanced: ' + name)
}
function grabNum(name) {
  const m = src.match(new RegExp('const ' + name + ' = ([0-9.]+)'))
  return 'const ' + name + ' = ' + m[1]
}
/* Must track client.js: contourBuild() was split into a candidate builder plus a
   coverage validator (accept-or-reroll). A missing name is a ReferenceError inside
   the page and surfaces only as "no result". */
const fns = ['contourRng', 'contourBuild', 'contourBuildCandidate',
  'contourCoverageScore', 'contourEvaluate', 'contourExtractLevel', 'contourExtract']
  .map(grab).join('\n')
const nums = ['CONTOUR_STEP', 'CONTOUR_LEVELS', 'CONTOUR_SPAN',
  'CONTOUR_MIN_LEN', 'CONTOUR_MIN_RING_BOX', 'CONTOUR_MIN_CROSSINGS'].map(grabNum).join('\n')
// The shipped line renderer, taken verbatim — this is what is under test.
const drawLines = grab('contourDrawLines')

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head>
<body style="margin:0">
<canvas id="ship" width="1432" height="753"></canvas>
<canvas id="flat" width="1432" height="753"></canvas>
<script>
let contourField=null, contourGeom=null, contourPaths=[]
${nums}
// Derived from the mirrored numbers above, exactly as client.js derives them.
const CONTOUR_KEEP_LEN=CONTOUR_MIN_LEN*1.35
const CONTOUR_KEEP_RING=CONTOUR_MIN_RING_BOX*1.5
// Fixed seed: a geometry comparison must measure the SAME landscape every run.
const contourSeed=0x5eed4242
${fns}
const isDarkScheme=()=>false
const contourStroke=()=>'rgba(0,0,0,1)'
const contourLineCv=document.getElementById('ship')
const bezierPaths=[]
let bezierPath=null
let bezierCurrent=null
const bezierCtx=CanvasRenderingContext2D.prototype
const originalMoveTo=bezierCtx.moveTo
const originalBeginPath=bezierCtx.beginPath
const originalBezierCurveTo=bezierCtx.bezierCurveTo
let captureBeziers=true
bezierCtx.beginPath=function(){
  if(captureBeziers){
    bezierPaths.length=0
    bezierPath=null
    bezierCurrent=null
  }
  return originalBeginPath.apply(this,arguments)
}
bezierCtx.moveTo=function(x,y){
  if(!captureBeziers) return originalMoveTo.call(this,x,y)
  bezierPath={start:[x,y], segments:[]}
  bezierPaths.push(bezierPath)
  bezierCurrent=[x,y]
  return originalMoveTo.call(this,x,y)
}
bezierCtx.bezierCurveTo=function(c1x,c1y,c2x,c2y,x,y){
  if(!captureBeziers) return originalBezierCurveTo.call(this,c1x,c1y,c2x,c2y,x,y)
  if(bezierPath) bezierPath.segments.push({
    sx:bezierCurrent[0], sy:bezierCurrent[1], c1x, c1y, c2x, c2y, x, y,
  })
  bezierCurrent=[x,y]
  return originalBezierCurveTo.call(this,c1x,c1y,c2x,c2y,x,y)
}
${drawLines}

/* contourBuild() now sets contourGeom itself (it has to: the speck filter inside
   contourExtractLevel needs the canvas size to judge what is off-canvas). The
   explicit assignment that used to follow is redundant, and re-asserting it here
   before extraction would mask a regression in that wiring. */
contourBuild(1432,753)
contourExtract(1.0)

// --- shipped renderer ---
const tShip=(()=>{contourDrawLines();const s=performance.now()
  for(let i=0;i<15;i++)contourDrawLines();return (performance.now()-s)/15})()
captureBeziers=false

// --- reference: straight lines through the SAME vertices ---
const fc=document.getElementById('flat').getContext('2d')
const drawFlat=()=>{fc.clearRect(0,0,1432,753)
  fc.strokeStyle='rgba(0,0,0,1)';fc.lineWidth=1;fc.lineJoin='round';fc.beginPath()
  for(const p of contourPaths){fc.moveTo(p[0],p[1])
    for(let k=2;k<p.length;k+=2)fc.lineTo(p[k],p[k+1])}
  fc.stroke()}
const tFlat=(()=>{drawFlat();const s=performance.now()
  for(let i=0;i<15;i++)drawFlat();return (performance.now()-s)/15})()

const a=contourLineCv.getContext('2d').getImageData(0,0,1432,753).data
const b=fc.getImageData(0,0,1432,753).data
let inkShip=0, inkFlat=0, diff=0
for(let i=3;i<a.length;i+=4){
  if(a[i]>8)inkShip++
  if(b[i]>8)inkFlat++
  if(Math.abs(a[i]-b[i])>24)diff++
}
/* Anti-aliasing coverage: a curve lays down more PARTIAL-alpha pixels than a chain
   of straight segments, because its direction varies continuously. This is a second,
   independent signal that curves are really being emitted. */
let partialShip=0, partialFlat=0
for(let i=3;i<a.length;i+=4){
  if(a[i]>8&&a[i]<200)partialShip++
  if(b[i]>8&&b[i]<200)partialFlat++
}
let finiteSegments=0, geomSegments=0, maxJoinError=0
for(const path of bezierPaths){
  for(const segment of path.segments){
    geomSegments++
    if([segment.sx,segment.sy,segment.c1x,segment.c1y,
      segment.c2x,segment.c2y,segment.x,segment.y].every(Number.isFinite)) finiteSegments++
  }
  for(let i=1;i<path.segments.length;i++){
    const prev=path.segments[i-1], next=path.segments[i]
    const dx1=prev.x-prev.c2x, dy1=prev.y-prev.c2y
    const dx2=next.c1x-next.sx, dy2=next.c1y-next.sy
    const scale=Math.max(1,Math.hypot(dx1,dy1),Math.hypot(dx2,dy2))
    maxJoinError=Math.max(maxJoinError,Math.hypot(dx1-dx2,dy1-dy2)/scale)
  }
}
document.title='SMO '+JSON.stringify({
  vertices:contourPaths.reduce((s,p)=>s+p.length/2,0),
  paths:contourPaths.length,
  inkShip, inkFlat,
  inkRatio:+(inkShip/inkFlat).toFixed(3),
  changedPx:diff, changedPct:+(100*diff/inkFlat).toFixed(1),
  partialShip, partialFlat,
  partialRatio:+(partialShip/partialFlat).toFixed(3),
  msShip:+tShip.toFixed(2), msFlat:+tFlat.toFixed(2),
  geomSegments, finiteSegments, maxJoinError:+maxJoinError.toFixed(4),
})
</script></body></html>`

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-smo-'))
const page = path.join(OUT, 'smo.html')
fs.writeFileSync(page, HTML)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'smo-prof-'))
let dom = ''
try {
  dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=30000', '--user-data-dir=' + tmp, '--dump-dom',
    'file:///' + page.replace(/\\/g, '/'),
  ], { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'ignore'] })
} catch (e) { console.error('FAIL  browser run failed: ' + e.message); process.exit(1) }
const m = dom.match(/<title>SMO (.*?)<\/title>/s)
if (!m) {
  const t = dom.match(/<title>(.*?)<\/title>/s)
  console.error('FAIL  no result' + (t ? ': ' + t[1].slice(0, 400) : ''))
  process.exit(1)
}
const r = JSON.parse(m[1].replace(/&quot;/g, '"'))

let bad = 0
const ok = (s) => console.log('ok    ' + s)
const fail = (s) => { console.error('FAIL  ' + s); bad++ }

console.log(r.paths + ' polylines, ' + r.vertices + ' vertices')
console.log('  ink: curve ' + r.inkShip + '  straight ' + r.inkFlat + '  (ratio ' + r.inkRatio + ')')
console.log('  partial-alpha px: curve ' + r.partialShip + '  straight ' + r.partialFlat + '  (ratio ' + r.partialRatio + ')')
console.log('  draw cost: curve ' + r.msShip + ' ms   straight ' + r.msFlat + ' ms')

// 1. the smoothing must actually be doing something
if (r.changedPct >= 8) ok('curves materially change the stroke: ' + r.changedPct + '% of pixels differ from straight lines')
else fail('stroke is nearly identical to straight lines (' + r.changedPct + '%) — smoothing is not being applied')
// 2. more anti-aliased coverage = continuously varying direction
if (r.partialRatio > 1.01) ok('more partial-alpha coverage than straight lines (x' + r.partialRatio + ') — direction varies continuously')
else fail('no increase in anti-aliased coverage (x' + r.partialRatio + ') — curves may not be emitted')
// 3. shapes must not be distorted or thinned away
if (r.inkRatio > 0.9 && r.inkRatio < 1.1) ok('total ink preserved (ratio ' + r.inkRatio + ') — shapes not distorted')
else fail('ink coverage changed too much (ratio ' + r.inkRatio + ')')
// 5. the actual cubic geometry must be finite and C1 at every join
if (r.geomSegments > 0 && r.finiteSegments === r.geomSegments) ok('all cubic controls are finite')
else fail('cubic geometry contains non-finite controls')
if (r.maxJoinError < 0.001) ok('cubic joins are C1-continuous (error ' + r.maxJoinError + ')')
else fail('cubic join tangent discontinuity: ' + r.maxJoinError)

console.log('')
if (bad) { console.error(bad + ' smoothness check(s) failed'); process.exit(1) }
console.log('all smoothness checks passed')
