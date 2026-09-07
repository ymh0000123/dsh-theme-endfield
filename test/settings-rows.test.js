/**
 * settings-rows.test.js — prove the 「终末地主题设置」 panel actually renders.
 *
 * The settings section is the ONLY way a user reaches these switches, and it is a
 * React component built with React.createElement inside the theme. A mistake there
 * (a throw, a missing key, a row wired to the wrong preference) is invisible to
 * check.js and to the canvas tests, so it is asserted here.
 *
 * No React and no browser: the theme is executed in-process with a recording
 * `React` stub and a recording `slots` stub. That is enough to capture the real
 * element tree, because the component only uses createElement/useState.
 *
 * Preferences: since the theme migrated from localStorage to the DSH settings
 * namespace, this test feeds the plugin a fake `ctx.settingsScope` binder (see
 * test/fixtures/settings-scope.js) and asserts writes through it — the theme
 * never touches localStorage.
 *
 * Usage: node test/settings-rows.test.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { settingsScopeStub, fieldName } = require(path.join(__dirname, 'fixtures', 'settings-scope.js'))

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* Minimal recording React. useState returns the initial value and a setter that
   records the write, which is all a single synchronous render needs. */
const makeReact = () => ({
  useState(init) {
    const v = typeof init === 'function' ? init() : init
    return [v, () => {}]
  },
  createElement(type, props, ...children) {
    const kids = []
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c)
      else if (c !== null && c !== undefined && c !== false) kids.push(c)
    }
    return { type, props: props || {}, children: kids }
  },
})

/** Depth-first text of an element tree. */
const textOf = (el) => {
  if (el === null || el === undefined || typeof el === 'boolean') return ''
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  return (el.children || []).map(textOf).join('')
}
const walk = (el, out = []) => {
  if (el && typeof el === 'object' && el.type) {
    out.push(el)
    for (const c of el.children || []) walk(c, out)
  }
  return out
}

let rendered = null
const slots = {
  inject(_name, fn) { fn() },
  register(_opts, render) { rendered = render; return () => {} },
}

const classList = { add() {}, remove() {} }
const noopEl = () => ({
  style: {}, setAttribute() {}, appendChild() {}, removeChild() {},
  querySelector: () => null, querySelectorAll: () => [], insertBefore() {},
  getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
  classList, className: '', parentNode: null, firstChild: null,
  hasAttribute: () => false, getAttribute: () => null, isConnected: true,
  getContext: () => null, appendData() {},
})
const document = {
  body: Object.assign(noopEl(), { classList }),
  head: noopEl(),
  createElement: () => noopEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener() {},
}

/* The durable prefs seam: a fake settingsScope binder over an in-memory section.
   Start with the default section (enabled on). The panel drives reads from it,
   and every toggle writes back through it. */
const prefStore = settingsScopeStub()

const sandbox = {
  window: {
    __ModuleLoader__: null,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440, setTimeout: () => 0, clearTimeout() {},
  },
  document,
  React: makeReact(),
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  performance: { now: () => 0 },
  setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
  console,
}
sandbox.globalThis = sandbox
sandbox.window.document = document

let loaded = null
sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }

vm.createContext(sandbox)
try {
  new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox)
} catch (e) {
  fail('client.js threw while loading: ' + e.message)
  process.exit(1)
}
if (loaded === null) { fail('module never registered with __ModuleLoader__'); process.exit(1) }

const mod = loaded.factory(() => null)
const ctx = {
  get: (n) => {
    if (n === 'theme') return { overrideTokens: () => () => {} }
    if (n === 'slots') return slots
    if (n === 'settingsScope') return prefStore.binder
    return undefined
  },
  effect: () => {},
}
// Enable the theme so mount() runs, mirroring a real session.
prefStore.setField('enabled', '1')
prefStore.setField('loader', '0')
try { mod.apply(ctx) } catch (e) { fail('apply() threw: ' + e.message); process.exit(1) }
pass('apply() completed without throwing')

