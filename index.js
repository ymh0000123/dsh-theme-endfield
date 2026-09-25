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
 */
const NAME = 'dsh-theme-endfield';

/**
 * DSH 0.1.7-rc.1 settings namespace: the profile entry id of this plugin's row
 * (cordis.patch.yml: `id: theme-endfield`). `ctx.settings.describe()` keys every
 * form by `entry.options.id`, and the browser's `configForms.get(ns)` mirrors
 * the same string, so this constant is what ties the two halves together.
 */
const SETTINGS_ENTRY = 'theme-endfield';

/**
 * Pre-0.1.7 settings namespace, registered through `ctx.settings.register` and
 * persisted to `<dshHome>/settings.yaml`. Kept so an older host keeps working
 * (and so the legacy client seam in client.js still has a producer).
 */
const LEGACY_NAMESPACE = 'dsh-theme-endfield';

/** Historical name of the namespace; kept for callers and tests. */
const NAMESPACE = LEGACY_NAMESPACE;

/**
 * Schema defaults for every field. Field names are the short tails of the
 * original localStorage keys (the `dsh-theme-endfield-` prefix is implied by
 * the namespace). Keeping the actual stored values as strings means the value
 * model survives every storage generation unchanged, and an older persisted
 * document still validates without a migration step.
 *
 * Default polarity (same rules as before, now enforced by the schema defaults
 * instead of by an "absent key" check, and documented in docs/features.md):
 *   - default-ON switches store '1' and the client reads them as `!== '0'`;
 *   - default-OFF switches store '0' and the client reads them as `=== '1'`;
 *   - palettes / radii / frame-rate / speed each store exactly one of their
 *     documented literals ('valley'/'wuling'; 'square'/'round'; fps in
 *     24/60/120; speed in 1/2/4), with the shipped default filled in here.
 */
const FIELD_DEFAULTS = {
  enabled: '1',             // 终末地主题 —— default on
  palette: 'valley',        // 主题配色 —— 谷地黄 (walley default)
  glass: 'off',             // optional local frost; original material by default
  radius: 'square',         // 主题圆角 —— 直角
  contour: '0',             // 等高线背景 —— default off
  contourAnim: '1',         // 动态等高线 —— default on
  contourFps: '24',         // 动态帧率 —— 24 FPS
  contourRenderer: 'canvas', // opt-in Worker/WebGL; original backend by default
  contourSpeed: '2',        // 动态速度 —— 标准 2x
  contourTrail: '0',        // optional mouse deformation, default off
  contourScrollPause: '1',  // 滚动暂停 —— default on
  watermark: '1',           // 背景水印 —— default on
  watermarkPersist: '0',    // 水印保持显示 —— default off
  loader: '0',              // 启动加载动画 —— default off
  thunder: '0',             // 雷霆大字 —— default off
  thunderAnim: '0',         // 大字入场动画 —— default off
};

/** The two spellings a reachable Schemastery builder can have on disk. */
const SCHEMA_SPECS = ['@deepseek-ai/schemastery', 'schemastery'];

/* Where a usable builder came from, for the diagnostics apply() logs. Set by
   loadSchemastery; stays null while nothing was found. */
let SCHEMA_SOURCE = null;

/* HOW the chosen builder marks a field editable — also for the diagnostics.
   'native'      the builder carries schemastery's own `.volatile()`;
   'synthesized' it predates `.volatile()`, so the marker is set through the
                 generic `.extra('volatile', true)` that `.volatile()` is
                 implemented on top of;
   'plain'       the builder marks nothing; only ever chosen for the pre-0.1.7
                 registration, which persisted whole namespaces;
   null          no usable builder was found at all, so this entry exports no
                 Config and every preference stays page-local. */
let SCHEMA_MODE = null;

