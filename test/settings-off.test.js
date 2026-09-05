/**
 * settings-off.test.js — with the theme switched OFF, the 「终末地主题设置」 panel
 * must stay readable.
 *
 * The panel is the one place a user can turn the theme back on, so it must
 * survive the theme being OFF. The concrete bug this guards: the switch
 * buttons were styled with the theme's own variables (--edge-accent /
 * --edge-btn-muted, defined in the theme's <style>) and hardcoded black ink
 * for the ON state. unmount() removes that stylesheet, so after switching the
 * theme OFF the ON buttons (including the always-ON palette button) kept
 * `color:#000` while their accent fill vanished — black text on the app's dark
 * settings panel, i.e. invisible. Measured: ~1.1:1 in dark mode.
 *
 * Strategy: load the REAL client.js in a headless browser with the app's OWN
 * default tokens (light + dark) and the theme disabled, capture the settings
 * render via a slots stub, materialise the element tree into real DOM, and
 * assert the composited contrast of every button's text against its effective
 * background in BOTH colour schemes.
 *
 * Usage: node test/settings-off.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

const ROOT = path.resolve(__dirname, '..')

function findChrome() {
  const c = [process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean)
  for (const p of c) if (fs.existsSync(p)) return p
  return null
}
const chrome = findChrome()
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-off-'))
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
const page = path.join(OUT, 'mock.html')

/* The app's OWN token values when the theme is OFF — the theme's override layer
   is disposed on unmount, so the panel sits on these. Copied from the installed
   @deepseek-ai/dsh-client-ui-theme bundle (static bluish palette + dark alias
   block). The exact app defaults matter here: label-primary must be near-white
   in dark mode, and the panel bg near-black — the exact contrast the bug broke. */
const APP_TOKENS = {
  light: {
    '--dsw-alias-bg-base': '#0f1115',
    '--dsw-alias-bg-layer-1': '#f4f5f7',
    '--dsw-alias-label-primary': '#0f1115',
    '--dsw-alias-label-tertiary': '#81858c',
    '--dsw-alias-border-l1': '#e1e5ee',
    '--dsw-alias-border-l2': '#cfd3d6',
    '--dsw-alias-interactive-bg-hover-solid': '#f1f3f5',
  },
  dark: {
    '--dsw-alias-bg-base': '#151517',
    '--dsw-alias-bg-layer-1': '#2c2c2e',
    '--dsw-alias-label-primary': '#f9fafb',
    '--dsw-alias-label-tertiary': '#81858c',
    '--dsw-alias-border-l1': '#ffffff0f',
    '--dsw-alias-border-l2': '#ffffff1f',
    '--dsw-alias-interactive-bg-hover-solid': '#353638',
  },
}

fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%}
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:Arial,sans-serif}
  .panel{padding:20px;background:var(--dsw-alias-bg-layer-1)}
</style></head><body>
<div class="panel" id="panel"></div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
/* Recording React: enough to capture the real element tree the settings panel
   builds (the same stub approach as settings-rows.test.js). */
const R = {
  useState(init) { const v = typeof init === 'function' ? init() : init; return [v, () => {}] },
  createElement(type, props, ...children) {
    const kids = []
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c)
      else if (c !== null && c !== undefined && c !== false) kids.push(c)
    }
    return { type, props: props || {}, children: kids }
  },
}
window.React = R

/* --- app token application: the theme service writes tokens as inline body
   styles; with the theme OFF these are the app's own values. --- */
let scheme = 'light'
const applyTokens = () => {
  const t = APP_TOKENS_JS[scheme]
  for (const k in t) document.body.style.setProperty(k, t[k])
}
const setScheme = (s) => {
  scheme = s
  if (s === 'dark') document.body.setAttribute('data-ds-dark-theme', '')
  else document.body.removeAttribute('data-ds-dark-theme')
  applyTokens()
}

/* --- apply the real theme with the master switch OFF ---
   The theme reads preferences through the dsh settingsScope seam, so this page
   seeds a fake binder with the same section the old localStorage lines set:
   master switch and the anim/heavy layers all OFF. */
${BROWSER_SETTINGS_SCOPE_SNIPPET}
var __prefs = __endfieldSettingsScope({ enabled:'0', loader:'0', contour:'0', watermark:'0' });

let rendered = null
const slots = {
  inject(_name, fn) { fn() },
  register(_opts, render) { rendered = render; return () => {} },
}

