/* Reproduce the DSH web-boot import of client.js in a vm sandbox to surface
   the real import-time exception that the crash log hides
   ("dsh-theme-endfield: import failed (see console for the import error)"). */
const fs = require('fs'), vm = require('vm'), path = require('path')
const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
function fail(msg) { console.error('FAIL ' + msg); process.exit(1) }
function pass(msg) { console.log('ok    ' + msg) }

const noopEl = () => {
  const el = {
    style: {}, dataset: {}, children: [], attrs: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    appendChild: (c) => c, removeChild: () => {}, addEventListener() {},
    attachShadow: () => ({ appendChild() {} }),
  }
  el.firstChild = el
  return el
}
const document = {
  head: noopEl(), documentElement: noopEl(), body: noopEl(),
  createElement: () => noopEl(), createTextNode: () => ({}),
  querySelector: () => null, querySelectorAll: () => [],
  getElementById: () => null, addEventListener() {},
}

const sandbox = {
  window: {
    __ModuleLoader__: null,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    innerWidth: 1440, setTimeout: () => 0, clearTimeout() {},
    location: { href: 'https://localhost/', protocol: 'https:' },
    navigator: { userAgent: 'vm-probe' },
  },
  document,
  React: { createElement: () => null, version: '18.0.0' },
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
sandbox.window.window = sandbox.window

let loaded = null
sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }

vm.createContext(sandbox)
try {
  new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox)
} catch (e) {
  fail('client.js threw while loading: ' + e.stack)
}
if (loaded === null) { fail('module never registered with __ModuleLoader__') }
pass('client.js top level executed; module registered')

let mod = null
try { mod = loaded.factory(() => null) } catch (e) { fail('factory() threw: ' + e.stack) }
pass('factory() ran')
if (typeof mod.apply !== 'function') fail('module has no apply()')

/* apply() with a minimal ctx: theme + slots only, settings disabled path. */
const ctx = {
  get: (n) => {
    if (n === 'theme') return { overrideTokens: () => () => {} }
    if (n === 'slots') return { mount: () => () => {}, define: () => {} }
    return undefined
  },
  effect: () => () => {},
  styles: { insert: () => () => {} },
}
try { mod.apply(ctx) } catch (e) { fail('apply() threw: ' + e.stack) }
pass('apply() completed without throwing')