/* Resolve a Schemastery namespace builder.

   This file has no schemastery dependency of its own (it must stay installable
   with nothing but an optional cordis peer), so the builder is RESOLVED at
   module-evaluation time — the loader reads `Config` off this module before any
   plugin body runs, which is why the whole search happens at the top level.

   1) Published profile installs put schemastery / @deepseek-ai/schemastery on
      this package's OWN require path (real bundles like dsh-better-sidebar do
      `import z from "schemastery"` and it resolves). Those are covered by the
      first tries below.
   2) A DEV-LINK bundle (this repo symlinked into the profile's node_modules,
      e.g. `"dsh-theme-endfield": "link:E:/..."`) does NOT: Node resolves the
      symlink to its real path first, so this file's own require chain starts at
      the repo (E:\…), where no schemastery lives — the bare requires throw
      MODULE_NOT_FOUND and the profile's node_modules is never consulted. So
      when they miss, every DSH-rooted directory that could own a copy is asked
      explicitly ({@link resolutionRoots}, resolved through
      `require.resolve(spec, { paths })`, the form that expresses "as if from
      here").
   3) WHICH builder matters, not just any builder. DSH ships BOTH
      `@deepseek-ai/schemastery` (>= 3.18, has `.volatile()`) and the unscoped
      `schemastery` that some third-party plugins depend on (3.18.0, NO
      `.volatile()` at all). Only a volatile schema produces an editable form in
      DSH 0.1.7, so `loadSchemastery(true)` keeps scanning until it finds a
      builder that really has `.volatile()` and returns undefined otherwise —
      silently claiming a form we cannot build is exactly the "settings won't
      save" class of bug this file keeps guarding against.
   Kept guarded throughout: a profile with no usable schemastery degrades to a
   no-op rather than crashing the host half — but a no-op is no longer silent:
   apply() logs which roots were tried, because "the theme works yet every
   switch resets on reload" is precisely this failure and it used to leave no
   trace at all. */

/** Every directory a DSH-owned schemastery install could be resolved from.
 *  Order is most-likely first; duplicates are dropped.
 *  @returns absolute directory paths to resolve from. */
function resolutionRoots() {
  const fs = require('fs');
  const path = require('path');
  const out = [];
  const push = (dir) => {
    if (typeof dir !== 'string' || dir === '') return;
    if (out.indexOf(dir) === -1) out.push(dir);
  };
  // This module's own tree: a profile- or app-installed package resolves here.
  push(__dirname);
  // The module the DSH process was started with. Its own graph necessarily
  // reaches schemastery (the host settings service imports it), so this is the
  // one root that exists wherever DSH itself is installed — a global npm
  // install, an app bundle, or the profile.
  try { if (require.main && require.main.filename) push(path.dirname(require.main.filename)); } catch (e) { /* no main module */ }
  try { if (require.main && typeof require.main.path === 'string') push(require.main.path); } catch (e) { /* no main module */ }
  // The process working directory: `dsh web` is normally started from a profile.
  try { push(process.cwd()); } catch (e) { /* no cwd */ }
  // Ancestors of this module, so a checkout nested under a tree that has its own
  // node_modules resolves without knowing anything about DSH's layout.
  let dir = __dirname;
  for (let i = 0; i < 6; i += 1) {
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
    push(path.join(dir, 'node_modules'));
    push(dir);
  }
  // The DSH home and every profile under it — the profiles root itself, each
  // profile, and each profile's node_modules (where the scoped copy lives).
  for (const home of dshHomeDirs()) pushLayout(home, push);
  // The same layout, discovered STRUCTURALLY rather than from the environment:
  // a DSH home is the directory whose `profiles/<name>/node_modules` holds the
  // install, so walking up from anything the process can name finds it without
  // trusting DSH_HOME, homedir() or the working directory to be any particular
  // value. This is the sweep that survives a launcher which sets none of them.
  for (const seed of processSeeds()) {
    let base = seed;
    for (let i = 0; i < 5; i += 1) {
      const parent = path.dirname(base);
      if (!parent || parent === base) break;
      base = parent;
      push(base);
      push(path.join(base, 'node_modules'));
      pushLayout(base, push);
    }
  }
  // The launched script and the node binary: a global `dsh` install keeps its
  // dependencies beside one of them, which is where a copy would live when DSH
  // itself is not installed into the profile.
  try { if (process.argv && typeof process.argv[1] === 'string') push(path.dirname(process.argv[1])); } catch (e) { /* no argv */ }
  try { push(path.dirname(process.execPath)); } catch (e) { /* no execPath */ }
  try {
    const appData = process.env && (process.env.APPDATA || process.env.LOCALAPPDATA);
    if (typeof appData === 'string' && appData) push(path.join(appData, 'npm', 'node_modules'));
  } catch (e) { /* no app data */ }
  // Every PATH directory (bounded): the parent of a global `dsh` shim, and any
  // other install root an operator put in front of it.
  try {
    const raw = process.env && process.env.PATH;
    if (typeof raw === 'string' && raw) {
      const entries = raw.split(path.delimiter);
      for (let i = 0; i < entries.length && i < 40; i += 1) push(entries[i]);
    }
  } catch (e) { /* no PATH */ }
  return out;
}

