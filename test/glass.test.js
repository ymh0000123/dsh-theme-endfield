const assert=require('node:assert/strict'),path=require('node:path')
const {launch,boot}=require('./fixtures/chrome-cdp.js')
;(async()=>{
 const browser=await launch()
 try {
  await boot(browser,path.resolve(__dirname,'..'))
  assert.equal(await browser.evaluate('document.body.hasAttribute("data-endfield-glass")'),false)
  const original=await browser.evaluate('JSON.stringify(document.querySelector("[data-composer-card]").getBoundingClientRect().toJSON())')
  for(const dark of [false,true])for(const palette of ['valley','wuling']) {
    await browser.evaluate(`document.body.toggleAttribute('data-ds-dark-theme',${dark});__prefs.setItem('dsh-theme-endfield-palette',${JSON.stringify(palette)})`)
    for(const [level,radius,alpha] of [['subtle',8,dark?.64:.68],['standard',14,dark?.76:.8],['strong',22,dark?.88:.9]]){
      await browser.evaluate(`__prefs.setItem('dsh-theme-endfield-glass',${JSON.stringify(level)})`)
      const material=await browser.evaluate(`(()=>{const e=document.querySelector('[data-composer-card]'),s=getComputedStyle(e);return {filter:s.backdropFilter,background:s.backgroundColor,box:JSON.stringify(e.getBoundingClientRect().toJSON())}})()`)
      assert.match(material.filter,new RegExp('blur\\('+radius+'px\\)'))
      assert.match(material.background,new RegExp(String(alpha).replace('.','\\.')))
      assert.equal(material.box,original)
      // Expanded docked panel is frosted; the collapsed one (no data-sidebar-right-open)
      // must stay unfrosted — it remains in the DOM parked off-screen when collapsed.
      await browser.evaluate('document.querySelector("[data-sidebar-right-panel]").removeAttribute("data-sidebar-right-open")')
      assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("[data-sidebar-right-panel]")).backdropFilter'),'none')
      await browser.evaluate('document.querySelector("[data-sidebar-right-panel]").setAttribute("data-sidebar-right-open","")')
      assert.match(await browser.evaluate('getComputedStyle(document.querySelector("[data-sidebar-right-panel]")).backdropFilter'),new RegExp('blur\\('+radius+'px\\)'))
    }
    const pos=await browser.evaluate('(()=>{const r=document.querySelector("#cell").getBoundingClientRect();return{x:r.x+20,y:r.y+10}})()')
    await browser.send('Input.dispatchMouseEvent',{type:'mouseMoved',...pos})
    const colors=await browser.evaluate(`(()=>{
      const td=document.querySelector('#cell'),range=document.createRange();range.selectNodeContents(td);getSelection().removeAllRanges();getSelection().addRange(range);
      const c=document.createElement('canvas').getContext('2d');
      const rgba=v=>{c.clearRect(0,0,1,1);c.fillStyle=v;c.fillRect(0,0,1,1);return Array.from(c.getImageData(0,0,1,1).data)};
      const normal=getComputedStyle(td),selected=getComputedStyle(td,'::selection');
      return{hover:rgba(normal.backgroundColor),ink:rgba(normal.color),selection:rgba(selected.backgroundColor),selectedInk:rgba(selected.color)}
    })()`)
    const luminance=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)
    const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
    assert.notDeepEqual(colors.hover,colors.selection)
    assert.ok(contrast(colors.ink,colors.hover)>=4.5)
    assert.ok(contrast(colors.selectedInk,colors.selection)>=4.5)
    console.log('PASS:',dark?'dark':'light',palette,'glass tiers, stable geometry, readable hover and selection')
  }
  await browser.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]})
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("[data-composer-card]")).backdropFilter'),'none')
  // Collapsed docked panel: React only writes data-sidebar-right-open when expanded,
  // so removing it must un-frost the panel even while it keeps data-sidebar-right-panel="push".
  await browser.evaluate('document.querySelector("[data-sidebar-right-panel]").removeAttribute("data-sidebar-right-open")')
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("[data-sidebar-right-panel]")).backdropFilter'),'none')
  await browser.evaluate('document.querySelector("[data-sidebar-right-panel]").setAttribute("data-sidebar-right-panel","fullscreen")')
  assert.equal(await browser.evaluate('getComputedStyle(document.querySelector("[data-sidebar-right-panel]")).backdropFilter'),'none')
  await browser.evaluate('__prefs.setItem("dsh-theme-endfield-enabled","0")')
  assert.equal(await browser.evaluate('document.body.hasAttribute("data-endfield-glass")'),false)
  assert.deepEqual(browser.errors,[])
  console.log('PASS: reduced-transparency, collapsed/fullscreen exclusion and theme teardown')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
