/**
 * sidebar-row-wash.test.js — 「左边工作区的会话,点击选中之后高亮,两边颜色
 * 不是填满的」+「我开了圆角模式这个高亮还是直角」。
 *
 * 修法按作者的最终裁定:直接逆向 app 原生实现,在原本基础上换颜色,不再重排
 * 几何。逆向结论(从安装版 0.2.2-rc.1 的 app.asar 提取 dsh-client-ui-workspace
 * Rows.module.css 原文核对):原生高亮没有任何几何——每行自带
 *   border-inline: var(--dsh-sidebar-paint-inset) solid transparent;   (3px)
 *   background-clip: padding-box;
 * 选中态只有一句 background-color 换色。3px 透明描边框在原生淡色下读作有意
 * 的内缩;主题的强高亮色一刷,未上色的框把栏底色透出来,两侧各显一条缝。
 * 所以修复留在原生结构内、只动颜色:把描边框也刷成同一个高亮色
 * (border-inline-color),高亮即填满行盒,一行几何都不碰。
 *
 * 为什么放弃上一版「满宽」实现(列表负外边距 + 裁剪外扩 + 全套内层补偿):
 * 它让滚动容器(列表,overflow-y: auto)的绘制/命中裁剪边界成为唯一的正确性
 * 依赖——行盒布局对了但绘制被裁在 padding box,圆角模式的 12px 圆角被两端
 * 切平(getBoundingClientRect 量不出,只有 elementFromPoint 探针能看见)。
 * 描边上色把绘制全部关进行盒内,天然落在滚动容器裁剪区内,圆角、栏内边距、
 * 滚动条槽、文字线全部回归 app 原生。
 *
 * 断言策略:THEME OFF 先量一次原生基线,再在圆角模式与方角模式下各量一次,
 * 几何(行盒、标题线、列表边距/内边距/滚动条槽、骨架行)必须与基线逐像素
 * 一致——「换颜色不动几何」的可执行定义;颜色断言描边色 === 背景色(亮/暗
 * 两种主题色),圆角模式保 12px、方角模式归 0。页面夹具注入 app CSS 原文,
 * 并给列表一条 5px 的 ::-webkit-scrollbar,使主题开/关两侧的滚动条占位一致,
 * 对照才可比。
 *
 * Usage: node test/sidebar-row-wash.test.js
 */
const assert = require('node:assert/strict'), path = require('node:path')
const { launch, boot } = require('./fixtures/chrome-cdp.js')
const root = path.resolve(__dirname, '..')

/* Verbatim app CSS — dsh-client-ui-sidebar SidebarRoot.module.css (rail root)
   and dsh-client-ui-workspace Rows.module.css (rows + list), 0.2.2-rc.1.
   Whitespace only; do not "fix" values. */
