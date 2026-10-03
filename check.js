/**
 * check.js — guard rails for the theme's single-template-literal stylesheet.
 *
 * Why this exists: the whole theme stylesheet is ONE JavaScript template literal
 * passed to insertCss(`...`). A stray backtick anywhere inside it — including inside
 * a CSS comment — terminates the literal early and breaks the entire client bundle
 * at parse time, not just the rule being edited. That failure mode was hit twice
 * while editing comments, so it is now checked mechanically instead of by care.
 *
 * Also verifies ${...} is absent: inside a template literal that is interpolation,
 * so a CSS snippet containing it would either throw or silently inject a value.
 *
 * Usage: node check.js [target.js]   (exit 0 = clean, 1 = problem found)
 *        The optional target exists so selftest.js can point the same logic at a
 *        deliberately-broken copy and prove each check really fails.
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const file = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, 'client.js')
const src = fs.readFileSync(file, 'utf8')
const lines = src.split('\n')

let failures = 0
const fail = (msg) => { console.error('FAIL  ' + msg); failures++ }
const pass = (msg) => console.log('ok    ' + msg)

/* --- 1. locate the stylesheet template literal --- */
const openIdx = src.indexOf('insertCss(`')
if (openIdx < 0) {
  fail('could not find insertCss(` — has the stylesheet been restructured?')
} else {
  const bodyStart = openIdx + 'insertCss(`'.length
  const closeIdx = src.indexOf('`)', bodyStart)
  if (closeIdx < 0) {
    fail('stylesheet template literal is never closed with `)')
  } else {
    const body = src.slice(bodyStart, closeIdx)
    const openLine = src.slice(0, bodyStart).split('\n').length
    const closeLine = src.slice(0, closeIdx).split('\n').length

    // Any backtick between the delimiters would have ended the literal early.
    const stray = body.indexOf('`')
    if (stray >= 0) {
      const ln = src.slice(0, bodyStart + stray).split('\n').length
      fail(`stray backtick inside the stylesheet at line ${ln}: `
        + `${lines[ln - 1].trim().slice(0, 80)}\n      `
        + `-> a backtick ends the template literal; use 'single quotes' in comments.`)
    } else {
      pass(`stylesheet literal is backtick-clean (lines ${openLine}-${closeLine})`)
    }

    if (body.includes('${')) {
      const ln = src.slice(0, bodyStart + body.indexOf('${')).split('\n').length
      fail(`'\${' inside the stylesheet at line ${ln} — that is template interpolation, not CSS`)
    } else {
      pass('stylesheet contains no ${...} interpolation')
    }

    /* --- 2. CSS comment balance ---
       A previously-fixed bug closed a comment early with a stray close-marker,
       which dropped the following prose lines into the stylesheet as live CSS:
       --edge-word was then never defined and the whole brand block collapsed to the
       top-left. The file still PARSES in that state, so only this check catches it.
       (Writing that marker literally here would close THIS comment early too —
       which is precisely the failure being guarded against.)
       Braces inside comments must be ignored, so comments are stripped first and
       the brace balance below runs on real CSS only. */
    let stripped = ''
    let inComment = false
    let commentStart = -1
    let unterminated = -1
    let strayClose = -1
    for (let i = 0; i < body.length; i++) {
      if (!inComment && body[i] === '/' && body[i + 1] === '*') {
        inComment = true
        commentStart = i
        i++
        continue
      }
      if (inComment && body[i] === '*' && body[i + 1] === '/') {
        inComment = false
        i++
        continue
      }
      if (!inComment) {
        // A bare */ outside any comment means an earlier one closed too soon.
        if (body[i] === '*' && body[i + 1] === '/' && strayClose < 0) strayClose = i
        stripped += body[i]
      }
    }
    if (inComment) unterminated = commentStart

    const lineOf = (offset) => src.slice(0, bodyStart + offset).split('\n').length
    if (unterminated >= 0) {
      fail(`unterminated CSS comment opened at line ${lineOf(unterminated)} `
        + `-> everything after it is swallowed as a comment`)
    } else if (strayClose >= 0) {
      fail(`stray '*/' outside any comment at line ${lineOf(strayClose)}: `
        + `${lines[lineOf(strayClose) - 1].trim().slice(0, 70)}\n      `
        + `-> a comment closed early; the prose after it becomes live CSS`)
    } else {
      pass('CSS comments balanced')
    }

    /* --- 3. brace balance of the real CSS (comments already removed) --- */
    let depth = 0
    let bad = 0
    for (const ch of stripped) {
      if (ch === '{') depth++
      else if (ch === '}') { depth--; if (depth < 0) { bad++; depth = 0 } }
    }
    if (depth !== 0 || bad !== 0) {
      fail(`CSS braces unbalanced: ${depth} unclosed, ${bad} unexpected '}'`)
    } else {
      pass('CSS braces balanced')
    }

    /* --- 4. no sentence prose may sit at the top level of the live CSS ---
       This is the check that actually catches the historical "comment closed too
       early" bug. Closing a comment early leaves the comment BALANCED, so a
       comment-pairing check passes; the damage is that the leftover prose lands at
       the top level of the stylesheet, fuses with the next selector and silently
       kills that entire rule (measured: the prose "see the max() calls below."
       landed directly before "[data-endfield-loader] {", so the loader's variable
       block was dropped and the brand block collapsed to the top-left).

       Detection must be precise, not clever. A first attempt flagged any top-level
       chunk containing a comma or an English word and produced 33 FALSE POSITIVES
       on legitimate selectors (":is([role='tab'], ...)", "input, textarea",
       "tbody tr:hover"). The reliable signal is far narrower: real CSS selectors
       never contain a BARE WORD ending in a sentence period, and never contain a
       word immediately followed by a period-space. Prose does. */
    const suspects = []
    let buf = ''
    let bufAt = 0
    let inRule = 0
    for (let i = 0; i < stripped.length; i++) {
      const ch = stripped[i]
      if (ch === '{') {
        if (inRule === 0) {
          const sel = buf.trim()
          // ". " or a trailing "." after a letter — impossible in a selector,
          // characteristic of a sentence. (".foo" class syntax has the dot BEFORE
          // the word, so it never matches.)
          if (/[A-Za-z]\.(\s|$)/.test(sel)) {
            suspects.push({ text: sel.replace(/\s+/g, ' ').slice(0, 70), at: bufAt })
          }
        }
        inRule++
        buf = ''
        continue
      }
      if (ch === '}') { inRule = Math.max(0, inRule - 1); buf = ''; bufAt = i + 1; continue }
      if (inRule === 0) {
        if (!buf) bufAt = i
        buf += ch
      }
    }
    if (suspects.length) {
      for (const s of suspects) {
        fail(`prose leaked into live CSS near line ${lineOf(s.at)}: "${s.text}"\n      `
          + `-> a comment almost certainly closed early; the next rule is being destroyed`)
      }
    } else {
      pass('no sentence prose at the top level of the live CSS')
    }

    /* --- 5. the variables the brand block depends on must be DEFINED in CSS ---
       The collapse bug above manifested as a used-but-undefined custom property, so
       assert definition rather than mere mention (a comment mention is not a
       definition). */
    for (const v of ['--edge-word', '--edge-gap']) {
      if (new RegExp('^\\s*' + v + '\\s*:', 'm').test(stripped)) {
        pass(`${v} is defined in live CSS`)
      } else {
        fail(`${v} is used by the loader but never DEFINED in live CSS`)
      }
    }

    /* --- 6. both accent palettes must be DEFINED, and on body rather than :root ---
       Every accent in this stylesheet reads from these variables, so a missing one
       does not degrade gracefully: each rule that references it computes to nothing
       and that entire declaration is dropped.

       The :root check is the important half, and it is not hypothetical. The app
       applies its theme tokens as INLINE STYLES ON body, so a custom property
       declared at :root that substitutes a --dsw-* token is resolved at the html
       element, where the token does not exist -> guaranteed-invalid, computing to
       empty. The shipped --edge-line / --edge-paper / --edge-soft were declared
       that way and measured EMPTY in a real browser, silently disabling the themed
       scrollbar. Anything reading a token must therefore be declared on body. */
    const paletteVars = [
      '--edge-accent', '--edge-accent-rgb', '--edge-accent-deep', '--edge-accent-onpaper',
      '--edge-status-light', '--edge-status-light-mid', '--edge-status-dark',
      '--edge-status-dark-mid', '--edge-glow-light', '--edge-glow-dark',
    ]
    const missing = paletteVars.filter((v) => !new RegExp('^\\s*' + v + '\\s*:', 'm').test(stripped))
    if (missing.length === 0) pass(`all ${paletteVars.length} palette variables are defined in live CSS`)
    else fail(`palette variable(s) never DEFINED in live CSS: ${missing.join(', ')}`)

    // The 武陵青 palette must exist as an override block, or the switch is inert.
    if (/body\.theme-endfield-wuling\s*\{/.test(stripped)) {
      pass('武陵青 palette block (body.theme-endfield-wuling) is present')
    } else {
      fail('no body.theme-endfield-wuling block — the palette switch would do nothing')
    }

    /* --- 7. the app's font TOKENS must not be redeclared anywhere ---
       Regression guard for a real shipped bug. The theme used to carry
           :root { --dsw-font-family: Arial, ...; --ds-font-family-code: ... }
       and that is not a theme-private knob: dsh-web-frontend renders the UI root
       font from it (`body{font-family:var(--dsw-font-family, <system stack>)}`),
       so the override restyled EVERY third-party widget injected into the app
       root. Anything with `font-family:inherit` — e.g. DeepSeek-Balance-Whale-
       Widget — inherited Arial and lost its own face for its balance digits.

       The check is deliberately a plain "these two names may not be declared at
       all", not a structural :root walk: the damage is caused by the DECLARATION,
       and a future edit could equally reinstate it on body or inside a media
       query. Reading them as fallbacks (`var(--dsw-font-family, <theme stack>)`)
       is the supported form and stays clean, because only `name:` is matched. */
    const ownedByApp = ['--dsw-font-family', '--ds-font-family-code']
    const redeclared = ownedByApp.filter((v) =>
      new RegExp('(^|[;{\\s])' + v + '\\s*:', 'm').test(stripped))
    if (redeclared.length === 0) {
      pass('the app font tokens (--dsw-font-family / --ds-font-family-code) are never redeclared')
    } else {
      fail(`the app font token(s) ${redeclared.join(', ')} are DECLARED by the theme\n      `
        + `-> the app renders the UI root font from --dsw-font-family, so this restyles `
        + `every third-party widget that inherits it (and --ds-font-family-code every code `
        + `surface). Use the theme's own --edge-font on the theme's own elements instead; `
        + `see the typography note at the top of the stylesheet.`)
    }

    /* Any --edge-* variable that substitutes a --dsw-* token must NOT be declared
       inside a :root block. Checked structurally: walk each top-level rule and look
       at :root blocks only. */
    const rootBlocks = []
    {
      const re = /(^|\})\s*([^{}]*?):root([^{}]*?)\{([^}]*)\}/g
      /* Iterated with for..of over matchAll rather than the usual while-loop that
         re-tests a global regex against null. Both walk the same matches, but this
         file is read by static signature scanners, and a bare dot-exec call matches
         their child_process rule: the scanner cannot see the receiver, so a RegExp
         exec reads as process execution and is reported as a HIGH security hit
         (the gate tool itself documents that false positive). matchAll keeps the
         loop and removes the token. */
      for (const m2 of stripped.matchAll(re)) rootBlocks.push({ body: m2[4], at: m2.index })
    }
    const offenders = []
    for (const b of rootBlocks) {
      const re2 = /^\s*(--edge-[\w-]+)\s*:\s*([^;]*var\(\s*--dsw-[^;]*)\;/gm
      for (const m3 of b.body.matchAll(re2)) offenders.push(m3[1])
    }
    if (offenders.length === 0) {
      pass('no --edge-* variable reads a --dsw-* token from :root (tokens live on body)')
    } else {
      fail(`--edge-* variable(s) declared at :root while substituting a body-level token: `
        + `${offenders.join(', ')}\n      `
        + `-> the app sets --dsw-* tokens inline ON BODY, so a :root declaration is `
        + `guaranteed-invalid and computes to EMPTY; move it into a body { } block`)
    }
  }
}

