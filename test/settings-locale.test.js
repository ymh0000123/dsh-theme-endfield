/**
 * settings-locale.test.js — prove the settings page follows DSH's language setting.
 *
 * Before this the panel was hardcoded Chinese: an English UI showed a wholly Chinese
 * settings page. The fix routes every string through the app's own `locale` service,
 * and that arrangement has several failure modes no other test here can see:
 *
 *   - a key present in zh but missing in en (or vice versa) renders as the raw key
 *     string in the UI — visible garbage, and completely silent at build time;
 *   - forgetting `locale:` on the registration means the framework never re-derives
 *     the entry, so the page stays in whatever language it first mounted in;
 *   - a plain-string `label` instead of a thunk freezes the nav row's language;
 *   - registering dictionaries outside ctx.effect throws on the service's duplicate
 *     (ns, locale) guard when the bundle is applied twice;
 *   - and the whole panel must still render (in Chinese) when no locale service
 *     exists at all, which is how the in-process test compositions mount it.
 *
 * Runs the real client.js in-process against a fake `locale` service shaped like the
 * runtime contract (@deepseek-ai/dsh-client-locale: register(ns, dicts) / bind(ns),
 * with the documented lookup chain active -> en -> key).
 *
 * Usage: node test/settings-locale.test.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { settingsScopeStub } = require(path.join(__dirname, 'fixtures', 'settings-scope.js'))

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

let failures = 0
const fail = (m) => { console.error('FAIL  ' + m); failures++ }
const pass = (m) => console.log('ok    ' + m)

/* ---------- recording React / DOM stubs (same approach as settings-rows) ---------- */
const makeReact = () => ({
  useState(init) {
    const v = typeof init === 'function' ? init() : init
    return [v, () => {}]
  },
  createElement(type, props, ...children) {
    const kids = []
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c)
      else if (c !== null && c !== undefined && c !== false) kids.push(c)
    }
    return { type, props: props || {}, children: kids }
  },
})
const textOf = (el) => {
  if (el === null || el === undefined || typeof el === 'boolean') return ''
  if (typeof el === 'string' || typeof el === 'number') return String(el)
  return (el.children || []).map(textOf).join('')
}
const walk = (el, out = []) => {
  if (el && typeof el === 'object' && el.type) {
    out.push(el)
    for (const c of el.children || []) walk(c, out)
  }
  return out
}

const classList = { add() {}, remove() {}, contains: () => false }
const noopEl = () => ({
  style: {}, setAttribute() {}, appendChild() {}, removeChild() {},
  querySelector: () => null, querySelectorAll: () => [], insertBefore() {},
  getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
  classList, className: '', parentNode: null, firstChild: null,
  hasAttribute: () => false, getAttribute: () => null, isConnected: true,
  getContext: () => null, appendData() {},
})
const document = {
  body: Object.assign(noopEl(), { classList }),
  head: noopEl(),
  createElement: () => noopEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  addEventListener() {}, removeEventListener() {},
}

/* ---------- fake locale service, per the runtime contract ---------- */
const makeLocale = (active) => {
  const dicts = new Map()
  let current = active
  return {
    registerCalls: 0,
    get active() { return current },
    setActive(id) { current = id },
    register(ns, dictsByLocale) {
      this.registerCalls++
      let owner = dicts.get(ns)
      if (!owner) { owner = new Map(); dicts.set(ns, owner) }
      // The real service THROWS on a duplicate (ns, locale) — reproduce that, since
      // it is what makes registering outside ctx.effect a real bug.
      for (const loc of Object.keys(dictsByLocale)) {
        if (owner.has(loc)) throw new Error(`locale namespace "${ns}" already has locale "${loc}"`)
      }
      for (const [loc, d] of Object.entries(dictsByLocale)) owner.set(loc, d)
      return () => { for (const loc of Object.keys(dictsByLocale)) owner.delete(loc) }
    },
    bind(ns) {
      // Documented lookup chain: active namespace -> en fallback -> the key itself.
      return (key) => {
        const owner = dicts.get(ns)
        const hit = owner && owner.get(current) && owner.get(current)[key]
        if (hit !== undefined) return hit
        const en = owner && owner.get('en') && owner.get('en')[key]
        return en !== undefined ? en : key
      }
    },
    dictOf(ns, loc) { const o = dicts.get(ns); return o ? o.get(loc) : undefined },
    namespaces() { return [...dicts.keys()] },
  }
}

