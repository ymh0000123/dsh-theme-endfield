
    /* ---------- 顶部余额胶囊 ----------
       A fixed capsule at the top center of the frame showing the account
       balance AND the API's peak/off-peak pricing window, styled after the
       Endfield HUD plate: dark pill, currency + big tnum number, a small
       countdown to the next window edge, the elapsed-window percentage pushed
       to the right, and the accent-yellow round badge.

       WHY A HOST ROUTE. Only Host consumers can obtain the request credential
       the account service needs, so the page cannot query the balance itself —
       it polls /theme-endfield/balance (index.js registerBalanceBridge) and
       renders whatever arrives. A failed or empty answer keeps the last known
       numbers on screen instead of flashing an error state; a 60s poll keeps a
       drifted display within a minute of the truth at the cost of one cheap
       local request.

       WHY THE PRICING WINDOW IS COMPUTED LOCALLY. No host service exposes the
       schedule (deepseekAccount carries balance only), and the published rule
       is fixed wall-clock: Beijing time Mon-Fri 9:00-12:00 and 14:00-18:00 are
       PEAK (高峰), everything else — evenings, nights, weekends, statutory
       holidays — is OFF-PEAK (低谷) at half price. The holiday half of that
       sentence needs a calendar, so this file carries one transcribed from the
       State Council notices (BALANCE_HOLIDAY_NOTICES) instead of guessing; the
       capsule says "已过/剩余", not "what you will pay". A 1s tick keeps the
       countdown honest to the second.

       WHY RAW DOM, NOT A SLOT COMPONENT. Every other floating surface in this
       theme (thunder plate, watermark) is a plain fixed element owned by
       lifecycle code this file already has — mount/unmount/sync/reconcile —
       and a slot registration would hand the frame's React tree a component
       that must survive re-roots this theme does not control. The capsule is
       static once painted (only text nodes change), so raw DOM loses nothing.
       It is NOT clickable and NOT interactive: pointer-events:none, like the
       thunder plate, so it can never eat a click aimed at the header behind it. */
    const BALANCE_KEY = 'balanceCapsule'
    const isBalanceCapsuleOn = () => prefsGet(BALANCE_KEY) === '1'
    /* What the credits mode's RIGHT-hand percentage slot reads: 已用xx% (the
       plugin's own badge reading) or 剩余xx%. Anything other than 'used' reads as
       'remaining' — the preference is a two-literal choice, stored as exactly one
       of them, and 'remaining' is the default the field ships with. */
    const CREDIT_DISPLAY_KEY = 'creditDisplay'
    const readCreditDisplay = () => (prefsGet(CREDIT_DISPLAY_KEY) === 'used' ? 'used' : 'remaining')
    let balanceEl = null
    let balanceTimer = null
    let balancePollTimer = null
    let balanceBusy = false
    /* ---------- 防遮挡（sidebar 展开 / 鼠标靠近）运行时状态 ----------
       balanceShadeEl 是被监听的布局列（左侧 `_sidebarCol`，靠边停靠时换成
       `_rightbarCol`），null 表示尚未发现或胶囊不在 DOM。观察器只在胶囊存在时
       挂着，destroy 时一并断开。鼠标判定用「指针在胶囊中线 160px 竖带内且不
       高于胶囊顶」——低频 mousemove 上用矩形测试，比逐帧 closest() 便宜。 */
    let balanceSidebarRo = null
    let balanceSidebarMo = null
    let balanceShadeEl = null
    let balanceSidebarOpen = false
    let balanceHoverHide = false
    let balanceHideRaf = 0
    // Non-zero while the brand pose is up: the wall-clock moment it was raised.
    let balanceBootAt = 0
    // Set by the first completed fetch, answer or not.
    let balanceBootAnswered = false
    /* Channel-credit state. `provider` is the provider the LAST successful
       directory read named (null = DeepSeek / unknown -> wallet display);
       `creditsBusy` guards the usage.badge round-trip the way balanceBusy
       guards the wallet fetch; `creditsUnsub` detaches the model-directory
       subscription on destroy. */
    let creditProvider = null
    let creditProviderResolved = false
    let creditsBusy = false
    let creditsUnsub = null
    let creditsRebindTimer = null
    let creditsRebindAttempts = 0
    /* Rate limiting the usage.badge calls. Two refresh paths feed creditsApply
       — the shared 60s poll and every model-directory publish — and without a
       client-side floor both would fire an RPC each time. The host badge cache
       (TTL 120s) would absorb some of it, but the plugin's own badge polls at
       the same endpoint too, so the theme keeps its own 5-minute floor: a
       credit number is a slowly-moving quantity and the capsule is a glance.
       A channel SWITCH bypasses the floor (the number must follow the switch
       immediately); a failed fetch retries after 30s instead of the full
       floor, because failure answers are cached by the host for only 15s. */
    const CREDITS_MIN_INTERVAL_MS = 5 * 60 * 1000
    const CREDITS_FAILURE_RETRY_MS = 30000
    let creditLastFetchAt = 0
    // The directory store currently subscribed; a new session hands us a new
    // store, which is what re-arms the watch in creditsRefresh.
    let creditsWatchedStore = null

    /* Whether the brand pose plays at all. Reduced motion gets the settled
       capsule immediately — the animation is decoration, the balance is not. */
    const isBalanceBootAnimated = () =>
      typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    /* ---------- 防遮挡：状态合成与观察器 ----------
       胶囊的隐藏态由两个独立原因合成（sidebar 展开有占位条常驻、指针靠近是
       瞬时的），各自带设置页开关：balanceShadeApply() 在落盘前把两个原因
       与各自开关相与，balanceShadeReason() 仍保留「原始原因合成」语义。
       会话与遮挡无关，重新渲染会话时布局列节点可能被 React 重挂——所以
       sidebarCol 缩放突变时由 ResizeObserver 自己重找目标（isConnected 守卫）。 */
    const BALANCE_SIDEBAR_PROBE_ATTR = 'data-endfield-balance-sidebar-probe'
    /* 每次判定都重读偏好（isBalanceSidebarHideOn / isBalanceHoverHideOn）：
       设置页的开关是低频写入、判定是低频事件（列宽变化 / mousemove），重读
       让开关即时生效而无需重建胶囊。开关刚关掉时残留的隐藏态由开关处理器
       里的 balanceShadeApply() 同帧清除。 */
    const balanceShadeReason = () => (balanceSidebarOpen || balanceHoverHide ? true : false)
    const balanceShadeApply = () => {
      if (balanceEl === null) return
      const wantHide = (isBalanceSidebarHideOn() && balanceSidebarOpen)
        || (isBalanceHoverHideOn() && balanceHoverHide)
      if (wantHide) balanceEl.setAttribute('data-endfield-balance-shade', '')
      else balanceEl.removeAttribute('data-endfield-balance-shade')
    }
    /* 在整份 DOM 里找当前布局的侧栏列。两个后缀在客户端 UI 里唯一属于布局
       frame（`_centerCol`/`_sidebarCol`/`_rightbarCol`），位置选择决定盯哪根：
       居中盯左栏（DSH 左栏是常驻 push 布局），靠右盯右栏。 */
    const balanceSidebarSelector = () => {
      const pos = readBalanceCapsulePosition()
      return pos === 'right'
        ? '[class$="_rightbarCol"], [class*="_rightbarCol "]'
        : '[class$="_sidebarCol"], [class*="_sidebarCol "]'
    }
    const balanceFindSidebarCol = () => {
      if (typeof document === 'undefined' || !document.querySelector) return null
      try {
        const nodes = document.querySelectorAll(balanceSidebarSelector())
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i]
          if (node && typeof node.isConnected === 'boolean' ? node.isConnected : true) return node
        }
      } catch (e) { /* selector 引擎不可用时不遮挡判定退化为关闭 */ }
      return null
    }
    /* 列宽是否越过「展开」阈值。收起后的占位列仍有渲染宽度（骨架/图标条），
       所以不能用 >0 判定：只在展开宽度明显大于收起条时才算遮挡。 */
    const BALANCE_SIDEBAR_OPEN_PX = 96
    const balanceShadeSync = () => {
      if (balanceEl === null) return
      let open = false
      if (balanceShadeEl !== null && balanceShadeEl.isConnected !== false) {
        const rect = balanceShadeEl.getBoundingClientRect()
        open = rect.width >= BALANCE_SIDEBAR_OPEN_PX
      }
      if (open !== balanceSidebarOpen) {
        balanceSidebarOpen = open
        balanceShadeApply()
      }
    }
    const balanceWatchSidebar = () => {
      const col = balanceFindSidebarCol()
      if (col === balanceShadeEl) return
      if (balanceSidebarRo !== null) {
        try { balanceSidebarRo.disconnect() } catch (e) { /* already gone */ }
        balanceSidebarRo = null
      }
      if (balanceSidebarMo !== null) {
        try { balanceSidebarMo.disconnect() } catch (e) { /* already gone */ }
        balanceSidebarMo = null
      }
      balanceShadeEl = col
      balanceSidebarOpen = false
      if (col !== null && typeof ResizeObserver === 'function') {
        balanceSidebarRo = new ResizeObserver(() => {
          /* React 重挂列节点后旧引用会脱链——重启监听指向新节点。 */
          if (balanceShadeEl !== null && balanceShadeEl.isConnected === false) {
            balanceWatchSidebar()
            return
          }
          balanceShadeSync()
        })
        try { balanceSidebarRo.observe(col) } catch (e) { balanceSidebarRo = null }
      }
      /* 布局列是惰性挂载的：首帧 querySelector 可能扑空，用 MutationObserver
         盯 body 的子树变化，一旦列出现就换上 ResizeObserver。 */
      if (col === null && balanceEl !== null && typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.body) {
        balanceSidebarMo = new MutationObserver(() => {
          if (balanceEl === null) return
          if (balanceFindSidebarCol() !== null) balanceWatchSidebar()
        })
        try { balanceSidebarMo.observe(document.body, { childList: true, subtree: true }) } catch (e) { balanceSidebarMo = null }
      }
      balanceShadeSync()
    }
    /* 鼠标靠近自动隐藏。pointer-events:none 让胶囊吃不到自己的事件，所以判定
       挂在 window 的 mousemove 上，并用一个共享 rect 的几何测试（中线 ±160px、
       顶向上 8px、底向下 12px 的呼吸余量）。节流到 rAF 一次；离开判定还带
       240ms 的滞回，防止指针在边缘抖动时胶囊闪烁。 */
    const BALANCE_HOVER_HALF_W = 160
    const BALANCE_HOVER_TOP = -8
    const BALANCE_HOVER_BOTTOM = 12
    const BALANCE_HOVER_HYSTERESIS_MS = 240
    let balanceHoverUntil = 0
    const balanceHoverSync = (now) => {
      const hide = now < balanceHoverUntil
      if (hide !== balanceHoverHide) {
        balanceHoverHide = hide
        balanceShadeApply()
      }
    }
    const balanceOnMouseMove = (ev) => {
      if (balanceEl === null) return
      const clientX = ev && typeof ev.clientX === 'number' ? ev.clientX : null
      const clientY = ev && typeof ev.clientY === 'number' ? ev.clientY : null
      if (clientX === null || clientY === null) return
      const rect = balanceEl.getBoundingClientRect()
      if (rect.width <= 0) return
      const inside = clientX >= rect.left + rect.width / 2 - BALANCE_HOVER_HALF_W
        && clientX <= rect.left + rect.width / 2 + BALANCE_HOVER_HALF_W
        && clientY >= rect.top + BALANCE_HOVER_TOP
        && clientY <= rect.bottom + BALANCE_HOVER_BOTTOM
      const now = Date.now()
      if (inside) balanceHoverUntil = now + BALANCE_HOVER_HYSTERESIS_MS
      if (balanceHideRaf !== 0 || typeof cancelAnimationFrame !== 'function') {
        balanceHoverSync(now)
        return
      }
      balanceHideRaf = requestAnimationFrame(() => {
        balanceHideRaf = 0
        balanceHoverSync(Date.now())
      })
    }

    const destroyBalanceCapsule = () => {
      if (balanceTimer !== null && typeof clearInterval === 'function') {
        clearInterval(balanceTimer)
        balanceTimer = null
      }
      if (balancePollTimer !== null && typeof clearInterval === 'function') {
        clearInterval(balancePollTimer)
        balancePollTimer = null
      }
      // Detach the model-directory watch, too: a stale subscriber would keep
      // firing creditsRefresh into a capsule that no longer exists.
      if (typeof creditsUnsub === 'function') {
        try { creditsUnsub() } catch (e) { /* store already gone */ }
      }
      creditsUnsub = null
      if (creditsRebindTimer !== null && typeof clearTimeout === 'function') {
        clearTimeout(creditsRebindTimer)
        creditsRebindTimer = null
      }
      creditProvider = null
      creditProviderResolved = false
      creditsRebindAttempts = 0
      creditsWatchedStore = null
      /* The per-provider fetch stamps go too. They are the throttle's memory, and
         a destroy (preview remount, channel teardown) is a fresh load as far as
         the capsule is concerned: keeping the stamps would throttle the first
         post-remount fetch on the pre-destroy timestamp and leave the channel
         read stuck on '--' for up to the whole 5-minute floor — which is exactly
         the recovery the preview's collapse is supposed to perform, and which the
         unthrottled wallet path already gets. */
      for (const stampKey of Object.keys(creditLastFetch)) delete creditLastFetch[stampKey]
      if (balanceSidebarRo !== null) {
        try { balanceSidebarRo.disconnect() } catch (e) { /* already gone */ }
        balanceSidebarRo = null
      }
      if (balanceSidebarMo !== null) {
        try { balanceSidebarMo.disconnect() } catch (e) { /* already gone */ }
        balanceSidebarMo = null
      }
      balanceShadeEl = null
      balanceSidebarOpen = false
      balanceHoverHide = false
      balanceHoverUntil = 0
      if (balanceHideRaf !== 0 && typeof cancelAnimationFrame === 'function') {
        try { cancelAnimationFrame(balanceHideRaf) } catch (e) { /* already gone */ }
      }
      balanceHideRaf = 0
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        try { window.removeEventListener('mousemove', balanceOnMouseMove) } catch (e) { /* not attached */ }
      }
      if (balanceEl !== null && balanceEl.parentNode) {
        try { balanceEl.parentNode.removeChild(balanceEl) } catch (e) { /* already gone */ }
      }
      balanceEl = null
      balanceBootAt = 0
      balanceBootAnswered = false
    }

    /* One wallet pair -> the capsule's three text values. The balance arrives as
       strings ("12.34"), so the integer part is sliced out of the text rather
       than parsed: parsing would round a partial yuan amount into a lie about
       the user's money, and the screenshot style wants the big integer anyway.
       The fraction is capped at TWO digits — the source can carry more (or the
       bonus split can produce long tails), and a capsule is a glanceable read,
       not a ledger: it shows 29.35, not 29.354285714285714. */
    const balancePickWallet = (wallets) => {
      if (!Array.isArray(wallets) || wallets.length === 0) return null
      const preferred = wallets.find((w) => w && w.currency === 'CNY') || wallets[0]
      const raw = String((preferred && preferred.balance) || '0')
      const num = Number.parseFloat(raw)
      if (!Number.isFinite(num)) return null
      const [intPart, fracPart = ''] = raw.split('.')
      return {
        currency: (preferred && preferred.currency) || '',
        int: intPart || '0',
        frac: fracPart.slice(0, 2),
      }
    }

    const balancePaint = (data) => {
      if (balanceEl === null || typeof document === 'undefined') return
      const setText = (attr, text) => {
        const node = balanceEl.querySelector('[' + attr + ']')
        if (node) node.textContent = text
      }
      setText('data-endfield-balance-int', data.int)
      setText('data-endfield-balance-frac', data.frac === '' ? '' : '.' + data.frac)
      setText('data-endfield-balance-currency', data.currency === 'USD' ? '$' : '¥')
    }