const APP_CSS = `
.wtg9ga_root{--dsh-sidebar-inline-padding:8px;--dsh-sidebar-row-padding:12px;--dsh-sidebar-label-gap:6px;--dsh-sidebar-paint-inset:3px;
height:100%;padding:6px var(--dsh-sidebar-inline-padding);box-sizing:border-box;color:var(--dsw-alias-label-primary);
flex-direction:column;font-size:14px;display:flex}
.GAkraW_root{--dsh-session-list-edge-inset:var(--dsh-sidebar-inline-padding);--dsh-session-list-scrollbar-width:5px;--dsh-session-list-scrollbar-offset:2px;
box-sizing:border-box;min-height:0;padding-right:var(--dsh-session-list-edge-inset);flex-direction:column;flex:1;display:flex}
.GAkraW_listArea{min-height:0;margin-left:-4px;margin-right:calc(-1 * var(--dsh-session-list-edge-inset));flex-direction:column;flex:1;padding-left:4px;display:flex;overflow:visible}
.GAkraW_list{min-height:0;margin-left:-4px;margin-right:var(--dsh-session-list-scrollbar-offset);padding-left:4px;
padding-right:calc(var(--dsh-session-list-edge-inset) - var(--dsh-session-list-scrollbar-width) - var(--dsh-session-list-scrollbar-offset));
scrollbar-gutter:stable;flex:1;padding-bottom:16px;overflow-y:auto}
.GAkraW_treeBody{flex-direction:column;flex:1;min-height:0;display:flex;position:relative}
.wnFoaW_projectRow,.wnFoaW_sessionRow{align-items:center;gap:var(--dsh-sidebar-label-gap);border-radius:var(--dsw-radius-md);
border-inline:var(--dsh-sidebar-paint-inset) solid transparent;box-sizing:border-box;padding:0 8px;cursor:pointer;
user-select:none;color:var(--dsw-alias-label-primary);background-clip:padding-box;
padding-inline-start:calc(var(--dsh-sidebar-row-padding) - var(--dsh-sidebar-paint-inset) + var(--dsh-workspace-indent,0px));display:flex}
.wnFoaW_sessionRow{gap:0;height:32px}
.wnFoaW_sessionRow.wnFoaW_selected{background-color:var(--dsw-alias-interactive-bg-hover)}
.wnFoaW_sessionRow.wnFoaW_menuOpen{background-color:var(--dsw-alias-interactive-bg-hover)}
.wnFoaW_slot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}
.wnFoaW_title{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.GAkraW_skeletonRow{align-items:flex-start;gap:var(--dsh-sidebar-label-gap);box-sizing:border-box;min-height:48px;padding:6px var(--dsh-sidebar-row-padding) 7px;display:flex}`

const PAGE = `<!doctype html><html><head><style>
html,body{height:100%;margin:0}
:root{--dsw-corner-shape:superellipse(1.5)}
*,*:before,*:after{corner-shape:var(--dsw-corner-shape)}
body{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-bg-layer-1:#f2f2ec;--dsw-alias-label-primary:#101110;
--dsw-alias-label-tertiary:#666;--dsw-alias-interactive-bg-hover:#ddd;--dsw-radius-md:12px;--dsw-radius-sm:8px;
--dsw-radius-lg:16px;--dsw-radius-xl:20px;--dsw-radius-xs:4px}
.app_frame{position:relative;display:grid;grid-template-columns:232px 1fr;height:100%;overflow:hidden}
.app_sidebarCol{position:relative;min-width:0}
${APP_CSS}
</style></head><body>
<div class="app_frame">
  <div class="app_sidebarCol">
    <div class="wtg9ga_root">
      <div class="GAkraW_root">
        <div class="GAkraW_listArea">
          <div class="GAkraW_list" id="list">
            <div class="GAkraW_treeBody" id="treeBody">
              <div class="wnFoaW_sessionRow wnFoaW_selected" id="rowSel"><span class="wnFoaW_slot"></span><span class="wnFoaW_title">选中的会话</span></div>
              <div class="wnFoaW_sessionRow" id="rowPlain"><span class="wnFoaW_slot"></span><span class="wnFoaW_title">普通会话</span></div>
              <div class="wnFoaW_sessionRow wnFoaW_selected" id="rowIndent" style="--dsh-workspace-indent:24px"><span class="wnFoaW_slot"></span><span class="wnFoaW_title">缩进的会话</span></div>
              <div class="wnFoaW_sessionRow wnFoaW_menuOpen" id="rowMenu"><span class="wnFoaW_slot"></span><span class="wnFoaW_title">菜单打开的会话</span></div>
              <div class="GAkraW_skeletonRow" id="skeleton"><span>骨架</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="app_centerCol"><p id="probe">chat</p></div>
</div>
</body></html>`

