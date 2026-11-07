/**
 * approval-band-transform.test.js — issue #41: the approval band is
 * position:fixed, so ANY ancestor that is a containing block for fixed
 * descendants captures it. DSH 0.2.2-rc.1 gave the composer seat
 * `will-change: transform`, which does exactly that.
 *
 * WHAT BROKE. .*_root[data-phase=active] .*_composerSeat now carries
 * will-change: transform. Per CSS Will Change, a property that would make the
 * element generate a containing block MUST do so when named in will-change, so
 * the seat became the containing block for the approval panel it contains. The
 * panel is fixed, so it leaves the flow; the seat's only in-flow child is gone,
 * its height collapses to 0, and the full-viewport layer resolves to
 * `seat width x 0` at the bottom edge: the card centres on that line and paints
 * half above the window, clipped, leaving one 「● 等待审批」 strip. Users could not
 * find the buttons (the report measured 152s to approve, vs 1-2s with the theme
 * off).
 *
 * THE FIX (src/styles/theme.css, the rule above the approval block):
 *   body:has([data-approval-key]) :is([data-composer-seat], [class$='_composerSeat']) {
 *     will-change: auto !important;
 *   }
 * It drops the hint only while a panel is mounted, so the app keeps its
 * compositing hint the rest of the time. CSS has no way to escape a containing
 * block from inside the band — the fix has to sit on the ancestor.
 *
 * This page mounts THREE bands at once, identical except for the seat:
 *   1. #bandRaw — seat has will-change but neither anchor: the PRE-FIX shape.
 *      Asserted to collapse, so a regression in the hook cannot pass silently
 *      by simply measuring nothing.
 *   2. #band    — seat matches [class$='_composerSeat'], nested under a
 *      [data-conversation-scroll] wrapper that itself carries
 *      container-type: inline-size (a containing block for fixed descendants
 *      per CSS Containment — the 自动授权审查 field report's shape: the band
 *      must survive a producer on the SEAT'S ANCESTORS too, which is why the
 *      release rule strips every producing property from the structural
 *      layers while a panel is mounted).
 *   3. #bandAttr— seat matches [data-composer-seat] only (the e2e anchor the app
 *      declares), class deliberately NOT ending in _composerSeat, because the
 *      suffix hook dies the moment upstream appends a second class. Its seat
 *      nests under a [class*='_frame'] wrapper carrying transform — the frame
 *      anchor of the same defence-in-depth rule.
 * The #band card also carries a second `x_withSubject` class: subject-bearing
 * approvals (an agent-team escalation renders icon + name) ship the card as
 * '<hash>_card <hash>_withSubject', and a [class$='_card'] hook would die on
 * it — the paper-band fill proves the loosened child hook still matches.
 *
 * Usage: node test/approval-band-transform.test.js
 */
const assert = require('node:assert/strict'), path = require('node:path')
const { launch, boot } = require('./fixtures/chrome-cdp.js')
const root = path.resolve(__dirname, '..')

const PAGE = `<!doctype html><html><head><style>
html,body{height:100%;margin:0}
body{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-bg-layer-1:#f2f2ec;--dsw-alias-label-primary:#101110;
--dsw-alias-border-l1:#ccc;--dsw-alias-border-l2:#aaa}
.app_frame{position:relative;display:flex;height:100%;overflow:hidden;background:var(--dsw-alias-bg-base)}
.app_centerCol{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;max-width:720px}
.x_root{position:relative;display:flex;flex-direction:column;flex:1;min-height:0}
.x_scroll{flex:1;min-height:0;overflow-y:auto}
/* The three seats differ only in how the theme can name them. */
.seatBase{position:sticky;bottom:0;margin-top:auto;z-index:9;will-change:transform}
/* The seat's ancestors may produce containing blocks of their own: the
   conversation scrollport with a container-type, a frame with a transform.
   The theme must release BOTH while a band is mounted. */
.x_convScroll{display:flex;flex-direction:column;flex:1;min-height:0;container-type:inline-size}
.x_frameWrap{display:flex;flex-direction:column;flex:1;min-height:0;transform:translateZ(0)}
</style></head><body>
<div class="app_frame"><div class="app_centerCol"><div class="x_root" data-phase="active">
  <div class="x_scroll"><p>transcript</p></div>
  <div class="x_convScroll" id="convScroll" data-conversation-scroll>
    <div class="seatBase x_composerSeat" id="seat" data-composer-seat>
      <div data-approval-key id="band"><div class="x_card x_withSubject">
        <div class="x_strip">等待审批</div>
        <div class="x_body"><div class="x_headline">允许执行吗？</div><div class="x_command">plugin_manager.action</div></div>
        <div class="x_actionRow"><button>拒绝</button><button>允许一次</button></div>
      </div></div>
    </div>
  </div>
  <div class="x_frameWrap" id="frameWrap">
    <div class="seatBase x_seat" id="seatAttr" data-composer-seat>
      <div data-approval-key id="bandAttr"><div class="x_card">
        <div class="x_strip">等待审批</div>
        <div class="x_body"><div class="x_headline">允许执行吗？</div><div class="x_command">plugin_manager.action</div></div>
        <div class="x_actionRow"><button>拒绝</button><button>允许一次</button></div>
      </div></div>
    </div>
  </div>
  <div class="seatBase x_composerSeatRaw" id="seatRaw">
    <div data-approval-key id="bandRaw"><div class="x_card">
      <div class="x_strip">等待审批</div>
      <div class="x_body"><div class="x_headline">允许执行吗？</div><div class="x_command">plugin_manager.action</div></div>
      <div class="x_actionRow"><button>拒绝</button><button>允许一次</button></div>
    </div></div>
  </div>
</div></div></div></body></html>`

