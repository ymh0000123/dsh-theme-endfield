/**
 * thunder-edges.test.js — prove 雷霆大字 announces on real TURN EDGES.
 *
 * The settings test only proves the switch renders. The feature itself is the
 * subscription logic, and every way it can be wrong is silent:
 *   - reading a LEVEL instead of an EDGE would re-announce on every streamed
 *     token (the snapshot store publishes constantly during a turn);
 *   - announcing the FIRST value read would fire 「任务开始」 merely because the
 *     user opened a session that was already running;
 *   - subscribing while switched OFF would keep the cost of a disabled feature;
 *   - forgetting to unsubscribe on teardown leaves callbacks on a dead run.
 * None of that is visible to check.js, to the canvas tests, or in a screenshot,
 * so it is driven directly here.
 *
 * No browser and no React: the real client.js runs in-process against a fake
 * `sessions` service shaped like the runtime contract it actually consumes
 * (@deepseek-ai/dsh-client-runtime — `sessions.list` is an observable snapshot
 * store carrying `current`, `sessions.binding(id).session` is an observable
 * snapshot carrying `running`), plus a controllable clock so the 3s hold can be
 * asserted rather than waited out.
 *
 * Usage: node test/thunder-edges.test.js
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

/* ---------- minimal DOM that records the plate ---------- */
const makeEl = (tag) => {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    style: {},
    className: '',
    textContent: '',
    parentNode: null,
    isConnected: true,
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = String(v) },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) },
    removeAttribute(k) { delete this.attrs[k] },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c },
    insertBefore(c) { c.parentNode = this; this.children.unshift(c); return c },
    removeChild(c) {
      const i = this.children.indexOf(c)
      if (i >= 0) this.children.splice(i, 1)
      c.parentNode = null
      return c
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
    getContext: () => null,
    get firstChild() { return this.children.length ? this.children[0] : null },
  }
  return el
}
const body = makeEl('body')
const document = {
  body,
  head: makeEl('head'),
  createElement: (t) => makeEl(t),
  createTextNode: (t) => ({ nodeValue: String(t) }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener() {},
}

/** Every 雷霆大字 plate currently attached to <body>. */
const plates = () => body.children.filter((c) => c.hasAttribute('data-endfield-thunder'))
/** The word the visible plate shows, or null when no plate is up. */
const shownWord = () => {
  const p = plates()
  if (p.length === 0) return null
  const w = p[p.length - 1].children.find((c) => c.hasAttribute('data-endfield-thunder-word'))
  return w ? w.textContent : null
}

/* ---------- controllable clock ---------- */
let now = 0
let seq = 0
const timers = new Map()
const setTimeoutFake = (fn, ms) => {
  const id = ++seq
  timers.set(id, { fn, at: now + (typeof ms === 'number' ? ms : 0) })
  return id
}
const clearTimeoutFake = (id) => { timers.delete(id) }
/** Advance the clock, firing due timers in time order. */
const advance = (ms) => {
  const target = now + ms
  for (;;) {
    let next = null
    for (const [id, t] of timers) {
      if (t.at <= target && (next === null || t.at < next.t.at)) next = { id, t }
    }
    if (next === null) break
    timers.delete(next.id)
    now = next.t.at
    next.t.fn()
  }
  now = target
}

/* ---------- fake sessions service (runtime contract shape) ---------- */
const makeObservable = (initial) => {
  let state = initial
  const subs = new Set()
  return {
    getSnapshot: () => state,
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn) } },
    set(next) { state = next; for (const fn of [...subs]) fn() },
    /** Publish without changing anything — what a streamed token looks like. */
    ping() { for (const fn of [...subs]) fn() },
    get subscriberCount() { return subs.size },
  }
}

const sessionA = makeObservable({ running: false })
const sessionB = makeObservable({ running: false })
const list = makeObservable({ current: 'session-a' })
const sessions = {
  list,
  binding: (id) => {
    if (id === 'session-a') return { sessionId: id, session: sessionA }
    if (id === 'session-b') return { sessionId: id, session: sessionB }
    return undefined
  },
}

