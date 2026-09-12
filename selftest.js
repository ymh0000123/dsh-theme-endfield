/**
 * Self-test for check.js: inject each real historical bug into a COPY of client.js
 * and assert the guard actually fails. A guard that has never been seen to fail is
 * not evidence of anything.
 *
 * Runs check.js in-process against a temporary file by importing its logic path:
 * simplest reliable approach is to copy client.js aside, mutate it, point check.js
 * at it via argv, and restore. check.js therefore accepts an optional target path.
 *
 * Usage: node selftest.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const root = __dirname
const real = path.join(root, 'client.js')
const tmp = path.join(root, '.selftest-client.js')
const checkSrc = fs.readFileSync(path.join(root, 'check.js'), 'utf8')
const original = fs.readFileSync(real, 'utf8')

/** Run check.js against `tmp`, capturing its pass/fail lines and exit intent. */
function runCheck() {
  const logs = []
  let failed = false
  const sandbox = {
    require,
    __dirname: root,
    __filename: path.join(root, 'check.js'),
    module: { exports: {} },
    exports: {},
    console: {
      log: (...a) => logs.push(['ok', a.join(' ')]),
      error: (...a) => logs.push(['FAIL', a.join(' ')]),
    },
    process: {
      argv: [process.argv[0], 'check.js', tmp],
      execPath: process.execPath,
      exit: (code) => { if (code) failed = true },
    },
  }
  sandbox.globalThis = sandbox
  try {
    vm.createContext(sandbox)
    new vm.Script(checkSrc, { filename: 'check.js' }).runInContext(sandbox)
  } catch (e) {
    logs.push(['FAIL', 'check.js threw: ' + e.message])
    failed = true
  }
  const text = logs.map(([k, m]) => k + ' ' + m).join('\n')
  return { failed: failed || /(^|\n)FAIL/.test(text), text }
}

