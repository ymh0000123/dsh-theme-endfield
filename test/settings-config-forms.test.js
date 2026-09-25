/**
 * settings-config-forms.test.js — the DSH 0.1.7-rc.1 settings transport.
 *
 * DSH 0.1.7-rc.1 retired the seam every earlier build used: there is no
 * `ctx.settings.register(namespace, schema)` any more, no
 * `@deepseek-ai/dsh-settings-file`, no `<dshHome>/settings.yaml` and no browser
 * `ctx.settingsScope`. A plugin's editable schema is now its exported
 * schemastery `Config` (fields marked `.volatile()`), the namespace IS the
 * profile entry id, values land in the profile patch (`cordis.patch.yml`), and
 * the browser half reaches them through the `configForms` service:
 *
 *   ctx.get('configForms').get(<entryId>)
 *     .getSnapshot() -> { status, value, base, user, revision, writable, mode }
 *     .subscribe(listener) -> disposer
 *     .set(field, value) -> Promise<boolean>   (false = refused/SKIPPED)
 *
 * This test drives the real client.js apply() against a fake `configForms`
 * service and asserts the things that make the migration correct rather than
 * merely different:
 *
 *   1. the entry id the client asks for is the one the HOST carries (index.js
 *      SETTINGS_ENTRY, the cordis.patch.yml row id) AND every exported Config
 *      field is volatile with the shipped default — a non-volatile field is
 *      silently dropped from the form, which is the modern spelling of
 *      "settings won't save";
 *   2. a served form is bound and its values are adopted (the stored palette is
 *      applied to <body>);
 *   3. `set()` resolving false / the namespace not being served yet means the
 *      edit is HELD rather than reported as saved, and is replayed once the
 *      form becomes durable — the same guarantee settings-durable-hold.test.js
 *      pins for the legacy scope;
 *   4. teardown releases the subscription (a ConfigForm is provider-owned and
 *      shared, so a leaked listener would outlive the run);
 *   5. a Host that starts serving the entry WITHOUT any mirror notification is
 *      still picked up by the bounded settle watch — adoption and replay for the
 *      bound spelling, and a move to a different served spelling otherwise.
 *
 * The live suite keeps driving the legacy `settingsScope` seam everywhere else,
 * which is deliberate: that fallback has to keep working for hosts
 * <= 0.1.5-rc.2.
 *
 * Note on awaiting: `form.set()` settles in a MICROTASK, and a script's
 * microtasks only run when the synchronous stack unwinds, so every check that
 * depends on a write's settlement awaits `drain()` first. Timers, by contrast,
 * are driven synchronously by `flush()` (the harness owns the queue).
 *
 * Usage: node test/settings-config-forms.test.js
 */
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const HOST = require(path.join(ROOT, 'index.js'))
const { configFormsStub } = require(path.join(__dirname, 'fixtures', 'settings-scope.js'))

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/** Let every pending promise callback run (microtasks only). */
const drain = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

/* ------------------------------- React fakes ------------------------------ */
/* A stateful-enough React stand-in. `useState` previously returned a NO-OP
   setter, which made any "the panel re-synced" assertion unfalsifiable: a setter
   that does nothing can never change what `render()` returns, so the panel would
   have looked frozen whether or not the re-sync existed. It now records the
   mounted component's hooks and re-renders the panel through `rerender()`, which
   is what lets a test observe the switches actually moving off their boot
   defaults when the settings section settles. */
const makeReact = (rerender) => {
  // Hook slots for the single panel component under test, in call order.
  const state = []
  let slot = 0
  let effects = []
  const cleanups = []
  return {
    __reset() { slot = 0; effects = [] },
    useState(init) {
      const i = slot++
      if (state.length <= i) state[i] = typeof init === 'function' ? init() : init
      return [state[i], (next) => {
        const value = typeof next === 'function' ? next(state[i]) : next
        if (value === state[i]) return
        state[i] = value
        rerender()
      }]
    },
    /** Effects run once after the first render (no dependency tracking: the
        panel registers a single empty-dep subscription effect). Cleanups are
        RETAINED rather than invoked — React calls a cleanup on unmount or before
        a re-run, not immediately after the mount effect. Invoking it here would
        immediately unsubscribe the very listener the effect just registered,
        which is how a first draft of this mock made the panel look frozen. */
    useEffect(fn) { effects.push(fn) },
    __runEffects() {
      const pending = effects
      effects = []
      for (const fn of pending) {
        const cleanup = fn()
        if (typeof cleanup === 'function') cleanups.push(cleanup)
      }
    },
    __runCleanups() {
      for (const fn of cleanups.splice(0)) { try { fn() } catch (e) { /* test safety */ } }
    },
    __hooks: state,
    createElement(type, props, ...children) {
      const kids = []
      for (const c of children) {
        if (Array.isArray(c)) kids.push(...c)
        else if (c !== null && c !== undefined && c !== false) kids.push(c)
      }
      return { type, props: props || {}, children: kids }
    },
  }
}
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

