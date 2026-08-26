/**
 * hover-check.js — exercise the REAL :hover selector, not a same-specificity
 * stand-in, by driving Chrome over the DevTools Protocol and moving the mouse.
 *
 * Why this exists: settings-buttons.test.js reads computed styles, which cannot
 * trigger :hover, so it swaps in a .HOVERPROBE class. That is a fair cascade
 * equivalent, but a reverse-control experiment proved the limit — deleting the real
 * ':hover' half of the theme rule did NOT fail that test, because the probe half
 * was carrying it alone. A guard that cannot fail for the shipped selector is not
 * evidence about the shipped selector.
 *
 * This script therefore asserts on real hovered pixels: it screenshots the button
 * with the pointer over it and measures the glyph colour against the fill.
 *
 * Usage: node test/hover-check.js
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const http = require('http')
const zlib = require('zlib')
const { spawn } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const findChrome = () => [process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
  .filter(Boolean).find((p) => fs.existsSync(p))
const chrome = findChrome()
if (!chrome) { console.error('FAIL  no Chrome/Edge found (set CHROME_PATH)'); process.exit(1) }

let failures = 0
const pass = (m) => console.log('ok    ' + m)
const fail = (m) => { console.error('FAIL  ' + m); failures++ }

/* ---- PNG decode (screenshots come back base64 PNG) ---- */
const decodePng = (buf) => {
  let pos = 8, w = 0, h = 0, bd = 0, ct = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.slice(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : 0
  if (!ch || bd !== 8) throw new Error('unsupported png ct=' + ct)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = Buffer.alloc(w * h * ch)
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]
    const line = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = Buffer.alloc(stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0
      let v = line[x]
      if (ft === 1) v += a; else if (ft === 2) v += b
      else if (ft === 3) v += (a + b) >> 1
      else if (ft === 4) { const p = a + b - c
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c) }
      cur[x] = v & 0xff
    }
    cur.copy(out, y * stride); prev = cur
  }
  return { w, h, ch, data: out }
}

const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2])
const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05) }

/* ---- minimal CDP client over the /json/... HTTP endpoints + websocket ---- */
const httpJson = (port, p) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: p }, (res) => {
    let d = ''; res.setEncoding('utf8')
    res.on('data', (c) => { d += c }); res.on('end', () => { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
  }).on('error', reject)
})

/* Tiny RFC6455 client: enough for CDP's text frames. Avoids adding a dependency
   to a package that currently has none. */
