/**
 * band-enter-motion.test.js — the confirmation band's entrance, traced off the
 * reference teardown in ~/WorkBuddy/2026-11-13-21-56-57 (a 104-frame, 30fps
 * capture of this exact dialog opening and closing).
 *
 * WHAT THE REFERENCE MEASURED, and what this test pins:
 *
 *   band   130ms  the leading edge sweeps right -> left. The 5-frame capture of
 *                 the second open reads 10% / 17% / 55% / 97% / 100%, i.e. 40%
 *                 of the time covers 17% of the distance — easeInOutCubic, NOT
 *                 the usual ease-out. Asserted here as: at the halfway mark the
 *                 band is within ±6% of half-way, and at 33ms it has moved less
 *                 than a fifth.
 *   fade   170ms  the panel's own opacity (22% -> 53% -> 100% across the wipe),
 *                 so the leading edge never reads as bare paper.
 *   copy   100ms  delayed to 195ms = the 130ms wipe plus the reference's 65ms
 *                 beat. OPACITY ONLY — the source's title centroid never moves,
 *                 so no translate/scale/blur may creep in.
 *   idle   none   no breathing, no float, no sweep: after 295ms everything is
 *                 at rest and nothing is pinned (no fill mode).
 *
 * HOW IT MEASURES. The animations are paused the instant the dialog mounts and
 * stepped with `currentTime`, so every number below is the real computed value
 * from the shipped client.js at a chosen instant — no sleeps, no race with the
 * 30fps sampling that limited the source video, and no screenshot needed.
 *
 * Geometry note: the wipe is a translateX, not a clip-path. clip-path/mask would
 * also clip the band's drop-shadow (filter paints before clipping), so the band
 * is moved instead — legal because it is exactly viewport-wide, which makes
 * "translate 100% -> 0" paint the identical right-anchored wipe.
 *
 * Usage: node test/band-enter-motion.test.js
 */