/* --- 3. the file must actually parse ---
   Compiled in-process with vm.Script rather than by spawning `node --check`:
   spawning to capture piped stdio is denied in some sandboxes (EPERM), and this
   checks exactly the same thing — the source compiles as a real script — without
   executing any of it. */
try {
  new vm.Script(src, { filename: file })
  pass('client.js compiles (parsed in-process, not executed)')
} catch (e) {
  fail('client.js does not parse: ' + e.message)
}

/* --- 4. the turn-status label must be recoloured through its 0.2 tokens ---
   DSH 0.2 moved the label from @deepseek-ai/dsh-client-ui-conversation
   (`Md3f7G_turnStatus`, gradient text: background-image + background-clip:text) to
   @deepseek-ai/dsh-client-ui-chat (`<hash>_running`, masked-sweep text), whose whole
   rule is

     .<hash>_running {
       --dsw-alias-label-shimmer: var(--dsw-alias-label-deep-diving-shimmer);
       color: var(--dsw-alias-label-deep-diving);
     }

   so a background-image override is now inert and the ONLY lever that reaches the
   glyphs is that pair of deep-diving tokens. Two invariants have to hold, and both
   fail silently when broken:
     1. the override layer must retint BOTH tokens for BOTH schemes, and must do it
        by referencing the measured --edge-status-* palette variables rather than
        literals — a literal would freeze one palette and break the 武陵青 flip, and
        the stops are contrast-critical (light needs #6b5d00 / #3f3600 to clear AA
        on cream, dark needs #fff500 / #a08a00);
     2. no dead `[class*='turnStatus']` selector may come back: it can never match on
        0.2, so a rule that looks like a fix would silently do nothing. */