;(async () => {
  const browser = await launch()
  try {
    await browser.send('Emulation.setDeviceMetricsOverride',
      { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false })
    await boot(browser, root, { enabled: '1' }, '', { html: PAGE, ready: '#band' })
    await browser.sleep(120)

    const m = await browser.evaluate(`(() => {
      const rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect()
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] }
      const buttons = (sel) => [...document.querySelectorAll(sel + ' button')].map((b) => {
        const r = b.getBoundingClientRect()
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
      })
      const wc = (sel) => getComputedStyle(document.querySelector(sel)).willChange
      return {
        vw: innerWidth, vh: innerHeight,
        bandRaw: rect('#bandRaw'), cardRaw: rect('#bandRaw .x_card'), buttonsRaw: buttons('#bandRaw'),
        band: rect('#band'), card: rect('#band .x_card'), buttons: buttons('#band'),
        bandAttr: rect('#bandAttr'), cardAttr: rect('#bandAttr .x_card'), buttonsAttr: buttons('#bandAttr'),
        wcRaw: wc('#seatRaw'), wcSeat: wc('#seat'), wcAttr: wc('#seatAttr'),
        /* the defence-in-depth ancestors: producers released while mounted */
        ctScroll: getComputedStyle(document.querySelector('#convScroll')).containerType,
        tfFrame: getComputedStyle(document.querySelector('#frameWrap')).transform,
        bandScroll: rect('#band'), bandFrame: rect('#bandAttr'),
        cardBg: getComputedStyle(document.querySelector('#band .x_card')).backgroundColor,
        cardBgAttr: getComputedStyle(document.querySelector('#bandAttr .x_card')).backgroundColor
      }
    })()`)

    const near = (a, b, tol = 1) => Math.abs(a - b) <= tol
    const inViewport = ([x, y, w, h], vw, vh) =>
      x >= -1 && y >= -1 && x + w <= vw + 1 && y + h <= vh + 1 && w > 0 && h > 0

    /* ---- 1. the negative control still exhibits the bug ------------------ */
    /* If this ever stops collapsing, the fixture no longer reproduces #41 and
       every assertion below would pass for the wrong reason. */
    assert.ok(m.wcRaw === 'transform',
      'control seat must keep its will-change hint (got ' + m.wcRaw + ')')
    assert.ok(m.bandRaw[3] <= 8,
      'control band must resolve against the seat, i.e. collapse to a line — got height ' + m.bandRaw[3])
    assert.ok(m.bandRaw[2] < m.vw,
      'control band must be capped to the seat width, not the viewport — got ' + m.bandRaw[2])
    assert.ok(m.cardRaw[1] + m.cardRaw[3] > m.vh,
      'control card must run past the bottom edge and be clipped (the reported symptom) — got '
        + JSON.stringify(m.cardRaw))

    /* ---- 2. the suffixed class hook releases the containing block ------- */
    assert.equal(m.wcSeat, 'auto',
      'the seat must drop will-change while an approval is mounted (got ' + m.wcSeat + ')')
    assert.ok(near(m.band[0], 0) && near(m.band[1], 0) && near(m.band[2], m.vw) && near(m.band[3], m.vh),
      'the band must be the full viewport, got ' + JSON.stringify(m.band) + ' in ' + m.vw + 'x' + m.vh)
    assert.ok(inViewport(m.card, m.vw, m.vh), 'the card must sit inside the viewport, got ' + JSON.stringify(m.card))

    /* ---- 3. both action capsules are visible and clickable --------------- */
    assert.equal(m.buttons.length, 2, 'both action capsules must be present')
    for (const b of m.buttons) {
      assert.ok(inViewport(b, m.vw, m.vh), 'an action capsule fell outside the viewport: ' + JSON.stringify(b))
      assert.ok(b[2] >= 150 && b[3] >= 24,
        'an action capsule is too small to hit: ' + JSON.stringify(b))
    }

    /* ---- 4. the e2e attribute anchor works without the class suffix ------ */
    assert.equal(m.wcAttr, 'auto',
      '[data-composer-seat] alone must release the hint too (got ' + m.wcAttr + ')')
    assert.ok(near(m.bandAttr[2], m.vw) && near(m.bandAttr[3], m.vh),
      'the attribute-anchored seat must still yield a full-viewport band, got ' + JSON.stringify(m.bandAttr))
    for (const b of m.buttonsAttr) assert.ok(inViewport(b, m.vw, m.vh),
      'attribute-anchored capsule outside the viewport: ' + JSON.stringify(b))

    /* ---- 5. defence in depth: producers on the seat's ANCESTORS ---------- */
    /* The 自动授权审查 field report is the reminder that the seat is not the
       only possible trap: container-type on the conversation scrollport and a
       transform on a frame wrapper are both containing blocks for fixed
       descendants. While a band is mounted the theme releases the producing
       properties themselves, so these bands measure the viewport too — and the
       control band above proves the release did not simply neutralise every
       trap on the page. */
    assert.equal(m.ctScroll, 'normal',
      'container-type on the conversation scrollport must be normalised while a band is mounted (got ' + m.ctScroll + ')')
    assert.equal(m.tfFrame, 'none',
      'transform on a frame-level wrapper must be dropped while a band is mounted (got ' + m.tfFrame + ')')
    assert.ok(near(m.bandScroll[0], 0) && near(m.bandScroll[1], 0)
      && near(m.bandScroll[2], m.vw) && near(m.bandScroll[3], m.vh),
      'the band under the scrollport must still be the full viewport, got ' + JSON.stringify(m.bandScroll))
    assert.ok(inViewport(m.card, m.vw, m.vh) && inViewport(m.cardAttr, m.vw, m.vh),
      'cards must sit inside the viewport with ancestor producers released')

    /* ---- 6. subject-bearing cards keep the paper band -------------------- */
    /* #band's card carries `x_card x_withSubject` — the app ships subject
       escalations as '<hash>_card <hash>_withSubject', where a [class$='_card']
       hook dies. The paper fill comes only from the band's card rule and the
       fixture paints no card background of its own, so a non-transparent fill
       proves the loosened child hook matched. */
    assert.notEqual(m.cardBg, 'rgba(0, 0, 0, 0)',
      'the withSubject card must still receive the paper-band fill, got transparent')
    assert.equal(m.cardBg, m.cardBgAttr,
      'the withSubject card must resolve to the same paper fill as the plain card, got '
        + m.cardBg + ' vs ' + m.cardBgAttr)

    /* ---- 7. the mask still paints above and below the band -------------- */
    /* The signature shape is 「上下有遮罩」: the dim layer is the full-viewport
       root, the opaque paper band is the card inside it. If the root ever
       shrank to the card, the darkening would vanish. */
    assert.ok(m.band[3] > m.card[3] + 100,
      'the mask must stay taller than the band so it shows above and below')

    /* ---- 8. the declaration is live in both directions ------------------- */
    /* Mounting/unmounting an approval has to flip the seat back and forth in the
       same document. Deleting the rule at runtime must re-collapse the band, and
       re-inserting it must restore the viewport rect — otherwise the "scoped to
       the moment a panel exists" claim is only half true (it would leave the
       containing block around until the next navigation). */
    const toggle = await browser.evaluate(`(() => {
      const sheet = document.querySelector('style[data-plugin="dsh-theme-endfield"]').sheet
      const rules = [...sheet.cssRules]
      const index = rules.findIndex((r) => r.style && r.style.willChange === 'auto'
        && (r.selectorText || '').indexOf('data-approval-key') >= 0)
      if (index < 0) return { found: false }
      const text = rules[index].cssText
      const box = (sel) => { const r = document.querySelector(sel).getBoundingClientRect()
        return [r.x, r.y, r.width, r.height].map(Math.round) }
      sheet.deleteRule(index)
      const off = box('#band')
      sheet.insertRule(text, index)
      const on = box('#band')
      return { found: true, off, on, wc: getComputedStyle(document.querySelector('#seat')).willChange }
    })()`)
    assert.ok(toggle.found, 'cannot find the will-change release rule inside the delivered stylesheet')
    assert.ok(toggle.off[3] <= 8,
      'without the declaration the band must collapse again — got ' + JSON.stringify(toggle.off))
    assert.deepEqual(toggle.on, [0, 0, m.vw, m.vh],
      're-inserting the declaration must restore the viewport rect — got ' + JSON.stringify(toggle.on))
    assert.equal(toggle.wc, 'auto', 'the seat must report will-change: auto once the rule is back')

    console.log('PASS: approval band escapes the will-change containing block (#41)')
    console.log('      control  ' + JSON.stringify(m.bandRaw) + '  card ' + JSON.stringify(m.cardRaw))
    console.log('      fixed    ' + JSON.stringify(m.band) + '  card ' + JSON.stringify(m.card)
      + '  capsules ' + JSON.stringify(m.buttons))
  } finally {
    await browser.close()
  }
})().catch((e) => { console.error('FAIL: ' + e.message); process.exit(1) })