const connectWs = (url) => new Promise((resolve, reject) => {
  const net = require('net')
  const crypto = require('crypto')
  const u = new URL(url)
  const key = crypto.randomBytes(16).toString('base64')
  const sock = net.connect(Number(u.port), u.hostname, () => {
    sock.write('GET ' + u.pathname + u.search + ' HTTP/1.1\r\n'
      + 'Host: ' + u.host + '\r\n'
      + 'Upgrade: websocket\r\nConnection: Upgrade\r\n'
      + 'Sec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n')
  })
  let buf = Buffer.alloc(0)
  let open = false
  const waiters = new Map()
  let nextId = 1
  const emit = (msg) => {
    if (msg.id !== undefined && waiters.has(msg.id)) { waiters.get(msg.id)(msg); waiters.delete(msg.id) }
  }
  const decodeFrames = () => {
    for (;;) {
      if (buf.length < 2) return
      const len0 = buf[1] & 0x7f
      let off = 2, len = len0
      if (len0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4 }
      else if (len0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10 }
      if (buf.length < off + len) return
      const payload = buf.slice(off, off + len)
      buf = buf.slice(off + len)
      try { emit(JSON.parse(payload.toString('utf8'))) } catch (e) { /* non-JSON frame */ }
    }
  }
  sock.on('data', (chunk) => {
    if (!open) {
      buf = Buffer.concat([buf, chunk])
      const i = buf.indexOf('\r\n\r\n')
      if (i < 0) return
      const head = buf.slice(0, i).toString('ascii')
      if (!/101/.test(head)) { reject(new Error('ws upgrade failed: ' + head.split('\r\n')[0])); return }
      buf = buf.slice(i + 4); open = true
      resolve(api)
      decodeFrames()
      return
    }
    buf = Buffer.concat([buf, chunk]); decodeFrames()
  })
  sock.on('error', reject)
  const send = (obj) => {
    const data = Buffer.from(JSON.stringify(obj), 'utf8')
    const mask = require('crypto').randomBytes(4)
    let header
    if (data.length < 126) header = Buffer.from([0x81, 0x80 | data.length])
    else if (data.length < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0xfe; header.writeUInt16BE(data.length, 2) }
    else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0xff; header.writeBigUInt64BE(BigInt(data.length), 2) }
    const masked = Buffer.alloc(data.length)
    for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4]
    sock.write(Buffer.concat([header, mask, masked]))
  }
  const api = {
    call: (method, params) => new Promise((res) => {
      const id = nextId++
      waiters.set(id, (msg) => res(msg.result))
      send({ id, method, params: params || {} })
    }),
    close: () => sock.destroy(),
  }
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
  const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-hover-'))
  fs.copyFileSync(path.join(ROOT, 'client.js'), path.join(OUT, 'client.js'))
  const page = path.join(OUT, 'p.html')

  /* Upstream secondaryButton CSS, verbatim, WITHOUT any HOVERPROBE stand-in: the
     point is to exercise the genuine :hover path. */
  fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%}
    body{background:var(--dsw-alias-bg-base);font-family:Arial,sans-serif}
    .panel{padding:40px;background:var(--dsw-alias-bg-layer-1)}
    .zGbnIq_secondaryButton{box-sizing:border-box;font:inherit;cursor:pointer;border:none;
      justify-content:center;align-items:center;padding:0 10px;font-size:12px;line-height:18px;
      height:28px;display:inline-flex;border:1px solid var(--dsw-alias-border-l2);
      color:var(--dsw-alias-label-primary);background:0 0}
    .zGbnIq_secondaryButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
    .zGbnIq_secondaryButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}
  </style></head><body>
  <div class="panel"><button class="zGbnIq_secondaryButton" id="edit">编辑</button></div>
  <script>window.__ModuleLoader__={load:(m)=>{window.__MOD__=m}}</script>
  <script src="./client.js"></script>
  <script>
    let applied=[], scheme='dark', last=null
    const applyTokens=(t)=>{ last=t
      for(const n of applied) document.body.style.removeProperty(n); applied=[]
      for(const [k,v] of Object.entries(t)){ document.body.style.setProperty(k,v[scheme]); applied.push(k) } }
    window.__setScheme__=(s)=>{ scheme=s
      if(s==='dark') document.body.setAttribute('data-ds-dark-theme',''); else document.body.removeAttribute('data-ds-dark-theme')
      if(last) applyTokens(last) }
    window.__setPalette__=(p)=>{ if(p==='wuling') document.body.classList.add('theme-endfield-wuling')
      else document.body.classList.remove('theme-endfield-wuling') }
    localStorage.setItem('dsh-theme-endfield-enabled','1')
    localStorage.setItem('dsh-theme-endfield-loader','0')
    localStorage.setItem('dsh-theme-endfield-contour','0')
    const mod=window.__MOD__.factory(()=>null)
    mod.apply({get:(n)=>n==='theme'?{overrideTokens:(_s,t)=>{applyTokens(t);return ()=>{}}}:undefined,effect:()=>{}})
    window.__setScheme__('dark')
    window.__rect__=()=>{ const r=document.getElementById('edit').getBoundingClientRect()
      return {x:r.x,y:r.y,w:r.width,h:r.height} }
  </script></body></html>`)

  const port = 9333 + Math.floor(Math.random() * 400)
  /* Font-rendering flags pin the glyph rasteriser across platforms. Without them
     this check passes on Windows and fails on Linux: the ink sample below picks
     "the pixel furthest in luminance from the fill that occurs >= 3 times", and
     that needs enough SOLID stroke pixels to clear the threshold. Windows
     (DirectWrite) leaves plenty; Linux (FreeType) with hinting + LCD subpixel AA
     smears the same glyphs into mostly-blended pixels, so the sample lands on an
     anti-aliased edge — a ~50% mix of ink and fill — and the measured contrast
     collapses (3.85:1 on 谷地黄, 3.33:1 on 武陵青) even though the palette itself
     never changed. Greyscale AA with hinting off keeps the stroke cores solid. */
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--hide-scrollbars', '--window-size=520,220',
    '--font-render-hinting=none', '--disable-font-subpixel-positioning',
    '--disable-lcd-text', '--force-color-profile=srgb',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'hover-prof-')),
    'file:///' + page.replace(/\\/g, '/')], { stdio: ['ignore', 'ignore', 'ignore'] })

  try {
    let target = null
    for (let i = 0; i < 60 && target === null; i++) {
      await sleep(250)
      try {
        const list = await httpJson(port, '/json/list')
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || null
      } catch (e) { /* not up yet */ }
    }
    if (target === null) { fail('could not reach the DevTools endpoint'); throw new Error('no target') }

    const cdp = await connectWs(target.webSocketDebuggerUrl)
    await cdp.call('Runtime.enable')
    await cdp.call('Page.enable')
    await sleep(600)

    const evaluate = async (expr) => {
      const r = await cdp.call('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
      return r && r.result ? r.result.value : undefined
    }
    const shoot = async () => {
      const r = await cdp.call('Page.captureScreenshot', { format: 'png' })
      return decodePng(Buffer.from(r.data, 'base64'))
    }

    for (const palette of ['valley', 'wuling']) {
      for (const scheme of ['light', 'dark']) {
        await evaluate("window.__setPalette__('" + palette + "')")
        await evaluate("window.__setScheme__('" + scheme + "')")
        await sleep(150)
        const rect = await evaluate('JSON.stringify(window.__rect__())')
        const b = JSON.parse(rect)
        const cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h / 2)

        // Move the real mouse over the button so the genuine :hover rule applies.
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx, y: cy, buttons: 0 })
        await sleep(220)
        const img = await shoot()

        /* Inside the button box, split pixels into fill (the dominant colour) and
           glyph ink (everything far from it), then measure their contrast. */
        const x0 = Math.max(0, Math.round(b.x) + 2), x1 = Math.min(img.w - 1, Math.round(b.x + b.w) - 2)
        const y0 = Math.max(0, Math.round(b.y) + 2), y1 = Math.min(img.h - 1, Math.round(b.y + b.h) - 2)
        const tally = new Map()
        const px = (x, y) => { const i = (y * img.w + x) * img.ch; return [img.data[i], img.data[i + 1], img.data[i + 2]] }
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const k = px(x, y).join(',')
          tally.set(k, (tally.get(k) || 0) + 1)
        }
        const sorted = [...tally.entries()].sort((a, b2) => b2[1] - a[1])
        const fill = sorted[0][0].split(',').map(Number)
        // Ink = the pixel furthest in luminance from the fill (the glyph core).
        let ink = fill, best = 0
        for (const [k, n] of sorted) {
          if (n < 3) continue
          const p = k.split(',').map(Number)
          const d = Math.abs(lum(p) - lum(fill))
          if (d > best) { best = d; ink = p }
        }
        const r = ratio(ink, fill)
        const label = (palette === 'wuling' ? '武陵青' : '谷地黄') + ' · ' + scheme + ' · 真实 :hover'
        const detail = r.toFixed(2) + ':1  ink=rgb(' + ink.join(', ') + ') on fill=rgb(' + fill.join(', ') + ')'
        if (r >= 4.5) pass(label + '  [' + detail + ']')
        else fail(label + '  [' + detail + ']  <- 悬停时文字与实心底对比不足')

        // Park the pointer away so the next iteration starts unhovered.
        await cdp.call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, buttons: 0 })
        await sleep(120)
      }
    }
    cdp.close()
  } finally {
    proc.kill()
  }

  console.log('')
  if (failures) { console.error(failures + ' real-hover check(s) failed'); process.exit(1) }
  console.log('all real-hover contrast checks passed')
})().catch((e) => { console.error('FAIL  ' + e.message); process.exit(1) })
