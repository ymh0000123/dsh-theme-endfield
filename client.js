/**
 * dsh-theme-endfield — Edge Intelligence Theme (browser client bundle)
 * 还原自《明日方舟：终末地》（Arknights: Endfield）官网的「工业编辑风」。
 * 参考：https://endfield.hypergryph.com
 *
 * Client 半部：
 *   1) theme.overrideTokens —— 覆盖主题令牌（亮/暗双色），映射终末地官网色板；
 *   2) insertCss —— 注入字体栈、信号黄强调、直角化、去蓝、hover 反色等全局样式。
 *      （动态插件环境走 styles.insert；安装为独立 bundle 时直接注入 <style> 到 head。）
 *   3) 设置页「主题圆角」开关 —— 直角（默认）/ 圆角（恢复应用原生圆角）切换，
 *      localStorage 持久化（key: dsh-theme-endfield-radius）。
 *
 * 由 dsh-client-modules 以 /plugins/theme-endfield/client.js 形式加载；
 * 通过 `dsh plugin --profile web add github:ymh0000123/dsh-theme-endfield` 安装挂载。
 */
window.__ModuleLoader__.load({
	id: "dsh-theme-endfield",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

function insertCss(css) {
  // Dynamic Cordis runner provides the `styles` global; standalone bundle does not.
  if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
    return styles.insert(css)
  }
  // Idempotency: the installed bundle can be applied more than once (boot loader +
  // cordis composition both mount it). Never stack duplicate theme stylesheets.
  document.querySelectorAll('style[data-plugin="dsh-theme-endfield"]').forEach((old) => old.remove())
  const el = document.createElement('style')
  el.setAttribute('data-plugin', 'dsh-theme-endfield')
  el.textContent = css
  document.head.appendChild(el)
  return () => {
    if (el.parentNode) el.parentNode.removeChild(el)
  }
}

function apply(ctx) {
    // Idempotency: the installed bundle can be applied more than once (boot loader +
    // cordis composition both mount it). Only the first application owns tokens/styles;
    // duplicate overrideTokens would replace the layer and break the toggle's dispose.
    if (typeof window !== 'undefined' && window.__dshThemeEndfieldApplied) return
    if (typeof window !== 'undefined') window.__dshThemeEndfieldApplied = true

    const theme = ctx.get('theme')
    if (theme === undefined) return

    const RADIUS_KEY = 'dsh-theme-endfield-radius'
    const ENABLED_KEY = 'dsh-theme-endfield-enabled'
    const isEnabled = () => (typeof localStorage !== 'undefined' && localStorage.getItem(ENABLED_KEY)) !== '0'
    const syncRadiusMode = () => {
      const mode = (typeof localStorage !== 'undefined' && localStorage.getItem(RADIUS_KEY)) || 'square'
      if (mode === 'round') document.body.classList.add('theme-endfield-round')
      else document.body.classList.remove('theme-endfield-round')
    }

    /* ---------- background ENDFIELD watermark (settings-toggleable) ----------
       Two independent switches:
         WATERMARK_KEY  — the watermark itself (default ON), shown on the hero page.
         WATERMARK_PERSIST_KEY — "keep showing it off the hero page" (default OFF),
           which also paints it on an active conversation / settings / any other page.
       On the hero page the mark is centred on the headline. Off the hero page there
       is no headline to follow, so it is centred in the conversation column instead
       and mounted INSIDE that column rather than on <body>: a fixed body child
       paints above the message text (it has no z-index competitor to lose to),
       which would wash out what the user is reading. See mountPointFor(). */
    const WATERMARK_KEY = 'dsh-theme-endfield-watermark'
    const WATERMARK_PERSIST_KEY = 'dsh-theme-endfield-watermark-persist'
    const isWatermarkOn = () => (typeof localStorage !== 'undefined' && localStorage.getItem(WATERMARK_KEY)) !== '0'
    // Default OFF: the hero-only behaviour stays the shipped default.
    const isWatermarkPersistOn = () => (typeof localStorage !== 'undefined' && localStorage.getItem(WATERMARK_PERSIST_KEY)) === '1'
    const isHeroVisible = () => {
      if (typeof document === 'undefined') return false
      const hero = document.querySelector('[class*="pXSMma_root"]')
      if (!hero) return false
      const r = hero.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    /** The visible conversation column — the persist-mode anchor and mount parent. */
    const findConversationRoot = () => {
      if (typeof document === 'undefined') return null
      const all = document.querySelectorAll('[class*="wSkVaW_root"]')
      for (const el of all) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) return el
      }
      return null
    }
    const findVisibleHeadline = () => {
      if (typeof document === 'undefined') return null
      const all = document.querySelectorAll('[class*="pXSMma_headline"]')
      for (const h of all) {
        const r = h.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) return h
      }
      return null
    }
    let watermarkEl = null
    let watermarkRaf = null
    let watermarkHost = null
    /* Where the mark belongs for the current page, and how it must stack there:
         hero    -> <body>, above the (empty) hero backdrop, following the headline.
         persist -> inside the conversation column, BEHIND the message text.
       Returning the parent alongside the mode keeps the two decisions in one place,
       so remount happens exactly when either the parent or the stacking changes. */
    const mountPointFor = () => {
      if (isHeroVisible()) return { mode: 'hero', parent: document.body }
      const conv = findConversationRoot()
      if (conv !== null) return { mode: 'persist', parent: conv }
      // No conversation column on screen (e.g. a full-page settings view): fall back
      // to the body, still behind content via a negative z-index.
      return { mode: 'persist', parent: document.body }
    }
    const positionWatermark = () => {
      if (!watermarkEl) return
      if (watermarkEl.getAttribute('data-endfield-watermark') === 'persist') {
        // Centred in its own positioned parent — no per-frame measurement needed.
        return
      }
      const headline = findVisibleHeadline()
      if (!headline) return
      const r = headline.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return
      const cy = r.top + r.height / 2
      const cx = r.left + r.width / 2
      const vw = (typeof window !== 'undefined' && window.innerWidth) || (typeof document !== 'undefined' ? document.documentElement.clientWidth : 0)
      const top = (cy - 55) + 'px'
      const tx = 'translateX(' + (cx - vw / 2) + 'px)'
      // Only write when the value actually changed, so a stable layout costs nothing.
      if (watermarkEl.style.top !== top) watermarkEl.style.top = top
      if (watermarkEl.style.transform !== tx) watermarkEl.style.transform = tx
    }
    const watermarkRafLoop = () => {
      // Only the hero placement is measured per frame; persist mode is pure CSS, so
      // the loop must stop when the mode changes rather than spin for nothing.
      if (!watermarkEl || watermarkEl.getAttribute('data-endfield-watermark') !== 'hero') {
        watermarkRaf = null
        return
      }
      positionWatermark()
      watermarkRaf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(watermarkRafLoop) : null
    }
    const styleWatermark = (el, mode) => {
      const s = el.style
      s.display = 'flex'
      s.alignItems = 'center'
      s.justifyContent = 'center'
      s.pointerEvents = 'none'
      s.fontWeight = '900'
      s.letterSpacing = '0.1em'
      s.color = 'var(--dsw-alias-label-primary)'
      s.textTransform = 'uppercase'
      s.userSelect = 'none'
      s.fontFamily = 'var(--dsw-font-family)'
      if (mode === 'hero') {
        s.position = 'fixed'
        s.left = '0'
        s.right = '0'
        s.top = ''
        s.bottom = ''
        s.height = '110px'
        s.zIndex = '1'
        s.fontSize = '9.5vw'
        s.opacity = '0.13'
        s.transform = ''
      } else {
        // Fill the conversation column and sit behind its content. z-index:-1 paints
        // below in-flow text but still above the column's own background, which is
        // why the column is given `isolation: isolate` in the stylesheet: without a
        // stacking context there, -1 would slide behind that background and vanish.
        s.position = 'absolute'
        s.left = '0'
        s.right = '0'
        s.top = '0'
        s.bottom = '0'
        s.height = ''
        s.zIndex = '-1'
        s.fontSize = '9.5vw'
        // Strength tuned by measurement on the real chat page, not guessed. Isolating
        // the mark's own pixel contribution with an identical screenshot clip gave
        // 0.07 -> 0.46%, 0.12 -> 2.9%, 0.18 -> 4.3%, 0.22 -> 5.2%, 0.30 -> 7.2%.
        // Bounds found by review of real renders in BOTH color schemes:
        //   0.07 is under the perceptual floor (#202120 over #101110 — 16/255,
        //        ~1.17:1) and reads as "no watermark at all";
        //   0.22 is legible but the big letter edges start to visually collide with
        //        the body text sitting in front of them.
        // 0.16 is the upper-middle of that window: ~1.54:1 in dark, ~1.40:1 in light
        // (light needs slightly less because subtracting luminance from cream reads
        // more readily than adding it to near-black). The mark stays at z-index:-1
        // BEHIND the text, so foreground contrast is never reduced — only how much
        // the background wordmark competes for attention changes.
        s.opacity = '0.16'
        s.transform = ''
      }
    }
    const syncWatermarkVisibility = () => {
      const on = isEnabled() && isWatermarkOn()
      const target = on ? mountPointFor() : null
      // Off the hero page the mark only survives when the persist switch is on.
      const shouldShow = target !== null && (target.mode === 'hero' || isWatermarkPersistOn())
      if (shouldShow && watermarkEl) {
        // A page change can flip the mode or move the parent — restyle/reparent in place.
        if (watermarkEl.getAttribute('data-endfield-watermark') !== target.mode) {
          watermarkEl.setAttribute('data-endfield-watermark', target.mode)
          styleWatermark(watermarkEl, target.mode)
        }
        if (watermarkHost !== target.parent) {
          target.parent.appendChild(watermarkEl)
          watermarkHost = target.parent
        }
      } else if (shouldShow && !watermarkEl) {
        const el = document.createElement('div')
        el.setAttribute('data-endfield-watermark', target.mode)
        /* Translation-proofing. The wordmark is a brand name that must never be
           rewritten by Chrome/Edge "translate this page", a Google Translate widget
           or a translator extension.
           The real defence is structural: the glyphs come from CSS `content` on a
           ::before (see the stylesheet), so there is NO DOM text node to translate —
           text-walking translators cannot see it at all. The attributes below are the
           declarative belt-and-braces for anything that inspects the element itself:
             translate="no"   — the HTML5 opt-out honoured by Chrome/Edge translate
             class notranslate — Google Translate's own opt-out hook
             lang="en"        — stops "this looks like Chinese page text" heuristics
           aria-hidden keeps a purely decorative mark out of the accessibility tree. */
        el.setAttribute('translate', 'no')
        el.setAttribute('lang', 'en')
        el.setAttribute('aria-hidden', 'true')
        el.className = 'notranslate'
        styleWatermark(el, target.mode)
        target.parent.appendChild(el)
        watermarkEl = el
        watermarkHost = target.parent
      } else if (!shouldShow && watermarkEl) {
        if (watermarkEl.parentNode) watermarkEl.parentNode.removeChild(watermarkEl)
        watermarkEl = null
        watermarkHost = null
      }
      // While visible, follow the headline every frame (page switches, sidebar
      // width changes, animations) — no reliance on observer timing. The persist
      // placement is pure CSS, so it needs no frame loop.
      const needsLoop = watermarkEl !== null && watermarkEl.getAttribute('data-endfield-watermark') === 'hero'
      if (needsLoop && !watermarkRaf && typeof requestAnimationFrame === 'function') {
        watermarkRaf = requestAnimationFrame(watermarkRafLoop)
      } else if (!needsLoop && watermarkRaf !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(watermarkRaf)
        watermarkRaf = null
      }
    }
    const onWatermarkResize = () => { if (watermarkEl) positionWatermark() }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', onWatermarkResize)
    }
    let watermarkObserver = null
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.body) {
      watermarkObserver = new MutationObserver(() => syncWatermarkVisibility())
      watermarkObserver.observe(document.body, { childList: true, subtree: true })
    }

    /* ---------- boot loading screen (settings-toggleable, default OFF) ----------
       Recreates the Endfield launcher boot screen: a full-viewport black plate with
       an 8px signal-yellow progress rail down the left edge, a meter group (tick +
       percentage + status line) that rides the fill end, and the centred ENDFIELD
       wordmark. It plays once per page load, then fades out and removes itself.

       Default OFF as requested: a loading plate that covers the app is opt-in, and
       an off switch must cost nothing, so nothing is built or timed until enabled.

       Geometry is not guessed — it is measured off the reference frame (1340x731):
         rail width 8px, fill 57.5% of viewport height at the captured moment,
         meter left edge x=24, tick 4x15px, digits cap-height 28px (~39px Arial),
         status line 15px below the digits in #666.
       Those ratios are reproduced here as em/percentage values so they hold at any
       viewport size. */
    const LOADER_KEY = 'dsh-theme-endfield-loader'
    // Default OFF (=== '1' rather than !== '0'): opt-in, per the request.
    const isLoaderOn = () => (typeof localStorage !== 'undefined' && localStorage.getItem(LOADER_KEY)) === '1'
    let loaderEl = null
    let loaderRaf = null
    let loaderTick = null
    let loaderFuse = null
    let loaderExitTimer = null
    // Last-resort hard kill. Deliberately NOT cleared by clearLoaderTimers(): the
    // completion flourish calls that to stop the progress clocks, and this timer has
    // to outlive it so a stalled flourish can still never leave the app covered.
    let loaderKill = null
    let loaderDone = false
    const clearLoaderTimers = () => {
      if (loaderRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(loaderRaf)
      loaderRaf = null
      if (loaderTick !== null && typeof clearInterval === 'function') clearInterval(loaderTick)
      loaderTick = null
      if (loaderFuse !== null && typeof clearTimeout === 'function') clearTimeout(loaderFuse)
      loaderFuse = null
      if (loaderExitTimer !== null && typeof clearTimeout === 'function') clearTimeout(loaderExitTimer)
      loaderExitTimer = null
    }
    /** Remove the plate and release every timer/handle it owns. Idempotent. */
    const destroyLoader = () => {
      clearLoaderTimers()
      if (loaderKill !== null && typeof clearTimeout === 'function') clearTimeout(loaderKill)
      loaderKill = null
      if (loaderEl && loaderEl.parentNode) loaderEl.parentNode.removeChild(loaderEl)
      loaderEl = null
    }
    /* One boot animation. The progress value is derived from elapsed WALL-CLOCK time,
       never accumulated per frame, so it cannot drift.

       Two clocks drive the same `step`, deliberately:
         requestAnimationFrame — smooth, vsync-aligned updates while the tab paints;
         setInterval           — a coarse fallback that keeps advancing when rAF is
                                 throttled or suspended (background/occluded tab, an
                                 embedded webview, a headless renderer that stops
                                 painting after first paint).
       rAF alone is NOT safe here: when it stalls, a full-screen plate would stay on
       screen forever. Because progress is time-based and `step` is idempotent for a
       given instant, running from both clocks is harmless — whichever fires first
       just renders the current value.

       `loaderFuse` is the last line of defence: a single timeout that force-finishes
       the plate even if both clocks stop, so the app can never stay covered. */
    const runLoader = () => {
      if (loaderDone || loaderEl !== null) return
      if (typeof document === 'undefined') return
      // The plate is a <body> child. If the client bundle is evaluated before the
      // body exists, defer to DOMContentLoaded instead of silently skipping the
      // animation (loaderDone stays false, so the retry is the real first run).
      if (!document.body) {
        if (typeof document.addEventListener === 'function') {
          document.addEventListener('DOMContentLoaded', () => { runLoader() }, { once: true })
        }
        return
      }
      loaderDone = true

      const el = document.createElement('div')
      el.setAttribute('data-endfield-loader', '')
      // Same translation-proofing as the watermark: every glyph the plate shows is
      // brand/UI chrome drawn from CSS `content` or set as textContent on elements
      // marked notranslate, so "translate this page" cannot rewrite ENDFIELD.
      el.setAttribute('translate', 'no')
      el.setAttribute('lang', 'en')
      el.setAttribute('aria-hidden', 'true')
      el.className = 'notranslate'
      /* Poster layout, following the supplied key-art reference (1184x685).
         The brand block is a LEFT-aligned stack that sits in the right third of
         the plate: kicker, END, FIELD, then a detail cluster and the tagline, all
         sharing one left rhythm line. No localized chip — the reference wordmark is
         latin-only, so every glyph here comes from CSS content() and the plate
         carries no translatable DOM text at all.
         The meter (tick + percent + status) RIDES THE FILL END: its top follows the
         rail's fill height, matching the launcher reference where the readout sits
         just under the leading edge of the yellow bar.
         `-wipe` is the completion flourish: once the rail reaches 100% it expands
         from the rail into a full-screen yellow sweep to the right, then the whole
         plate fades out. It is a separate layer so the sweep can cover the brand
         block and meter without disturbing their layout. */
      el.innerHTML =
        '<div data-endfield-loader-tex></div>' +
        '<div data-endfield-loader-track></div>' +
        '<div data-endfield-loader-fill></div>' +
        '<div data-endfield-loader-meter>' +
        '<span data-endfield-loader-tick></span>' +
        '<span data-endfield-loader-pct></span>' +
        '<span data-endfield-loader-status></span>' +
        '</div>' +
        '<div data-endfield-loader-brand>' +
        '<span data-endfield-loader-kicker></span>' +
        '<span data-endfield-loader-word data-endfield-loader-word1></span>' +
        '<span data-endfield-loader-word data-endfield-loader-word2></span>' +
        '<span data-endfield-loader-detail>' +
        '<span data-endfield-loader-chev></span>' +
        '<span data-endfield-loader-sub></span>' +
        '<span data-endfield-loader-seq></span>' +
        '<span data-endfield-loader-squares>' +
        '<i data-on></i><i data-on></i><i data-on></i><i></i><i></i><i></i>' +
        '<i data-on></i><i data-on></i><i></i><i></i><i></i><i></i>' +
        '</span>' +
        '</span>' +
        '<span data-endfield-loader-tag></span>' +
        '</div>' +
        '<div data-endfield-loader-wipe></div>'
      document.body.appendChild(el)
      loaderEl = el

      const fill = el.querySelector('[data-endfield-loader-fill]')
      const meter = el.querySelector('[data-endfield-loader-meter]')
      const pct = el.querySelector('[data-endfield-loader-pct]')
      const status = el.querySelector('[data-endfield-loader-status]')
      const DURATION = 1750
      const start = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now()
      const now = () => ((typeof performance !== 'undefined' && typeof performance.now === 'function') ? performance.now() : Date.now())
      /* Completion sequence, in order:
           WIPE_MS  the rail expands rightward into a full-screen yellow sweep;
           EXIT_MS  the whole plate (yellow included) fades to transparent.
         The fuse below must outlast WIPE_MS + EXIT_MS, or it would tear the plate
         down mid-flourish. */
      const WIPE_MS = 520
      const EXIT_MS = 620
      let finished = false
      /* Play the yellow sweep, then fade out, then remove. Guarded so the two clocks
         plus the fuse can all reach the end without stacking timers, restarting the
         sweep, or double-removing the node.

         Both phases are driven from JS on the same dual-clock/wall-clock basis as
         the progress ramp, NOT from a CSS transition. Measured reason: a CSS
         transition is not a reliable animation primitive in every renderer this
         plate can run in — in the verification renderer a transition declared this
         way emitted no transitionrun/start/end events at all and the computed width
         stayed pinned at its start value indefinitely, which would leave a 10px
         stub on screen instead of a sweep. Driving it here means the flourish
         advances wherever the progress ramp advances, and it stays measurable. */
      const finish = () => {
        if (finished) return
        finished = true
        // Stop the progress clocks but keep the plate: the flourish reuses these
        // handles, so clearLoaderTimers() must not be what tears the node down.
        clearLoaderTimers()
        if (!loaderEl) return
        const el = loaderEl
        const wipeEl = el.querySelector('[data-endfield-loader-wipe]')
        const hasRaf = typeof requestAnimationFrame === 'function'
        const hasTimeout = typeof window !== 'undefined' && typeof window.setTimeout === 'function'
        // Someone who asked for less motion gets the plate gone, not a flourish.
        const reduceMotion = typeof window !== 'undefined'
          && typeof window.matchMedia === 'function'
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (reduceMotion || (!hasRaf && !hasTimeout)) { destroyLoader(); return }
        el.setAttribute('data-endfield-loader-wiping', '')
        // JS owns opacity from here, so the stylesheet transition must not fight it.
        el.style.transition = 'none'
        const t0 = now()
        const plateW = el.clientWidth || 0
        const RAIL = 10
        let exitMarked = false
        const flourish = () => {
          if (!loaderEl) return
          const elapsed = now() - t0
          // phase 1 — sweep out of the rail across the full width
          const wt = Math.min(1, elapsed / WIPE_MS)
          const eased = 1 - Math.pow(1 - wt, 3)
          if (wipeEl) {
            wipeEl.style.opacity = '1'
            wipeEl.style.width = (RAIL + eased * Math.max(0, plateW - RAIL)).toFixed(1) + 'px'
          }
          // phase 2 — fade the whole plate, yellow included
          const fadeMs = elapsed - WIPE_MS
          if (fadeMs > 0) {
            if (!exitMarked) { exitMarked = true; el.setAttribute('data-endfield-loader-exit', '') }
            el.style.opacity = Math.max(0, 1 - fadeMs / EXIT_MS).toFixed(3)
          }
          if (elapsed >= WIPE_MS + EXIT_MS) { destroyLoader(); return }
          loaderRaf = hasRaf ? requestAnimationFrame(flourish) : null
        }
        // First frame synchronously so the sweep never starts from a blank frame.
        flourish()
        if (typeof setInterval === 'function') loaderTick = setInterval(flourish, 30)
        if (hasTimeout) loaderExitTimer = window.setTimeout(destroyLoader, WIPE_MS + EXIT_MS + 400)
      }
      const step = () => {
        if (finished || !loaderEl) return
        const t = Math.min(1, (now() - start) / DURATION)
        // easeOutCubic: quick climb, gentle settle onto 100%.
        const eased = 1 - Math.pow(1 - t, 3)
        const value = Math.round(eased * 100)
        const shown = value + '%'
        if (fill) fill.style.height = (eased * 100).toFixed(2) + '%'
        /* Meter follows the fill's leading edge, driven by the SAME eased value so
           the bar and its readout can never disagree. Positioned in px and clamped:
           the group is ~90px tall, so a raw percentage would push it off the bottom
           of the screen as the fill nears 100%. GAP keeps the tick just below the
           leading edge (per the reference, the readout trails the edge). */
        if (meter) {
          const plateH = loaderEl.clientHeight || 0
          const meterH = meter.offsetHeight || 0
          const GAP = 10
          const raw = eased * plateH + GAP
          const maxTop = Math.max(0, plateH - meterH - 12)
          meter.style.top = Math.min(raw, maxTop).toFixed(1) + 'px'
        }
        if (pct && pct.textContent !== shown) pct.textContent = shown
        if (status) {
          const label = value < 45 ? 'Connecting...' : (value < 99 ? 'Updating...' : 'Ready')
          if (status.textContent !== label) status.textContent = label
        }
        if (t >= 1) {
          // Hold the completed frame for a beat so 100% is actually readable.
          if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
            if (loaderExitTimer === null) loaderExitTimer = window.setTimeout(finish, 220)
          } else finish()
          return
        }
        loaderRaf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(step) : null
      }
      // Paint the first frame synchronously: the plate must never flash at 0%/empty.
      step()
      // Clock 2: coarse fallback that survives rAF throttling.
      if (typeof setInterval === 'function') loaderTick = setInterval(step, 60)
      if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
        // Fuse: if both progress clocks stall, force the completion sequence.
        loaderFuse = window.setTimeout(() => { finished = false; finish() }, DURATION + 1600)
        // Hard kill: covers the flourish itself stalling (a suspended tab can hold a
        // CSS transition indefinitely). Outlasts fuse + wipe + fade, then removes the
        // node unconditionally, so the app can never stay covered.
        loaderKill = window.setTimeout(destroyLoader, DURATION + 1600 + WIPE_MS + EXIT_MS + 400)
      } else if (loaderRaf === null && loaderTick === null) {
        destroyLoader()
      }
    }

    let disposeToken = () => {}
    let disposeStyles = () => {}
    let mounted = false
    const mount = () => {
      if (mounted) return
      mounted = true
      disposeToken = theme.overrideTokens('edge-intelligence-theme', {
      '--dsw-alias-bg-base': {
        light: '#e8e8e2',
        dark: '#101110',
      },
      '--dsw-alias-bg-layer-1': {
        light: '#f2f2ec',
        dark: '#181a18',
      },
      '--dsw-alias-bg-layer-2': {
        light: '#dcddd6',
        dark: '#1e201d',
      },
      '--dsw-alias-bg-overlay': {
        light: '#f2f2ec',
        dark: '#1c1e1c',
      },
      '--dsw-alias-border-l1': {
        light: '#d8d9d5',
        dark: '#343633',
      },
      '--dsw-alias-border-l2': {
        light: '#b6b8b3',
        dark: '#4a4d49',
      },
      '--dsw-alias-brand-primary': {
        light: '#101110',
        dark: '#fff500',
      },
      '--dsw-alias-label-primary': {
        light: '#101110',
        dark: '#f5f5f0',
      },
      '--dsw-alias-label-secondary': {
        light: '#4a4c48',
        dark: '#898d89',
      },
      '--dsw-alias-state-error-primary': {
        light: '#ff3b30',
        dark: '#ff6b61',
      },
      '--dsw-alias-state-success-primary': {
        light: '#2f9e44',
        dark: '#4fbf5c',
      },
      '--dsw-alias-state-warn-primary': {
        light: '#d9822b',
        dark: '#ffb700',
      },
      '--dsw-specific-sidebar-fill': {
        light: '#e8e8e2',
        dark: '#101110',
      },
    })

    disposeStyles = insertCss(`
      :root {
        --dsw-font-family: Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
        --ds-font-family-code: 'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', Menlo, Courier, 'PingFang SC', 'Microsoft YaHei';
        --edge-signal: #fff500;
        --edge-signal-dim: rgba(255, 245, 0, 0.7);
        --edge-paper: var(--dsw-alias-bg-base);
        --edge-panel: var(--dsw-alias-bg-layer-1);
        --edge-line: var(--dsw-alias-border-l1);
        --edge-soft: var(--dsw-alias-bg-layer-2);
      }
      body {
        font-feature-settings: "tnum" 1, "ss01" 1;
        font-variant-ligatures: no-common-ligatures;
      }
      /* The persist-mode watermark is a z-index:-1 child of the conversation column.
         Two properties are needed on that column, and only while the mark is mounted
         there (the :has() guard makes this a no-op whenever the feature is off):
           isolation: isolate — without a stacking context, z-index:-1 escapes to the
             nearest ancestor context and paints behind the column's own opaque
             background, i.e. invisible.
           position: relative — the column ships as position:static, so an absolutely
             positioned child would resolve against the app frame instead and spill
             across the sidebar. This makes the column the containing block so
             inset:0 means "exactly this column".
         Every absolute descendant the app itself renders (header:after, tab:after,
         heroGlow, the overlay composer seat) already has a positioned ancestor
         nearer than this column, so their containing blocks are unchanged. */
      [class*='wSkVaW_root']:has(> [data-endfield-watermark]) {
        isolation: isolate;
        position: relative;
      }
      /* The mark sits behind text, so it must never intercept selection or clicks. */
      [data-endfield-watermark] {
        pointer-events: none !important;
      }
      /* Translation-proof glyphs: the wordmark is drawn from the CSS 'content'
         property, not a DOM text node, so page translators (which walk text nodes)
         have nothing to rewrite — the brand name cannot be turned into "终末地" or
         similar. The element's own text stays empty; ::before carries the letters. */
      [data-endfield-watermark]::before {
        content: 'ENDFIELD';
        display: block;
        white-space: nowrap;
      }
      ::selection {
        color: #000;
        background: var(--edge-signal, #fff500);
      }
      /* Square corners (default): zero EVERY classed element, then restore circles/pills below.
         body.theme-endfield-round disables all of this and restores app-native rounding. */
      body:not(.theme-endfield-round) button,
      body:not(.theme-endfield-round) input,
      body:not(.theme-endfield-round) textarea,
      body:not(.theme-endfield-round) select,
      body:not(.theme-endfield-round) [role='button'],
      body:not(.theme-endfield-round) [role='dialog'],
      body:not(.theme-endfield-round) [role='menu'],
      body:not(.theme-endfield-round) [role='tooltip'],
      body:not(.theme-endfield-round) [role='tab'] {
        border-radius: 0 !important;
      }
      body:not(.theme-endfield-round) [class] {
        border-radius: 0 !important;
      }
      body:not(.theme-endfield-round) [class*='avatar'],
      body:not(.theme-endfield-round) [class*='Avatar'],
      body:not(.theme-endfield-round) [class*='spinner'],
      body:not(.theme-endfield-round) [class*='Spinner'],
      body:not(.theme-endfield-round) [class*='dot'],
      body:not(.theme-endfield-round) [class*='Dot'],
      body:not(.theme-endfield-round) [class*='actionButton' i],
      body:not(.theme-endfield-round) [class$='_iconButton'] {
        border-radius: 50% !important;
      }
      body:not(.theme-endfield-round) [class*='scrollbar'],
      body:not(.theme-endfield-round) [class*='Scrollbar'] {
        border-radius: 0 !important;
      }
      * {
        scrollbar-width: thin;
        scrollbar-color: var(--edge-line) transparent;
      }
      /* ---------- Light mode: deepen tertiary/secondary labels for icon visibility ---------- */
      body:not([data-ds-dark-theme]) {
        --dsw-alias-label-tertiary: #6a6d68;
        --dsw-alias-label-caption: #5a5d58;
        --dsw-alias-label-dimmed: #9a9d98;
        --edge-btn-muted: #dcddd6;
      }
      /* ---------- Neutralize remaining DeepSeek brand blues ---------- */
      body {
        --dsw-static-deepseek-50: #dcddd6;
        --dsw-static-deepseek-100: #dcddd6;
        --dsw-static-deepseek-200: #d8d9d5;
        --dsw-static-deepseek-300: #c8cac5;
        --dsw-static-deepseek-400: #757874;
        --dsw-static-deepseek-450: #d9c700;
        --dsw-static-deepseek-500: #101110;
        --dsw-static-deepseek-600: #101110;
        --dsw-static-deepseek-800: #3a3c38;
        --dsw-static-deepseek-900: #2a2c2a;
        --dsw-static-blue-900: #101110;
        --dsw-alias-button-info-fill: #101110;
        --dsw-alias-button-info-hover: #2a2b28;
        --dsw-alias-state-business-primary: #101110;
        --dsw-alias-state-business-tertiary: rgba(255, 245, 0, 0.14);
        --dsw-alias-brand-primary-new-colorprimary-new-color: #101110;
        --dsw-alias-label-primary-bluish: #101110;
        --dsw-specific-bubble: #f2f2ec;
        --dsw-specific-bubble-highlight: #dcddd6;
        --dsw-specific-sidebar-nav-item-active-accent: #101110;
        --dsw-alias-interactive-bg-hover-accent: rgba(255, 245, 0, 0.14);
        --dsw-alias-border-l3: #b6b8b3;
        --dsw-alias-border-l4: #9a9d98;
      }
      body[data-ds-dark-theme] {
        --dsw-static-deepseek-50: #242624;
        --dsw-static-deepseek-100: #242624;
        --dsw-static-deepseek-200: #2f312e;
        --dsw-static-deepseek-300: #3a3c38;
        --dsw-static-deepseek-400: #898d89;
        --dsw-static-deepseek-450: #fff500;
        --dsw-static-deepseek-500: #f5f5f0;
        --dsw-static-deepseek-600: #d8d9d5;
        --dsw-static-deepseek-800: #343633;
        --dsw-static-deepseek-900: #242624;
        --dsw-static-blue-900: #f5f5f0;
        --dsw-alias-button-info-fill: #fff500;
        --dsw-alias-button-info-hover: #fff500;
        --dsw-alias-state-business-primary: #fff500;
        --dsw-alias-state-business-tertiary: rgba(255, 245, 0, 0.22);
        --dsw-alias-brand-primary-new-colorprimary-new-color: #fff500;
        --dsw-alias-label-primary-bluish: #f5f5f0;
        --dsw-specific-bubble: #181a18;
        --dsw-specific-bubble-highlight: #242624;
        --dsw-specific-sidebar-nav-item-active-accent: #fff500;
        --dsw-alias-interactive-bg-hover-accent: rgba(255, 245, 0, 0.22);
        --dsw-alias-border-l3: #4f534f;
        --dsw-alias-border-l4: #5f6460;
        --edge-btn-muted: #3a3c38;
      }
      /* ---------- Signal yellow everywhere (light: visible but soft) ---------- */
      body {
        --dsw-alias-interactive-bg-hover: rgba(255, 245, 0, 0.16);
        --dsw-alias-interactive-bg-active: rgba(255, 245, 0, 0.26);
        --dsw-alias-interactive-bg-hover-solid: #fff500;
        --dsw-alias-bg-multi-select: rgba(255, 245, 0, 0.16);
        --dsw-alias-bg-skeleton: rgba(255, 245, 0, 0.12);
        --dsw-alias-markdown-citation: rgba(255, 245, 0, 0.16);
        --dsw-alias-markdown-code-block-banner: rgba(255, 245, 0, 0.10);
        --dsw-alias-markdown-code-segment-selected: rgba(255, 245, 0, 0.22);
        --dsw-alias-markdown-code-segment-unselected: rgba(255, 245, 0, 0.06);
        --dsw-alias-markdown-inline-code: rgba(255, 245, 0, 0.14);
        --dsw-alias-markdown-tag: rgba(255, 245, 0, 0.18);
        --dsw-alias-scrollbar-bg-l1: transparent;
        --dsw-alias-scrollbar-bg-l2: transparent;
        --dsw-alias-scrollbar-hover-l1: #fff500;
        --dsw-alias-scrollbar-hover-l2: #fff500;
        --dsw-specific-sidebar-nav-item-active: rgba(255, 245, 0, 0.16);
        --dsw-specific-sidebar-nav-item-hover: rgba(255, 245, 0, 0.12);
      }
      body[data-ds-dark-theme] {
        --dsw-alias-interactive-bg-hover: rgba(255, 245, 0, 0.18);
        --dsw-alias-interactive-bg-active: rgba(255, 245, 0, 0.28);
        --dsw-alias-interactive-bg-hover-solid: #fff500;
        --dsw-alias-bg-multi-select: rgba(255, 245, 0, 0.18);
        --dsw-alias-bg-skeleton: rgba(255, 245, 0, 0.14);
        --dsw-alias-markdown-citation: rgba(255, 245, 0, 0.20);
        --dsw-alias-markdown-code-block-banner: rgba(255, 245, 0, 0.12);
        --dsw-alias-markdown-code-segment-selected: rgba(255, 245, 0, 0.26);
        --dsw-alias-markdown-code-segment-unselected: rgba(255, 245, 0, 0.08);
        --dsw-alias-markdown-inline-code: rgba(255, 245, 0, 0.18);
        --dsw-alias-markdown-tag: rgba(255, 245, 0, 0.22);
        --dsw-alias-scrollbar-bg-l1: transparent;
        --dsw-alias-scrollbar-bg-l2: transparent;
        --dsw-alias-scrollbar-hover-l1: #fff500;
        --dsw-alias-scrollbar-hover-l2: #fff500;
        --dsw-specific-sidebar-nav-item-active: rgba(255, 245, 0, 0.20);
        --dsw-specific-sidebar-nav-item-hover: rgba(255, 245, 0, 0.16);
      }
      input, textarea, [contenteditable='true'] {
        caret-color: #fff500;
      }
      :focus-visible {
        outline: 2px solid #fff500 !important;
        outline-offset: 1px;
      }
      a {
        text-decoration-thickness: 1px;
      }
      a:hover {
        text-decoration-color: #fff500;
      }
      body[data-ds-dark-theme] a:hover {
        color: #fff500;
      }
      ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      ::-webkit-scrollbar-thumb {
        border-radius: 0;
        background: var(--edge-line);
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #fff500 !important;
      }
      ::-webkit-scrollbar-track {
        background: transparent;
      }
      /* ---------- Hover text contrast (reference page inversion) ---------- */
      /* Note: plain buttons are excluded — their own fill/text color must survive hover
         (e.g. yellow toggle button keeps black text; white-on-dark send button stays white). */
      :is([role='tab'], [role='menuitem'], [role='option'], [role='link'], [role='treeitem'], [role='checkbox'], [role='switch'], [role='radio'], [role='combobox'], [class*='nav-item' i], [class*='menu-item' i], [class*='list-item' i], [class*='session-item' i], [class*='workspace-item' i], [class*='search-result' i], [class*='item' i], [class*='tab' i], [class*='card' i], [class*='row' i], [class*='tool' i], [class*='composer' i]):hover {
        color: var(--dsw-alias-label-primary) !important;
      }
      /* ---------- Workspace browser rows (YDXeBa) ---------- */
      .YDXeBa_slot {
        color: var(--dsw-alias-brand-primary) !important;
      }
      .YDXeBa_projectRow:hover,
      .YDXeBa_sessionRow:hover,
      .YDXeBa_sessionRow.YDXeBa_selected,
      .YDXeBa_searchResultRow:hover,
      .YDXeBa_searchResultRow.YDXeBa_selected {
        background: rgba(255, 245, 0, 0.22) !important;
      }
      .YDXeBa_projectRow:hover *,
      .YDXeBa_sessionRow:hover *,
      .YDXeBa_sessionRow.YDXeBa_selected *,
      .YDXeBa_searchResultRow:hover *,
      .YDXeBa_searchResultRow.YDXeBa_selected * {
        color: #000 !important;
      }
      /* ---------- Light mode: workspace folder / icon buttons ink ---------- */
      body:not([data-ds-dark-theme]) .YDXeBa_folder,
      body:not([data-ds-dark-theme]) .YDXeBa_folderActive,
      body:not([data-ds-dark-theme]) .YDXeBa_chevron,
      body:not([data-ds-dark-theme]) .YDXeBa_arrow,
      body:not([data-ds-dark-theme]) .YDXeBa_iconButton,
      body:not([data-ds-dark-theme]) .qDHVXG_iconButton,
      body:not([data-ds-dark-theme]) .qDHVXG_searchButton,
      body:not([data-ds-dark-theme]) .qDHVXG_clearButton {
        color: #101110 !important;
      }
      /* ---------- Dark mode: solid signal-yellow inversions ---------- */
      body[data-ds-dark-theme] .YDXeBa_projectRow:hover,
      body[data-ds-dark-theme] .YDXeBa_sessionRow:hover,
      body[data-ds-dark-theme] .YDXeBa_sessionRow.YDXeBa_selected,
      body[data-ds-dark-theme] .YDXeBa_searchResultRow:hover,
      body[data-ds-dark-theme] .YDXeBa_searchResultRow.YDXeBa_selected {
        background: #fff500 !important;
      }
      body[data-ds-dark-theme] [class*='badge' i]:hover,
      body[data-ds-dark-theme] [class*='badge' i][data-active] {
        background: #fff500 !important;
      }
      /* ---------- Dark mode: icon buttons (plus / ellipsis / stop / actions) ---------- */
      /* The cordis approval trio is EXCLUDED here. Those three buttons carry their own
         solid fill (signal yellow for approve, error red for decline) from the approval
         block below, so a signal-yellow glyph renders yellow-on-yellow — an invisible
         check. A 'body[data-ds-dark-theme] [attr]' selector (0,2,1) also outranks the
         plain '[data-cordis-approve]' (0,1,0) rules below, so source order cannot undo it:
         the exclusion has to happen in this selector. Their ink is set below. */
      body[data-ds-dark-theme] [class$='_iconButton'],
      body[data-ds-dark-theme] [data-cordis-switch],
      body[data-ds-dark-theme] [class*='actionButton' i]:not([data-cordis-approve]):not([data-cordis-approve-plugin]):not([data-cordis-decline]) {
        color: #fff500 !important;
      }
      body[data-ds-dark-theme] [class$='_iconButton']:hover:not(:disabled),
      body[data-ds-dark-theme] [data-cordis-switch]:hover:not(:disabled),
      body[data-ds-dark-theme] [class*='actionButton' i]:not([data-cordis-approve]):not([data-cordis-approve-plugin]):not([data-cordis-decline]):hover:not(:disabled) {
        color: #000 !important;
        background: #fff500 !important;
      }
      /* ---------- Cordis approval buttons (allow once / allow plugin / decline) ---------- */
      /* Each button is a solid chip, so its glyph must contrast with its OWN fill:
         black check on signal yellow, white X on error red. The icons are
         fill="currentColor" svg paths, so 'color' alone drives the glyph — but the
         svg/path are also targeted explicitly, because any inherited-color rule that
         wins on a descendant would otherwise repaint the glyph and hide it again. */
      [data-cordis-approve],
      [data-cordis-approve-plugin],
      [data-cordis-approve] svg,
      [data-cordis-approve-plugin] svg,
      [data-cordis-approve] svg path,
      [data-cordis-approve-plugin] svg path {
        color: #101110 !important;
        fill: currentColor !important;
      }
      [data-cordis-approve],
      [data-cordis-approve-plugin] {
        background: #fff500 !important;
      }
      [data-cordis-decline],
      [data-cordis-decline] svg,
      [data-cordis-decline] svg path {
        color: #fff !important;
        fill: currentColor !important;
      }
      [data-cordis-decline] {
        background: var(--dsw-alias-state-error-primary) !important;
      }
      /* The second check of the double-check icon is dimmed to .7 opacity by the panel's
         own stylesheet; on the solid chip keep both strokes at full ink. */
      [data-cordis-approve-plugin] [class$='_doubleCheck'] svg {
        opacity: 1 !important;
      }
      [data-cordis-approve]:hover:not(:disabled),
      [data-cordis-approve-plugin]:hover:not(:disabled) {
        background: #e8e000 !important;
      }
      [data-cordis-decline]:hover:not(:disabled) {
        background: #d6281d !important;
      }
      /* ---------- Tables: bright signal-yellow hover (reference .data-table) ---------- */
      [class*='tableScroll' i] th,
      [class*='table' i] th {
        background: var(--edge-soft) !important;
        border-bottom-color: var(--edge-line) !important;
      }
      [class*='tableScroll' i] td,
      [class*='table' i] td {
        border-bottom-color: var(--edge-line) !important;
      }
      tbody tr:hover,
      tbody tr:hover *,
      [class*='table' i] tbody tr:hover,
      [class*='table' i] tbody tr:hover *,
      [class*='tableScroll' i] tbody tr:hover,
      [class*='tableScroll' i] tbody tr:hover * {
        color: #000 !important;
        background: #fff500 !important;
      }
      /* ---------- New session button (sidebar) ---------- */
      [class$='_newSession'] {
        color: #000 !important;
        background: #fff500 !important;
        border-color: #fff500 !important;
      }
      body:not(.theme-endfield-round) [class$='_newSession'] {
        border-radius: 0 !important;
      }
      [class$='_newSession']:hover,
      [class$='_newSession']:focus-visible {
        color: #000 !important;
        background: #e8e000 !important;
        border-color: #e8e000 !important;
      }
      [class$='_newSession'] svg {
        color: #000 !important;
      }
      [class$='_newSessionLabel'] {
        color: #000 !important;
      }
      /* ---------- Badge hover: signal-yellow inversion (reference .kpi:hover) ---------- */
      [class*='badge' i]:hover,
      [class*='badge' i]:hover *,
      [class*='badge' i][data-active],
      [class*='badge' i][data-active] * {
        color: #000 !important;
      }
      /* ---------- Cordis action buttons (run/stop) ---------- */
      /* Approval chips excluded again: they already own a solid fill, and this blanket
         hover would repaint the decline chip yellow and re-tint the approve glyphs. */
      [data-cordis-switch]:hover:not(:disabled),
      [class*='actionButton' i]:not([data-cordis-approve]):not([data-cordis-approve-plugin]):not([data-cordis-decline]):hover:not(:disabled) {
        color: #000 !important;
        background: #fff500 !important;
      }
      body:not(.theme-endfield-round) [data-cordis-switch],
      body:not(.theme-endfield-round) [class*='actionButton' i] {
        border-radius: 999px !important;
      }
      /* ---------- Session header actions (agent preset / subagent / jobs) ---------- */
      [class$='_trigger']:hover:not(:disabled),
      [class$='_trigger'][aria-expanded='true'],
      [class$='_trigger']:focus-visible {
        color: #000 !important;
        background: #fff500 !important;
      }
      /* ---------- Agent-preset header chip: signal yellow, stretches to fill the action row ---------- */
      /* (scoped: the old broad [class$='_label'] rule yellowed plain text labels like 产物/settings/jobs names) */
      .SVAs4q_label {
        color: #000 !important;
        background: #fff500 !important;
        flex: 1 1 auto !important;
        max-width: none !important;
        justify-content: center !important;
        padding: 0 12px !important;
      }
      body:not(.theme-endfield-round) .SVAs4q_label {
        border-radius: 0 !important;
      }
      .SVAs4q_label .SVAs4q_icon,
      .SVAs4q_label svg {
        opacity: 1 !important;
        color: #000 !important;
      }
      /* ================= dark compaction notice + residual blues ================= */
      /* Dark mode: warm label grays (compaction notice title/summary/sep used bluish defaults) */
      body[data-ds-dark-theme] {
        --dsw-alias-label-tertiary: #9a9d98;
        --dsw-alias-label-caption: #a4a6a1;
        --dsw-alias-label-dimmed: #70736f;
        --dsw-alias-label-primary-dimmed: #d8d9d5;
        --dsw-alias-label-primary-inverted: #101110;
      }
      /* Preset menu descriptions readable without hover in dark */
      body[data-ds-dark-theme] [class$='_itemDesc'] {
        color: #c5c7c2 !important;
      }
      /* Light + dark: warm the remaining bluish-gray surfaces / buttons / code blocks */
      body {
        --dsw-alias-bg-layer-3: #dcddd6;
        --dsw-alias-bg-module-platform: #f2f2ec;
        --dsw-alias-markdown-code-block: #ecece6;
        --dsw-alias-button-elevated-fill: #f2f2ec;
        --dsw-alias-button-floating-fill: #f2f2ec;
        --dsw-alias-button-floating-hover: #e8e8e2;
        --dsw-alias-button-ghost-active-fill: #dcddd6;
        --dsw-alias-button-ghost-active-hover: #d8d9d5;
        --dsw-alias-button-ghost-active-border: #b6b8b3;
        --dsw-alias-button-primary-hover: #2a2b28;
        --dsw-alias-button-contrast-fill: #3a3c38;
        --dsw-alias-tooltip-bg: #2a2b28;
        --dsw-specific-input-major: #f2f2ec;
        --dsw-specific-selector: #e8e8e2;
        --dsw-specific-tip: #e8e8e2;
        --dsw-static-blue-400: #757874;
        --dsw-static-blue-450: #fff500;
        --dsw-static-blue-500: #101110;
        --dsw-alias-label-quaternary: #6a6d68;
        --dsw-alias-label-error: #ff3b30;
        --dsw-alias-label-inverse: #101110;
        --dsw-alias-line-secondary: #d8d9d5;
        --dsw-alias-separator-primary: #9a9d98;
        --dsw-alias-border-secondary: #b6b8b3;
        --dsw-alias-bg-primary: #f2f2ec;
        --dsw-alias-interactive-bg-primary: #fff500;
        --dsw-alias-fill-l2: #dcddd6;
        --dsw-alias-fill-tsp-secondary: #dcddd6;
      }
      body[data-ds-dark-theme] {
        --dsw-alias-bg-layer-3: #2c2e2a;
        --dsw-alias-bg-module-platform: #2c2e2a;
        --dsw-alias-bg-layer-2: #1e201d;
        --dsw-alias-markdown-code-block: #181a18;
        --dsw-alias-button-elevated-fill: #3a3c38;
        --dsw-alias-button-floating-fill: #343633;
        --dsw-alias-button-floating-hover: #3a3c38;
        --dsw-alias-button-ghost-active-fill: #343633;
        --dsw-alias-button-ghost-active-hover: #3f413d;
        --dsw-alias-button-ghost-active-border: #5f6460;
        --dsw-alias-button-primary-hover: #e8e000;
        --dsw-alias-button-contrast-fill: #f5f5f0;
        --dsw-alias-tooltip-bg: #2a2b28;
        --dsw-specific-input-major: #202220;
        --dsw-specific-selector: #2c2e2a;
        --dsw-specific-tip: #2c2e2a;
        --dsw-static-blue-400: #9a9d98;
        --dsw-static-blue-450: #fff500;
        --dsw-static-blue-500: #f5f5f0;
        --dsw-alias-label-quaternary: #9a9d98;
        --dsw-alias-label-error: #ff6b61;
        --dsw-alias-label-inverse: #101110;
        --dsw-alias-line-secondary: #343633;
        --dsw-alias-separator-primary: #70736f;
        --dsw-alias-border-secondary: #4a4d49;
        --dsw-alias-bg-primary: #181a18;
        --dsw-alias-interactive-bg-primary: #fff500;
        --dsw-alias-fill-l2: #242624;
        --dsw-alias-fill-tsp-secondary: #242624;
      }
      /* Token meter: messages segment signal yellow, system warm gray (tools keeps purple) */
      .JObwrW_colorMessages {
        --meter-tint: #fff500 !important;
      }
      .JObwrW_colorSystem {
        --meter-tint: #9a9d98 !important;
      }
      /* Appearance theme cube selected border: warm */
      ._8HJdBW_selected {
        border-color: var(--dsw-alias-border-l2) !important;
      }
      /* Hero preview badge: solid signal-yellow + black (reference accent chip) */
      .pXSMma_previewBadge {
        color: #101110 !important;
        background: #fff500 !important;
        border-color: #fff500 !important;
      }
      /* ---------- Hero backdrop glow: brand blue -> signal yellow ----------
         The empty-conversation hero paints one large blurred ellipse behind the
         composer card (ConversationRoot's <HeroGlow>, class *_heroGlow, figma
         313:14109; feGaussianBlur stdDeviation 50, ellipse 135% of the column
         width centred 92px above its bottom edge).
         Its colour is an SVG PRESENTATION ATTRIBUTE — fill="#6187D8"
         fill-opacity="0.08" — not a token, so the whole "neutralize remaining
         DeepSeek brand blues" variable block above could never reach it: a soft
         periwinkle haze survived the theme on that one page. A presentation
         attribute loses to ANY author CSS declaration, so restyling the ellipse
         here is sufficient and no app source is touched.

         Opacity is per scheme, and the two values are MEASURED, not picked: the
         app's exact glow svg was rendered headless over each --dsw-alias-bg-base
         and the ellipse core sampled, so the replacement can be matched to the
         presence of the glow it replaces (Y = 0.2126R+0.7152G+0.0722B):
           light #e8e8e2 (Y 231.5): 8% #6187D8 -> #DDE0E1 (Y 223.3, -8.2)
                                    8% #fff500 -> #E9E8D0 (Y 230.4, -1.1)
           dark  #101110 (Y  16.8): 8% #6187D8 -> #161A1F (Y  25.0, +8.2)
                                    5% #fff500 -> #1C1C0F (Y  27.1, +10.3)
         Light keeps 8%: yellow there is almost luminance-NEUTRAL and shifts only
         chroma (blue channel -18), i.e. a warm breath on the paper rather than
         the blue's grey-blue darkening — gentler than what it replaces, not
         louder. Dark had to come down from 8%/7%: over near-black, added
         luminance reads far more readily than subtracted blue does over cream
         (7% measured #20200E, Y +13.4 — about 1.6x the blue's lift), and 5%
         lands within ~2 Y of the original glow. So the hero keeps exactly the
         depth it had, in the theme's own accent.
         Matched on the '_heroGlow' CSS-module suffix rather than the current
         'wSkVaW' hash, so an app rebuild that rehashes the module cannot silently
         bring the blue back. */
      [class*='_heroGlow'] ellipse {
        fill: var(--edge-signal, #fff500) !important;
        fill-opacity: 0.08 !important;
      }
      body[data-ds-dark-theme] [class*='_heroGlow'] ellipse {
        fill-opacity: 0.05 !important;
      }
      /* Brand wordmark HARNESS chip: signal-yellow box + black letters (both modes) */
      body {
        --dsw-alias-label-primary-inverted: #101110;
      }
      [class*='brand'] svg rect,
      [class$='_newSession'] svg rect {
        fill: #fff500 !important;
      }
      /* Compaction notice row: soft yellow wash + accent in dark, hover = solid inversion */
      body[data-ds-dark-theme] [class$='_compactionRow'] {
        background: rgba(255, 245, 0, 0.08) !important;
        border-left: 2px solid rgba(255, 245, 0, 0.55) !important;
      }
      body[data-ds-dark-theme] [class$='_compactionButton']:hover:not(:disabled),
      body[data-ds-dark-theme] [class$='_compactionButton']:focus-visible {
        background: #fff500 !important;
      }
      body[data-ds-dark-theme] [class$='_compactionButton']:hover *,
      body[data-ds-dark-theme] [class$='_compactionButton']:focus-visible * {
        color: #000 !important;
      }
      body[data-ds-dark-theme] [class$='_compactionButton']:hover [class$='_compactionSep'],
      body[data-ds-dark-theme] [class$='_compactionButton']:focus-visible [class$='_compactionSep'] {
        background: #000 !important;
      }
      /* ================= composer add (+) button hover inversion ================= */
      /* Dark: + icon signal yellow at rest; on hover solid yellow bg + black icon */
      body[data-ds-dark-theme] .uV2eYG_add {
        color: #fff500 !important;
      }
      body[data-ds-dark-theme] .uV2eYG_add:hover:not(:disabled),
      body[data-ds-dark-theme] .uV2eYG_add:focus-visible {
        color: #000 !important;
        background: #fff500 !important;
      }
      /* ================= composer primary send/stop button ================= */
      /* Dark: hardcoded #fff icon on yellow info-fill -> black icon; hover deeper yellow */
      body[data-ds-dark-theme] .uV2eYG_primary {
        color: #101110 !important;
      }
      body[data-ds-dark-theme] .uV2eYG_primary:hover:not(:disabled) {
        color: #101110 !important;
        background: #e8e000 !important;
      }
      /* ================= light-mode white-on-dark buttons keep white icon ================= */
      /* Generic hover inversion would make the white send icon black on the dark fill */
      body:not([data-ds-dark-theme]) :is(.uV2eYG_primary, .zGbnIq_primaryButton),
      body:not([data-ds-dark-theme]) :is(.uV2eYG_primary, .zGbnIq_primaryButton):hover:not(:disabled) {
        color: #fff !important;
      }
      /* ================= dark mode: selected rows = solid signal-yellow + black text ================= */
      /* The translucent yellow wash makes white text look muddy olive; the reference
         inverts to black-on-signal-yellow, so selected rows get the full inversion. */
      body[data-ds-dark-theme] [class*='selected' i]:not([class*='unselected' i]) {
        color: #000 !important;
        background: #fff500 !important;
        border-color: #fff500 !important;
      }
      body[data-ds-dark-theme] [class*='selected' i]:not([class*='unselected' i]) *:not(svg):not(path) {
        color: #000 !important;
      }
      /* ================= ask_user_question option chips ================= */
      /* Two contrast collisions in the question card (@deepseek-ai/dsh-client-ui-user-questions),
         both measured on a real card rather than guessed.

         1) The recommended chip. Upstream paints it with
              color: var(--dsw-alias-button-info-fill)
              background: var(--dsw-specific-sidebar-nav-item-active-accent)
            i.e. it uses info-fill as a FOREGROUND. This theme maps that token and the
            nav accent to the SAME value in both modes (#101110 light / #fff500 dark),
            so the label painted itself onto its own fill and the chip measured as a
            single flat colour with ZERO glyph pixels. Broken in BOTH modes, not just
            dark. Pin the pair explicitly instead of retuning either token, because
            both are consumed as real background fills elsewhere. */
      :is([role='radio'], [role='checkbox']) [class*='badge' i] {
        color: #101110 !important;
        background: #fff500 !important;
      }
      /* On a selected row the row itself is already solid signal yellow, so the chip
         inverts to keep its edge instead of dissolving into the row. */
      body[data-ds-dark-theme] [class*='selected' i]:not([class*='unselected' i]) [class*='badge' i] {
        color: #fff500 !important;
        background: #101110 !important;
      }
      /* 2) The option number ("1", "2", ...). The blanket dark inversion above
            recolours descendant TEXT to black but cannot touch a descendant's own
            background, so this chip kept its overlay fill
            (--dsw-alias-bg-overlay = #1c1e1c) and rendered a black digit on
            near-black: measured 1.25:1, i.e. the numbering vanished on the selected
            row. Wash the chip rather than filling it, so the digit reads on yellow
            and the chip still looks like a chip. */
      body[data-ds-dark-theme] [class*='selected' i]:not([class*='unselected' i]) [class*='number' i] {
        color: #101110 !important;
        background: rgba(16, 17, 16, 0.16) !important;
      }
      /* ---------- Turn-status label ("Deep diving...") ----------
         Owner: @deepseek-ai/dsh-client-ui-conversation, class Md3f7G_turnStatus.

         This label is GRADIENT TEXT, not coloured text. Upstream paints a
         linear-gradient background, sets -webkit-text-fill-color: transparent plus
         background-clip: text, and animates background-position to shimmer:

           background: linear-gradient(90deg,
             var(--dsw-static-deepseek-500) 0%   40%,
             var(--dsw-static-deepseek-200) 50%,
             var(--dsw-static-deepseek-500) 60% 100%);
           color: #0000; -webkit-text-fill-color: transparent;

         Two consequences drive the rules below:
           1. A plain 'color:' CANNOT recolour this label — the transparent text
              fill wins, so the glyphs would stay whatever the gradient paints. The
              recolour therefore has to go through the gradient itself.
           2. Retinting the shared --dsw-static-deepseek-* tokens is the wrong lever:
              --dsw-static-deepseek-500/200 also back --dsw-alias-button-info-fill,
              --dsw-alias-state-business-primary and --dsw-specific-bubble-highlight
              (verified in dsh-client-ui-theme/styles/design-platform.css), so the
              theme already maps them to ink/paper on purpose. Only
              background-image is overridden here, which leaves upstream's
              background-size, background-position and shimmer animation untouched.

         COLOUR CHOICE IS MEASURED, NOT PICKED BY EYE. Every gradient stop must
         clear WCAG AA 4.5:1 against BOTH backgrounds the label can sit on in its
         mode (bg-base and bg-layer-1), because the mid-band sweeps through the
         glyphs — and under prefers-reduced-motion upstream pins background-size to
         100%, leaving that mid-band permanently inside the text. Measured:
           light bg #e8e8e2 / #f2f2ec —  #fff500 scores 1.02:1 (invisible; the naive
             "just make it yellow" reading of this request), #8f7c00 3.38, #7d6c00
             4.25, and #6b5d00 5.35 is the FIRST gold that clears AA;
           dark  bg #101110 / #181a18 —  #fff500 15.26, #a08a00 5.11, while #8f7c00
             falls to 4.21 and fails.
         Hence the sweep DIPS deeper in both modes instead of lifting brighter:
         in light mode no gold above #6b5d00 can clear AA, and in dark mode a pale
         lift band desaturates to near-white and loses the yellow entirely.
         Light mode is a deep gold rather than signal yellow for the same reason the
         watermark and rail are not: on cream, #fff500 is not a colour choice, it is
         an erasure. */
      body [class*='turnStatus']:not([class*='turnStatusClock']) {
        background-image: linear-gradient(90deg,
          #6b5d00 0%, #6b5d00 40%, #3f3600 50%, #6b5d00 60%, #6b5d00 100%) !important;
      }
      body[data-ds-dark-theme] [class*='turnStatus']:not([class*='turnStatusClock']) {
        background-image: linear-gradient(90deg,
          #fff500 0%, #fff500 40%, #a08a00 50%, #fff500 60%, #fff500 100%) !important;
      }
      /* ================= boot loading screen ================= */
      /* Fixed plate above everything, including the shell overlay layer. It exists
         only while the boot animation plays and is removed afterwards, so none of
         these rules match during normal use. Measurements come from the reference
         frame (1340x731) expressed as ratios so they scale with the viewport. */
      [data-endfield-loader] {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        background: #101110;
        /* Not inherited from the app: the plate can paint before tokens resolve. */
        color: #f5f5f0;
        font-family: Arial, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif;
        font-feature-settings: "tnum" 1;
        overflow: hidden;
        /* Never trap the user: even mid-animation the app underneath stays usable. */
        pointer-events: none;
        opacity: 1;
        /* No opacity transition: the fade is driven from JS (see finish()) because a
           CSS transition proved not to run in every renderer this plate targets.
           finish() also sets inline transition:none so nothing can fight it. */
      }
      /* Kept as a state hook (and a fallback for a renderer that never runs the JS
         fade) — the inline opacity written by finish() is what actually animates. */
      [data-endfield-loader][data-endfield-loader-exit] {
        opacity: 0;
      }
      /* Faint industrial grid, matching the reference backdrop texture. */
      [data-endfield-loader-tex] {
        position: absolute;
        inset: 0;
        opacity: 0.55;
        background-image:
          repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.014) 0 1px, transparent 1px 4px),
          repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.010) 0 1px, transparent 1px 120px);
      }
      /* 8px rail: dim track full height, signal-yellow fill from the top down. */
      /* 10px rail, measured from the reference (10/1184 of the width). */
      [data-endfield-loader-track] {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 10px;
        background: rgba(255, 245, 0, 0.10);
      }
      [data-endfield-loader-fill] {
        position: absolute;
        left: 0;
        top: 0;
        width: 10px;
        height: 0%;
        background: #fff500;
      }
      /* Meter RIDES THE FILL END: its top offset is set per frame from the same eased
         progress value that drives the fill height (see step()), so the readout
         descends with the bar. The exact offset and the clamping are done in JS,
         where the group's real height is known — a pure CSS percentage would let the
         readout hang off the bottom of the screen as the fill approaches 100%.
         Deliberately no CSS transition on the top offset: it is already updated every
         frame, and a transition would make the readout visibly lag the bar. */
      [data-endfield-loader-meter] {
        position: absolute;
        left: 26px;
        top: 0;
        will-change: top;
      }
      /* ---- completion flourish: yellow sweep to the right, then fade ----
         Starts as the rail itself (same 10px width, same colour, same left edge) and
         widens to cover the viewport, so the sweep reads as the finished bar flooding
         the screen rather than a new element appearing.
         Width and opacity are animated from JS (see finish()), deliberately NOT by a
         CSS transition: measured in the verification renderer, a transition declared
         here never started — no transitionrun/start/end events fired and the computed
         width stayed at 10px well past its duration — which would leave a thin stub
         instead of a sweep. These rules therefore only describe the resting state and
         must not declare a width/opacity transition that would fight the JS. */
      [data-endfield-loader-wipe] {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 10px;
        background: #fff500;
        opacity: 0;
      }
      [data-endfield-loader-tick] {
        display: block;
        width: 4px;
        height: 15px;
        background: #fff500;
      }
      [data-endfield-loader-pct] {
        display: block;
        margin-top: 7px;
        color: #fff500;
        font-size: 39px;
        font-weight: 700;
        line-height: 29px;
        letter-spacing: -0.01em;
        font-variant-numeric: tabular-nums;
      }
      [data-endfield-loader-status] {
        display: block;
        margin-top: 12px;
        color: #666;
        font-size: 11px;
        font-weight: 400;
        letter-spacing: 0.02em;
      }
      /* ---- Poster brand block --------------------------------------------------
         Measured from the supplied key-art (1184x685) by scanning its pixels, not
         estimated — the ink bands on the right half of the reference are:
           block left ink edge  x=868  -> 868/1184 = 73.3% of the width
           right-most ink       x=1098 -> right gap 86px = 7.3% of the width
           kicker band          y 258..260   h=3    (ratio to cap 0.10)
           END band             y 265..293   h=29   -> cap 4.23% of plate height
           FIELD band           y 297..325   h=29   -> line pitch 32px, 32/29 = 1.10
           chevron band         y 498..506   x=841  -> outdent 868-841 = 27px
           tagline band         y 543..551   h=9, run width 231px
         The block is LEFT-aligned internally (all rows share x=868) but placed on
         the right — that combination is what gives the reference its look; a
         right-aligned (ragged-left) block reads completely differently.

         GEOMETRY MODEL — the block is anchored by its RIGHT margin, not by a left
         percentage. That is deliberate and is what fixes two measured faults:
           1. A left percentage (the old --edge-rail: 73%) sets where the block
              STARTS and lets its width run toward the right edge, so the margin
              that a viewer actually reads as "too far right" was never controlled.
              Anchoring 'right' makes that margin the declared quantity, and the
              rhythm line falls out of the widest row instead of being guessed.
           2. Sizing purely in vh made the wordmark shrink on a wide-but-short
              window and, at the old 4.2vh, rendered the cap at 3.01% of plate
              height against the reference's 4.23% — measurably ~70% of reference,
              which is why it read as too small.
         --edge-word is therefore clamp(26px, min(5.2vh, 4.8vw), 64px):
           min(5.2vh, 4.8vw)  scales with the SMALLER axis, so neither a short nor
                              a narrow window can push the block into the rail;
           26px floor         keeps the sub-rows legible on a tiny plate;
           64px ceiling       measured: without it, cap-height fell to 2.69% of H
                              at 2560x1440 (the block visibly shrank on a large
                              display); 64px holds it at ~3.2% and up.
         Verified across 13 viewports from 520x900 to 2560x1440: cap-height stays
         within 3.1-3.9% of plate height (reference 4.23%, intentionally a touch
         under — see below) with no overflow past any edge and >=150px clearance
         from the progress rail and its meter.
         The block still renders slightly under reference scale on purpose: the
         key-art is a full-bleed poster, whereas this plate flashes over an app.
         Every row is a ratio of --edge-word, so this one value rescales the whole
         block without disturbing the measured proportions above. The small rows
         additionally carry a px floor — see the max() calls below. */
      [data-endfield-loader] {
        --edge-word: clamp(26px, min(5.2vh, 4.8vw), 64px);
        /* Distance from the plate's right edge to the block's right edge. The %
           term keeps it proportional on a wide display; the px term stops it
           collapsing on a narrow one. */
        --edge-gap: max(64px, 12%);
      }
      [data-endfield-loader-brand] {
        position: absolute;
        right: var(--edge-gap);
        top: 50%;
        transform: translateY(-50%);
        /* No max-width: every row sets white-space: nowrap, so a width cap cannot
           wrap them — it only clips. The block moves instead (see the --edge-gap
           media queries) so the longest row always fits. */
      }
      /* Anchor to --edge-word like every other row. Without this the em below
         resolves against the inherited root font-size (16px), which rendered the
         kicker at 2.25x its reference size and bloated the whole block. */
      [data-endfield-loader-kicker] {
        display: block;
        font-size: var(--edge-word);
      }
      [data-endfield-loader-kicker]::before {
        content: 'DEEPSEEK HARNESS';
        display: block;
        margin-bottom: 0.5em;
        color: #f5f5f0;
        /* max() floor: the reference ratio alone (0.135em of the wordmark) computes
           to ~4px on a short plate, which renders as an illegible grey smudge
           rather than text. 9px is the smallest size this still reads at. */
        font-size: max(9px, 0.155em);
        font-weight: 600;
        letter-spacing: 0.26em;
        white-space: nowrap;
        opacity: 0.95;
      }
      /* Both rows: the negative margin cancels Arial's left side bearing so the
         INK edge lands on the rhythm line, not the glyph box edge. */
      [data-endfield-loader-word] {
        display: block;
        margin-left: -0.055em;
        color: #f5f5f0;
        font-size: var(--edge-word);
        font-weight: 900;
        /* 0.80, not 1.10: the reference pitch/cap of 1.10 is measured between
           INK tops, while line-height spans the full em box (ascender+descender),
           which for Arial-900 is ~1.38x the cap height. 1.10 as a line-height
           renders a visibly loose 1.52 ink pitch. */
        line-height: 0.80;
        letter-spacing: 0.01em;
        white-space: nowrap;
      }
      [data-endfield-loader-word1]::before { content: 'END'; }
      [data-endfield-loader-word2]::before { content: 'FIELD'; }
      /* ---- detail cluster: chevron outdented into the left margin ---- */
      [data-endfield-loader-detail] {
        display: block;
        position: relative;
        margin-top: 1.9em;
        font-size: var(--edge-word);
      }
      [data-endfield-loader-chev] {
        position: absolute;
        left: -0.26em;
        top: 0.02em;
        width: 0.12em;
        height: 0.24em;
      }
      /* Two stacked chevrons drawn from borders — no glyph, no font dependency. */
      [data-endfield-loader-chev]::before,
      [data-endfield-loader-chev]::after {
        content: '';
        position: absolute;
        left: 0;
        width: 0.10em;
        height: 0.10em;
        border-left: 0.028em solid #fff500;
        border-bottom: 0.028em solid #fff500;
        transform: rotate(-45deg);
      }
      [data-endfield-loader-chev]::before { top: 0; }
      [data-endfield-loader-chev]::after { top: 0.09em; }
      [data-endfield-loader-sub]::before {
        content: 'EDGE INTELLIGENCE THEME';
        display: block;
        color: #8a8d88;
        /* Same legibility floor as the kicker: measured, the bare ratio rendered
           this row 3px tall — visible as a blur, not readable as words. */
        font-size: max(9px, 0.135em);
        font-weight: 500;
        letter-spacing: 0.12em;
        white-space: nowrap;
      }
      [data-endfield-loader-seq]::before {
        content: 'TERRA RESEARCH COMMISSION / BOOT SEQUENCE';
        display: block;
        margin-top: 0.4em;
        color: #6a6d64;
        font-size: max(8px, 0.125em);
        font-weight: 500;
        letter-spacing: 0.10em;
        white-space: nowrap;
      }
      [data-endfield-loader-squares] {
        display: grid;
        grid-template-columns: repeat(6, 0.115em);
        gap: 0.04em;
        margin-top: 0.30em;
      }
      [data-endfield-loader-squares] i {
        display: block;
        height: 0.05em;
        background: #2e302d;
      }
      [data-endfield-loader-squares] i[data-on] {
        background: #fff500;
      }
      /* Tagline closes the block on the same rhythm line.
         Reference: cap 11px across 232px, i.e. cap/width 0.38 — unreachable in
         Arial, where an 11px-cap run of this string measures 299px (340px at the
         reference's tracking). The source art uses a condensed face, and probing
         the renderer showed Arial Narrow genuinely resolves here (245px vs Arial's
         299px on the same probe), so it is used with Arial as the fallback: on a
         host without it the run simply sets wider in Arial and still fits, because
         the size below is a ratio of the wordmark rather than a fixed px. */
      [data-endfield-loader-tag]::before {
        content: 'OVER THE FRONTIER / INTO THE FRONT';
        display: block;
        margin-top: 1.05em;
        color: #f5f5f0;
        font-family: "Arial Narrow", Arial, sans-serif;
        font-size: max(10px, 0.34em);
        font-weight: 500;
        letter-spacing: 0.06em;
        white-space: nowrap;
      }
      [data-endfield-loader-tag] {
        display: block;
        font-size: var(--edge-word);
      }
      /* Narrow windows: pull the block toward the right edge so the measured ratios
         survive instead of the text clipping. Only the margin changes — --edge-word
         already scales itself off the smaller viewport axis, so the wordmark needs
         no per-breakpoint override. */
      @media (max-width: 1100px) {
        [data-endfield-loader] { --edge-gap: max(48px, 9%); }
      }
      @media (max-width: 760px) {
        [data-endfield-loader] { --edge-gap: max(28px, 5%); }
      }
      /* Reduced motion is handled in finish(), which skips the sweep/fade entirely
         and removes the plate outright; nothing here needs to disable a transition,
         since the plate no longer declares one. */
    `)
      syncRadiusMode()
    }
    const unmount = () => {
      if (!mounted) return
      mounted = false
      disposeToken()
      disposeStyles()
      disposeToken = () => {}
      disposeStyles = () => {}
      document.body.classList.remove('theme-endfield-round')
      // The plate is styled by the theme stylesheet just torn down — an orphaned
      // plate would sit there as an unstyled black-less div, so drop it too.
      destroyLoader()
    }

    if (isEnabled()) {
      mount()
      syncWatermarkVisibility()
      // Boot animation: only on a real page load, only when switched on, and only
      // after the stylesheet above exists (mount() inserted it).
      if (isLoaderOn()) runLoader()
    }

    /* ---------- Settings page: 主题 (own settings.section) ---------- */
    const slots = ctx.get('slots')
    const disposeRows = []
    let disposeSettings = () => { disposeRows.forEach((d) => d()) }
    if (slots !== undefined) {
      slots.inject('settings.section', () => {
        const d = slots.register(
        { name: 'settings.section', id: 'theme-endfield', order: 35, label: '终末地主题设置' },
        () => {
          const R = (typeof React !== 'undefined') ? React : ((typeof require === 'function') ? require('react') : null)
          if (!R) return null
          const [enabled, setEnabled] = R.useState(isEnabled())
          const [wmOn, setWmOn] = R.useState(isWatermarkOn())
          const [wmPersist, setWmPersist] = R.useState(isWatermarkPersistOn())
          const [loaderOn, setLoaderOn] = R.useState(isLoaderOn())
          const [mode, setMode] = R.useState((typeof localStorage !== 'undefined' && localStorage.getItem(RADIUS_KEY)) || 'square')
          const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' }
          const labelStyle = { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', fontWeight: 500, lineHeight: '1.5' }
          // Sub-label explaining what a switch does, so the row is self-describing.
          const hintStyle = { display: 'block', color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', fontWeight: 400, lineHeight: '1.5', marginTop: '2px' }
          const btnStyleFor = (on, disabled) => ({
            color: on ? '#000' : 'var(--dsw-alias-label-primary)',
            background: on ? '#fff500' : 'var(--edge-btn-muted)',
            border: '1px solid var(--dsw-alias-border-l2)',
            borderRadius: mode === 'round' ? '999px' : '0',
            padding: '4px 14px',
            fontSize: '12px',
            // A disabled control has to look disabled, not merely ignore clicks.
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.45 : 1,
            whiteSpace: 'nowrap',
          })
          const toggleTheme = () => {
            const next = !enabled
            if (typeof localStorage !== 'undefined') localStorage.setItem(ENABLED_KEY, next ? '1' : '0')
            setEnabled(next)
            if (next) { mount(); syncWatermarkVisibility() }
            else { unmount(); syncWatermarkVisibility() }
          }
          const toggleWm = () => {
            const next = !wmOn
            if (typeof localStorage !== 'undefined') localStorage.setItem(WATERMARK_KEY, next ? '1' : '0')
            setWmOn(next)
            syncWatermarkVisibility()
          }
          const toggleWmPersist = () => {
            const next = !wmPersist
            if (typeof localStorage !== 'undefined') localStorage.setItem(WATERMARK_PERSIST_KEY, next ? '1' : '0')
            setWmPersist(next)
            syncWatermarkVisibility()
          }
          const toggleLoader = () => {
            const next = !loaderOn
            if (typeof localStorage !== 'undefined') localStorage.setItem(LOADER_KEY, next ? '1' : '0')
            setLoaderOn(next)
            // Turning it on plays it once right away, so the switch shows what it
            // bought instead of making the user reload to find out.
            if (next) { loaderDone = false; destroyLoader(); runLoader() }
            else destroyLoader()
          }
          const replayLoader = () => {
            loaderDone = false
            destroyLoader()
            runLoader()
          }
          const toggleMode = () => {
            const next = mode === 'round' ? 'square' : 'round'
            if (typeof localStorage !== 'undefined') localStorage.setItem(RADIUS_KEY, next)
            setMode(next)
            if (next === 'round') document.body.classList.add('theme-endfield-round')
            else document.body.classList.remove('theme-endfield-round')
          }
          const pageStyle = { maxWidth: '640px', padding: '4px 0 16px' }
          return R.createElement('div', { style: pageStyle }, [
            R.createElement('div', { style: rowStyle },
              R.createElement('span', { style: labelStyle }, '背景水印：' + (wmOn ? '开启' : '关闭')),
              R.createElement('button', { type: 'button', onClick: toggleWm, style: btnStyleFor(wmOn) }, wmOn ? '关闭水印' : '开启水印')
            ),
            R.createElement('div', { style: rowStyle },
              R.createElement('span', { style: labelStyle },
                '水印保持显示：' + (wmPersist ? '开启' : '关闭'),
                R.createElement('span', { style: hintStyle },
                  wmPersist ? '在对话等非新建会话页面也显示水印（置于正文之下）' : '仅在新建会话页显示水印'
                )
              ),
              R.createElement('button', {
                type: 'button',
                onClick: toggleWmPersist,
                style: btnStyleFor(wmPersist, !wmOn),
                // The switch only has meaning while the watermark itself is on.
                disabled: !wmOn,
                title: wmOn ? '' : '请先开启背景水印',
              }, wmPersist ? '仅新建页' : '保持显示')
            ),
            R.createElement('div', { style: rowStyle },
              R.createElement('span', { style: labelStyle },
                '启动加载动画：' + (loaderOn ? '开启' : '关闭'),
                R.createElement('span', { style: hintStyle },
                  loaderOn ? '刷新页面时播放 ENDFIELD 启动加载屏（左侧黄色进度轨 + 百分比）' : '默认关闭；开启后每次刷新页面播放一次'
                )
              ),
              R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                // Replay only makes sense while the feature is on; it lets the user
                // re-watch the animation without reloading the page.
                R.createElement('button', {
                  type: 'button',
                  onClick: replayLoader,
                  style: btnStyleFor(false, !loaderOn),
                  disabled: !loaderOn,
                  title: loaderOn ? '' : '请先开启启动加载动画',
                }, '预览'),
                R.createElement('button', { type: 'button', onClick: toggleLoader, style: btnStyleFor(loaderOn) }, loaderOn ? '关闭动画' : '开启动画')
              )
            ),
            R.createElement('div', { style: rowStyle },
              R.createElement('span', { style: labelStyle }, '终末地主题：' + (enabled ? '开启' : '关闭')),
              R.createElement('button', { type: 'button', onClick: toggleTheme, style: btnStyleFor(enabled) }, enabled ? '关闭主题' : '开启主题')
            ),
            R.createElement('div', { style: rowStyle },
              R.createElement('span', { style: labelStyle }, '主题圆角：' + (mode === 'round' ? '圆角' : '直角')),
              R.createElement('button', { type: 'button', onClick: toggleMode, style: btnStyleFor(mode === 'round') }, mode === 'round' ? '切换直角' : '切换圆角')
            ),
          ])
        }
      )
      disposeRows.push(d)
      return d
    })
    }

    ctx.effect(() => () => {
      unmount()
      if (watermarkObserver) watermarkObserver.disconnect()
      if (watermarkRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(watermarkRaf)
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('resize', onWatermarkResize)
      if (watermarkEl && watermarkEl.parentNode) watermarkEl.parentNode.removeChild(watermarkEl)
      // The plate owns a rAF handle and a fixed DOM node; both must go with the run.
      destroyLoader()
      disposeSettings()
    })
  }

		exports.name = "dsh-theme-endfield";
		exports.apply = apply;
		return module.exports;
	}
});