/* ---------- load the real client bundle ----------
   The theme reads/writes its preferences through the dsh settingsScope seam, so
   this test drives it with a fake binder seeded like the old localStorage store:
   theme on, anim-heavy layers off (thunder itself starts OFF so the edge probes
   below begin from a pristine state). Changes the sections make write back here;
   scenarios 11/11b mount fresh sandboxes and seed their own binder. */
const makePrefStore = (extra = {}) => settingsScopeStub(Object.assign({
  enabled: '1',
  loader: '0',
  contour: '0',
  watermark: '0',
}, extra))

const prefStore = makePrefStore()

const sandbox = {
  window: {
    __ModuleLoader__: null,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440,
    setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake,
  },
  document,
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  performance: { now: () => now },
  setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake,
  setInterval: () => 0, clearInterval() {},
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
if (loaded === null) { fail('module never registered'); process.exit(1) }

/* Capture the settings render (to drive the switch the way a user does) and the
   fiber teardown (to assert it releases the subscriptions). */
let rendered = null
const slots = {
  inject(_n, fn) { fn() },
  register(_o, render) { rendered = render; return () => {} },
}
let teardown = null
const ctx = {
  get: (n) => {
    if (n === 'theme') return { overrideTokens: () => () => {} }
    if (n === 'slots') return slots
    if (n === 'sessions') return sessions
    if (n === 'settingsScope') return prefStore.binder
    return undefined
  },
  effect: (fn) => { const d = fn(); if (typeof d === 'function') teardown = d },
}

const mod = loaded.factory(() => null)
try { mod.apply(ctx) } catch (e) { fail('apply() threw: ' + e.message); process.exit(1) }
pass('apply() completed with a sessions service present')

/* --- 1. DEFAULT OFF: a real turn edge must announce NOTHING and, critically,
       the feature must not even be subscribed (an off switch that still listens
       is the cost this design explicitly refuses). --- */
if (sessionA.subscriberCount === 0) pass('默认关闭时不订阅会话（关闭即零开销）')
else fail('switched off, but the session already has ' + sessionA.subscriberCount + ' subscriber(s)')
sessionA.set({ running: true })
if (shownWord() === null) pass('默认关闭时任务开始不显示任何内容')
else fail('switched off but announced: ' + shownWord())
sessionA.set({ running: false })

/* --- 2. switch it ON through the real settings row --- */
if (typeof rendered !== 'function') { fail('settings.section never registered'); process.exit(1) }
const walk = (el, out = []) => {
  if (el && typeof el === 'object' && el.type) { out.push(el); for (const c of el.children || []) walk(c, out) }
  return out
}
const textOf = (el) => {
  if (el === null || el === undefined || typeof el === 'boolean') return ''
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  return (el.children || []).map(textOf).join('')
}
const R = {
  useState(init) { const v = typeof init === 'function' ? init() : init; return [v, () => {}] },
  createElement(type, props, ...children) {
    const kids = []
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c)
      else if (c !== null && c !== undefined && c !== false) kids.push(c)
    }
    return { type, props: props || {}, children: kids }
  },
}
sandbox.React = R
let tree
try { tree = rendered() } catch (e) { fail('settings render threw: ' + e.message); process.exit(1) }
const onBtn = walk(tree).filter((n) => n.type === 'button').find((b) => /开启大字/.test(textOf(b)))
if (!onBtn) { fail('no 开启大字 button to click'); process.exit(1) }
try { onBtn.props.onClick() } catch (e) { fail('开启大字 click threw: ' + e.message); process.exit(1) }
pass('通过设置行开启雷霆大字')

/* Turning it on previews the word once, by design. Clear that before measuring
   edges, so a preview can never be mistaken for an announcement. */
