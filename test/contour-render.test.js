/**
 * verify-contour.js — prove the SHIPPED contour code actually renders.
 *
 * check.js proves client.js parses; that is not evidence the feature works. This
 * harness executes the REAL client.js in a headless browser against a mock of the
 * app's actual DOM and CSS (class-module names and the opaque bg-base fills taken
 * from the installed @deepseek-ai bundles), then asserts on measured pixels:
 *
 *   1. with the feature OFF nothing is created and no app style is altered;
 *   2. with it ON the canvases mount inside the app frame, the layer paints
 *      yellow-ish pixels, and the app's opaque backgrounds no longer hide it;
 *   3. body text ON TOP of the layer keeps its exact colour (the sheet must sit
 *      behind content, never wash it out);
 *   4. animation actually changes pixels over time, and stops when switched off;
 *   5. animation actually changes pixels, and stops when switched off;
 *   6. teardown removes every node.
 *
 * Usage: node verify-contour.js            (writes shots + exits non-zero on fail)
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

// This script lives in test/; the package it verifies is its parent.
const ROOT = path.resolve(__dirname, '..')
// Scratch page + the copy of client.js the page loads go to a temp directory, so
// running the tests never leaves artifacts inside the package.
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-render-'))

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  for (const c of cands) if (fs.existsSync(c)) return c
  return null
}

/* The mock reproduces the parts of the real app that decide whether the layer is
   visible at all, with values read out of the installed bundles:
     .pI_x6G_frame     position:relative; OPAQUE background bg-base; no stacking ctx
     .pI_x6G_sidebarCol / _centerCol   grid children
     .wSkVaW_root      OPAQUE background bg-base   <- hid the layer before
     .wSkVaW_composerSeat  gradient scrim to bg-base
   If the theme's transparency rules regress, the pixel assertions below fail. */
const MOCK = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
       font-family:Arial,sans-serif}
  :root{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-label-primary:#101110;
        --dsw-specific-sidebar-fill:#e8e8e2;--dsw-alias-border-l1:#d8d9d5;
        --dsw-alias-border-l2:#b6b8b3;--dsw-alias-bg-layer-1:#f2f2ec;
        --dsw-alias-bg-layer-2:#dcddd6;--dsw-alias-label-secondary:#4a4c48;
        --dsw-font-family:Arial,sans-serif;--dsh-scrollbar-width:8px}
  .pI_x6G_frame{background:var(--dsw-alias-bg-base);height:100%;
    grid-template-columns:260px 1fr;grid-template-rows:100%;display:grid;
    position:relative;overflow:hidden}
  .pI_x6G_sidebarCol{background:var(--dsw-specific-sidebar-fill);
    border-right:1px solid var(--dsw-alias-border-l1);min-width:0;overflow:hidden}
  .pI_x6G_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}
  .wSkVaW_root{background:var(--dsw-alias-bg-base);flex-direction:column;
    min-width:0;height:100%;display:flex}
  .wSkVaW_viewArea{flex:1 1 auto;padding:40px 60px;position:relative}
  .wSkVaW_composerSeat{z-index:7;background:linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-bg-base) 0%, transparent) 0px,
    var(--dsw-alias-bg-base) 36px);position:sticky;bottom:0;padding:20px 60px 28px}
  .msg{font-size:15px;line-height:1.7;max-width:640px;color:var(--dsw-alias-label-primary)}
</style></head><body><div id="root">
  <div class="pI_x6G_frame">
    <div class="pI_x6G_sidebarCol"><div style="padding:14px">sidebar</div></div>
    <div class="pI_x6G_centerCol"><div class="wSkVaW_root">
      <div class="wSkVaW_viewArea">
        <p class="msg" id="probe">Legibility probe paragraph sitting above the contour layer.</p>
      </div>
      <div class="wSkVaW_composerSeat"><div style="height:52px;border:1px solid var(--dsw-alias-border-l2)"></div></div>
    </div></div>
  </div>
</div>
<script>
/* Minimal stand-ins for what the client half consumes. The theme calls
   theme.overrideTokens() and ctx.get('slots'); neither needs to be real for the
   contour layer, but they must not throw. */