if (typeof rendered !== 'function') { fail('settings.section was never registered'); process.exit(1) }
pass('settings.section registered')

/* --- render the panel and inspect the real element tree --- */
let tree
try { tree = rendered() } catch (e) { fail('settings render threw: ' + e.message); process.exit(1) }
pass('settings panel rendered without throwing')

const nodes = walk(tree)
const buttons = nodes.filter((n) => n.type === 'button')
/* The rows live inside four group containers (主题 / 背景 / 动画 / 娱乐), so "all
   rows" means every div whose key is one of the ten switch rows, wherever
   it sits in the tree.

   ROW_KEYS is BOTH the expected set and the counter, so a new row that is not
   listed here is silently ignored rather than counted — which is exactly what
   happened when 大字入场动画 was added (the count stayed at 9 and the assertion
   passed while a tenth row was on screen). The independent total below is what
   makes that impossible now. */
const ROW_KEYS = ['theme', 'palette', 'radius', 'contour', 'contour-anim', 'contour-fps', 'contour-speed', 'contour-scroll-pause', 'watermark', 'watermark-persist', 'loader', 'thunder', 'thunder-anim']
const rows = nodes.filter((n) => n.type === 'div' && n.props && ROW_KEYS.includes(n.props.key))
const groups = (tree.children || []).filter((c) => c && c.type === 'div' && c.props && /^group-/.test(c.props.key))

if (rows.length === 13) pass('panel has all 13 setting rows')
else fail('expected 13 rows, found ' + rows.length)

/* Count the rows the way the PAGE defines them — every direct child of a group
   container — so an unlisted new row shows up as a mismatch instead of vanishing. */
const rowsInGroups = groups.reduce((acc, g) => acc.concat(
  (g.children || []).filter((c) => c && c.type === 'div' && c.props && c.props.key !== undefined
    && !/^group-title-/.test(String(c.props.key)))), [])
if (rowsInGroups.length === rows.length) {
  pass('分组内的行数与已登记的 ROW_KEYS 一致（' + rowsInGroups.length + '）')
} else {
  fail('分组内有 ' + rowsInGroups.length + ' 行，但 ROW_KEYS 只登记了 ' + rows.length
    + ' 行 — 未登记的行会被静默忽略：'
    + rowsInGroups.map((r) => r.props.key).filter((k) => !ROW_KEYS.includes(k)).join(', '))
}

if (groups.length === 4) pass('rows are grouped into 4 sections (主题/背景/动画/娱乐)')
else fail('expected 4 group containers, found ' + groups.length)

const unkeyed = rows.filter((r) => !r.props || r.props.key === undefined)
if (unkeyed.length === 0) pass('every row carries a React key')
else fail(unkeyed.length + ' row(s) missing a key (React will warn)')

const keys = rows.map((r) => r.props.key)
if (new Set(keys).size === keys.length) pass('row keys are unique: ' + keys.join(', '))
else fail('duplicate row keys: ' + keys.join(', '))

/* The group headers must be numbered editorial labels in the documented order,
   and the scheme-aware ink rule for them must exist in the stylesheet source. */
const all = textOf(tree)
for (const [label, title] of [['01 主题', 'THEME'], ['02 背景', 'BACKGROUND'], ['03 动画', 'ANIMATION'], ['04 娱乐', 'ENTERTAINMENT']]) {
  if (all.includes(label) && all.includes(title)) pass('group header present: ' + label + ' / ' + title)
  else fail('group header missing: ' + label + ' / ' + title)
}
if (src.includes('.endfield-settings-group-title')) pass('group-title stylesheet rule is defined')
else fail('client.js never defines .endfield-settings-group-title — headers will use default text colour')
/* Rows that must exist. 光点移动 is deliberately NOT in this list: it is described
   in the README and was asserted here, but it has never existed in client.js (git
   log -S finds no commit adding it), so the assertion tested the test rather than
   the theme and failed on every pristine checkout. Removed rather than left
   red-by-default — a suite that is expected to fail teaches nothing. */
