/**
 * settings-scope.js — canonical DSH settings seams used by the theme tests.
 *
 * Migration (see docs/engineering-notes.md): the theme no longer persists to
 * localStorage. Its switches read/write a DSH settings namespace and it has
 * outlived two generations of that seam, so this file models BOTH:
 *
 *   0.1.7-rc.1  `configFormsStub()` — the `ctx.configForms` service. A form is
 *               keyed by the PROFILE ENTRY ID (`theme-endfield`, see
 *               index.js SETTINGS_ENTRY); its `set()` returns
 *               `Promise<boolean>`, where `false` means the Host refused or
 *               skipped the write (memory mode on a non-loopback page). This is
 *               what test/settings-config-forms.test.js drives.
 *   <=0.1.5     `settingsScopeStub()` — the deprecated `ctx.settingsScope`
 *               binder over namespace `dsh-theme-endfield`, whose host half was
 *               `ctx.settings.register(ns, schema)` persisted by
 *               `@deepseek-ai/dsh-settings-file` to `<dshHome>/settings.yaml`.
 *               Every other settings test still drives this generation, which
 *               is exactly why the client keeps the fallback.
 *
 * THE SECTION IS KEYED BY SCHEMA FIELD NAME, NOT BY UI KEY. This is the whole
 * point of these tests and it is worth stating explicitly, because getting it
 * wrong here hides the bug that shipped: the host declares camelCase fields
 * (`thunderAnim`, `contourFps`, …) in index.js FIELD_DEFAULTS, so a scope.set
 * or form.set can only ever store those names. An earlier version of this
 * fixture stripped the `dsh-theme-endfield-` prefix off the UI key instead —
 * the same wrong mapping the client had — so `setField('contour-fps', …)` and
 * the client's `prefsGet('dsh-theme-endfield-contour-fps')` agreed on a name
 * that does not exist in the schema, both sides passed, and every compound
 * switch silently reset on reload. KEY_TO_FIELD below is the fixture's copy of
 * that mapping and must stay in step with client.js PREFS_KEY_TO_FIELD.
 *
 * Contracts honoured (mirroring @deepseek-ai/dsh-client-ui-settings):
 *   0.1.7       configForms.get(entryId) -> form
 *               form.getSnapshot() -> { status, value, base, user, revision, writable, mode }
 *               form.subscribe(listener) -> disposer
 *               form.set(field, value) / form.unset(field) -> Promise<boolean>
 *   legacy      binder.bind({ namespace, decode? }) -> scope
 *               scope.getSnapshot() -> { status, value, writable, mode, ... }
 *               scope.subscribe(listener) -> disposer
 *               scope.set(field, value); scope.unset(field)
 *
 * The theme only trusts a `status === 'ready'` snapshot with a `value` object;
 * before that, and when no transport is present at all, it falls back to
 * in-memory schema defaults (enabled on, loader off, ...). All fields are
 * stored as the exact strings described in docs/features.md.
 */
'use strict'

const FIELD_DEFAULTS = {
  enabled: '1',
  palette: 'valley',
  radius: 'square',
  glass: 'off',
  contour: '0',
  contourAnim: '1',
  contourFps: '24',
  contourSpeed: '2',
  contourTrail: '0',        // optional mouse deformation, default off
  contourRenderer: 'canvas',
  contourScrollPause: '1',
  watermark: '1',
  watermarkPersist: '0',
  loader: '0',
  thunder: '0',
  thunderAnim: '0',
}

/** UI/store key -> schema field. Mirrors client.js PREFS_KEY_TO_FIELD. */
const KEY_TO_FIELD = {
  'dsh-theme-endfield-enabled': 'enabled',
  'dsh-theme-endfield-palette': 'palette',
  'dsh-theme-endfield-radius': 'radius',
  'dsh-theme-endfield-glass': 'glass',
  'dsh-theme-endfield-contour': 'contour',
  'dsh-theme-endfield-contour-anim': 'contourAnim',
  'dsh-theme-endfield-contour-fps': 'contourFps',
  'dsh-theme-endfield-contour-speed': 'contourSpeed',
  'dsh-theme-endfield-contour-renderer': 'contourRenderer',
  'dsh-theme-endfield-contour-scroll-pause': 'contourScrollPause',
  'dsh-theme-endfield-contour-trail': 'contourTrail',
  'dsh-theme-endfield-watermark': 'watermark',
  'dsh-theme-endfield-watermark-persist': 'watermarkPersist',
  'dsh-theme-endfield-loader': 'loader',
  'dsh-theme-endfield-thunder': 'thunder',
  'dsh-theme-endfield-thunder-anim': 'thunderAnim',
}

