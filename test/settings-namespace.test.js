/**
 * settings-namespace.test.js — the settings namespace is read and written under
 * the names the HOST registered, and a section the buggy build wrote is repaired.
 *
 * Bug it guards (issue #15):
 *   `fix(settings): persist theme prefs via DSH settings namespace reliably`
 *   (e504199) started persisting through `ctx.settingsScope`, but derived the
 *   storage field by STRIPPING the namespace prefix off the UI key:
 *
 *       'dsh-theme-endfield-thunder-anim' -> 'thunder-anim'
 *
 *   while the host registers camelCase fields (index.js FIELD_DEFAULTS:
 *   `thunderAnim`). So the write landed on a key the schema does not declare.
 *   schemastery validates declared fields and passes extras through, so the
 *   document really did receive `thunder-anim: "1"` — and `thunderAnim` stayed at
 *   its default. The switch worked for the page session and reset on the next
 *   load. Six compound fields were affected: thunderAnim, contourAnim,
 *   contourFps, contourSpeed, contourScrollPause, watermarkPersist.
 *
 * Why no earlier test caught it: the settings tests fed the theme a fake scope
 * whose section was keyed by the SAME wrong spelling (the fixture stripped the
 * prefix too), so the client's read and the fixture's write agreed on a name
 * that exists nowhere in the schema. Both sides green, production broken. This
 * file therefore does not trust either side's spelling on its own:
 *
 *   1. it cross-checks the client mapping against the HOST SCHEMA (index.js
 *      FIELD_DEFAULTS) and against the toggles actually rendered by the panel;
 *   2. it drives the real toggles against a section keyed exactly like the host's;
 *   3. it reproduces the shipped bug — a section carrying the pre-migration
 *      spelling — and asserts the stored choice is recovered onto the declared
 *      field.
 *
 * The other two findings in the same issue are covered at the bottom: an edit
 * must be visible immediately (not after the host round-trip), and reverting a
 * field to its default while the namespace is not yet served must not be
 * swallowed.
 *
 * Usage: node test/settings-namespace.test.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { settingsScopeStub, FIELD_DEFAULTS, KEY_TO_FIELD, fieldName } =
  require(path.join(__dirname, 'fixtures', 'settings-scope.js'))
const HOST = require(path.join(__dirname, '..', 'index.js'))

const ROOT = path.resolve(__dirname, '..')
const rawSrc = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* ======================================================================
   1. The mapping itself: client table vs the HOST schema vs the panel
   ====================================================================== */

/* From the real client source, not from a copy of it. */
const clientTable = (() => {
  const m = /const PREFS_KEY_TO_FIELD = \{([\s\S]*?)\n    \}/.exec(rawSrc)
  if (!m) return null
  const out = {}
  const re = /'(dsh-theme-endfield-[a-z-]+)':\s*'([A-Za-z]+)'/g
  let hit
  while ((hit = re.exec(m[1])) !== null) out[hit[1]] = hit[2]
  return out
})()

if (clientTable === null) {
  fail('could not read PREFS_KEY_TO_FIELD out of client.js — the table is the thing under test')
  process.exit(1)
}

/* The host's declared fields are the only names a scope.set can store. */
const hostFields = Object.keys(HOST.FIELD_DEFAULTS)
const badFields = Object.values(clientTable).filter((f) => !hostFields.includes(f))
if (badFields.length === 0) {
  pass(`every key the client maps names a field the host declares (${Object.keys(clientTable).length} keys)`)
} else {
  fail('client maps keys onto fields the host does NOT declare: ' + badFields.join(', ')
    + ' -> those writes land on undeclared keys and the declared field keeps its default')
}

if (Object.keys(clientTable).length === hostFields.length) {
  pass('the mapping covers every declared field')
} else {
  fail('mapping has ' + Object.keys(clientTable).length + ' keys for ' + hostFields.length + ' declared fields')
}

/* The old derivation — strip the prefix — must NOT be the mapping for any
   compound field, or the bug is back in a different costume. */
const derivedWrong = Object.keys(clientTable).filter((k) => clientTable[k] === k.slice('dsh-theme-endfield-'.length) && k.slice('dsh-theme-endfield-'.length) !== clientTable[k])
const keptIdentity = Object.keys(clientTable).filter((k) => k.slice('dsh-theme-endfield-'.length) === clientTable[k]).length
if (derivedWrong.length === 0 && keptIdentity < Object.keys(clientTable).length) {
  pass('compound keys map to a DIFFERENT name than the prefix-stripped one (' + keptIdentity + ' single-word keys map to themselves)')
} else {
  fail('the mapping still derives compound field names by stripping the prefix: ' + keptIdentity + ' identity keys')
}