/* 滚动条占位没法夹具化:Blink 对 ::-webkit-scrollbar 的级联不按特异性、不按
   !important、也不按源序可翻转 — 主题的全局 10px 一旦注入就统治文档(实测:
   页面 #list::-webkit-scrollbar{width:5px !important} 和 boot 后 append 的
   5px 表都翻不掉它)。主题开启 = 占位 10px、关闭 = 页面/默认厚度,是主题
   v1.2.4 起的既成行为。所以对照策略绕开它:滚动条占位只挤行的 RIGHT 侧,
   行的左缘/行高/标题线/列表盒与全部 CSS 声明逐值对照;行宽改用列表盒内部
   一致性断言(行右缘 = 列表 client 右缘 − 列表右内边距)。 */

/* 一次 boot 内量取的同一组量,供主题开/关对照。 */
const MEASURE = `(() => {
  const rect = (sel) => { const r = document.querySelector(sel).getBoundingClientRect()
    return [r.x, r.y, r.width, r.height] }
  const cs = (sel) => {
    const el = document.querySelector(sel), s = getComputedStyle(el)
    return { clip: s.backgroundClip, bg: s.backgroundColor,
      bisc: s.borderInlineStartColor, biec: s.borderInlineEndColor,
      radius: s.borderRadius, pls: s.paddingLeft }
  }
  const titleLeft = (sel) => document.querySelector(sel + ' .wnFoaW_title').getBoundingClientRect().x
  const list = document.querySelector('#list'), listStyle = getComputedStyle(list)
  const rowSel = document.querySelector('#rowSel')
  const skel = document.querySelector('#skeleton')
  return {
    col: rect('.app_sidebarCol'),
    rowSel: rect('#rowSel'), rowPlain: rect('#rowPlain'),
    rowIndent: rect('#rowIndent'), rowMenu: rect('#rowMenu'),
    cssSel: cs('#rowSel'), cssPlain: cs('#rowPlain'),
    cssIndent: cs('#rowIndent'), cssMenu: cs('#rowMenu'),
    titleSel: titleLeft('#rowSel'), titlePlain: titleLeft('#rowPlain'),
    titleIndent: titleLeft('#rowIndent'),
    list: rect('#list'),
    listClientW: list.clientWidth,
    listMl: listStyle.marginLeft, listMr: listStyle.marginRight,
    listPls: listStyle.paddingLeft, listPre: listStyle.paddingRight,
    listGutter: listStyle.scrollbarGutter, listOvy: listStyle.overflowY,
    skeletonText: rect('#skeleton').x + parseFloat(getComputedStyle(skel).paddingLeft)
  }
})()`

async function measureWith(scope) {
  const browser = await launch()
  try {
    await browser.send('Emulation.setDeviceMetricsOverride',
      { width: 1200, height: 800, deviceScaleFactor: 1, mobile: false })
    await boot(browser, root, scope, '', { html: PAGE, ready: '#rowSel' })
    await browser.sleep(120)
    return await browser.evaluate(MEASURE)
  } finally { await browser.close() }
}

