/**
 * settings-config-fallback.test.js — the Host Config contract, asserted WITHOUT
 * a schemastery on the test machine.
 *
 * Bug it guards: "the switches reset on every reload".
 *
 * index.js exports a schemastery `Config` so DSH 0.1.7 projects an editable
 * settings form for this entry. Without a Config the entry stays `absent`, no
 * form is projected, and every preference is page-local — the panel opens, the
 * switches move, nothing is ever written down. The builder is discovered on
 * disk, and that discovery used to require schemastery's OWN `.volatile()`:
 *
 *     if (requireVolatile && !hasVolatile(z)) continue
 *
 * A host whose only reachable AND loadable builder was the unscoped
 * `schemastery` 3.18.0 therefore built no Config at all — that copy has
 * `.extra()` but no `.volatile()` (the scoped 3.18.4 copy that does have it
 * resolved from the profile but threw on require). `.volatile()` is literally
 * `this.extra('volatile', true)`, so the marker can be synthesized, and this
 * file pins both halves:
 *
 *   1. the field contract — one string field per FIELD_DEFAULTS entry, each
 *      carrying its shipped default and, when editable, `meta.volatile === true`
 *      — for a NATIVE builder AND for an `.extra()`-only one;
 *   2. the selection order: native wins, `.extra()`-only is the fallback, and a
 *      builder with neither spelling yields no Config;
 *   3. the pre-0.1.7 registration build marks nothing.
 *
 * Why a stand-in builder rather than the real schemastery: the Host assertions
 * in settings-config-forms.test.js are SKIPPED when no schemastery is reachable
 * (`if (HOST.Config === undefined) … skip`), which is the normal case on a dev
 * machine — so the one contract that decides whether settings save at all was
 * never asserted in the environment where it broke. Passing an explicit builder
 * makes these checks run everywhere.
 *
 * Usage: node test/settings-config-fallback.test.js
 */
'use strict'
const path = require('path')

const HOST = require(path.join(__dirname, '..', 'index.js'))

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/**
 * A minimal stand-in for a schemastery builder, parameterized by which of the
 * two editable spellings it carries.
 *
 * It mirrors the real shape in the one respect that matters here: every
 * modifier returns a COPY carrying merged `meta`, so a marker set by `.extra()`
 * really does compose with the `.default()` applied before it.
 */
function fakeBuilder(options) {
  const opts = options || {}
  const withExtra = opts.extra !== false
  const withVolatile = opts.volatile === true

  const node = (type, meta) => {
    const schema = { type, meta: Object.assign({}, meta) }
    schema.default = (value) => node(type, Object.assign({}, schema.meta, { default: value }))
    if (withExtra) schema.extra = (key, value) => node(type, Object.assign({}, schema.meta, { [key]: value }))
    if (withVolatile) schema.volatile = () => schema.extra('volatile', true)
    return schema
  }

  const builder = () => node('string', {})
  builder.string = () => node('string', {})
  builder.object = (dict) => ({ type: 'object', dict, meta: {} })
  return builder
}

const DECLARED = Object.keys(HOST.FIELD_DEFAULTS)

/** Assert the whole field contract of one built schema. */
function checkSchema(label, schema, editable) {
  const dict = (schema && schema.dict) || {}

  const missing = DECLARED.filter((f) => !dict[f])
  if (missing.length === 0) pass(label + ': declares all ' + DECLARED.length + ' fields')
  else fail(label + ': missing fields ' + missing.join(', '))

  const extraFields = Object.keys(dict).filter((f) => DECLARED.indexOf(f) < 0)
  if (extraFields.length === 0) pass(label + ': declares nothing outside FIELD_DEFAULTS')
  else fail(label + ': undeclared fields ' + extraFields.join(', '))

  const wrongDefault = DECLARED.filter((f) => !(dict[f] && dict[f].meta && dict[f].meta.default === HOST.FIELD_DEFAULTS[f]))
  if (wrongDefault.length === 0) pass(label + ': every field carries its shipped default')
  else fail(label + ': default diverges from FIELD_DEFAULTS for ' + wrongDefault.join(', '))

  const marked = DECLARED.filter((f) => dict[f] && dict[f].meta && dict[f].meta.volatile === true)
  if (editable && marked.length === DECLARED.length) {
    pass(label + ': every field is marked editable — DSH will project the form')
  } else if (editable) {
    fail(label + ': non-editable fields would be dropped from the settings form: '
      + DECLARED.filter((f) => marked.indexOf(f) < 0).join(', '))
  } else if (marked.length === 0) {
    pass(label + ': no field is marked editable (nothing to project)')
  } else {
    fail(label + ': unexpectedly marked ' + marked.join(', ') + ' editable')
  }
}

/* ======================================================================
   1. The field contract, for every builder shape
   ====================================================================== */

/* schemastery >= 3.18.4 — the builder DSH itself ships. */
checkSchema('native .volatile() builder', HOST.buildSchemaWith(fakeBuilder({ volatile: true }), true), true)

/* The unscoped `schemastery` 3.18.0 shape: `.extra()` only. This is the case
   that used to produce no Config at all, and therefore no persistence. */
checkSchema('.extra()-only builder', HOST.buildSchemaWith(fakeBuilder({ volatile: false }), true), true)