/** Every directory this process can name as a starting point for a layout
 *  search. Each one is expected to sit INSIDE a DSH tree of some shape.
 *  @returns absolute directory paths. */
function processSeeds() {
  const path = require('path');
  const out = [];
  const push = (dir) => {
    if (typeof dir !== 'string' || dir === '') return;
    if (out.indexOf(dir) === -1) out.push(dir);
  };
  push(__dirname);
  try { push(process.cwd()); } catch (e) { /* no cwd */ }
  try { if (require.main && require.main.filename) push(path.dirname(require.main.filename)); } catch (e) { /* no main module */ }
  try { if (process.argv && typeof process.argv[1] === 'string') push(path.dirname(process.argv[1])); } catch (e) { /* no argv */ }
  try { push(path.dirname(process.execPath)); } catch (e) { /* no execPath */ }
  return out;
}

/** Add one directory's DSH layout: the directory itself, its node_modules, and
 *  each of its profiles with that profile's node_modules.
 *  @param base - candidate DSH home.
 *  @param push - collector for a de-duplicated root. */
function pushLayout(base, push) {
  if (typeof base !== 'string' || base === '') return;
  const fs = require('fs');
  const path = require('path');
  push(base);
  push(path.join(base, 'node_modules'));
  const profiles = path.join(base, 'profiles');
  push(profiles);
  push(path.join(profiles, 'node_modules'));
  try {
    if (fs.existsSync(profiles)) {
      for (const name of fs.readdirSync(profiles)) {
        const profile = path.join(profiles, name);
        push(profile);
        push(path.join(profile, 'node_modules'));
      }
    }
  } catch (e) { /* an unreadable profiles dir just yields no extra roots */ }
}

/** The DSH home directories to consider, most explicit first.
 *  @returns candidate absolute home paths (may be empty). */
function dshHomeDirs() {
  const out = [];
  const push = (dir) => {
    if (typeof dir !== 'string' || dir === '') return;
    if (out.indexOf(dir) === -1) out.push(dir);
  };
  try { if (process.env && typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME) push(process.env.DSH_HOME); } catch (e) { /* no env */ }
  try { push(require('path').join(require('os').homedir(), '.dsh')); } catch (e) { /* no home dir */ }
  return out;
}

function normalizeSchemastery(found) {
  if (!found) return undefined;
  // Normalize a CJS default-export wrapper to a plain { string, object } API.
  if (found.default && !found.object && found.default.object && found.default.string) {
    return {
      string: (v) => found.default.string(v),
      object: (o) => found.default.object(o),
      union: typeof found.default.union === 'function' ? (...a) => found.default.union(...a) : undefined,
    };
  }
  return found;
}

/** Does this builder have the `.volatile()` modifier (schemastery >= 3.18)? */
function hasVolatile(z) {
  try { return !!(z && typeof z.string === 'function' && typeof z.string().volatile === 'function'); }
  catch (e) { return false; }
}

/** Does this builder expose the generic `.extra()` metadata setter?
 *
 *  `Schema.prototype.volatile` (schemastery >= 3.18.4) is LITERALLY
 *  `this.extra('volatile', true)`, and `.extra()` has existed since long before
 *  it — including in the unscoped `schemastery` 3.18.0 that ships NO
 *  `.volatile()` at all. Marking a field through `.extra()` therefore produces
 *  the very schema node DSH's settings service looks for (`meta.volatile`),
 *  which is what keeps the form editable on a host whose only reachable *and
 *  loadable* builder is one of those older copies. */
function hasVolatileMarker(z) {
  try { return !!(z && typeof z.string === 'function' && typeof z.string().extra === 'function'); }
  catch (e) { return false; }
}

/** Mark one leaf field editable, by whichever of the two spellings the selected
 *  builder supports. The leaf comes back unchanged only when it supports
 *  neither, which {@link selectBuilder} never picks on purpose.
 *  @param leaf - a schema node produced by the selected builder.
 *  @returns the field schema with `meta.volatile === true`. */
