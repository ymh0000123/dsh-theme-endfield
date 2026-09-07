/**
 * settings-durable-hold.test.js — regression: prefs committed while the theme
 * namespace is NOT yet durably served must be HELD, not silently dropped, and
 * replayed the moment the scope becomes ready.
 *
 * Bug it guards (the `commit ... status= unavailable mode= host` warn):
 * a client that gates a settings write on `snap.writable` alone will fire
 * scope.set into a scope whose snapshot reports { writable:true, mode:'host',
 * status:'unavailable' }. That specific combination means the Host's describe
 * view exists but does not YET list our namespace (the host half has not run
 * ctx.settings.register, or the mirror fetched before it appeared). The old
 * client code wrote anyway, cleared its dirty mark, and emitted a misleading
 * "commit … status= unavailable" — the preference kept working for the page
 * session but vanished on the next reload.
 *
 * The fix holds the edit (keeps it dirty, page-local) while the scope is not
 * durably served, and replays it automatically when the snapshot flips to
 * status:'ready'. This test drives the real client.js apply() through a
 * two-phase fake `ctx.settingsScope` whose snapshot starts 'unavailable' and
 * later becomes 'ready', exactly like a Host registration that settles after
 * the mirror's first describe. Mirrors the no-browser harness of
 * settings-rows.test.js.
 *
 * Usage: node test/settings-durable-hold.test.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

const FIELD_DEFAULTS = {
  enabled: '1', palette: 'valley', radius: 'square', contour: '0',
  contourAnim: '1', contourFps: '24', contourSpeed: '2',
  contourScrollPause: '1', watermark: '1', watermarkPersist: '0',
  loader: '0', thunder: '0', thunderAnim: '0',
}

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* Recording React — useState returns the current session value (via the fake
   binder's read) plus a setter that only forces a re-render (never used here:
   each callable comes from a single synchronous render). */
const makeReact = () => ({
  useState(init) { return [typeof init === 'function' ? init() : init, () => {}] },
  createElement(type, props, ...children) {
    const kids = []
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c)
      else if (c !== null && c !== undefined && c !== false) kids.push(c)
    }
    return { type, props: props || {}, children: kids }
  },
})
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

/* --------------------------------- states ---------------------------------
   Phase A (namespace unserved): the mirror has a Host view (host mode answers
   writable), but `dsh-theme-endfield` is not among its served namespaces, so
   the scope derives status:'unavailable' with no decoded value. This is the
   exact `status= unavailable mode= host, yet writable` scenario from the bug.
   Phase B (namespace served): a later Host registration committed the document,
   the mirror reloaded, and the namespace now decodes a value -> status:'ready'.
   A set() during phase A must record a WIRE write (fails the test if the old
   bug fires one). We keep value merged from section in phase B. */
function makeTwoPhaseScope() {
  const section = Object.assign({}, FIELD_DEFAULTS)
  let served = false
  let listeners = []
  const wireWrites = []
  const snapshot = () => {
    if (!served) return { status: 'unavailable', value: undefined, base: undefined, user: undefined, revision: undefined, writable: true, mode: 'host' }
    return { status: 'ready', value: Object.assign({}, section), base: Object.assign({}, FIELD_DEFAULTS), user: Object.assign({}, section), revision: 1, writable: true, mode: 'host' }
  }
  const scope = {
    getSnapshot: snapshot,
    subscribe(l) { listeners.push(l); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1) } },
    set(field, value) {
      wireWrites.push([field, String(value)])
      if (served) section[field] = String(value)
      for (const l of listeners.slice()) { try { l() } catch (e) { /* keep going */ } }
    },
  }
  const binder = { bind() { return scope } }
  return {
    binder, scope,
    get wireWrites() { return wireWrites.slice() },
    /** Flip the namespace into the Host's served list; listeners fire as a real
        snapshot replacement would. */
    serve() {
      if (served) return
      served = true
      for (const l of listeners.slice()) { try { l() } catch (e) { /* keep going */ } }
    },
    get served() { return served },
    wireValue: (field) => (section[field] !== undefined ? String(section[field]) : undefined),
  }
}