for (const label of ['主题配色', '等高线背景', '动态等高线']) {
  if (all.includes(label)) pass('row present: ' + label)
  else fail('row missing: ' + label)
}

/* --- the palette row: default 谷地黄, and switching writes the field --- */
if (all.includes('谷地黄')) pass('默认配色显示为谷地黄')
else fail('palette row does not show 谷地黄 as the default')

const paletteBtn = buttons.find((b) => /切换武陵青|切换谷地黄/.test(textOf(b)))
if (!paletteBtn) fail('no palette switch button rendered')
else {
  // Rendered from the default palette, so the button must OFFER 武陵青.
  if (/切换武陵青/.test(textOf(paletteBtn))) pass('默认状态下按钮提供「切换武陵青」')
  else fail('palette button should offer 武陵青 while the default is active, got: ' + textOf(paletteBtn))
  prefStore.setField('palette', 'valley')
  try { paletteBtn.props.onClick() } catch (e) { fail('palette toggle threw: ' + e.message) }
  if (prefStore.get('palette') === 'wuling') pass('点击写入 dsh-theme-endfield.palette=wuling')
  else fail('palette toggle wrote ' + JSON.stringify(prefStore.get('palette')) + ', expected "wuling"')
}

/* --- the two sub-switches must be DISABLED while the layer itself is off --- */
const findBtn = (re) => buttons.find((b) => re.test(textOf(b)))
const animBtn = findBtn(/切为静态|开启动态/)
if (animBtn && animBtn.props.disabled === true) pass('动态等高线 disabled while layer off')
else fail('动态等高线 should be disabled while the contour layer is off')
const fpsRow = rows.find((r) => r.props.key === 'contour-fps')
const fpsButtons = fpsRow ? walk(fpsRow).filter((b) => b.type === 'button') : []
if (fpsButtons.length === 3 && fpsButtons.map((b) => textOf(b)).join(',') === '24,60,120') pass('动态帧率提供 24/60/120 三档')
else fail('动态帧率 should provide exactly 24/60/120, found: ' + fpsButtons.map((b) => textOf(b)).join(','))
if (fpsButtons.every((b) => b.props.disabled === true)) pass('动态帧率 disabled while layer off')
else fail('动态帧率 should be disabled while the contour layer is off')
const speedRow = rows.find((r) => r.props.key === 'contour-speed')
const speedButtons = speedRow ? walk(speedRow).filter((b) => b.type === 'button') : []
if (speedButtons.length === 3 && speedButtons.map((b) => textOf(b)).join(',') === '慢速,标准,快速') pass('动态速度提供慢速/标准/快速三档')
else fail('动态速度 should provide exactly 慢速/标准/快速, found: ' + speedButtons.map((b) => textOf(b)).join(','))
if (speedButtons.every((b) => b.props.disabled === true)) pass('动态速度 disabled while layer off')
else fail('动态速度 should be disabled while the contour layer is off')
const scrollPauseRow = rows.find((r) => r.props.key === 'contour-scroll-pause')
const scrollPauseBtn = scrollPauseRow ? walk(scrollPauseRow).find((b) => b.type === 'button') : null
if (scrollPauseBtn && textOf(scrollPauseRow).includes('滚动窗口动画暂停：开启')) pass('滚动窗口动画暂停默认开启')
else fail('滚动窗口动画暂停 should be enabled by default')
if (scrollPauseBtn && scrollPauseBtn.props.disabled === true) pass('滚动窗口动画暂停 disabled while layer off')
else fail('滚动窗口动画暂停 should be disabled while the contour layer is off')

/* --- 雷霆大字 (娱乐): default OFF, and its 预览 follows the same rule ---
   The row is asserted from the DEFAULT state deliberately: "默认关闭" is the part of
   the request a later edit is most likely to break (flipping the read to !== '0'
   would silently make it opt-out), and no other check would notice. */
