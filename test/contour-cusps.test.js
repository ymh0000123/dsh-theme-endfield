/**
 * contour-cusps.test.js — issue #3: 等高线变化时出现大量不规则锐角锯齿.
 *
 * WHY THIS TEST EXISTS, AND WHY THE OLD ONE MISSED IT.
 * contour-smoothness.test.js compares curve-drawn against straight-drawn pixels on a
 * SINGLE frame. That proves smoothing runs, but it can never see a defect the two
 * renderings share, and it never advances the animation. The reported artefact was
 * exactly that: sharp angles present in every frame, reported as visible "while it
 * changes" because the sheet redraws ~24 times a second and each spike lands
 * somewhere new. The whole suite passed while ~127 spikes per frame were on screen.
 *
 * SO THIS TEST MEASURES THE DRAWN CURVE ITSELF, ACROSS AN ANIMATION SEQUENCE.
 * It stubs a 2d context, lets the SHIPPED contourDrawLines() record its own
 * moveTo/lineTo/quadraticCurveTo/closePath stream, samples that stream densely, and
 * measures the turn angle at every sampled point — including across a ring's seam.
 * Nothing about the span layout is re-derived here, so the test cannot silently drift
 * away from the renderer it is checking.
 *
 * THE THREE DEFECTS IT LOCKS DOWN (all measured on the real output before the fix):
 *   1. degenerate final span — the last quadratic had its control point BEHIND its
 *      start, collinear with it, so the curve ran backwards then reversed: an exact
 *      180-degree cusp with a ~1.4px whisker on 95 of 95 multi-vertex paths.
 *   2. ring seams — closed rings were drawn as OPEN curves, so start and end tangents
 *      disagreed: 32 rings, median 10.0 and up to 26.5 degrees.
 *   3. tangency needles — where a level runs nearly tangent to the field, marching
 *      squares emits a hairpin whose base (0.831px at worst) is narrower than the 1px
 *      stroke, so only a whisker paints.
 *
 * Usage: node test/contour-cusps.test.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
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
  if (!m) throw new Error('not found in client.js: ' + name)
  return 'const ' + name + ' = ' + m[1]
}

/* The extraction and draw code touches only typed arrays, Math and a 2d context, so
   it runs directly in Node against a recording stub — no browser needed. Names must
   track client.js; a missing one throws here instead of failing mysteriously. */
const fns = ['contourRng', 'contourBuild', 'contourBuildCandidate', 'contourCoverageScore',
  'contourEvaluate', 'contourExtractLevel', 'contourExtract'].map(grab).join('\n')
const nums = ['CONTOUR_STEP', 'CONTOUR_LEVELS', 'CONTOUR_SPAN',
  'CONTOUR_MIN_LEN', 'CONTOUR_MIN_RING_BOX', 'CONTOUR_MIN_CROSSINGS'].map(grabNum).join('\n')

let api
try {
  api = new Function(`
let contourField=null, contourGeom=null, contourPaths=[]
${nums}
const CONTOUR_KEEP_LEN=CONTOUR_MIN_LEN*1.35
const CONTOUR_KEEP_RING=CONTOUR_MIN_RING_BOX*1.5
// Fixed seed: a geometry regression must measure the SAME landscape every run.
const contourSeed=0x5eed4242
${fns}
const isDarkScheme=()=>false
const isWulingPalette=()=>false
${grab('contourStroke')}
let REC=[]
const contourLineCv={ getContext:()=>({
  clearRect(){}, beginPath(){ REC=[] }, stroke(){},
  moveTo(x,y){ REC.push(['M',x,y]) },
  lineTo(x,y){ REC.push(['L',x,y]) },
  quadraticCurveTo(cx,cy,x,y){ REC.push(['Q',cx,cy,x,y]) },
  closePath(){ REC.push(['Z']) },
  set strokeStyle(v){}, get strokeStyle(){return ''},
  set lineWidth(v){}, get lineWidth(){return 1},
  set lineJoin(v){}, get lineJoin(){return 'round'},
}) }
${grab('contourDrawLines')}
return { build:contourBuild, extract:contourExtract, draw:contourDrawLines,
  rec:()=>REC, paths:()=>contourPaths }
`)()
} catch (e) {
  console.error('FAIL  could not load the contour code: ' + e.message)
  process.exit(1)
}

const W = 1432, H = 753
const SAMPLES = 8      // points per drawn span
api.build(W, H)

/** Expand the recorded draw stream into subpaths of densely sampled points. */
function sampleStream(rec) {
  const subs = []
  let cur = null, cx = 0, cy = 0, sx = 0, sy = 0
  for (const op of rec) {
    if (op[0] === 'M') {
      cur = [op[1], op[2]]
      subs.push({ pts: cur, closed: false })
      cx = sx = op[1]; cy = sy = op[2]
    } else if (op[0] === 'L') {
      for (let i = 1; i <= SAMPLES; i++) {
        cur.push(cx + (op[1] - cx) * i / SAMPLES, cy + (op[2] - cy) * i / SAMPLES)
      }
      cx = op[1]; cy = op[2]
    } else if (op[0] === 'Q') {
      const ax = cx, ay = cy
      for (let i = 1; i <= SAMPLES; i++) {
        const t = i / SAMPLES, u = 1 - t
        cur.push(u * u * ax + 2 * u * t * op[1] + t * t * op[3],
          u * u * ay + 2 * u * t * op[2] + t * t * op[4])
      }
      cx = op[3]; cy = op[4]
    } else if (op[0] === 'Z') {
      subs[subs.length - 1].closed = true
      if (Math.hypot(cx - sx, cy - sy) > 1e-9) {
        for (let i = 1; i <= SAMPLES; i++) {
          cur.push(cx + (sx - cx) * i / SAMPLES, cy + (sy - cy) * i / SAMPLES)
        }
      }
      cx = sx; cy = sy
    }
  }
  return subs
}
/** Turn angles in degrees; a closed subpath is measured cyclically, seam included. */
function turnAngles(sub) {
  const p = sub.pts
  const n = p.length / 2
  const out = []
  const lim = sub.closed ? n : n - 1
  for (let k = 1; k < lim; k++) {
    const i0 = k - 1, i1 = k, i2 = (k + 1) % n
    const ax = p[i1 * 2] - p[i0 * 2], ay = p[i1 * 2 + 1] - p[i0 * 2 + 1]
    const bx = p[i2 * 2] - p[i1 * 2], by = p[i2 * 2 + 1] - p[i1 * 2 + 1]
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by)
    if (la < 1e-9 || lb < 1e-9) continue
    let c = (ax * bx + ay * by) / (la * lb)
    if (c > 1) c = 1; else if (c < -1) c = -1
    out.push(Math.acos(c) * 180 / Math.PI)
  }
  return out
}