function volatileField(leaf) {
  if (leaf && typeof leaf.volatile === 'function') return leaf.volatile();
  if (leaf && typeof leaf.extra === 'function') return leaf.extra('volatile', true);
  return leaf;
}

/** Every reachable schemastery builder, closest require path first.
 *  @returns `{ z, source }` records; `source` names the root that answered, for
 *    the diagnostics apply() logs when nothing usable was found. */
function schemasteryCandidates() {
  const out = [];
  const seenBuilders = [];
  const take = (found, source) => {
    const builder = normalizeSchemastery(found);
    if (!builder) return;
    if (seenBuilders.indexOf(builder) !== -1) return;
    seenBuilders.push(builder);
    out.push({ z: builder, source });
  };
  // Roots are computed once: the scan touches the filesystem.
  const roots = resolutionRoots();
  /* Spec-major, SCOPED FIRST: `@deepseek-ai/schemastery` is the builder DSH's
     own settings service validates against, so whenever a scoped copy exists
     anywhere it must win over the unscoped one a sibling plugin may have left on
     an earlier path. Within one spec the plain require chain is asked first
     (that is the published-install case), then every explicit root. */
  for (const spec of SCHEMA_SPECS) {
    try { take(require(spec), spec); } catch (e) { /* not on this path */ }
    for (const dir of roots) {
      try {
        take(require(require.resolve(spec, { paths: [dir] })), spec + ' from ' + dir);
      } catch (e) { /* keep scanning the remaining roots */ }
    }
  }
  // Finally, the host process's own main module, asked through ITS require: the
  // last resort for a layout none of the paths above describes.
  try {
    if (require.main && typeof require.main.require === 'function') {
      for (const spec of SCHEMA_SPECS) {
        try { take(require.main.require(spec), spec + ' via require.main'); } catch (e) { /* keep scanning */ }
      }
    }
  } catch (e) { /* no main module to ask */ }
  // Absolute last resort: a copy ALREADY LOADED in this process. DSH's own
  // settings service imports schemastery, so whatever reached the CommonJS
  // module cache is usable by identity even when no path describes this
  // install. Read-only: nothing is executed, only cached exports inspected.
  try {
    const cache = require.cache || {};
    for (const id of Object.keys(cache)) {
      if (id.indexOf('schemastery') === -1) continue;
      let exported = null;
      try { exported = cache[id] && cache[id].exports; } catch (e) { continue; }
      take(exported, id + ' (already loaded in this process)');
    }
  } catch (e) { /* no module cache to read */ }
  return out;
}

/**
 * Pick the builder to build `Config` with: the best of the reachable ones.
 *
 * The preference order is the whole point of this function.
 *
 *   1. a builder with schemastery's OWN `.volatile()` — highest fidelity, the
 *      exact copy DSH validates against;
 *   2. a builder that only has `.extra()`, with the marker synthesized.
 *
 * Step 2 exists because "no `.volatile()` anywhere" used to mean "no Config",
 * and a missing Config is NOT a degraded theme — it is no persistence at all.
 * DSH projects no settings form for an entry without a volatile Config, so
 * every switch the user flips stays page-local and resets on the next reload:
 * the panel opens, the switches move, and nothing is ever written down. That is
 * exactly what happened on a host whose only *loadable* schemastery was the
 * unscoped 3.18.0 (no `.volatile()`), while the 3.18.4 copy that does have it
 * resolved from the profile but could not be required. Marking through
 * `.extra()` builds the same node shape (`.meta.volatile === true`), which is
 * all DSH's projection reads.
 *
 * @param candidates - `{ z, source }` records, closest require path first.
 * @param requireVolatile - when true only an editable (volatile) schema is
 *   acceptable, because DSH drops a non-volatile field and suppresses the whole
 *   form; when false any usable builder does (the pre-0.1.7 registration
 *   persisted whole namespaces instead of a volatile Config).
 * @returns `{ z, source, mode }`, or undefined when nothing is usable. */
