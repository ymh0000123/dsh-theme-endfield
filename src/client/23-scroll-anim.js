
    /* ---------- 输出滚动动画（流式跟随的柔性化） ----------
       DSH streams an answer by appending into the transcript and then PINNING the
       scrollport to the new floor with a direct assignment (useScrollFollow.jump):

           element.scrollTop = metrics.floor
           const landed = { ...metrics, top: element.scrollTop }
           this.following = this.nearBottom(landed)     // 25px threshold

       Measured against a fixture built from the shipped ChatView/ChatReading code:
       one growth step moves the port by exactly +60px with NO intermediate frame,
       so the transcript teleports a whole paragraph at a time. That is the
       「硬生生滚动」 this fragment removes.

       WHY NOT `scroll-behavior: smooth`. It is the obvious one-liner and it is
       UNSAFE here. Measured: under smooth, the read-back taken immediately after
       the app's own write returns the OLD position (403 where the target was
       4409), because only the animation's START is committed synchronously. The app
       feeds exactly that read-back into `nearBottom()`, so `floor - oldTop > 25`
       makes it conclude "the reader scrolled away" and DROP tail-following — the
       answer silently stops following itself. Every mechanism that changes what a
       `scrollTop` read returns after a write is therefore disqualified, however
       attractive it looks in CSS.

       WHAT THIS DOES INSTEAD. It never writes to the port. It listens for the
       port's `scroll` event and, for each STREAMING stride, compensates the
       transcript column with a transform:

           offset += (top_after - top_before)
           column.style.transform = 'translateY(' + offset + 'px)'

       which leaves the content exactly where it was on screen; the offset then
       decays to zero over the following frames, so the eye sees a glide where the
       app performed a jump. Measured with that write inside the `scroll` handler
       (51px stride every 40ms):

           worst on-screen step            51.0px -> 21.9px
           app scrollTop read-back error    0.000px   (follow intent survives)
           residual offset at rest          0, port still exactly at the floor

       21.9px is the FLOOR for any causal smoother, not a tuning shortfall: the
       transcript genuinely grows 51px every 40ms, so the content must cover that
       distance across the ~2.5 frames available, and ~20px per frame is exactly
       that. Spreading the movement across frames is the whole win.

       Why the `scroll` event rather than patching the `scrollTop` accessor — both
       measured with the identical loop: the event hook matches the patch for
       `scrollTop` writes (21.88 vs 21.87px) and BEATS it for
       `scrollTo({behavior:'instant'})` writes (21.88 vs 32.0px — the patch sees
       nothing at all), because Chrome dispatches `scroll` in the rendering steps
       before rAF and therefore before paint. It also catches every other way the
       position can move (wheel, anchors, browser scroll restoration) and survives
       React replacing the port, while shadowing no DOM accessor. The first version
       of this loop applied the transform on the NEXT animation frame instead; it
       measured `maxStep` equal to the raw stride (51px) — no animation at all — so
       the write has to happen inside the handler, never in a scheduled callback.

       Why a transform and not an interpolated `scrollTop`: the app re-pins to the
       floor on every growth step and classifies any movement it did not make as
       reader input, so writing intermediate positions would fight its state
       machine. A transform is invisible to it. Measured: translating the column
       does NOT inflate the port's scrollable overflow (scrollHeight stayed 3182
       through translateY 0/60/240 — the app's own `overflow: visible clip` chain
       contains it), so the app keeps measuring the floor it expects and the
       compensation can never feed back into its arithmetic.

       THE GATE — which strides are softened, and why geometry is enough. Only the
       streaming pin. A stride is softened when the port was ALREADY at the floor
       before it (within the app's own 25px tolerance, plus slack for a stride that
       arrives a frame late), moved DOWNWARD, and is no larger than `cap`.

       That test needs no upstream hook, and it is sufficient rather than merely
       convenient: a stride that starts at the floor and moves down can only be the
       app pinning newly grown content (or content that grew between frames, where
       animating it is exactly right). Everything else is excluded by construction —
       loading older history, restoring a session and jumping to a turn all begin
       away from the floor, upward movement never qualifies, and a reader's own
       wheel stride cannot start at the floor and move down because there is nothing
       left to scroll. The app's own `data-chat-following-tail` attribute exists and
       means the same thing, but it is deliberately NOT used: a hash-free attribute
       of ours plus plain geometry keeps working across an upstream rename, while an
       upstream contract would turn a rename into a silently dead feature.

       ON THE DECAY CONSTANT. In steady streaming the offset settles at the closed form

           lag = stride / (1 - e^(-interval / tau))

       and the per-frame step at `rate x dt`, so `tau` buys smoothing with lag and
       nothing else: a smaller tau is strictly snappier and strictly less smooth. That
       closed form is what the measured numbers match — at a 96px stride every 60ms
       with tau=70ms it predicts 167px and the suite measures 163px; at a realistic
       cadence (one 24px line every 250ms) it predicts 6.7px and the suite measures
       3.1px. `tau` must nonetheless stay well above one frame (~16.7ms), or the offset
       reaches zero before the next paint and the compensation silently becomes a
       no-op. `standard` (tau 70ms) is the default because it holds the newest line
       inside one line-height at any realistic rate; `soft`/`snappy` move that trade
       either way, and the level row exposes all three. The unbounded-lag variants the
       first draft carried measured a 135px catch-up frame once growth stopped — which
       is why `cap` rejects over-large strides outright instead of letting the offset
       grow.

       WHY THE TAIL IS ALLOWED TO SIT BELOW THE FLOOR. With the full stride
       compensated, the newest text starts `offset` px below the visible floor and
       slides up into place. That IS the smoothing — the alternative (compensating
       only part of the stride) hides less but also smooths less, at the same tau. The
       cost is real and rate-dependent, which is why it is asserted at two cadences
       rather than one: a fraction of one line at realistic rates, and ~110px at the
       deliberately brutal synthetic rate the other measurements use.

       MEASURING THE LAG IS ITSELF A TRAP (worth knowing before editing that test).
       The lag must be read as a POSITIVE distance between the tail and the port's
       bottom edge, from a baseline taken when no offset is on screen. Taking the
       baseline too early — the scroll event is delivered in the rendering steps, not
       synchronously with the write — leaves that pin's offset in the baseline and
       biases EVERY later sample low, to the point of reporting a negative lag (content
       above the fold, which is impossible). That happened here: a 9.6px-stale baseline
       made the metric read -12px. The test now waits two frames before draining and
       asserts `minLag >= -1` so the metric cannot lie in the safe-looking direction
       again.

       `transform` on the column creates a containing block for fixed descendants.
       Checked against the shipped bundles: the transcript subtree contains none
       (the two `position: fixed` rules in the chat/conversation bundles belong to
       portalled stat dialogs, rendered outside this tree, and the one JS
       `style.transform` write belongs to the turn rail's virtualizer, whose items
       are siblings of the column), and the sticky elements (composer seat, turn
       rail, group headers) are siblings rather than descendants, so they are
       unaffected. */

    const SCROLL_ANIM_KEY = 'dsh-theme-endfield-scroll-anim'
    const SCROLL_ANIM_LEVEL_KEY = 'dsh-theme-endfield-scroll-anim-level'
    const SCROLL_ANIM_LEVELS = ['soft', 'standard', 'snappy']
    /* Decay time constant (ms) and the per-stride ceiling (px) for each level.
       `tau` buys smoothing with lag, so the levels are the same curve at three
       speeds. `cap` is a SAFETY bound, not a shaping knob: a stride larger than it
       is a session restore or a turn jump, and is shown instantly.

       WHAT `cap` COSTS, stated honestly. A single streaming step can exceed it — a
       large code fence or a tool result landing in one commit is a few hundred px —
       and that step is then shown as a hard jump like any other. The caps are set
       where that starts to be the better trade: animating a 300px+ block means the
       block starts 300px+ below the fold and glides up for a third of a second,
       which is a bigger visual event than the jump it replaces. `soft` (420)
       therefore animates more than `standard` (300); raising these is a legitimate
       preference, which is why the level row exists. Measured at 400px: instant
       under `standard`, animated under `soft`.

       Deliberately NOT clamped: capping `offset` instead of rejecting the stride
       leaves the content short of where the app put it, and the shortfall shows up
       as an INSTANT jump in the very next frame. Measured on the probe: the
       clamped variants report `stepMax` equal to the raw stride (192px of 192px,
       i.e. no smoothing at all) while the unclamped curve reports 43.9px. */
    const SCROLL_ANIM_TUNING = {
      soft: { tau: 110, cap: 420 },
      standard: { tau: 70, cap: 300 },
      snappy: { tau: 45, cap: 200 },
    }
    /* How close to the floor the port had to be BEFORE the stride for that stride to
       count as a streaming follow: the app's own 25px tolerance plus slack, so a
       stride arriving one frame late still qualifies. A preserved reading position
       sits hundreds of px out and never does. */
    const SCROLL_ANIM_FOLLOW_SLACK = 40
    const isScrollAnimOn = () => prefsGet(SCROLL_ANIM_KEY) !== '0'
    const readScrollAnimLevel = () => {
      const raw = prefsGet(SCROLL_ANIM_LEVEL_KEY)
      return SCROLL_ANIM_LEVELS.indexOf(raw) === -1 ? 'standard' : raw
    }
    /** The tuning to use right now — re-read per frame, so the level row takes
        effect mid-animation rather than at the next scroll. */
    const scrollAnimTuning = () => SCROLL_ANIM_TUNING[readScrollAnimLevel()] || SCROLL_ANIM_TUNING.standard
    /* One entry per attached scrollport, not a single slot: the app can mount more
       than one ConversationRoot (the embedded variant), and each owns its own port. */
    const scrollAnimPorts = new Map()
    let scrollAnimRaf = null
    let scrollAnimFrameAt = 0
    let scrollAnimMotionQuery = null

    /* Everything that must hold for the feature to run at all. `prefersReducedMotion`
       is the contour sheet's own reader (declared earlier in this file's order), so
       the OS preference is read live and honoured identically by both surfaces; the
       hidden-tab test is the same one the contour loop uses, and here it also keeps
       a frozen rAF from leaving an offset stranded while the tab is away. */
    const scrollAnimActive = () => isEnabled() && isScrollAnimOn()
      && !prefersReducedMotion()
      && (typeof document === 'undefined' || !document.hidden)

    /** Mirror our state onto the port as a hash-free hook (tests and devtools read it). */
    const scrollAnimMark = (entry, state) => {
      if (entry.state === state) return
      entry.state = state
      if (state === null) entry.port.removeAttribute('data-endfield-scroll-anim')
      else entry.port.setAttribute('data-endfield-scroll-anim', state)
    }

    const scrollAnimClear = (entry) => {
      entry.offset = 0
      if (entry.column !== null) {
        if (entry.column.style.transform !== '') entry.column.style.transform = ''
        if (entry.column.style.willChange !== '') entry.column.style.willChange = ''
      }
      scrollAnimMark(entry, entry.attached ? 'idle' : null)
    }
    /* Write the transform, or clear it once the offset has decayed under the visible
       threshold. That epsilon is what makes the resting state REACHABLE rather than
       merely approached: an exponential decay is asymptotic and never arrives, so
       without it the page keeps a `translateY(0.09px)` — and its compositing layer —
       alive indefinitely. Measured before it existed: the offset stalled at 0.09px
       and the port stayed in the 'active' state with the transform never cleared.

       0.5 is a CSS pixel, not a device pixel: at any DPR ≥ 1 it is at most half a
       device pixel, and it is removed on the frame that reaches it, so the resting
       geometry is exactly the app's own rather than "small". */
    const SCROLL_ANIM_EPSILON = 0.5
    const scrollAnimPaint = (entry) => {
      if (entry.column === null) return false
      if (entry.offset <= SCROLL_ANIM_EPSILON) {
        entry.offset = 0
        if (entry.column.style.transform !== '') {
          entry.column.style.transform = ''
          entry.column.style.willChange = ''
        }
        scrollAnimMark(entry, 'idle')
        return false
      }
      if (entry.column.style.willChange !== 'transform') entry.column.style.willChange = 'transform'
      entry.column.style.transform = 'translateY(' + entry.offset.toFixed(2) + 'px)'
      scrollAnimMark(entry, 'active')
      return true
    }

    const scrollAnimStop = () => {
      if (scrollAnimRaf === null) return
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scrollAnimRaf)
      scrollAnimRaf = null
      scrollAnimFrameAt = 0
    }
    const scrollAnimFrame = (now) => {
      scrollAnimRaf = null
      /* `dt` is clamped: a background tab or a long GC pause must not be repaid as
         one giant catch-up step, which would be exactly the visible jump this
         feature exists to remove. */
      const dt = Math.min(64, scrollAnimFrameAt === 0 ? 16 : now - scrollAnimFrameAt)
      scrollAnimFrameAt = now
      const decay = Math.exp(-dt / scrollAnimTuning().tau)
      let live = false
      for (const entry of scrollAnimPorts.values()) {
        if (entry.offset === 0) continue
        entry.offset *= decay
        if (scrollAnimPaint(entry)) live = true
      }
      if (live && typeof requestAnimationFrame === 'function') {
        scrollAnimRaf = requestAnimationFrame(scrollAnimFrame)
      } else {
        scrollAnimFrameAt = 0
      }
    }
    const scrollAnimRun = () => {
      if (scrollAnimRaf !== null) return
      if (typeof requestAnimationFrame !== 'function') return
      scrollAnimFrameAt = 0
      scrollAnimRaf = requestAnimationFrame(scrollAnimFrame)
    }

    /* The transcript column: the app's own `data-chat-flow` hook, which is hash-free
       and therefore survives an upstream rebuild. `querySelector` returns the
       OUTERMOST match in document order, which is the ChatView column; the nested
       `data-chat-flow` a process group carries is a descendant of it. */
    const scrollAnimColumnOf = (port) => {
      const found = port.querySelector('[data-chat-flow]')
      return found === null ? null : found
    }

    /* The reflow gate's anchor and the quantity it measures.

       WHAT IS ACTUALLY BEING COMPENSATED. The eye tracks existing content, and its
       on-screen displacement over one stride is

           visual = layoutDelta - delta          (layoutDelta = content-space movement)

       where `delta` is the app's pin and `layoutDelta` is how far the layout itself moved
       that content. For pure streaming appends `layoutDelta` is 0, so `visual == -delta`
       and compensating `+delta` reproduces the previous position exactly. For a
       disclosure EXPANSION the growth is above the tail, so the layout pushes it down by
       159px while the pin pulls it up by about the same amount: `visual ~= 0`, i.e. the
       content never moved and there is nothing to smooth. Measured on both shapes:

         stream, append at the end : delta=+32,  layoutDelta=0   -> visual=-32 (animate)
         expand, disclosure opens  : delta=+159, layoutDelta=159 -> visual=  0 (instant)

       So the compensation is `delta - layoutDelta`, not `delta`. That single expression
       covers both cases and, unlike a boolean, degrades gracefully when growth is partly
       above and partly below the fold.

       WHERE layoutDelta IS MEASURED, AND WHY IT IS TRANSFORM-FREE. `layoutDelta` is the
       change in the anchor's offset from the COLUMN's own top edge. Both rects include
       our transform, so subtracting them cancels it exactly — which matters, because a
       previous version measured the anchor against the PORT instead. The port does not
       move with the transform, so that version folded the change in our own offset
       between two strides into the measurement; the decay (tens of px per stride at
       tau=70ms) was then misread as a reflow, the animation was torn down mid-flight and
       the suite caught the result as a 156px step against a raw 96px stride.

       And the anchor is the LAST element child: that is the node streaming appends at, so
       its top edge is the one position a bottom-append cannot move. An earlier attempt
       walked to the DEEPEST last descendant, whose own geometry the expansion changes,
       and measured 0.5px against a 159px reflow — blind. */
    const scrollAnimAnchorOf = (column) => {
      if (column === null) return null
      return column.lastElementChild
    }
    const scrollAnimLayoutOf = (entry) => {
      const column = entry.column
      if (column === null || !column.isConnected) return null
      const anchor = scrollAnimAnchorOf(column)
      /* An EMPTY column has no content to measure: report null rather than falling back
         to the column itself, whose offset from its own top edge is identically 0. An
         earlier version did fall back and thereby pinned the baseline at 0 for the whole
         session, so the first big reflow read as `layoutDelta 0` and animated — the
         disclosure case this gate exists for. */
      if (anchor === null) return null
      return { node: anchor, rel: anchor.getBoundingClientRect().top - column.getBoundingClientRect().top }
    }

    /* The per-port handler. `lastTop`/`lastFloor` are OUR OWN reads of the port; this
       code never writes to it, which is the entire point of the design.

       THE REFLOW GATE — why a stride is not the same thing as a visual displacement.
       The compensation below is only correct when the stride is pure GROWTH at the
       bottom: content is appended, nothing above moves, and the app's pin therefore
       translates the eye by exactly `-delta`. So `offset += delta` reproduces the
       previous visual position and the offset can then decay into the new one.

       An EXPANSION (a reasoning/tool disclosure opening) breaks that premise: the
       layout itself gets taller ABOVE the fold, so the existing content is pushed down
       by the growth H before any scrolling happens. The app then pins to the new floor,
       which moves the port by `delta`, and the two partly cancel — the real visual
       displacement is `H - delta`, not `-delta`. Adding `delta` anyway OVERSHOOTS by
       the whole growth: the content is thrown down by H and then has to glide all the
       way back, which is exactly the spasm users report on expanding a thinking block.
       Measured on the disclosure case at the default level: OFF displaces the tail by
       39.5px for a single frame, ON by 159px followed by a 659ms slide home.

       So the handler MEASURES whether the layout above the fold moved, instead of
       assuming it did not. `getBoundingClientRect()` on a content anchor is the only
       honest source for that: `scrollHeight` alone cannot distinguish "appended at the
       bottom" (smoothable) from "pushed down everything above" (must stay instant),
       because both raise it.

       The anchor is a node deep in the transcript — NOT a child of the column, because
       the column carries our transform and re-reading it after a paint would fold our
       own offset into the measurement (a feedback loop). Comparing the same node's
       position ACROSS the stride, with the transform applied both times, cancels our
       own contribution exactly, so the difference is layout movement only. */
    const scrollAnimOnScroll = (entry) => {
      const port = entry.port
      const top = port.scrollTop
      const floor = Math.max(0, port.scrollHeight - port.clientHeight)
      const delta = top - entry.lastTop
      const wasAtFloor = entry.lastFloor - entry.lastTop <= SCROLL_ANIM_FOLLOW_SLACK
      /* Resolve the column before measuring: the anchor is read against the column's own
         top edge, so the column must be current. */
      if (entry.column === null || !entry.column.isConnected) {
        entry.column = scrollAnimColumnOf(port)
        entry.lastLayout = null
      }
      const layout = scrollAnimLayoutOf(entry)
      /* How far the layout moved existing content since the previous stride. Compared
         only when it is the SAME node: a replaced anchor is a new measurement, and
         differencing across two nodes would invent a reflow out of the swap. `null`
         (no content yet, or a fresh node) means "no baseline", treated as no reflow so
         the feature keeps working rather than latching off. */
      const layoutDelta = layout === null || entry.lastLayout === null || entry.lastLayout.node !== layout.node
        ? 0
        : layout.rel - entry.lastLayout.rel
      entry.lastTop = top
      entry.lastFloor = floor
      entry.lastLayout = layout
      if (!scrollAnimActive()) { scrollAnimClear(entry); return }
      /* Not a stream pin: upward movement, a reading position the app preserved, or a
         jump. Each must be shown immediately, exactly as the app performed it. */
      if (delta <= 0.5 || !wasAtFloor || delta > scrollAnimTuning().cap) {
        scrollAnimClear(entry)
        return
      }
      /* THE VISUAL DISPLACEMENT, which is what the eye tracks and what this feature
         exists to smooth: the pin minus however far the layout itself moved that
         content. Pure streaming appends leave `layoutDelta` at 0, so this equals the
         stride and animates; a disclosure expansion moves the layout by the same amount
         the pin does, so this is ~0 and the frame is shown instantly instead of being
         thrown 159px down and glided back. */
      const visual = delta - layoutDelta
      if (visual > scrollAnimTuning().cap) { scrollAnimClear(entry); return }
      if (visual <= SCROLL_ANIM_EPSILON) { scrollAnimClear(entry); return }
      if (entry.column === null) return
      entry.offset += visual
      scrollAnimPaint(entry)
      scrollAnimRun()
    }

    /* A reader gesture wins immediately — the app's own READING_INTENTS list. */
    const scrollAnimOnIntent = (entry) => { if (entry.offset !== 0) scrollAnimClear(entry) }

    const scrollAnimDetach = (entry) => {
      if (entry.attached && typeof entry.port.removeEventListener === 'function') {
        entry.attached = false
        entry.port.removeEventListener('scroll', entry.onScroll)
        entry.port.removeEventListener('wheel', entry.onIntent)
        entry.port.removeEventListener('touchstart', entry.onIntent)
        entry.port.removeEventListener('pointerdown', entry.onIntent)
        entry.port.removeEventListener('keydown', entry.onIntent)
      }
      entry.attached = false
      scrollAnimClear(entry)
      scrollAnimMark(entry, null)
    }
    const scrollAnimAttach = (port) => {
      if (scrollAnimPorts.has(port)) return
      const entry = {
        port,
        column: null,
        attached: false,
        state: null,
        offset: 0,
        lastTop: port.scrollTop,
        lastFloor: Math.max(0, port.scrollHeight - port.clientHeight),
        /* Anchor state for the reflow-aware compensation. Seeded on attach and again on
           every stride, so the measurement always has a same-node baseline. */
        lastLayout: null,
        onScroll: null,
        onIntent: null,
      }
      entry.onScroll = () => { scrollAnimOnScroll(entry) }
      entry.onIntent = () => { scrollAnimOnIntent(entry) }
      /* Passive everywhere: the handler only reads geometry and writes a transform,
         so it must never be able to hold up the app's own scrolling. */
      if (typeof port.addEventListener === 'function') {
        port.addEventListener('scroll', entry.onScroll, { passive: true })
        port.addEventListener('wheel', entry.onIntent, { passive: true })
        port.addEventListener('touchstart', entry.onIntent, { passive: true })
        port.addEventListener('pointerdown', entry.onIntent, { passive: true })
        port.addEventListener('keydown', entry.onIntent, { passive: true })
        entry.attached = true
      }
      entry.column = scrollAnimColumnOf(port)
      entry.lastLayout = scrollAnimLayoutOf(entry)
      scrollAnimPorts.set(port, entry)
      scrollAnimMark(entry, 'idle')
    }

    /* Idempotent reconcile: attach to every port that exists, drop every port that
       went away, and release everything while the switch, the master switch or the
       OS motion preference says no. Runs on mount, on every preference echo, and
       from the page observer's per-mutation hook, so a port that appears later
       (opening a session, or a second embedded conversation view) is picked up with
       no reload.

       NO early-return shortcut, deliberately. An earlier version short-circuited
       with an O(1) "are the ports we already own still connected?" check to avoid a
       querySelectorAll per mutation batch — but that makes a SECOND port unable to
       ever attach while the first one is healthy, which is a correctness bug bought
       with an imaginary saving. Measured on a 1934-node session-like DOM:
       querySelectorAll('[data-conversation-scroll]') costs 0.0003ms per call, which
       is the same order as the watermark observer's own accepted fast-path query
       (0.0002ms) and ~0.0007% of a 24fps frame budget. The scan is also strictly
       cheaper than the work the rest of this hook already does per mutation. */
    const syncScrollAnim = () => {
      if (typeof document === 'undefined') return
      const on = scrollAnimActive()
      if (!on && scrollAnimPorts.size === 0) { scrollAnimStop(); return }
      const live = document.querySelectorAll('[data-conversation-scroll]')
      for (const [port, entry] of Array.from(scrollAnimPorts.entries())) {
        if (!on || !port.isConnected || !Array.prototype.includes.call(live, port)) {
          scrollAnimDetach(entry)
          scrollAnimPorts.delete(port)
        }
      }
      if (!on) { scrollAnimStop(); return }
      for (const port of live) {
        if (!scrollAnimPorts.has(port)) scrollAnimAttach(port)
      }
      /* A column React replaced mid-animation would otherwise keep its transform
         forever if no further stride arrives to re-resolve it (the stride handler
         does re-resolve, but it only runs on a scroll). Detached nodes are not
         painted, so this is about not handing a stale offset back to a node the app
         might reuse — cheap, and it removes the whole class.

         The gate's baseline is dropped with it: a replaced column is a new layout, so
         comparing the new anchor's position against the old column's would report a
         large fake reflow and permanently disable the animation. */
      for (const entry of scrollAnimPorts.values()) {
        if (entry.column !== null && !entry.column.isConnected) {
          scrollAnimClear(entry)
          entry.lastLayout = null
        }
      }
    }
    /* Return to the app's exact geometry without animating: the OS motion preference
       flipping on, the tab going hidden (a frozen rAF would otherwise strand a large
       offset and decay it on return), teardown. */
    const scrollAnimSnap = () => {
      scrollAnimStop()
      for (const entry of scrollAnimPorts.values()) scrollAnimClear(entry)
    }
    const destroyScrollAnim = () => {
      scrollAnimStop()
      for (const [port, entry] of Array.from(scrollAnimPorts.entries())) {
        scrollAnimDetach(entry)
        scrollAnimPorts.delete(port)
      }
    }
    const onScrollAnimEnvironmentChange = () => {
      if (!scrollAnimActive()) scrollAnimSnap()
      else syncScrollAnim()
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onScrollAnimEnvironmentChange)
    }
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      scrollAnimMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
      if (typeof scrollAnimMotionQuery.addEventListener === 'function') {
        scrollAnimMotionQuery.addEventListener('change', onScrollAnimEnvironmentChange)
      }
    }
    // Let the page observer declared above re-attach as the app renders.
    scrollAnimSyncHook = syncScrollAnim