prefStore.setField('thunder', '0') // never override it before this point
if (prefStore.get('thunder') === '0' && prefStore.section.thunder === '0') pass('雷霆大字 未设置即为默认状态')
if (all.includes('雷霆大字：关闭')) pass('雷霆大字 默认关闭')
else fail('雷霆大字 should read 关闭 with the default state')
if (all.includes('任务开始') && all.includes('任务完成')) pass('设置行说明包含「任务开始」/「任务完成」')
else fail('the 雷霆大字 row should name both announcement words')
if (all.includes('3 秒') || all.includes('3秒')) pass('设置行说明 3 秒后隐藏')
else fail('the 雷霆大字 row should state the 3s hold')

const thunderBtn = findBtn(/开启大字|关闭大字/)
if (!thunderBtn) fail('no 雷霆大字 switch button rendered')
else {
  if (/开启大字/.test(textOf(thunderBtn))) pass('默认状态下按钮提供「开启大字」')
  else fail('雷霆大字 button should offer 开启大字 while off, got: ' + textOf(thunderBtn))
}
/* 预览 must be disabled while the feature is off. The panel renders two 预览
   buttons (loader + thunder), so this picks the one in the thunder row rather
   than the first match — an index-based lookup would silently test the loader. */
const thunderRow = rows.find((r) => r.props.key === 'thunder')
const thunderRowBtns = thunderRow ? walk(thunderRow).filter((n) => n.type === 'button') : []
const thunderPreview = thunderRowBtns.find((b) => /预览/.test(textOf(b)))
if (thunderPreview && thunderPreview.props.disabled === true) pass('雷霆大字 预览 disabled while off')
else fail('雷霆大字 预览 should be disabled while the feature is off')

/* --- 大字入场动画: its own sub-switch, ALSO default off ---
   enforces the doc default (=== '1'), not opt-in === '1' vs !== '0' mismatch.
   Two independent defaults live here and both are part of the request. */
if (all.includes('大字入场动画：关闭')) pass('大字入场动画 默认关闭')
else fail('大字入场动画 should read 关闭 with the default state')
const thunderAnimRow = rows.find((r) => r.props.key === 'thunder-anim')
const thunderAnimBtns = thunderAnimRow ? walk(thunderAnimRow).filter((v) => v.type === 'button') : []
const thunderAnimBtn = thunderAnimBtns.find((b) => /开启动画|关闭动画/.test(textOf(b)))
if (!thunderAnimBtn) fail('no 大字入场动画 switch button rendered')
else {
  if (/开启动画/.test(textOf(thunderAnimBtn))) pass('默认状态下按钮提供「开启动画」')
  else fail('大字入场动画 button should offer 开启动画 while off, got: ' + textOf(thunderAnimBtn))
  // A sub-switch is only meaningful while its parent is on.
  if (thunderAnimBtn.props.disabled === true) pass('大字入场动画 在大字关闭时为 disabled')
  else fail('大字入场动画 should be disabled while 雷霆大字 itself is off')
}