/* The test fixture must mirror the client table — a fixture that repeats the
   bug makes every other test in this repo vacuous for these fields. */
const fixtureMismatch = Object.keys(clientTable).filter((k) => KEY_TO_FIELD[k] !== clientTable[k])
if (fixtureMismatch.length === 0) {
  pass('the test fixture maps every key exactly like client.js')
} else {
  fail('test/fixtures/settings-scope.js disagrees with client.js on: ' + fixtureMismatch.join(', '))
}

/* The fixture's defaults must mirror the host schema, so a "default" in a test
   is the default production ships. */
const defaultMismatch = hostFields.filter((f) => FIELD_DEFAULTS[f] !== HOST.FIELD_DEFAULTS[f])
if (defaultMismatch.length === 0) {
  pass('the fixture defaults match the host schema defaults')
} else {
  fail('fixture defaults differ from index.js for: ' + defaultMismatch.join(', '))
}

/* ---------------------------------------------------------------- harness -- */

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
  addEventListener() {}, removeEventListener() {},
}

/**
 * Boot the real client.js over a supplied scope object.
 *
 * @param scope - the fake ctx.settingsScope scope. `wire` records every set().
 *                Pass nothing for a plain in-memory stub from the fixture.
 * @returns { render, scope }
 */
function boot(scope) {
  const slots = {
    inject(_n, fn) { fn() },
    register(_o, render) { slots.render = render; return () => {} },
  }
  let loaded = null
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (m) => { loaded = m } },
      addEventListener() {}, removeEventListener() {},
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
  vm.createContext(sandbox)
  try { new vm.Script(rawSrc, { filename: 'client.js' }).runInContext(sandbox) }
  catch (e) { fail('client.js threw while loading: ' + e.message); process.exit(1) }
  if (loaded === null) { fail('module never registered with __ModuleLoader__'); process.exit(1) }
  const mod = loaded.factory(() => null)
  mod.apply({
    get: (n) => {
      if (n === 'theme') return { overrideTokens: () => () => {} }
      if (n === 'slots') return slots
      if (n === 'settingsScope') return scope
      return undefined
    },
    effect: () => {},
  })
  return { render: () => slots.render(), scope }
}

/** Section keyed EXACTLY like the host's: declared fields only. */
function hostShapedSection(extra = {}) {
  const section = Object.assign({}, HOST.FIELD_DEFAULTS, extra)
  const wire = []
  const listeners = []
  const scope = {
    getSnapshot: () => ({
      status: 'ready', value: Object.assign({}, section), base: Object.assign({}, HOST.FIELD_DEFAULTS),
      user: Object.assign({}, section), revision: 1, writable: true, mode: 'host',
    }),
    subscribe(l) { listeners.push(l); return () => { const i = listeners.indexOf(l); if (i >= 0) listeners.splice(i, 1) } },
    set(f, v) { wire.push([f, String(v)]); section[f] = String(v); for (const l of listeners.slice()) { try { l() } catch (e) {} } },
  }
  return { binder: { bind: () => scope }, section, wire, scope }
}

/** Find the panel row for a UI key and its primary switch button. */
const findRow = (tree, key) => walk(tree).find((n) => n.type === 'div' && n.props && n.props.key === key)
const buttonsIn = (row) => (row ? walk(row).filter((n) => n.type === 'button') : [])

/* ======================================================================
   2. A toggle must write the DECLARED field — every one of them, not just
      the one in the issue report
   ====================================================================== */

/* panel row key -> [UI key, value to write, expected field, option label]
   `option` picks a value button by its exact label; without it the row's
   primary switch is used. */
