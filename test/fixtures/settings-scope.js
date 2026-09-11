/**
 * settings-scope.js — canonical dsh settingsScope seam used by the theme tests.
 *
 * Migration (see docs/engineering-notes.md): the theme no longer persists to
 * localStorage. Its switches read/write a DSH settings namespace
 * (`dsh-theme-endfield`) through the browser `ctx.settingsScope` service — the
 * client mirror of the host `ctx.settings.register(ns, schema)` that index.js
 * declares, persisted by DSH to the profile's <dshHome>/settings.yaml.
 *
 * These unit tests therefore exercise the theme exactly the way a user's stored
 * preferences would, but through that same seam: they feed the plugin a fake
 * `ctx.settingsScope` binder (the precise contract the theme binds) whose
 * in-memory "section" plays the role that <settings.yaml> plays in production.
 *
 * THE SECTION IS KEYED BY SCHEMA FIELD NAME, NOT BY UI KEY. This is the whole
 * point of these tests and it is worth stating explicitly, because getting it
 * wrong here hides the bug that shipped: the host registers camelCase fields
 * (`thunderAnim`, `contourFps`, …) in index.js FIELD_DEFAULTS, so a scope.set
 * can only ever store those names. An earlier version of this fixture stripped
 * the `dsh-theme-endfield-` prefix off the UI key instead — the same wrong
 * mapping the client had — so `setField('contour-fps', …)` and the client's
 * `prefsGet('dsh-theme-endfield-contour-fps')` agreed on a name that does not
 * exist in the schema, both sides passed, and every compound switch silently
 * reset on reload. KEY_TO_FIELD below is the fixture's copy of that mapping and
 * must stay in step with client.js PREFS_KEY_TO_FIELD.
 *
 * Contract honoured (mirrors @deepseek-ai/dsh-client-ui-settings):
 *   binder.bind({ namespace, decode? }) -> scope
 *   scope.getSnapshot() -> { status, value, writable, mode, ... }
 *   scope.subscribe(listener) -> disposer
 *   scope.set(field, value); scope.unset(field)
 *
 * The theme only trusts a `status === 'ready'` snapshot with a `value` object;
 * before that, and when no binder is present at all, it falls back to in-memory
 * schema defaults (enabled on, loader off, ...). All fields are stored as the
 * exact strings described in docs/features.md.
 */
'use strict'

const FIELD_DEFAULTS = {
  enabled: '1',
  palette: 'valley',
  radius: 'square',
  contour: '0',
  contourAnim: '1',
  contourFps: '24',
  contourSpeed: '2',
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
  'dsh-theme-endfield-contour': 'contour',
  'dsh-theme-endfield-contour-anim': 'contourAnim',
  'dsh-theme-endfield-contour-fps': 'contourFps',
  'dsh-theme-endfield-contour-speed': 'contourSpeed',
  'dsh-theme-endfield-contour-scroll-pause': 'contourScrollPause',
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

module.exports = { settingsScopeStub, FIELD_DEFAULTS, KEY_TO_FIELD, fieldName }
