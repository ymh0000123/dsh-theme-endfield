/**
 * confirm-disc-target.test.js — the trailing mark on the two confirm capsules
 * (「允许一次」 in the approval band, 「启用完全权限」 in the risk dialog) was a
 * TYPED glyph: content:'◎' at font-size 11px inside a 20px ink disc.
 *
 * WHY THAT BROKE. U+25CE is a ring with a dot. At 11px the ring's counter closes
 * up while rasterising, so the mark ships as a solid accent blob sitting slightly
 * off-centre in the disc — reproduced in headless Chrome at 11 AND 13px. The ✕
 * beside it stayed crisp because it is two strokes, not a closed ring. A glyph
 * also depends on which fallback font resolves U+25CE: the theme's stack leads
 * with Arial, which does not carry it, so the host's CJK fallback decides what
 * the icon looks like.
 *
 * THE FIX. The disc keeps its 20px box and ink fill; the target is drawn with two
 * radial gradients (accent dot r 2.4 + accent ring r 5.6..7.6, ink showing through
 * the gap). No font is involved at any DPI.
 *
 * WHAT THIS TEST DOES. It boots the real client.js over a fixture shaped like the
 * app's dialog, then proves the mark by MEASURING PIXELS: the button is captured
 * through CDP, decoded into a canvas in-page, the disc is located by its exact ink
 * fill (28,27,25 — distinct from the label's #101110), and four radial samples
 * assert accent/dark/accent from the centre outward in all four directions. A
 * structural assertion runs first (no glyph content, two gradient layers), so a
 * revert to content:'◎' fails at the cause, not only at the symptom.
 *
 * The band variant is mounted after the capture: [data-approval-key] is a
 * position:fixed full-viewport layer, so it would sit on top of the dialog and
 * poison the screenshot. It shares the same background rule and gets the same
 * structural assertions.
 *
 * Usage: node test/confirm-disc-target.test.js
 */
