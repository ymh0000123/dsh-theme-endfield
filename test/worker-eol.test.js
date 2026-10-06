/* The embedded worker is compared byte-for-byte, so the build script has to speak
   the checkout's own line endings. It used to join its generated block with '\n',
   which made `--check` fail on every CRLF working tree (core.autocrlf=true on
   Windows) while the embedded copy was actually fresh — the gate aborted the suite
   before the last four tests could run. These cases pin both halves: a CRLF
   checkout must pass, and a genuinely stale one must still fail. */
const test = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const cp = require('node:child_process')
const root = path.resolve(__dirname, '..')
/* The whole point of this file is the CRLF/LF split, so it has to follow the
   build: the kernel now lives in src/client/20-contour.js and the generated block
   is its own fragment (src/client/21-contour-worker.embed.js). */
const INPUTS = [
  'src/client/20-contour.js', 'src/client/21-contour-worker.embed.js',
  'src/contour-worker.js', 'src/contour-webgl.js',
]

/** A throwaway checkout with every input converted to `eol`. */
function checkout(eol, { stale = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contour-eol-'))
  for (const rel of INPUTS) {
    const dest = path.join(dir, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    let text = fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n')
    if (eol === '\r\n') text = text.replace(/\n/g, '\r\n')
    fs.writeFileSync(dest, text)
  }
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  fs.copyFileSync(path.join(root, 'scripts/build-contour-worker.js'),
    path.join(dir, 'scripts/build-contour-worker.js'))
  // contour-webgl.js is embedded verbatim, so editing it makes the copy stale.
  if (stale) {
    const src = path.join(dir, 'src/contour-webgl.js')
    fs.writeFileSync(src, fs.readFileSync(src, 'utf8') + 'const CONTOUR_EOL_PROBE = 1' + eol)
  }
  return dir
}
const build = (dir, ...args) => cp.spawnSync(
  process.execPath, [path.join(dir, 'scripts/build-contour-worker.js'), ...args],
  { cwd: dir, encoding: 'utf8' })

test('--check passes on an LF checkout', () => {
  const r = build(checkout('\n'), '--check')
  assert.equal(r.status, 0, r.stderr)
})

test('--check passes on a CRLF checkout whose embedded worker is fresh', () => {
  const r = build(checkout('\r\n'), '--check')
  assert.equal(r.status, 0, r.stderr)
})

test('--check still catches a stale embedded worker on a CRLF checkout', () => {
  const r = build(checkout('\r\n', { stale: true }), '--check')
  assert.notEqual(r.status, 0, 'a stale copy must not pass the gate')
})

test('write mode keeps the checkout line endings uniform', () => {
  const dir = checkout('\r\n')
  assert.equal(build(dir).status, 0)
  const out = fs.readFileSync(path.join(dir, 'src/client/21-contour-worker.embed.js'), 'utf8')
  const lfOnly = out.split('\n').slice(0, -1).filter((line) => !line.endsWith('\r'))
  assert.equal(lfOnly.length, 0, `rebuilt fragment mixed in ${lfOnly.length} LF-only lines`)
  assert.equal(build(dir, '--check').status, 0, 'a rebuild must satisfy its own check')
})