const assert = require('node:assert/strict'), path = require('node:path')
const { launch, boot } = require('./fixtures/chrome-cdp.js')
const root = path.resolve(__dirname, '..')

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{height:100%;margin:0;background:#101110}
body{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-bg-layer-1:#f2f2ec;--dsw-alias-label-primary:#101110;
--dsw-alias-border-l1:#ccc;--dsw-alias-border-l2:#aaa;--dsw-alias-bg-mask-1:rgba(0,0,0,.24);
--dsw-radius-panel:12px;--dsw-elevation-prominent:none;--dsw-mask-blur:none;
--ds-transition-duration:200ms;--ds-ease-in-out:ease}
button{font:700 14px/1 Arial,sans-serif;display:inline-flex;align-items:center;justify-content:center;
border:0;cursor:pointer;background:transparent;color:inherit}
[role='dialog']{width:100%;background:#fff;color:#101110;padding:20px}
.k_content{display:flex;flex-direction:column;gap:12px}
</style></head><body><div id="host"></div>
<template id="tpl"><div role="presentation" class="k_root"><div class="k_mask" aria-hidden="true"></div>
  <div role="dialog" class="k_dialog k_confirmation" id="dlg">
    <div class="k_content" id="content">
      <div class="k_header"><span class="k_title">确认启用完全权限？</span></div>
      <div class="k_body">启用后减少确认步骤。</div>
      <div class="k_footer"><button class="k_modalAction">取消</button><button class="k_confirmAction">启用完全权限</button></div>
    </div>
  </div>
</div></template></body></html>`

/* Mount a fresh copy and freeze it at t=0 in the same task, so the 130ms
   animation cannot finish before it is paused. */
const MOUNT = `(() => {
  const host = document.getElementById('host')
  host.innerHTML = ''
  host.appendChild(document.getElementById('tpl').content.cloneNode(true))
  document.getAnimations().forEach(a => a.pause())
  return document.getAnimations().length
})()`

const STEP = t => `(() => {
  document.getAnimations().forEach(a => { a.currentTime = ${t} })
  const dlg = document.getElementById('dlg'), content = document.getElementById('content')
  const r = dlg.getBoundingClientRect()
  return {
    left: Math.round(r.left),
    width: Math.round(r.width),
    opacity: +getComputedStyle(dlg).opacity,
    copy: +getComputedStyle(content).opacity,
    transform: getComputedStyle(dlg).transform,
    contentTransform: getComputedStyle(content).transform
  }
})()`

;(async () => {
  const browser = await launch()
  try {
    await boot(browser, root, {}, '', { html: PAGE, ready: '#host' })

    /* 1. The three curves exist, with the reference's timings. */
    const count = await browser.evaluate(MOUNT)
    assert.equal(count, 3, 'the dialog must run exactly three animations (wipe, fade, copy), got ' + count)

    const timings = await browser.evaluate(`(() => {
      const split = str => { const out = []; let d = 0, cur = ''
        for (const ch of str) { if (ch === '(') d++; if (ch === ')') d--
          if (ch === ',' && d === 0) { out.push(cur.trim()); cur = '' } else cur += ch }
        out.push(cur.trim()); return out }
      const read = el => {
        const c = getComputedStyle(el)
        const names = split(c.animationName), dur = split(c.animationDuration),
              delay = split(c.animationDelay), ease = split(c.animationTimingFunction),
              fill = split(c.animationFillMode)
        return names.map((name, i) => ({ name: name, duration: parseFloat(dur[i]) * 1000,
          delay: parseFloat(delay[i]) * 1000, easing: ease[i], fill: fill[i] }))
      }
      return { band: read(document.getElementById('dlg')), copy: read(document.getElementById('content')) }
    })()`)

    const band = Object.fromEntries(timings.band.map(a => [a.name, a]))
    const copy = timings.copy.find(a => a.name === 'endfield-band-copy')
    assert.deepEqual(Object.keys(band).sort(), ['endfield-band-fade', 'endfield-band-wipe'])
    assert.equal(band['endfield-band-wipe'].duration, 130, 'wipe duration')
    assert.equal(band['endfield-band-wipe'].easing, 'cubic-bezier(0.65, 0, 0.35, 1)', 'wipe easing (easeInOutCubic)')
    assert.equal(band['endfield-band-fade'].duration, 170, 'band fade duration')
    assert.equal(band['endfield-band-fade'].easing, 'cubic-bezier(0.3, 0.7, 0.4, 1)', 'band fade easing')
    assert.ok(copy, 'the content must carry its own fade')
    assert.equal(copy.duration, 100, 'copy fade duration')
    assert.equal(copy.delay, 195, 'copy delay = 130ms wipe + the reference 65ms beat')
    assert.equal(copy.easing, 'ease-out')
    assert.equal(copy.fill, 'backwards', 'copy must be hidden during its beat, but nothing may stay pinned afterwards')
    assert.equal(band['endfield-band-wipe'].fill, 'none', 'the wipe must not stay pinned after the run')

    /* 2. The wipe really is right-anchored and hard-edged: at t=0 the band sits
          entirely to the right of the viewport, at 130ms it is flush. */
    const at0 = await browser.evaluate(STEP(0))
    assert.equal(at0.left, at0.width, 't=0: the band must start fully off-screen to the RIGHT')
    assert.equal(at0.opacity, 0, 't=0: the band starts invisible')
    assert.equal(at0.copy, 0, 't=0: the copy starts invisible')

    const at65 = await browser.evaluate(STEP(65))
    const progress = 1 - at65.left / at65.width
    assert.ok(Math.abs(progress - 0.5) < 0.06,
      't=65 (half the wipe): the edge must be mid-way, measured ' + (progress * 100).toFixed(1) + '%')

    const at33 = await browser.evaluate(STEP(33))
    const early = 1 - at33.left / at33.width
    assert.ok(early < 0.2, 't=33: the curve is slow-start — only ' + (early * 100).toFixed(1) + '% of the distance')
    assert.ok(at33.opacity > 0.3, 't=33: the panel is already coming up (' + at33.opacity + ')')

    const at130 = await browser.evaluate(STEP(130))
    assert.equal(at130.left, 0, 't=130: the band lands flush')
    assert.ok(at130.opacity > 0.95, 't=130: the fade has all but finished (' + at130.opacity + ')')
    assert.equal(at130.copy, 0, 't=130: the band lands as blank paper — copy still at 0')

    /* 3. The copy beat: still blank at 195, part-way at 245, done at 295, and
          pure opacity — the reference measured a title centroid that never
          moves, so any transform here would be a regression. */
    const at195 = await browser.evaluate(STEP(195))
    assert.equal(at195.copy, 0, 't=195: the 65ms beat is not over yet')
    const at245 = await browser.evaluate(STEP(245))
    assert.ok(at245.copy > 0.4 && at245.copy < 0.95, 't=245: copy mid-fade, got ' + at245.copy)
    assert.equal(at245.contentTransform, 'none', 'the copy must fade in place, not move')
    const at295 = await browser.evaluate(STEP(295))
    assert.equal(at295.copy, 1, 't=295: copy landed')

    /* 4. Nothing is pinned once the run is over: a lingering transform would
          keep the dialog a containing block for fixed descendants (#41's
          lesson), and a lingering opacity would fight the app. */
    const settled = await browser.evaluate(`(async () => {
      document.getAnimations().forEach(a => a.play())
      await new Promise(r => setTimeout(r, 450))
      const dlg = document.getElementById('dlg')
      return { transform: getComputedStyle(dlg).transform, opacity: getComputedStyle(dlg).opacity,
               animations: dlg.getAnimations().length }
    })()`)
    assert.equal(settled.transform, 'none', 'after the run the dialog must carry no transform')
    assert.equal(settled.opacity, '1')
    assert.equal(settled.animations, 0, 'finished animations must not stay attached')

    /* 5. Reduced motion opts out of the whole thing (the app parks its own
          _modalEnter the same way). */
    await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    const reduced = await browser.evaluate(`(() => {
      ${MOUNT}
      const dlg = document.getElementById('dlg'), content = document.getElementById('content')
      return { animations: document.getAnimations().length,
               transform: getComputedStyle(dlg).transform,
               copy: getComputedStyle(content).opacity }
    })()`)
    assert.equal(reduced.animations, 0, 'reduced motion: no animations at all')
    assert.equal(reduced.transform, 'none')
    assert.equal(reduced.copy, '1', 'reduced motion: copy is simply there')

    assert.deepEqual(browser.errors, [])
    console.log('PASS: band entrance — 130ms right-anchored wipe (easeInOutCubic) + 170ms fade + 100ms copy at +195ms, nothing pinned, reduced motion opts out')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