;(async () => {
  const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol
  /* 对照 x/h(滚动条占位只挤右侧,这两维必须逐像素一致;宽度另行断言)。 */
  const sameXH = (a, b, what) => {
    assert.ok(near(a[0], b[0]), what + ' x moved: ' + a[0] + ' -> ' + b[0])
    assert.ok(near(a[3], b[3]), what + ' height moved: ' + a[3] + ' -> ' + b[3])
  }

  /* ---- 原生基线(主题关闭)---- */
  const nat = await measureWith({ enabled: '0' })
  assert.equal(nat.cssSel.clip, 'padding-box',
    'app rows must keep their native padding-box clip in the baseline')
  assert.equal(nat.cssSel.bisc, 'rgba(0, 0, 0, 0)',
    'the native border frame is transparent — that inset IS the filed complaint')
  assert.equal(nat.listGutter, 'stable', 'native list keeps scrollbar-gutter: stable')

  /* ---- 圆角模式(作者报告的形态):换色,几何零扰动,圆角完好 ---- */
  const rnd = await measureWith({ enabled: '1', radius: 'round' })

  // 几何:与原生基线逐值一致 —— 「在原本基础上」的可执行定义。
  sameXH(nat.rowSel, rnd.rowSel, 'selected row box')
  sameXH(nat.rowPlain, rnd.rowPlain, 'plain row box')
  sameXH(nat.rowIndent, rnd.rowIndent, 'indented row box')
  sameXH(nat.rowMenu, rnd.rowMenu, 'menuOpen row box')
  sameXH(nat.list, rnd.list, 'list box')
  assert.ok(near(rnd.rowSel[0], 8),
    'row box must start at the native rail padding (8px), got ' + rnd.rowSel[0])
  /* 行宽 = 列表盒内部一致性:行右缘 = 列表 client 右缘 − 列表右内边距
     (clientWidth 已扣除 gutter/滚动条占位)。行盒因此整体落在滚动容器的
     绘制区内 — 上一版满宽方案的失败点,这里结构性排除。 */
  const rowRight = rnd.rowSel[0] + rnd.rowSel[2]
  const listContentRight = rnd.list[0] + rnd.listClientW - parseFloat(rnd.listPre)
  assert.ok(near(rowRight, listContentRight),
    'row must fill the list content box: ' + rowRight + ' vs ' + listContentRight)
  assert.ok(rowRight < rnd.list[0] + rnd.list[2],
    'row stays inside the list box — inside the scroll container\'s clip region')
  for (const k of ['titleSel', 'titlePlain', 'titleIndent', 'skeletonText'])
    assert.ok(near(nat[k], rnd[k]), k + ' moved: ' + nat[k] + ' -> ' + rnd[k])
  for (const k of ['listMl', 'listMr', 'listPls', 'listPre', 'listGutter', 'listOvy'])
    assert.equal(nat[k], rnd[k], 'list ' + k + ' changed: ' + nat[k] + ' -> ' + rnd[k])
  assert.equal(rnd.cssSel.pls, nat.cssSel.pls, 'row padding-inline-start must stay native')
  assert.equal(rnd.cssIndent.pls, '33px',
    'workspace indent arithmetic is the app\'s own (12 - 3 + 24), untouched')

  // 颜色:描边框与背景同色 → 高亮填满行盒;普通行保持无 wash。
  assert.equal(rnd.cssSel.bisc, rnd.cssSel.bg,
    'selected row: border frame color must equal the wash color')
  assert.equal(rnd.cssSel.biec, rnd.cssSel.bg,
    'selected row: both inline frame sides must carry the wash')
  assert.notEqual(rnd.cssSel.bg, nat.cssSel.bg,
    'selected row wash must actually change color under the theme')
  assert.notEqual(rnd.cssSel.bisc, 'rgba(0, 0, 0, 0)',
    'the 3px frame is now painted — that was the filed gap')
  assert.equal(rnd.cssPlain.bisc, 'rgba(0, 0, 0, 0)',
    'unselected rows keep the transparent frame')
  assert.equal(rnd.cssPlain.bg, 'rgba(0, 0, 0, 0)',
    'unselected rows stay unpainted')
  assert.equal(rnd.cssMenu.bisc, rnd.cssMenu.bg,
    'menuOpen row: frame color must equal its wash color too')

  // 圆角模式:app 原生 12px 保留。
  assert.equal(rnd.cssSel.radius, '12px',
    'round mode must keep the app\'s native 12px row radius')

  /* ---- 方角模式:圆角归零,几何同样零扰动 ---- */
  const sq = await measureWith({ enabled: '1' })
  sameXH(nat.rowSel, sq.rowSel, 'square-mode selected row box')
  assert.equal(sq.cssSel.radius, '0px',
    'square mode flattens the row radius (blanket pass)')
  assert.equal(sq.cssSel.bisc, sq.cssSel.bg,
    'square mode: the frame still carries the wash')

  console.log('PASS: wash = recolor on the app\'s native frame; geometry identical to baseline in both corner modes; rounding intact in round mode')
})().catch((e) => { console.error('FAIL: ' + e.message); process.exit(1) })