function selectBuilder(candidates, requireVolatile) {
  const usable = [];
  for (const candidate of candidates) {
    const z = candidate.z;
    if (!z || typeof z.object !== 'function' || typeof z.string !== 'function') continue;
    usable.push(candidate);
  }
  if (!requireVolatile) {
    const first = usable[0];
    if (!first) return undefined;
    /* 'plain' unconditionally: this call site deliberately marks NOTHING, so
       naming the builder's own capability here would misdescribe the schema. */
    return { z: first.z, source: first.source, mode: 'plain' };
  }
  for (const candidate of usable) {
    if (hasVolatile(candidate.z)) return { z: candidate.z, source: candidate.source, mode: 'native' };
  }
  for (const candidate of usable) {
    if (hasVolatileMarker(candidate.z)) return { z: candidate.z, source: candidate.source, mode: 'synthesized' };
  }
  return undefined;
}

/**
 * @param requireVolatile - when true only a builder that can produce an
 *   editable (volatile) schema is acceptable (needed for DSH 0.1.7's Config).
 * @returns a usable builder, or undefined when none is reachable. On success
 *   SCHEMA_SOURCE records the root it came from and SCHEMA_MODE how it marks a
 *   field editable.
 */
function loadSchemastery(requireVolatile) {
  const chosen = selectBuilder(schemasteryCandidates(), requireVolatile);
  if (!chosen) return undefined;
  SCHEMA_SOURCE = chosen.source;
  SCHEMA_MODE = chosen.mode;
  return chosen.z;
}

/** Build the object schema over FIELD_DEFAULTS with an EXPLICIT builder.
 *
 *  Split out of {@link buildSchema} so the field contract — one string field per
 *  FIELD_DEFAULTS entry, each carrying its shipped default and, when asked, the
 *  volatile marker — can be asserted against a stand-in builder instead of
 *  whatever schemastery the test machine happens to have. A Host check that
 *  silently skips on a schemastery-free machine is precisely how
 *  "settings won't save" shipped green.
 *
 *  @param z - a schemastery builder.
 *  @param volatileFields - mark every field editable.
 *  @returns the object schema. */
function buildSchemaWith(z, volatileFields) {
  const fields = {};
  for (const [field, fallback] of Object.entries(FIELD_DEFAULTS)) {
    let leaf = z.string().default(fallback);
    if (volatileFields) leaf = volatileField(leaf);
    fields[field] = leaf;
  }
  return z.object(fields);
}

/**
 * Build one schemastery object schema over FIELD_DEFAULTS with the best
 * reachable builder.
 *
 * @param volatileFields - when true every field is marked editable (volatile),
 *   which is what makes it user-editable through DSH 0.1.7's settings service
 *   (only volatile paths are projected into a form and accepted by a write).
 *   The legacy pre-0.1.7 registration used the same schema shape without the
 *   flag, because that generation persisted whole namespaces instead of a
 *   Config.
 * @returns the schema, or undefined when no usable schemastery builder is
 *   reachable (the theme then stays a no-op instead of crashing the host half).
 */
function buildSchema(volatileFields) {
  try {
    const z = loadSchemastery(volatileFields === true);
    if (z === undefined || typeof z.object !== 'function' || typeof z.string !== 'function') return undefined;
    return buildSchemaWith(z, volatileFields === true);
  } catch (e) {
    // A schema we cannot build must never take the entry (and the theme) down.
    return undefined;
  }
}

/**
 * The Config DSH 0.1.7 projects into a settings form for this entry. It is
 * read off the plugin module namespace (`entry.fiber.runtime.Config`) when the
 * loader mounts the row, so it must exist at module evaluation time.
 *
 * `ctx.settings` refuses a write to any path that is not volatile, and it
 * suppresses the whole form when NO field is volatile — hence `true` here.
 * When no schemastery is reachable the property is omitted entirely, which is
 * exactly "this plugin has nothing to configure" and not an error — but it is
 * also the one failure that silently costs the user every preference on every
 * reload, so apply() reports it instead of staying quiet.
 */
const Config = buildSchema(true);

/** File name of the failure report written next to the profile patch. */
const DIAGNOSTIC_FILE = 'theme-endfield-diagnostic.json';

/** Where the failure report goes: the profile directory when the context names
 *  one, else the DSH home. Written only when no Config could be built, and
 *  deleted again the moment one can.
 *  @returns an absolute path, or null when neither location is derivable. */
