/* The worker renderer's backing-store budget. The worker rejects any frame with
   Math.round(w*dpr)*Math.round(h*dpr) > 8000000 (src/contour/contour-worker.js),
   and the canvas is frame-sized at device resolution whatever the sampling grid —
   so 1080p@2x, 1440p@1.5x and 4K@1x (all ~8.3M device pixels) used to throw
   'invalid frame' on the first frame and latch the main-thread fallback for the
   life of the renderer preference. The client now scales the device ratio down
   to the budget where frames are sent (contourWorkerDprFor); these tests pin the
   arithmetic on exactly the viewports that used to fail, and pin that ordinary
   windows pass through unchanged. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
const workerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'contour', 'contour-worker.js'), 'utf8')
function grab(name) {
  const start = source.indexOf('const ' + name + ' = ')
  assert(start >= 0, name)
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  throw new Error('unbalanced ' + name)
}

/* grab() works on brace-balanced units, and the bare constant has none — its
   grabbed span would run into the function below it. Match the value instead. */
const budgetLine = source.match(/const CONTOUR_WORKER_PIXEL_BUDGET = (\d+)/)
assert.ok(budgetLine, 'CONTOUR_WORKER_PIXEL_BUDGET not found in client.js')
const code = `
  const CONTOUR_WORKER_PIXEL_BUDGET = ${budgetLine[1]}
  ${grab('contourWorkerDprFor')}
  ({ workerDprFor: contourWorkerDprFor, budget: CONTOUR_WORKER_PIXEL_BUDGET })`
const { workerDprFor, budget } = vm.runInNewContext(code)

/* The budget constant must mirror the worker's own rejection bound: the client
   scaling is advisory, the worker's check is the enforcement point. If one
   moves, the other has to follow or the pin below silently stops meaning
   anything. */
const workerBound = workerSource.match(/Math\.round\(w\*dpr\)\s*\*\s*Math\.round\(h\*dpr\)\s*>\s*(\d+)/)
test('worker rejection bound is mirrored by the client budget constant', () => {
  assert.ok(workerBound, 'worker source no longer states its pixel bound the expected way')
  assert.equal(Number(workerBound[1]), budget)
})

/* Frames are sent with the frame's own w/h and dpr; the worker's validity check
   is computed exactly as here. Every viewport that used to be rejected must now
   pass it. */
for (const [w, h, dpr] of [[1920, 1080, 2], [2560, 1440, 1.5], [3840, 2160, 1], [3840, 2160, 1.25]]) {
  test(`oversized viewport ${w}x${h}@${dpr}x is scaled into the worker budget`, () => {
    const scaled = workerDprFor(w, h, dpr)
    assert.ok(scaled < dpr, 'expected the device ratio to be scaled down')
    const devicePixels = Math.round(w * scaled) * Math.round(h * scaled)
    assert.ok(devicePixels <= budget, `${devicePixels} exceeds the ${budget} budget`)
    // The scaled ratio must still satisfy the worker's dpr>0 validation.
    assert.ok(scaled >= 0.1)
  })
}

/* Ordinary windows are below the budget and must be bit-identical: no scaling,
   no drift. 1920x1080@1x is 2.07M device pixels; 1440x900@2x is 5.18M. */
for (const [w, h, dpr] of [[1440, 900, 2], [1200, 800, 1.5], [1920, 1080, 1], [2560, 1440, 1], [3440, 1440, 1.25]]) {
  test(`ordinary viewport ${w}x${h}@${dpr}x keeps its exact device ratio`, () => {
    assert.equal(workerDprFor(w, h, dpr), dpr)
  })
}

/* The frame sender must actually consult the budget, not just carry the helper. */
test('contourRefresh sends worker frames through the budgeted ratio', () => {
  assert.ok(/const ratio = contourWorkerDprFor\(contourGeom\.w, contourGeom\.h,/.test(source))
})
