/* Channel-credit capsule probe (dsh-codearts-auth / jet-hub adaptation).
 *
 * The credit read is the second tenant of the balance capsule: the same pill,
 * the same poll, but a different data path (management RPC instead of the
 * host route) and a different paint target. Nothing type-checks the halves
 * against each other, and every mismatch here fails SILENTLY in the browser
 * (a selector that matches nothing never throws), so this probe pins:
 *
 *   1. MARKUP — the credit group exists in the pill and sits where the
 *      wallet group sits (same slot, not a second row).
 *   2. WIRING — every slot creditPaint writes to exists in that markup, and
 *      every element the stylesheet styles exists too.
 *   3. MODE — wallet/credits are exclusive states of ONE attribute the
 *      stylesheet keys off; 'wallet' is the seed the mount raises.
 *   4. FORMAT — the number formatting mirrors the plugin's own badge rules
 *      (integer/2dp credits, K/M token compaction, 积分/Token unit tags).
 *   5. RACE — the stale-reply guard reads the provider echo before painting.
 */
'use strict'
const fs = require('fs')
const path = require('path')

let pass = 0
let fail = 0
const check = (label, ok) => {
  if (ok) { pass += 1 } else { fail += 1; console.error('FAIL ' + label) }
}

const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')

/* ---------- 1. the markup the plugin actually builds ---------- */
const anchor = src.indexOf("el.setAttribute('data-endfield-balance', '')")
if (anchor < 0) { console.error('balance capsule mount not found in client.js'); process.exit(1) }
const mStart = src.indexOf('el.innerHTML =', anchor)
const mEnd = src.indexOf('document.body.appendChild(el)', mStart)
if (mStart < 0 || mEnd < 0 || mEnd <= mStart) {
  console.error('could not slice the balance-capsule markup out of client.js')
  process.exit(1)
}
const snippet = src.slice(mStart, mEnd).replace('el.innerHTML =', 'const __html =')
const markup = new Function(snippet + '\nreturn __html')()

/* ---------- 2. the live stylesheet ---------- */
const cssMarker = 'disposeStyles = insertCss(`'
const cssAt = src.indexOf(cssMarker)
if (cssAt < 0) { console.error('insertCss template literal not found'); process.exit(1) }
const cssRest = src.slice(cssAt + cssMarker.length)
const cssEnd = cssRest.indexOf('\n    `)')
if (cssEnd < 0) { console.error('closing backtick of the stylesheet not found'); process.exit(1) }
const css = cssRest.slice(0, cssEnd)

/* ---------- 3. the credit paint routines ---------- */
const pStart = src.indexOf('    const creditFormatTokens = (value) => {')
const pEnd = src.indexOf('    /* ---------- 峰谷定价窗口')
if (pStart < 0 || pEnd < 0 || pEnd <= pStart) {
  console.error('could not slice the credit paint routines out of client.js')
  process.exit(1)
}
const paint = src.slice(pStart, pEnd)

/* ---------- MARKUP: the credit group and its slot order ----------------- */
check('markup: the credit group sits right after the wallet group (same slot, not a second row)',
  markup.indexOf('data-endfield-balance-money') < markup.indexOf('data-endfield-credit-money') &&
  markup.indexOf('data-endfield-credit-money') < markup.indexOf('data-endfield-balance-window'))
check('markup: the credit group holds channel, int and unit, in that order',
  markup.indexOf('data-endfield-credit-channel') < markup.indexOf('data-endfield-credit-int') &&
  markup.indexOf('data-endfield-credit-int') < markup.indexOf('data-endfield-credit-unit'))
check('markup: the credit group seeds -- like the wallet group does',
  markup.indexOf('data-endfield-credit-int>--<') > -1)
check('markup: the provider id table names all twelve jet-hub channels',
  ['codearts', 'buddy', 'workbuddy', 'lobsterai', 'qoder', 'qodercn', 'trae',
    'cline', 'loomy', 'raccoon', 'minimax', 'zcode']
    .every((id) => src.indexOf(id + ": '") > -1))

/* ---------- WIRING: paint slots vs markup vs stylesheet ----------------- */
const slotsInMarkup = new Set((markup.match(/data-endfield-credit-[a-z-]+/g) || []))
/* -credit-mode is a STATE attribute written onto the pill (like -phase-peak on
   the balance side), not a slot the markup declares. */