/* Neither spelling: the selector never picks such a builder for an editable
   schema, but building must not throw and must not invent a marker. */
checkSchema('builder with neither spelling', HOST.buildSchemaWith(fakeBuilder({ volatile: false, extra: false }), true), false)

/* Pre-0.1.7 registration: same shape, deliberately unmarked. */
checkSchema('legacy non-editable build', HOST.buildSchemaWith(fakeBuilder({ volatile: true }), false), false)

/* ======================================================================
   2. volatileField — the two spellings, and tolerance
   ====================================================================== */

{
  const native = fakeBuilder({ volatile: true }).string()
  const byNative = HOST.volatileField(native)
  if (byNative !== native && byNative.meta.volatile === true) {
    pass('volatileField uses .volatile() when the builder has it')
  } else {
    fail('volatileField did not mark a native node: ' + JSON.stringify(byNative && byNative.meta))
  }

  const legacy = fakeBuilder({ volatile: false }).string()
  const byLegacy = HOST.volatileField(legacy)
  if (byLegacy !== legacy && byLegacy.meta.volatile === true) {
    pass('volatileField falls back to .extra(\'volatile\', true)')
  } else {
    fail('volatileField did not synthesize the marker on an .extra()-only builder: ' + JSON.stringify(byLegacy && byLegacy.meta))
  }

  const bare = fakeBuilder({ volatile: false, extra: false }).string()
  if (HOST.volatileField(bare) === bare) pass('volatileField leaves a marker-less node untouched instead of throwing')
  else fail('volatileField changed a node that supports neither spelling')

  if (HOST.volatileField(null) === null) pass('volatileField tolerates a null leaf')
  else fail('volatileField did not return null for a null leaf')
}

/* ======================================================================
   3. Selection order
   ====================================================================== */

{
  const native = fakeBuilder({ volatile: true })
  const legacy = fakeBuilder({ volatile: false })
  const plain = fakeBuilder({ volatile: false, extra: false })
  const c = (z, source) => ({ z, source })

  const pref = HOST.selectBuilder([c(legacy, 'legacy'), c(native, 'native')], true)
  if (pref && pref.z === native && pref.mode === 'native' && pref.source === 'native') {
    pass('a native builder wins even when an .extra()-only one is offered first')
  } else {
    fail('selection did not prefer the native builder: ' + JSON.stringify(pref && { mode: pref.mode, source: pref.source }))
  }

  const synth = HOST.selectBuilder([c(plain, 'plain'), c(legacy, 'legacy')], true)
  if (synth && synth.z === legacy && synth.mode === 'synthesized') {
    pass('an .extra()-only builder is used when no native one exists (the fallback that fixes persistence)')
  } else {
    fail('selection did not fall back to the .extra()-only builder: ' + JSON.stringify(synth && { mode: synth.mode, source: synth.source }))
  }

  if (HOST.selectBuilder([c(plain, 'plain')], true) === undefined) {
    pass('a builder that cannot mark a field editable yields no Config (still a legal host)')
  } else {
    fail('selection returned a builder that cannot mark a field editable')
  }

  if (HOST.selectBuilder([], true) === undefined) pass('an empty candidate list yields no Config')
  else fail('selection invented a builder from an empty candidate list')

  const legacyPick = HOST.selectBuilder([c(plain, 'plain'), c(native, 'native')], false)
  if (legacyPick && legacyPick.z === plain && legacyPick.mode === 'plain') {
    pass('the legacy build takes the first usable builder and marks nothing')
  } else {
    fail('legacy selection changed: ' + JSON.stringify(legacyPick && { mode: legacyPick.mode, source: legacyPick.source }))
  }

  if (HOST.selectBuilder([{ z: {}, source: 'junk' }, { z: null, source: 'null' }], true) === undefined) {
    pass('builders without object()/string() are rejected, not used')
  } else {
    fail('selection accepted a builder without object()/string()')
  }
}

/* ======================================================================
   4. This machine, and the invariant production violated
   ====================================================================== */

if (HOST.Config === undefined) {
  /* Legal on a schemastery-free machine — and also exactly the state that costs
     the user every preference, so it must never pass silently again. The
     field/selection contracts above were still asserted. */
  console.log('note  this machine reaches no editable schemastery, so index.js exports no Config here;')
  console.log('note  settings would stay page-local on this host. The contracts above were still asserted.')
} else {
  const dict = HOST.Config.dict || {}
  const notEditable = DECLARED.filter((f) => !(dict[f] && dict[f].meta && dict[f].meta.volatile === true))
  if (notEditable.length === 0) {
    pass('this machine\'s exported Config is fully editable (' + DECLARED.length + ' volatile fields)')
  } else {
    fail('this machine exports a Config whose fields are NOT editable: ' + notEditable.join(', '))
  }
}

/* A form under another name is the same bug as no form at all. */
if (HOST.SETTINGS_ENTRY === 'theme-endfield') {
  pass('SETTINGS_ENTRY is the profile entry id cordis.patch.yml installs')
} else {
  fail('SETTINGS_ENTRY is ' + JSON.stringify(HOST.SETTINGS_ENTRY) + ', expected "theme-endfield"')
}

console.log('')
if (failures) { console.error(failures + ' settings-config-fallback check(s) failed'); process.exit(1) }
console.log('all settings-config-fallback checks passed')
