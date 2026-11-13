/**
 * light-token-consumers.test.js — issues #42 / #43 / #44: the accent used as INK.
 *
 * THE SHARED DEFECT. The theme remaps a handful of app tokens, and every one of
 * them has consumers the theme does not own. Three of those consumers treat the
 * accent (or a remapped token) as TEXT / HAIRLINE colour, which is only legible
 * on the near-black page:
 *
 *   #42  caret        caret-color: var(--edge-accent)      1.02:1 on #f2f2ec
 *   #43  drag handle  app gradient stop = a token the theme sets to transparent
 *   #43  focus ring   outline: 2px solid var(--edge-accent) !important, 1.02:1,
 *                     and it also suppressed the app's own blue ring
 *   #44  quote chip   --dsw-alias-state-business-primary remapped to ink, so the
 *                     quote reads as body text (the ACTION loses its signal)
 *   #44  ref chip     same token, same collision, one row over
 *
 * WHAT THIS PAGE PROVES. It mounts the real app-side rules (width handle,
 * quote row, ref chip, and a deliberately MAGENTA app focus ring so the theme's
 * override is unambiguous) and then boots the real client.js, so the assertions
 * read the sheet that ships — not a copy. Four states are walked: light x
 * 谷地黄, light x 武陵青, dark x 谷地黄, and theme OFF. The OFF pass is the
 * control: whatever the fix does must disappear with the sheet.
 *
 * Each colour assertion is paired with a WCAG ratio computed in the page, so a
 * future palette tweak that keeps the token names but loses the contrast fails
 * here instead of shipping another 「看不见」 report. Geometry is asserted too:
 * the handle must keep the app's 2px and the ring its 2px/1px offset — this fix
 * is a recolour, not a reflow.
 *
 * Usage: node test/light-token-consumers.test.js
 */
const assert = require('node:assert/strict'), path = require('node:path')
const { launch, boot } = require('./fixtures/chrome-cdp.js')
const root = path.resolve(__dirname, '..')

/* Verbatim app-side rules, from the issue reports (0.2.2-rc.1):
   - the width handle's gradient, whose two solid stops are the scrollbar token
   - the quote row taking business-primary
   - the ref chip taking the same token
   - a MAGENTA focus ring: the app's real one is blue, and the theme's fix puts
     blue back, so a blue-vs-blue assertion could pass with the theme rule dead.
     Magenta makes "the theme overrode the app here" observable.
   Whitespace only; do not "fix" values. */
const APP_CSS = `
.an3WzG_widthHandle{position:relative;width:2px;height:240px}
.an3WzG_widthHandle:after,.b_widthHandle:after{content:"";position:absolute;top:0;bottom:0;width:2px;border-radius:2px;
pointer-events:none;opacity:0;background:linear-gradient(to bottom,
transparent calc(var(--dsh-width-handle-pointer-y,50%) - 36px),
var(--dsw-alias-scrollbar-bg-l1) calc(var(--dsh-width-handle-pointer-y,50%) - 8px),
var(--dsw-alias-scrollbar-bg-l1) calc(var(--dsh-width-handle-pointer-y,50%) + 8px),
transparent calc(var(--dsh-width-handle-pointer-y,50%) + 36px))}
.an3WzG_widthHandle.hovering:after,.b_widthHandle.hovering:after{opacity:1}
.b_widthHandle{position:relative;width:2px;height:240px}
[data-composer-quote]{display:flex;gap:6px;align-items:center;color:var(--dsw-alias-state-business-primary)}
[data-quote-preview]{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-ref-chip]{color:var(--dsw-alias-state-business-primary)}
button:focus-visible{outline:3px dotted #ff00ff}`