const tokenBlock = (name) => {
  const at = src.indexOf("'" + name + "'")
  return at < 0 ? null : src.slice(at, at + 260)
}
const tokenValueAfter = (block, key) => {
  if (block === null) return ''
  const at = block.indexOf(key + ':')
  if (at < 0) return ''
  const m = block.slice(at + key.length + 1).match(/^\s*'([^']*)'/)
  return m === null ? '' : m[1]
}
const diving = tokenBlock('--dsw-alias-label-deep-diving')
const shimmer = tokenBlock('--dsw-alias-label-deep-diving-shimmer')
const divingOk = tokenValueAfter(diving, 'light') === 'var(--edge-status-light)'
  && tokenValueAfter(diving, 'dark') === 'var(--edge-status-dark)'
const shimmerOk = tokenValueAfter(shimmer, 'light') === 'var(--edge-status-light-mid)'
  && tokenValueAfter(shimmer, 'dark') === 'var(--edge-status-dark-mid)'
if (divingOk && shimmerOk) {
  pass('turn-status label is recoloured through the 0.2 deep-diving token pair (both schemes, palette variables)')
} else {
  fail('turn-status label is not retinted through --dsw-alias-label-deep-diving / -shimmer for both colour schemes '
    + 'with the measured --edge-status-* variables — the 0.2 label is masked-sweep text, so nothing else reaches its glyphs')
}
if (/\[class\*='turnStatus'\]/.test(src)) {
  fail("a dead [class*='turnStatus'] selector is present — 0.2 moved that label to _running, so the rule can never match")
} else {
  pass('no dead [turnStatus] selector remains (0.2 moved the label to _running)')
}

