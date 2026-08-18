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

/* --- 4. the turn-status label must be recoloured via background-image ---
   A plain `color:` cannot win against upstream's transparent text fill, so an edit
   that "fixes" this rule with color: would silently do nothing. */
const statusRules = src.match(/[^\n]*turnStatus[^\n]*\{[^}]*\}/g) || []
const gradientRules = (src.match(/turnStatus'\]\)\s*\{\s*\n\s*background-image:/g) || []).length
if (src.includes("turnStatus")) {
  const hasBg = /turnStatus[\s\S]{0,400}?background-image:\s*linear-gradient/.test(src)
  if (hasBg) pass('turn-status label is recoloured through background-image (gradient text)')
  else fail('turn-status rules found but no background-image gradient — a plain color: cannot recolour gradient text')
}

console.log('')
if (failures) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('all checks passed')
