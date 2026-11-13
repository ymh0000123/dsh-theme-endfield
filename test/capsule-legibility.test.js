/**
 * capsule-legibility.test.js — the HUD capsule's two marks have to survive 1x.
 *
 * WHAT WAS WRONG. Both marks were built out of layers thinner than a pixel at
 * 100% zoom, and both failed the same way the typed ◎ did on the confirm
 * capsules: the shape painted, and the eye read a smudge.
 *   icon   a 10px paper square with a 2px ink ring and a 3px paper core. At 1x
 *          the core is 3 pixels of white inside 2 pixels of ink — measured on a
 *          user's screenshot as a white blob with one dot in it.
 *   dial   a 12px accent face carrying a 1.5x3px needle: a 1px-wide hand that
 *          reads as a speck, and an accent ring swept from 12 o'clock with NO
 *          track, so 「低谷已过6%」 showed 21.6deg of arc floating on the dark
 *          disc — indistinguishable from a stray tick.
 *
 * THE FIX. Icon 12px (2px frame / 2px ring / 4px core, all even numbers so the
 * bands land on whole device pixels), face 14px, needle 2x5px, and the ring
 * keeps a 14%-white track so the sweep reads as a progress arc on a dial rather
 * than a lone tick.
 *
 * WHAT THIS PINS. The numbers are only half of it, so the test does both:
 *   1. computed geometry — every mark above its rasterisation floor;
 *   2. the icon's ACTUAL PIXELS — the centre row is captured and its light/dark
 *      run lengths must come out 2/2/4/2/2 (in CSS px, whatever the DPR). That
 *      is the difference between "three nested squares exist" and "three nested
 *      squares are visible".
 *
 * Usage: node test/capsule-legibility.test.js
 */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { launch, boot } = require('./fixtures/chrome-cdp.js')
const root = path.resolve(__dirname, '..')

/* The markup the plugin actually builds — sliced out of the bundle exactly the
   way balance-capsule.test.js does it, so this probe cannot drift from it. */