const mod = window.__MOD__.factory(() => null)
mod.apply({
  get: (n) => n === 'theme'
    ? { overrideTokens: () => () => {} }
    : (n === 'slots' ? slots : (n === 'settingsScope' ? __prefs.binder : undefined)),
  effect: () => {},
})
if (typeof rendered !== 'function') throw new Error('settings.section never registered')

/* --- materialise the element tree into real DOM --- */
function mount(node, parent) {
  if (node == null || typeof node === 'boolean') return
  if (typeof node === 'string' || typeof node === 'number') {
    parent.appendChild(document.createTextNode(String(node))); return
  }
  const el = document.createElement(node.type)
  const p = node.props || {}
  if (p.style) for (const k in p.style) el.style[k] = p.style[k]
  if (p.className) el.className = p.className
  if (p.title) el.title = p.title
  if (p.disabled) el.disabled = true
  if (p['aria-hidden']) el.setAttribute('aria-hidden', 'true')
  parent.appendChild(el)
  for (const c of node.children || []) mount(c, el)
}
const panel = document.getElementById('panel')
mount(rendered(), panel)

/* --- contrast maths, on the COMPOSITED colours the browser reports --- */
const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null
  const p = m[1].split(',').map(v => parseFloat(v.trim())); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) }
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
const bgOf = (el) => {
  let cur = el, acc = null
  while (cur && cur !== document.documentElement) {
    const c = parse(getComputedStyle(cur).backgroundColor)
    if (c && c.a > 0) { acc = acc === null ? c : over(acc, c); if (acc.a >= 0.999) return acc }
    cur = cur.parentElement
  }
  const b = parse(getComputedStyle(document.body).backgroundColor)
  return acc === null ? b : over(acc, b)
}

window.__RESULTS__ = []
const R2 = (name, pass, detail) => window.__RESULTS__.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) })

const probe = (el) => {
  const cs = getComputedStyle(el)
  const fg = parse(cs.color)
  const bg = bgOf(el)
  const eff = fg.a < 1 ? over(fg, bg) : fg
  return { ratio: ratio(eff, bg), fg: cs.color, bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')' }
}

/* --- run both schemes over the SAME tree (inline styles reference CSS vars,
   which re-resolve when the body tokens flip — no re-render needed) --- */
const buttons = [...panel.querySelectorAll('button')]
if (buttons.length === 0) throw new Error('no buttons rendered')

for (const s of ['light', 'dark']) {
  setScheme(s)
  const tag = 'theme OFF · ' + s
  buttons.forEach((btn, i) => {
    const label = (btn.textContent || '').trim()
    const r = probe(btn)
    R2(tag + ' · 按钮[' + i + ']「' + label + '」', r.ratio >= 4.5,
      r.ratio.toFixed(2) + ':1  fg=' + r.fg + ' on ' + r.bg)
  })
  /* Group titles must also inherit a readable colour once the stylesheet rule
     that gave them accent ink is gone (it is removed with the theme). */
  const titles = [...panel.querySelectorAll('.endfield-settings-group-title')]
  titles.forEach((t, i) => {
    const r = probe(t)
    R2(tag + ' · 分组标题[' + i + ']「' + (t.textContent || '').trim() + '」', r.ratio >= 4.5,
      r.ratio.toFixed(2) + ':1  fg=' + r.fg + ' on ' + r.bg)
  })
}

document.title = 'DONE ' + JSON.stringify(window.__RESULTS__)
</script></body></html>`)

/* Inject the token object into the page scope (the <script> references
   APP_TOKENS_JS — defined below via a second script tag written after). */
const html = fs.readFileSync(page, 'utf8')
fs.writeFileSync(page, html.replace(
  '<script src="./client.js"></script>',
  '<script>var APP_TOKENS_JS = ' + JSON.stringify(APP_TOKENS) + '</script>\n<script src="./client.js"></script>'
))

const out = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=4000', '--dump-dom', 'file:///' + page.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 1 << 26 })
const m = out.match(/<title>DONE ([\s\S]*?)<\/title>/)
if (!m) {
  console.error('FAIL  page produced no results')
  const t = out.match(/<title>([\s\S]*?)<\/title>/)
  if (t) console.error('      title was: ' + t[1].slice(0, 300))
  process.exit(1)
}
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
const results = JSON.parse(decode(m[1]))

let failures = 0
for (const r of results) {
  if (r.pass) console.log('ok    ' + r.name + '  [' + r.detail + ']')
  else { console.error('FAIL  ' + r.name + '  [' + r.detail + ']'); failures++ }
}
console.log('')
if (failures) { console.error(failures + ' settings-off contrast check(s) failed'); process.exit(1) }
console.log('all theme-OFF settings contrast checks passed (' + results.length + ' assertions)')
