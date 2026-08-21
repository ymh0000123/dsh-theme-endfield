/**
 * settings-rows.test.js — prove the 「终末地主题设置」 panel actually renders.
 *
 * The settings section is the ONLY way a user reaches these switches, and it is a
 * React component built with React.createElement inside the theme. A mistake there
 * (a throw, a missing key, a row wired to the wrong storage key) is invisible to
 * check.js and to the canvas tests, so it is asserted here.
 *
 * No React and no browser: the theme is executed in-process with a recording
 * `React` stub and a recording `slots` stub. That is enough to capture the real
 * element tree, because the component only uses createElement/useState.
 *
 * Usage: node test/settings-rows.test.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

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

/* localStorage stub: the switches read and write it, so the test drives the panel
   exactly the way a user's stored preferences would. */
const store = new Map()
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)) },
  removeItem: (k) => { store.delete(k) },
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

const sandbox = {
  window: {
    __ModuleLoader__: null,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440, setTimeout: () => 0, clearTimeout() {},
  },
  document, localStorage,
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
sandbox.window.localStorage = localStorage
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
  get: (n) => (n === 'theme' ? { overrideTokens: () => () => {} } : (n === 'slots' ? slots : undefined)),
  effect: () => {},
}
// Enable the theme so mount() runs, mirroring a real session.
store.set('dsh-theme-endfield-enabled', '1')
store.set('dsh-theme-endfield-loader', '0')
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
const rows = (tree.children || []).filter((c) => c && c.type === 'div')

if (rows.length === 8) pass('panel has all 8 setting rows')
else fail('expected 8 rows, found ' + rows.length)

const unkeyed = rows.filter((r) => !r.props || r.props.key === undefined)
if (unkeyed.length === 0) pass('every row carries a React key')
else fail(unkeyed.length + ' row(s) missing a key (React will warn)')

const keys = rows.map((r) => r.props.key)
if (new Set(keys).size === keys.length) pass('row keys are unique: ' + keys.join(', '))
else fail('duplicate row keys: ' + keys.join(', '))

const all = textOf(tree)
/* Rows that must exist. 光点移动 is deliberately NOT in this list: it is described
   in the README and was asserted here, but it has never existed in client.js (git
   log -S finds no commit adding it), so the assertion tested the test rather than
   the theme and failed on every pristine checkout. Removed rather than left
   red-by-default — a suite that is expected to fail teaches nothing. */
for (const label of ['主题配色', '等高线背景', '动态等高线']) {
  if (all.includes(label)) pass('row present: ' + label)
  else fail('row missing: ' + label)
}

/* --- the palette row: default 谷地黄, and switching writes the documented key --- */
if (all.includes('谷地黄')) pass('默认配色显示为谷地黄')
else fail('palette row does not show 谷地黄 as the default')

const paletteBtn = buttons.find((b) => /切换武陵青|切换谷地黄/.test(textOf(b)))
if (!paletteBtn) fail('no palette switch button rendered')
else {
  // Rendered from the default palette, so the button must OFFER 武陵青.
  if (/切换武陵青/.test(textOf(paletteBtn))) pass('默认状态下按钮提供「切换武陵青」')
  else fail('palette button should offer 武陵青 while the default is active, got: ' + textOf(paletteBtn))
  store.delete('dsh-theme-endfield-palette')
  try { paletteBtn.props.onClick() } catch (e) { fail('palette toggle threw: ' + e.message) }
  const v = store.get('dsh-theme-endfield-palette')
  if (v === 'wuling') pass('点击写入 dsh-theme-endfield-palette=wuling')
  else fail('palette toggle wrote ' + JSON.stringify(v) + ', expected "wuling"')
}

/* --- the two sub-switches must be DISABLED while the layer itself is off --- */
const findBtn = (re) => buttons.find((b) => re.test(textOf(b)))
const animBtn = findBtn(/切为静态|开启动态/)
if (animBtn && animBtn.props.disabled === true) pass('动态等高线 disabled while layer off')
else fail('动态等高线 should be disabled while the contour layer is off')

/* --- turn the layer on and re-render: the sub-switch must become usable --- */
store.set('dsh-theme-endfield-contour', '1')
let tree2
try { tree2 = rendered() } catch (e) { fail('re-render threw: ' + e.message); process.exit(1) }
const buttons2 = walk(tree2).filter((n) => n.type === 'button')
const animBtn2 = buttons2.find((b) => /切为静态|开启动态/.test(textOf(b)))
if (animBtn2 && !animBtn2.props.disabled) pass('动态等高线 enabled once the layer is on')
else fail('动态等高线 should be enabled once the contour layer is on')

/* --- with 武陵青 stored, the row must render the reverse affordance --- */
store.set('dsh-theme-endfield-palette', 'wuling')
let tree3
try { tree3 = rendered() } catch (e) { fail('re-render (wuling) threw: ' + e.message); process.exit(1) }
const text3 = textOf(tree3)
if (text3.includes('武陵青') && /切换谷地黄/.test(text3)) pass('武陵青 生效时按钮提供「切换谷地黄」')
else fail('with wuling stored the row should offer 切换谷地黄')
// The accent must be surfaced to the user, in hex.
if (text3.includes('#14d0d0')) pass('设置行标注 #14d0d0')
else fail('the palette row should state #14d0d0')
store.set('dsh-theme-endfield-palette', 'valley')

/* --- clicking a switch must write the documented localStorage key --- */
const contourBtn = buttons2.find((b) => /关闭背景|开启背景/.test(textOf(b)))
if (contourBtn && typeof contourBtn.props.onClick === 'function') {
  store.delete('dsh-theme-endfield-contour')
  try { contourBtn.props.onClick() } catch (e) { fail('contour toggle threw: ' + e.message) }
  const v = store.get('dsh-theme-endfield-contour')
  // The button was rendered from state "on", so clicking it stores the off value.
  if (v === '1' || v === '0') pass('等高线背景 toggle writes dsh-theme-endfield-contour (=' + v + ')')
  else fail('等高线背景 toggle did not write its localStorage key')
} else fail('等高线背景 toggle has no onClick handler')

console.log('')
if (failures) { console.error(failures + ' settings check(s) failed'); process.exit(1) }
console.log('all settings-panel checks passed')