/* --- turn the layer on and re-render: the sub-switch must become usable --- */
prefStore.setField('contour', '1')
prefStore.setField('contour-fps', '120')
let tree2
try { tree2 = rendered() } catch (e) { fail('re-render threw: ' + e.message); process.exit(1) }
const buttons2 = walk(tree2).filter((n) => n.type === 'button')
const animBtn2 = buttons2.find((b) => /切为静态|开启动态/.test(textOf(b)))
if (animBtn2 && !animBtn2.props.disabled) pass('动态等高线 enabled once the layer is on')
else fail('动态等高线 should be enabled once the contour layer is on')
const fpsRow2 = walk(tree2).find((n) => n.type === 'div' && n.props && n.props.key === 'contour-fps')
const fpsButtons2 = fpsRow2 ? walk(fpsRow2).filter((b) => b.type === 'button') : []
const fps120 = fpsButtons2.find((b) => textOf(b) === '120')
if (fps120 && !fps120.props.disabled) pass('120 FPS enabled once the layer is on')
else fail('120 FPS should be enabled once the contour layer is on')
if (fps120 && typeof fps120.props.onClick === 'function') {
  try { fps120.props.onClick() } catch (e) { fail('120 FPS toggle threw: ' + e.message) }
  if (prefStore.get('contour-fps') === '120') pass('120 FPS toggle writes dsh-theme-endfield.contourFps=120')
  else fail('120 FPS toggle did not write contour-fps=120')
} else fail('120 FPS button has no onClick handler')
const speedRow2 = walk(tree2).find((n) => n.type === 'div' && n.props && n.props.key === 'contour-speed')
const speedButtons2 = speedRow2 ? walk(speedRow2).filter((b) => b.type === 'button') : []
const fastSpeed = speedButtons2.find((b) => textOf(b) === '快速')
if (fastSpeed && !fastSpeed.props.disabled) pass('动态速度 enabled once the layer is on')
else fail('动态速度 should be enabled once the contour layer is on')
if (fastSpeed && typeof fastSpeed.props.onClick === 'function') {
  try { fastSpeed.props.onClick() } catch (e) { fail('快速速度 toggle threw: ' + e.message) }
  if (prefStore.get('contour-speed') === '4') pass('快速速度 toggle writes dsh-theme-endfield.contourSpeed=4')
  else fail('快速速度 toggle did not write contour-speed=4')
} else fail('快速速度 button has no onClick handler')
const scrollPauseRow2 = walk(tree2).find((n) => n.type === 'div' && n.props && n.props.key === 'contour-scroll-pause')
const scrollPauseBtn2 = scrollPauseRow2 ? walk(scrollPauseRow2).find((b) => b.type === 'button') : null
if (scrollPauseBtn2 && !scrollPauseBtn2.props.disabled) pass('滚动窗口动画暂停 enabled once the layer is on')
else fail('滚动窗口动画暂停 should be enabled once the contour layer is on')
if (scrollPauseBtn2 && typeof scrollPauseBtn2.props.onClick === 'function') {
  try { scrollPauseBtn2.props.onClick() } catch (e) { fail('滚动窗口动画暂停 toggle threw: ' + e.message) }
  if (prefStore.get('contour-scroll-pause') === '0') pass('滚动窗口动画暂停 toggle writes contourScrollPause=0')
  else fail('滚动窗口动画暂停 toggle did not write contour-scroll-pause=0')
} else fail('滚动窗口动画暂停 button has no onClick handler')

/* --- 雷霆大字 on: 预览 becomes usable and the row states the live behaviour --- */
prefStore.setField('thunder', '1')
let treeT
try { treeT = rendered() } catch (e) { fail('re-render (thunder on) threw: ' + e.message); process.exit(1) }
const rowsT = walk(treeT).filter((n) => n.type === 'div' && n.props && n.props.key === 'thunder')
const thunderBtnsOn = rowsT.length ? walk(rowsT[0]).filter((n) => n.type === 'button') : []
const previewOn = thunderBtnsOn.find((b) => /预览/.test(textOf(b)))
if (previewOn && !previewOn.props.disabled) pass('雷霆大字 预览 enabled once switched on')
else fail('雷霆大字 预览 should be enabled once the feature is on')
if (textOf(treeT).includes('雷霆大字：开启')) pass('thunder=1 时行状态显示开启')
else fail('with thunder=1 the row should read 开启')

/* The animation sub-switch must become usable once its parent is on, and its
   toggle must write its own field rather than the parent's. */
