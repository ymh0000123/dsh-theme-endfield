
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
/* WHY a fast path AND a cache: the full scan below (resolutionRoots +
   require.resolve across every root) costs ~80ms of module-evaluation time on a
   real install. That window is not free — the host half must finish evaluating
   before its loader entry activates, and a web page that boots while it runs
   picks up a boot graph without this theme's row ("import failed (see
   console)"). Heavy sibling plugins (e.g. dsh-codearts-auth) widen that window
   further, so every millisecond shaved here narrows the race. The fast path
   answers from the two require chains — a handful of stats — and short-circuits
   ONLY on a native-volatile builder, the top preference of selectBuilder, so it
   can never choose worse than the scan would. The cache key is a registry
   Symbol so re-evaluation of this module in the SAME process (plugin reload,
   dual require/import) reuses the first scan with zero filesystem access. */
const SCHEMA_SCAN_CACHE = Symbol.for('dsh-theme-endfield.schemastery.scan');

function schemasteryCandidates() {
  /* Same-process re-evaluation: the first scan's answer is still this
     process's answer. */
  try {
    const cached = globalThis[SCHEMA_SCAN_CACHE];
    if (Array.isArray(cached)) return cached;
  } catch (e) { /* fall through to a fresh scan */ }
  const out = [];
  const seenBuilders = [];
  const take = (found, source) => {
    const builder = normalizeSchemastery(found);
    if (!builder) return;
    if (seenBuilders.indexOf(builder) !== -1) return;
    seenBuilders.push(builder);
    out.push({ z: builder, source });
  };
  /* FAST PATH — scoped spec first, plain require chain then require.main's, the
     two shapes a real install answers through (published profile installs
     resolve from this package's own chain; dev-link installs from the host
     process's). Each miss is a failed resolve against a short ancestor chain,
     i.e. microseconds. A hit is accepted only when it carries schemastery's
     OWN .volatile(): that is selectBuilder's highest preference, so skipping
     the scan cannot demote the choice. A marker-only builder (.extra(), no
     .volatile()) deliberately falls through — the scan's candidate order still
     decides between it and a native copy found elsewhere. */
  for (const spec of SCHEMA_SPECS) {
    const attempts = [[spec, () => require(spec)]];
    try {
      if (require.main && typeof require.main.require === 'function') {
        attempts.push([spec + ' via require.main', () => require.main.require(spec)]);
      }
    } catch (e) { /* no main module to ask */ }
    for (const [source, attempt] of attempts) {
      try {
        const builder = normalizeSchemastery(attempt());
        if (builder && typeof builder.object === 'function' && typeof builder.string === 'function' && hasVolatile(builder)) {
          out.push({ z: builder, source });
          try { globalThis[SCHEMA_SCAN_CACHE] = out; } catch (e) { /* cache is best-effort */ }
          return out;
        }
      } catch (e) { /* keep trying */ }
    }
  }
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
  try { globalThis[SCHEMA_SCAN_CACHE] = out; } catch (e) { /* cache is best-effort */ }
  return out;
}