/** Accept a UI key ('dsh-theme-endfield-thunder-anim'), a bare schema field
 *  ('thunderAnim'), or a namespaced schema field ('dsh-theme-endfield-thunderAnim'
 *  — the spelling the upstream tests seed with, written against the older fixture
 *  that stripped the prefix instead of mapping it). All three name a DECLARED
 *  field. Anything else — in particular the legacy pre-migration spelling
 *  'thunder-anim' — is handed back unchanged, exactly as a scope.set of an
 *  undeclared field behaves in production: stored, but never read as a declared
 *  field. Resolving that legacy tail here would hide the very bug these tests
 *  exist to catch, so a test that needs it must build the section through
 *  `section`/`setSection` directly, which keeps the migration path exercised
 *  rather than papered over. */
function fieldName(key) {
  if (Object.prototype.hasOwnProperty.call(KEY_TO_FIELD, key)) return KEY_TO_FIELD[key]
  const NS = 'dsh-theme-endfield-'
  if (key.indexOf(NS) === 0) {
    const tail = key.slice(NS.length)
    if (Object.prototype.hasOwnProperty.call(FIELD_DEFAULTS, tail)) return tail
  }
  return key
}

/**
 * Build a fake settingsScope binder over an in-memory section.
 *
 * @param initial - initial stored section (schema field -> string; UI keys are
 *                  accepted too). Undefined fields resolve to FIELD_DEFAULTS
 *                  during value resolution, exactly like a schema `.default()`
 *                  merges into a stored section.
 * @returns { binder, section, getSnapshot, setField, setSection, change }
 */
function settingsScopeStub(initial = {}) {
  // Merged defaults so `value` is never missing a key (mirrors schema defaults).
  const section = Object.assign({}, FIELD_DEFAULTS)
  for (const k of Object.keys(initial)) {
    const field = fieldName(k)
    if (Object.prototype.hasOwnProperty.call(FIELD_DEFAULTS, field)) section[field] = String(initial[k])
  }

  let listeners = []
  const notify = () => { for (const l of listeners.slice()) { try { l() } catch (e) { /* test safety */ } } }

  const getSnapshot = () => ({
    status: 'ready',
    value: Object.assign({}, section),
    base: Object.assign({}, FIELD_DEFAULTS),
    user: Object.assign({}, section),
    revision: 1,
    writable: true,
    mode: 'host',
  })

  const scope = {
    getSnapshot,
    subscribe(listener) { listeners.push(listener); return () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1) } },
    set(field, value) { section[field] = String(value); notify() },
    unset(field) { section[field] = FIELD_DEFAULTS[field]; notify() },
  }

  const binder = {
    bind() { return scope }, // the theme only uses the default field decode
  }

  return {
    binder,
    section,
    get: (key) => section[fieldName(key)],
    set: scope.set,
    unset: scope.unset,
    setField: (key, value) => { section[fieldName(key)] = String(value); notify() },
    /** Write a section key VERBATIM — no key->field mapping. This is how a test
     *  reproduces a document a buggy build wrote (e.g. the undeclared
     *  'contour-anim' next to a defaulted 'contourAnim'). */
    setSection: (key, value) => { section[key] = String(value); notify() },
    getSnapshot,
    reset() { for (const k of Object.keys(FIELD_DEFAULTS)) section[k] = FIELD_DEFAULTS[k]; notify() },
  }
}

/**
 * Build a fake DSH 0.1.7 `configForms` service over per-namespace sections.
 *
 * The namespace is chosen by the CALLER (the theme asks for the profile entry
 * id, index.js SETTINGS_ENTRY), and only namespaces listed in `served` answer
 * `status:'ready'` — everything else reports `'unavailable'`, exactly like the
 * Host's describe mirror does for a namespace it does not serve. That is what
 * lets a test prove the theme prefers a served spelling, never persists anything
 * through an unserved one, and re-selects once the real entry appears.
 *
 * @param initialSections - { [namespace]: { field: value } }; undeclared fields
 *                          resolve to FIELD_DEFAULTS, like schema defaults.
 * @param options.served    - namespaces the Host serves (default: none).
 * @param options.accept    - (namespace, field, value) -> boolean. Return false
 *                            to model a REFUSED write: the returned promise
 *                            resolves false and the section does not change.
 * @param options.mode      - 'host' (default) or 'memory' (non-loopback page;
 *                            never persists).
 * @param options.writable  - false models a read-only Host document.
 * @param options.loading   - namespaces that report `status:'loading'` with
 *                            `writable:false` and NO value, modelling the real
 *                            boot window before the Host's describe view
 *                            arrives. This is the state a real page load starts
 *                            in, and the one an earlier stub could not produce
 *                            at all — which is how a `loading -> ready`
 *                            transition bug shipped with every test green.
 *                            Call `settle(ns)` to move it to ready.
 * @returns { service, writes, unsubscribed, sections, sectionOf, serve, settle,
 *            touch, setAccept, writtenNamespaces }
 */
