/* The host half ships TWO files: index.js (CommonJS, all of the logic) and
   index.mjs (the ESM entry the loader actually imports). index.mjs exists for one
   reason — a module-evaluation-time `require('@deepseek-ai/schemastery')` loses a
   race against DSH's own concurrent `import` of the pure-ESM `@deepseek-ai/cosmokit`
   (ERR_REQUIRE_ESM_RACE_CONDITION), and an ESM import sequences behind it instead.
   See docs/engineering-notes.md §「宿主入口为什么必须是 ESM」.

   The race itself can only be observed inside a real host boot, so what is pinned
   here is everything around it that a regression could break silently:

     1. what DSH mounts — cordis `unwrapExports()` resolves `exports.default ?? exports`,
        so `Config`/`apply`/`name` have to be on the DEFAULT export, and the named
        exports have to mirror them;
     2. the entry must not diverge from the CommonJS half (same Config object);
     3. the warm-up must stay best-effort: on a host where no schemastery is
        reachable at all, the entry still loads and still exports `apply`, and the
        CommonJS half's documented no-op (`Config === undefined`) is what comes out
        — an entry that throws would take the whole plugin down instead. */
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ROOT = path.join(__dirname, '..')
const ENTRY = path.join(ROOT, 'index.mjs')
const COMMONJS = path.join(ROOT, 'index.js')

;(async () => {
  const mod = await import(pathToFileURL(ENTRY).href)
  const plugin = mod.default ?? mod
  const cjs = require(COMMONJS)

  /* 1. the surface DSH mounts */
  assert.equal(typeof plugin.name, 'string', 'default export must carry name')
  assert.equal(plugin.name, cjs.name, 'both halves must report the same plugin name')
  assert.equal(typeof plugin.apply, 'function', 'default export must carry apply')
  assert.ok(Object.prototype.hasOwnProperty.call(plugin, 'Config'),
    'default export must carry Config as its own property (unwrapExports reads it)')
  assert.equal(mod.apply, plugin.apply, 'named apply must be the same function')
  assert.equal(mod.name, plugin.name, 'named name must be the same value')
  assert.equal(mod.Config, plugin.Config, 'named Config must be the same schema')

  /* 2. no divergence between the two halves */
  assert.equal(plugin.Config, cjs.Config,
    'the ESM entry must expose the CommonJS half\'s Config, not a second one built differently')
  if (plugin.Config !== undefined) {
    assert.equal(typeof plugin.Config.toJSON, 'function', 'Config must be a real schemastery schema')
    const fields = Object.keys(cjs.FIELD_DEFAULTS)
    const declared = Object.keys(plugin.Config.dict || {})
    assert.deepEqual(declared, fields, 'every FIELD_DEFAULTS field must reach the exported schema')
  }

  /* 3. best-effort warm-up, on a host that cannot see any schemastery */
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-theme-esm-'))
  try {
    const probe = [
      `const m = await import(${JSON.stringify(pathToFileURL(ENTRY).href)});`,
      'const p = m.default ?? m;',
      'process.stdout.write(JSON.stringify({',
      "  name: typeof p.name,",
      "  apply: typeof p.apply,",
      "  config: p.Config === undefined ? 'undefined' : 'present',",
      "  namedConfig: m.Config === undefined ? 'undefined' : 'present',",
      '}));',
    ].join('\n')
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
      cwd: sandbox,
      /* An isolated HOME / DSH_HOME / cwd is what removes every schemastery copy
         from resolutionRoots()'s reach: without them the scan finds the copy in
         the developer's own profile and this case proves nothing. */
      env: { ...process.env, HOME: sandbox, USERPROFILE: sandbox, DSH_HOME: sandbox, PATH: '' },
      encoding: 'utf8',
    })
    const seen = JSON.parse(out)
    assert.equal(seen.name, 'string', 'the entry must load even when no schemastery is reachable')
    assert.equal(seen.apply, 'function', 'apply must survive a host without schemastery')
    assert.equal(seen.config, 'undefined',
      'a host with no reachable schemastery must degrade to the documented no-op, '
      + 'not invent a schema (isolation broke if this is "present")')
    assert.equal(seen.namedConfig, 'undefined', 'the named export must degrade the same way')
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true })
  }

  console.log('PASS: ESM host entry mirrors the CommonJS half and degrades to the documented no-op')
})().catch((error) => { console.error(error); process.exitCode = 1 })