const PAGE = `<!doctype html><html><head><style>
html,body{height:100%;margin:0}
body{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-bg-layer-1:#f2f2ec;--dsw-alias-label-primary:#101110;
--dsw-alias-border-l1:#ccc;--dsw-alias-border-l2:#aaa;--dsw-alias-state-business-primary:#4176e6;
--dsw-alias-scrollbar-bg-l1:rgba(0,0,0,.35);--dsw-alias-scrollbar-bg-l2:rgba(0,0,0,.18);--dsw-alias-bg-overlay:#f2f2ec}
body[data-ds-dark-theme]{--dsw-alias-bg-base:#101110;--dsw-alias-bg-layer-1:#181a17;--dsw-alias-label-primary:#f5f5f0;
--dsw-alias-state-business-primary:#7aaaff;--dsw-alias-scrollbar-bg-l1:rgba(255,255,255,.35);
--dsw-alias-scrollbar-bg-l2:rgba(255,255,255,.18);--dsw-alias-bg-overlay:#181a17}
.app_frame{position:relative;display:grid;grid-template-columns:1fr 2px;height:100%;background:var(--dsw-alias-bg-base)}
.app_centerCol{position:relative;padding:24px}
[data-composer-card]{background:#f2f2ec;padding:12px;display:flex;flex-direction:column;gap:8px;width:520px}
body[data-ds-dark-theme] [data-composer-card]{background:#202220}
#editor{min-height:24px;outline-offset:1px}
${APP_CSS}
</style></head><body>
<div class="app_frame"><div class="app_centerCol">
  <div data-composer-card id="card">
    <div data-composer-quote id="quoteWrap"><span data-quote-preview id="quote">被引用的原文</span></div>
    <span data-ref-chip id="chip">report.md</span>
    <div contenteditable="true" id="editor">输入区</div>
    <button id="focusMe">focus</button>
  </div>
  <div class="an3WzG_widthHandle hovering" data-width-handle id="handle"></div>
  <div class="b_widthHandle hovering" id="handleByClass"></div>
</div></div></body></html>`

/* Everything the assertions need, in one round trip. Colour maths runs in the
   page because that is where a canvas can normalise `color-mix()` / rgba. */
const READ = `(() => {
  const cs = (el, pseudo) => getComputedStyle(el, pseudo)
  const body = cs(document.body)
  const card = cs(document.querySelector('#card'))
  const quote = cs(document.querySelector('#quote'))
  const wrap = cs(document.querySelector('#quoteWrap'))
  const chip = cs(document.querySelector('#chip'))
  const editor = cs(document.querySelector('#editor'))
  const ring = cs(document.querySelector('#focusMe'))
  const probe = cs(document.querySelector('#handle'), '::after')
  const byClass = cs(document.querySelector('#handleByClass'), '::after')

  const ctx = document.createElement('canvas').getContext('2d')
  const paint = v => { ctx.clearRect(0,0,1,1); ctx.fillStyle = v; ctx.fillRect(0,0,1,1); return Array.from(ctx.getImageData(0,0,1,1).data) }
  const lum = c => c.slice(0,3).map(v => { v/=255; return v<=.04045 ? v/12.92 : ((v+.055)/1.055)**2.4 })
    .reduce((s,v,i) => s + v*[.2126,.7152,.0722][i], 0)
  const ratio = (a,b) => { const x=lum(a), y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05) }
  const over = (top, bottom) => { const a = paint(top), b = paint(bottom), al = a[3]/255;
    return [0,1,2].map(i => Math.round(a[i]*al + b[i]*(1-al))).concat(255) }

  return {
    className: document.body.className,
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    tokens: {
      scrollbar: body.getPropertyValue('--dsw-alias-scrollbar-bg-l1').trim(),
      caret: body.getPropertyValue('--edge-caret').trim(),
      ring: body.getPropertyValue('--edge-focus-ring').trim(),
      statusLight: body.getPropertyValue('--edge-status-light').trim(),
      accent: body.getPropertyValue('--edge-accent').trim(),
      label: body.getPropertyValue('--dsw-alias-label-primary').trim()
    },
    cardBg: card.backgroundColor,
    colors: {
      caret: editor.caretColor,
      editorInk: editor.color,
      quote: quote.color,
      quoteBg: quote.backgroundColor,
      quoteRadius: quote.borderRadius,
      wrap: wrap.color,
      chip: chip.color,
      ringColor: ring.outlineColor,
      ringStyle: ring.outlineStyle,
      ringWidth: ring.outlineWidth,
      ringOffset: ring.outlineOffset
    },
    handle: { image: probe.backgroundImage, width: probe.width, opacity: probe.opacity },
    handleByClass: { image: byClass.backgroundImage, width: byClass.width, opacity: byClass.opacity },
    /* Contrast is measured against what the pixel actually is: the quote's wash
       composited over the card, not the raw rgba. */
    contrast: {
      caret: ratio(paint(editor.caretColor), paint(card.backgroundColor)),
      chip: ratio(paint(chip.color), paint(card.backgroundColor)),
      quote: ratio(paint(quote.color), over(quote.backgroundColor, card.backgroundColor)),
      ring: ratio(paint(ring.outlineColor), paint(document.body.style.getPropertyValue('--dsw-alias-bg-base') || getComputedStyle(document.body).backgroundColor))
    }
  }
})()`

