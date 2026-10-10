/**
 * balance-diagnosis.test.js — prove the settings panel explains an empty capsule.
 *
 * The capsule deliberately keeps the last known number when a host read fails
 * (see src/client/33-balance-capsule.js), so a machine that stores an API key but
 * is not signed in to platform.deepseek.com used to show `--` forever with
 * nothing anywhere saying why. The settings row is the only surface with room to
 * answer that, so this test drives the real panel with a stubbed route reply and
 * asserts the line it renders — and, just as important, that a healthy account
 * read adds no line at all.
 *
 * No browser and no React: client.js runs in a vm context with a recording React
 * stub that DOES expose useEffect (unlike settings-rows' minimal one), so the
 * one-shot balance probe actually runs and its promise can settle before the
 * panel is re-rendered.
 *
 * Usage: node test/balance-diagnosis.test.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { settingsScopeStub } = require(path.join(__dirname, 'fixtures', 'settings-scope.js'))

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')
const BALANCE_URL = '/theme-endfield/balance'

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* The exact strings the panel must produce. Kept as literals rather than read
   back out of the source: a test that imports the string it is checking cannot
   notice the string becoming wrong, and these sentences are the whole feature. */
const ZH_NO_KEY = '胶囊显示 `--`：未登录 platform.deepseek.com，且本机没有配置 DEEPSEEK_API_KEY'
const ZH_REJECTED = '胶囊显示 `--`：DEEPSEEK_API_KEY 被上游拒绝（可能已失效或额度用尽）'
const ZH_FAILED = '胶囊显示 `--`：余额请求失败，稍后会自动重试'
const ZH_VIA_KEY = '当前余额来自 DEEPSEEK_API_KEY（公共接口），不是平台账户余额'

/**
 * Recording React with real state, and an effect queue the harness drains.
 *
 * The dependency array is honoured, because that is the difference between the
 * feature and a bug: the balance probe is `useEffect(fn, [])`, so it must read
 * the route once per mount. A stub that re-queued it every pass would turn a
 * correct one-shot probe into an apparent polling loop and fail the last check
 * for the wrong reason.
 */
const makeReact = (queued) => {
  const states = []
  const deps = []
  let idx = 0
  const same = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b)
    && a.length === b.length && a.every((v, i) => Object.is(v, b[i])))
  return {
    reset() { idx = 0 },
    useState(init) {
      const i = idx++
      if (!(i in states)) states[i] = typeof init === 'function' ? init() : init
      return [states[i], (v) => { states[i] = typeof v === 'function' ? v(states[i]) : v }]
    },
    // Queued, never auto-run: the test decides when effects fire, so a probe
    // cannot re-enter during render. No deps array means "every render", like
    // React; an empty one means "the mount only".
    useEffect(fn, wanted) {
      const i = idx++
      if (wanted === undefined) { queued.push(fn); return }
      if (!(i in deps) || !same(deps[i], wanted)) { deps[i] = wanted; queued.push(fn) }
    },
    createElement(type, props, ...children) {
      const kids = []
      for (const c of children) {
        if (Array.isArray(c)) kids.push(...c)
        else if (c !== null && c !== undefined && c !== false) kids.push(c)
      }
      return { type, props: props || {}, children: kids }
    },
  }
}

const textOf = (el) => {
  if (el === null || el === undefined || typeof el === 'boolean') return ''
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  return (el.children || []).map(textOf).join('')
}

const classList = { add() {}, remove() {} }
const noopEl = () => ({
  style: {}, setAttribute() {}, appendChild() {}, removeChild() {},
  querySelector: () => null, querySelectorAll: () => [], insertBefore() {},
  getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
  classList, className: '', parentNode: null, firstChild: null,
  hasAttribute: () => false, getAttribute: () => null, isConnected: true,
  getContext: () => null, appendData() {},
})

/**
 * Boot the theme's client half with one canned balance reply and render the
 * settings panel. `reply` is what GET /theme-endfield/balance answers;
 * `reject` makes that one request fail the way an absent bridge does.
 */
const mount = (opts) => {
  const prefStore = settingsScopeStub()
  prefStore.setField('enabled', '1')
  prefStore.setField('loader', '0')
  prefStore.setField('balanceCapsule', opts.balanceOn ? '1' : '0')

  const queued = []
  const react = makeReact(queued)
  let rendered = null
  const balanceCalls = []
  const slots = {
    inject(_name, fn) { fn() },
    register(_o, render) { rendered = render; return () => {} },
  }
  const document = {
    body: Object.assign(noopEl(), { classList }),
    head: noopEl(),
    createElement: () => noopEl(),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
  }

  const fetchStub = (url) => {
    if (url !== BALANCE_URL) return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    balanceCalls.push(url)
    if (opts.reject) return Promise.reject(new Error('bridge absent'))
    return Promise.resolve({ ok: true, json: () => Promise.resolve(opts.reply) })
  }

  const sandbox = {
    window: {
      __ModuleLoader__: null,
      addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false }),
      innerWidth: 1440, setTimeout: () => 0, clearTimeout() {},
    },
    document,
    React: react,
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    requestAnimationFrame: () => 0,
    cancelAnimationFrame() {},
    performance: { now: () => 0 },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    console,
    fetch: opts.noFetch ? undefined : fetchStub,
  }
  sandbox.globalThis = sandbox
  sandbox.window.document = document

  let loaded = null
  sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }
  vm.createContext(sandbox)
  new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox)
  const mod = loaded.factory(() => null)
  const ctx = {
    get: (n) => {
      if (n === 'theme') return { overrideTokens: () => () => {} }
      if (n === 'slots') return slots
      if (n === 'settingsScope') return prefStore.binder
      return undefined
    },
    effect: () => {},
  }
  mod.apply(ctx)

  return {
    prefStore,
    balanceCalls,
    /** Render once, run any effects the panel queued, let their promises
        settle, then render again so the probe's result is on screen. */
    async render() {
      react.reset()
      rendered()
      const pending = queued.splice(0, queued.length)
      for (const fn of pending) fn()
      await new Promise((r) => setImmediate(r))
      await new Promise((r) => setImmediate(r))
      react.reset()
      return rendered()
    },
  }
}

