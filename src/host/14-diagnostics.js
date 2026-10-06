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

