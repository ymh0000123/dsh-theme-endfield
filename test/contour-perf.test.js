/**
 * perf2.js — measure the SHIPPED contour algorithm's steady-state cost.
 *
 * Why not drive requestAnimationFrame: headless Chrome suspends/coalesces rAF, so
 * an rAF-based harness yielded n=1 sample no matter how the virtual-time budget
 * was set — a number with no distribution behind it is not a measurement.
 *
 * Instead this extracts the algorithm's own source out of client.js and runs it in
 * a tight loop under performance.now(). The functions are taken verbatim from the
 * shipped file (located by name, not retyped), so what is timed is the code that
 * actually ships, with no rAF scheduling in the way.
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
// Scratch files go to a temp dir so the package stays clean.
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-perf-'))
const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p))

const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

/** Slice out a `const NAME = (` ... `}` top-level arrow function by brace balance. */
function grab(name) {
  const key = 'const ' + name + ' = '
  const at = src.indexOf(key)
  if (at < 0) throw new Error('not found: ' + name)
  let i = src.indexOf('{', at)
  // for single-expression arrows there may be no block; all targets here are blocks
  let d = 0
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(at, j + 1) }
  }
  throw new Error('unbalanced: ' + name)
}

/* The extracted set must track client.js. contourBuild() was split into a
   candidate builder plus a coverage validator (accept-or-reroll), and it now reads
   a per-load seed, so all three names have to come across or the spliced bundle
   throws and this test reports only "no result". */
const parts = ['contourRng', 'contourBuild', 'contourBuildCandidate',
  'contourCoverageScore', 'contourEvaluate', 'contourExtractLevel', 'contourExtract']
  .map(grab).join('\n')

const HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
// module-level state the extracted functions close over in the real file
let contourField=null, contourGeom=null, contourPaths=[]
const CONTOUR_STEP=10, CONTOUR_LEVELS=20, CONTOUR_SPAN=1.45
/* Speck-filter and validator constants. Mirrored from client.js because the
   extracted functions close over them; a missing one is a ReferenceError inside
   the page, which surfaces only as "no result". */
const CONTOUR_MIN_LEN=40, CONTOUR_MIN_RING_BOX=21
const CONTOUR_KEEP_LEN=CONTOUR_MIN_LEN*1.35, CONTOUR_KEEP_RING=CONTOUR_MIN_RING_BOX*1.5
const CONTOUR_MIN_CROSSINGS=3
// Fixed seed here ON PURPOSE: a performance number must be reproducible, and the
// per-load seed would make every run measure a different landscape.
const contourSeed=0x5eed4242
${parts}

const W=1432,H=753
let t=performance.now(); contourBuild(W,H); const buildMs=performance.now()-t
const ev=[], ex=[]
// warm up the JIT before sampling
for(let i=0;i<6;i++){ contourEvaluate(i*0.05); contourExtract(i*0.05) }
for(let i=0;i<80;i++){
  const ph=1+i*0.05
  let a=performance.now(); contourEvaluate(ph); ev.push(performance.now()-a)
  a=performance.now(); contourExtract(ph); ex.push(performance.now()-a)
}
const st=(A)=>{A=A.slice().sort((x,y)=>x-y)
  return {p50:A[A.length>>1],p95:A[Math.floor(A.length*0.95)],max:A[A.length-1]}}
const e=st(ev), x=st(ex)
document.title='PERF '+JSON.stringify({
  grid:contourField.cols+'x'+contourField.rows, canvas:W+'x'+H,
  levels:CONTOUR_LEVELS+1, polylines:contourPaths.length, samples:ev.length,
  build:buildMs.toFixed(2),
  evalP50:e.p50.toFixed(2), evalP95:e.p95.toFixed(2),
  fullP50:x.p50.toFixed(2), fullP95:x.p95.toFixed(2), fullMax:x.max.toFixed(2),
})
</script></body></html>`

fs.mkdirSync(OUT, { recursive: true })
const page = path.join(OUT, 'perf2.html')
fs.writeFileSync(page, HTML)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'perf2-'))
const dom = execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=30000', '--user-data-dir=' + tmp, '--dump-dom',
  'file:///' + page.replace(/\\/g, '/'),
], { encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'ignore'] })
const m = dom.match(/<title>PERF (.*?)<\/title>/s)
if (!m) {
  const t = dom.match(/<title>(.*?)<\/title>/s)
  console.error('no result' + (t ? ': ' + t[1].slice(0, 400) : ''))
  process.exit(1)
}
const r = JSON.parse(m[1].replace(/&quot;/g, '"'))
console.log('shipped contour algorithm, ' + r.canvas + ' canvas')
console.log('  grid ' + r.grid + '  levels ' + r.levels + '  polylines ' + r.polylines)
console.log('  one-time build       ' + r.build + ' ms')
console.log('  field evaluate       p50 ' + r.evalP50 + '  p95 ' + r.evalP95 + ' ms')
console.log('  evaluate + extract   p50 ' + r.fullP50 + '  p95 ' + r.fullP95 + '  max ' + r.fullMax + ' ms   (n=' + r.samples + ')')
const budget = 1000 / 24
console.log('  24fps budget         ' + budget.toFixed(1) + ' ms')
if (parseFloat(r.fullP95) > budget) { console.error('\nFAIL  p95 over budget'); process.exit(1) }
console.log('\nok  steady-state animation fits the 24fps budget with ' +
  (100 - 100 * parseFloat(r.fullP95) / budget).toFixed(0) + '% headroom')