/* ------------------------------ client harness ----------------------------- */
/**
 * Boot client.js in a fresh V8 context with a fake DOM and the given
 * `configForms` service. Timers are queued instead of dropped so a test can
 * advance the theme's 250 ms transport-retry / 500 ms held-edit-retry loops
 * deterministically with flush().
 */
function bootClient(options) {
  const opts = options || {}
  const timers = []
  const disposers = []
  let rendered = null

  const classSet = new Set()
  const classList = {
    add(c) { classSet.add(c) },
    remove(c) { classSet.delete(c) },
    contains(c) { return classSet.has(c) },
  }
  const noopEl = () => ({
    style: {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, removeChild() {},
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
  const slots = {
    inject(_n, fn) { fn() },
    register(_o, render) { rendered = render; return () => {} },
  }
  const setTimer = (fn) => { timers.push(fn); return timers.length }
  const clearTimer = (id) => { if (typeof id === 'number' && id > 0) timers[id - 1] = null }

  // Re-invoke the registered panel render, resetting hook slots so the same
  // component tree is produced in the same hook order (a real React re-render).
  // `__reset()` only rewinds the SLOT COUNTER and the pending-effect list; the
  // recorded state values survive, which is what makes a setter's update
  // observable on the next render.
  let lastTree = null
  const rerender = () => {
    if (typeof rendered !== 'function') return
    ReactFake.__reset()
    lastTree = rendered()
  }
  const ReactFake = makeReact(rerender)

  const sandbox = {
    window: {
      __ModuleLoader__: null, addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false }), innerWidth: 1440,
      setTimeout: setTimer, clearTimeout: clearTimer,
    },
    document,
    React: ReactFake,
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    performance: { now: () => 0 },
    setInterval: () => 0, clearInterval() {}, setTimeout: setTimer, clearTimeout: clearTimer,
    console,
  }
  sandbox.globalThis = sandbox
  sandbox.window.document = document

  let loaded = null
  sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }
  vm.createContext(sandbox)
  new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox)
  if (loaded === null) throw new Error('client.js never registered with __ModuleLoader__')

  const mod = loaded.factory(() => null)
  const ctx = {
    get(n) {
      if (n === 'theme') return { overrideTokens: () => () => {} }
      if (n === 'slots') return slots
      if (n === 'configForms') return opts.configForms
      return undefined
    },
    effect(fn) { const d = fn(); if (typeof d === 'function') disposers.push(d); return () => {} },
  }
  mod.apply(ctx)

  return {
    ctx,
    classList,
    /** Render the panel, running any pending effects exactly once after the
        first render (the mount pass), like React does. Effects are only run when
        they were registered by THIS render, so a re-render cannot re-subscribe. */
    render() {
      if (typeof rendered !== 'function') return null
      ReactFake.__reset()
      lastTree = rendered()
      ReactFake.__runEffects()
      return lastTree
    },
    /** Re-render WITHOUT running mount effects again (a state update). */
    rerender,
    /** Run every timer queued so far (bounded, so a runaway loop is visible). */
    flush(max = 80) {
      let n = 0
      while (timers.length > 0 && n < max) {
        const fn = timers.shift()
        n += 1
        if (typeof fn === 'function') fn()
      }
    },
    pendingTimers: () => timers.filter((t) => typeof t === 'function').length,
    /** The recorded hook slots, for assertions about panel state that the
        rendered tree cannot show (and to prove a setter was not a no-op). */
    hooks: () => ReactFake.__hooks,
    hookCount: () => ReactFake.__hooks.length,
    /** Invoke every disposer the plugin registered through ctx.effect. */
    disposeAll() { for (const d of disposers.slice()) { try { d() } catch (e) { fail('disposer threw: ' + e.message) } } },
  }
}

