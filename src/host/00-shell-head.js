'use strict';
/**
 * dsh-theme-endfield — installed (bundle) HOST half.
 *
 * This module is the cordis plugin the loader mounts when the package is
 * installed through the official CLI:
 *
 *   dsh plugin --profile web add github:ymh0000123/dsh-theme-endfield
 *
 * The `dsh.bundle.patch` layer (cordis.patch.yml) inserts this package's row;
 * the loader requires this main entry and uses its `name` + `apply` exports.
 * The theme itself is pure client-side (browser): token overrides via the
 * `theme` service and a global stylesheet via the `styles` builtin, both
 * registered in the client half (`exports["./client"]` -> client.js).
 *
 * Durable preferences, per DSH generation
 * ---------------------------------------
 * The theme's switches used to live in the browser's `localStorage`, which is
 * scoped to a single origin: DSH Desktop binds a fresh, random loopback port on
 * every launch, so a port change changed the origin and the stored settings
 * silently reset to defaults.
 *
 * DSH 0.1.7-rc.1 replaced that whole persistence layer once more:
 *
 *   - `ctx.settings.register(namespace, schema)` is GONE, `@deepseek-ai/
 *     dsh-settings-file` is not part of the distribution any more, and
 *     `<dshHome>/settings.yaml` is no longer the user-settings carrier (DSH
 *     renames an existing file to `settings.yaml.imported` on first boot and
 *     only remaps a few section names). `ctx.settings` now *projects plugin
 *     Config schemas into forms* (`configure/describe/update/replace/mutate`)
 *     and persists user edits into the PROFILE PATCH
 *     (`<profile>/cordis.patch.yml`) through `ctx.configEditor`.
 *   - The settings namespace of a plugin is therefore the PROFILE ENTRY ID —
 *     the `id` of the row this package's `cordis.patch.yml` inserts
 *     (`theme-endfield`), NOT the old namespace string. That id is
 *     SETTINGS_ENTRY below; the browser half reads/writes it through the
 *     `configForms` client service.
 *   - Only schema fields marked `.volatile()` are user-editable, which is why
 *     every field of the exported `Config` below carries `.volatile()`.
 *
 * The browser half (client.js) reaches the same entry over the
 * `configForms.get('theme-endfield')` mirror and live-reacts to changes with
 * the form's subscription (and still falls back to the pre-0.1.7
 * `ctx.settingsScope` seam on older hosts).
 *
 * The namespace fields mirror exactly the setting keys, defaults and polarity
 * the theme has always shipped (see docs/features.md): default-ON switches
 * default to the string '1' and are read with `!== '0'`, default-OFF switches
 * default to '0' and are read with `=== '1'`. Choosing string-typed schema
 * fields keeps the value model (and the settings panel's own reads/writes)
 * byte-for-byte identical to every previous storage generation, so the client
 * store, its key table and its tests did not have to change with the transport.
 *
 * `schemastery` is deliberately imported lazily and only from the host realm:
 * this package otherwise ships no runtime dependency beyond the optional
 * cordis peer, so the theme degrades to a no-op the same way it always did in
 * any profile that does not supply a settings service.
 *
 * Host-side audio notifications (optional)
 * -------------------------------------------------------------------
 * `lib/audio.js` plays the two (later: four) notification slots. It is wired
 * here because the host, not the page, is what survives a minimized window.
 * `subprocess` is probed at play time rather than declared in `inject`: a
 * profile without that seam must keep the theme fully working and simply stay
 * silent, not fail to load.
 */

const { AudioRuntime, PREF, FALLBACK: AUDIO_FALLBACK, LOG_TAG } = require('./lib/audio.js');
const { SLOT_IDS } = require('./lib/slots.js');