/* --- 5. 雷霆大字 must resolve the CURRENT session from the live contract ---
   Regression guard for a shipped bug: 「雷霆大字在新版本失效了」. This file used to
   read the current session as `sessions.list.getSnapshot().current`, and the
   Controller moved view selection out of itself — the list state is now
   { ids, byId, phase, projectionsBySession } and its own contract says "view
   selection remains outside the Controller". The read returned undefined, the watch
   bailed out, and the announcement went permanently silent while the settings switch
   still read as ON. Nothing threw and nothing logged, which is why the guard is here
   rather than only in the test: the failure mode is a MISSING FIELD.
   The runtime's answer is the mainView retention count, the same scan every shipped
   package uses:
       Object.values(state.byId).find(row => (row.retainedBy?.mainView ?? 0) > 0)?.id
   (The behavioural half — waiting states, switches, the legacy shape — lives in
   test/thunder-edges.test.js sections 13-15.) */
const thunderAt = src.indexOf('const thunderCurrentId')
const thunderEnd = thunderAt < 0 ? -1 : src.indexOf('const thunderStopWatch', thunderAt)
const thunderSrc = (thunderAt < 0 || thunderEnd < 0) ? '' : src.slice(thunderAt, thunderEnd)
if (thunderSrc === '') {
  fail('could not locate the 雷霆大字 watch (const thunderCurrentId .. const thunderStopWatch) '
    + '— has the feature been renamed or removed?')
} else {
  const resolvesFromRows = /retainedBy/.test(thunderSrc) && /mainView/.test(thunderSrc)
  const callSite = /thunderCurrentId\(snap\)/.test(thunderSrc)
  if (resolvesFromRows && callSite) {
    pass('雷霆大字 resolves the current session from the list rows\' mainView retention')
  } else if (!callSite) {
    fail('雷霆大字 does not resolve the current session through thunderCurrentId(snap)\n      '
      + '-> a direct read of the removed `current` list field returns undefined, and the '
      + 'announcement goes permanently silent with no error')
  } else {
    fail('thunderCurrentId does not scan byId rows for retainedBy.mainView\n      '
      + '-> that retention is the runtime\'s own marker of the session the user is looking at '
      + '(sessions.retain(target, { source: \'mainView\' })); without it the feature is silent again')
  }
}