/* Walk the field the way the running plugin does: contourPhase advances by
   dt * 0.16 at CONTOUR_FIELD_FPS, so these phases are a real animation sequence,
   not twelve unrelated landscapes. */
const FRAMES = 12
const stats = []
let totalInk = 0
for (let n = 0; n < FRAMES; n++) {
  const phase = n * 0.16 * (1 / 24) * 6
  api.extract(phase)
  api.draw()
  const subs = sampleStream(api.rec())
  let angles = []
  for (const s of subs) angles = angles.concat(turnAngles(s))
  for (const s of subs) {
    for (let k = 2; k < s.pts.length; k += 2) {
      totalInk += Math.hypot(s.pts[k] - s.pts[k - 2], s.pts[k + 1] - s.pts[k - 1])
    }
  }
  angles.sort((a, b) => a - b)
  stats.push({
    phase,
    subpaths: subs.length,
    rings: subs.filter((s) => s.closed).length,
    p50: angles[Math.floor(angles.length * 0.5)],
    p99: angles[Math.floor(angles.length * 0.99)],
    max: angles[angles.length - 1],
    cusps: angles.filter((a) => a > 150).length,
    sharp: angles.filter((a) => a > 90).length,
    corners: angles.filter((a) => a > 60).length,
  })
}

let bad = 0
const ok = (s) => console.log('ok    ' + s)
const fail = (s) => { console.error('FAIL  ' + s); bad++ }

console.log(FRAMES + ' animation frames at ' + W + 'x' + H + ', ' +
  Math.round(totalInk) + 'px of drawn curve')
console.log('phase   subpaths rings | turn p50   p99    max | >150 | >90 | >60')
for (const s of stats) {
  console.log('  ' + s.phase.toFixed(3) + ' ' + String(s.subpaths).padStart(8) + ' ' +
    String(s.rings).padStart(5) + ' | ' +
    [s.p50, s.p99, s.max].map((x) => x.toFixed(1).padStart(6)).join(' ') + ' | ' +
    String(s.cusps).padStart(4) + ' | ' + String(s.sharp).padStart(3) + ' | ' +
    String(s.corners).padStart(3))
}
console.log('')

const worstCusp = Math.max(...stats.map((s) => s.cusps))
const worstSharp = Math.max(...stats.map((s) => s.sharp))
const worstMax = Math.max(...stats.map((s) => s.max))
const worstP99 = Math.max(...stats.map((s) => s.p99))
const totalRings = stats.reduce((a, s) => a + s.rings, 0)

/* 1. THE HEADLINE: no cusps anywhere in the sequence. Before the fix this was ~127
      per frame (one per path end, plus needles), every one of them a 180-degree
      reversal. There is no legitimate source of a >150-degree turn on an iso-contour
      of a smooth field, so the bar is zero rather than a tolerance. */
if (worstCusp === 0) ok('no cusps (>150 deg) in any frame — was ~127/frame')
else fail(worstCusp + ' cusp(s) >150 deg in a single frame — a stroke reverses on itself')

/* 2. No sharp corners either. A 10px grid over this field genuinely turns by up to
      ~65 degrees at a tight apex, so 90 is the bar: it is comfortably above real
      terrain and far below anything that reads as a spike. */
if (worstSharp === 0) ok('no sharp corners (>90 deg) in any frame')
else fail(worstSharp + ' turn(s) >90 deg — sharp angles are visible on the sheet')

/* 3. The curve must stay smooth in the BULK, not merely avoid spikes: p99 was 5.6
      deg after the midpoint spline landed, so a regression that re-faceted the lines
      would push this up long before it produced an outright cusp. */
if (worstP99 < 12) ok('bulk stays smooth: worst p99 turn ' + worstP99.toFixed(1) + ' deg')
else fail('p99 turn angle rose to ' + worstP99.toFixed(1) + ' deg — strokes are faceted again')

/* 4. Rings must be drawn as rings. If contourDrawLines() stops closing them, their
      seam corner comes straight back, so this asserts the mechanism, not just the
      symptom. About a third of paths are closed loops on this landscape. */
if (totalRings > FRAMES * 10) ok('closed rings drawn as rings: ' + totalRings + ' over ' + FRAMES + ' frames')
else fail('only ' + totalRings + ' closed subpath(s) — rings are being drawn open again')

console.log('  worst over the sequence: max turn ' + worstMax.toFixed(1) + ' deg')
console.log('')
if (bad) { console.error(bad + ' cusp/smoothness check(s) failed'); process.exit(1) }
console.log('all cusp checks passed')