advance(3000)
if (shownWord() === null) pass('预览在 3 秒后自动消失')
else fail('the enable-preview never went away: ' + shownWord())

if (sessionA.subscriberCount === 1) pass('开启后订阅当前会话一次')
else fail('expected exactly 1 subscriber after enabling, got ' + sessionA.subscriberCount)

/* --- 3. THE EDGE: false -> true announces 任务开始 --- */
sessionA.set({ running: true })
if (shownWord() === '任务开始') pass('任务开始时显示「任务开始」')
else fail('expected 任务开始, got ' + JSON.stringify(shownWord()))
if (plates().length === 1) pass('屏幕上只有一块大字')
else fail('expected exactly 1 plate, found ' + plates().length)

/* The plate sits ON TOP of text the user may be mid-sentence in, for 3 seconds,
   and it is pure decoration. So it must be hidden from assistive technology (the
   word is not information a screen-reader user needs read aloud over the
   conversation) — the CSS half of that contract, pointer-events, is asserted in
   the stylesheet check below. */
if (plates()[0].getAttribute('aria-hidden') === 'true') pass('大字对辅助技术隐藏（纯装饰）')
else fail('the plate is not aria-hidden — a decorative overlay would be announced')

/* --- 3b. 入场动画默认关闭 ---
   The animation is its own opt-in switch. With it unset the plate must carry the
   still marker, which is what the stylesheet keys `animation: none; opacity: 1` off
   — i.e. the word appears instantly instead of slamming in. Asserted on the DOM
   because a stylesheet-only check could not tell the two states apart. */
if (plates()[0].hasAttribute('data-endfield-thunder-still')) pass('入场动画默认关闭：大字带静态标记（直接显示）')
else fail('the animation switch is unset, so the plate must carry data-endfield-thunder-still')

/* --- 4. LEVEL vs EDGE: a stream of publishes at the same running value (what a
       turn actually produces, dozens of times a second) must not re-announce.
       Measured by replacing the plate: if the code re-announced, the plate would
       be rebuilt and the 3s clock would restart. --- */
const plateBefore = plates()[0]
for (let i = 0; i < 25; i++) { sessionA.ping(); sessionA.set({ running: true }) }
if (plates()[0] === plateBefore && plates().length === 1) pass('同一状态的连续推送不重复播报（读的是边沿不是电平）')
else fail('a same-value publish re-announced — the code is reading a level, not an edge')

/* An unrelated LIST publish (a title change, a job row, a sidebar refresh) also
   arrives mid-turn. It must not disturb the plate or lose the pending edge.
   Honest scope: the rebind fast-path this exercises is a COST guard, not an
   edge-correctness one (a reseed would be synchronous and land on the same
   value), so this asserts the observable outcome rather than claiming the
   fast-path is what saves the edge. */
for (let i = 0; i < 5; i++) list.ping()
if (plates()[0] === plateBefore) pass('无关的列表推送不会重建大字')
else fail('a list publish rebuilt the plate')
sessionA.set({ running: false })
if (shownWord() === '任务完成') pass('列表推送后仍能捕获进行中的任务完成边沿')
else fail('a list publish swallowed the in-flight edge, got ' + JSON.stringify(shownWord()))
sessionA.set({ running: true })
advance(3000)

/* --- 5. the 3s hold, asserted on the clock rather than waited out.
       Announces a fresh edge first, so the window is measured from a known t=0
       instead of from whatever the previous section left on screen. --- */
sessionA.set({ running: false })
if (shownWord() === '任务完成') pass('新的边沿开始一次干净的计时')
else fail('failed to set up the hold measurement, got ' + JSON.stringify(shownWord()))
advance(2999)
if (shownWord() === '任务完成') pass('2999ms 时大字仍在')
else fail('the plate vanished before 3s: ' + JSON.stringify(shownWord()))
advance(1)
if (shownWord() === null) pass('3000ms 时大字已隐藏')
else fail('the plate outlived its 3s hold: ' + JSON.stringify(shownWord()))

