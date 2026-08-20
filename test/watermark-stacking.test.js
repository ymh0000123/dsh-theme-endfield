/**
 * watermark-stacking.test.js — prove the ENDFIELD watermark paints BEHIND the
 * app's own UI, and that its dark-mode ink is faint enough not to clutter.
 *
 * ── The bug, measured from a real screenshot of the live app ──────────────────
 * The model-select dropdown fill is #2c2e2a; the watermark ink is
 * --dsw-alias-label-primary (#f5f5f0) at alpha 0.13. Compositing those gives
 * exactly #464844 — and 11002 px of #464844 were found INSIDE the dropdown's
 * bounding box. The wordmark was painting on top of an opaque popover.
 *
 * ── Why it happened (a screenshot cannot tell you this) ──────────────────────
 * .wSkVaW_composerHero is `position:relative; z-index:1`, so it IS a stacking
 * context and the dropdown's own `z-index:20` is trapped inside it. The hero
 * watermark was a <body> child at `z-index:1` — the SAME level in the root
 * stacking context. A z-index tie is broken by DOM order and the watermark is
 * appended last, so it won every tie against the whole composer subtree.
 *
 * ── Why this test compares PIXELS and not elementsFromPoint ──────────────────
 * The first version of this file hit-tested with document.elementsFromPoint().
 * That can NEVER work here: the watermark sets `pointer-events:none !important`,
 * so it is structurally invisible to hit-testing and the check reported "ok"
 * for a build that was provably broken. Two screenshots are ground truth
 * instead: the dropdown is opaque, so if the mark is correctly behind it, every
 * pixel inside the dropdown must be BIT-IDENTICAL with the mark on and off.
 *
 * Three assertions, because "behind the menu" is trivially satisfied by drawing
 * nothing at all:
 *   1. The wordmark and the dropdown genuinely OVERLAP (else 2 is vacuous).
 *   2. ZERO changed pixels inside the dropbox box.
 *   3. The mark is still VISIBLE outside it, and its contrast against the page
 *      background stays inside the intended faint band.
 *
 * Usage: node test/watermark-stacking.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const OUT = process.env.ENDFIELD_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-stack-'))
const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p))
if (!chrome) { console.error('no chrome/edge found'); process.exit(1) }

const W = 1440
const H = 900
/* Both colour schemes are checked. The reported complaint was dark mode, and the
   two schemes now carry DIFFERENT alphas, so testing only one would leave the
   other free to regress. */
const DARK = process.env.ENDFIELD_SCHEME !== 'light'

/* Mock of the real hero page. Every class name, z-index and opaque fill below is
   copied from the installed @deepseek-ai bundles, because the bug is purely a
   stacking-order fact: weaken the mock and it stops reproducing.

   `alpha` selects the run. Both runs BUILD THE WATERMARK IDENTICALLY and differ
   only in its opacity ('' = themed value, '0' = invisible). Toggling the feature
   instead would change the DOM between renders, and that is not hypothetical: an
   earlier version of this test did exactly that and produced a 148/255 pixel
   delta from text shifting between the two runs, plus a dropdown box that moved
   74px. Same DOM + same layout means any surviving pixel difference is the mark's
   own ink and nothing else. */
