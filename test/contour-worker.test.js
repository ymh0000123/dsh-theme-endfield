const assert=require('node:assert/strict'),path=require('node:path')
const {launch,boot}=require('./fixtures/chrome-cdp.js')
const root=path.resolve(__dirname,'..')
;(async()=>{
 const browser=await launch()
 try {
  await boot(browser,root,{contour:'1',contourRenderer:'worker-webgl'},`
    window.__workers=[];window.__frames=0;window.__painted=0;window.__live=0;
    const NativeWorker=Worker;
    window.Worker=class extends NativeWorker {
      constructor(...args){super(...args);__workers.push(this);__live++;this.alive=true;
        this.addEventListener('message',e=>{if(e.data?.type==='painted')__painted++})}
      postMessage(...args){if(args[0]?.type==='frame')__frames++;return super.postMessage(...args)}
      terminate(){if(this.alive){this.alive=false;__live--}return super.terminate()}
    }`)
  await browser.until('/^worker-/.test(document.querySelector("[data-endfield-contour]")?.dataset.endfieldRenderer || "") && __frames > 2')
  const backend=await browser.evaluate('document.querySelector("[data-endfield-contour]").dataset.endfieldRenderer')
  assert.match(backend,/^worker-(webgl2|canvas2d)$/)
  console.log('Actual renderer:',backend)
  // A static preference stops new frame jobs after the last update settles.
  await browser.evaluate('__prefs.setItem("dsh-theme-endfield-contour-anim","0")')
  /* Switching off still submits ONE redraw, so the static sheet is a complete
     picture rather than a half-updated frame. When a job is already in flight
     that redraw waits in pending until the worker reports painted, so a fixed
     settle window is a bet on the round trip: on a slow runner the extra frame
     lands after any window we could pick, which is how this test used to fail.
     Wait for the worker to fall idle — every submitted job painted — because that
     is the moment the update has actually settled, then require the count to
     hold. The assertion itself is unchanged: once settled, no new job appears. */
  await browser.until('__frames === __painted')
  await browser.sleep(100)
  const staticCount=await browser.evaluate('__frames')
  await browser.sleep(300);assert.equal(await browser.evaluate('__frames'),staticCount)
  await browser.evaluate('__prefs.setItem("dsh-theme-endfield-contour-anim","1")')
  await browser.until('__frames>'+staticCount)
  // Visibility handler drops pending work and resumes on a fresh frame.
  await browser.evaluate('Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"))')
  await browser.sleep(200);const hiddenCount=await browser.evaluate('__frames')
  await browser.sleep(300);assert.equal(await browser.evaluate('__frames'),hiddenCount)
  await browser.evaluate('delete document.hidden;document.dispatchEvent(new Event("visibilitychange"))')
  await browser.until('__frames>'+hiddenCount)
  // Canvas ownership cannot be reused after transfer; a failure must replace it.
  await browser.evaluate('window.__oldCanvas=document.querySelector("[data-endfield-contour-lines]");__workers.at(-1).dispatchEvent(new MessageEvent("messageerror"))')
  await browser.until('document.querySelector("[data-endfield-contour]")?.dataset.endfieldRenderer === "main-canvas2d"')
  assert.equal(await browser.evaluate('document.querySelector("[data-endfield-contour-lines]")!==__oldCanvas && !__oldCanvas.isConnected && __live===0'),true)
  // Explicit preference change permits a retry; normal remounts do not loop.
  await browser.evaluate('__prefs.setItem("dsh-theme-endfield-contour-renderer","canvas");__prefs.setItem("dsh-theme-endfield-contour-renderer","worker-webgl")')
  await browser.until('__live===1 && /^worker-/.test(document.querySelector("[data-endfield-contour]")?.dataset.endfieldRenderer || "")')
  for(let i=0;i<5;i++){
    await browser.evaluate('__prefs.setItem("dsh-theme-endfield-contour","0")')
    assert.equal(await browser.evaluate('__live'),0)
    await browser.evaluate('__prefs.setItem("dsh-theme-endfield-contour","1")')
    await browser.until('__live===1 && /^worker-/.test(document.querySelector("[data-endfield-contour]")?.dataset.endfieldRenderer || "")')
    assert.equal(await browser.evaluate('document.querySelectorAll("[data-endfield-contour-lines]").length'),1)
  }
  await browser.evaluate('__prefs.setItem("dsh-theme-endfield-enabled","0")')
  assert.equal(await browser.evaluate('__live===0 && !document.querySelector("[data-endfield-contour]")'),true)
  assert.deepEqual(browser.errors,[])
  console.log('PASS: real worker rendering, static/hidden pause, fresh-canvas fallback, retry and teardown')
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