/* --- 5b. 入场动画开启后：静态标记消失，且 3 秒时长不变 ---
   The animation switch must change ONLY the entry treatment. The hold is owned by a
   JS timer, not by the keyframes, so turning the animation on must not shorten or
   lengthen the 3s — a regression that would be easy to introduce by tying the
   removal to an animation end event. */
prefStore.setField('thunder-anim', '1')
sessionA.set({ running: true })
if (shownWord() === '任务开始') pass('开启入场动画后仍正常播报')
else fail('expected 任务开始 with the animation on, got ' + JSON.stringify(shownWord()))
if (!plates()[0].hasAttribute('data-endfield-thunder-still')) pass('入场动画开启：不带静态标记（走动画分支）')
else fail('with the animation on the plate must NOT carry data-endfield-thunder-still')
advance(2999)
if (shownWord() === '任务开始') pass('动画开启时 2999ms 仍在（时长不受动画影响）')
else fail('the animated plate vanished early: ' + JSON.stringify(shownWord()))
advance(1)
if (shownWord() === null) pass('动画开启时 3000ms 已隐藏')
else fail('the animated plate outlived its 3s hold')

/* The OS preference must still win over an enabled switch, exactly as the contour
   animation does — otherwise the switch would silently override an accessibility
   setting. matchMedia is swapped to report the preference for this one check. */
const realMatchMedia = sandbox.window.matchMedia
sandbox.window.matchMedia = () => ({ matches: true })
sessionA.set({ running: false })
if (shownWord() === '任务完成') pass('减少动态效果下仍然播报')
else fail('expected 任务完成 under reduced motion, got ' + JSON.stringify(shownWord()))
if (plates()[0].hasAttribute('data-endfield-thunder-still')) pass('系统「减少动态效果」覆盖已开启的动画开关')
else fail('reduced motion must force the still path even with the animation switch on')
sandbox.window.matchMedia = realMatchMedia
advance(3000)
prefStore.setField('thunder-anim', '0')

/* --- 6. the other edge: false -> true announces 任务开始 --- */
sessionA.set({ running: true })
if (shownWord() === '任务开始') pass('任务重新开始时显示「任务开始」')
else fail('expected 任务开始, got ' + JSON.stringify(shownWord()))
/* It must be WHITE and BOLD and LARGE — the three adjectives the request is
   made of. The glyph colour cannot come from a token here: label-primary is ink
   in light mode, so a token would print the word near-black on cream. The style
   itself is asserted against the stylesheet in section 12. */
const word = plates()[0].children.find((c) => c.hasAttribute('data-endfield-thunder-word'))
if (word) pass('大字有独立的 word 节点（样式钩子存在）')
else fail('no [data-endfield-thunder-word] node inside the plate')
advance(3000)
// Leave the session idle so the next section's switch is a clean baseline case.
sessionA.set({ running: false })
advance(3000)

/* --- 7. a turn already running when the user ARRIVES is not a new turn ---
       Switching to a session whose turn is in flight must stay silent: the
       first value read from any session is a baseline, not an edge. --- */
sessionB.set({ running: true })
list.set({ current: 'session-b' })
if (shownWord() === null) pass('切换到「已在运行」的会话不误报任务开始')
else fail('switching into a running session announced: ' + shownWord())
// ...but its completion IS a real edge the user should see.
sessionB.set({ running: false })
if (shownWord() === '任务完成') pass('该会话结束时仍正常播报「任务完成」')
else fail('expected 任务完成 after the switched-to session finished, got ' + JSON.stringify(shownWord()))
advance(3000)

/* The session we navigated away from must have been released, or an edge in a
   background session would announce over the one the user is looking at. */