let rendered = null
const slots = {
  inject(_n, fn) { fn() },
  register(_o, render) { rendered = render; return () => {} },
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
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
  addEventListener() {}, removeEventListener() {},
}

const scope2 = makeTwoPhaseScope()
const sandbox = {
  window: {
    __ModuleLoader__: null, addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }), innerWidth: 1440,
    setTimeout: () => 0, clearTimeout() {},
  },
  document,
  React: makeReact(),
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  performance: { now: () => 0 },
  setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
  console,
}
sandbox.globalThis = sandbox
sandbox.window.document = document

let loaded = null
sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }
vm.createContext(sandbox)
try { new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox) }
catch (e) { fail('client.js threw while loading: ' + e.message); process.exit(1) }
if (loaded === null) { fail('module never registered with __ModuleLoader__'); process.exit(1) }

const mod = loaded.factory(() => null)
const ctx = {
  get: (n) => {
    if (n === 'theme') return { overrideTokens: () => () => {} }
    if (n === 'slots') return slots
    if (n === 'settingsScope') return scope2.binder
    return undefined
  },
  effect: () => {},
}
try { mod.apply(ctx) } catch (e) { fail('apply() threw: ' + e.message); process.exit(1) }
pass('apply() completed with the namespace still unserved (unavailable, writable, host)')

if (typeof rendered !== 'function') { fail('settings.section was never registered'); process.exit(1) }
const tree = rendered()
const buttons = walk(tree).filter((n) => n.type === 'button')
const findBtn = (re) => buttons.find((b) => re.test(textOf(b)))

/* The reported symptom was radius=round and palette=wuling. Toggle BOTH while
   the namespace is unserved; the old bug would fire scope.set for each. */
const radiusBtn = findBtn(/切换直角|切换圆角/)
if (!radiusBtn) { fail('no radius toggle button rendered'); process.exit(1) }
try { radiusBtn.props.onClick() } catch (e) { fail('radius toggle threw: ' + e.message) }

const paletteRow = buttons.filter((b) => /切换武陵青|切换谷地黄/.test(textOf(b)))[0]
if (!paletteRow) { fail('no palette toggle button rendered'); process.exit(1) }
try { paletteRow.props.onClick() } catch (e) { fail('palette toggle threw: ' + e.message) }

/* Phase A: nothing durable yet, so NOTHING may reach the wire and both edits
   must be HELD (page-local) for the later replay. `section` in this fake always
   carries schema defaults, so "not yet persisted" is proven by there being no
   scope.set on the wire at all — the assertion just above. */
if (scope2.wireWrites.length === 0) pass('no scope.set fired while the namespace was unserved')
else fail('commit leaked to the wire while status= unavailable: ' + JSON.stringify(scope2.wireWrites))

/* Phase B: the host half finally registers the namespace, the document commits,
   the mirror reloads and the scope snapshot flips to ready. The subscribe
   handler must replay the two held edits automatically. */
scope2.serve()
if (scope2.served === true) pass('served the namespace: snapshot flipped to ready')

const writes = scope2.wireWrites
const palReplayed = writes.some(([f, v]) => f === 'palette' && v === 'wuling')
const radReplayed = writes.some(([f, v]) => f === 'radius' && v === 'round')
if (palReplayed) pass('held palette=wuling replayed once the namespace became ready')
else fail('palette=wuling was never replayed; write list = ' + JSON.stringify(writes))
if (radReplayed) pass('held radius=round replayed once the namespace became ready')
else fail('radius=round was never replayed; write list = ' + JSON.stringify(writes))
if (scope2.wireValue('radius') === 'round' && scope2.wireValue('palette') === 'wuling') pass('host section now holds both held edits')
else fail('host section did not receive both edits: radius=' + scope2.wireValue('radius') + ' palette=' + scope2.wireValue('palette'))

if (failures === 0) pass('all durable-hold checks passed')
else { console.error('\n' + failures + ' durable-hold check(s) FAILED'); process.exit(1) }
