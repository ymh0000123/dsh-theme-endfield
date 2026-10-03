// Browser tests only. Node 22+ supplies WebSocket/fetch; no runtime dependency.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawn } = require('node:child_process')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// A test process that dies between launch and close (timeout kill, crash) would
// otherwise leave a headless Chrome holding an isolated profile. One module-level
// hook reaps every live child at exit; close() is still the polite path.
const liveChildren = new Set()
process.on('exit', () => { for (const c of liveChildren) { try { c.kill() } catch {} } })
async function launch() {
  const chrome = [process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p))
  if (!chrome) throw new Error('Set CHROME_PATH to a Chrome/Edge executable')
  if (typeof WebSocket !== 'function') throw new Error('Browser tests require Node 22+')
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'endfield-cdp-'))
  const child=spawn(chrome,['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore'})
  liveChildren.add(child)
  let startupError=null
  child.on('error',e=>{startupError=e})
  let ws,seq=0
  const pending=new Map(),errors=[]
  async function close(){
    if(ws?.readyState===WebSocket.OPEN) { try { await send('Browser.close') } catch {} }
    ws?.close();child.kill();liveChildren.delete(child)
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Browser closed'))}
    pending.clear()
    // Chromium may still be releasing files on Windows; leave only this isolated
    // temp profile if removal is busy. It contains fixture data, never real login.
    try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100})}catch{}
  }
  function send(method,params={}) {
    const id=++seq
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'))},10000)
      pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}))
    })
  }
  try {
    const portFile=path.join(profile,'DevToolsActivePort')
    for(let i=0;!fs.existsSync(portFile)&&i<150;i++){if(startupError)throw startupError;await sleep(100)}
    if(!fs.existsSync(portFile))throw Error('Chrome startup timed out')
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0]
    const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(5000)})).json()
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})})
    ws.addEventListener('message',event=>{
      const m=JSON.parse(event.data)
      if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}
      if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+(m.params.exceptionDetails.exception?.description||''))
    })
    await send('Runtime.enable');await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride',{width:1200,height:800,deviceScaleFactor:1.5,mobile:false})
    const evaluate=async expression=>{
      const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
      if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
      return r.result.value
    }
    return {send,evaluate,errors,close,sleep,async until(expression){
      for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(100)}
      throw Error('Condition timed out: '+expression)
    }}
  }catch(error){await close();throw error}
}
const HTML=`<!doctype html><html><head><style>
html,body{height:100%;margin:0}body{--dsw-alias-bg-base:#e8e8e2;--dsw-alias-bg-layer-1:#f2f2ec;
--dsw-alias-label-primary:#101110;--dsw-alias-border-l1:#ccc;--dsw-alias-border-l2:#aaa}
body[data-ds-dark-theme]{--dsw-alias-bg-base:#101110;--dsw-alias-bg-layer-1:#181a17;--dsw-alias-label-primary:#f5f5f0}
.app_frame{position:relative;display:grid;grid-template-columns:220px 1fr;height:100%;background:var(--dsw-alias-bg-base)}
.app_centerCol,.app_sidebarCol{position:relative}.wSkVaW_root{height:100%}.test_tableScroll{margin:60px 30px}
td{padding:12px}[data-composer-card]{position:absolute;bottom:30px;left:260px;width:550px;height:90px;background:#eee}
[data-sidebar-right-panel]{position:absolute;right:0;top:0;width:120px;height:100%;background:#eee}
</style></head><body><div class="app_frame"><div class="app_sidebarCol" data-slot="sidebar"><div>Sidebar</div></div>
<div class="app_centerCol"><div class="wSkVaW_root"><table class="test_tableScroll"><tbody><tr><td id="cell">Selected text inside a hovered row</td></tr></tbody></table></div></div>
<div data-composer-card>Composer</div><div data-sidebar-right-panel="push" data-sidebar-right-open><div data-dockkit-host="dock">Docked panel</div></div></body></html>`
async function boot(browser,root,values={},prefix='') {
  await browser.send('Page.navigate',{url:'data:text/html,'+encodeURIComponent(HTML)})
  await browser.until('document.querySelector("#cell") !== null')
  await browser.evaluate(prefix+'\nwindow.__ModuleLoader__={load:m=>{window.__MOD__=m}}')
  await browser.evaluate(fs.readFileSync(path.join(root,'client.js'),'utf8'))
  const {BROWSER_SETTINGS_SCOPE_SNIPPET}=require(path.join(root,'test/fixtures/settings-scope.browser.js'))
  await browser.evaluate(BROWSER_SETTINGS_SCOPE_SNIPPET+`\nwindow.__prefs=__endfieldSettingsScope(${JSON.stringify({enabled:'1',loader:'0',watermark:'0',...values})});
    window.__disposers=[];window.__MOD__.factory(()=>null).apply({
      get:n=>n==='settingsScope'?__prefs.binder:n==='theme'?{overrideTokens:()=>()=>{}}:undefined,
      effect:f=>{const d=f();if(typeof d==='function')__disposers.push(d);return d}
    })`)
}
module.exports={launch,boot}