if (sessionA.subscriberCount === 0) pass('离开的会话已退订')
else fail('the previous session still has ' + sessionA.subscriberCount + ' subscriber(s)')
sessionA.set({ running: true })
if (shownWord() === null) pass('后台会话的状态变化不会播报')
else fail('a background session announced: ' + shownWord())

/* --- 8. switching the THEME off (not the feature) must also stop announcing ---
       Distinct from the fiber teardown below: the run stays alive here, only the
       master switch flips. The announcement plate is styled entirely by the
       stylesheet unmount() removes, so a word left on screen would become an
       unstyled block in the document flow.

       Each click needs a FRESH render: the recording React stub returns the state
       it read at render time with a no-op setter, so reusing one button element
       would re-run the same stale branch and toggle the theme off twice. */
const clickByLabel = (re, what) => {
  let t
  try { t = rendered() } catch (e) { fail(what + ' re-render threw: ' + e.message); return false }
  const btn = walk(t).filter((n) => n.type === 'button').find((b) => re.test(textOf(b)))
  if (!btn || typeof btn.props.onClick !== 'function') { fail('no ' + what + ' button rendered'); return false }
  try { btn.props.onClick() } catch (e) { fail(what + ' click threw: ' + e.message); return false }
  return true
}

sessionB.set({ running: true })
advance(10)
if (clickByLabel(/关闭主题/, '关闭主题')) {
  if (plates().length === 0) pass('关闭主题时移除在显示的大字')
  else fail('switching the theme off left ' + plates().length + ' plate(s) on screen')
  if (sessionB.subscriberCount === 0) pass('关闭主题时退订会话（主开关也是总闸）')
  else fail('theme off, but the session still has ' + sessionB.subscriberCount + ' subscriber(s)')
  sessionB.set({ running: false })
  if (shownWord() === null) pass('关闭主题后任务边沿不再播报')
  else fail('an edge announced while the theme was off: ' + shownWord())
}
// Back on: the feature must resume rather than stay dead until a reload.
if (clickByLabel(/开启主题/, '开启主题')) {
  if (sessionB.subscriberCount === 1) pass('重新开启主题后恢复订阅')
  else fail('re-enabling the theme did not resubscribe (got ' + sessionB.subscriberCount + ')')
  sessionB.set({ running: true })
  if (shownWord() === '任务开始') pass('重新开启主题后正常播报')
  else fail('expected 任务开始 after re-enabling, got ' + JSON.stringify(shownWord()))
  advance(3000)
}

/* --- 9. a session that is not readable at bind time must not announce on its
       first readable value. This is the baseline guard's real job: the seed read
       can fail (a face staged before its window opens) while subscribe still
       succeeds, so `prev === null` is a live state, not a theoretical one. --- */
const flaky = (() => {
  let state = null
  const subs = new Set()
  return {
    getSnapshot: () => { if (state === null) throw new Error('window not open yet'); return state },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn) } },
    set(next) { state = next; for (const fn of [...subs]) fn() },
    get subscriberCount() { return subs.size },
  }
})()
sessions.binding = (id) => {
  if (id === 'session-a') return { sessionId: id, session: sessionA }
  if (id === 'session-b') return { sessionId: id, session: sessionB }
  if (id === 'session-flaky') return { sessionId: id, session: flaky }
  return undefined
}
list.set({ current: 'session-flaky' })
if (flaky.subscriberCount === 1) pass('快照暂不可读的会话仍会被订阅')
else fail('expected the unreadable session to be subscribed, got ' + flaky.subscriberCount)
flaky.set({ running: true })
if (shownWord() === null) pass('首个可读值为基线，不误报任务开始')
else fail('the first readable value announced: ' + shownWord())
flaky.set({ running: false })
if (shownWord() === '任务完成') pass('其后的真实边沿正常播报')
else fail('expected 任务完成 after a real edge, got ' + JSON.stringify(shownWord()))
advance(3000)

