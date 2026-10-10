/**
 * dsh-theme-endfield — the ESM host entry.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `index.js` is the CommonJS host half, and DSH reads `Config` off the loader
 * entry BEFORE any plugin body runs — so its schemastery builder has to be
 * obtained synchronously at module-evaluation time. That synchronous `require()`
 * loses a race that DSH's own boot creates:
 *
 *     require('@deepseek-ai/schemastery')     -> lib/index.cjs
 *       └─ require('@deepseek-ai/cosmokit')   -> a PURE ESM package
 *            Node: ERR_REQUIRE_ESM_RACE_CONDITION
 *                  "…because it is not yet fully loaded."
 *
 * DSH mounts its entries concurrently, and its own bundles import
 * `@deepseek-ai/cosmokit` through the ESM loader. Whenever this plugin's module
 * job runs while that import is still in flight — which is the normal case, and
 * happens even in a profile whose only third-party plugin is this one — Node
 * refuses the CJS→ESM require. `schemasteryCandidates()` then finds nothing
 * usable, `Config` is undefined, and DSH projects NO settings form for the
 * entry: the panel opens, the switches move, and nothing is ever written down.
 *
 * `require()` has no way to wait. The ESM loader does: an `import` of the same
 * package simply sequences behind cosmokit's in-flight job. So this entry warms
 * schemastery through ESM first, and only then pulls in the CommonJS half —
 * whose own scan then succeeds unchanged. `Config` is built from the real
 * builder, the failure report in `14-diagnostics.js` stays accurate (it is no
 * longer written at all), and `index.js` keeps working on its own for the test
 * suite and for anything that requires it directly.
 *
 * Both spellings are warmed, in the order `SCHEMA_SPECS` scans them, and every
 * failure is swallowed on purpose: a host with no schemastery at all must keep
 * degrading to the documented no-op that `index.js` reports, not fail to load
 * the entry.
 *
 * The import is dynamic so the ordering is explicit in the source rather than
 * implied by import hoisting.
 */

/** Load every schemastery spelling through the ESM loader, best-effort.
 *  @returns a promise that settles once the warm-up has been attempted. */
async function warmSchemastery() {
  for (const spec of ['@deepseek-ai/schemastery', 'schemastery']) {
    try {
      await import(spec);
      return;
    } catch (e) { /* the CommonJS half reports whatever is really missing */ }
  }
}

await warmSchemastery();

const mod = await import('./index.js');
/* cordis `unwrapExports()` resolves `exports.default ?? exports`, so the default
   export below is what DSH actually mounts — `Config` has to be on it. */
const plugin = mod.default ?? mod;

export const name = plugin.name;
export const apply = plugin.apply;
export const Config = plugin.Config;
export const NAMESPACE = plugin.NAMESPACE;
export const SETTINGS_ENTRY = plugin.SETTINGS_ENTRY;
export const LEGACY_NAMESPACE = plugin.LEGACY_NAMESPACE;
export const FIELD_DEFAULTS = plugin.FIELD_DEFAULTS;
/* Pure helpers, so the settings contracts can be asserted on the ESM entry too
   (see test/host-esm-entry.test.js). */
export const buildSchemaWith = plugin.buildSchemaWith;
export const selectBuilder = plugin.selectBuilder;
export const volatileField = plugin.volatileField;
/* Audio-notification surface. */
export const AUDIO_PREF_DEFAULTS = plugin.AUDIO_PREF_DEFAULTS;
export const classifyPrompt = plugin.classifyPrompt;
export const hasVisibleText = plugin.hasVisibleText;
export const installAudio = plugin.installAudio;
export const registerBalanceBridge = plugin.registerBalanceBridge;
export const configPrefScope = plugin.configPrefScope;

export default plugin;