const TOGGLES = [
  ['theme', 'dsh-theme-endfield-enabled', '0', 'enabled'],
  ['radius', 'dsh-theme-endfield-radius', 'round', 'radius'],
  ['contour', 'dsh-theme-endfield-contour', '1', 'contour'],
  ['contour-anim', 'dsh-theme-endfield-contour-anim', '0', 'contourAnim'],
  ['contour-fps', 'dsh-theme-endfield-contour-fps', '120', 'contourFps', '120'],
  ['contour-fps', 'dsh-theme-endfield-contour-fps', '60', 'contourFps', '60'],
  ['contour-speed', 'dsh-theme-endfield-contour-speed', '4', 'contourSpeed', '快速'],
  ['contour-speed', 'dsh-theme-endfield-contour-speed', '1', 'contourSpeed', '慢速'],
  ['contour-scroll-pause', 'dsh-theme-endfield-contour-scroll-pause', '0', 'contourScrollPause'],
  ['watermark', 'dsh-theme-endfield-watermark', '0', 'watermark'],
  ['watermark-persist', 'dsh-theme-endfield-watermark-persist', '1', 'watermarkPersist'],
  ['loader', 'dsh-theme-endfield-loader', '1', 'loader'],
  ['thunder', 'dsh-theme-endfield-thunder', '1', 'thunder'],
  ['thunder-anim', 'dsh-theme-endfield-thunder-anim', '1', 'thunderAnim'],
]

/* Compound fields are the regression surface; the singles passed even with the
   bug, so a test that only covered them would not have caught it. */
const COMPOUND = ['contourAnim', 'contourFps', 'contourSpeed', 'contourScrollPause', 'watermarkPersist', 'thunderAnim']
const compoundCovered = COMPOUND.filter((f) => Object.values(clientTable).includes(f))
if (compoundCovered.length === COMPOUND.length) {
  pass('all six compound fields from the issue are in the mapping')
} else {
  fail('compound fields missing from the mapping: ' + COMPOUND.filter((f) => !compoundCovered.includes(f)).join(', '))
}

{
  const store = hostShapedSection()
  const { render } = boot(store.binder)
  /* Contour ON so its three sub-switches are enabled, thunder ON for its child. */
  store.section.contour = '1'
  store.section.thunder = '1'
  let tree = render()

  for (const [rowKey, uiKey, value, field, option] of TOGGLES) {
    /* The UI key this row's switch actually writes, checked against the mapping
       before anything is clicked — so a row wired to an unexpected key is caught
       even if that key happens to map somewhere harmless. */
    if (clientTable[uiKey] !== field) {
      fail('the row ' + rowKey + ' writes ' + JSON.stringify(uiKey)
        + ', which client.js maps to ' + JSON.stringify(clientTable[uiKey]) + ' (expected ' + JSON.stringify(field) + ')')
    }
    const row = findRow(tree, rowKey)
    if (!row) { fail('no panel row keyed ' + rowKey); continue }
    const btns = buttonsIn(row).filter((b) => b.props && typeof b.props.onClick === 'function')
    if (btns.length === 0) { fail('row ' + rowKey + ' has no clickable button'); continue }
    /* An option row picks the button labelled with the wanted value; a boolean
       row's primary switch is its LAST button (rows lead with 预览/重播). */
    const target = option
      ? btns.find((b) => textOf(b) === option)
      : btns[btns.length - 1]
    if (!target) {
      fail('row ' + rowKey + ' has no button labelled ' + JSON.stringify(option)
        + '; labels = ' + JSON.stringify(btns.map(textOf)))
      continue
    }
    const before = store.wire.length
    try { target.props.onClick() } catch (e) { fail(rowKey + ' toggle threw: ' + e.message); continue }
    const fired = store.wire.slice(before)
    if (fired.length === 0) { fail(rowKey + ' toggle wrote nothing at all'); continue }
    const names = fired.map(([f]) => f)
    const label = rowKey + (option ? '[' + option + ']' : '')
    if (names.includes(field)) {
      pass(`${label} 写入 schema 字段 ${field}`)
    } else {
      fail(`${label} wrote ${JSON.stringify(names)} instead of the declared field '${field}'`
        + ' — that name is not in the host schema, so the value never persists')
    }
    if (names.every((f) => hostFields.includes(f))) pass(`${label}: 没有写入未声明字段`)
    else fail(`${label} wrote undeclared field(s): ` + names.filter((f) => !hostFields.includes(f)).join(', '))
    /* Re-render: the panel reads its state back through the same store. */
    tree = render()
  }
}

/* ======================================================================
   3. The shipped bug, reproduced: a section the buggy build wrote
   ====================================================================== */