/* --- 10. fiber teardown must release everything --- */
if (typeof teardown !== 'function') fail('apply() registered no ctx.effect teardown')
else {
  flaky.set({ running: true })
  advance(3000)
  teardown()
  if (flaky.subscriberCount === 0 && list.subscriberCount === 0) pass('销毁时释放全部订阅')
  else fail('teardown left subscriptions: session=' + flaky.subscriberCount + ' list=' + list.subscriberCount)
  if (plates().length === 0) pass('销毁时移除残留大字')
  else fail('teardown left ' + plates().length + ' plate(s) in the document')
  flaky.set({ running: false })
  if (shownWord() === null) pass('销毁后不再播报')
  else fail('an edge after teardown still announced: ' + shownWord())
}

/* --- 11. a missing sessions service must not break the theme ---
   NOTE on `__dshThemeEndfieldApplied`: client.js returns immediately from apply()
   when that flag is already on the window, so a fresh sandbox MUST NOT inherit it.
   `{ ...sandbox }` copies the window reference's own properties, so the flag has to
   be cleared explicitly — without this both this case and 11b passed while apply()
   was in fact returning at its first line (measured: silently vacuous). */
let loaded2 = null
const sandbox2 = { ...sandbox }
sandbox2.globalThis = sandbox2
sandbox2.window = { ...sandbox.window, __ModuleLoader__: { load: (m) => { loaded2 = m } } }
delete sandbox2.window.__dshThemeEndfieldApplied
sandbox2.window.document = document
vm.createContext(sandbox2)
new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox2)
const mod2 = loaded2.factory(() => null)
const pref2 = makePrefStore({ thunder: '1' })
try {
  mod2.apply({
    get: (n) => {
      if (n === 'theme') return { overrideTokens: () => () => {} }
      if (n === 'settingsScope') return pref2.binder
      return undefined
    },
    effect: () => {},
  })
  pass('无 sessions 服务时主题仍正常挂载（开关在但不播报）')
} catch (e) {
  fail('apply() threw without a sessions service: ' + e.message)
}

/* --- 11b. the sessions service arriving LATE must still be picked up ---
   This is a real race, not a hypothetical: the web boot mounts every plugin row
   concurrently (Promise.all over the manifest in dsh-web-frontend) and this theme
   declares no `inject`, so apply() can run before dsh-client-runtime has provided
   `sessions`. Caching the lookup once at apply() time left the feature permanently
   dead on those loads — the bug this asserts against. */
let loaded3 = null
const lateSessionA = makeObservable({ running: false })
const lateList = makeObservable({ current: 'session-a' })
let lateService // deliberately undefined at apply() time
const sandbox3 = { ...sandbox }
sandbox3.globalThis = sandbox3
sandbox3.window = { ...sandbox.window, __ModuleLoader__: { load: (m) => { loaded3 = m } } }
// See the note in 11: without this, apply() returns at its first line and the
// whole case is vacuous.
delete sandbox3.window.__dshThemeEndfieldApplied
sandbox3.window.document = document
vm.createContext(sandbox3)
new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox3)
const mod3 = loaded3.factory(() => null)
// Thunder must be ON for the late-session announce below; enabled is the default.
const pref3 = makePrefStore({ thunder: '1' })
try {
  mod3.apply({
    get: (n) => {
      if (n === 'theme') return { overrideTokens: () => () => {} }
      if (n === 'sessions') return lateService
      if (n === 'settingsScope') return pref3.binder
      return undefined
    },
    effect: () => {},
  })
  pass('sessions 尚未就绪时 apply() 不抛错')
} catch (e) {
  fail('apply() threw while sessions was still pending: ' + e.message)
}
// The service appears a moment later, exactly as a concurrent plugin mount would.
lateService = {
  list: lateList,
  binding: (id) => (id === 'session-a' ? { sessionId: id, session: lateSessionA } : undefined),
}
advance(500)
if (lateSessionA.subscriberCount === 1) pass('服务迟到后仍会自动接上（重试生效）')
else fail('a late-arriving sessions service was never picked up (subscribers=' + lateSessionA.subscriberCount + ')')
lateSessionA.set({ running: true })
if (shownWord() === '任务开始') pass('服务迟到后仍能正常播报')
else fail('expected 任务开始 after the service arrived late, got ' + JSON.stringify(shownWord()))
advance(3000)