/** Load the bundle and apply it with a given ctx; returns the captured render fn.
    `section` seeds the fake dsh settingsScope binder (the theme no longer reads
    localStorage) with the same preferences the old store pre-wrote. */
const mount = (ctxExtras, section) => {
  const prefs = settingsScopeStub(section || {})
  const sandbox = {
    window: {
      __ModuleLoader__: null,
      addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false }),
      innerWidth: 1440, setTimeout: () => 0, clearTimeout() {},
    },
    document,
    React: makeReact(),
    MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    performance: { now: () => 0 },
    setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    console,
  }
  sandbox.globalThis = sandbox
  sandbox.window.document = document
  let loaded = null
  sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }
  vm.createContext(sandbox)
  new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox)
  if (loaded === null) throw new Error('module never registered')

  let rendered = null
  let registerOpts = null
  const slots = {
    inject(_n, fn) { fn() },
    register(opts, render) { registerOpts = opts; rendered = render; return () => {} },
  }
  const effects = []
  const mod = loaded.factory(() => null)
  mod.apply({
    get: (n) => {
      if (n === 'theme') return { overrideTokens: () => () => {} }
      if (n === 'slots') return slots
      if (n === 'settingsScope') return prefs.binder
      return ctxExtras[n]
    },
    effect: (fn) => { const d = fn(); if (typeof d === 'function') effects.push(d) },
  })
  return { rendered, registerOpts, effects, prefs }
}

/* Same starting state as the old localStorage seed (theme on, anim-heavy layers off
   so nothing needs a real frame/draw in the assertion host). */
const baseStore = () => ({
  enabled: '1',
  loader: '0',
  contour: '0',
  watermark: '0',
})

/* ============ 1. dictionary integrity: zh and en must have identical keys ============
   A missing key does not crash — it renders the raw key string into the UI. So the two
   dictionaries are compared directly, which is the only cheap way to catch it. */
const locale = makeLocale('zh')
const m1 = mount({ locale }, baseStore())
if (m1.rendered === null) { fail('settings.section never registered'); process.exit(1) }
pass('apply() registered the settings section with a locale service present')

const NS = 'settings.theme-endfield'
if (locale.namespaces().includes(NS)) pass('注册了自己的词典命名空间：' + NS)
else { fail('no dictionaries registered under ' + NS + ' (got: ' + locale.namespaces().join(', ') + ')'); process.exit(1) }

const zh = locale.dictOf(NS, 'zh')
const en = locale.dictOf(NS, 'en')
if (zh === undefined) fail('no zh dictionary registered')
if (en === undefined) fail('no en dictionary registered')
if (zh && en) {
  const zhKeys = Object.keys(zh).sort()
  const enKeys = Object.keys(en).sort()
  const missingEn = zhKeys.filter((k) => !(k in en))
  const extraEn = enKeys.filter((k) => !(k in zh))
  if (missingEn.length === 0) pass('en 词典覆盖全部 ' + zhKeys.length + ' 个 zh 键')
  else fail('en 缺少 ' + missingEn.length + ' 个键（会在界面里显示原始键名）：' + missingEn.join(', '))
  if (extraEn.length === 0) pass('en 没有 zh 里不存在的多余键')
  else fail('en 多出键（zh 缺失，中文界面会显示原始键名）：' + extraEn.join(', '))
  const blankZh = zhKeys.filter((k) => String(zh[k]).trim() === '')
  const blankEn = enKeys.filter((k) => String(en[k]).trim() === '')
  if (blankZh.length === 0 && blankEn.length === 0) pass('没有空字符串译文')
  else fail('空译文：zh=[' + blankZh.join(',') + '] en=[' + blankEn.join(',') + ']')
  // The two languages must actually differ, or the "translation" is a copy.
  const identical = zhKeys.filter((k) => zh[k] === en[k])
  if (identical.length <= 4) pass('zh/en 译文实质不同（仅 ' + identical.length + ' 个键相同）')
  else fail(identical.length + ' 个键的 zh 与 en 完全相同，疑似漏译：' + identical.slice(0, 8).join(', '))
}