const forEachMode = async (browser, label, dark, palette, run) => {
  await browser.evaluate(`document.body.toggleAttribute('data-ds-dark-theme',${dark});
    __prefs.setItem('dsh-theme-endfield-palette',${JSON.stringify(palette)})`)
  await browser.until(`document.body.classList.contains('theme-endfield-wuling')===${palette === 'wuling'}`)
  const v = await browser.evaluate(READ)
  assert.equal(v.dark, dark, label + ': dark flag')
  await run(v, label)
  /* Printed because these four ratios ARE the contract; a palette tweak that
     keeps the tokens but loses a stop shows up in the log next to the diff. */
  console.log('      caret ' + v.contrast.caret.toFixed(2) + ' · ring ' + v.contrast.ring.toFixed(2)
    + ' · quote ' + v.contrast.quote.toFixed(2) + ' · chip ' + v.contrast.chip.toFixed(2))
  console.log('PASS:', label)
}

;(async () => {
  const browser = await launch()
  try {
    await boot(browser, root, {}, '', { html: PAGE, ready: '#editor' })
    await browser.send('DOM.enable')
    await browser.send('CSS.enable')
    /* Force :focus-visible on the button instead of calling focus(): a script
       focus does not match :focus-visible for a button in Chromium (the
       heuristic wants a keyboard interaction), so the ring would assert against
       outline-style:none and pass for the wrong reason on some builds. Forcing
       the pseudo state makes the sheet's own rule the only thing under test. */
    const { root: doc } = await browser.send('DOM.getDocument', { depth: 1 })
    const { nodeId: focusNode } = await browser.send('DOM.querySelector', { nodeId: doc.nodeId, selector: '#focusMe' })
    await browser.send('CSS.forcePseudoState', { nodeId: focusNode, forcedPseudoClasses: ['focus', 'focus-visible'] })

    /* The theme's own answers are tokens, so assert the tokens exist first: a
       deleted --edge-caret would otherwise be masked by its var() fallback and
       only the light scheme would notice. (Custom properties resolve var() in
       their computed value, so these read back as the substituted hex.) */
    const tokens = await browser.evaluate(READ)
    assert.equal(tokens.tokens.caret, tokens.tokens.label)
    assert.equal(tokens.tokens.ring, '#4176e6')

    /* #42 / #43 / #44 — light, 谷地黄 (the palette every report used). */
    await forEachMode(browser, 'light valley', false, 'valley', (v) => {
      /* #42: the caret is ink, not signal yellow. */
      assert.equal(v.colors.caret, 'rgb(16, 17, 16)')
      assert.ok(v.contrast.caret >= 7, 'caret contrast ' + v.contrast.caret.toFixed(2))
      assert.ok(!/255,\s*245,\s*0/.test(v.colors.caret), 'caret must not be the accent in light')

      /* #43: the handle keeps the app's 2px and its hover opacity, and the two
         solid stops are the app's own line colour again. Both anchors fire: the
         declared data attribute AND the semantic class suffix. */
      assert.equal(v.handle.width, '2px')
      assert.equal(v.handle.opacity, '1')
      assert.match(v.handle.image, /rgb\(16, 17, 16\)/)
      assert.match(v.handleByClass.image, /rgb\(16, 17, 16\)/)
      /* …and the mechanism stays honest: the token itself is still transparent,
         so the fix cannot silently regress into "token turned opaque". */
      assert.equal(v.tokens.scrollbar, 'transparent')

      /* #43 annex: the focus ring is back to the app's blue pair, 2px/1px. */
      assert.equal(v.colors.ringColor, 'rgb(65, 118, 230)')
      assert.equal(v.colors.ringStyle, 'solid')
      assert.equal(v.colors.ringWidth, '2px')
      assert.equal(v.colors.ringOffset, '1px')
      assert.ok(v.contrast.ring >= 3, 'ring contrast ' + v.contrast.ring.toFixed(2))

      /* #44: the quote is ink on an accent wash — a HUE signal, not a luminance
         one — and the wash is a real colour, not the app's brand blue restored. */
      assert.equal(v.colors.quote, 'rgb(16, 17, 16)')
      assert.equal(v.colors.quoteBg, 'rgba(255, 245, 0, 0.55)')
      assert.equal(v.colors.quoteRadius, '3px')
      assert.ok(v.contrast.quote >= 4.5, 'quote contrast ' + v.contrast.quote.toFixed(2))

      /* #44: the ref chip keeps an accent of its own instead of body ink. */
      assert.equal(v.colors.chip, 'rgb(107, 93, 0)')
      assert.ok(v.contrast.chip >= 4.5, 'chip contrast ' + v.contrast.chip.toFixed(2))
    })

    /* Light, 武陵青: the same five surfaces must follow the palette with no
       per-palette rules — the chip takes the cyan deep step, the wash the cyan
       channels, and the ring/handle/caret stay scheme-scoped, not palette-scoped. */
    await forEachMode(browser, 'light wuling', false, 'wuling', (v) => {
      assert.match(v.className, /theme-endfield-wuling/)
      assert.equal(v.colors.caret, 'rgb(16, 17, 16)')
      assert.match(v.handle.image, /rgb\(16, 17, 16\)/)
      assert.equal(v.colors.ringColor, 'rgb(65, 118, 230)')
      assert.equal(v.colors.quoteBg, 'rgba(20, 208, 208, 0.55)')
      assert.equal(v.colors.chip, 'rgb(0, 106, 106)')
      assert.ok(v.contrast.chip >= 4.5, 'chip contrast ' + v.contrast.chip.toFixed(2))
      assert.ok(v.contrast.quote >= 4.5, 'quote contrast ' + v.contrast.quote.toFixed(2))
    })

    /* Dark: none of the five is broken there to begin with, and the fix must
       leave every one of them on the accent / paper line. This is the half that
       proves the light rules stay out of the dark scheme. */
    await forEachMode(browser, 'dark valley', true, 'valley', (v) => {
      assert.equal(v.colors.caret, 'rgb(255, 245, 0)')
      assert.ok(v.contrast.caret >= 7, 'caret contrast ' + v.contrast.caret.toFixed(2))
      assert.equal(v.handle.width, '2px')
      assert.match(v.handle.image, /rgb\(245, 245, 240\)/)
      assert.equal(v.tokens.scrollbar, 'transparent')
      assert.equal(v.colors.ringColor, 'rgb(122, 170, 255)')
      assert.equal(v.colors.quote, 'rgb(255, 245, 0)')
      assert.equal(v.colors.quoteBg, 'rgba(0, 0, 0, 0)')
      assert.equal(v.colors.chip, 'rgb(255, 245, 0)')
    })

    /* Control pass: with the sheet gone, every one of these must fall back to
       the app's own behaviour. If a fix leaked into a rule that survives the
       unmount, the caret would still be ink here. */
    await browser.evaluate(`document.body.toggleAttribute('data-ds-dark-theme',false);
      __prefs.setItem('dsh-theme-endfield-palette','valley');
      __prefs.setItem('dsh-theme-endfield-enabled','0')`)
    await browser.until(`document.body.classList.contains('theme-endfield-wuling')===false`)
    const off = await browser.evaluate(READ)
    /* caret-color: auto resolves to currentColor, so the app's answer once the
       sheet is gone is "whatever colour the text is" — not the theme's ink. */
    assert.equal(off.colors.caret, off.colors.editorInk, 'theme off: caret returns to currentColor')
    assert.doesNotMatch(off.handle.image, /rgb\(16, 17, 16\)/, 'theme off: handle line returns to the app token')
    assert.equal(off.colors.quoteBg, 'rgba(0, 0, 0, 0)', 'theme off: quote loses the wash')
    assert.equal(off.colors.chip, 'rgb(65, 118, 230)', 'theme off: chip is the app brand blue again')
    assert.deepEqual(browser.errors, [])
    console.log('PASS: theme off — caret / handle / quote / chip fall back to the app')

    console.log('PASS: #42 caret · #43 width handle + focus ring · #44 quote + ref chip (light valley / light wuling / dark)')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