function configFormsStub(initialSections = {}, options = {}) {
  const sections = {}
  for (const ns of Object.keys(initialSections)) {
    sections[ns] = Object.assign({}, FIELD_DEFAULTS, initialSections[ns])
  }
  const served = (options.served || []).slice()
  // Namespaces still in flight: 'loading' now, ready once settle() is called.
  const loading = (options.loading || []).slice()
  const mode = options.mode || 'host'
  const writable = options.writable !== false
  // A mirror that answers without replacing any form's snapshot (models the
  // worst case the theme's bounded settle watch exists for).
  const quiet = options.quiet === true
  let accept = options.accept || (() => true)

  const listeners = {}
  const forms = {}
  const writes = []       // { ns, field, value } in call order, accepted or not
  const unsubscribed = [] // namespaces whose subscription was disposed

  // The describe mirror is SHARED: a Host document change (or a mirror reload)
  // replaces every form's snapshot at once, so notifications are global. That is
  // also what lets a form bound to the wrong entry spelling notice that another
  // candidate became served.
  const notify = () => {
    for (const ns of Object.keys(listeners)) {
      for (const l of (listeners[ns] || []).slice()) { try { l() } catch (e) { /* test safety */ } }
    }
  }
  const sectionOf = (ns) => sections[ns] || (sections[ns] = Object.assign({}, FIELD_DEFAULTS))
  const snapshotOf = (ns) => {
    /* Still in flight: the Host has not sent its describe view yet. This is the
       exact shape the live theme logs at boot — status 'loading', writable
       false, no value — and a write issued here must NOT be treated as landed
       (prefsDurablyServed requires status 'ready'). */
    if (loading.indexOf(ns) >= 0) {
      return { status: 'loading', value: undefined, base: undefined, user: undefined, revision: undefined, writable: false, mode }
    }
    if (served.indexOf(ns) < 0) {
      return { status: 'unavailable', value: undefined, base: undefined, user: undefined, revision: undefined, writable, mode }
    }
    return {
      status: 'ready',
      value: Object.assign({}, sectionOf(ns)),
      base: Object.assign({}, FIELD_DEFAULTS),
      user: Object.assign({}, sectionOf(ns)),
      revision: 1,
      writable,
      mode,
    }
  }
  const formFor = (ns) => forms[ns] || (forms[ns] = {
    getSnapshot: () => snapshotOf(ns),
    subscribe(listener) {
      (listeners[ns] = listeners[ns] || []).push(listener)
      return () => {
        unsubscribed.push(ns)
        const list = listeners[ns] || []
        const i = list.indexOf(listener)
        if (i >= 0) list.splice(i, 1)
      }
    },
    set(field, value) {
      const encoded = String(value)
      writes.push({ ns, field, value: encoded })
      // A still-loading namespace must REFUSE: the Host document is not open
      // (writable:false in the snapshot). Modelling this as an accepted write
      // would hide the very gate prefsDurablyServed exists to enforce.
      const ok = served.indexOf(ns) >= 0 && loading.indexOf(ns) < 0
        && writable && accept(ns, field, encoded) !== false
      if (ok) { sectionOf(ns)[field] = encoded; notify() }
      return Promise.resolve(ok)
    },
    unset(field) {
      sectionOf(ns)[field] = FIELD_DEFAULTS[field]
      notify()
      return Promise.resolve(true)
    },
  })

  return {
    service: { get: (ns) => formFor(ns) },
    writes,
    unsubscribed,
    sections,
    sectionOf,
    /** Put a namespace into the Host's served list (mirror reload). `quiet`
        suppresses the notification, leaving the theme's bounded settle watch as
        the only thing that can notice. */
    serve(ns) { if (served.indexOf(ns) < 0) { served.push(ns); if (!quiet) notify() } },
    /** Finish a boot: the Host's describe view arrives, so the namespace serves
        its section and accepts writes. This is the `loading -> ready`
        transition the live theme waits for.

        Wire fidelity, deliberately. The real client sees ONE event here: the
        describe view lands, the shared mirror re-derives every form, and the
        subscription fires once against a now-'ready' snapshot. There is no
        separate synthetic `loading` notification followed by a `ready` one — and
        modelling it that way is a trap: the extra `ready` event would rescue a
        gate that wrongly rejected the transitional state, hiding exactly the
        defect this fixture exists to expose. So `settle()` flips the state and
        notifies exactly once. */
    settle(ns) {
      const i = loading.indexOf(ns)
      if (i >= 0) loading.splice(i, 1)
      if (served.indexOf(ns) < 0) served.push(ns)
      if (!quiet) notify()
    },
    /** Model the mirror pushing a still-loading snapshot (the boot window the
        live theme logs as `status= loading writable= false valueKeys= 0`).
        Notifies without serving anything. */
    notifyLoading() { if (!quiet) notify() },
    /** Fire a snapshot replacement without changing the section. */
    touch(ns) { if (!quiet) notify() },
    setAccept(fn) { accept = fn || (() => true) },
    writtenNamespaces: () => Array.from(new Set(writes.map((w) => w.ns))),
  }
}

module.exports = { settingsScopeStub, configFormsStub, FIELD_DEFAULTS, KEY_TO_FIELD, fieldName }