const CASES = [
  {
    name: 'comment closed early (prose leaks into live CSS)',
    mutate: (s) => s.replace(
      'additionally carry a px floor — see the max() calls below. */',
      'additionally carry a px floor */ see the max() calls below.'),
    expect: /prose leaked/,
  },
  {
    name: 'backtick inside a CSS comment (kills the template literal)',
    /* The injected character is the backtick, written as an escape rather than
       built from its char code: the char-code spelling is an obfuscation
       signature to plugin scanners, and the escape is the same one character. */
    mutate: (s) => s.replace(
      "1. A plain 'color:' CANNOT",
      '1. A plain ' + '\u0060' + 'color:' + '\u0060' + ' CANNOT'),
    expect: /stray backtick/,
  },
  {
    name: 'turn-status recoloured with an ineffective color: instead of a gradient',
    /* The gradient stops are palette VARIABLES now, not literals, so this injection
       matches var(--edge-status-*) rather than a hex. It previously named #6b5d00 /
       #fff500 directly and went vacuous the moment the palette refactor landed —
       which the "INJECTION DID NOT APPLY" guard below caught, and is precisely why
       that guard exists. \s* spans CRLF as well as LF, so these stay valid on
       either checkout. */
    mutate: (s) => s
      .replace(/background-image:\s*linear-gradient\(90deg,\s*var\(--edge-status-light\)[^;]*;/,
        'color: var(--edge-status-light) !important;')
      .replace(/background-image:\s*linear-gradient\(90deg,\s*var\(--edge-status-dark\)[^;]*;/,
        'color: var(--edge-status-dark) !important;'),
    expect: /no background-image gradient|cannot recolour/,
  },
  {
    name: '--edge-word used but never defined',
    // Indentation-agnostic for the same reason.
    mutate: (s) => s.replace(
      /^\s*--edge-word:\s*clamp\([^;]*;/m,
      '        /* deliberately removed */'),
    expect: /--edge-word is used .* never DEFINED/,
  },
  {
    name: 'unbalanced CSS brace',
    // Line-ending agnostic: a literal \n would silently fail to match on a CRLF
    // checkout, which is exactly how this case first went vacuous when run against
    // an exported copy of the commit.
    mutate: (s) => s.replace(
      /(\[data-endfield-loader-brand\]\s*\{)/,
      '$1\n      {'),
    expect: /braces unbalanced/,
  },
  /* --- palette guards. Each of the three below is a failure mode the palette
     refactor introduced the possibility of, so each is proved to be caught. --- */
  {
    name: 'a palette variable is deleted (every rule reading it silently dies)',
    /* Both palettes define it, so BOTH declarations have to go — deleting only the
       default one leaves the variable defined and the guard rightly stays quiet.
       (That is what this case measured on the first attempt.) */
    mutate: (s) => s.replace(/^\s*--edge-accent-deep:\s*#[0-9a-f]{6};/gim, '        /* removed */'),
    expect: /palette variable\(s\) never DEFINED/,
  },
  {
    name: 'the 武陵青 palette block is removed (switch becomes inert)',
    mutate: (s) => s.replace('body.theme-endfield-wuling {', 'body.theme-endfield-wuling-DISABLED {'),
    expect: /no body\.theme-endfield-wuling block/,
  },
  {
    name: 'a token-reading --edge-* variable is moved back to :root (computes EMPTY)',
    /* Reproduces the real shipped bug: --edge-line at :root substituting a
       --dsw-* token that the app sets inline on body. Measured empty in a browser,
       which silently disabled the themed scrollbar.

       This case used to be injected INTO the theme's own :root block. That block
       is gone now — it was the global font-token override that restyled every
       third-party widget — so the case injects a :root block of its own instead,
       which is strictly better: it no longer depends on the theme having a :root
       block at all, and it still proves the structural check catches the bug.

       The anchor is the stylesheet's first line, which is indentation-agnostic:
       matching `insertCss(` plus the newline that follows it, whatever it is
       (this checkout is CRLF, so a literal \n never matches — the same footgun
       already recorded on the brace case below). */
    mutate: (s) => s.replace(
      /(insertCss\(`[^\S\r\n]*\r?\n)/,
      '$1      :root { --edge-line: var(--dsw-alias-border-l1); }\n'),
    expect: /declared at :root while substituting a body-level token/,
  },
  {
    name: 'the theme redeclares the app font token (restyles every third-party widget)',
    /* The real regression this guard exists for: a :root override of the app's
       UI root font token. Every widget injected into the app root that carries
       font-family:inherit picked it up (measured on a body-level probe: the
       widget's computed font-family became Arial while the app's own stack was
       gone), so the theme must never declare it again — not at :root, not on
       body, not inside a media query. */
    mutate: (s) => s.replace(
      /(insertCss\(`[^\S\r\n]*\r?\n)/,
      '$1      :root { --dsw-font-family: Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; }\n'),
    expect: /--dsw-font-family.*DECLARED by the theme/,
  },
]

let bad = 0

// 0. the guard must PASS on the pristine file
fs.writeFileSync(tmp, original)
let base = runCheck()
if (base.failed) {
  console.error('FAIL  baseline: guard rejects the real client.js\n' + base.text)
  bad++
} else {
  console.log('ok    baseline: guard passes on the real client.js')
}

// 1..n: each injected bug must be caught
for (const c of CASES) {
  const mutated = c.mutate(original)
  if (mutated === original) {
    console.error(`FAIL  ${c.name}: INJECTION DID NOT APPLY (test is vacuous)`)
    bad++
    continue
  }
  fs.writeFileSync(tmp, mutated)
  const r = runCheck()
  if (!r.failed) {
    console.error(`FAIL  ${c.name}: guard did NOT fail`)
    bad++
  } else if (!c.expect.test(r.text)) {
    console.error(`FAIL  ${c.name}: failed, but not with the expected message`)
    console.error(r.text.split('\n').filter((l) => l.startsWith('FAIL')).join('\n'))
    bad++
  } else {
    console.log(`ok    caught: ${c.name}`)
  }
}

fs.unlinkSync(tmp)
console.log('')
if (bad) {
  console.error(`${bad} self-test(s) failed`)
  process.exit(1)
}
console.log('all self-tests passed')