const mk = (alpha) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  :root{
    --dsw-alias-bg-base:${DARK ? '#101110' : '#e8e8e2'};
    --dsw-alias-bg-layer-1:${DARK ? '#181a18' : '#f2f2ec'};
    --dsw-alias-bg-layer-3:${DARK ? '#2c2e2a' : '#dcddd6'};
    --dsw-specific-menu:var(--dsw-alias-bg-layer-3);
    --dsw-alias-label-primary:${DARK ? '#f5f5f0' : '#101110'};
    --dsw-alias-label-secondary:${DARK ? '#898d89' : '#4a4c48'};
    --dsw-specific-sidebar-fill:${DARK ? '#101110' : '#e8e8e2'};
    --dsw-alias-border-l1:${DARK ? '#343633' : '#d8d9d5'};
    --dsw-alias-border-inverted:${DARK ? '#4a4d49' : '#b6b8b3'};
    --dsw-font-family:Arial,sans-serif;
    --dsh-composer-card-max-width:780px; --dsh-composer-side-clearance:16px;
  }
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
       font-family:Arial,sans-serif}
  /* the layout frame: position:relative, NO stacking context (z-index:auto) */
  .pI_x6G_frame{background:var(--dsw-alias-bg-base);height:100%;display:grid;
    grid-template-columns:248px 1fr;grid-template-rows:100%;
    position:relative;overflow:hidden}
  .pI_x6G_sidebarCol{background:var(--dsw-specific-sidebar-fill);
    border-right:1px solid var(--dsw-alias-border-l1)}
  .pI_x6G_centerCol{display:flex;flex-direction:column;min-width:0;overflow:hidden}
  .wSkVaW_root{background:var(--dsw-alias-bg-base);display:flex;
    flex-direction:column;height:100%;min-width:0}
  .wSkVaW_scrollBody{flex:1;display:flex;flex-direction:column;
    justify-content:center;min-height:0;overflow-y:auto}
  .wSkVaW_viewArea{flex:1 0 auto;display:flex;flex-direction:column;
    justify-content:center}
  /* THE stacking context that traps the dropdown's z-index:20 */
  .wSkVaW_composerStack{display:flex;flex-direction:column;gap:6px}
  .wSkVaW_composerHero{width:min(calc(var(--dsh-composer-card-max-width) + 2 *
    var(--dsh-composer-side-clearance)),100%);z-index:1;align-self:center;
    gap:8px;padding-bottom:32px;position:relative}
  .pXSMma_root{display:flex;justify-content:center;align-items:center;
    min-width:0;padding:0 24px}
  .pXSMma_stack{width:100%;max-width:var(--dsh-composer-card-max-width);
    display:flex;flex-direction:column;gap:12px}
  .pXSMma_headline{color:var(--dsw-alias-label-primary);display:grid;
    grid-template-columns:34px auto auto;justify-content:center;
    align-items:center;column-gap:10px;font-size:26px;font-weight:500;
    line-height:32px}
  .composer{border:1px solid var(--dsw-alias-border-l1);
    background:var(--dsw-alias-bg-layer-1);padding:14px;font-size:14px;
    color:var(--dsw-alias-label-secondary);position:relative;margin-top:120px}
  ._7KE1Ra_root{min-width:0;position:relative}
  /* the model-select dropdown: z-index 20, but scoped inside composerHero */
  ._7KE1Ra_menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);
    background:var(--dsw-specific-menu);width:min(240px,100vw - 32px);
    max-height:min(360px,100vh - 96px);
    display:flex;flex-direction:column;padding:4px;position:absolute;
    bottom:calc(100% + 8px);right:0;overflow:hidden}
  ._7KE1Ra_group{padding:6px 10px;font-size:11px;letter-spacing:.06em;
    text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
  ._7KE1Ra_row{padding:7px 10px;font-size:13px;
    color:var(--dsw-alias-label-primary)}
</style></head><body><div id="root">
  <div class="pI_x6G_frame">
    <div class="pI_x6G_sidebarCol"></div>
    <div class="pI_x6G_centerCol"><div class="wSkVaW_root" data-phase="hero">
      <div class="wSkVaW_scrollBody"><div class="wSkVaW_viewArea">
        <div class="wSkVaW_composerStack wSkVaW_composerHero">
          <div class="pXSMma_root"><div class="pXSMma_stack">
            <div class="pXSMma_headline">探索未至之境</div>
          </div></div>
          <div class="composer">Message DeepSeek Harness…
            <div class="_7KE1Ra_root"><div class="_7KE1Ra_menu">
              <div class="_7KE1Ra_group">DeepSeek</div>
              <div class="_7KE1Ra_row">DeepSeek-V4-Flash</div>
              <div class="_7KE1Ra_row">DeepSeek-V4-Pro</div>
              <div class="_7KE1Ra_group">agentrouter</div>
              <div class="_7KE1Ra_row">gpt-5.6-sol</div>
              <div class="_7KE1Ra_group">agentrouter</div>
              <div class="_7KE1Ra_row">claude-opus-4-8</div>
              <div class="_7KE1Ra_row">claude-opus-5</div>
              <div class="_7KE1Ra_group">xiaomi</div>
              <div class="_7KE1Ra_row">MiMo-V2-Flash</div>
            </div></div>
          </div>
        </div>
      </div></div>
    </div></div>
  </div></div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
  ${DARK ? "document.body.setAttribute('data-ds-dark-theme','')" : ''}
  const LS=localStorage
  LS.setItem('dsh-theme-endfield-enabled','1')
  LS.setItem('dsh-theme-endfield-loader','0')
  LS.setItem('dsh-theme-endfield-contour','0')
  LS.setItem('dsh-theme-endfield-watermark','1')
  const mod=window.__MOD__.factory(()=>null)
  mod.apply({get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:undefined,effect:(f)=>f()})
  document.body.appendChild(document.createElement('span'))
  /* Hide the mark by ALPHA ONLY, after it has mounted. The element, its box and
     every other node stay exactly as in the visible run, so the two screenshots
     are layout-identical by construction. */
  const HIDE=${JSON.stringify(alpha === '0')}
  setTimeout(()=>{
    if(HIDE){
      const s=document.createElement('style')
      s.textContent='[data-endfield-watermark]{opacity:0 !important}'
      document.head.appendChild(s)
    }
  },250)
  // Report geometry so the pixel comparison knows exactly where to look.
  setTimeout(()=>{
    const wm=document.querySelector('[data-endfield-watermark]')
    const menu=document.querySelector('._7KE1Ra_menu')
    const mb=menu.getBoundingClientRect()
    const out={
      mounted: wm!==null,
      mode: wm?wm.getAttribute('data-endfield-watermark'):null,
      parent: wm&&wm.parentNode===document.body?'body':(wm?String(wm.parentNode.className):null),
      zIndex: wm?getComputedStyle(wm).zIndex:null,
      opacity: wm?getComputedStyle(wm).opacity:null,
      color: wm?getComputedStyle(wm).color:null,
      menuBox:{x:Math.round(mb.left),y:Math.round(mb.top),
               w:Math.round(mb.width),h:Math.round(mb.height)}
    }
    /* The GLYPH box, not the element box. The watermark element is a full-width
       flex container whose own rect overlaps nearly everything and therefore
       proves nothing; what can actually cover the dropdown is the painted text
       of the ::before. Measured with the very same font. */
    if(wm){
      const eb=wm.getBoundingClientRect()
      const cs=getComputedStyle(wm,'::before')
      const fs2=parseFloat(cs.fontSize)||parseFloat(getComputedStyle(wm).fontSize)
      const word=String(cs.content||'').replace(/^["']|["']$/g,'')
      const cv=document.createElement('canvas').getContext('2d')
      cv.font=(cs.fontWeight||'900')+' '+fs2+'px '+(cs.fontFamily||'Arial')
      const ls=parseFloat(cs.letterSpacing)||0
      const tw=cv.measureText(word).width+ls*Math.max(0,word.length-1)
      const cxx=eb.left+eb.width/2, cyy=eb.top+eb.height/2
      // Arial-900 cap height is ~0.72em; the ink band is that tall, centred.
      const gb={left:cxx-tw/2,right:cxx+tw/2,top:cyy-fs2*0.36,bottom:cyy+fs2*0.36}
      out.glyphBox={x:Math.round(gb.left),y:Math.round(gb.top),
                    w:Math.round(gb.right-gb.left),h:Math.round(gb.bottom-gb.top)}
      const ox=Math.max(0,Math.min(gb.right,mb.right)-Math.max(gb.left,mb.left))
      const oy=Math.max(0,Math.min(gb.bottom,mb.bottom)-Math.max(gb.top,mb.top))
      out.overlapPx=Math.round(ox*oy)
    }
    document.title='STACK '+JSON.stringify(out)
  },700)
</script></body></html>`

fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))

const run = (alpha, shot) => {
  const page = path.join(OUT, 'stack-' + (alpha === '0' ? 'off' : 'on') + '.html')
  fs.writeFileSync(page, mk(alpha))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'stk-'))
  const args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--virtual-time-budget=5000',
    '--window-size=' + W + ',' + H, '--user-data-dir=' + tmp,
  ]
  if (shot) args.push('--screenshot=' + shot)
  else args.push('--dump-dom')
  const o = execFileSync(chrome, args.concat(['file:///' + page.replace(/\\/g, '/')]),
    { encoding: 'utf8', timeout: 120000, stdio: ['ignore', shot ? 'ignore' : 'pipe', 'ignore'] })
  return o
}

// 1) geometry, read from the SAME page the screenshots come from
const dom = run('', null)
const m = dom.match(/<title>STACK (.*?)<\/title>/s)
if (!m) { console.error('no geometry report -- the page did not run'); process.exit(1) }
const g = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))

// 2) two renders that differ ONLY in the mark's alpha
const shotOn = path.join(OUT, 'on.png')
const shotOff = path.join(OUT, 'off.png')
run('', shotOn)
run('0', shotOff)

/* Compare the two PNGs. Decoding happens in headless Chrome itself so this test
   needs no image dependency: both files are drawn to a canvas and read back. */
const cmpPage = path.join(OUT, 'cmp.html')
fs.writeFileSync(cmpPage, `<!doctype html><meta charset="utf-8"><body><script>
const FILL=${JSON.stringify(DARK ? [44, 46, 42] : [220, 221, 214])}
const load=(u)=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=u})
Promise.all([load('on.png'),load('off.png')]).then(([a,b])=>{
  const W=a.width,H=a.height
  const ca=document.createElement('canvas');ca.width=W;ca.height=H
  const cb=document.createElement('canvas');cb.width=W;cb.height=H
  ca.getContext('2d').drawImage(a,0,0);cb.getContext('2d').drawImage(b,0,0)
  const da=ca.getContext('2d').getImageData(0,0,W,H).data
  const db=cb.getContext('2d').getImageData(0,0,W,H).data
  const out={dims:[W,H,b.width,b.height]}
  /* Locate the dropdown FROM THE PIXELS of the watermark-off render, by its own
     opaque fill, instead of trusting a reported rect. A rect measured in a
     different browser run can be stale (that happened: it was 74px off), which
     would silently move the assertion window off the actual popover. */
  let minX=1e9,minY=1e9,maxX=-1,maxY=-1,fill=0
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=(y*W+x)*4
    if(db[i]===FILL[0]&&db[i+1]===FILL[1]&&db[i+2]===FILL[2]){fill++
      if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}
  }
  out.fillPx=fill
  out.box=fill?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:null
  if(!out.box){document.title='CMP '+JSON.stringify(out);return}
  // Inset past the 1px border so its antialiasing is not counted as leakage.
  const x0=minX+2,y0=minY+2,x1=maxX-1,y1=maxY-1
  let inBox=0,inBoxMax=0,outBox=0,outMax=0
  const samples=[]
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=(y*W+x)*4
    const d=Math.max(Math.abs(da[i]-db[i]),Math.abs(da[i+1]-db[i+1]),Math.abs(da[i+2]-db[i+2]))
    if(d<=1) continue
    if(x>=x0&&x<x1&&y>=y0&&y<y1){ inBox++; if(d>inBoxMax){inBoxMax=d}
      if(samples.length<4) samples.push({x,y,d,
        on:[da[i],da[i+1],da[i+2]],off:[db[i],db[i+1],db[i+2]]}) }
    else { outBox++; if(d>outMax) outMax=d }
  }
  out.inBox=inBox;out.inBoxMax=inBoxMax;out.outBox=outBox;out.outMax=outMax
  out.samples=samples
  /* Overlap recomputed against the PIXEL-FOUND dropdown box, and measured from
     the mark's REAL INK rather than a font-metric estimate.

     Both corrections are from observed failures, not caution:
       - the DOM-reported menu rect came from a separate browser run and landed
         74px from where the popover actually rendered;
       - the glyph band estimated from font metrics spans the full element width,
         so intersecting it with the menu counted rows of empty leading/trailing
         space as "overlap" and reported 1984px while the negative control proved
         9945px of ink genuinely fell inside the menu.
     Real ink is simply every pixel the mark changed, so the overlap is the count
     of changed pixels within the menu's own columns and rows -- taken from the
     LEAK-FREE render is impossible (there is none), so it is computed on the
     union: changed pixels inside the box, plus, when the fix works, the ink that
     WOULD land there, obtained from the mark's vertical ink band. */
  let inkMinY=1e9,inkMaxY=-1,inkMinX=1e9,inkMaxX=-1
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=(y*W+x)*4
    const d=Math.max(Math.abs(da[i]-db[i]),Math.abs(da[i+1]-db[i+1]),Math.abs(da[i+2]-db[i+2]))
    if(d<=1) continue
    if(y<inkMinY)inkMinY=y; if(y>inkMaxY)inkMaxY=y
    if(x<inkMinX)inkMinX=x; if(x>inkMaxX)inkMaxX=x
  }
  out.inkBand=inkMaxY>=0?{x:inkMinX,y:inkMinY,w:inkMaxX-inkMinX+1,h:inkMaxY-inkMinY+1}:null
  if(out.inkBand){
    const ox=Math.max(0,Math.min(inkMaxX+1,maxX+1)-Math.max(inkMinX,minX))
    const oy=Math.max(0,Math.min(inkMaxY+1,maxY+1)-Math.max(inkMinY,minY))
    out.overlapPx=Math.round(ox*oy)
  }
  /* Contrast of the mark's ink against ITS OWN background, sampled outside the
     dropdown. Taken at the MOST-CHANGED pixel, which is the middle of a glyph
     stroke rather than an antialiased edge. */
  const lum=(c)=>{const f=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)})
    return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2]}
  let ink=null,bg=null,best=0
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(x>=minX&&x<=maxX&&y>=minY&&y<=maxY) continue
    const i=(y*W+x)*4
    const d=Math.max(Math.abs(da[i]-db[i]),Math.abs(da[i+1]-db[i+1]),Math.abs(da[i+2]-db[i+2]))
    if(d>best){best=d;ink=[da[i],da[i+1],da[i+2]];bg=[db[i],db[i+1],db[i+2]]}
  }
  if(ink&&bg){const L1=lum(ink),L2=lum(bg)
    out.ink=ink;out.bg=bg
    out.ratio=+(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05))).toFixed(3)}
  document.title='CMP '+JSON.stringify(out)
})
</script></body>`)
const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-'))
const cmpDom = execFileSync(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--allow-file-access-from-files', '--virtual-time-budget=8000',
  '--user-data-dir=' + tmp2, '--dump-dom',
  'file:///' + cmpPage.replace(/\\/g, '/'),
], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'ignore'] })
const cm = cmpDom.match(/<title>CMP (.*?)<\/title>/s)
if (!cm) { console.error('pixel comparison did not report'); process.exit(1) }
const c = JSON.parse(cm[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))

let failures = 0
const scheme = DARK ? 'dark' : 'light'
const fail = (s) => { console.error('FAIL  ' + s); failures++ }
const pass = (s) => console.log('ok    ' + s)

console.log('=== colour scheme: ' + scheme + ' ===')
console.log('watermark: mode=' + g.mode + ' parent=' + g.parent
  + ' z-index=' + g.zIndex + ' opacity=' + g.opacity + ' color=' + g.color)
console.log('menu box (reported by DOM) : ' + JSON.stringify(g.menuBox))
console.log('menu box (found in pixels) : ' + JSON.stringify(c.box)
  + '  fill=' + c.fillPx + 'px')
console.log('glyph box (font metrics)   : ' + JSON.stringify(g.glyphBox))
console.log('ink band  (real pixels)    : ' + JSON.stringify(c.inkBand))
console.log('ink/menu overlap: ' + c.overlapPx + ' px^2')
console.log('')
console.log('pixels changed by the watermark:')
console.log('  inside the dropdown : ' + c.inBox + '  (max delta ' + c.inBoxMax + ')')
console.log('  elsewhere           : ' + c.outBox + '  (max delta ' + c.outMax + ')')
if (c.ink) {
  console.log('  ink ' + JSON.stringify(c.ink) + ' over bg ' + JSON.stringify(c.bg)
    + '  contrast ' + c.ratio + ':1')
}
if (c.samples && c.samples.length) {
  console.log('  leak samples: ' + c.samples.map((s) =>
    '(' + s.x + ',' + s.y + ') on=' + s.on.join(',') + ' off=' + s.off.join(',')).join('  '))
}
console.log('')

if (!g.mounted) fail('watermark never mounted -- the mock does not reproduce the page')
else pass('watermark mounted in ' + g.mode + ' mode')

// The comparison window must be the real popover, found in the pixels.
if (!c.box || c.fillPx < 20000) {
  fail('could not locate the dropdown fill in the render (' + c.fillPx + ' px)'
    + '\n      -> the assertion window is unknown; do not trust this run')
} else {
  pass('dropdown located in the pixels: ' + c.fillPx + ' px of opaque fill')
}

/* GUARD AGAINST A VACUOUS PASS. Without real overlap the leakage assertion
   proves nothing and would report ok for a completely broken build. */
if (!c.overlapPx || c.overlapPx < 5000) {
  fail('the wordmark does not overlap the dropdown in this mock ('
    + c.overlapPx + ' px^2)\n      -> the leakage assertion would be vacuous;'
    + ' fix the mock geometry rather than trusting this run')
} else {
  pass('wordmark and dropdown genuinely overlap (' + c.overlapPx
    + ' px^2) -- the next assertion is meaningful')

  if (c.inBox > 0) {
    fail(c.inBox + ' px inside the opaque dropdown change when the watermark is'
      + ' enabled (max delta ' + c.inBoxMax + ')'
      + '\n      -> the wordmark is painting ON TOP of the popover')
  } else {
    pass('not one pixel inside the dropdown changes -- the mark is strictly behind it')
  }
}

// The mark must still be VISIBLE, or "behind everything" was achieved by
// drawing nothing at all.
if (c.outBox < 2000) {
  fail('the watermark only changes ' + c.outBox + ' px outside the dropdown'
    + '\n      -> it is effectively invisible; it must still clear the frame fill')
} else {
  pass('the mark still paints ' + c.outBox + ' px elsewhere (visible, not erased)')
}

/* Legibility band. The mark is decoration behind content: too strong and it
   clutters the UI (the reported complaint), too weak and the feature is
   pointless. Contrast states that independently of the scheme's own colours.
   The ceiling is per-scheme because adding luminance to a near-black page reads
   louder than subtracting it from cream at the same ratio -- which is exactly
   why dark mode carries the lower alpha. */
const CEIL = DARK ? 1.32 : 1.40
if (c.ratio !== null && c.ratio !== undefined) {
  if (c.ratio > CEIL) {
    fail(scheme + '-mode watermark contrast is ' + c.ratio + ':1 -- too strong'
      + ' (ceiling ' + CEIL + ':1); it visually competes with the UI')
  } else if (c.ratio < 1.06) {
    fail(scheme + '-mode watermark contrast is ' + c.ratio + ':1 -- under the'
      + ' perceptual floor, the mark reads as absent')
  } else {
    pass(scheme + '-mode ink contrast ' + c.ratio + ':1 sits in the faint band'
      + ' (1.06-' + CEIL + ')')
  }
}

console.log('')
if (failures) { console.error(failures + ' check(s) failed'); process.exit(1) }
console.log('all checks passed')
