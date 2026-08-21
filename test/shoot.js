/**
 * shoot.js — render the real client.js over a mock of the app and save PNGs for
 * visual review: both colour schemes x both accent palettes (谷地黄 / 武陵青).
 * Correctness checks live in the .test.js files; this exists purely so the result
 * can be LOOKED at.
 *
 * Usage: node test/shoot.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
/* Unlike the .test.js files this one deliberately KEEPS its output (the PNGs are
   the point), so it writes to a gitignored scratch directory rather than a temp
   dir that is hard to find afterwards. */
const OUT = path.join(ROOT, '.kagent', 'shots')
const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p))
if (!chrome) { console.error('no chrome'); process.exit(1) }

/* Mock of the real conversation page. Class names and the opaque bg-base fills
   are copied from the installed @deepseek-ai bundles so the screenshot exercises
   the same background-stacking problem the live app has.
   `wuling` selects the 武陵青 palette exactly the way the settings row does: by
   putting the class on <body>. Nothing else differs between the two renders,
   which is the point — if a surface does not change colour, it is not reading
   the palette variables. */
const mk = (dark, wuling) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body,#root{height:100%;margin:0}
  :root{
    --dsw-alias-bg-base:${dark ? '#101110' : '#e8e8e2'};
    --dsw-alias-bg-layer-1:${dark ? '#181a18' : '#f2f2ec'};
    --dsw-alias-bg-layer-2:${dark ? '#1e201d' : '#dcddd6'};
    --dsw-alias-label-primary:${dark ? '#f5f5f0' : '#101110'};
    --dsw-alias-label-secondary:${dark ? '#898d89' : '#4a4c48'};
    --dsw-specific-sidebar-fill:${dark ? '#101110' : '#e8e8e2'};
    --dsw-alias-border-l1:${dark ? '#343633' : '#d8d9d5'};
    --dsw-alias-border-l2:${dark ? '#4a4d49' : '#b6b8b3'};
    --dsw-font-family:Arial,sans-serif;--dsh-scrollbar-width:8px}
  body{background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
       font-family:Arial,sans-serif}
  .pI_x6G_frame{background:var(--dsw-alias-bg-base);height:100%;
    grid-template-columns:248px 1fr;grid-template-rows:100%;display:grid;
    position:relative;overflow:hidden}
  .pI_x6G_sidebarCol{background:var(--dsw-specific-sidebar-fill);
    border-right:1px solid var(--dsw-alias-border-l1);overflow:hidden}
  .pI_x6G_centerCol{flex-direction:column;min-width:0;display:flex;overflow:hidden}
  .wSkVaW_root{background:var(--dsw-alias-bg-base);flex-direction:column;
    height:100%;display:flex}
  .wSkVaW_header{padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);
    font-size:13px;color:var(--dsw-alias-label-secondary);flex:none;
    display:flex;gap:10px;align-items:center}
  .wSkVaW_viewArea{flex:1 1 auto;padding:26px 0;overflow:hidden}
  .col{max-width:748px;margin:0 auto;padding:0 16px}
  .turn{margin-bottom:22px}
  .who{font-size:11px;letter-spacing:.08em;text-transform:uppercase;
       color:var(--dsw-alias-label-secondary);margin-bottom:6px}
  .msg{font-size:15px;line-height:1.75;color:var(--dsw-alias-label-primary)}
  .card{border:1px solid var(--dsw-alias-border-l2);padding:12px 14px;
        background:var(--dsw-alias-bg-layer-1);font:12px/1.6 monospace;
        color:var(--dsw-alias-label-secondary);margin-top:10px}
  /* Upstream's gradient-text turn status, so the recolour is visible in the shot. */
  .Md3f7G_turnStatus{background:linear-gradient(90deg,#101110 0%,#101110 40%,
    #d3e2ff 50%,#101110 60%,#101110 100%);-webkit-text-fill-color:transparent;
    background-clip:text;-webkit-background-clip:text;font-size:13px;font-weight:600}
  .x_newSession{display:block;width:100%;padding:8px 10px;margin-bottom:12px;
    font:600 12px Arial;border:1px solid var(--dsw-alias-border-l2);cursor:pointer}
  .SVAs4q_label{display:inline-flex;align-items:center;padding:3px 10px;
    font:600 11px Arial}
  table{border-collapse:collapse;width:100%;margin-top:12px;font-size:12px}
  th,td{padding:6px 8px;text-align:left;border-bottom:1px solid var(--dsw-alias-border-l1)}
  .wSkVaW_composerSeat{background:linear-gradient(180deg,
    color-mix(in srgb, var(--dsw-alias-bg-base) 0%, transparent) 0px,
    var(--dsw-alias-bg-base) 36px);position:sticky;bottom:0;z-index:7;
    padding:14px 0 22px;flex:none}
  .composer{max-width:764px;margin:0 auto;border:1px solid var(--dsw-alias-border-l2);
    background:var(--dsw-alias-bg-layer-1);padding:12px 14px;font-size:14px;
    color:var(--dsw-alias-label-secondary)}
  .side{padding:14px 12px;font-size:13px;color:var(--dsw-alias-label-secondary)}
  .side b{display:block;color:var(--dsw-alias-label-primary);font-weight:600;
    font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px}
  .row{padding:7px 8px;margin:0 -8px}
  .row.selected{color:var(--dsw-alias-label-primary)}
</style></head><body>
<div id="root">
  <div class="pI_x6G_frame">
    <div class="pI_x6G_sidebarCol"><div class="side">
      <button class="x_newSession">+ 新建会话</button>
      <b>Sessions</b>
      <div class="row selected">武陵青 / 谷地黄 配色</div>
      <div class="row">theme tokens</div>
      <div class="row">contour background</div>
      <div class="row">watermark</div>
    </div></div>
    <div class="pI_x6G_centerCol"><div class="wSkVaW_root">
      <div class="wSkVaW_header">
        <span class="SVAs4q_label">cordis</span>
        <span class="Md3f7G_turnStatus">Deep diving...</span>
      </div>
      <div class="wSkVaW_viewArea"><div class="col">
        <div class="turn"><div class="who">User</div>
          <div class="msg">帮我做一个新配色，可以在设置切换使用黄色和这个配色（武陵青 #14d0d0）。</div></div>
        <div class="turn"><div class="who">Assistant</div>
          <div class="msg">Every accent in the stylesheet now reads from one palette variable
          block, so the whole theme repaints from a single class on &lt;body&gt;. This paragraph
          exists to prove body text keeps full contrast in either palette — the contour sheet
          sits behind it, and the accent never touches running text.</div>
          <table><thead><tr><th>role</th><th>谷地黄</th><th>武陵青</th></tr></thead>
          <tbody><tr><td>solid fill + ink</td><td>16.50:1</td><td>6.62:1</td></tr>
          <tr><td>dark icon ink</td><td>15.26:1</td><td>6.12:1</td></tr></tbody></table>
          <div class="card">palette ${wuling ? '武陵青 #14d0d0' : '谷地黄 #fff500'} · scheme ${dark ? 'dark' : 'light'}</div>
        </div>
      </div></div>
      <div class="wSkVaW_composerSeat"><div class="composer">Message DeepSeek Harness…</div></div>
    </div></div>
  </div></div>
<script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
<script src="./client.js"></script>
<script>
  ${dark ? "document.body.setAttribute('data-ds-dark-theme','')" : ''}
  const LS=localStorage
  LS.setItem('dsh-theme-endfield-enabled','1')
  LS.setItem('dsh-theme-endfield-loader','0')
  LS.setItem('dsh-theme-endfield-watermark','0')
  LS.setItem('dsh-theme-endfield-contour','1')
  LS.setItem('dsh-theme-endfield-contour-anim','1')
  LS.setItem('dsh-theme-endfield-palette', ${wuling ? "'wuling'" : "'valley'"})
  const mod=window.__MOD__.factory(()=>null)
  /* Apply token overrides the way the app does — inline on <body> — because the
     palette-aware tokens are var() references that must resolve on that element. */
  mod.apply({
    get:(n)=>n==='theme'?{overrideTokens:(_s,t)=>{
      for(const [k,v] of Object.entries(t)) document.body.style.setProperty(k, v[${dark ? "'dark'" : "'light'"}])
      return ()=>{}
    }}:undefined,
    effect:(f)=>f(),
  })
  // nudge the observer so the layer mounts
  document.body.appendChild(document.createElement('span'))
</script></body></html>`

fs.mkdirSync(OUT, { recursive: true })
fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
for (const wuling of [false, true]) {
  for (const dark of [false, true]) {
    const name = 'shot-' + (wuling ? 'wuling' : 'valley') + '-' + (dark ? 'dark' : 'light')
    const page = path.join(OUT, name + '.html')
    fs.writeFileSync(page, mk(dark, wuling))
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'))
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--virtual-time-budget=4000', '--window-size=1440,900',
      '--user-data-dir=' + tmp,
      '--screenshot=' + path.join(OUT, name + '.png'),
      'file:///' + page.replace(/\\/g, '/'),
    ], { timeout: 120000, stdio: ['ignore', 'ignore', 'ignore'] })
    console.log('wrote ' + path.join(OUT, name + '.png'))
  }
}