{
  /* Literally what a user's settings.yaml held after using the buggy build: the
     compound choices stored under the pre-migration spelling, plus the
     single-word fields that build happened to write correctly. The scope then
     hands out the schema-MERGED view, which is why every declared field is
     present whether or not the user ever set it — `user` is the host's raw
     document and is what tells the two apart. */
  const rawUser = {
    palette: 'valley',
    radius: 'square',
    contour: '1',
    watermark: '1',
    thunder: '1',
    'watermark-persist': '1',
    'contour-anim': '0',
    'contour-speed': '1',
    'contour-scroll-pause': '1',
  }
  const section = Object.assign({}, HOST.FIELD_DEFAULTS, rawUser)
  const wire = []
  const listeners = []
  /* The scope starts NOT ready and flips to ready afterwards — the shape the
     theme actually boots into (a mirror whose first describe has no section
     yet). That gives the panel one render while nothing is being migrated, which
     is where the READ can be judged on its own: the stray keys are already in
     the host document, and the panel must still show the declared defaults. */
  let served = false
  const scope = {
    getSnapshot: () => (served
      ? {
          status: 'ready', value: Object.assign({}, section),
          base: Object.assign({}, HOST.FIELD_DEFAULTS), writable: true, mode: 'host',
        }
      : { status: 'unavailable', value: undefined, writable: true, mode: 'host' }),
    subscribe(l) { listeners.push(l); return () => {} },
    set(f, v) { wire.push([f, String(v)]); section[f] = String(v) },
  }
  const { render } = boot({ bind: () => scope })
  const textBefore = textOf(render())
  if (/动态等高线：开启/.test(textBefore) && /水印保持显示：关闭/.test(textBefore)) {
    pass('回归对照：未声明字段里的值不会被当成已声明字段读取（schema 默认值优先）')
  } else {
    fail('the panel must read the declared fields, not the stray keys, got ' + JSON.stringify(textBefore.slice(0, 220)))
  }

  served = true
  for (const l of listeners.slice()) { try { l() } catch (e) {} }
  const text = textOf(render())

  const migrated = wire.filter(([f]) => f === 'watermarkPersist' || f === 'contourAnim' || f === 'contourSpeed' || f === 'contourScrollPause')
  if (migrated.length === 4) {
    pass('旧拼写里的 4 个值被重新提交到 schema 字段上')
  } else {
    fail('legacy migration re-committed ' + migrated.length + '/4 fields; wire = ' + JSON.stringify(wire))
  }
  const expected = { watermarkPersist: '1', contourAnim: '0', contourSpeed: '1', contourScrollPause: '1' }
  const wrong = Object.keys(expected).filter((f) => section[f] !== expected[f])
  if (wrong.length === 0) pass('迁移后每个 schema 字段都拿到了旧值')
  else fail('migration left ' + wrong.map((f) => f + '=' + section[f]).join(', ') + ' (expected ' + JSON.stringify(expected) + ')')

  /* It must not invent an edit for a field nobody ever touched: thunderAnim has
     no legacy key in this section, so nothing may be written for it. */
  if (!wire.some(([f]) => f === 'thunderAnim')) pass('没有旧拼写记录的字段不会被迁移凭空写入')
  else fail('migration wrote a field with no legacy value: ' + JSON.stringify(wire))

  /* And the re-committed value must reach the theme, not just the document. */
  if (/水印保持显示：开启/.test(text)) {
    pass('迁移后的值立即生效（水印保持显示 = 开启）')
  } else {
    fail('migrated values did not take effect in the panel: ' + JSON.stringify(text.slice(0, 220)))
  }
}

/* A user-set declared value must WIN over a stray legacy key. */
{
  const rawUser = { 'contour-anim': '1', contourAnim: '0' }
  const section = Object.assign({}, HOST.FIELD_DEFAULTS, rawUser)
  const wire = []
  const scope = {
    getSnapshot: () => ({
      status: 'ready', value: Object.assign({}, section), user: Object.assign({}, rawUser),
      base: Object.assign({}, HOST.FIELD_DEFAULTS), writable: true, mode: 'host',
    }),
    subscribe() { return () => {} },
    set(f, v) { wire.push([f, String(v)]); section[f] = String(v) },
  }
  const { render } = boot({ bind: () => scope })
  const text = textOf(render())
  if (/动态等高线：关闭/.test(text)) pass('用户显式写入的 contourAnim=0 覆盖旧拼写里的 1')
  else fail('a user-set declared value lost to a stray legacy key: ' + JSON.stringify(text.slice(0, 200)))
  if (wire.length === 0) pass('这种情况不产生任何迁移写入')
  else fail('migration wrote although the user had set the field: ' + JSON.stringify(wire))
}