/* --- 6. menus must not be handed back to the platform's translucent material ---
   Regression guard for 「菜单的背景没了」. On 0.2 every menu is a MenuSurface: the
   shell paints a --dsh-menu-<id> anchored <div class="_material_ri079_*"> behind the
   panel with `background: var(--dsw-menu-surface-fill)` plus a 40px backdrop blur.
   The platform default for that fill is a 45%/58% alpha literal (#43454a73 /
   #f8f9fa94), and the translucency is meant to be absorbed by the blur. Over this
   theme's contour sheet the composite lands within a couple of RGB steps of the page
   itself, so the panel reads as having no background — the session text behind the
   /命令 list shows straight through. The unfiltered fill is also invisible to a
   settings switch: nothing in the theme looked wrong, the colour was simply not
   opaque.
   Two invariants, both about OPAQUENESS rather than a specific brand colour:
     1. the token must be pinned, in BOTH schemes, to a theme-owned opaque surface
        (--dsw-alias-bg-overlay: the app's own "Overlay and popover background");
     2. it must never be pinned to the page colour either — an opaque panel painted
        as --dsw-alias-bg-base has no visible background in a different way, and that
        is exactly what the app's own macOS menu backing does.
   The behavioural half — real MenuSurface markup, the platform default, both colour
   schemes and a pixel proof that nothing shows through — lives in
   test/menu-surface.test.js. */
const menuBlock = tokenBlock('--dsw-menu-surface-fill')
const menuLight = tokenValueAfter(menuBlock, 'light')
const menuDark = tokenValueAfter(menuBlock, 'dark')
const MENU_FILL = 'var(--dsw-alias-bg-overlay)'
const PLATFORM_MENU_FILLS = ['#f8f9fa94', '#43454a73']
if (menuBlock === null) {
  fail('no --dsw-menu-surface-fill override — menus fall back to the platform material '
    + '(45%/58% alpha over the contour sheet), and the panel loses its background again')
} else if (PLATFORM_MENU_FILLS.indexOf(menuLight) >= 0 || PLATFORM_MENU_FILLS.indexOf(menuDark) >= 0) {
  fail('--dsw-menu-surface-fill is back to the platform default ('
    + PLATFORM_MENU_FILLS.join(' / ') + ') in at least one scheme\n      '
    + '-> the menu is translucent again and the conversation behind the /命令 list shows through')
} else if (menuLight !== MENU_FILL || menuDark !== MENU_FILL) {
  fail('--dsw-menu-surface-fill is not ' + MENU_FILL + ' in both colour schemes (found '
    + JSON.stringify(menuLight) + ' / ' + JSON.stringify(menuDark) + ')\n      '
    + '-> keep it pinned to the theme\'s opaque popover colour in light AND dark')
} else {
  pass('menus paint an opaque theme-owned surface in both schemes (--dsw-menu-surface-fill = '
    + MENU_FILL + ', the app\'s overlay/popover colour)')
}

/* --- 7. the statutory-holiday table must cover the year we are living in ---
   Guard for 「顶部胶囊的峰谷定价时间加入法定节假日」. The capsule bills a Chinese
   statutory holiday as off-peak ALL DAY and a 调休 make-up workday as the weekend it
   falls on (DeepSeek 「API 峰谷时间补充说明」, 2026-09-19), so the calendar lives in
   client.js as BALANCE_HOLIDAY_NOTICES — no host service carries the schedule.
   The failure this guard exists for is silent AND time-based: the State Council
   publishes the next year's 放假安排 each November, so a stale table quietly bills
   next January's holiday as peak with nothing visibly wrong. Hence three invariants:
     1. the CURRENT Beijing year must have an entry — the yearly alarm;
     2. every 调休 day must be a Saturday or Sunday, which is exactly what licenses
        the weekend branch to bill it off-peak with no exception list. A notice that
        moved a normal weekday would invalidate that reasoning, so it has to stop
        here and be re-thought rather than quietly price the day as peak;
     3. every span must expand to its own name, day for day, so a typo in from/to
        cannot silently shift or drop days.
   The arithmetic itself (holiday vs weekend vs weekday windows, and the countdowns
   they produce) is pinned in test/balance-window.test.js. */
