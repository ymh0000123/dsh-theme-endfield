/**
 * thunder-dismiss.test.js — prove 「点击空白处直接关闭」 works AND costs nothing.
 *
 * This one has to run in a real browser. The behaviour is a hit-testing question,
 * and hit-testing is exactly what a DOM stub cannot fake: the plate is deliberately
 * `pointer-events: none` (it is a caption laid over text the user may be reading, not
 * a modal), so the dismissal is wired to a document-level pointerdown listener rather
 * than to the plate itself. Whether that arrangement really lets a click both dismiss
 * the word AND reach the control underneath can only be measured by dispatching real
 * pointer events at real coordinates.
 *
 * The four things asserted, and why each is a real failure mode:
 *   1. a press on blank space removes the word immediately (the requested feature);
 *   2. the SAME press still reaches the element underneath — the plate must not have
 *      become a 3-second full-screen click-eater, which is what putting the listener
 *      on the plate (with pointer-events: auto) would have produced;
 *   3. a press on an actual button both dismisses the word and activates the button;
 *   4. dismissal releases the timer and the listener, and a later press does not
 *      throw or double-remove.
 *
 * Usage: node test/thunder-dismiss.test.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')
const { BROWSER_SETTINGS_SCOPE_SNIPPET } = require(path.join(__dirname, 'fixtures', 'settings-scope.browser.js'))

const ROOT = path.resolve(__dirname, '..')

const chrome = [process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean).find((p) => fs.existsSync(p))
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-dismiss-'))
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(TMP, 'client.js'))
const page = path.join(TMP, 'mock.html')

fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden}
  body{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-bg-layer-1:#f2f2ec;
       --dsw-alias-label-primary:#101110;--dsw-alias-border-l1:#d8d9d5;
       --dsw-alias-border-l2:#b6b8b3;--dsw-font-family:Arial,sans-serif;
       background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
       font-family:var(--dsw-font-family)}
  /* A control the dismissing click must still be able to reach. It sits at a known
     spot so the test can aim at it by coordinate. */
  #target{position:fixed;left:40px;top:40px;width:160px;height:44px}
  /* Blank space, deliberately empty, at the opposite corner. */
  #blank{position:fixed;right:40px;bottom:40px;width:160px;height:44px}
</style></head><body>
<button id="target">真实按钮</button>
<div id="blank"></div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
window.__R__=[]
const R=(name,pass,detail)=>window.__R__.push({name,pass:!!pass,detail:detail===undefined?'':String(detail)})

/* Count capture-phase pointerdown listeners on document. A leaked listener is
   invisible through the DOM — every stray copy just calls the same idempotent
   destroy — so the only way to see it is to account for attach/detach pairs. */
let pdAttached=0, pdDetached=0
const realAdd=document.addEventListener.bind(document)
const realRemove=document.removeEventListener.bind(document)
document.addEventListener=(type,fn,opts)=>{
  if(type==='pointerdown') pdAttached++
  return realAdd(type,fn,opts)
}
document.removeEventListener=(type,fn,opts)=>{
  if(type==='pointerdown') pdDetached++
  return realRemove(type,fn,opts)
}

/* Theme reads switches via the settingsScope seam (not localStorage). Enable
   theme + thunder; keep loader/contour/watermark off. */
${BROWSER_SETTINGS_SCOPE_SNIPPET}
var __prefs=__endfieldSettingsScope({ enabled:'1', thunder:'1', loader:'0', contour:'0', watermark:'0' })

const mkObs=(init)=>{let s=init;const subs=new Set();return{
  getSnapshot:()=>s,subscribe:(f)=>{subs.add(f);return()=>subs.delete(f)},
  set(n){s=n;[...subs].forEach(f=>f())}}}
const session=mkObs({running:false})
const list=mkObs({current:'s1'})
const sessions={list,binding:(id)=>id==='s1'?{sessionId:id,session}:undefined}

