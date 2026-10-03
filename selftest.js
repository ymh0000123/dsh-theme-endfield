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
    name: 'turn-status recoloured with a hard-coded literal instead of the measured palette stop',
    /* DSH 0.2 moved this label to masked-sweep text whose only lever is the
       --dsw-alias-label-deep-diving token pair, so the guard checks the override
       layer's VALUES and no longer looks for a background-image rule. This injection
       swaps the light value for the literal the theme's own measurements REJECTED
       (#8f7c00 scores 4.21 on the dark surface and 3.38 on cream) — exactly the
       mistake the guard has to catch. The pattern is written against the declaration
       rather than with fixed indentation so it survives reformatting. */
    mutate: (s) => s.replace(
      /('--dsw-alias-label-deep-diving':\s*\{\s*light:\s*)'var\(--edge-status-light\)'/,
      "$1'#8f7c00'"),
    expect: /turn-status label is not retinted/,
  },
  {
    name: 'the dead [class*=turnStatus] selector comes back',
    /* A rule targeting the pre-0.2 class name cannot match on 0.2, so it reads like a
       fix while doing nothing. The guard has to fail on it rather than accept the
       presence of "a turn-status rule". */
    mutate: (s) => s.replace(
      '      /* ================= boot loading screen ================= */',
      "      body [class*='turnStatus']:not([class*='turnStatusClock']) { color: red; }\n"
      + '      /* ================= boot loading screen ================= */'),
    expect: /dead \[class\*='turnStatus'\] selector/,
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
  {
    name: '雷霆大字 goes back to reading the removed `current` list field (announces nothing, forever)',
    /* The real reported regression: the Controller moved view selection out of
       itself, so `sessions.list.getSnapshot().current` is undefined on the current
       app. The injection restores exactly the shipped line, and the feature dies
       silently — no throw, no log, the settings switch still reads ON. */
    mutate: (s) => s.replace(
      /\?\s*undefined\s*:\s*thunderCurrentId\(snap\)/,
      '? undefined : snap.current'),
    expect: /does not resolve the current session/,
  },
  {
    name: 'the menu fill falls back to the platform\'s translucent material (the /命令 panel loses its background)',
    /* The reported regression: 0.2 paints every menu through
       `background: var(--dsw-menu-surface-fill)` (MenuSurface's _material layer), whose
       platform default is a 45%/58% alpha literal meant to be absorbed by a 40px blur.
       Over the contour sheet the composite is a couple of RGB steps off the page, so the
       panel reads as background-less and the conversation behind it shows through.
       The injection restores exactly the shipped default for one scheme. */
    mutate: (s) => s.replace(
      /('--dsw-menu-surface-fill':\s*\{\s*light:\s*)'var\(--dsw-alias-bg-overlay\)'/,
      "$1'#43454a73'"),
    expect: /platform default|translucent again/,
  },
  {
    name: 'the statutory-holiday table goes stale (next January is billed as peak, silently)',
    /* The failure this guard is FOR: the 放假安排 notice is published each November
       for the coming year, so the table ages out quietly — the capsule keeps
       rendering, the switch still reads ON, and a whole national holiday is priced
       as peak. Renaming the current year is exactly that end state. */
    mutate: (s) => s.replace(/\n(\s*)2026: \{/, '\n$1STALE_2026: {'),
    expect: /no entry for the current Beijing year/,
  },
  {
    name: 'a 调休 make-up workday is moved onto a weekday (the weekend rule no longer covers it)',
    /* 调休 days are billed off-peak only because every one of them falls on a
       Saturday or Sunday. A notice that moved a normal weekday would silently keep
       being priced as peak, so the guard has to stop the transcription. 2026-05-08
       is the Friday before 劳动节's real make-up day. */
    mutate: (s) => s.replace("makeup: ['05-09']", "makeup: ['05-08']"),
    expect: /not a Saturday or Sunday/,
  },
  {
    name: 'a holiday span is transcribed so it overlaps another (a day loses its own name)',
    /* 清明节 widened back over 元旦: the map is written span by span, so the later
       span would silently take 01-01 away from 元旦 — a transcription slip the
       name-by-name expansion check is there to catch. */
    mutate: (s) => s.replace("{ name: '清明节', from: '04-04', to: '04-06'", "{ name: '清明节', from: '01-01', to: '04-06'"),
    expect: /does not expand to its own name/,
  },
]

let bad = 0

// The scratch copy lives in the repo root and is not gitignored, so it must not
// survive a failed or interrupted run — hence finally, not a tail call.
try {
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
} finally {
  try { fs.unlinkSync(tmp) } catch (e) { /* never created */ }
}

console.log('')
if (bad) {
  console.error(`${bad} self-test(s) failed`)
  process.exit(1)
}
console.log('all self-tests passed')
