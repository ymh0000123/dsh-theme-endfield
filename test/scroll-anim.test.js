/**
 * scroll-anim.test.js — the output-scroll animation: wiring, behaviour, and a
 * negative control measured in the SAME page.
 *
 * WHY THIS FEATURE NEEDS CAREFUL EVIDENCE. DSH pins the streaming transcript with
 * a direct write (`element.scrollTop = metrics.floor` in useScrollFollow.jump) and
 * then classifies the READ-BACK to decide whether it still owns bottom-follow:
 *
 *     element.scrollTop = target
 *     const landed = { ...metrics, top: element.scrollTop }
 *     this.following = this.nearBottom(landed)        // 25px threshold
 *
 * So there are two ways to get this wrong, and the obvious implementation gets
 * the second one:
 *
 *   - no visible effect  (the compensation is applied a frame too late, and the
 *     raw jump paints anyway) — looks like a dead feature;
 *   - broken following   (`scroll-behavior: smooth`, or any write to scrollTop:
 *     measured read-back returns the OLD position, `floor - oldTop > 25` flips
 *     follow intent off, and the answer stops following itself with no error).
 *
 * Part A pins the wiring in the source. Part B measures the real shipped bundle in
 * a real browser, and every visual claim comes with a negative control taken in
 * the SAME page with the switch OFF, so the fixture is proven able to reproduce
 * the hard jump it is being credited with removing.
 *
 * Usage: node test/scroll-anim.test.js
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const { launch } = require('./fixtures/chrome-cdp.js')

/* ---------- A. source wiring, no browser ---------- */
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const HOST = require(path.join(ROOT, 'index.js'))

/* The fragment itself, so the assertions below are about THIS feature rather than
   about the whole bundle (the bundle legitimately writes scrollTop nowhere, but
   the slice is what makes "this code never moves the port" a statement about the
   design instead of an accident of the current file). */
const start = src.indexOf('const SCROLL_ANIM_KEY =')
const end = src.indexOf('scrollAnimSyncHook = syncScrollAnim')
assert.ok(start > 0 && end > start, 'the 输出滚动动画 fragment must exist in client.js')
const frag = src.slice(start, end)

/* Never writes to the scrollport: the whole reason smooth CSS was rejected. */
assert.ok(!/\.scrollTop\s*=/.test(frag),
  'the runtime must never assign scrollTop — the app derives follow intent from its read-back')