/* ============ 2. the registration must be locale-aware ============ */
const opts = m1.registerOpts || {}
if (opts.locale === NS) pass('注册声明了 locale 命名空间（框架据此在切换语言时重建条目）')
else fail('registration must declare locale: ' + NS + ' (got ' + JSON.stringify(opts.locale) + ') — the panel would not re-render on a language switch')
if (typeof opts.label === 'function') pass('label 是 thunk（导航行标题随语言切换）')
else fail('label must be a thunk so the nav row follows the active locale (got ' + typeof opts.label + ')')
if (typeof opts.label === 'function') {
  const zhLabel = opts.label()
  locale.setActive('en')
  const enLabel = opts.label()
  locale.setActive('zh')
  if (zhLabel !== enLabel) pass('导航行标题随语言变化：「' + zhLabel + '」→「' + enLabel + '」')
  else fail('the nav label did not change with the locale (both "' + zhLabel + '")')
}

/* ============ 3. the rendered page must actually be in the active language ============ */
const renderIn = (lang) => { locale.setActive(lang); return textOf(m1.rendered()) }
const zhText = renderIn('zh')
const enText = renderIn('en')

const HAS_CJK = /[\u4e00-\u9fff]/
if (HAS_CJK.test(zhText)) pass('zh 下页面为中文')
else fail('the zh render contains no Chinese at all')

/* CJK PUNCTUATION is a separate axis from CJK words, and it is the easier one to
   leave behind: the row readouts were built as `label + '：' + value` with a
   hardcoded full-width colon, so every English row carried a Chinese colon. Caught
   by looking at a rendered screenshot, then pinned here. */
const CJK_PUNCT = /[：，。、「」（）；！？]/
const enPunct = enText.match(new RegExp(CJK_PUNCT.source, 'g'))
if (enPunct === null) pass('en 页面不含中日韩标点（全角冒号/引号等）')
else fail('en 页面残留中文标点：' + [...new Set(enPunct)].join(' ') + ' — 分隔符等应走词典而非硬编码')
if (zhText.includes('：')) pass('zh 页面仍使用全角冒号')
else fail('the Chinese page lost its full-width colon separator')

/* The English page must be free of stray Chinese. Two words are deliberately exempt:
   the announcement literally paints 任务开始/任务完成 on screen, so the English hint
   quotes those exact glyphs — translating them in the hint would describe something
   the user never sees. */
const EXEMPT = ['任务开始', '任务完成']
let residue = enText
for (const w of EXEMPT) residue = residue.split(w).join('')
const strayMatches = residue.match(/[\u4e00-\u9fff]+/g)
if (strayMatches === null) pass('en 下页面无残留中文（仅豁免屏幕上真实出现的「任务开始/任务完成」字样）')
else fail('en 页面仍有中文残留：' + [...new Set(strayMatches)].join(' / '))

if (zhText !== enText) pass('两种语言渲染结果不同')
else fail('the page rendered identically in both languages')

/* Spot-check that real row copy switched, not just the group headers. */
const CHECKS = [
  ['themeRow', 'Endfield theme'],
  ['paletteRow', 'Accent palette'],
  ['thunderRow', 'Task announcement'],
  ['thunderAnimRow', 'Announcement entry animation'],
  ['preview', 'Preview'],
]
for (const [key, expect] of CHECKS) {
  if (enText.includes(expect)) pass('en 行文案生效：' + key + ' → ' + expect)
  else fail('en render is missing the copy for ' + key + ' (expected "' + expect + '")')
}
// And the group headers must not print the latin line twice under English.
const dupEn = (enText.match(/ENTERTAINMENT/g) || []).length
if (dupEn === 1) pass('en 下分组标题不重复打印拉丁行')
else fail('the English group header printed its latin line ' + dupEn + ' times (expected 1)')
// Under Chinese, the latin line IS the editorial second line and must be present.
if (zhText.includes('ENTERTAINMENT') && zhText.includes('娱乐')) pass('zh 下分组标题保留中文名 + 拉丁行')
else fail('the Chinese group header lost either its name or its latin line')