const STATE_ATTRS = new Set(['data-endfield-credit-mode'])
const slotsWritten = new Set(
  (paint.match(/'data-endfield-credit-[a-z-]+'/g) || []).map((s) => s.slice(1, -1)))
const selectorsInCss = new Set(
  (css.match(/\[data-endfield-credit-[a-z-]+\]/g) || []).map((s) => s.slice(1, -1)))
const missing = [...slotsWritten].filter((s) => !STATE_ATTRS.has(s) && !slotsInMarkup.has(s))
check('wiring: every painted credit slot exists in the markup (' + (missing.join(', ') || 'none missing') + ')',
  missing.length === 0)
const orphanCss = [...selectorsInCss].filter((s) => !STATE_ATTRS.has(s) && !slotsInMarkup.has(s))
check('wiring: every styled credit slot exists in the markup (' + (orphanCss.join(', ') || 'none orphaned') + ')',
  orphanCss.length === 0)

/* ---------- MODE: one attribute, two exclusive states ------------------- */
check('mode: the mode flag is ONE attribute creditPaint writes',
  /setAttribute\('data-endfield-credit-mode', paint\.mode\)/.test(paint))
check('mode: wallet mode hides the credit group (default rule)',
  /\[data-endfield-balance\] \[data-endfield-credit-money\] \{[^}]*display: none;/.test(css))
