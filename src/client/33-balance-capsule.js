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
       plugin's own badge reading) or 剩余xx%. Anything other than 'remaining'
       reads as 'used' — the preference is a two-literal choice, stored as
       exactly one of them, and the tolerant default mirrors how
       readContourRenderer treats its own select. */
    const CREDIT_DISPLAY_KEY = 'creditDisplay'
    const readCreditDisplay = () => (prefsGet(CREDIT_DISPLAY_KEY) === 'used' ? 'used' : 'remaining')
    let balanceEl = null
    let balanceTimer = null
    let balancePollTimer = null
    let balanceBusy = false
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