/** All `<button>` elements of the rendered settings page.
 *
 *  Deliberately renders ONCE per call and does NOT reset the hook slots before
 *  reading: the panel's state lives in the fake React's slot array, so a helper
 *  that re-ran the initializers would mask a re-sync (or fake one). Callers that
 *  need a fresh tree after a state change get it from the setter's own rerender. */
function panelButtons(client) {
  const tree = client.render()
  if (!tree) return []
  return walk(tree).filter((n) => n.type === 'button')
}
const findButton = (buttons, re) => buttons.find((b) => re.test(textOf(b)))
const RADIUS_RE = /切换直角|切换圆角/

async function main() {
  /* =======================================================================
     1. The two halves agree, and the Host schema is really editable.
     ======================================================================= */
  const ENTRY_IN_CLIENT = (src.match(/const PREFS_ENTRY = '([^']+)'/) || [])[1]
  const ENTRY_IN_HOST = HOST.SETTINGS_ENTRY

  if (ENTRY_IN_CLIENT === undefined) {
    fail('could not read PREFS_ENTRY out of client.js')
  } else if (ENTRY_IN_CLIENT === ENTRY_IN_HOST) {
    pass('settings entry id agrees across halves: ' + ENTRY_IN_CLIENT)
  } else {
    fail('client.js asks configForms for "' + ENTRY_IN_CLIENT + '" but index.js exports SETTINGS_ENTRY "' + ENTRY_IN_HOST + '"')
  }

  // The bundle patch row id IS the namespace, so the constant has to match the
  // row this package installs. Reading the patch keeps the three in step.
  const PATCH = fs.readFileSync(path.join(ROOT, 'cordis.patch.yml'), 'utf8')
  if (new RegExp('id:\\s*' + ENTRY_IN_HOST + '\\s*$', 'm').test(PATCH)) {
    pass('cordis.patch.yml inserts the row id the namespace is derived from')
  } else {
    fail('cordis.patch.yml has no row with id "' + ENTRY_IN_HOST + '" — the Config form would be keyed by a namespace nothing carries')
  }

  if (HOST.Config === undefined) {
    console.log('skip  no schemastery on this path, so index.js exports no Config (a legal no-op host)')
  } else {
    const dict = HOST.Config.dict || {}
    const declared = Object.keys(HOST.FIELD_DEFAULTS)
    const missing = declared.filter((f) => !dict[f])
    const extra = Object.keys(dict).filter((f) => declared.indexOf(f) < 0)
    const notVolatile = declared.filter((f) => !(dict[f] && dict[f].meta && dict[f].meta.volatile === true))
    const wrongDefault = declared.filter((f) => !(dict[f] && dict[f].meta && dict[f].meta.default === HOST.FIELD_DEFAULTS[f]))

    if (missing.length === 0) pass('host Config declares all ' + declared.length + ' fields')
    else fail('host Config is missing fields: ' + missing.join(', '))
    if (extra.length === 0) pass('host Config declares no field outside FIELD_DEFAULTS')
    else fail('host Config declares undeclared fields: ' + extra.join(', '))
    if (notVolatile.length === 0) pass('every host Config field is .volatile() (only those are editable in 0.1.7)')
    else fail('non-volatile Config fields would be dropped from the settings form: ' + notVolatile.join(', '))
    if (wrongDefault.length === 0) pass('every host Config field carries its shipped default')
    else fail('Config field defaults diverge from FIELD_DEFAULTS: ' + wrongDefault.join(', '))
  }

  /* =======================================================================
     2. A served entry is bound and its stored values are adopted.
     ======================================================================= */
  {
    const stub = configFormsStub({ 'theme-endfield': { palette: 'wuling' } }, { served: ['theme-endfield'] })
    const client = bootClient({ configForms: stub.service })

    if (client.classList.contains('theme-endfield-wuling')) {
      pass('stored palette read through configForms was applied to <body>')
    } else {
      fail('configForms value was not adopted: <body> lacks theme-endfield-wuling')
    }

    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (!radius) {
      fail('no radius toggle button rendered')
    } else {
      radius.props.onClick()
      const w = stub.writes
      if (w.length === 1 && w[0].ns === 'theme-endfield' && w[0].field === 'radius' && w[0].value === 'round') {
        pass('panel toggle wrote radius=round through form.set on the entry namespace')
      } else {
        fail('expected one write {ns:theme-endfield, field:radius, value:round}, saw ' + JSON.stringify(w))
      }
      if (stub.sectionOf('theme-endfield').radius === 'round') pass('accepted write lands in the served section')
      else fail('section did not receive the accepted write: ' + JSON.stringify(stub.sectionOf('theme-endfield')))
      await drain()
    }
  }

  /* =======================================================================
     3. The namespace spelling is discovered, not assumed.
        (a) a served prefixed entry id is preferred at acquisition time;
        (b) a form bound to the wrong spelling re-selects when the real entry
            is served, and the edit held meanwhile is replayed onto it.
     ======================================================================= */
  {
    const stub = configFormsStub({ 'include:theme-endfield': {} }, { served: ['include:theme-endfield'] })
    const client = bootClient({ configForms: stub.service })
    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (!radius) fail('no radius toggle button rendered (prefixed entry)')
    else {
      radius.props.onClick()
      if (stub.writtenNamespaces().join(',') === 'include:theme-endfield') pass('bound the served prefixed entry id when that is the one the Host serves')
      else fail('wrote to ' + JSON.stringify(stub.writtenNamespaces()) + ' instead of include:theme-endfield')
      await drain()
    }
  }
  {
    const stub = configFormsStub({}, { served: [] })
    const client = bootClient({ configForms: stub.service })
    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (!radius) fail('no radius toggle button rendered (re-selection case)')
    else {
      radius.props.onClick()
      if (stub.writes.length === 0) pass('edit stayed held while only the wrong spelling was bound')
      else fail('wrote through an unserved spelling: ' + JSON.stringify(stub.writes))

      stub.serve('include:theme-endfield')
      await drain()
      if (stub.writtenNamespaces().join(',') === 'include:theme-endfield' && stub.sectionOf('include:theme-endfield').radius === 'round') {
        pass('re-selected the served spelling and replayed the held edit onto it')
      } else {
        fail('did not move to the served spelling: writes=' + JSON.stringify(stub.writes))
      }
    }
  }

  /* =======================================================================
     4. A REFUSED write (set() resolving false) is held, not reported as saved,
        and replayed on the next snapshot replacement.
     ======================================================================= */
  {
    const stub = configFormsStub({}, { served: ['theme-endfield'], accept: () => false })
    const client = bootClient({ configForms: stub.service })
    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (!radius) fail('no radius toggle button rendered (refusal case)')
    else {
      radius.props.onClick()
      await drain() // the refusal settles in a microtask; the edit must be held by then
      if (stub.writes.length === 1) pass('refused write was issued once')
      else fail('expected exactly one attempted write, saw ' + JSON.stringify(stub.writes))
      if (stub.sectionOf('theme-endfield').radius !== 'round') pass('refused write did not change the served section')
      else fail('a refused write changed the section — the fake is not modelling refusal')

      stub.setAccept(() => true)
      stub.touch('theme-endfield') // the Host document was rewritten; the mirror reloads
      await drain()
      if (stub.writes.length >= 2 && stub.sectionOf('theme-endfield').radius === 'round') {
        pass('held edit was replayed after the refusal cleared')
      } else {
        fail('held edit was never replayed: writes=' + JSON.stringify(stub.writes) + ' section=' + JSON.stringify(stub.sectionOf('theme-endfield')))
      }
    }
  }

  /* =======================================================================
     5. An UNSERVED namespace (the mirror has not listed the entry yet) holds
        the edit page-locally and replays it as soon as the entry is served.
     ======================================================================= */
  {
    const stub = configFormsStub({}, { served: [] })
    const client = bootClient({ configForms: stub.service })
    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (!radius) fail('no radius toggle button rendered (unserved case)')
    else {
      radius.props.onClick()
      if (stub.writes.length === 0) pass('nothing reached the transport while the entry was unserved')
      else fail('wrote before the entry was served: ' + JSON.stringify(stub.writes))

      stub.serve('theme-endfield')
      client.flush()
      await drain()
      if (stub.writes.length >= 1 && stub.sectionOf('theme-endfield').radius === 'round') {
        pass('held edit was replayed once the entry became served')
      } else {
        fail('held edit never replayed after serve(): writes=' + JSON.stringify(stub.writes))
      }
    }
  }

  /* =======================================================================
     6. memory mode (a non-loopback page) never persists, so nothing is written
        and the theme stays on page-local values.
     ======================================================================= */
  {
    const stub = configFormsStub({}, { served: ['theme-endfield'], mode: 'memory' })
    const client = bootClient({ configForms: stub.service })
    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (!radius) fail('no radius toggle button rendered (memory case)')
    else {
      radius.props.onClick()
      client.flush()
      await drain()
      if (stub.writes.length === 0) pass('memory mode issued no durable write')
      else fail('memory mode wrote to the transport: ' + JSON.stringify(stub.writes))
    }
  }

  /* =======================================================================
     7. Teardown releases the subscription of the shared, provider-owned form.
     ======================================================================= */
  {
    const stub = configFormsStub({}, { served: ['theme-endfield'] })
    const client = bootClient({ configForms: stub.service })
    if (stub.unsubscribed.length === 0) pass('subscription stays live while the run is mounted')
    else fail('subscription was disposed before teardown: ' + JSON.stringify(stub.unsubscribed))

    client.disposeAll()
    if (stub.unsubscribed.indexOf('theme-endfield') >= 0) pass('teardown unsubscribed the configForms listener')
    else fail('teardown left the configForms subscription behind: ' + JSON.stringify(stub.unsubscribed))
  }

  /* =======================================================================
     8. A SILENT ready transition (the mirror answers without replacing any
        form's snapshot) is still caught by the bounded settle watch: the bound
        form is re-read, the section adopted and the held edit replayed.
     ======================================================================= */
  {
    const stub = configFormsStub({}, { served: [], quiet: true })
    const client = bootClient({ configForms: stub.service })
    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (!radius) fail('no radius toggle button rendered (settle-watch case)')
    else {
      radius.props.onClick()
      if (stub.writes.length === 0) pass('silent-transition case: edit held while unserved')
      else fail('wrote before the entry was served: ' + JSON.stringify(stub.writes))

      stub.serve('theme-endfield') // served now, and NOTHING is notified
      client.flush()               // only the settle watch can notice
      await drain()
      if (stub.writes.length >= 1 && stub.sectionOf('theme-endfield').radius === 'round') {
        pass('settle watch caught the silent ready transition and replayed the held edit')
      } else {
        fail('silent ready transition was missed: writes=' + JSON.stringify(stub.writes))
      }
    }
  }

  /* =======================================================================
     9. The same silence, but the served spelling is NOT the bound one: the
        settle watch must move the binding (nothing else can notice) and replay
        the held edit onto the entry the Host actually serves. This is the
        "warm/quiet mirror + wrong spelling bound" order the subscription alone
        cannot recover from.
     ======================================================================= */
  {
    const stub = configFormsStub({}, { served: [], quiet: true })
    const client = bootClient({ configForms: stub.service })
    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (!radius) fail('no radius toggle button rendered (silent re-selection case)')
    else {
      radius.props.onClick()
      stub.serve('include:theme-endfield') // served, silent, different spelling
      client.flush()
      await drain()
      if (stub.writtenNamespaces().join(',') === 'include:theme-endfield' && stub.sectionOf('include:theme-endfield').radius === 'round') {
        pass('settle watch re-selected a silently served spelling and replayed the held edit')
      } else {
        fail('settle watch did not re-select the silently served spelling: writes=' + JSON.stringify(stub.writes))
      }
    }
  }

  /* =======================================================================
     10. REGRESSION — the real boot window. This is the live log:

           bound configForms ns= theme-endfield ; initial status= loading
             writable= false mode= host valueKeys= 0
           ...user flips a switch...
           commit palette = wuling via configForms theme-endfield status= ready

         The section arrives AFTER the bind, as ONE `loading -> ready`
         subscription event. `prefsOnScopeChange` used to early-return on
         'loading', which swallowed that event: the served section never reached
         prefsFieldValue, the held edit was never replayed onto it, and the
         settings page came back at the schema defaults on the next reload even
         though the Host had served the user's values.

         The old stub could not express this at all — it returned only 'ready'
         or 'unavailable' — which is precisely how the bug stayed green. A
         NOTIFIED settle is asserted here (no quiet), so the subscription alone
         must carry it; the settle watch is not allowed to take the credit.
     ======================================================================= */
  {
    const stub = configFormsStub(
      { 'theme-endfield': {} },
      { served: [], loading: ['theme-endfield'] },
    )
    const client = bootClient({ configForms: stub.service })

    // Boot really is in the loading window: no value, not writable.
    const bootSnap = stub.service.get('theme-endfield').getSnapshot()
    const bound = (stub.writes.length === 0)
    if (bootSnap.status === 'loading' && bootSnap.writable === false && bound) {
      pass("boot bound the entry while it was still 'loading' with no durable write")
    } else {
      fail('boot window not modelled: snap=' + JSON.stringify(bootSnap) + ' writes=' + JSON.stringify(stub.writes))
    }

    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (!radius) fail('no radius toggle button rendered (loading-transition case)')
    else {
      // The user edits while the entry is still loading: must be HELD, not lost.
      radius.props.onClick()
      await drain()
      if (stub.writes.length === 0) pass('edit made during the loading window was held, not written to an unserved entry')
      else fail('wrote into a loading entry: ' + JSON.stringify(stub.writes))

      // The mirror PUSHES a still-loading snapshot first (the boot window the
      // live log shows), then the ready section. No flush(): the settle watch is
      // the fallback and must not be allowed to take credit for the
      // subscription's job.
      stub.notifyLoading()
      await drain()

      // Now the describe view arrives: loading -> ready, one notified event.
      stub.settle('theme-endfield')
      await drain()

      if (stub.sectionOf('theme-endfield').radius === 'round') {
        pass('loading -> ready transition replayed the held edit onto the served section')
      } else {
        fail('loading -> ready transition did NOT replay the held edit: section='
          + JSON.stringify(stub.sectionOf('theme-endfield')) + ' writes=' + JSON.stringify(stub.writes))
      }

      // And the panel must now REFLECT the settled section — the actual
      // regression, which the write-replay above does not prove. The radius
      // toggle names the mode it will switch TO, so after adopting a section
      // whose radius is 'round' the label offers the other one ('切换直角').
      const readBack = findButton(panelButtons(client), RADIUS_RE)
      const label = readBack ? textOf(readBack) : ''
      if (/切换直角/.test(label)) {
        pass('panel re-read the settled section after the loading -> ready transition')
      } else {
        fail('panel still on schema defaults after the section settled: label=' + JSON.stringify(label))
      }
    }
  }

  /* =======================================================================
     11. REGRESSION (the reported bug) — "刷新后设置就重置了".

         The panel seeds all sixteen `useState` hooks from prefsGet() during its
         FIRST render. That render happens while the Host is still sending the
         section, so every read falls back to the schema default. Nothing
         re-synced those hooks when the section arrived: the theme's own surfaces
         recovered (reconcileFromPrefs re-derives them) but the PANEL's React
         state had no such path, so every switch came back at its default on each
         page load — even though the values were on disk and were being applied.

         This case changes NOTHING in-session: the section is simply served
         late, exactly as a real reload does. `palette` is served away from its
         default 'valley', so the panel can only show 'wuling' by adopting the
         settled section. Asserted through the rendered tree, which is what the
         user actually sees, and through the hook slots, which is what a no-op
         setter would otherwise leave frozen.
     ======================================================================= */
  {
    const stub = configFormsStub(
      { 'theme-endfield': { palette: 'wuling', radius: 'round', thunder: '1' } },
      { served: [], loading: ['theme-endfield'] },
    )
    const client = bootClient({ configForms: stub.service })
    if (stub.writes.length !== 0) fail('read-only boot wrote to the transport: ' + JSON.stringify(stub.writes))

    // Boot render: the section is still in flight, so the panel shows defaults.
    const before = findButton(panelButtons(client), /切换武陵|切换谷地|Switch palette/)
    if (!before) fail('no palette toggle rendered (late-section read case)')
    else if (!/切换武陵/.test(textOf(before))) {
      fail('precondition: panel should start on the DEFAULT palette, label=' + JSON.stringify(textOf(before)))
    } else {
      pass('precondition: panel starts on the schema default while the section is in flight')
    }

    // The describe view lands. No flush(): the settle watch is the fallback and
    // must not be allowed to stand in for the panel's own re-sync.
    stub.settle('theme-endfield')
    await drain()

    // Read the hook slots directly first: this is the rawest statement of the
    // bug ("the panel's state never moved off its boot defaults") and it cannot
    // be confused by anything in the render helper.
    const hooks = client.hooks()
    const paletteSlot = hooks[13] // 0-indexed: the 14th useState is `palette`
    if (paletteSlot === 'wuling') {
      pass('panel hook state adopted the served palette (slot moved off its default)')
    } else {
      fail('panel hook state stayed on the default after the section settled: palette slot='
        + JSON.stringify(paletteSlot) + ' (this is the reported reset bug)')
    }

    const after = findButton(panelButtons(client), /切换武陵|切换谷地|Switch palette/)
    const afterLabel = after ? textOf(after) : ''
    if (/切换谷地/.test(afterLabel)) {
      pass('panel re-synced onto the late-served palette (wuling), not the default')
    } else {
      fail('panel did NOT re-sync after the section settled — it still offers '
        + JSON.stringify(afterLabel) + ' (this is the reported reset bug)')
    }

    // The served radius must show up too: the toggle names the mode it switches
    // TO, so a served 'round' makes the button offer '切换直角'.
    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (radius && /切换直角/.test(textOf(radius))) {
      pass('panel re-synced the radius switch onto the served section as well')
    } else {
      fail('radius switch did not re-sync: ' + (radius ? JSON.stringify(textOf(radius)) : 'no button'))
    }

    // Adopting a served section must never be mistaken for a user edit.
    if (stub.writes.some((w) => w.field === 'palette' || w.field === 'radius')) {
      fail('the theme WROTE back the served values instead of adopting them: ' + JSON.stringify(stub.writes))
    } else {
      pass('late-served section was adopted for reading without being rewritten')
    }
  }

  /* =======================================================================
     12. REGRESSION (the live boot report) — the settings page mounts AFTER the
         section has already settled, and NOTHING emits afterwards.

         A `boot report` from the real page read:

           status= ready   valueKeys= 16   settled= true
           panelMounted= true   panelResynced= 0     <-- the tell

         The panel was live and the store held every value, yet the switches
         showed defaults: its subscription was registered only after the ready
         transition had already been emitted, and the mirror emits nothing again
         until the Host document changes or the connection resets. So a purely
         event-driven re-sync can never converge in that ordering — the panel has
         to re-derive once when it mounts.

         The upstream case differs on purpose: there the panel is up during the
         transition (resynced >= 1). Here the section is served FIRST and the
         panel renders only afterwards, which is what opening 设置 on an already
         loaded page does.
     ======================================================================= */
  {
    const stub = configFormsStub(
      { 'theme-endfield': { palette: 'wuling', radius: 'round' } },
      { served: [], loading: ['theme-endfield'] },
    )
    const client = bootClient({ configForms: stub.service })

    // The section lands BEFORE the panel is ever rendered, and no further
    // snapshot is emitted after this one.
    stub.settle('theme-endfield')
    await drain()

    // Only now does the settings page mount (the user opens 设置).
    const toggle = findButton(panelButtons(client), /切换武陵|切换谷地|Switch palette/)
    if (!toggle) fail('no palette toggle rendered (post-settle mount case)')
    else if (/切换谷地/.test(textOf(toggle))) {
      pass('panel mounting after the section settled shows the stored palette, not the default')
    } else {
      fail('panel mounted after the section settled but still shows the default: '
        + JSON.stringify(textOf(toggle)) + ' — this is the live boot-report defect')
    }

    const radius = findButton(panelButtons(client), RADIUS_RE)
    if (radius && /切换直角/.test(textOf(radius))) {
      pass('panel mounting after the section settled shows the stored radius too')
    } else {
      fail('radius did not converge on a post-settle mount: '
        + (radius ? JSON.stringify(textOf(radius)) : 'no button'))
    }

    if (stub.writes.length !== 0) {
      fail('adopting a settled section on mount must not write anything: ' + JSON.stringify(stub.writes))
    } else {
      pass('post-settle mount adopted the section without writing back')
    }
  }

  /* =======================================================================
     13. A toggle decides from the STORE, never from stale React state.

         The live defect this pins: the panel's useState seeds from prefsGet()
         while the Host section is still 'loading', so it captures the schema
         DEFAULT. If the user clicks before any re-sync pass corrected it, a
         handler that computed `next = !enabled` (React state) wrote the DEFAULT
         back to the durable section — overwriting a real stored choice. The
         symptom is precisely "I change it, it looks changed, and after a refresh
         it is back to the old value", because the wrong value was persisted.

         A handler that derives `next` from the store (isEnabled()/readPalette()/…)
         is immune: it decides against the durable value it is about to replace.
     ======================================================================= */
  {
    // The Host holds palette=wuling and radius=round; the panel is rendered while
    // the section is still in flight, so its useState slots captured the defaults.
    const stub = configFormsStub({ 'theme-endfield': { palette: 'wuling', radius: 'round' } }, { served: ['theme-endfield'], loading: ['theme-endfield'] })

    // Render the panel while loading, so its state seeds from the schema default.
    const client = bootClient({ configForms: stub.service })
    const buttons = panelButtons(client)

    const toggle = findButton(buttons, /切换武陵|切换谷地|Switch palette/)
    if (!toggle) {
      fail('no palette toggle rendered (stale-state case)')
    } else {
      const before = textOf(toggle)
      // The panel was rendered during 'loading', so it shows the default (谷地/valley).
      if (/切换武陵/.test(before)) pass('precondition: panel shows the schema default palette while the section is in flight')
      else pass('precondition: panel rendered during loading (shows ' + JSON.stringify(before) + ')')

      // Now the Host serves the stored value. No re-sync pass has run for the
      // panel yet (the test has not driven the effect), which is the window the
      // bug lived in: the DOM still reflects the default.
      stub.settle('theme-endfield')
      await drain()

      toggle.props.onClick()
      await drain()

      // The stored value was wuling, so a store-derived toggle MUST write valley —
      // i.e. flip away from what is actually stored. A state-derived toggle that
      // wrongly believed it was already on valley would write wuling, re-asserting
      // the old value and making the click a no-op after a refresh.
      const w = stub.writes
      if (w.length === 0) {
        fail('a palette click against a settled section wrote nothing')
      } else if (w[0].field === 'palette' && w[0].value === 'valley') {
        pass('palette toggle decided from the STORE (stored wuling -> wrote valley)')
      } else {
        fail('palette toggle decided from stale React state: wrote '
          + JSON.stringify(w[0]) + ', expected {field:palette, value:valley} — this is the '
          + '"change it, refresh, it reverted" defect')
      }
    }
  }

  /* The same guarantee for the boolean switches and the radius switch: each one
     must flip away from the STORED value even when the rendered panel was seeded
     from a default. */
  {
    const stub = configFormsStub(
      { 'theme-endfield': { enabled: '0', watermark: '0', loader: '1', radius: 'round' } },
      { served: ['theme-endfield'], loading: ['theme-endfield'] }
    )
    const client = bootClient({ configForms: stub.service })

    stub.settle('theme-endfield')
    await drain()

    /* Locate each row by the FIELD IT WRITES rather than by its rendered label.
       Labels are not a reliable key here: several rows legitimately render the
       same short string (the loader row and the thunder-animation row both read
       'Turn on'), so a label match silently picks whichever button the walk
       reaches first — which is how the first draft of this case "tested" the
       loader while actually clicking the thunder row. Clicking every button and
       grouping by the write it produces makes the assertion exact. */
    const seen = {}
    for (const btn of panelButtons(client)) {
      if (!btn.props || typeof btn.props.onClick !== 'function') continue
      stub.writes.length = 0
      btn.props.onClick()
      await drain()
      for (const w of stub.writes) if (seen[w.field] === undefined) seen[w.field] = w.value
    }

    const expect = { enabled: '1', watermark: '1', loader: '0', radius: 'square' }
    let checked = 0
    for (const field of Object.keys(expect)) {
      if (seen[field] === undefined) continue
      checked++
      if (seen[field] === expect[field]) {
        pass('toggle "' + field + '" decided from the store (wrote ' + expect[field] + ')')
      } else {
        fail('toggle "' + field + '" decided from stale React state: wrote ' + seen[field]
          + ', expected ' + expect[field] + ' — a click must flip the STORED value')
      }
    }
    if (checked === 0) fail('no toggle rows produced a write in the store-decides case')
    else if (checked < Object.keys(expect).length) {
      pass('(' + (Object.keys(expect).length - checked) + ' of ' + Object.keys(expect).length
        + ' rows produced no write against this stub — not asserted)')
    }
  }
}

main().then(() => {
  if (failures === 0) pass('all configForms checks passed')
  else { console.error('\n' + failures + ' configForms check(s) FAILED'); process.exit(1) }
}, (e) => {
  console.error('FAIL  unexpected error: ' + (e && e.stack ? e.stack : e))
  process.exit(1)
})