assert.ok(!/scrollTo\s*\(/.test(frag),
  'the runtime must never call scrollTo — same read-back contract')
assert.ok(/addEventListener\('scroll', entry\.onScroll, \{ passive: true \}\)/.test(frag),
  'the runtime must hook the port\'s scroll event, passively')
/* Hash-free hooks only: a hashed module class would rot on an upstream rebuild and
   the feature would silently stop matching (the repo's selector-guard rule). */
assert.ok(frag.includes("'[data-conversation-scroll]'"),
  'the runtime must find the port through the hash-free data-conversation-scroll hook')
assert.ok(frag.includes("'[data-chat-flow]'"),
  'the runtime must transform the transcript column found through data-chat-flow')
assert.ok(!/_[\w-]*[0-9a-f]{6}_/.test(frag), 'no hashed class name may appear in the runtime')

/* The gates that make it safe, each asserted as an actual expression. */
assert.ok(/prefersReducedMotion\(\)/.test(frag),
  'the runtime must honour prefers-reduced-motion, like every other animation here')
assert.ok(/wasAtFloor/.test(frag) && /delta <= 0\.5/.test(frag),
  'only a downward stride that STARTED at the floor may be animated')
assert.ok(/destroyScrollAnim\(\)/.test(src),
  'unmount must release the animator (an orphaned transform would shift the transcript forever)')
assert.ok(/syncScrollAnim\(\)/.test(src),
  'the mount path must attach the animator')
assert.ok(/scrollAnimSyncHook = syncScrollAnim/.test(src) && /scrollAnimSyncHook\(\)/.test(src),
  'the page observer must re-attach the animator as the app renders a port')

/* The prefs contract: both halves declare the same fields, and every UI key maps
   to a declared field (the issue-#15 class of bug). */
for (const field of ['scrollAnim', 'scrollAnimLevel']) {
  assert.ok(Object.prototype.hasOwnProperty.call(HOST.FIELD_DEFAULTS, field),
    'index.js FIELD_DEFAULTS must declare ' + field)
}
assert.equal(HOST.FIELD_DEFAULTS.scrollAnim, '1',
  'the switch ships ON: it leaves the app\'s own bookkeeping untouched, so an upgrade should get it')
assert.equal(HOST.FIELD_DEFAULTS.scrollAnimLevel, 'standard')
assert.ok(src.includes("'dsh-theme-endfield-scroll-anim': 'scrollAnim'"),
  'PREFS_KEY_TO_FIELD must map the UI key to the declared field')
assert.ok(src.includes("'dsh-theme-endfield-scroll-anim-level': 'scrollAnimLevel'"))
console.log('PASS: source wiring (no scrollTop writes, hash-free hooks, gates, prefs contract)')

/* ---------- B. behaviour on a real page ---------- */

/* The fixture is the REAL chain: the class names and the `overflow: visible clip`
   containment are transcribed from the shipped ChatView bundle, because whether a
   transform inflates the scrollport is exactly what this design depends on. */
const HTML = `<!doctype html><html><head><style>
html,body{height:100%;margin:0;font:13px/1.5 sans-serif}
.app{height:100%;display:flex;flex-direction:column}
[data-conversation-content]{flex:1;min-height:0;position:relative;display:flex;flex-direction:column}
[data-conversation-scroll]{flex:1;min-height:0;overflow-y:auto}
.xz4KEq_frame{flex-direction:column;flex:auto;min-height:0;display:flex;position:relative}
.xz4KEq_root{flex-direction:column;flex:auto;min-height:0;display:flex;position:relative;overflow:visible clip}
.xz4KEq_scroll{min-height:0;padding:16px;flex:auto;overflow-y:auto}
[data-conversation-scroll] .xz4KEq_frame,[data-conversation-scroll] .xz4KEq_root{flex:none;height:auto;min-height:auto}
[data-conversation-scroll] .xz4KEq_scroll{flex:none;min-height:auto;overflow:visible}
.xz4KEq_column{max-width:760px;flex-direction:column;width:100%;margin:0 auto;display:flex}
.xz4KEq_flowItem{padding:6px 0}
.Dc7zOa_composerSeat{height:90px;background:#ddd;position:sticky;bottom:0}
</style></head><body><div class="app">
<div data-conversation-content data-conversation-region="chat">
  <div data-conversation-scroll>
    <div class="xz4KEq_frame"><div class="xz4KEq_root"><div class="xz4KEq_scroll">
      <div class="xz4KEq_column" data-chat-flow id="flow"></div>
    </div></div></div>
    <div class="Dc7zOa_composerSeat">composer</div>
  </div>
</div></div></body></html>`

/* One streaming run: grow the transcript by `stridePx` every `everyMs`, pin the
   port the way the app does, and record both the app's read-back and the
   ON-SCREEN movement of a fixed content point. `scrollAnim` selects the control. */
const RUN = (stridePx, everyMs, animate) => `(async () => {
  const port = window.__port, flow = window.__flow
  const raf = () => new Promise(r => requestAnimationFrame(() => r()))
  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const proto = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  __prefs.setField('scrollAnim', ${animate ? "'1'" : "'0'"})
  __prefs.setField('scrollAnimLevel', 'standard')
  await sleep(120)

  flow.style.transform = ''
  port.scrollTop = port.scrollHeight - port.clientHeight
  await sleep(250)
  const anchor = document.createElement('div'); anchor.className='xz4KEq_flowItem'; anchor.textContent='ANCHOR'
  flow.insertBefore(anchor, flow.firstChild)
  const pad = document.createElement('div'); pad.style.height = ${stridePx} + 'px'
  flow.appendChild(pad)
  port.scrollTop = port.scrollHeight - port.clientHeight
  await sleep(80)

  // Instrument the app's own read-back. There must be no own scrollTop property on
  // the port (the runtime patches nothing), so the prototype setter is the real one.
  const readBackErrors = []
  Object.defineProperty(port, 'scrollTop', {
    configurable: true,
    get() { return proto.get.call(this) },
    set(v) { proto.set.call(this, v); readBackErrors.push(+Math.abs(proto.get.call(this) - v).toFixed(3)) },
  })

  /* Detect a paint DEFERRED out of the scroll handler — the regression the source
     comments warn about. This has to be its own isolated case, measured from a clean
     rest: during continuous streaming the previous pin's offset is still on screen,
     so a "is the transform non-empty?" check passes either way and proves nothing
     (that is exactly how an earlier version of this assertion missed a deferred
     variant).
     From rest, the discrimination is exact. Chrome dispatches the scroll event in the
     rendering steps BEFORE the frame's animation callbacks, so:
       - correct code paints inside the handler -> the transform is already set when
         the callback this await installed runs (registered earlier, so it runs first);
       - deferred code queues its paint during those same scroll steps -> that callback
         is registered AFTER ours, so at our turn the transform is still empty. */
  flow.style.transform = ''
  await sleep(300)
  const floorAtRest = port.scrollHeight - port.clientHeight
  port.scrollTop = floorAtRest
  await sleep(300)
  flow.style.transform = ''
  await sleep(100)
  flow.style.paddingBottom = ${stridePx} + 'px'
  port.scrollTop = port.scrollHeight - port.clientHeight
  await raf()
  const paintDeferredOutOfHandler = flow.style.transform === ''
  flow.style.paddingBottom = '0px'
  flow.style.transform = ''
  port.scrollTop = port.scrollHeight - port.clientHeight
  await sleep(250)

  const visual = [], transforms = [], floorGaps = []
  /* The lag baseline. The transcript column sits inside the port next to the
     composer seat, so the tail's distance to the port's bottom edge at REST is
     -(composer + padding), not 0 — comparing against zero would report the
     composer as lag. The transform is the only thing that moves the content once
     the port is pinned, so (gap - gapAtRest) IS the offset, measured in the DOM
     rather than read back out of the transform string. */
  const gapAtRest = +(pad.getBoundingClientRect().bottom - port.getBoundingClientRect().bottom).toFixed(1)
  let live = true
  const sampler = (async () => {
    while (live) {
      visual.push(+anchor.getBoundingClientRect().top.toFixed(2))
      transforms.push(flow.style.transform)
      floorGaps.push(+(pad.getBoundingClientRect().bottom - port.getBoundingClientRect().bottom - gapAtRest).toFixed(1))
      await raf()
    }
  })()

  /* Continuous streaming, sampled after each pin. (The timing contract itself is
     measured by the isolated paintDeferredOutOfHandler case above, not here.)

     streamFrames marks the frames that belong to the STREAMING phase, because the
     lag assertion below must only look at those: sampling the tail of all frames
     would read the settle window (where the offset is 0 by design) and silently turn
     "the newest line trails by <= one line" into a vacuous pass. That mistake was
     made once here and caught by the metric reporting exactly 0. */
  const streamFrames = []
  for (let i = 0; i < 22; i++) {
    pad.style.height = (${stridePx} * (i + 2)) + 'px'
    port.scrollTop = port.scrollHeight - port.clientHeight
    streamFrames.push(floorGaps.length)
    await sleep(${everyMs})
  }
  /* Wait for the decay to actually reach rest instead of assuming a wall-clock
     window: the loop is frame-driven, so a fixed sleep makes the "transform
     cleared" assertion a race on a loaded machine. Poll it, bounded. */
  for (let i = 0; i < 40 && flow.style.transform !== ''; i++) await sleep(50)
  await sleep(120)
  live = false; await sampler

  const jumps = visual.slice(1).map((v, i) => Math.abs(v - visual[i]))
  const sorted = [...jumps].sort((a, b) => a - b)
  /* Only frames recorded while the stream was still growing: the settle window that
     follows shows a zero offset by construction and would mask the real lag. The
     second half of the streaming phase is used so the exponential has reached its
     steady state. */
  const streamStart = streamFrames.length > 4 ? streamFrames[Math.floor(streamFrames.length / 2)] : 0
  const streamEnd = streamFrames.length > 0 ? streamFrames[streamFrames.length - 1] : floorGaps.length
  const gaps = floorGaps.slice(streamStart, streamEnd + 1)
  const sortedGaps = [...gaps].sort((a, b) => a - b)
  const floorNow = port.scrollHeight - port.clientHeight
  let maxTransform = 0
  for (const t of transforms) {
    if (t === '') continue
    const v = Math.abs(parseFloat(t.replace(/[^0-9.]/g, '')))
    if (v > maxTransform) maxTransform = v
  }
  const result = {
    rawStride: ${stridePx},
    maxStep: +Math.max(...jumps).toFixed(2),
    p95Step: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(2),
    paintDeferredOutOfHandler,
    readBackMaxError: Math.max(...readBackErrors),
    readBacks: readBackErrors.length,
    maxTransform: +maxTransform.toFixed(2),
    transformAtRest: flow.style.transform,
    portState: port.getAttribute('data-endfield-scroll-anim'),
    residualVsFloor: Math.round(proto.get.call(port) - floorNow),
    // How far below the fold the newest content sat while it slid in (the lag the
    // smoothing costs). Measured from the DOM, not from the transform string.
    lagMedianPx: +(sortedGaps[Math.floor(sortedGaps.length / 2)] || 0).toFixed(1),
    lagMaxPx: +Math.max(...gaps).toFixed(1),
  }
  delete port.scrollTop
  pad.remove(); anchor.remove()
  flow.style.transform = ''
  port.scrollTop = port.scrollHeight - port.clientHeight
  __prefs.setField('scrollAnim', '1')
  await sleep(150)
  return result
})()`

;(async () => {
  const browser = await launch()
  try {
    await browser.send('Page.navigate', { url: 'data:text/html,' + encodeURIComponent(HTML) })
    await browser.until('document.getElementById("flow") !== null')
    await browser.evaluate('window.__ModuleLoader__ = { load: (m) => { window.__MOD__ = m } }')
    await browser.evaluate(fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8'))
    const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require('./fixtures/settings-scope.browser.js')
    await browser.evaluate(BROWSER_SETTINGS_SCOPE_SNIPPET + `
      window.__prefs = __endfieldSettingsScope({ enabled:'1', loader:'0', watermark:'0', contour:'0', scrollAnim:'1', scrollAnimLevel:'standard' });
      window.__disposers = [];
      window.__MOD__.factory(() => null).apply({
        get: n => n === 'settingsScope' ? __prefs.binder : n === 'theme' ? { overrideTokens: () => () => {} } : undefined,
        effect: f => { const d = f(); if (typeof d === 'function') __disposers.push(d); return d }
      })`)
    await browser.evaluate(`(() => {
      const flow = document.getElementById('flow')
      for (let i = 0; i < 60; i++) {
        const d = document.createElement('div'); d.className='xz4KEq_flowItem'
        d.textContent = 'seed ' + i + ' ' + 'x'.repeat(180); flow.appendChild(d)
      }
      window.__port = document.querySelector('[data-conversation-scroll]')
      window.__flow = flow
      const p = window.__port; p.scrollTop = p.scrollHeight - p.clientHeight
      return true })()`)
    await browser.sleep(150)

    assert.equal(await browser.evaluate('window.__port.getAttribute("data-endfield-scroll-anim")'), 'idle',
      'the runtime must attach to the conversation scrollport and announce itself')
    console.log('ok    runtime attached to the real scrollport hook')

    /* The negative control first: with the switch OFF the page must show the raw
       hard jump. If this does not reproduce, the fixture cannot credit the ON run
       with removing anything. */
    const off = await browser.evaluate(RUN(96, 60, false))
    const on = await browser.evaluate(RUN(96, 60, true))
    console.log('  control (off): ' + JSON.stringify(off))
    console.log('  feature (on):  ' + JSON.stringify(on))

    assert.equal(off.maxStep, off.rawStride,
      'control: with the feature off, one stride must paint as one hard jump of the full stride')
    assert.equal(off.maxTransform, 0, 'control: nothing may transform the column while the switch is off')
    console.log('ok    negative control: off = the raw ' + off.rawStride + 'px hard jump, no transform')

    assert.ok(on.maxTransform > 5,
      'the feature must actually move the column (max transform ' + on.maxTransform + 'px)')
    assert.ok(on.maxStep < off.maxStep * 0.8,
      'the worst on-screen step must drop well below the raw jump: '
      + on.maxStep + 'px vs ' + off.maxStep + 'px')
    console.log('ok    smoothing: worst on-screen step ' + off.maxStep + 'px -> ' + on.maxStep + 'px')

    /* The compensation must be in place in the SAME rendering frame as the app's
       write — the margin the scroll event buys by firing before rAF and before paint.
       This is what makes the suite able to fail a deferred (`requestAnimationFrame`)
       paint, which otherwise survives here: such a variant measured 224px
       worst-frame-step on a larger fixture while still passing the maxStep bound. */
    assert.equal(on.paintDeferredOutOfHandler, false,
      'the compensation must be applied inside the scroll handler, not deferred to the '
      + 'next frame (an isolated pin from rest left no transform on the frame after it)')
    console.log('ok    timing: the paint lands in the same frame as the pin, not a frame later')

    /* The safety property, and the reason `scroll-behavior: smooth` was rejected:
       the app reads scrollTop straight back after writing it. */
    assert.equal(on.readBackMaxError, 0,
      'the app\'s scrollTop read-back must stay EXACT or the app concludes the reader left and drops follow')
    assert.ok(on.readBacks >= 20, 'the read-back must have been exercised (' + on.readBacks + ' writes)')
    console.log('ok    honest: app read-back error ' + on.readBackMaxError + 'px over '
      + on.readBacks + ' writes — follow intent survives')

    /* Exact rest: no residual transform, and the port back on the app's own floor. */
    assert.equal(on.transformAtRest, '', 'the transform must be cleared once the offset decays')
    assert.equal(on.portState, 'idle', 'the port must report the idle state at rest')
    assert.equal(on.residualVsFloor, 0, 'the port must rest exactly on the app\'s floor')
    console.log('ok    exact: transform cleared and the port rests on the app floor')

    /* The lag the smoothing costs — how far below the fold the newest content sits
       while it slides in. It is NOT free and it is NOT small at a synthetic rate:
       the exponential settles at lag = stride / (1 - e^(-interval/tau)), which for the
       96px/60ms fixture and tau=70ms is ~110px (measured 109.9px, matching the closed
       form). At realistic streaming rates the same tau holds it to a few px.

       So the bound is asserted where it MEANS something: a realistic cadence, not the
       deliberately brutal one this fixture uses for the smoothing numbers. The brutal
       case only has to stay bounded (no runaway), which is what its own assertion
       checks. */
    assert.ok(on.lagMedianPx <= 140,
      'at the brutal synthetic rate the lag must stay bounded, not run away (was ' + on.lagMedianPx + 'px)')
    assert.equal(off.lagMedianPx, 0,
      'control: with the feature off the content must sit exactly where the app put it')
    console.log('ok    lag: ' + on.lagMedianPx + 'px at the synthetic '
      + Math.round(96 / 60 * 1000) + 'px/s (control: ' + off.lagMedianPx + 'px); '
      + 'a realistic cadence is measured separately below')

    /* The number that decides whether this feature is usable: the lag at a REALISTIC
       streaming cadence. One rendered line of body text is ~24px and a fast answer
       adds a line roughly every 250ms (96px/s). The same tau that trails by ~110px at
       the synthetic 1600px/s above must stay inside one line here — if it did not, the
       feature would be hiding the very text being written. */
    const realistic = await browser.evaluate(`(async () => {
      const port = window.__port, flow = window.__flow
      const raf = () => new Promise(r => requestAnimationFrame(() => r()))
      const sleep = (ms) => new Promise(r => setTimeout(r, ms))
      __prefs.setField('scrollAnim', '1')
      flow.style.paddingBottom = '0px'
      port.scrollTop = port.scrollHeight - port.clientHeight
      await sleep(250)
      const tail = document.createElement('div'); tail.className='xz4KEq_flowItem'; tail.textContent='TAIL'
      const pad = document.createElement('div'); pad.style.height = '24px'
      flow.appendChild(tail); flow.appendChild(pad)
      port.scrollTop = port.scrollHeight - port.clientHeight
      /* Two frames BEFORE draining: the scroll event is delivered in the rendering
         steps, not synchronously with the write, so polling for "transform empty"
         immediately exits on the pre-event state and then measures the baseline with
         that pin's offset still on screen. Measured consequence: the baseline was
         9.6px high and every lag sample read ~10px low (even negative), i.e. the
         metric silently lied in the safe-looking direction. */
      await raf(); await raf()
      for (let i = 0; i < 40 && flow.style.transform !== ''; i++) await sleep(50)
      await raf(); await raf()
      const gapAtRest = +(pad.getBoundingClientRect().bottom - port.getBoundingClientRect().bottom).toFixed(1)
      const lags = []
      let live = true
      const sampler = (async () => {
        while (live) {
          lags.push(+(pad.getBoundingClientRect().bottom - port.getBoundingClientRect().bottom - gapAtRest).toFixed(1))
          await raf()
        }
      })()
      // ~1 line every 250ms = ~96px/s, sustained
      for (let i = 0; i < 14; i++) {
        pad.style.height = (24 * (i + 2)) + 'px'
        port.scrollTop = port.scrollHeight - port.clientHeight
        await sleep(250)
      }
      const settled = lags.slice(-30).sort((a, b) => a - b)
      const median = +(settled[Math.floor(settled.length / 2)] || 0).toFixed(1)
      live = false; await sampler
      tail.remove(); pad.remove(); flow.style.paddingBottom = '0px'
      port.scrollTop = port.scrollHeight - port.clientHeight
      return {
        medianLag: median,
        maxLag: +Math.max(...settled).toFixed(1),
        minLag: +Math.min(...settled).toFixed(1),
        gapAtRest: +gapAtRest.toFixed(1),
        samples: settled.length,
      }
    })()`)
    console.log('  realistic rate (96px/s): ' + JSON.stringify(realistic))
    /* Self-validation first. A lag is a POSITIVE distance below the fold: the
       compensation holds content still and lets it glide up, so the newest line can
       never sit above where the app put it. A negative reading therefore means the
       BASELINE was captured while an offset was still on screen, which biases every
       sample and would let a real regression pass as "small lag". This guard exists
       because that exact bug happened here (baseline 9.6px high, every sample ~10px
       low, even negative). */
    assert.ok(realistic.minLag >= -1,
      'the lag metric must never read negative — a negative sample means the baseline was '
      + 'taken mid-decay and the number cannot be trusted (min ' + realistic.minLag + 'px)')
    assert.ok(realistic.medianLag <= 24,
      'at a realistic cadence the newest line must stay within one 24px line of the fold '
      + '(measured ' + realistic.medianLag + 'px)')
    console.log('ok    realistic lag: newest line trailed by ' + realistic.medianLag
      + 'px at 96px/s (inside one line; baseline ' + realistic.gapAtRest + 'px)')

    /* A transform must not inflate the scrollport, or `floor` itself would drift. */
    const inflate = await browser.evaluate(`(async () => {
      const port = window.__port, flow = window.__flow
      const raf = () => new Promise(r => requestAnimationFrame(() => r()))
      const base = port.scrollHeight
      const before = port.scrollHeight - port.clientHeight
      flow.style.transform = 'translateY(240px)'
      await raf(); await raf()
      const during = port.scrollHeight - port.clientHeight
      flow.style.transform = ''
      await raf(); await raf()
      return { dh: port.scrollHeight - base, dFloor: during - before }
    })()`)
    assert.equal(inflate.dh, 0, 'shifting the column must not change scrollHeight (got +' + inflate.dh + ')')
    assert.equal(inflate.dFloor, 0, 'shifting the column must not move the floor (got +' + inflate.dFloor + ')')
    console.log('ok    contained: translateY(240px) left scrollHeight and the floor unchanged')

    /* --- the gates: these must stay instant --- */
    const gates = await browser.evaluate(`(async () => {
      const port = window.__port, flow = window.__flow
      const sleep = (ms) => new Promise(r => setTimeout(r, ms))
      __prefs.setField('scrollAnim', '1')
      const out = {}
      const reset = async () => { flow.style.transform=''; port.scrollTop = port.scrollHeight - port.clientHeight; await sleep(250) }
      /* Grow the content by d px and let the app pin it: the port must END at its
         floor and START d px above it, which is the streaming shape. Setting
         scrollTop while the port is ALREADY pinned clamps to a zero delta and would
         gate-test nothing (an earlier version of this probe did exactly that and
         reported a false failure). */
      const streamStep = async (d) => {
        flow.style.paddingBottom = '0px'
        port.scrollTop = port.scrollHeight - port.clientHeight
        await sleep(250)
        flow.style.paddingBottom = d + 'px'
        port.scrollTop = port.scrollHeight - port.clientHeight
      }

      await reset()
      await streamStep(60)
      await sleep(30)
      out.streamCreatesOffset = flow.style.transform !== ''
      port.dispatchEvent(new WheelEvent('wheel', { deltaY: -60, bubbles: true, cancelable: true }))
      out.wheelCancels = flow.style.transform === ''

      await reset()
      port.scrollTop = port.scrollTop - 120
      await sleep(30)
      out.upwardStaysInstant = flow.style.transform === ''

      /* The reading-position gate, isolated so the wasAtFloor check is the ONLY thing
         that can reject the stride. An earlier version jumped from 700px away, which
         the CAP would have rejected anyway — so deleting the wasAtFloor check still
         passed. Here the reader sits 100px from the floor and the app pins a 250px
         growth: below the 300px cap, downward, and startable from the floor only if
         the port really was at the floor. Removing that check therefore animates a
         reader who was mid-history, which is the harm this gate exists to prevent. */
      await reset()
      const floorNow = port.scrollHeight - port.clientHeight
      port.scrollTop = Math.max(0, floorNow - 100)
      await sleep(250)
      flow.style.paddingBottom = '250px'
      port.scrollTop = port.scrollHeight - port.clientHeight
      await sleep(40)
      out.readingPositionStaysInstant = flow.style.transform === ''
      flow.style.paddingBottom = '0px'

      await reset()
      port.scrollTop = port.scrollTop + 900
      await sleep(30)
      out.oversizeStaysInstant = flow.style.transform === ''

      await reset()
      flow.style.paddingBottom = '0px'
      return out
    })()`)
    console.log('  gates: ' + JSON.stringify(gates))
    assert.equal(gates.streamCreatesOffset, true, 'a streaming stride must create an offset (the gate must not be too tight)')
    assert.equal(gates.wheelCancels, true, 'a wheel gesture must clear an in-flight offset immediately')
    assert.equal(gates.upwardStaysInstant, true, 'upward movement must never be animated')
    assert.equal(gates.readingPositionStaysInstant, true, 'a stride from a reading position must stay instant')
    assert.equal(gates.oversizeStaysInstant, true, 'an oversized navigation stride must stay instant')
    console.log('ok    gates: stream animates; wheel / upward / reading position / navigation stay instant')

    /* THE REPORTED BUG, as a regression test: expanding a reasoning disclosure made the
       transcript spasm.
       A real disclosure (ReasoningRow) is a fixed 24px box while collapsed
       (`contain:size layout`) and mounts a whole markdown body when expanded, so the
       column grows by hundreds of px ABOVE the tail. The app's ResizeObserver re-pins to
       the new floor, and that stride is geometrically identical to a streaming one: it
       starts at the floor, moves down, and can be under the cap. Compensating it added
       the whole growth on top of the layout's own displacement, so the tail was thrown
       down and glided back (measured before the fix: 159.5px of overshoot and a 659ms
       slide home at the default level, against 39.5px for a single frame with the
       feature off).
       The fix makes the runtime MEASURE the layout contribution instead of assuming it
       is zero, so this test asserts the tail ends up where the app put it: no overshoot,
       no offset, and — the other half — streaming must STILL animate, because a gate that
       simply switched the feature off for any resize would pass this test alone. */
    const expand = await browser.evaluate(`(async () => {
      const port = window.__port, flow = window.__flow
      const raf = () => new Promise(r => requestAnimationFrame(() => r()))
      const sleep = (ms) => new Promise(r => setTimeout(r, ms))
      const measure = async (animate) => {
        __prefs.setField('scrollAnim', animate ? '1' : '0')
        await sleep(200)
        flow.innerHTML = ''; flow.style.transform = ''; flow.style.paddingBottom = '0px'
        for (let i = 0; i < 24; i++) {
          const d = document.createElement('div'); d.className = 'xz4KEq_flowItem'
          d.textContent = 'answer ' + i + ' ' + 'x'.repeat(110); flow.appendChild(d)
        }
        /* ReasoningRow: 24px collapsed box, whole body mounted on expansion. */
        const reason = document.createElement('div')
        reason.className = 'xz4KEq_flowItem'
        reason.style.cssText = 'height:24px;overflow:hidden'
        reason.innerHTML = '<div>▸ thinking</div><div class="body"></div>'
        const body = reason.querySelector('.body')
        for (let i = 0; i < 8; i++) {
          const p = document.createElement('div'); p.textContent = 'thinking ' + i + ' ' + 'y'.repeat(60)
          body.appendChild(p)
        }
        flow.appendChild(reason)
        const tail = document.createElement('div'); tail.className = 'xz4KEq_flowItem'; tail.textContent = 'TAIL'
        flow.appendChild(tail)
        port.scrollTop = port.scrollHeight - port.clientHeight
        await sleep(300)

        /* The app's own re-pin on resize, which is what drives this in production. */
        let following = true
        const follow = () => {
          const floor = Math.max(0, port.scrollHeight - port.clientHeight)
          if (port.scrollTop !== floor) port.scrollTop = floor
          following = floor - port.scrollTop <= 25
        }
        const ro = new ResizeObserver(() => { if (following) follow() })
        ro.observe(flow)

        const atRest = tail.getBoundingClientRect().top
        const samples = []
        let live = true
        const sampler = (async () => {
          while (live) {
            samples.push({
              d: +(tail.getBoundingClientRect().top - atRest).toFixed(1),
              tf: flow.style.transform === '' ? 0 : +parseFloat(flow.style.transform.replace(/[^0-9.-]/g, '')).toFixed(1),
            })
            await raf()
          }
        })()
        /* Expand: the box stops clipping and the body lays out. */
        reason.style.height = 'auto'
        await raf(); await raf()
        await sleep(700)
        live = false; await sampler
        ro.disconnect()
        flow.style.transform = ''
        return {
          grow: Math.round(reason.getBoundingClientRect().height),
          overshoot: +Math.max(...samples.map((s) => Math.abs(s.d))).toFixed(1),
          glideFrames: samples.filter((s) => s.tf !== 0).length,
          maxTransform: +Math.max(...samples.map((s) => Math.abs(s.tf))).toFixed(1),
        }
      }
      return { off: await measure(false), on: await measure(true) }
    })()`)
    console.log('  expand: ' + JSON.stringify(expand))
    assert.ok(expand.off.grow > 100,
      'the expansion must actually grow the column (fixture grew ' + expand.off.grow + 'px)')
    assert.ok(expand.on.overshoot <= expand.off.overshoot + 2,
      'expanding a disclosure must not displace the transcript more than the app itself does '
      + '(' + expand.on.overshoot + 'px vs ' + expand.off.overshoot + 'px with the feature off)')
    assert.equal(expand.on.maxTransform, 0,
      'an expansion must not be animated — its stride is a reflow, not growth')
    console.log('ok    expand: disclosure expansion stays instant (overshoot '
      + expand.on.overshoot + 'px vs ' + expand.off.overshoot + 'px off; no transform)')

    /* Reduced motion overrides the switch, like the contour sheet and the thunder
       plate — the OS preference is read live, not cached. */
    const reduced = await browser.evaluate(`(async () => {
      const port = window.__port, flow = window.__flow
      const sleep = (ms) => new Promise(r => setTimeout(r, ms))
      window.__mmReal = window.matchMedia
      window.matchMedia = (q) => q.indexOf('reduced-motion') !== -1
        ? { matches: true, addEventListener() {}, removeEventListener() {} }
        : window.__mmReal(q)
      __prefs.setField('scrollAnim', '1')
      flow.style.transform = ''
      port.scrollTop = port.scrollHeight - port.clientHeight
      await sleep(300)
      port.scrollTop = port.scrollTop + 60
      await sleep(50)
      const inert = flow.style.transform === ''
      window.matchMedia = window.__mmReal
      return inert
    })()`)
    assert.equal(reduced, true, 'prefers-reduced-motion must disable the compensation even with the switch on')
    console.log('ok    prefers-reduced-motion overrides the switch')

    /* Leaving the theme / switching the feature off must release the offset: an
       orphaned transform would shift the transcript for the rest of the session. */
    const off2 = await browser.evaluate(`(async () => {
      const port = window.__port, flow = window.__flow
      const sleep = (ms) => new Promise(r => setTimeout(r, ms))
      __prefs.setField('scrollAnim', '1')
      flow.style.paddingBottom = '0px'
      port.scrollTop = port.scrollHeight - port.clientHeight
      await sleep(200)
      /* Grow then pin — the streaming shape. Writing scrollTop on an already-pinned
         port clamps to a zero delta, which would leave nothing to release. */
      flow.style.paddingBottom = '80px'
      port.scrollTop = port.scrollHeight - port.clientHeight
      await sleep(30)
      const active = flow.style.transform !== ''
      __prefs.setField('scrollAnim', '0')
      await sleep(120)
      const released = flow.style.transform === ''
      const floor = port.scrollHeight - port.clientHeight
      port.scrollTop = port.scrollTop + 60
      await sleep(60)
      const inert = flow.style.transform === ''
      flow.style.paddingBottom = '0px'
      const attr = port.getAttribute('data-endfield-scroll-anim')
      port.scrollTop = port.scrollHeight - port.clientHeight
      return { active, released, inert, attr, floorDelta: Math.round(port.scrollTop - floor) }
    })()`)
    assert.equal(off2.active, true, 'the offset must exist before the switch is flipped')
    assert.equal(off2.released, true, 'switching the feature off must release the offset immediately')
    assert.equal(off2.inert, true, 'and it must stay inert afterwards')
    assert.equal(off2.attr, null, 'the port hook must be removed when the feature is off')
    console.log('ok    switching off releases the offset and removes the hook')

    /* A React re-render can replace the column, and a session switch can replace the
       whole port. Both must keep working, and the OLD column must be left with no
       transform — a leftover translateY on a detached-then-reused node would shift
       the transcript for the rest of the session with nothing on screen to explain
       it. The observer hook is exercised directly because that is what the page
       calls on every mutation batch. */
    const replaced = await browser.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms))
      __prefs.setField('scrollAnim', '1')
      const port = window.__port
      await sleep(150)

      // 1. replace the COLUMN inside the same port
      const oldFlow = window.__flow
      const frame = oldFlow.parentElement
      const newFlow = document.createElement('div')
      newFlow.className = 'xz4KEq_column'; newFlow.setAttribute('data-chat-flow', '')
      for (let i = 0; i < 60; i++) {
        const d = document.createElement('div'); d.className='xz4KEq_flowItem'
        d.textContent = 'reseed ' + i + ' ' + 'x'.repeat(180); newFlow.appendChild(d)
      }
      frame.replaceChild(newFlow, oldFlow)
      window.__flow = newFlow
      port.scrollTop = port.scrollHeight - port.clientHeight
      await sleep(150)
      newFlow.style.paddingBottom = '0px'
      port.scrollTop = port.scrollHeight - port.clientHeight
      await sleep(250)
      newFlow.style.paddingBottom = '90px'
      port.scrollTop = port.scrollHeight - port.clientHeight
      await sleep(40)
      const worksOnNewColumn = newFlow.style.transform !== ''

      // 2. replace the whole PORT (session switch). No manual tick: the theme's real
      //    MutationObserver on document.body is what notices this on the live page,
      //    so driving the actual replacement is the honest test of that path.
      const oldPort = window.__port
      /* Reset the growth pad and any transform BEFORE cloning: step 1 left the column
         padded by 90px, the clone inherits that, and re-applying the same 90px would
         produce a ZERO stride — which the gate correctly ignores, so the runtime would
         be blamed for a fixture that never grew. (Both this and the scrollTop reset
         below were real false failures of an earlier version of this test.) */
      window.__flow.style.paddingBottom = '0px'
      window.__flow.style.transform = ''
      oldPort.scrollTop = oldPort.scrollHeight - oldPort.clientHeight
      await sleep(200)
      const newPort = oldPort.cloneNode(true)
      newPort.removeAttribute('data-endfield-scroll-anim')
      oldPort.parentNode.replaceChild(newPort, oldPort)
      window.__port = newPort
      window.__flow = newPort.querySelector('[data-chat-flow]')
      await sleep(250)
      const attachedToNewPort = newPort.getAttribute('data-endfield-scroll-anim') !== null
      const oldPortClean = oldPort.getAttribute('data-endfield-scroll-anim') === null
        && oldPort.querySelector('[data-chat-flow]').style.transform === ''

      /* cloneNode starts a fresh element at scrollTop 0, which is NOT the streaming
         position — so the port is pinned to its floor first, exactly as the app
         leaves it between two growth steps. */
      newPort.scrollTop = newPort.scrollHeight - newPort.clientHeight
      await sleep(250)
      window.__flow.style.paddingBottom = '90px'
      newPort.scrollTop = newPort.scrollHeight - newPort.clientHeight
      await sleep(40)
      const worksOnNewPort = window.__flow.style.transform !== ''
      window.__flow.style.paddingBottom = '0px'

      newPort.style.paddingBottom = ''
      window.__flow.style.paddingBottom = '0px'
      return { worksOnNewColumn, attachedToNewPort, oldPortClean, worksOnNewPort }
    })()`)
    assert.equal(replaced.worksOnNewColumn, true, 'a replaced transcript column must still be animated')
    assert.equal(replaced.attachedToNewPort, true, 'a replaced scrollport must be picked up by the page observer')
    assert.equal(replaced.oldPortClean, true, 'the old port must be left with no hook and no transform')
    assert.equal(replaced.worksOnNewPort, true, 'the new scrollport must animate')
    console.log('ok    replaces survive: column swap, port swap, and the old port is left clean')

    /* A second scrollport (the embedded ConversationRoot variant) must attach too —
       this is what the removed O(1) early-return used to prevent. */
    const multi = await browser.evaluate(`(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms))
      __prefs.setField('scrollAnim', '1')
      const first = window.__port
      const extra = document.createElement('div')
      extra.setAttribute('data-conversation-scroll', '')
      extra.style.cssText = 'height:200px;overflow-y:auto'
      const flow2 = document.createElement('div')
      flow2.className = 'xz4KEq_column'; flow2.setAttribute('data-chat-flow', '')
      for (let i = 0; i < 40; i++) {
        const d = document.createElement('div'); d.className='xz4KEq_flowItem'
        d.textContent = 'second ' + i; flow2.appendChild(d)
      }
      extra.appendChild(flow2)
      document.body.appendChild(extra)
      await sleep(250)
      const bothAttached = first.getAttribute('data-endfield-scroll-anim') !== null
        && extra.getAttribute('data-endfield-scroll-anim') !== null
      extra.scrollTop = extra.scrollHeight - extra.clientHeight
      await sleep(200)
      flow2.style.paddingBottom = '70px'
      extra.scrollTop = extra.scrollHeight - extra.clientHeight
      await sleep(40)
      const secondAnimates = flow2.style.transform !== ''
      extra.remove()
      await sleep(250)
      const removedCleanly = extra.getAttribute('data-endfield-scroll-anim') === null
      return { bothAttached, secondAnimates, removedCleanly }
    })()`)
    assert.equal(multi.bothAttached, true, 'a second scrollport must attach while the first is healthy')
    assert.equal(multi.secondAnimates, true, 'the second scrollport must animate independently')
    assert.equal(multi.removedCleanly, true, 'a removed scrollport must be detached')
    console.log('ok    multiple scrollports: the second attaches, animates, and detaches on removal')

    assert.deepEqual(browser.errors, [], 'the page must report no errors')
    console.log('')
    console.log('all output-scroll animation checks passed')
  } finally {
    await browser.close()
  }
})().catch((e) => { console.error('FAIL  ' + (e && e.message ? e.message : e)); process.exit(1) })
