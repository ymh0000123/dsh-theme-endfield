
/* The module export.
 *
 * `Config` is written as a STATIC property of the literal on purpose. DSH
 * imports loader entries through Node's internal ESM loader, which interops a
 * CommonJS file by building its namespace from cjs-module-lexer's static
 * analysis of this file. A property assigned afterwards
 * (`exported.Config = Config`) is invisible to that analysis, and a namespace
 * that cannot see it leaves DSH's `unwrapExports()` with an object whose
 * `apply` (a literal property, so detected) mounts the entry while `Config`
 * stays undefined — the entry runs, `Config.listConfigs` reports `absent`, and
 * no settings form exists. Hence: literal property, always present, with the
 * value `undefined` when no schemastery builder was reachable (which is a
 * legitimate "nothing to configure" and not a broken schema). */
module.exports = {
  name: NAME,
  apply,
  Config,
  // Exposed for tests/documentation.
  NAMESPACE,
  SETTINGS_ENTRY,
  LEGACY_NAMESPACE,
  FIELD_DEFAULTS,
  /* Pure helpers, so the settings contracts below can be asserted against a
     stand-in builder instead of whatever schemastery the test machine happens
     to have (see test/settings-config-fallback.test.js). */
  buildSchemaWith,
  selectBuilder,
  volatileField,
  /* Audio-notification surface, asserted by test/audio-notify.test.js. */
  AUDIO_PREF_DEFAULTS: AUDIO_FALLBACK,
  classifyPrompt,
  hasVisibleText,
  installAudio,
  registerBalanceBridge,
  /* The API-key half of the balance read, exported so a test can drive it
     against a stub credentials service and a stub fetch — the one part of the
     route that talks to a remote host and cannot be proven offline. */
  readApiKeyBalance,
  configPrefScope,
};