function diagnosticPath(ctx) {
  const path = require('path');
  try {
    const base = ctx && typeof ctx.baseUrl === 'string' ? ctx.baseUrl : null;
    if (base && base.indexOf('file:') === 0) {
      return path.join(require('url').fileURLToPath(base), DIAGNOSTIC_FILE);
    }
    // A few hosts carry the profile as a plain directory rather than a URL.
    if (base && path.isAbsolute(base)) return path.join(base, DIAGNOSTIC_FILE);
  } catch (e) { /* fall through to the DSH home */ }
  try {
    const homes = dshHomeDirs();
    if (homes.length) return path.join(homes[0], DIAGNOSTIC_FILE);
  } catch (e) { /* no home to write into */ }
  return null;
}

/** Per-root resolution outcome, for the failure report.
 *  @returns one row per spec/root pair, or a single row describing the throw. */
function resolutionReport() {
  const rows = [];
  let roots = [];
  try { roots = resolutionRoots(); } catch (e) { return [{ roots: 'threw: ' + String((e && e.message) || e) }]; }
  for (const spec of SCHEMA_SPECS) {
    try { rows.push({ spec, from: 'plain require', resolved: require.resolve(spec) }); } catch (e) { rows.push({ spec, from: 'plain require', error: String((e && e.code) || (e && e.message) || e) }); }
  }
  for (const dir of roots) {
    for (const spec of SCHEMA_SPECS) {
      const row = { spec, from: dir };
      try {
        row.resolved = require.resolve(spec, { paths: [dir] });
        /* Resolving is NOT loading: a copy can resolve perfectly and still throw
           on require (a dependency that will not load, a half-written install).
           The old report stopped at the resolve, so a row reading "resolved"
           next to a Config that was never built looked like a contradiction
           instead of an answer. Record what the require actually did. */
        try {
          const loaded = require(row.resolved);
          row.loaded = true;
          row.volatile = hasVolatile(loaded);
          row.marker = hasVolatileMarker(loaded);
        } catch (e) {
          row.loadError = String((e && e.code) || (e && e.message) || e);
        }
      } catch (e) { row.error = String((e && e.code) || (e && e.message) || e); }
      rows.push(row);
    }
  }
  return rows;
}

/** Everything needed to explain a missing settings form on THIS machine.
 *  @returns a JSON-serializable snapshot; every read is individually guarded. */
function diagnosticSnapshot(ctx) {
  const read = (produce) => { try { return produce(); } catch (e) { return 'threw: ' + String((e && e.message) || e); } };
  let loader = null;
  try { loader = ctx && typeof ctx.get === 'function' ? ctx.get('loader') : null; } catch (e) { loader = null; }
  return {
    at: new Date().toISOString(),
    plugin: read(() => NAME + ' ' + require('./package.json').version),
    configBuilt: Config !== undefined,
    schemaSource: SCHEMA_SOURCE,
    schemaMode: SCHEMA_MODE,
    node: process.version,
    pid: process.pid,
    execPath: process.execPath,
    argv: process.argv.slice(0, 6),
    cwd: read(() => process.cwd()),
    dirname: __dirname,
    filename: __filename,
    mainModule: read(() => (require.main && require.main.filename) || null),
    baseUrl: read(() => (ctx && typeof ctx.baseUrl === 'string' ? ctx.baseUrl : null)),
    dshHomeDirs: read(dshHomeDirs),
    homedir: read(() => require('os').homedir()),
    envDshHome: read(() => (process.env && process.env.DSH_HOME) || null),
    envCordisShared: read(() => (process.env && process.env.CORDIS_SHARED) || null),
    loaderStartedAt: read(() => {
      const start = loader && loader.envData && loader.envData.startTime;
      return typeof start === 'number' ? new Date(start).toISOString() : null;
    }),
    cachedSchemasteryModules: read(() => Object.keys(require.cache || {}).filter((id) => id.indexOf('schemastery') !== -1)),
    resolution: read(resolutionReport),
  };
}

/** Report a missing settings form: a warn line for the log, plus the JSON
 *  report above so the exact machine state can be inspected afterwards. */