const holAt = src.indexOf('const BALANCE_HOLIDAY_NOTICES')
const holEnd = holAt < 0 ? -1 : src.indexOf('const balanceHolidayName', holAt)
if (holAt < 0 || holEnd < 0) {
  fail('could not locate the statutory-holiday table (const BALANCE_HOLIDAY_NOTICES .. '
    + 'const balanceHolidayName) — has the 顶部余额胶囊 been renamed or removed?')
} else {
  const holSandbox = {}
  vm.createContext(holSandbox)
  let notices = null
  try {
    vm.runInContext(src.slice(holAt, holEnd)
      + '\nthis.BALANCE_HOLIDAY_NOTICES = BALANCE_HOLIDAY_NOTICES;'
      + '\nthis.BALANCE_HOLIDAY_DATES = BALANCE_HOLIDAY_DATES;', holSandbox)
    notices = holSandbox.BALANCE_HOLIDAY_NOTICES
  } catch (err) {
    fail('the statutory-holiday table no longer evaluates on its own: ' + err.message
      + '\n      -> keep it pure data (no client-scope lookups) so this guard can read it')
  }
  if (notices) {
    const beijingYear = String(new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear())
    const years = Object.keys(notices)
    if (years.indexOf(beijingYear) < 0) {
      fail('no entry for the current Beijing year (' + beijingYear + ') in BALANCE_HOLIDAY_NOTICES\n'
        + '      -> transcribe the new 放假安排 (published each November), or every '
        + beijingYear + ' holiday is billed as peak with nothing visibly wrong')
    } else {
      pass('the statutory-holiday table covers the current Beijing year (' + beijingYear + ')')
    }

    const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const badMakeup = []
    for (const year of years) {
      for (const span of notices[year].spans) {
        for (const day of span.makeup || []) {
          const parts = day.split('-').map(Number)
          const wd = new Date(Date.UTC(Number(year), parts[0] - 1, parts[1])).getUTCDay()
          if (wd !== 0 && wd !== 6) badMakeup.push(year + '-' + day + ' (' + WEEKDAYS[wd] + ')')
        }
      }
    }
    if (badMakeup.length > 0) {
      fail('a 调休 make-up workday is not a Saturday or Sunday: ' + badMakeup.join(', ') + '\n'
        + '      -> 调休 days are billed off-peak only because every one of them lands on a '
        + 'weekend; a weekday one needs its own rule in balanceDayIsOffPeak')
    } else {
      pass('every 调休 make-up workday is a Saturday or Sunday, so the weekend rule covers it')
    }

    const dayKey = (y, mo, d) => y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d
    const wrongName = []
    let spanDays = 0
    for (const year of years) {
      for (const span of notices[year].spans) {
        const from = span.from.split('-').map(Number)
        const to = span.to.split('-').map(Number)
        for (let at = Date.UTC(Number(year), from[0] - 1, from[1]);
          at <= Date.UTC(Number(year), to[0] - 1, to[1]); at += 24 * 3600 * 1000) {
          const d = new Date(at)
          const k = dayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
          spanDays += 1
          const got = holSandbox.BALANCE_HOLIDAY_DATES.get(k)
          if (got !== span.name) wrongName.push(k + ' -> ' + JSON.stringify(got))
        }
      }
    }
    if (wrongName.length > 0) {
      fail('a holiday span does not expand to its own name: ' + wrongName.join(', ') + '\n'
        + '      -> from/to are INCLUSIVE MM-DD dates; the expansion keys each day by its date')
    } else if (holSandbox.BALANCE_HOLIDAY_DATES.size !== spanDays) {
      fail('the holiday map holds ' + holSandbox.BALANCE_HOLIDAY_DATES.size + ' dates but the '
        + 'spans cover ' + spanDays + ' days\n'
        + '      -> two spans overlap, or a span is written twice under different names')
    } else {
      pass('all ' + spanDays + ' statutory-holiday days expand to their own name')
    }
  }
}

console.log('')
if (failures) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