const assert = require('node:assert/strict'), path = require('node:path')
const { launch, boot } = require('./fixtures/chrome-cdp.js')
const root = path.resolve(__dirname, '..')

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{height:100%;margin:0;background:#101110}
body{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-bg-layer-1:#f2f2ec;--dsw-alias-label-primary:#101110;
--dsw-alias-border-l1:#ccc;--dsw-alias-border-l2:#aaa;--dsw-alias-bg-overlay:#f2f2ec}
button{font:700 14px/1 Arial,sans-serif;display:inline-flex;align-items:center;justify-content:center;
border:0;cursor:pointer;background:transparent;color:inherit}
[role='dialog']{margin:60px auto;width:820px;background:#f2f2ec;color:#101110;padding:24px 32px}
.q_footer{display:flex;gap:28px;justify-content:center;padding:16px 0 4px}
</style></head><body>
<div role="presentation"><div role="dialog" class="k9Kq2_confirmation">
  <div class="k9Kq2_header"><span class="k9Kq2_title">确认启用完全权限？</span></div>
  <div class="k9Kq2_body">启用完全权限后，智能体将减少确认步骤。</div>
  <div class="q_footer">
    <button class="k9Kq2_modalAction" id="deny">取消</button>
    <button class="k9Kq2_confirmAction" id="allow">启用完全权限</button>
  </div>
</div></div></body></html>`

const STYLE = `(() => {
  const css = (el, p) => getComputedStyle(el, p || null)
  const after = id => css(document.getElementById(id), '::after')
  return {
    deny: { content: after('deny').content, image: after('deny').backgroundImage },
    allow: {
      content: after('allow').content,
      image: after('allow').backgroundImage,
      fill: after('allow').backgroundColor,
      color: after('allow').color
    }
  }
})()`

const SAMPLE = base64 => `(async () => {
  const img = new Image()
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + ${JSON.stringify(base64)} })
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  const at = (x, y) => { const i = ((y | 0) * c.width + (x | 0)) * 4; return [d[i], d[i + 1], d[i + 2]] }

  /* Locate the disc by its ink fill. The label is #101110 and the button is
     accent, so (28,27,25) belongs to the disc base and nothing else. Tolerant
     by ±5 so display colour management cannot strand the test. */
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, count = 0
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const [r, g, b] = at(x, y)
      if (Math.abs(r - 28) <= 5 && Math.abs(g - 27) <= 5 && Math.abs(b - 25) <= 5) {
        count++
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
    }
  }
  if (count < 80) return { error: 'no disc found', count: count }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const scale = (maxX - minX + 1) / 20                             /* device px per CSS px */
  const ring = r => [at(cx + r * scale, cy), at(cx - r * scale, cy), at(cx, cy - r * scale), at(cx, cy + r * scale)]
  return {
    count: count,
    box: [maxX - minX + 1, maxY - minY + 1],
    width: img.width, height: img.height,
    centre: at(cx, cy),
    gap: ring(4),
    target: ring(6.6),
    scale: scale
  }
})()`

const accent = c => c[0] > 200 && c[1] > 180 && c[2] < 130
const ink = c => Math.max(c[0], c[1], c[2]) < 70

;(async () => {
  const browser = await launch()
  try {
    await boot(browser, root, {}, '', { html: PAGE, ready: '#allow' })
    /* The band now enters with a 130ms right-to-left wipe (see
       band-enter-motion.test.js). A capture taken mid-slide finds the button
       outside the frame, so let the entrance land before measuring anything. */
    await browser.evaluate('Promise.all(document.getAnimations().map(a => a.finished)).then(() => true)')

    /* 1. Cause: no glyph, and the target is two gradients on the ink disc. */
    const style = await browser.evaluate(STYLE)
    assert.equal(style.allow.content, '""', 'the 允许 capsule must not paint a text glyph')
    assert.equal((style.allow.image.match(/radial-gradient/g) || []).length, 2,
      'the target is two radial gradients (dot + ring), got: ' + style.allow.image)
    assert.equal(style.allow.fill, 'rgb(28, 27, 25)', 'the disc ink must remain the background-colour base layer')
    assert.ok(accent(style.allow.color.match(/\d+/g).map(Number)),
      'the drawn mark must take the accent colour, got ' + style.allow.color)
    /* The deny capsule keeps its ✕ glyph — this fix is scoped to the target. */
    assert.equal(style.deny.content, '"✕"')

    /* 2. Symptom: measure what actually landed on screen. */
    const box = JSON.parse(await browser.evaluate(
      "JSON.stringify(document.getElementById('allow').getBoundingClientRect().toJSON())"))
    const shot = await browser.send('Page.captureScreenshot', {
      format: 'png', clip: { x: box.x, y: box.y, width: box.width, height: box.height, scale: 1 }
    })
    const probe = await browser.evaluate(SAMPLE(shot.data).replace('CLIP_W', String(box.width)))
    assert.ok(!probe.error, 'disc not found in the capture: ' + JSON.stringify(probe))

    const cssPx = probe.box[0] / 20
    assert.ok(cssPx >= 1 && cssPx <= 2.5 && probe.box[0] >= 24,
      'the disc must still be a 20 CSS px box, captured as ' + probe.box.join('x'))

    assert.ok(accent(probe.centre), 'centre must be the accent dot, got ' + probe.centre)
    for (const s of probe.gap) assert.ok(ink(s), 'the gap around r=4 must show disc ink, got ' + s)
    for (const s of probe.target) assert.ok(accent(s), 'the ring at r=6.6 must be accent on all four sides, got ' + s)

    /* 3. The band variant shares the rule; the fixed layer is mounted only now,
          after the capture, so it cannot cover the dialog. */
    await browser.evaluate(`(() => {
      const wrap = document.createElement('div')
      wrap.setAttribute('data-approval-key', 'x')
      wrap.innerHTML = '<div class="y_actionRow"><button id="bandDeny">拒绝</button><button id="bandAllow">允许一次</button></div>'
      document.body.appendChild(wrap)
    })()`)
    const band = await browser.evaluate(`(() => {
      const a = getComputedStyle(document.getElementById('bandAllow'), '::after')
      const d = getComputedStyle(document.getElementById('bandDeny'), '::after')
      return { allowContent: a.content, image: a.backgroundImage, denyContent: d.content }
    })()`)
    assert.equal(band.allowContent, '""', 'the 允许一次 capsule must not paint a text glyph either')
    assert.equal((band.image.match(/radial-gradient/g) || []).length, 2)
    assert.equal(band.denyContent, '"✕"', 'the 拒绝 capsule keeps its ✕')

    assert.deepEqual(browser.errors, [])
    console.log('PASS: confirm capsules draw the target with gradients — dot/gap/ring measured on screen, no glyph involved')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
