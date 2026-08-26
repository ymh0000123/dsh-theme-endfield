/**
 * settings-buttons.test.js — buttons whose FILL comes from the theme must not keep
 * the app's own light foreground.
 *
 * The concrete bug this was written for: the 编辑 button in Settings > 模型
 * (@deepseek-ai/dsh-client-ui-settings-models, .zGbnIq_secondaryButton) declares
 *     color: var(--dsw-alias-label-primary)
 *     background: var(--dsw-alias-interactive-bg-hover-solid)   (on :hover)
 * and this theme maps that background token to the SOLID ACCENT while leaving the
 * foreground alone. In dark mode label-primary is #f5f5f0, so the label rendered
 * near-white on signal yellow: measured 1.05:1 from a real screenshot — invisible.
 *
 * Two things make this worth a dedicated test rather than a one-line fix:
 *   1. It is palette-dependent. On 武陵青 the same pairing is 2.61:1 — still bad,
 *      but visible enough that the bug hides until someone uses 谷地黄.
 *   2. The theme's broad hover-inversion rule deliberately EXCLUDES plain buttons
 *      (so a yellow toggle keeps black text and the white-on-dark send button keeps
 *      white), which is exactly why this button fell through the gap.
 *
 * Strategy: render the real theme stylesheet over the real upstream button CSS in a
 * headless browser, force :hover via a same-specificity class swap (a screenshot
 * cannot hover), and assert the composited contrast in BOTH palettes and BOTH
 * schemes.
 *
 * Usage: node test/settings-buttons.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

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

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-btn-'))
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
const page = path.join(OUT, 'mock.html')

/* Upstream CSS, copied verbatim from the installed bundle
   (@deepseek-ai/dsh-client-ui-settings-models, ModelsSection.module.css). The
   HOVERPROBE class is the same-specificity stand-in for :hover — a class and a
   pseudo-class are both 0,1,0, so the cascade result is identical while being
   reachable without a real pointer. The same trick is used by
   watermark-stacking.test.js for the badge hover check. */
const UPSTREAM = `
  .zGbnIq_secondaryButton,.zGbnIq_addButton{box-sizing:border-box;height:36px;font:inherit;
    cursor:pointer;border:none;border-radius:18px;justify-content:center;align-items:center;
    gap:4px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}
  .zGbnIq_secondaryButton,.zGbnIq_addButton{border:1px solid var(--dsw-alias-border-l2);
    color:var(--dsw-alias-label-primary);background:0 0}
  .zGbnIq_secondaryButton:hover:not(:disabled),.zGbnIq_addButton:hover:not(:disabled){
    background:var(--dsw-alias-interactive-bg-hover)}
  .zGbnIq_secondaryButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}
  .zGbnIq_secondaryButton.HOVERPROBE:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
  .zGbnIq_secondaryButton.HOVERPROBE:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}
  .zGbnIq_addButton.HOVERPROBE:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
  .zGbnIq_dangerButton{box-sizing:border-box;height:36px;border:1px solid var(--dsw-alias-border-l2);
    color:var(--dsw-alias-label-error);background:0 0;border-radius:18px;padding:0 14px}
  /* Same defect, other screens. These three re-assert label-primary in the SAME
     rule that sets the accent fill, so they are the strongest form of the bug. */
  .gNWCoW_inspectButton{color:var(--dsw-alias-label-secondary);background:0 0;border:none;cursor:pointer}
  .gNWCoW_inspectButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}
  .gNWCoW_inspectButton.HOVERPROBE{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}
  .JVDQca_arrow{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-input-major);
    width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer}
  .JVDQca_arrow:hover{background:var(--dsw-alias-interactive-bg-hover-solid)}
  .JVDQca_arrow.HOVERPROBE{background:var(--dsw-alias-interactive-bg-hover-solid)}
  /* Regression guard: these end in _arrow too but take NO hover fill, so the fix
     must NOT force ink onto them. */
  .Y0dWHa_arrow{color:var(--dsw-alias-label-caption)}
  .YDXeBa_arrow{color:var(--dsw-alias-label-primary)}
`

fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%}
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:Arial,sans-serif}
  .panel{padding:20px;background:var(--dsw-alias-bg-layer-1)}
  ${UPSTREAM}
</style></head><body>
<div class="panel">
  <button class="zGbnIq_secondaryButton" id="edit">编辑</button>
  <button class="zGbnIq_secondaryButton HOVERPROBE" id="editHover">编辑</button>
  <button class="zGbnIq_addButton" id="add">添加提供方</button>
  <button class="zGbnIq_addButton HOVERPROBE" id="addHover">添加提供方</button>
  <button class="zGbnIq_dangerButton" id="danger">移除</button>
  <button class="gNWCoW_inspectButton" id="inspect">检查</button>
  <button class="gNWCoW_inspectButton HOVERPROBE" id="inspectHover">检查</button>
  <button class="JVDQca_arrow" id="arrow">&gt;</button>
  <button class="JVDQca_arrow HOVERPROBE" id="arrowHover">&gt;</button>
  <span class="Y0dWHa_arrow" id="trajArrow">&gt;</span>
  <span class="YDXeBa_arrow" id="wsArrow">&gt;</span>
</div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
window.__RESULTS__=[]
const R=(name,pass,detail)=>window.__RESULTS__.push({name,pass:!!pass,detail:detail===undefined?'':String(detail)})