const MARKUP = (() => {
  const src = fs.readFileSync(path.join(root, 'client.js'), 'utf8')
  const anchor = src.indexOf("el.setAttribute('data-endfield-balance', '')")
  const start = src.indexOf('el.innerHTML =', anchor)
  const end = src.indexOf('document.body.appendChild(el)', start)
  const snippet = src.slice(start, end).replace('el.innerHTML =', 'const __html =')
  return new Function(snippet + '\nreturn __html')()
})()

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#0d0e0d}
</style></head><body><div id="host"></div></body></html>`

const MOUNT = `(() => {
  const el = document.createElement('div')
  el.setAttribute('data-endfield-balance', '')
  el.style.setProperty('--endfield-balance-sweep', '21.6deg')
  el.innerHTML = ${JSON.stringify(MARKUP)}
  document.getElementById('host').appendChild(el)
  const q = s => el.querySelector(s)
  q('[data-endfield-balance-int]').textContent = '2'
  q('[data-endfield-balance-frac]').textContent = '.83'
  q('[data-endfield-balance-phase]').textContent = '低谷'
  q('[data-endfield-balance-pct]').textContent = '低谷已过6%'
  return true
})()`

const GEOMETRY = `(() => {
  const cs = (sel, p) => getComputedStyle(document.querySelector(sel), p || null)
  const px = v => parseFloat(v)
  const icon = cs('[data-endfield-balance-icon]')
  const ring = cs('[data-endfield-balance-ring]')
  const face = cs('[data-endfield-balance-clock]')
  const needle = cs('[data-endfield-balance-clock]', '::after')
  return {
    icon: { w: px(icon.width), h: px(icon.height), radius: px(icon.borderRadius) },
    before: { inset: px(cs('[data-endfield-balance-icon]', '::before').top) },
    after: { inset: px(cs('[data-endfield-balance-icon]', '::after').top) },
    face: { w: px(face.width), h: px(face.height), colour: face.backgroundColor },
    needle: { w: px(needle.width), h: px(needle.height), colour: needle.backgroundColor },
    ringTrack: ring.backgroundImage,
    accent: getComputedStyle(document.body).getPropertyValue('--edge-accent').trim()
  }
})()`

/* Run-length of the icon's centre row, normalised to CSS px. */
const PROFILE = base64 => `(async () => {
  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + ${JSON.stringify(base64)} })
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  const at = (x, y) => { const i = ((y | 0) * c.width + (x | 0)) * 4; return [d[i], d[i+1], d[i+2]] }
  const y = (c.height / 2) | 0
  const runs = []
  for (let x = 0; x < c.width; x++) {
    const [r, g, b] = at(x, y)
    const light = (r + g + b) / 3 > 150
    if (runs.length && runs[runs.length - 1].light === light) runs[runs.length - 1].n++
    else runs.push({ light: light, n: 1 })
  }
  const scale = c.width / 12
  return { runs: runs.map(r => ({ light: r.light, css: r.n / scale })), scale: scale, width: c.width }
})()`

;(async () => {
  const browser = await launch()
  try {
    await boot(browser, root, {}, '', { html: PAGE, ready: '#host' })
    await browser.evaluate(MOUNT)
    await browser.sleep(200)

    /* 1. Geometry: every band above the floor where a 1x rasteriser can resolve
          it. Even numbers on purpose — a 1.5px ring lands on half pixels and
          greys out instead of drawing a line. */
    const g = await browser.evaluate(GEOMETRY)
    assert.equal(g.icon.w, 12, 'the square mark must be 12px, got ' + g.icon.w)
    assert.equal(g.icon.h, 12)
    assert.equal(g.before.inset, 2, 'ink ring inset must be 2px (8px ink box)')
    assert.equal(g.after.inset, 4, 'paper core inset must be 4px (4px core)')
    assert.equal(g.icon.w - 2 * g.before.inset, 8, 'ink ring box = 8px')
    assert.equal(g.icon.w - 2 * g.after.inset, 4, 'paper core = 4px')

    assert.equal(g.face.w, 14, 'the clock face must be 14px, got ' + g.face.w)
    assert.ok(g.needle.w >= 2, 'the needle must be at least 2px wide, got ' + g.needle.w)
    assert.ok(g.needle.h >= 5, 'the needle must reach 5px off centre, got ' + g.needle.h)

    /* 2. The ring keeps a track, so a 6% sweep reads as a dial instead of a
          floating tick. The sweep itself still arrives through one custom
          property (pinned by balance-capsule.test.js). */
    assert.match(g.ringTrack, /conic-gradient/, 'the ring must stay a conic gradient')
    assert.match(g.ringTrack, /rgba\(255, 255, 255, 0\.14\)/, 'the ring needs an unfilled track')
    assert.match(g.ringTrack, /21\.6deg/, 'the sweep must come from --endfield-balance-sweep')

    /* 3. Pixels: 2px paper / 2px ink / 4px paper / 2px ink / 2px paper across the
          mark's centre row — the executable form of "the three layers are
          visible", not merely present. */
    const box = JSON.parse(await browser.evaluate(
      "JSON.stringify(document.querySelector('[data-endfield-balance-icon]').getBoundingClientRect().toJSON())"))
    const shot = await browser.send('Page.captureScreenshot', {
      format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 }
    })
    const p = await browser.evaluate(PROFILE(shot.data))
    const bands = p.runs.filter(r => r.css > 0.5).map(r => (r.light ? 'L' : 'D') + r.css.toFixed(1))
    assert.equal(p.runs.length, 5, 'expected exactly five bands across the mark, got ' + bands.join(' '))
    assert.deepEqual(p.runs.map(r => r.light), [true, false, true, false, true],
      'the mark must read paper / ink / paper / ink / paper, got ' + bands.join(' '))
    const want = [2, 2, 4, 2, 2]
    p.runs.forEach((r, i) => {
      assert.ok(Math.abs(r.css - want[i]) <= 0.7,
        'band ' + i + ' must be ~' + want[i] + 'px, measured ' + r.css.toFixed(2) + 'px (' + bands.join(' ') + ')')
    })

    assert.deepEqual(browser.errors, [])
    console.log('PASS: capsule marks — 12px mark reads 2/2/4/2/2 on screen; 14px dial face, 2x5 needle, ring track present')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