/** Assert the panel's rendered text for one canned reply. */
const expectText = async (label, opts, wanted, forbidden) => {
  let panel
  try {
    panel = await mount(opts).render()
  } catch (e) {
    fail(label + ': the panel threw instead of rendering — ' + e.message)
    return
  }
  const text = textOf(panel)
  if (wanted !== null && !text.includes(wanted)) {
    fail(label + ': expected to read ' + JSON.stringify(wanted) + ' but the panel says ' + JSON.stringify(text.slice(0, 240)))
    return
  }
  for (const bad of forbidden || []) {
    if (text.includes(bad)) {
      fail(label + ': must not read ' + JSON.stringify(bad) + ' but it does')
      return
    }
  }
  pass(label)
}

const main = async () => {
  /* --- a healthy platform account explains nothing, because nothing is wrong -- */
  await expectText('account balance adds no note at all',
    { balanceOn: true, reply: { ok: true, source: 'account', wallets: [{ currency: 'CNY', balance: '11.26' }] } },
    null, [ZH_NO_KEY, ZH_REJECTED, ZH_FAILED, ZH_VIA_KEY])

  /* --- the fallback works, but the number is from a different account --------- */
  await expectText('an API-key balance says which account it came from',
    { balanceOn: true, reply: { ok: true, source: 'api-key', keySource: 'file', wallets: [{ currency: 'CNY', balance: '11.24' }] } },
    ZH_VIA_KEY, [ZH_NO_KEY, ZH_REJECTED, ZH_FAILED])

  /* --- every failure reason the route can emit maps to its own sentence -----*/
  await expectText('no API key and no platform session says exactly that',
    { balanceOn: true, reply: { ok: false, why: 'no-api-key', account: 'null' } },
    ZH_NO_KEY, [ZH_REJECTED, ZH_FAILED, ZH_VIA_KEY])

  await expectText('a rejected key is not reported as a generic failure',
    { balanceOn: true, reply: { ok: false, why: 'api-key rejected', account: 'null' } },
    ZH_REJECTED, [ZH_NO_KEY, ZH_FAILED, ZH_VIA_KEY])

  await expectText('an upstream status is a retryable failure',
    { balanceOn: true, reply: { ok: false, why: 'balance http 500', account: 'null' } },
    ZH_FAILED, [ZH_NO_KEY, ZH_REJECTED, ZH_VIA_KEY])

  await expectText('a transport-level failure is a retryable failure',
    { balanceOn: true, reply: { ok: false, why: 'balance request failed: timed out', account: 'null' } },
    ZH_FAILED, [ZH_NO_KEY, ZH_REJECTED, ZH_VIA_KEY])

  /* --- silence when there is nothing to explain ------------------------------ */
  await expectText('a capsule that is off gets no explanation for a surface it does not draw',
    { balanceOn: false, reply: { ok: false, why: 'no-api-key', account: 'null' } },
    null, [ZH_NO_KEY, ZH_REJECTED, ZH_FAILED, ZH_VIA_KEY])

  await expectText('an unreachable bridge stays silent instead of accusing the account',
    { balanceOn: true, reject: true },
    null, [ZH_NO_KEY, ZH_REJECTED, ZH_FAILED, ZH_VIA_KEY])

  await expectText('a page without fetch still renders the panel',
    { balanceOn: true, noFetch: true, reply: { ok: false, why: 'no-api-key' } },
    null, [ZH_NO_KEY, ZH_REJECTED, ZH_FAILED, ZH_VIA_KEY])

  /* --- the probe is a probe: it must not turn into a polling loop ------------ */
  const quiet = mount({ balanceOn: true, reply: { ok: true, source: 'account' } })
  await quiet.render()
  await quiet.render()
  if (quiet.balanceCalls.length <= 2) {
    pass('the panel reads the balance route once per mount, not once per render ('
      + quiet.balanceCalls.length + ' reads across three renders)')
  } else {
    fail('the panel re-read the balance route on every render (' + quiet.balanceCalls.length + ' reads)')
  }

  if (failures === 0) {
    console.log('PASS: the settings row tells the user why the balance capsule is empty, and stays quiet when it is not')
    process.exit(0)
  }
  console.error(failures + ' check(s) failed')
  process.exit(1)
}

main()