function reportMissingConfig(ctx) {
  const note = NAME + ': no schemastery builder that can mark a field volatile was reachable, so this entry'
    + ' exports no Config: DSH projects no settings form for it and every preference stays'
    + ' page-local (it resets on each reload). Tried ' + SCHEMA_SPECS.join(', ') + ' through the'
    + ' plain require chain, this module\'s own tree, the DSH home profiles, the working'
    + ' directory, this module\'s ancestors, require.main and the process module cache.'
    + ' Neither `.volatile()` nor the `.extra()` it is built on was available, so no field'
    + ' could be marked editable.';
  try {
    if (ctx.logger && typeof ctx.logger.warn === 'function') ctx.logger.warn(note);
    else if (typeof console !== 'undefined' && console.warn) console.warn(note);
  } catch (e) { /* a logger that throws must not kill the theme */ }
  try {
    const target = diagnosticPath(ctx);
    if (!target) return;
    require('fs').writeFileSync(target, JSON.stringify(diagnosticSnapshot(ctx), null, 2) + '\n');
    if (ctx.logger && typeof ctx.logger.warn === 'function') {
      ctx.logger.warn(NAME + ': wrote the failure report to ' + target);
    }
  } catch (e) { /* a report that cannot be written must not kill the theme */ }
}

/** Drop a report left by an earlier boot: the form exists now. */
function clearStaleDiagnostic(ctx) {
  try {
    const target = diagnosticPath(ctx);
    if (!target) return;
    const fs = require('fs');
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (e) { /* nothing to clean up */ }
}

function apply(ctx) {
  /* Diagnostics, once per mount. Without a volatile Config this entry has no
     settings form, so the browser half reads and writes its preferences
     page-locally: every switch still works, and every switch is gone on the next
     reload. That is indistinguishable from "the theme is broken" unless the host
     says what happened — so it says it in the log AND leaves a readable report
     behind, because the reason is a property of this machine's install layout
     (see resolutionRoots) that no generic message can name. */
  if (Config === undefined) {
    reportMissingConfig(ctx);
  } else {
    clearStaleDiagnostic(ctx);
    // Which copy answered, at debug level: the one question that decides whether
    // a form exists at all, and otherwise invisible.
    try {
      if (ctx.logger && typeof ctx.logger.debug === 'function') ctx.logger.debug(NAME + ': Config built from ' + String(SCHEMA_SOURCE) + ' (volatile mode: ' + String(SCHEMA_MODE) + ')');
    } catch (e) { /* logging is never load-bearing */ }
  }

  // Wait for the host settings service. Cordis `ctx.inject(['settings'], ...)`
  // WAITS for the service (same convention as @deepseek-ai/dsh-client-ui-theme,
  // dsh-agent-presets, …), so registration is reliable however concurrently
  // mounted plugins interleave; a synchronous `ctx.get('settings')` probe would
  // race and could see it absent.
  ctx.inject(['settings'], (settingsCtx) => {
    if (!settingsCtx || !settingsCtx.settings) return;
    const settings = settingsCtx.settings;

    /* DSH >= 0.1.7: page policy only.
       This plugin renders its own settings page (client.js registers a
       `settings.section` row with four groups and live previews), so the
       auto-generated Config page would be a second, poorer copy of it. An
       absent `autoGenerate:false` policy is what makes DSH add that page.
       Scoped to this plugin's fiber and disposed with the run. */
    if (typeof settings.configure === 'function') {
      try {
        settingsCtx.effect(() => settings.configure({ auto: false }, ctx.fiber));
      } catch (e) {
        // A policy may already be registered for this fiber (double mount);
        // the theme must still load.
      }
    }

    /* DSH <= 0.1.5-rc.2: the legacy namespace registration.
       Those hosts persisted a plugin-declared namespace to
       `<dshHome>/settings.yaml` and mirrored it to the browser through
       `ctx.settingsScope`, which the client half still binds when no
       `configForms` service exists. Feature-detected: on 0.1.7 `register` is
       gone and this branch is simply skipped — the Config above is the
       declaration instead. */
    if (typeof settings.register === 'function') {
      const schema = buildSchema(false);
      if (schema === undefined) return;
      try {
        // Registration is scoped to this plugin's fiber and disposed with the run.
        settings.register(LEGACY_NAMESPACE, schema, { applies: 'live' });
      } catch (e) {
        // A throw here must not kill the whole theme; leaving it unregistered
        // just means browser prefs stay page-local on that host generation.
      }
    }
  });
}

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
};