check('mode: credits mode hides the wallet group',
  /\[data-endfield-balance\]\[data-endfield-credit-mode='credits'\] \[data-endfield-balance-money\],\s*\[data-endfield-balance\]\[data-endfield-credit-mode='credits'\] \[data-endfield-balance-window\],\s*\[data-endfield-balance\]\[data-endfield-credit-mode='credits'\] \[data-endfield-balance-pct\] \{\s*display: none;/.test(css))
check('mode: credits mode shows the credit group',
  /\[data-endfield-balance\]\[data-endfield-credit-mode='credits'\] \[data-endfield-credit-money\] \{\s*display: inline-flex;/.test(css))
check('mode: the mount seeds wallet mode before any answer',
  /setAttribute\('data-endfield-credit-mode', 'wallet'\)/.test(src))
check('mode: a failed or absent answer paints -- rather than 0',
  paint.indexOf("'--'") > -1 && !/int: '0'/.test(paint))

/* ---------- FORMAT: the plugin badge rules, mirrored -------------------- */
const fmt = src.slice(pStart, src.indexOf('    /* The unit tag rides'))
const formatTokens = new Function(fmt + '\nreturn creditFormatTokens')()
const formatValue = new Function(fmt + '\nreturn creditFormatValue')()
const unitLabel = new Function(fmt + '\nreturn creditUnitLabel')()
check('format: integer credits stay integers', formatValue(42, 'credit') === '42')
check('format: fractional credits take two decimals', formatValue(12.345, 'credit') === '12.35')
check('format: 1234.56 credits render 1234.56 (not 1.23K — tokens compact, credits do not)',
  formatValue(1234.56, 'credit') === '1234.56')
check('format: token quantities compact past 1e3', formatTokens(12345) === '12.35K')
check('format: token quantities compact past 1e6', formatTokens(12345678) === '12.35M')
check('format: small token quantities stay plain', formatTokens(420) === '420')
check('format: the unit tag reads 积分 for credit units', unitLabel('credit') === '积分' && unitLabel('credits') === '积分')
check('format: the unit tag reads Token for token units', unitLabel('token') === 'Token')
check('format: the credits spelling normalizes to the credit branch', unitLabel('credits') === unitLabel('credit'))

/* ---------- PICK: which number the capsule shows ------------------------ */
const pickStart = src.indexOf('    const creditPickUnit = (packages) => {')
const pickEnd = src.indexOf('    const creditPaint = (paint) => {')
if (pickStart < 0 || pickEnd < 0 || pickEnd <= pickStart) {
  console.error('could not slice the credit pick routines out of client.js')
  process.exit(1)
}
const pick = src.slice(pickStart, pickEnd)
const creditPickAccount = new Function(pick + '\nreturn creditPickAccount')()
check('pick: the first error-free account answers',
  creditPickAccount([
    { accountId: 'a', error: 'boom', balance: null },
    { accountId: 'b', balance: { total: 7, packages: [{ unit: 'credit' }] } },
  ]).total === 7)
check('pick: active packages are summed (remaining beats the account total)',
  (() => {
    const r = creditPickAccount([{ balance: { total: 9, packages: [
      { active: true, remaining: 3, total: 10, used: 7, unit: 'credit' },
      { active: true, remaining: 4, total: 5, used: 1, unit: 'credit' },
    ] } }])
    return r.total === 7 && r.quotaTotal === 15 && r.used === 8
  })())
check('pick: inactive and malformed packages never join the sum',
  (() => {
    const r = creditPickAccount([{ balance: { total: 9, packages: [
      { active: false, remaining: 3, unit: 'credit' },
      { active: true, remaining: 4, unit: 'credit' },
    ] } }])
    return r.total === 4 && r.quotaTotal === 0 && r.used === 0
  })())
check('pick: packages are only consulted when the total is missing',
  creditPickAccount([{ balance: { packages: [{ active: true, remaining: 3, unit: 'token' }, { active: false, remaining: 99, unit: 'credit' }] } }]).total === 3)
check('pick: the unit rides the first package',
  creditPickAccount([{ balance: { total: 1, packages: [{ unit: 'token' }] } }]).unit === 'token')
check('pick: the account-level total fallback carries no quota (the dial never invents a %)',
  (() => {
    const r = creditPickAccount([{ balance: { total: 7, packages: [] } }])
    return r.total === 7 && r.quotaTotal === 0 && r.used === 0
  })())
check('pick: nothing usable answers null',
  creditPickAccount([{ error: 'x' }, { balance: null }]) === null &&
  creditPickAccount(undefined) === null)

/* ---------- DIAL: the consumption share in credits mode ------------------ */
check('dial: the sweep rides the shared --endfield-balance-sweep property',
  paint.indexOf("setProperty(\n          '--endfield-balance-sweep',") > -1 ||
  paint.indexOf("'--endfield-balance-sweep',") > -1)
check('dial: usedPct drives the sweep (NaN sweeps to zero, never a stale window)',
  /Number\.isFinite\(paint\.sweepPct\) \? paint\.sweepPct \* 3\.6 : 0/.test(paint))
check('dial: the sweep follows the slot meaning (已用 sweeps used, 剩余 sweeps remaining)',
  /sweepPct: displayUsed \? usedPct : remainingPct/.test(paint))
check('dial: the consumption pct is used/quota, bounded, and refuses to invent one',
  /quotaTotal > 0 && picked\.used >= 0\s*&& picked\.used <= picked\.quotaTotal/.test(paint) &&
  /Math\.min\(100, Math\.round\(\(picked\.used \/ picked\.quotaTotal\) \* 100\)\)/.test(paint))
check('dial: the pct slot is a separate credit node (the wallet pct is never overwritten)',
  paint.indexOf("'data-endfield-credit-pct'") > -1 &&
  markup.indexOf('data-endfield-credit-pct') > -1)
check('dial: the lead figure is ALWAYS the remaining balance (the pref never moves the left number)',
  /int: picked \? creditFormatValue\(picked\.total, picked\.unit\) : '--'/.test(paint))
check('dial: the right-hand slot reads 已用 or 剩余 per the creditDisplay pref',
  /const displayUsed = readCreditDisplay\(\) === 'used'/.test(paint) &&
  /displayUsed \? '已用' : '剩余'/.test(paint) &&
  /displayUsed \? usedPct : remainingPct/.test(paint))
check('dial: the remaining share mirrors the used share (100 - usedPct, NaN stays NaN)',
  /let remainingPct = NaN/.test(paint) &&
  /if \(usedPct === usedPct\) remainingPct = 100 - usedPct/.test(paint))
check('dial: credits mode hides the pricing window (peak/off-peak is DeepSeek-only)',
  /\[data-endfield-balance\]\[data-endfield-credit-mode='credits'\] \[data-endfield-balance-window\]/.test(css))
check('dial: the window tick early-returns in credits mode (the clock never overwrites the sweep)',
  src.slice(src.indexOf('const balancePaintWindow = () => {'), src.indexOf('const balanceFetch = async () => {'))
    .includes('if (creditProvider !== null) {'))

/* ---------- RACE: the stale-reply guard -------------------------------- */
check('race: the reply is dropped when the channel moved on',
  /if \(creditProvider !== provider\) return/.test(paint))
check('race: the value-level echo is checked before painting',
  /value\.provider !== provider/.test(paint))
check('race: force maps onto the usage.badge force flag',
  /force === true \? \{ provider, force: true \} : \{ provider \}/.test(paint))
check('race: the RPC goes over the same channel the plugin client uses',
  src.indexOf("JET_HUB_RPC_SCOPE = '/api'") > -1 &&
  src.indexOf("JET_HUB_RPC_CHANNEL = 'jet-hub'") > -1 &&
  src.indexOf("method: 'usage.badge'") > -1)

/* ---------- RATE: usage.badge is not fetched more than needed ----------- */
check('rate: a client-side floor throttles the non-forced fetches',
  src.indexOf('const CREDITS_MIN_INTERVAL_MS = 5 * 60 * 1000') > -1 &&
  /creditLastFetch\[provider\] \|\| 0[\s\S]{0,80}Date\.now\(\) - last < CREDITS_MIN_INTERVAL_MS/.test(paint))
check('rate: the stamp is taken after a COMPLETED fetch (an in-flight call does not arm the floor)',
  /creditLastFetch\[provider\] = Date\.now\(\)\s*const picked/.test(paint.replace(/\r\n/g, '\n')))
check('rate: a channel switch bypasses the floor (force skips the throttle check)',
  /if \(force !== true\) \{\s*const last = creditLastFetch\[provider\]/.test(paint.replace(/\r\n/g, '\n')))
check('rate: failures re-arm at the 30s failure retry, not the full floor',
  src.indexOf('const CREDITS_FAILURE_RETRY_MS = 30000') > -1 &&
  /Date\.now\(\) - CREDITS_MIN_INTERVAL_MS \+ CREDITS_FAILURE_RETRY_MS/.test(paint))
check('rate: the store-subscription path forces (a switch follows immediately)',
  /creditsRebindTimer = setTimeout\(\(\) => \{\s*creditsRebindTimer = null\s*creditsRefresh\(true\)/.test(src.replace(/\r\n/g, '\n')))
check('rate: the poll heartbeat passes force=false (throttled)',
  /balanceFetch\(\)\s*creditsRefresh\(false\)/.test(src.replace(/\r\n/g, '\n')))

/* ---------- LIFECYCLE: lazy services, watch, teardown ------------------ */
check('lifecycle: the current session resolves through mainView retention (thunderCurrentId)',
  /thunderCurrentId\(snap\)/.test(src))
check('lifecycle: the directory is loaded before its snapshot is read (a cold directory has no current)',
  /await directory\.load\(\)/.test(src))
check('lifecycle: each directory store is subscribed once (creditsWatchedStore dedupes)',
  src.indexOf('creditsWatchedStore !== directory.store') > -1)
check('lifecycle: destroy detaches the store subscription and clears the rebind timer',
  /const destroyBalanceCapsule = \(\) => \{[\s\S]{0,900}typeof creditsUnsub === 'function'[\s\S]{0,900}clearTimeout\(creditsRebindTimer\)/.test(src))
check('lifecycle: the poll heartbeat drives both reads',
  /balancePollTimer = setInterval\(\(\) => \{\s*balanceFetch\(\)\s*creditsRefresh\(false\)/.test(src.replace(/\r\n/g, '\n')))
check('lifecycle: a wallet answer never overwrites the channel read',
  /payload\.ok && creditProvider === null/.test(src))
check('lifecycle: unknown providers keep the wallet display (no JET_HUB_PROVIDER_LABELS hit -> null)',
  /JET_HUB_PROVIDER_LABELS\[provider\] !== undefined/.test(src))
check('lifecycle: showBalanceCapsule starts the channel resolution',
  /* client.js is CRLF, so the call pair is matched by regex, not indexOf. */
  /balanceFetch\(\)\r?\n      creditsStart\(\)/.test(src))

console.log('credit-capsule: ' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