/* --- 12. the stylesheet contract behind the three adjectives in the request ---
   「大字」是粗体、醒目的大号的白色文字. Those are visual facts a DOM assertion
   cannot see (no layout in this harness), and they are exactly the kind of thing a
   later refactor drops silently, so they are asserted against the stylesheet
   source. The 12 rules below are the minimum that makes the plate a centred,
   non-blocking, white, heavy, viewport-scaled overlay. */
/* Slice from the plate's first rule to the end of the stylesheet literal, rather
   than a fixed byte count: a hardcoded window silently stopped reaching the
   reduced-motion block the moment the section's comments grew, which reported a
   MISSING rule that was in fact present two lines further down. */
const sheetAt = src.indexOf('[data-endfield-thunder] {')
const sheetEnd = sheetAt < 0 ? -1 : src.indexOf('`)', sheetAt)
const sheet = (sheetAt < 0 || sheetEnd < 0) ? '' : src.slice(sheetAt, sheetEnd)
if (sheet === '') fail('could not locate the 雷霆大字 stylesheet block')
const need = [
  [/position:\s*fixed/, '固定定位（不随滚动移动）'],
  [/inset:\s*0/, '铺满视口（用于居中）'],
  [/align-items:\s*center/, '垂直居中'],
  [/justify-content:\s*center/, '水平居中'],
  [/pointer-events:\s*none/, '不拦截点击/选择（叠在正文之上必须可穿透）'],
  [/font-weight:\s*900/, '粗体（900）'],
  [/font-size:\s*clamp\(/, '大号且随视口缩放（clamp）'],
  [/color:\s*#fff\b/, '白色文字（字面值，不用会在亮色模式变墨黑的令牌）'],
  [/text-shadow:/, '墨色描边/阴影（白字在奶油纸底上的可读性）'],
  [/z-index:\s*21474/, '高层级（盖住应用界面）'],
  [/@keyframes\s+endfield-thunder-word/, '入场/退场动画'],
  [/prefers-reduced-motion/, '尊重「减少动态效果」'],
  /* The still path is the DEFAULT state, so its rule matters more than the animated
     one. `opacity: 1` inside it is the load-bearing half: the animated rules start
     at opacity 0, so cancelling only `animation` would leave an invisible plate. */
  [/\[data-endfield-thunder-still\][\s\S]{0,200}?animation:\s*none/, '静态分支取消动画（默认状态）'],
  [/\[data-endfield-thunder-still\][\s\S]{0,240}?opacity:\s*1/, '静态分支强制 opacity:1（否则默认状态全透明）'],
]
for (const [re, what] of need) {
  if (re.test(sheet)) pass('样式契约：' + what)
  else fail('样式契约缺失：' + what + ' (' + re + ')')
}
/* The boot plate must still win the screen it owns: it is the one surface that
   legitimately covers everything, so the announcement has to sit BELOW it. */
const zThunder = (sheet.match(/z-index:\s*(\d+)/) || [])[1]
const zLoader = (src.match(/\[data-endfield-loader\]\s*\{[\s\S]{0,400}?z-index:\s*(\d+)/) || [])[1]
if (zThunder && zLoader && Number(zThunder) < Number(zLoader)) {
  pass('层级低于启动加载屏（' + zThunder + ' < ' + zLoader + '）')
} else {
  fail('the announcement must sit below the boot plate (thunder=' + zThunder + ' loader=' + zLoader + ')')
}

console.log('')
if (failures) { console.error(failures + ' 雷霆大字 check(s) failed'); process.exit(1) }
console.log('all 雷霆大字 edge checks passed')
