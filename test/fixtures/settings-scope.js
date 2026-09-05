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

function fieldName(rawKey) {
  // 'dsh-theme-endfield-<field>' -> '<field>'; also accept the bare field.
  if (rawKey.startsWith('dsh-theme-endfield-')) return rawKey.slice('dsh-theme-endfield-'.length)
  return rawKey
}

/**
 * Build a fake settingsScope binder over an in-memory section.
 *
 * @param initial - initial stored section (field -> string). Undefined fields
 *                  resolve to FIELD_DEFAULTS during value resolution, exactly
 *                  like a schema `.default()` merges into a stored section.
 * @returns { binder, section, getSnapshot, setField, setSection, change }
 */
function settingsScopeStub(initial = {}) {
  // Merged defaults so `value` is never missing a key (mirrors schema defaults).
  const section = Object.assign({}, FIELD_DEFAULTS)
  for (const k of Object.keys(initial)) {
    if (Object.prototype.hasOwnProperty.call(FIELD_DEFAULTS, k)) section[k] = String(initial[k])
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
    set(field, value) { section[field] = String(value); notify(); },
    unset(field) { section[field] = FIELD_DEFAULTS[field]; notify(); },
  }

  const binder = {
    bind() { return scope }, // the theme only uses the default field decode
  }

  return {
    binder,
    section,
    get: (rawKey) => section[fieldName(rawKey)],
    set: scope.set,
    unset: scope.unset,
    setField: (rawKey, value) => { section[fieldName(rawKey)] = String(value); notify() },
    getSnapshot,
    reset() { for (const k of Object.keys(FIELD_DEFAULTS)) section[k] = FIELD_DEFAULTS[k]; notify() },
  }
}

module.exports = { settingsScopeStub, FIELD_DEFAULTS, fieldName }