/* ======================================================================
   4. Issue finding #2 — an edit is visible immediately, not after the
      host round-trip (prefsSet updated prefsLocal, prefsGet read the
      fetched section first)
   ====================================================================== */

{
  /* A scope whose set() does NOT echo: the host confirms later (or never, in
     this process). Everything the theme reports must still be the new value. */
  const section = Object.assign({}, HOST.FIELD_DEFAULTS, { thunder: '1' })
  const scope = {
    getSnapshot: () => ({ status: 'ready', value: Object.assign({}, section), writable: true, mode: 'host' }),
    subscribe() { return () => {} },
    set(f, v) { /* the write is accepted but the served section is not updated yet */ global.__noEcho = [f, String(v)] },
  }
  const { render } = boot({ bind: () => scope })
  const tree = render()
  const row = findRow(tree, 'thunder-anim')
  const btn = buttonsIn(row).find((b) => b.props && typeof b.props.onClick === 'function')
  try { btn.props.onClick() } catch (e) { fail('thunder-anim toggle threw: ' + e.message) }
  const after = textOf(render())
  if (/大字入场动画：开启/.test(after)) pass('写入后面板立刻读到新值（不依赖宿主回相）')
  else fail('with no host echo the panel still showed the old value: ' + JSON.stringify(after.slice(0, 200)))
  if (/关闭动画/.test(after)) pass('按钮随之提供反向操作')
  else fail('the row did not flip to the reverse affordance')
}

/* ======================================================================
   5. Issue finding #3 — reverting a field to its DEFAULT while the
      namespace is not served must still be written once it is
   ====================================================================== */

{
  /* The field currently reads ON (so the user's click turns it OFF, i.e. back to
     the shipped default), and the host's stale view already says '0' — which is
     exactly why the revert is at risk of being judged "nothing to do". */
  const rawUser = { watermarkPersist: '1' }
  const section = Object.assign({}, HOST.FIELD_DEFAULTS, rawUser)
  const wire = []
  let served = false
  const listeners = []
  const scope = {
    getSnapshot: () => (served
      ? { status: 'ready', value: Object.assign({}, section), user: Object.assign({}, rawUser), writable: true, mode: 'host' }
      : { status: 'unavailable', value: undefined, writable: true, mode: 'host' }),
    subscribe(l) { listeners.push(l); return () => {} },
    set(f, v) {
      wire.push([f, String(v)])
      if (served) { section[f] = String(v); rawUser[f] = String(v) }
      for (const l of listeners.slice()) { try { l() } catch (e) {} }
    },
  }
  const { render } = boot({ bind: () => scope })
  const row = findRow(render(), 'watermark-persist')
  const btn = buttonsIn(row).find((b) => b.props && typeof b.props.onClick === 'function')
  if (!btn) { fail('no watermark-persist switch rendered'); process.exit(1) }
  /* Read the direction off the panel itself: a row offers the action it is NOT
     in, so the button's label is the state the click is about to store. Deriving
     it (rather than assuming "on -> off") keeps this section independent of what
     the previous sections left in the shared client instance. */
  const turnsOn = /保持显示/.test(textOf(btn))
  const nextValue = turnsOn ? '1' : '0'
  try { btn.props.onClick() } catch (e) { fail('watermark-persist toggle threw: ' + e.message) }
  if (wire.length === 0) pass('未就绪时改回默认值：没有出线写入')
  else fail('a write leaked to the wire while the namespace was unserved: ' + JSON.stringify(wire))

  served = true
  for (const l of listeners.slice()) { try { l() } catch (e) {} }
  const written = wire.filter(([f, v]) => f === 'watermarkPersist' && v === nextValue)
  if (written.length === 1) {
    pass('命名空间就绪后，held 编辑被补写（watermarkPersist=' + nextValue + '）')
  } else {
    fail('the held edit was dropped: wire = ' + JSON.stringify(wire) + ', expected watermarkPersist=' + nextValue)
  }
  if (section.watermarkPersist === nextValue) pass('宿主文档确实收到了这次编辑')
  else fail('host document holds watermarkPersist = ' + section.watermarkPersist + ', expected ' + nextValue)
}

console.log('')
if (failures) { console.error(failures + ' settings-namespace check(s) failed'); process.exit(1) }
console.log('all settings-namespace checks passed')
