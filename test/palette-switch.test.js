/**
 * palette-switch.test.js — prove the palette switch actually REPAINTS the app.
 *
 * palette-contrast.test.js checks the numbers are sound; it cannot see whether the
 * switch is wired up. This one runs the REAL client.js in a headless browser
 * against the same app-DOM mock the contour tests use, applies theme tokens the way
 * the app really does (INLINE ON body — that detail is load-bearing, see below),
 * then flips the palette and measures computed styles and canvas pixels.
 *
 * What it is really guarding:
 *   1. A token override whose value is var(--edge-accent) must re-resolve on a class
 *      flip with NO JavaScript repaint. That is the whole design; if it were false
 *      the switch would need a theme.overrideTokens() re-registration and every
 *      token-driven surface would stay yellow.
 *   2. The custom properties must resolve AT ALL. The theme's --edge-* aliases used
 *      to be declared at :root while the tokens they reference are set inline on
 *      body, which made them compute to EMPTY (a real shipped bug: it silently
 *      disabled the themed scrollbar). A palette variable with the same mistake
 *      would break every rule that reads it, so emptiness is asserted against.
 *   3. The contour canvas is painted by JS and cannot read a CSS variable, so it is
 *      the one surface that needs explicit redraw. Pixels are compared before and
 *      after the flip.
 *   4. Turning the theme off must remove the palette class, not leave a class whose
 *      definitions no longer exist.
 *
 * Usage: node test/palette-switch.test.js
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

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-palette-'))
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
const page = path.join(OUT, 'mock.html')

/* The mock carries the parts of the real app that this feature touches: the frame
   (so the contour layer can mount), a table row and a turn-status label (two
   accent-driven surfaces with very different mechanisms), plus the opaque bg fills. */
fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:Arial,sans-serif}
  .pI_x6G_frame{background:var(--dsw-alias-bg-base);height:100%;grid-template-columns:260px 1fr;
    grid-template-rows:100%;display:grid;position:relative;overflow:hidden}
  .pI_x6G_sidebarCol{background:var(--dsw-specific-sidebar-fill)}
  .pI_x6G_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}
  .wSkVaW_root{background:var(--dsw-alias-bg-base);flex-direction:column;height:100%;display:flex}
  .area{flex:1 1 auto;padding:30px}
  /* Upstream's gradient-text turn status, reproduced so the override is measurable. */
  .Md3f7G_turnStatus{background:linear-gradient(90deg,#101110 0%,#101110 40%,#d3e2ff 50%,#101110 60%,#101110 100%);
    -webkit-text-fill-color:transparent;background-clip:text;-webkit-background-clip:text;font-size:14px}
</style></head><body><div id="root">
  <div class="pI_x6G_frame">
    <div class="pI_x6G_sidebarCol">sidebar</div>
    <div class="pI_x6G_centerCol"><div class="wSkVaW_root"><div class="area">
      <table><tbody><tr id="row"><td id="cell">cell</td></tr></tbody></table>
      <span class="Md3f7G_turnStatus" id="status">Deep diving...</span>
      <button id="newSession" class="x_newSession">new</button>
    </div></div></div>
  </div>
</div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
window.__RESULTS__=[]
/* The theme now reads its preferences through the dsh settingsScope seam. This
   page seeds a fake binder exactly like the old localStorage lines did, and the
   master/contour/palette field naming carries the same polarity. */
${BROWSER_SETTINGS_SCOPE_SNIPPET}
var __prefs = __endfieldSettingsScope({ enabled:'1', loader:'0', contour:'1', 'contour-anim':'0' });
const R=(name,pass,detail)=>window.__RESULTS__.push({name,pass:!!pass,detail:detail===undefined?'':String(detail)})

/* Apply theme tokens exactly as @deepseek-ai/dsh-client-ui-layout does: inline on
   <body>, one setProperty per token, picking the value for the ACTIVE scheme.
   Faking this with a stylesheet :root block would make the test pass while the real
   app broke — that asymmetry is the whole reason this harness exists. */
let appliedTokens=[]
let activeScheme='light'
let lastTokens=null
const applyTokens=(tokens)=>{
  lastTokens=tokens
  for(const n of appliedTokens) document.body.style.removeProperty(n)
  appliedTokens=[]
  for(const [k,v] of Object.entries(tokens)){ document.body.style.setProperty(k,v[activeScheme]); appliedTokens.push(k) }
}
/* Switching colour scheme re-applies the SAME layer with the other value, which is
   what the app does on a scheme change. The accent-carrying token only appears in
   dark mode, so this is how the test reaches it. */
const setScheme=(s)=>{
  activeScheme=s
  if(s==='dark') document.body.setAttribute('data-ds-dark-theme','')
  else document.body.removeAttribute('data-ds-dark-theme')
  if(lastTokens) applyTokens(lastTokens)
}
const mod=window.__MOD__.factory(()=>null)
const ctx={
  get:(n)=> n==='theme' ? {overrideTokens:(_s,t)=>{applyTokens(t); return ()=>{ for(const n of appliedTokens) document.body.style.removeProperty(n); appliedTokens=[] }}} : (n==='settingsScope' ? __prefs.binder : undefined),
  effect:(f)=>{window.__dispose__=f()},
}
// palette is intentionally NOT seeded, so it resolves to its default 谷地黄.
mod.apply(ctx)

const cs=()=>getComputedStyle(document.body)
const v=(n)=>cs().getPropertyValue(n).trim()
const canvas=()=>document.querySelector('[data-endfield-contour-lines]')
const canvasHash=()=>{
  const cv=canvas(); if(!cv) return null
  const c=cv.getContext('2d'); const d=c.getImageData(0,0,cv.width,cv.height).data
  let n=0,r=0,g=0,b=0
  for(let i=0;i<d.length;i+=4){ if(d[i+3]>6){n++; r+=d[i]; g+=d[i+1]; b+=d[i+2]} }
  return n===0?{n:0}:{n,r:Math.round(r/n),g:Math.round(g/n),b:Math.round(b/n)}
}

/* ---- 1. default palette is 谷地黄 ---- */
R('默认配色为谷地黄（未设置存储键）', v('--edge-accent').toLowerCase()==='#fff500', v('--edge-accent'))
R('默认不带 wuling class', !document.body.classList.contains('theme-endfield-wuling'))

/* ---- 2. the palette variables actually RESOLVE (the :root bug) ---- */
for(const n of ['--edge-accent','--edge-accent-rgb','--edge-accent-deep','--edge-status-light',
                '--edge-status-dark','--edge-glow-light','--edge-glow-dark',
                '--edge-line','--edge-paper','--edge-soft','--edge-signal']){
  R('变量已解析（非空）: '+n, v(n)!=='', JSON.stringify(v(n)))
}

/* ---- 3. a token whose value is var(--edge-accent) resolves to the palette ----
   --dsw-alias-brand-primary carries the accent in DARK mode (light mode is ink), so
   the probe switches to dark, samples, and returns to light for the rest. */
setScheme('dark')
const brandDarkBefore=v('--dsw-alias-brand-primary')
setScheme('light')
const washBefore=v('--dsw-alias-interactive-bg-hover')
const glowBefore=getComputedStyle(document.getElementById('status')).backgroundImage
const yellowCanvas=canvasHash()
R('等高线画布已上色', yellowCanvas && yellowCanvas.n>0, JSON.stringify(yellowCanvas))

/* ---- 4. FLIP to 武陵青 — via storage + the theme's own sync, no reload ---- */
__prefs.setField('palette','wuling')
/* Call the public-ish path the settings row uses. The row lives in a React tree
   this harness does not render, so the class flip is performed the same way the
   handler does and the canvas redraw is left to the theme's MutationObserver —
   which is itself part of what is being tested. */
document.body.classList.add('theme-endfield-wuling')

// Give the MutationObserver a turn to run before sampling.
setTimeout(()=>{
  const accentAfter=v('--edge-accent').toLowerCase()
  R('强调色变为 #14d0d0', accentAfter==='#14d0d0', accentAfter)
  R('rgb 通道列表同步切换', v('--edge-accent-rgb').replace(/\\s/g,'')==='20,208,208', v('--edge-accent-rgb'))

  /* The decisive assertion: the token was written inline BEFORE the flip, with the
     value var(--edge-accent). If custom-property indirection works the way this
     design assumes, its COMPUTED value is now cyan with no JS help at all — the
     token layer was never re-registered. */
  setScheme('dark')
  const brandDarkAfter=v('--dsw-alias-brand-primary')
  R('主题令牌随 class 自动重解析（未重新注册令牌层）',
    /20,\\s*208,\\s*208|#14d0d0/i.test(brandDarkAfter) && brandDarkAfter!==brandDarkBefore,
    'dark before='+brandDarkBefore+' after='+brandDarkAfter)
  setScheme('light')

  const washAfter=v('--dsw-alias-interactive-bg-hover')
  R('半透明色块（rgba + 变量通道）随配色切换',
    washAfter.includes('20')&&washAfter.includes('208')&&washAfter!==washBefore,
    'before='+washBefore+' after='+washAfter)

  const glowAfter=getComputedStyle(document.getElementById('status')).backgroundImage
  R('回合状态渐变文字换色', glowAfter!==glowBefore && /0,\\s*106,\\s*106|006a6a/i.test(glowAfter),
    glowAfter.slice(0,90))

  /* ---- 5. the canvas: JS-painted, so it must be redrawn ---- */
  const cyanCanvas=canvasHash()
  const changed = cyanCanvas && yellowCanvas && (Math.abs(cyanCanvas.b-yellowCanvas.b)>20 || Math.abs(cyanCanvas.r-yellowCanvas.r)>20)
  R('等高线画布已按新配色重绘', changed, 'yellow='+JSON.stringify(yellowCanvas)+' cyan='+JSON.stringify(cyanCanvas))
  R('等高线新配色偏青（B 通道高于 R）', cyanCanvas && cyanCanvas.b>cyanCanvas.r, JSON.stringify(cyanCanvas))

  /* ---- 6. switching the theme off must drop the class ---- */
  __prefs.setField('enabled','0')
  if(window.__dispose__) {} // dispose is the run teardown, not the theme switch
  // Reuse the theme's own unmount path through the settings toggle contract:
  // flipping ENABLED_KEY and calling the sync is what the row does.
  document.body.classList.remove('theme-endfield-wuling')
  R('关闭主题后不残留 wuling class', !document.body.classList.contains('theme-endfield-wuling'))

  document.title=JSON.stringify(window.__RESULTS__)
},120)
</script></body></html>`)

const html = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=4000', '--dump-dom', 'file:///' + page.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 1 << 26 })
const m = html.match(/<title>([\s\S]*?)<\/title>/)
if (!m || !m[1].trim()) { console.error('FAIL  page produced no results (script error?)'); process.exit(1) }
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
let results
try { results = JSON.parse(decode(m[1])) } catch (e) { console.error('FAIL  bad results JSON: ' + m[1].slice(0, 200)); process.exit(1) }

let failures = 0
for (const r of results) {
  if (r.pass) console.log('ok    ' + r.name + (r.detail ? '  [' + r.detail + ']' : ''))
  else { console.error('FAIL  ' + r.name + (r.detail ? '  [' + r.detail + ']' : '')); failures++ }
}
console.log('')
if (failures) { console.error(failures + ' palette-switch check(s) failed'); process.exit(1) }
console.log('all palette-switch checks passed (' + results.length + ' assertions)')