let appliedTokens=[]
let scheme='light'
let lastTokens=null
const applyTokens=(t)=>{
  lastTokens=t
  for(const n of appliedTokens) document.body.style.removeProperty(n)
  appliedTokens=[]
  for(const [k,v] of Object.entries(t)){ document.body.style.setProperty(k,v[scheme]); appliedTokens.push(k) }
}
const setScheme=(s)=>{
  scheme=s
  if(s==='dark') document.body.setAttribute('data-ds-dark-theme','')
  else document.body.removeAttribute('data-ds-dark-theme')
  if(lastTokens) applyTokens(lastTokens)
}
const mod=window.__MOD__.factory(()=>null)
localStorage.setItem('dsh-theme-endfield-enabled','1')
localStorage.setItem('dsh-theme-endfield-loader','0')
localStorage.setItem('dsh-theme-endfield-contour','0')
localStorage.removeItem('dsh-theme-endfield-palette')
mod.apply({get:(n)=>n==='theme'?{overrideTokens:(_s,t)=>{applyTokens(t);return ()=>{}}}:undefined,effect:()=>{}})

const buttonTransition = getComputedStyle(document.getElementById('edit')).transition
R('按钮悬停反馈无过渡延迟', buttonTransition === 'none', buttonTransition)

/* --- contrast maths, on the COMPOSITED colours the browser reports --- */
const parse=(s)=>{const m=s.match(/rgba?\\(([^)]+)\\)/); if(!m) return null
  const p=m[1].split(',').map(v=>parseFloat(v.trim())); return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1}}
const lin=(v)=>{const c=v/255;return c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4)}
const lum=(c)=>0.2126*lin(c.r)+0.7152*lin(c.g)+0.0722*lin(c.b)
const ratio=(a,b)=>{const la=lum(a),lb=lum(b);return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05)}
const over=(fg,bg)=>({r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a),a:1})
/** Effective background: walk up until an opaque-enough layer is found. */
const bgOf=(el)=>{
  let cur=el, acc=null
  while(cur && cur!==document.documentElement){
    const c=parse(getComputedStyle(cur).backgroundColor)
    if(c && c.a>0){ acc = acc===null ? c : over(acc,c); if(acc.a>=0.999) return acc }
    cur=cur.parentElement
  }
  const b=parse(getComputedStyle(document.body).backgroundColor)
  return acc===null ? b : over(acc,b)
}
const probe=(id)=>{
  const el=document.getElementById(id)
  const cs=getComputedStyle(el)
  const fg=parse(cs.color)
  const bg=bgOf(el)
  const eff=fg.a<1?over(fg,bg):fg
  return {ratio:ratio(eff,bg), fg:cs.color, bg:'rgb('+Math.round(bg.r)+', '+Math.round(bg.g)+', '+Math.round(bg.b)+')'}
}

const run=(paletteName)=>{
  for(const s of ['light','dark']){
    setScheme(s)
    const tag=paletteName+' · '+s
    /* The hovered secondary button is the reported bug: its fill becomes the solid
       accent, so its own label must contrast against THAT, not against the panel. */
    const h=probe('editHover')
    R(tag+' · 编辑 悬停（实心强调底）', h.ratio>=4.5,
      h.ratio.toFixed(2)+':1  fg='+h.fg+' on '+h.bg)
    // Resting state must stay readable too (it is a plain transparent button).
    const r=probe('edit')
    R(tag+' · 编辑 常态', r.ratio>=4.5, r.ratio.toFixed(2)+':1  fg='+r.fg+' on '+r.bg)
    // The add button shares the same base rule but gets the translucent wash.
    const a=probe('addHover')
    R(tag+' · 添加提供方 悬停', a.ratio>=4.5, a.ratio.toFixed(2)+':1  fg='+a.fg+' on '+a.bg)
    // Danger button must keep its error colour readable (regression guard).
    const d=probe('danger')
    R(tag+' · 移除 常态', d.ratio>=4.5, d.ratio.toFixed(2)+':1  fg='+d.fg+' on '+d.bg)
    /* The same bug on other screens: the inspect button is the worst form, because
       upstream re-asserts color:label-primary in the very rule that applies the
       accent fill. */
    const i=probe('inspectHover')
    R(tag+' · 检查按钮 悬停（实心强调底）', i.ratio>=4.5, i.ratio.toFixed(2)+':1  fg='+i.fg+' on '+i.bg)
    const ar=probe('arrowHover')
    R(tag+' · 附件箭头 悬停（实心强调底）', ar.ratio>=4.5, ar.ratio.toFixed(2)+':1  fg='+ar.fg+' on '+ar.bg)
    /* Regression guard: two other components' classes also end in _arrow but take
       no hover fill. The fix must leave their resting colour alone — an over-broad
       suffix match would have forced ink onto them. */
    const ta=probe('trajArrow')
    R(tag+' · 轨迹箭头 未被误改', ta.ratio>=4.5, ta.ratio.toFixed(2)+':1  fg='+ta.fg+' on '+ta.bg)
    const wa=probe('wsArrow')
    R(tag+' · 工作区箭头 未被误改', wa.ratio>=4.5, wa.ratio.toFixed(2)+':1  fg='+wa.fg+' on '+wa.bg)
  }
}

run('谷地黄')
document.body.classList.add('theme-endfield-wuling')
run('武陵青')

document.title='DONE '+JSON.stringify(window.__RESULTS__)
</script></body></html>`)

const html = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=4000', '--dump-dom', 'file:///' + page.replace(/\\/g, '/')],
  { encoding: 'utf8', maxBuffer: 1 << 26 })
const m = html.match(/<title>DONE ([\s\S]*?)<\/title>/)
if (!m) {
  console.error('FAIL  page produced no results')
  const t = html.match(/<title>([\s\S]*?)<\/title>/)
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
if (failures) { console.error(failures + ' settings-button contrast check(s) failed'); process.exit(1) }
console.log('all settings-button contrast checks passed (' + results.length + ' assertions)')