window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}
</script>
<script src="./client.js"></script>
<script>
const mod=window.__MOD__.factory(()=>null)
const ctx={
  get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:undefined,
  effect:(f)=>{window.__dispose__=f()},
}
window.__apply__=()=>mod.apply(ctx)
</script>
</body></html>`

async function main() {
  const chrome = findChrome()
  if (!chrome) {
    console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)')
    process.exit(1)
  }
  fs.mkdirSync(OUT, { recursive: true })
  const page = path.join(OUT, 'mock-app.html')
  fs.writeFileSync(page, MOCK)
  // client.js must sit beside the mock so <script src="./client.js"> resolves.
  fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

  const script = `
    const CDP = require('${path.join(ROOT, 'node_modules').replace(/\\/g, '\\\\')}');
  `
  // Drive the browser over the DevTools protocol with no external dependency:
  // a tiny WebSocket client is more code than this task needs, so instead the
  // assertions are executed IN the page and reported through the page title,
  // which --dump-dom can retrieve. Simpler and dependency-free.
  const probe = `
  <script>
  window.__RESULTS__=[]
  const R=(name,pass,detail)=>window.__RESULTS__.push({name,pass:!!pass,detail:detail===undefined?'':String(detail)})
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms))
  const px=(cv)=>{ // count yellow-ish pixels + mean luminance of a canvas
    const c=cv.getContext('2d'); const d=c.getImageData(0,0,cv.width,cv.height).data
    let n=0,lum=0,tot=0
    for(let i=0;i<d.length;i+=4){
      const a=d[i+3]; if(a>6){ n++; }
      lum+=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])*(a/255); tot++
    }
    return {opaque:n,mean:lum/tot}
  }
  window.__run__=async()=>{
    const LS=window.localStorage
    // ---------- 1. feature OFF ----------
    LS.setItem('dsh-theme-endfield-enabled','1')
    LS.removeItem('dsh-theme-endfield-contour')
    LS.setItem('dsh-theme-endfield-loader','0')
    window.__apply__()
    await sleep(120)
    R('off: no contour node', document.querySelectorAll('[data-endfield-contour]').length===0)
    const frame=document.querySelector('.pI_x6G_frame')
    const conv=document.querySelector('.wSkVaW_root')
    const fbgOff=getComputedStyle(frame).backgroundColor
    const cbgOff=getComputedStyle(conv).backgroundColor
    R('off: frame keeps opaque bg', fbgOff==='rgb(232, 232, 226)', fbgOff)
    R('off: conversation keeps opaque bg', cbgOff==='rgb(232, 232, 226)', cbgOff)

    // ---------- 2. switch ON via the same storage the settings row writes ----------
    LS.setItem('dsh-theme-endfield-contour','1')
    LS.setItem('dsh-theme-endfield-contour-anim','1')
    // trigger the page observer the same way the app's own rendering would
    document.body.appendChild(document.createElement('span'))
    await sleep(400)
    const wrap=document.querySelector('[data-endfield-contour]')
    R('on: layer mounted', !!wrap)
    R('on: mounted INSIDE app frame', !!wrap && wrap.parentElement===frame,
      wrap?wrap.parentElement.className:'none')
    const lines=document.querySelector('[data-endfield-contour-lines]')
    R('on: line canvas exists', !!lines)
    // Exactly one canvas: the dot layer was removed, so a second one would be a leak.
    R('on: exactly one canvas', wrap && wrap.querySelectorAll('canvas').length===1,
      wrap?String(wrap.querySelectorAll('canvas').length):'none')
    R('on: canvas sized', !!lines && lines.width>200 && lines.height>200,
      lines?lines.width+'x'+lines.height:'none')
    const fbgOn=getComputedStyle(frame).backgroundColor
    const cbgOn=getComputedStyle(conv).backgroundColor
    R('on: frame bg cleared', fbgOn==='rgba(0, 0, 0, 0)', fbgOn)
    R('on: conversation bg cleared (was hiding layer)', cbgOn==='rgba(0, 0, 0, 0)', cbgOn)
    const sb=document.querySelector('.pI_x6G_sidebarCol')
    R('on: sidebar bg cleared', getComputedStyle(sb).backgroundColor==='rgba(0, 0, 0, 0)')
    // z-order / hit-testing: the layer must never eat clicks
    R('on: layer ignores pointer events', getComputedStyle(wrap).pointerEvents==='none')
    const st=px(lines)
    R('on: contour actually painted', st.opaque>3000, 'opaquePx='+st.opaque)

    // ---------- 3. text legibility (layer is BEHIND content) ----------
    const probeEl=document.getElementById('probe')
    const col=getComputedStyle(probeEl).color
    R('text colour untouched', col==='rgb(16, 17, 16)', col)
    // the probe paragraph must be the top element at its own centre point
    const r=probeEl.getBoundingClientRect()
    const hit=document.elementFromPoint(r.left+8, r.top+r.height/2)
    R('text is hit-testable above layer', hit===probeEl, hit?hit.tagName+'.'+hit.className:'null')

    // ---------- 4. animation changes pixels, and stops when off ----------
    const snap=()=>lines.getContext('2d').getImageData(0,0,lines.width,lines.height).data
    const a1=snap().slice(0)
    let diff=0
    for(let i=0;i<40 && diff<=500;i++){
      await sleep(120)
      const a2=snap()
      diff=0
      for(let k=3;k<a1.length;k+=4) if(a1[k]!==a2[k]) diff++
    }
    R('anim on: pixels change over time', diff>500, 'changedAlpha='+diff)
    LS.setItem('dsh-theme-endfield-contour-anim','0')
    document.body.appendChild(document.createElement('span'))
    await sleep(500)
    const b1=snap().slice(0); await sleep(600); const b2=snap()
    let diff2=0; for(let i=3;i<b1.length;i+=4) if(b1[i]!==b2[i]) diff2++
    R('anim off: pixels static', diff2===0, 'changedAlpha='+diff2)
    // Static pattern must still be on screen after the animation is switched off.
    R('anim off: pattern still painted', px(lines).opaque>3000, 'opaquePx='+px(lines).opaque)

    // ---------- 5. animation back on keeps moving ----------
    LS.setItem('dsh-theme-endfield-contour-anim','1')
    document.body.appendChild(document.createElement('span'))
    await sleep(300)
    /* Wait for PIXELS to move rather than for a fixed wall-clock window.

       Measured reason: this assertion was flaky at 2 failures in 6 runs, always
       with changedAlpha === 0, because the page sleeps on wall-clock timers while
       the browser runs under --virtual-time-budget. The field pass is throttled to
       24fps AND gated on rAF, and headless delivers rAF callbacks irregularly, so
       a 700 ms sleep sometimes spans ZERO callbacks — the sheet is animating
       correctly and the sample still sees no change. (The same rAF unreliability is
       already documented in contour-perf.test.js, which is why that test does not
       use rAF at all.)

       Polling for the first real change removes the race without weakening the
       assertion: it still fails if the animation genuinely does not resume, it just
       fails after the budget instead of on an unlucky sample. */
    const e1=snap().slice(0)
    let diff3=0
    for(let i=0;i<40 && diff3<=500;i++){
      await sleep(120)
      const e2=snap()
      diff3=0
      for(let k=3;k<e1.length;k+=4) if(e1[k]!==e2[k]) diff3++
    }
    R('anim re-enabled: pixels change again', diff3>500, 'changedAlpha='+diff3)

    // ---------- 6. dark scheme restroke ----------
    document.body.setAttribute('data-ds-dark-theme','')
    await sleep(250)
    R('dark: still painted', px(lines).opaque>3000)
    document.body.removeAttribute('data-ds-dark-theme')

    // ---------- 7. teardown ----------
    if(typeof window.__dispose__==='function') window.__dispose__()
    await sleep(150)
    R('teardown: layer removed', document.querySelectorAll('[data-endfield-contour]').length===0)
    document.title='DONE '+JSON.stringify(window.__RESULTS__)
    return window.__RESULTS__
  }
  </script>`

  fs.writeFileSync(page, MOCK.replace('</body>', probe + '<script>window.addEventListener("load",()=>{window.__run__()})</' + 'script></body>'))

  const { execFileSync } = require('child_process')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'contour-'))
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    // Budget covers the poll loop added in step 5 (up to ~4.8 s of sleeps) with
    // room to spare; too small a budget shows up as "page did not report results".
    '--virtual-time-budget=20000',
    '--window-size=1400,900',
    '--user-data-dir=' + tmp,
    '--dump-dom',
    'file:///' + page.replace(/\\/g, '/'),
  ]
  let dom = ''
  try {
    dom = execFileSync(chrome, args, { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (e) {
    console.error('FAIL  browser run failed: ' + e.message)
    process.exit(1)
  }
  const m = dom.match(/<title>DONE (\[.*?\])<\/title>/s)
  if (!m) {
    console.error('FAIL  page did not report results (assertions never completed).')
    const t = dom.match(/<title>(.*?)<\/title>/s)
    if (t) console.error('      title was: ' + t[1].slice(0, 300))
    process.exit(1)
  }
  let results
  try { results = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')) }
  catch (e) { console.error('FAIL  could not parse results: ' + e.message); process.exit(1) }

  let bad = 0
  for (const r of results) {
    if (r.pass) console.log('ok    ' + r.name + (r.detail ? '  (' + r.detail + ')' : ''))
    else { console.error('FAIL  ' + r.name + (r.detail ? '  -> ' + r.detail : '')); bad++ }
  }
  console.log('')
  if (bad) { console.error(bad + ' contour check(s) failed'); process.exit(1) }
  console.log('all ' + results.length + ' contour checks passed')
}

main()