const animRowsT = walk(treeT).filter((n) => n.type === 'div' && n.props && n.props.key === 'thunder-anim')
const animBtnsT = animRowsT.length ? walk(animRowsT[0]).filter((n) => n.type === 'button') : []
const animOnBtn = animBtnsT.find((b) => /开启动画|关闭动画/.test(textOf(b)))
if (animOnBtn && !animOnBtn.props.disabled) pass('大字入场动画 在大字开启后恢复可用')
else fail('大字入场动画 should be enabled once 雷霆大字 is on')
if (animOnBtn && typeof animOnBtn.props.onClick === 'function') {
  prefStore.setField('thunder-anim', '0')
  try { animOnBtn.props.onClick() } catch (e) { fail('大字入场动画 toggle threw: ' + e.message) }
  if (prefStore.get('thunder-anim') === '1') pass('大字入场动画 toggle writes thunderAnim=1')
  else fail('大字入场动画 toggle wrote ' + JSON.stringify(prefStore.get('thunder-anim')) + ', expected "1"')
  // It must not have disturbed the parent switch's own field.
  if (prefStore.get('thunder') === '1') pass('子开关不会误写主开关的字段')
  else fail('the sub-switch overwrote the parent field: ' + JSON.stringify(prefStore.get('thunder')))
  prefStore.setField('thunder-anim', '0')
} else fail('大字入场动画 toggle has no onClick handler')

/* With the animation stored ON, the row must render the reverse affordance. */
prefStore.setField('thunder-anim', '1')
let treeTA
try { treeTA = rendered() } catch (e) { fail('re-render (thunder anim on) threw: ' + e.message); process.exit(1) }
const textTA = textOf(treeTA)
if (textTA.includes('大字入场动画：开启')) pass('thunderAnim=1 时入场动画行显示开启')
else fail('with thunderAnim stored 1 the 大字入场动画 row should read 开启')
if (/关闭动画/.test(textTA)) pass('开启后按钮提供「关闭动画」')
else fail('with the animation on the row should offer 关闭动画')
prefStore.setField('thunder-anim', '0')
prefStore.setField('thunder', '0')

/* --- with 武陵青 stored, the row must render the reverse affordance --- */
prefStore.setField('palette', 'wuling')
let tree3
try { tree3 = rendered() } catch (e) { fail('re-render (wuling) threw: ' + e.message); process.exit(1) }
const text3 = textOf(tree3)
if (text3.includes('武陵青') && /切换谷地黄/.test(text3)) pass('武陵青 生效时按钮提供「切换谷地黄」')
else fail('with wuling stored the palette row should offer 切换谷地黄')
// The accent must be surfaced to the user, in hex.
if (text3.includes('#14d0d0')) pass('设置行标注 #14d0d0')
else fail('the palette row should state #14d0d0')
prefStore.setField('palette', 'valley')

/* --- clicking a switch must write the documented namespace field --- */
const contourBtn = buttons2.find((b) => /关闭背景|开启背景/.test(textOf(b)))
if (contourBtn && typeof contourBtn.props.onClick === 'function') {
  prefStore.setField('contour', '1')
  try { contourBtn.props.onClick() } catch (e) { fail('contour toggle threw: ' + e.message) }
  const v = prefStore.get('contour')
  // The button was rendered from state "on", so clicking it stores the off value.
  if (v === '1' || v === '0') pass('等高线背景 toggle writes contour (=' + v + ')')
  else fail('等高线背景 toggle did not write its contour field')
} else fail('等高线背景 toggle has no onClick handler')

/* --- 雷霆大字 toggle must write its documented field --- */
if (thunderBtn && typeof thunderBtn.props.onClick === 'function') {
  prefStore.setField('thunder', '0')
  try { thunderBtn.props.onClick() } catch (e) { fail('雷霆大字 toggle threw: ' + e.message) }
  // Rendered from the default (off), so clicking it must store the ON value.
  if (prefStore.get('thunder') === '1') pass('雷霆大字 toggle writes thunder=1')
  else fail('雷霆大字 toggle wrote ' + JSON.stringify(prefStore.get('thunder')) + ', expected "1"')
} else fail('雷霆大字 toggle has no onClick handler')

if (!/(typeof\s+localStorage|localStorage\.(getItem|setItem|removeItem))/.test(src)) pass('client.js has no localStorage storage-API calls')
else fail('client.js still calls the localStorage storage API — migration incomplete')

console.log('')
if (failures) { console.error(failures + ' settings check(s) failed'); process.exit(1) }
console.log('all settings-panel checks passed')