/* ============ 4. an unknown locale must fall back, not print raw keys ============ */
const fbText = renderIn('de')
if (!/\bthunderRow\b|\bpaletteRow\b|\bgroupFun\b/.test(fbText)) pass('未知语言回退到 en，不会漏出原始键名')
else fail('an unknown locale leaked raw dictionary keys into the UI')
locale.setActive('zh')

/* ============ 5. dictionaries must be registered through ctx.effect ============
   Applying the bundle twice is a real scenario this file already guards against
   elsewhere; if the registration were not disposable, the service's duplicate guard
   would throw on the second run. */
if (locale.registerCalls === 1) pass('词典只注册一次')
else fail('expected exactly 1 register call, got ' + locale.registerCalls)
if (m1.effects.length > 0) {
  let threw = null
  try { m1.effects.forEach((d) => d()) } catch (e) { threw = e.message }
  if (threw === null) pass('ctx.effect 拆除时可正常注销词典')
  else fail('disposing the dictionary registration threw: ' + threw)
  // After disposal the namespace must be re-registrable — proof it was disposable.
  let reThrew = null
  try { locale.register(NS, { zh: { a: '1' }, en: { a: '1' } }) } catch (e) { reThrew = e.message }
  if (reThrew === null) pass('注销后可重新注册（证明注册确实随 run 释放）')
  else fail('the namespace was not released on dispose: ' + reThrew)
} else {
  fail('apply() registered no disposable effects — dictionaries would leak across runs')
}

/* ============ 6. no locale service at all: must still render, in Chinese ============ */
let m2 = null
let threw2 = null
try { m2 = mount({}, baseStore()) } catch (e) { threw2 = e.message }
if (threw2 !== null) fail('apply() threw without a locale service: ' + threw2)
else if (m2.rendered === null) fail('no settings section registered without a locale service')
else {
  let tree = null
  let renderThrew = null
  try { tree = tree = m2.rendered() } catch (e) { renderThrew = e.message }
  if (renderThrew !== null) fail('render threw without a locale service: ' + renderThrew)
  else {
    const txt = textOf(tree)
    if (HAS_CJK.test(txt)) pass('无 locale 服务时回退为中文，页面照常可用')
    else fail('without a locale service the page did not fall back to Chinese')
    if (!/\bthunderRow\b|\bgroupFun\b/.test(txt)) pass('无 locale 服务时不会漏出原始键名')
    else fail('the no-locale fallback leaked raw dictionary keys')
    // The label thunk must be callable in this mode too (the nav row still needs text).
    const lbl = m2.registerOpts && m2.registerOpts.label
    if (typeof lbl === 'function' && HAS_CJK.test(String(lbl()))) pass('无 locale 服务时导航标题仍有中文文案')
    else fail('the nav label is unusable without a locale service')
    /* And it must NOT declare a namespace it cannot back. ui-renderer throws
       SlotAssemblyError for an entry that declares `locale:` while no locale face is
       installed, so declaring it unconditionally would turn "no locale plugin" from a
       Chinese page into a crashed page. */
    if (m2.registerOpts && m2.registerOpts.locale === undefined) {
      pass('无 locale 服务时不声明 locale 命名空间（否则 ui-renderer 会抛 SlotAssemblyError）')
    } else {
      fail('the registration declared locale: ' + JSON.stringify(m2.registerOpts && m2.registerOpts.locale)
        + ' without a locale face — ui-renderer would throw SlotAssemblyError')
    }
  }
}

console.log('')
if (failures) { console.error(failures + ' locale check(s) failed'); process.exit(1) }
console.log('all settings-locale checks passed')