const mod=window.__MOD__.factory(()=>null)
mod.apply({get:(n)=>n==='theme'?{overrideTokens:()=>()=>{}}:(n==='sessions'?sessions:(n==='settingsScope'?__prefs.binder:undefined)),effect:()=>{}})

const plate=()=>document.querySelector('[data-endfield-thunder]')
const word=()=>{const p=plate();const w=p&&p.querySelector('[data-endfield-thunder-word]');return w?w.textContent:null}

/* Dispatch a real pointerdown+mousedown+mouseup+click at a point, the way a browser
   sequences a press, and report which element was actually on top there. */
const pressAt=(x,y)=>{
  const hit=document.elementFromPoint(x,y)
  const opts={bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,
    pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:1}
  hit.dispatchEvent(new PointerEvent('pointerdown',opts))
  hit.dispatchEvent(new MouseEvent('mousedown',opts))
  hit.dispatchEvent(new PointerEvent('pointerup',{...opts,buttons:0}))
  hit.dispatchEvent(new MouseEvent('mouseup',{...opts,buttons:0}))
  hit.dispatchEvent(new MouseEvent('click',{...opts,buttons:0}))
  return hit
}

const blank=document.getElementById('blank')
const target=document.getElementById('target')
let targetClicks=0
target.addEventListener('click',()=>{targetClicks++})
let blankClicks=0
blank.addEventListener('click',()=>{blankClicks++})

const bRect=blank.getBoundingClientRect()
const tRect=target.getBoundingClientRect()
const bx=Math.round(bRect.left+bRect.width/2), by=Math.round(bRect.top+bRect.height/2)
const tx=Math.round(tRect.left+tRect.width/2), ty=Math.round(tRect.top+tRect.height/2)

/* --- 1. the plate must NOT be the hit-test winner while it is up --- */
session.set({running:true})
R('播报后大字在屏幕上', word()==='任务开始', word())
const topWhileUp=document.elementFromPoint(bx,by)
R('大字不参与命中测试（空白处顶层仍是页面元素）',
  topWhileUp===blank, topWhileUp?(topWhileUp.id||topWhileUp.tagName):'null')
const topOverBtn=document.elementFromPoint(tx,ty)
R('大字覆盖下的按钮仍可命中', topOverBtn===target, topOverBtn?(topOverBtn.id||topOverBtn.tagName):'null')

/* --- 2. pressing blank space dismisses it, and the press still lands --- */
const hitBlank=pressAt(bx,by)
R('点击空白处后大字立即消失', word()===null, word())
R('这一次点击本身仍然到达空白元素', blankClicks===1 && hitBlank===blank,
  'blankClicks='+blankClicks)

/* --- 3. pressing a real control dismisses AND activates it --- */
session.set({running:false})
R('再次播报（任务完成）', word()==='任务完成', word())
pressAt(tx,ty)
R('点击按钮同时关闭大字', word()===null, word())
R('按钮的点击事件照常触发（大字没有吞掉它）', targetClicks===1, 'targetClicks='+targetClicks)

/* --- 4. after dismissal: no stray listener, no throw, no resurrection --- */
let threw=null
try{ pressAt(bx,by); pressAt(tx,ty) }catch(e){ threw=e.message }
R('关闭后再次点击不报错', threw===null, threw===null?'':threw)
R('关闭后大字没有复活', word()===null, word())
R('关闭后按钮仍然可用', targetClicks===2, 'targetClicks='+targetClicks)

/* --- 4b. an app handler that stops propagation must not make the word
       undismissable. Real UIs do this on menus, dropdowns and drag handles, and a
       bubble-phase listener would simply never hear those presses. The theme listens
       in the CAPTURE phase, so it sees the event on the way down, before any such
       handler can stop it. --- */
