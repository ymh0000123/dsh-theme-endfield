    /* ---------- 渠道额度渲染 (dsh-codearts-auth / jet-hub) ----------
       Two display modes share one capsule. The wallet read above is the
       DeepSeek mode; when the session's model directory names a jet-hub
       provider, the money group swaps to that channel's remaining credits.

       Numbers mirror the plugin's own badge formatting: credits are integers
       or two decimals, token-quantity units compact past 1e3/1e6 (12.34K /
       1.20M), and the unit tag reads 积分 or Token. A FAILED answer paints --
       rather than 0 — a zero would read as "out of quota" and that is a lie
       the user may act on. The badge response carries `provider` back; a
       stale reply for a channel the user already left is dropped, which is
       the only thing keeping a channel switch and an in-flight fetch from
       crossing wires. */
    const creditFormatTokens = (value) => {
      const abs = Math.abs(value)
      if (abs >= 1e6) return (value / 1e6).toFixed(2) + 'M'
      if (abs >= 1e3) return (value / 1e3).toFixed(2) + 'K'
      return String(Math.round(value))
    }
    const creditFormatValue = (value, unit) =>
      (unit === 'token' ? creditFormatTokens(value)
        : (Number.isInteger(value) ? String(value) : value.toFixed(2)))
    const creditUnitLabel = (unit) => (unit === 'token' ? 'Token' : '积分')

    /* The unit tag rides the packages (the account total carries none); any
       package's unit answers for the row. 'credits' normalizes to 'credit' so
       one spelling owns the 积分 branch. */
    const creditPickUnit = (packages) => {
      if (Array.isArray(packages)) {
        for (const pkg of packages) {
          if (pkg && pkg.unit) return (pkg.unit === 'credits' ? 'credit' : pkg.unit)
        }
      }
      return 'credit'
    }

    /* RpcCreditsBalanceAccount[] -> one glanceable number PLUS the consumption
       ratio the right-hand dial shows in credits mode. usage.badge answers one
       row per enabled account; the read is the FIRST account without an
       error. Active packages carry remaining/total/used, so they are summed
       into { total (剩余), quotaTotal (总额度), used (已用), unit } — the
       account-level balance.total is only the fallback when no usable package
       exists, and it carries no quota, so the dial reads no consumption from
       it (an invented percentage would be a lie). */
    const creditPickAccount = (accounts) => {
      if (!Array.isArray(accounts)) return null
      for (const account of accounts) {
        if (!account || typeof account !== 'object' || account.error) continue
        const bal = account.balance
        if (!bal || typeof bal !== 'object') continue
        if (Array.isArray(bal.packages) && bal.packages.length > 0) {
          let total = 0
          let quotaTotal = 0
          let used = 0
          let any = false
          let unit = 'credit'
          for (const pkg of bal.packages) {
            if (!pkg || pkg.active !== true || !Number.isFinite(pkg.remaining)) continue
            any = true
            unit = pkg.unit === 'credits' ? 'credit' : pkg.unit
            total += pkg.remaining
            if (Number.isFinite(pkg.total)) quotaTotal += pkg.total
            if (Number.isFinite(pkg.used)) used += pkg.used
          }
          if (any) return { total, quotaTotal, used, unit }
        }
        if (Number.isFinite(bal.total)) {
          return { total: bal.total, quotaTotal: 0, used: 0, unit: creditPickUnit(bal.packages) }
        }
      }
      return null
    }

    const creditPaint = (paint) => {
      if (balanceEl === null || typeof document === 'undefined') return
      const setText = (attr, text) => {
        const node = balanceEl.querySelector('[' + attr + ']')
        if (node) node.textContent = text
      }
      setText('data-endfield-credit-int', paint.int)
      setText('data-endfield-credit-unit', paint.unitText)
      setText('data-endfield-credit-channel', paint.channel)
      // Consumption read for the right-hand slot in credits mode. The dial's
      // share rides the same --endfield-balance-sweep custom property the
      // pricing clock uses, so mode switches never re-layout the pill: the
      // value just changes meaning. No quota (quotaTotal 0) keeps the sweep
      // empty rather than inventing a percentage.
      setText('data-endfield-credit-pct', paint.pctText || '')
      // The ring sweep follows the slot's meaning: 已用xx% sweeps the consumed
      // share, 剩余xx% sweeps the remaining share — dial and readout always
      // tell the same story. (The wallet pricing clock early-returns in
      // credits mode, so this property is ours to write here.)
      if (typeof balanceEl.style?.setProperty === 'function') {
        balanceEl.style.setProperty(
          '--endfield-balance-sweep',
          (Number.isFinite(paint.sweepPct) ? paint.sweepPct * 3.6 : 0) + 'deg',
        )
      }
      // The two modes are mutually exclusive DOM states driven by one attribute
      // the stylesheet keys off — no inline style writes, no per-poll churn.
      balanceEl.setAttribute('data-endfield-credit-mode', paint.mode)
    }

    /* The capsule paints ONE mode at a time. 'wallet' keeps the DeepSeek
       money group; 'credits' swaps in the channel read; while a jet-hub
       provider is live but has not answered yet the capsule shows the channel
       name with -- rather than yesterday's wallet number under a different
       channel's name. Consumption reads need a quota: without one the pct
       slot stays empty and the dial sweep is zeroed, never guessed. */
    const creditPaintIdle = () => {
      if (creditProvider === null) {
        creditPaint({ mode: 'wallet', int: '', unitText: '', channel: '', pctText: '', usedPct: NaN, sweepPct: NaN })
        return
      }
      creditPaint({
        mode: 'credits',
        int: '--',
        unitText: '',
        channel: JET_HUB_PROVIDER_LABELS[creditProvider] || creditProvider,
        pctText: '',
        usedPct: NaN,
        sweepPct: NaN,
      })
    }

    /* Fetch the badge for `provider` and paint it, unless the user has switched
       channels in the meantime (the reply's provider echo guards the race the
       same way the plugin's own badge does). The consumption share for the
       right-hand dial is used/quota of the SAME account the number comes from;
       with no quota the pct slot stays empty and the sweep zeroes.
       RATE LIMIT. `force` (a channel switch) always fetches; the throttled
       path keeps a per-provider floor of CREDITS_MIN_INTERVAL_MS measured from
       the last COMPLETED fetch of that provider, so the 60s poll and the
       directory-publish path collapse onto one actual RPC per interval. The
       state is per-provider because switching A -> B -> A within one floor
       must still answer the second A visit with a fetch (its own stamp is old
       and the painted numbers belong to B). Failures re-arm at the shorter
       CREDITS_FAILURE_RETRY_MS — the host caches failure answers for only 15s,
       so a longer floor would just add silence after a transient error. */
    const creditLastFetch = {}
    const creditsApply = async (provider, force) => {
      if (creditsBusy) return
      let connection = null
      try { connection = ctx.get('connection') } catch (e) { connection = null }
      if (!connection || !connection.rpc || typeof connection.rpc.call !== 'function') return
      if (force !== true) {
        const last = creditLastFetch[provider] || 0
        if (Date.now() - last < CREDITS_MIN_INTERVAL_MS) return
      }
      creditsBusy = true
      let failed = false
      try {
        const payload = force === true ? { provider, force: true } : { provider }
        const reply = await connection.rpc.call(JET_HUB_RPC_SCOPE, JET_HUB_RPC_CHANNEL, {
          method: 'usage.badge',
          payload,
        })
        // Stale reply: the channel moved on while this was in flight.
        if (creditProvider !== provider) return
        if (!reply || reply.ok !== true) throw new Error('usage.badge not ok')
        const value = reply.value && typeof reply.value === 'object' ? reply.value : reply
        if (value.provider !== provider) return
        creditLastFetch[provider] = Date.now()
        const picked = creditPickAccount(value.accounts)
        // Consumption: 已用 / 总额度, from the summed active packages. Both
        // bounds must be sane or the dial refuses to speak (0 quota, more used
        // than granted, negative anything -> no invented percentage).
        let usedPct = NaN
        if (picked && picked.quotaTotal > 0 && picked.used >= 0
          && picked.used <= picked.quotaTotal) {
          usedPct = Math.min(100, Math.round((picked.used / picked.quotaTotal) * 100))
        }
        // Remaining share for the right-hand slot's 剩余xx% read: the same
        // sanity bounds, mirrored — the share of quota still left.
        let remainingPct = NaN
        if (usedPct === usedPct) remainingPct = 100 - usedPct
        // The RIGHT-hand slot is what the user chooses: 已用xx% (the plugin's
        // own badge reading) or 剩余xx% (remaining share of the quota). Both
        // come from the SAME summed account; the lead figure on the left
        // always stays the remaining balance. The dial sweeps the SAME share
        // the slot reads, so ring and number never disagree. 'remaining'
        // needs a quota too — a share of nothing is not a number — so without
        // one the slot stays empty and the sweep zeroes either way.
        const displayUsed = readCreditDisplay() === 'used'
        creditPaint({
          mode: 'credits',
          int: picked ? creditFormatValue(picked.total, picked.unit) : '--',
          unitText: picked ? creditUnitLabel(picked.unit) : '',
          channel: JET_HUB_PROVIDER_LABELS[provider] || provider,
          pctText: Number.isFinite(displayUsed ? usedPct : remainingPct)
            ? (displayUsed ? '已用' : '剩余') + (displayUsed ? usedPct : remainingPct) + '%'
            : '',
          usedPct,
          sweepPct: displayUsed ? usedPct : remainingPct,
        })
      } catch (e) {
        failed = true
        // Plugin absent, not logged in, or channel down: -- is the honest read.
        if (creditProvider === provider) {
          creditPaint({
            mode: 'credits',
            int: '--',
            unitText: '',
            channel: JET_HUB_PROVIDER_LABELS[provider] || provider,
            pctText: '',
            usedPct: NaN,
            sweepPct: NaN,
          })
        }
      } finally {
        if (failed) {
          // Re-arm early after a failure: the host only caches the failure
          // answer for 15s, so the next poll (or publish) should be allowed
          // to retry instead of sitting out the whole floor.
          creditLastFetch[provider] = Date.now() - CREDITS_MIN_INTERVAL_MS + CREDITS_FAILURE_RETRY_MS
        }
        creditsBusy = false
      }
    }

    /* Which jet-hub provider the CURRENT session is on, if any. Same lazy
       resolution contract as thunder: the theme declares no inject, so every
       service arrives late and each read must re-get it. The model directory
       is resolved per session id (directoryFor), loaded once (a directory that
       has never been loaded carries no `current`), and subscribed so a channel
       switch mid-session repaints the capsule without waiting for the poll. */
    const creditsRefresh = async (force) => {
      if (balanceEl === null) return
      let sessions = null
      try { sessions = ctx.get('sessions') } catch (e) { sessions = null }
      if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== 'function') return
      let snap = null
      try { snap = sessions.list.getSnapshot() } catch (e) { snap = null }
      const id = snap ? thunderCurrentId(snap) : undefined
      if (id === undefined || id === null) {
        if (creditProvider !== null) { creditProvider = null; creditPaintIdle() }
        return
      }
      let directories = null
      try { directories = ctx.get('modelDirectories') } catch (e) { directories = null }
      if (!directories || typeof directories.directoryFor !== 'function') return
      let directory = null
      try { directory = directories.directoryFor(id) } catch (e) { directory = null }
      if (!directory || !directory.store) return
      // Watch each directory's store exactly once: a session switch hands us a
      // new directory object, which is what re-arms the subscription here.
      if (creditsWatchedStore !== directory.store) {
        if (typeof creditsUnsub === 'function') { try { creditsUnsub() } catch (e) { /* gone */ } }
        creditsUnsub = null
        creditsWatchedStore = directory.store
        if (typeof directory.store.subscribe === 'function') {
          try {
            creditsUnsub = directory.store.subscribe(() => { creditsRebind() })
          } catch (e) { creditsUnsub = null }
        }
      }
      if (typeof directory.load === 'function') {
        try { await directory.load() } catch (e) { /* unreadable: fall through to snapshot */ }
      }
      let state = null
      try { state = directory.store.getSnapshot() } catch (e) { state = null }
      const provider = state && state.current ? state.current.provider : undefined
      const next = (typeof provider === 'string' && JET_HUB_PROVIDER_LABELS[provider] !== undefined)
        ? provider
        : null
      if (next !== creditProvider || (next !== null && !creditProviderResolved)) {
        creditProvider = next
        creditProviderResolved = next !== null
        creditPaintIdle()
      }
      // A switch (force, from the store subscription) bypasses the rate
      // floor so the read follows the channel immediately; the 60s poll
      // passes force=false and is throttled by creditsApply.
      if (next !== null) await creditsApply(next, force === true)
    }

    /* Store events land here; a channel flip re-reads the directory and
       repaints. Debounced so a burst of publishes collapses into one read.
       The debounce itself is also the switch detector: if the provider the
       delayed read resolves differs from the one painted, the fetch is
       forced — ordinary publishes (balance churn, model-list updates) keep
       the throttle. */
    const creditsRebind = () => {
      if (balanceEl === null) return
      if (creditsRebindTimer !== null && typeof clearTimeout === 'function') clearTimeout(creditsRebindTimer)
      creditsRebindTimer = null
      if (typeof setTimeout !== 'function') { creditsRefresh(true); return }
      creditsRebindTimer = setTimeout(() => {
        creditsRebindTimer = null
        creditsRefresh(true)
      }, 150)
    }

    /* First resolve races the boot pose; a bounded retry covers the model
       service arriving late, mirroring the thunder budget. */
    const creditsStart = () => {
      creditsRebindAttempts = 0
      const attempt = () => {
        if (balanceEl === null) return
        let sessions = null
        try { sessions = ctx.get('sessions') } catch (e) { sessions = null }
        if (sessions === undefined || sessions === null) {
          creditsRebindAttempts += 1
          if (creditsRebindAttempts <= 100 && typeof setTimeout === 'function') {
            creditsRebindTimer = setTimeout(attempt, 120)
          }
          return
        }
        creditsRefresh()
      }
      attempt()
    }

