
    /* ---------- 峰谷定价窗口（本地计算） ----------
       The published rule (api-docs.deepseek.com pricing): Beijing time Mon-Fri
       9:00-12:00 and 14:00-18:00 are PEAK; everything else — nights, weekends,
       statutory holidays — is OFF-PEAK at half price. Two cases the summary
       rule leaves open are settled by DeepSeek's own 「API 峰谷时间补充说明」
       (2026-09-19): a Chinese statutory holiday is off-peak ALL DAY, and a
       调休 make-up workday that lands on a weekend is still billed as a weekend,
       i.e. off-peak all day as well. The second ruling is why the weekend test
       below needs no exception list — every 调休 day in the notices is a
       Saturday or Sunday (check.js enforces exactly that), so "weekend =>
       valley" already bills them off-peak.

       Everything is computed against UTC+8 directly (a fixed offset zone, no
       DST), so the result is exact regardless of the viewer's machine zone:
       shifting a Date by +8h and reading its UTC fields yields the Beijing
       wall clock.

       The window is the longest run of CONSECUTIVE EQUAL-PRICE blocks, not the
       calendar day. Midnight is not a price edge, so Friday's evening valley
       runs on through the weekend into Monday 09:00, and a 7-day national
       holiday reads as ONE valley rather than resetting every midnight. Peak
       blocks stay 3h/4h, so a peak read is identical to the old day-scoped one.

       Returns { peak, holiday, elapsedMs, totalMs, remainingMs, elapsedPct } —
       elapsed/total drive the 「低谷已过33%」 read, remainingMs the
       「剩余42:29:37」 countdown, peak the 高峰/低谷 label and holiday the name
       of the statutory holiday the day sits in ('' otherwise). Only the brand
       pose names the holiday: the settled row must not grow a character, or it
       would push the pill past the width its breakpoint was derived from. */

    /* Statutory-holiday calendar, transcribed from the State Council's yearly
       放假安排 notice. `from`/`to` are INCLUSIVE Beijing dates (MM-DD); `makeup`
       lists the weekend days worked to make the span and is kept as evidence
       for the ruling above (the code bills them as weekends, like any other
       Saturday). A year WITHOUT an entry falls back to the plain weekday/weekend
       rule — an unlisted holiday would be billed as peak — so check.js fails
       when the CURRENT Beijing year is missing, which is the reminder to add the
       next notice (published each November). Pure data, no logic: safe to
       evaluate on its own by the guard. */
    const BALANCE_HOLIDAY_NOTICES = {
      2026: {
        notice: '国办发明电〔2025〕7号',
        spans: [
          { name: '元旦', from: '01-01', to: '01-03', makeup: ['01-04'] },
          { name: '春节', from: '02-15', to: '02-23', makeup: ['02-14', '02-28'] },
          { name: '清明节', from: '04-04', to: '04-06', makeup: [] },
          { name: '劳动节', from: '05-01', to: '05-05', makeup: ['05-09'] },
          { name: '端午节', from: '06-19', to: '06-21', makeup: [] },
          { name: '中秋节', from: '09-25', to: '09-27', makeup: [] },
          { name: '国庆节', from: '10-01', to: '10-07', makeup: ['09-20', '10-10'] },
        ],
      },
    }

    /* 'YYYY-MM-DD' -> holiday name, expanded once from the spans above. */
    const BALANCE_HOLIDAY_DATES = new Map()
    const balanceBeijingKey = (ms) => {
      const d = new Date(ms + 8 * 3600 * 1000) // Beijing wall clock, read as UTC
      const mo = d.getUTCMonth() + 1
      const day = d.getUTCDate()
      return d.getUTCFullYear() + '-' + (mo < 10 ? '0' : '') + mo + '-' + (day < 10 ? '0' : '') + day
    }
    for (const year of Object.keys(BALANCE_HOLIDAY_NOTICES)) {
      for (const span of BALANCE_HOLIDAY_NOTICES[year].spans) {
        const from = span.from.split('-').map(Number)
        const to = span.to.split('-').map(Number)
        const last = Date.UTC(Number(year), to[0] - 1, to[1])
        for (let at = Date.UTC(Number(year), from[0] - 1, from[1]); at <= last; at += 24 * 3600 * 1000) {
          BALANCE_HOLIDAY_DATES.set(balanceBeijingKey(at), span.name)
        }
      }
    }

    /* Statutory holiday covering the Beijing day of `ms`, '' on ordinary days. */
    const balanceHolidayName = (ms) => BALANCE_HOLIDAY_DATES.get(balanceBeijingKey(ms)) || ''

    /* True when the WHOLE Beijing day containing `ms` is off-peak: a weekend
       (including the 调休 workdays that fall on one) or a statutory holiday. */
    const balanceDayIsOffPeak = (ms) => {
      const weekday = new Date(ms + 8 * 3600 * 1000).getUTCDay()
      return weekday === 0 || weekday === 6 || BALANCE_HOLIDAY_DATES.has(balanceBeijingKey(ms))
    }

    const BALANCE_PEAK_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]] // minutes-of-day
    /* One ordinary weekday as valley/peak blocks, derived from the peak windows
       above so the two can never disagree: valley, peak, valley, peak, valley. */
    const balanceWeekdayBlocks = () => {
      const blocks = []
      let at = 0
      for (const win of BALANCE_PEAK_WINDOWS) {
        if (win[0] > at) blocks.push([at, win[0], false])
        blocks.push([win[0], win[1], true])
        at = win[1]
      }
      if (at < 24 * 60) blocks.push([at, 24 * 60, false])
      return blocks
    }
    const BALANCE_WEEKDAY_BLOCKS = balanceWeekdayBlocks()
    const BALANCE_OFF_PEAK_DAY_BLOCKS = [[0, 24 * 60, false]]
    /* Ceiling on the equal-price walk. A 9-day 春节 plus its weekends is ~20
       blocks, so this is unreachable in practice; it only stops a broken table
       from walking for a whole second inside a 1s tick. */
    const BALANCE_WINDOW_WALK_CAP = 4096
    const balancePricingWindow = (now) => {
      const t = now.getTime()
      const shift = new Date(t + 8 * 3600 * 1000)
      const minute = shift.getUTCHours() * 60 + shift.getUTCMinutes()
      const secOfDay = minute * 60 + shift.getUTCSeconds()
      const dayMs = 24 * 3600 * 1000
      const dayStart = t - secOfDay * 1000 // Beijing midnight, absolute time
      const blocksAt = (dayOffset) =>
        (balanceDayIsOffPeak(dayStart + dayOffset * dayMs)
          ? BALANCE_OFF_PEAK_DAY_BLOCKS
          : BALANCE_WEEKDAY_BLOCKS)
      const blocks = blocksAt(0)
      let slot = 0
      for (let i = 0; i < blocks.length; i += 1) {
        if (minute >= blocks[i][0] && minute < blocks[i][1]) {
          slot = i
          break
        }
      }
      const peak = blocks[slot][2]
      let windowStart = dayStart + blocks[slot][0] * 60 * 1000
      let windowEnd = dayStart + blocks[slot][1] * 60 * 1000
      if (!peak) {
        /* Walk the flat block sequence outwards from today's block while the
           neighbour stays a valley; the first peak block is the edge. Midnight
           needs no special case because it is not a price edge, which is what
           makes a weekend (or a whole national holiday) one contiguous valley. */
        let day = 0
        let i = slot
        for (let step = 0; step < BALANCE_WINDOW_WALK_CAP; step += 1) {
          if (i > 0) {
            i -= 1
          } else {
            day -= 1
            i = blocksAt(day).length - 1
          }
          const back = blocksAt(day)[i]
          if (back[2]) break
          windowStart = dayStart + day * dayMs + back[0] * 60 * 1000
        }
        day = 0
        i = slot
        for (let step = 0; step < BALANCE_WINDOW_WALK_CAP; step += 1) {
          if (i + 1 < blocksAt(day).length) {
            i += 1
          } else {
            day += 1
            i = 0
          }
          const next = blocksAt(day)[i]
          if (next[2]) break
          windowEnd = dayStart + day * dayMs + next[1] * 60 * 1000
        }
      }
      const elapsedMs = Math.max(0, t - windowStart)
      const totalMs = Math.max(1, windowEnd - windowStart)
      return {
        peak,
        holiday: peak ? '' : balanceHolidayName(dayStart),
        elapsedMs,
        totalMs,
        remainingMs: Math.max(0, windowEnd - t),
        elapsedPct: Math.min(100, Math.round((elapsedMs / totalMs) * 100)),
      }
    }

    /* hh:mm:ss with hours unclamped — a weekend valley legitimately runs past
       a day boundary in feel, and the reference screenshot shows exactly that
       shape ("剩余42:29:37"). */
    const balanceFormatCountdown = (ms) => {
      const total = Math.max(0, Math.floor(ms / 1000))
      const h = Math.floor(total / 3600)
      const m = Math.floor((total % 3600) / 60)
      const s = total % 60
      const pad = (n) => (n < 10 ? '0' + String(n) : String(n))
      return String(h) + ':' + pad(m) + ':' + pad(s)
    }

    /* Re-derive the window from wall clock and repaint the pricing half. Runs
       every tick; before the first balance answer arrives the money half still
       shows its 待机 (¥--) seed, so the capsule never renders an empty slot.
       The dial is driven by ONE custom property: the ring's conic-gradient reads
       --endfield-balance-sweep, so progress never re-lays-out the pill. */
    const balancePaintWindow = () => {
      if (balanceEl === null || typeof document === 'undefined') return
      // Credits mode owns the right-hand dial (consumption share) and has no
      // pricing window: the peak/off-peak clock is a DeepSeek API concept, so
      // a jet-hub channel must not have the next tick overwrite the sweep or
      // resurrect the countdown text. The 1s interval keeps running for the
      // wallet mode's collapse bookkeeping; this early return is the whole
      // mode handoff.
      if (creditProvider !== null) {
        if (balanceBootAt !== 0) {
          const waited = Date.now() - balanceBootAt
          const ready = balanceBootAnswered || waited >= BALANCE_BOOT_MAX_MS
          if (waited >= BALANCE_BOOT_MIN_MS && ready && loaderEl === null) {
            balanceBootAt = 0
            balanceEl.removeAttribute('data-endfield-balance-boot')
          }
        }
        return
      }
      let win
      try {
        win = balancePricingWindow(new Date())
      } catch (e) {
        return
      }
      const setText = (attr, text) => {
        const node = balanceEl.querySelector('[' + attr + ']')
        if (node) node.textContent = text
      }
      const phase = balanceEl.querySelector('[data-endfield-balance-phase]')
      if (phase) {
        phase.textContent = win.peak ? '高峰' : '低谷'
        phase.setAttribute('data-endfield-balance-phase-peak', win.peak ? '1' : '0')
      }
      setText('data-endfield-balance-remain', balanceFormatCountdown(win.remainingMs))
      setText('data-endfield-balance-pct', (win.peak ? '高峰已过' : '低谷已过') + win.elapsedPct + '%')
      // The brand pose names the window it opens onto, so the panel never claims
      // 低谷 while the clock has already crossed into 高峰.
      const brandTitle = balanceEl.querySelector('[data-endfield-balance-brand-title]')
      if (brandTitle) {
        // The pose names the window it opens onto; on a statutory holiday it
        // names the holiday, because 低谷 alone would read as an ordinary night.
        const label = win.peak
          ? 'DeepSeek 当前高峰'
          : 'DeepSeek ' + (win.holiday === '' ? '当前低谷' : win.holiday + '低谷')
        if (brandTitle.textContent !== label) brandTitle.textContent = label
      }
      if (typeof balanceEl.style?.setProperty === 'function') {
        balanceEl.style.setProperty('--endfield-balance-sweep', win.elapsedPct * 3.6 + 'deg')
      }
      /* Collapse the brand pose: held for at least MIN so the brand is readable,
         released by the first answer, capped by MAX when the host never replies,
         and never released while the boot plate is up — the two overlays sit at
         the same point on screen and would cross-fade over each other. No
         radius write-back any more: the stadium is DRAWN by the pill's own
         gradient layers (see the stylesheet), which no border-radius or
         zero-radius pass can strand. */
      if (balanceBootAt !== 0) {
        const waited = Date.now() - balanceBootAt
        const ready = balanceBootAnswered || waited >= BALANCE_BOOT_MAX_MS
        if (waited >= BALANCE_BOOT_MIN_MS && ready && loaderEl === null) {
          balanceBootAt = 0
          balanceEl.removeAttribute('data-endfield-balance-boot')
        }
      }
    }

    const balanceFetch = async () => {
      if (balanceBusy || typeof fetch !== 'function') return
      balanceBusy = true
      try {
        const res = await fetch(BALANCE_URL, { method: 'GET' })
        const payload = await res.json().catch(() => null)
        // A wallet answer never overwrites the channel read: while a jet-hub
        // provider is live the money group belongs to it, so the DeepSeek
        // poll only refreshes the numbers the wallet mode will show when the
        // user switches back.
        if (payload && payload.ok && creditProvider === null) {
          const wallet = balancePickWallet(payload.wallets)
          if (wallet) balancePaint(wallet)
        }
      } catch (e) { /* keep last known values; the next poll retries */ } finally {
        balanceBusy = false
        // "Answered" covers a failed request too: the brand pose is a waiting
        // room, not a promise that money is on the way.
        balanceBootAnswered = true
      }
    }

    /* `forceBoot` replays the opening pose for the settings 预览 button. It is
       the one caller allowed to override the OS reduced-motion preference: the
       user asked for this animation by name, and without the override the button
       would look broken to exactly the people who turn motion down. */
    const showBalanceCapsule = (forceBoot) => {
      if (!isEnabled() || !isBalanceCapsuleOn()) return
      if (typeof document === 'undefined' || !document.body) return
      if (balanceEl !== null) return
      const el = document.createElement('div')
      el.setAttribute('data-endfield-balance', '')
        /* The pill's silhouette is DRAWN by its background gradients (see the
           stylesheet section): two end discs + a band, correct in every renderer.
           border-radius must therefore be ZERO, pinned inline with priority: the
           host roots corner-shape at superellipse(1.5) (Chrome 139+), and the
           squircle it draws for any radius — even a correctly clamped 999px —
           is exactly what stranded this capsule twice (measured: a settled
           32px pill with ~14px caps while the dial's gradient ring in the same
           screenshot was a perfect circle). With no clip box, nothing can shave
           the drawn caps; the zero-radius pass and any host !important both lose
           to an inline !important. Guarded because a jsdom-ish host hands back a
           createElement() node whose style object carries no setProperty. */
      const bootAnimated = forceBoot === true || isBalanceBootAnimated()
      if (el.style && typeof el.style.setProperty === 'function') {
        el.style.setProperty('border-radius', '0', 'important')
      }
      // Informational overlay over navigation: never announced, never hit-tested.
      el.setAttribute('aria-hidden', 'true')
      el.innerHTML =
        '<span data-endfield-balance-icon></span>' +
        '<span data-endfield-balance-money>' +
        '<span data-endfield-balance-currency>¥</span>' +
        '<span data-endfield-balance-int>--</span>' +
        '<span data-endfield-balance-frac></span>' +
        '</span>' +
        // The channel read lives in its own group and swaps with the wallet via
        // the pill's data-endfield-credit-mode attribute (wallet | credits).
        '<span data-endfield-credit-money>' +
        '<span data-endfield-credit-channel></span>' +
        '<span data-endfield-credit-int>--</span>' +
        '<span data-endfield-credit-unit></span>' +
        '</span>' +
        // The pricing countdown is the wallet mode's middle read only — peak/
        // off-peak windows are a DeepSeek API concept, so the credits mode
        // hides the whole run via the same mode attribute.
        '<span data-endfield-balance-window>' +
        '<span data-endfield-balance-phase>低谷</span>' +
        // The 「时段剩余hh:mm:ss」 tail is its own group so a phone can drop
        // the countdown while the 高峰/低谷 label survives: the static glue
        // text has no node of its own and could not be hidden any other way.
        '<span data-endfield-balance-remain-run>' +
        '时段剩余' +
        '<span data-endfield-balance-remain></span>' +
        '</span>' +
        '</span>' +
        // The right-hand slot carries one read per mode: the elapsed pricing
        // share (wallet) or the channel's consumption share (credits). Two
        // exclusive nodes, swapped by the same attribute.
        '<span data-endfield-balance-pct></span>' +
        '<span data-endfield-credit-pct></span>' +
        '<span data-endfield-balance-badge>' +
        '<span data-endfield-balance-ring></span>' +
        '<span data-endfield-balance-clock></span>' +
        '</span>' +
        // The brand pose lives in the same box, absolutely placed over the row:
        // it is inert when the attribute is off (opacity 0, pointer-events none).
        '<span data-endfield-balance-brand>' +
        '<span data-endfield-balance-brand-mark></span>' +
        '<span data-endfield-balance-brand-copy>' +
        '<span data-endfield-balance-brand-kicker>/// DEEPSEEK API</span>' +
        '<span data-endfield-balance-brand-title>DeepSeek 当前低谷</span>' +
        '</span>' +
        '</span>'
      document.body.appendChild(el)
      balanceEl = el
      balanceBootAnswered = false
      if (bootAnimated) {
        // Raised before the first paint, so the pill never flashes the settled
        // row on its way into the pose.
        el.setAttribute('data-endfield-balance-boot', '')
        balanceBootAt = Date.now()
      } else {
        balanceBootAt = 0
      }
      // Wallet mode is the seed: an absent model service or a DeepSeek session
      // must never leave the channel group blanking the money read.
      el.setAttribute('data-endfield-credit-mode', 'wallet')
      creditPaintIdle()
      balanceFetch()
      creditsStart()
      balancePaintWindow()
      if (typeof setInterval === 'function') {
        balanceTimer = setInterval(balancePaintWindow, BALANCE_TICK_MS)
        // One poll heartbeat drives both reads: the wallet fetch and a channel
        // re-resolve. The credit half is throttled inside creditsApply
        // (CREDITS_MIN_INTERVAL_MS since that provider's last completed
        // fetch), so the 60s heartbeat itself costs one cheap local lookup
        // and an actual usage.badge RPC only every five minutes per provider.
        balancePollTimer = setInterval(() => {
          balanceFetch()
          creditsRefresh(false)
        }, BALANCE_POLL_MS)
      }
    }

    const syncBalanceCapsule = () => {
      if (!(isEnabled() && isBalanceCapsuleOn())) {
        destroyBalanceCapsule()
        return
      }
      // showBalanceCapsule() is idempotent (guards on balanceEl), so re-syncing
      // while already mounted just re-asserts the same state.
      showBalanceCapsule()
    }