const greedy=document.createElement('button')
greedy.id='greedy'
greedy.textContent='吞事件的控件'
greedy.style.cssText='position:fixed;left:40px;bottom:40px;width:180px;height:44px'
let greedyPresses=0
greedy.addEventListener('pointerdown',(e)=>{greedyPresses++;e.stopPropagation()})
document.body.appendChild(greedy)
const gRect=greedy.getBoundingClientRect()
const gx=Math.round(gRect.left+gRect.width/2), gy=Math.round(gRect.top+gRect.height/2)

session.set({running:true})
R('播报（用于 stopPropagation 场景）', word()==='任务开始', word())
pressAt(gx,gy)
R('控件调用 stopPropagation 时大字仍能关闭（捕获阶段监听）', word()===null, word())
R('该控件自己的处理器照常收到事件', greedyPresses===1, 'greedyPresses='+greedyPresses)

/* --- 5. the early dismissal must CANCEL the 3s timer.
       Getting this observable took two tries. Dismissing and immediately re-announcing
       proves nothing: both plates' deadlines then land on the same instant, so a
       leaked timer from plate #1 destroys plate #2 exactly when plate #2 was going to
       expire anyway. The deadlines must be SEPARATED. So: dismiss at t≈0, wait 1.5s,
       announce again (its own deadline is now t≈4.5s), then sample at t≈3.2s — the
       moment plate #1's cancelled timer would have fired. A surviving timer wipes
       plate #2 there, 1.3s early. --- */
session.set({running:true})
pressAt(bx,by)
R('提前关闭后大字已消失', word()===null, word())
setTimeout(()=>{
  session.set({running:false})
  window.__re__=word()
},1500)
setTimeout(()=>{
  /* t≈3.2s: plate #1's original deadline passed ~200ms ago; plate #2 is only 1.7s
     into its own 3s hold, so it MUST still be on screen. */
  R('提前关闭不会让残留定时器误删后续大字',
    window.__re__==='任务完成' && word()==='任务完成',
    're='+window.__re__+' atOldDeadline='+word())

  /* --- 6. listener accounting: every armed listener must have been released.
       Attach/detach counts are the only observable evidence of a leak — a stray copy
       just calls the same idempotent destroy, so the DOM looks identical.

       Plate #2 is deliberately still on screen at this point (that is what the timer
       check above measures), and a LIVE plate is supposed to hold exactly one armed
       listener. So the balance is attached − detached === 1 here; dismissing it must
       then bring the books level. */
  const liveDelta=pdAttached-pdDetached
  R('在显示中的大字恰好持有 1 个监听',
    pdAttached>0 && liveDelta===1, 'attached='+pdAttached+' detached='+pdDetached)
  pressAt(bx,by)
  R('关闭后监听全部释放（无泄漏）',
    word()===null && pdAttached===pdDetached, 'attached='+pdAttached+' detached='+pdDetached)

  document.title='DONE '+JSON.stringify(window.__R__)
},3200)
</script></body></html>`)

let out = ''
try {
  out = execFileSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox',
    '--window-size=1280,720', '--virtual-time-budget=9000', '--dump-dom',
    'file:///' + page.replace(/\\/g, '/')],
    { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120000 })
} catch (e) {
  console.error('FAIL  chrome failed: ' + String(e.message).slice(0, 300))
  process.exit(1)
}

const m = out.match(/<title>DONE ([\s\S]*?)<\/title>/)
if (!m) {
  console.error('FAIL  page produced no results')
  const t = out.match(/<title>([\s\S]*?)<\/title>/)
  if (t) console.error('      title was: ' + t[1].slice(0, 300))
  process.exit(1)
}
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'")
const results = JSON.parse(dec(m[1]))

let failures = 0
for (const r of results) {
  if (r.pass) console.log('ok    ' + r.name + (r.detail ? '  [' + r.detail + ']' : ''))
  else { console.error('FAIL  ' + r.name + (r.detail ? '  [' + r.detail + ']' : '')); failures++ }
}
console.log('')
if (failures) { console.error(failures + ' dismiss check(s) failed'); process.exit(1) }
console.log('all click-to-dismiss checks passed (' + results.length + ' assertions)')
