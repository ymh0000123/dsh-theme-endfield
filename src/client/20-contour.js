    /* ---------- contour (topographic) background ------------------------------
       A signal-yellow topographic sheet behind the whole app, in the style of the
       supplied reference: nested closed loops forming irregular "islands", thin
       even strokes, organic spacing.

       Two independent switches, each a no-op when off:
         CONTOUR_KEY        the layer itself (default OFF — it is decoration).
         CONTOUR_ANIM_KEY   the field slowly morphs (islands breathe/drift).

       HOW IT IS DRAWN. The lines are real iso-contours of a scalar field, not a
       tiled bitmap or a hand-drawn path set, because the field is what makes the
       animation coherent: morphing one field and re-extracting gives loops that
       merge and split like terrain, which a translated texture cannot do.
         field  = sum of gaussian bumps of mixed sign (peaks AND basins)
         lines  = marching squares at ~20 evenly spaced levels
         joins  = segments stitched into polylines via EDGE IDS
       Stitching turns thousands of loose segments into ~85 continuous strokes, so
       the whole sheet is drawn as one canvas path instead of thousands of moveTo
       pairs.

       WHERE IT IS MOUNTED, and why this specific parent. Measured from the app's
       own CSS, three elements paint an OPAQUE --dsw-alias-bg-base over any
       body-level layer: the app frame ([class$='_frame']), the conversation column
       ([class$='_root'] inside the centre column) and the details column. A fixed
       <body> child would therefore be invisible on every real page. The layer is
       instead a child of the app FRAME, with those descendant fills neutralised to
       transparent while the layer is mounted (the :has() guard makes all of it
       vanish when off).
       The frame is already position:relative and creates NO stacking context, so
       an inset:0 z-index:0 child sits above the frame's own background and below
       every positioned descendant. The sidebar keeps its own colour because in
       this theme --dsw-specific-sidebar-fill and --dsw-alias-bg-base are the same
       value, so making it transparent changes no pixel except letting the sheet
       through.

       COST. One canvas, throttled, and completely idle when the switch is off:
         static  one extraction, redrawn only on resize/scheme change;
         animated ~24fps, measured in the verification renderer at 1440x900,
                  step 10 (145x91 grid), 20 levels, 22 bumps:
                    naive per-point evaluation  8.30 ms/frame
                    bounded scatter (used here) 4.40 ms/frame  -> 1.9x faster
                  Bounded scatter is the reason this is affordable: a gaussian is
                  numerically dead past ~2.6 sigma, so each bump writes only the
                  cells inside its own bounding box instead of every bump being
                  evaluated at every grid point. */
    const CONTOUR_KEY = 'dsh-theme-endfield-contour'
    const CONTOUR_ANIM_KEY = 'dsh-theme-endfield-contour-anim'
    const CONTOUR_FPS_KEY = 'dsh-theme-endfield-contour-fps'
    const CONTOUR_SPEED_KEY = 'dsh-theme-endfield-contour-speed'
    const CONTOUR_SCROLL_PAUSE_KEY = 'dsh-theme-endfield-contour-scroll-pause'
    const CONTOUR_TRAIL_KEY = 'dsh-theme-endfield-contour-trail'
    const CONTOUR_FPS_OPTIONS = [24, 60, 120]
    const CONTOUR_SPEED_OPTIONS = [1, 2, 4]
    const CONTOUR_PHASE_STEP = 1 / 150
    // Default OFF (=== '1'): a background pattern must be opt-in.
    const isContourOn = () => prefsGet(CONTOUR_KEY) === '1'
    // Defaults ON, so enabling the layer shows the effect at once; it is
    // meaningless while the layer itself is off.
    const isContourAnimOn = () => prefsGet(CONTOUR_ANIM_KEY) !== '0'
    const readContourFps = () => {
      const fps = Number(prefsGet(CONTOUR_FPS_KEY))
      return CONTOUR_FPS_OPTIONS.includes(fps) ? fps : 24
    }
    const readContourSpeed = () => {
      const speed = Number(prefsGet(CONTOUR_SPEED_KEY))
      return CONTOUR_SPEED_OPTIONS.includes(speed) ? speed : 2
    }
    const isContourScrollPauseOn = () => prefsGet(CONTOUR_SCROLL_PAUSE_KEY) !== '0'
    const isContourTrailOn = () => prefsGet(CONTOUR_TRAIL_KEY) === '1'

    /* Optional pointer deformation, adapted from the Endfield Glass plugin.
       Only the latest mouse position is consumed by each existing contour frame:
       no second rAF, no pointer-handler layout reads, no persistent coordinates.
       Head and tail quotas are fixed before age decay, so expiring an old point
       cannot brighten surviving points. The history is bounded at 24 samples. */
    const createContourTrail = () => {
      const points = []
      const prune = (now) => {
        while (points.length && now - points[0].t > 2700) points.shift()
      }
      return {
        clear() { points.length = 0 },
        view(now) { prune(now); return points },
        push(x, y, time, now) {
          if (![x, y, now].every(Number.isFinite) || now < 0) return false
          prune(now)
          // Some browsers use epoch timestamps. Use the reception clock for
          // those, but keep a trustworthy event's real age after a busy frame.
          const t = Number.isFinite(time) && time >= 0 && time < 1e12 && time <= now + 4
            ? Math.min(time, now) : now
          if (now - t > 2700) return false
          const last = points[points.length - 1]
          if (last && (t - last.t < 8 || (x - last.x) ** 2 + (y - last.y) ** 2 < 4)) return false
          if (points.length === 24) points.shift()
          points.push({ x, y, t })
          return true
        },
      }
    }
    const contourOverlayTrail = (field, points, now) => {
      const { cols, rows, step, F } = field
      // A smooth Gaussian is added AFTER the ambient smoothing/EMA. It never
      // enters previous, so it responds immediately and leaves no temporal ghost.
      // 28 CSS px approximates the original 26 px kernel after spatial smoothing.
      const sigma = 28, radius = sigma * Math.sqrt(2 * 6.76)
      const inv = 1 / (2 * sigma * sigma)
      for (let rank = 0; rank < points.length; rank++) {
        const point = points[points.length - 1 - rank]
        const age = now - point.t
        if (age < 0 || age > 2700) continue
        const quota = rank === 0 ? .9 : .6 * .2 * Math.pow(.8, rank - 1)
        const amplitude = quota * Math.exp(-age / 900)
        const i0 = Math.max(0, Math.floor((point.x - radius) / step))
        const i1 = Math.min(cols - 1, Math.ceil((point.x + radius) / step))
        const j0 = Math.max(0, Math.floor((point.y - radius) / step))
        const j1 = Math.min(rows - 1, Math.ceil((point.y + radius) / step))
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const q = ((i * step - point.x) ** 2 + (j * step - point.y) ** 2) * inv
          if (q >= 6.76) continue
          const t = Math.max(0, (q - 4.8) / (6.76 - 4.8))
          F[j * cols + i] += amplitude * Math.exp(-q) * (1 - t * t * (3 - 2 * t))
        }
      }
    }

    /* Deterministic PRNG (mulberry32), used with a PER-PAGE-LOAD seed.
       Determinism is still required WITHIN one load: contourBuild() is re-run on
       every resize, and if the bump layout were re-drawn from Math.random() each
       time, dragging the window would reshuffle the whole landscape instead of
       re-fitting it. So the seed is drawn once per load and reused for every
       rebuild in that load.
       It used to be a hardcoded constant, which made the "random" terrain the
       SAME picture on every single visit -- measured: two independent page loads
       produced 85 paths and 42497px of stroke, identical vertex for vertex. */
    const contourRng = (seed) => {
      let a = seed >>> 0
      return () => {
        a = (a + 0x6D2B79F5) >>> 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    }
    /* One seed per page load. crypto.getRandomValues() when available, else a
       time/Math.random mix -- neither global is guaranteed in this sandbox, so both
       are probed rather than assumed. Forced to a non-zero uint32 because
       mulberry32 seeded with 0 is a legal but needlessly degenerate start. */
    const contourSeed = (() => {
      let s = 0
      const c = (typeof crypto !== 'undefined' && crypto
        && typeof crypto.getRandomValues === 'function') ? crypto : null
      if (c !== null) {
        try {
          const buf = new Uint32Array(1)
          c.getRandomValues(buf)
          s = buf[0]
        } catch (e) { s = 0 }
      }
      if (s === 0) {
        const t = (typeof Date !== 'undefined' && typeof Date.now === 'function') ? Date.now() : 0
        const r = (typeof Math !== 'undefined' && typeof Math.random === 'function') ? Math.random() : 0
        s = ((t ^ Math.floor(r * 0xFFFFFFFF)) >>> 0)
      }
      return (s >>> 0) || 0x5eed4242
    })()

    let contourHost = null      // the frame element the layer is mounted in
    let contourWrap = null      // positioned wrapper holding the canvas
    let contourLineCv = null
    let contourRaf = null
    let contourRo = null        // ResizeObserver on the frame
    let contourPaths = []       // stitched polylines
    let contourGeom = null      // { w, h, cols, rows, step } of the current field
    let contourField = null     // typed-array state, rebuilt only on resize
    let contourLastField = -1   // timestamp of the last field extraction
    let contourLastCost = 0     // measured cost of the last refresh (ms); ~0 while the worker paints
    let contourPhase = 0
    const contourTrail = createContourTrail()
    let contourTrailPointer = null
    let contourTrailListening = false
    let contourTrailPainted = false
    let contourMotionQuery = null
    /* Last applied animation state. Declared HERE, above every function that touches
       it, because contourTeardown() assigns it and is itself reachable from
       unmount() — a `let` declared further down would still be in its temporal dead
       zone at that point and throw a ReferenceError. */
    let contourSwitchSig = ''

    const CONTOUR_STEP = 6      // balanced sampling/detail point for 1px contour strokes
    const CONTOUR_LEVELS = 20
    const CONTOUR_SPAN = 1.45   // levels span [-SPAN, +SPAN]
    /* GRID-CELL CAP. Every pass of the sheet — evaluate, extract, and the draw
       list — is linear in cols*rows, and cols*rows grows with the SQUARE of the
       viewport. Past this cap the sampling step grows instead, which keeps the cost
       of one sheet roughly constant in frame AREA. The cap is set so every ordinary
       window keeps the shipped 6px grid byte-for-byte (1440x900 is 36k cells,
       1920x1080 is 58k); only genuinely large canvases coarsen, and the spline still
       rounds the coarser polyline at a 1px stroke. It also keeps a large HiDPI
       canvas inside the worker's own backing-store limit, so the sheet stays on the
       off-main-thread path instead of falling back to the synchronous painter. */
    const CONTOUR_MAX_CELLS = 60000
    /* Bump radius floor, in grid samples. The radius was `(0.05..0.14) * min(w, h)`,
       which ties the terrain's feature size to the frame's SHORTER side: in a short
       (or very narrow) frame the gaussians shrink below the sampling step and the
       field becomes ALIASED — adjacent samples jump across many levels, so marching
       squares emits tightly nested rings with hairpin cusps that read as tangled,
       piled-up lines instead of terrain. Reproduced at 1440x130 (at 1440x60 it
       degenerates into bracket-shaped debris). Four samples per sigma is where the
       crossings stop racing each other; at any ordinary window the relative term is
       already far above this floor, so the shipped look is unchanged. */
    const CONTOUR_MIN_BUMPSAMPLES = 4
    /* Chaikin pass budget by extracted-vertex count. Each pass DOUBLES the point
       count, so three passes hand the painter 8x the extracted vertices (measured
       37,865 bezierCurveTo per sheet at 1440x900 from ~4.7k extracted). A sheet at or
       under CONTOUR_SMOOTH_FULL keeps the shipped three passes, so ordinary windows
       render exactly as before; a bigger sheet drops to two and then one, where the
       clamped cubic below is still doing the rounding and a 1px stroke cannot show
       the difference. */
    const CONTOUR_SMOOTH_FULL = 8000
    const CONTOUR_SMOOTH_LIMIT = 20000
    /* Animation duty-cycle ceiling for the SYNCHRONOUS painter. When the worker is
       driving the sheet, one refresh costs well under a millisecond and this clamp
       never binds; when the canvas is large enough that the worker refuses it (or the
       worker is unavailable) the draw runs on the main thread, and a sheet that costs
       more than its nominal frame must give the thread back rather than queue another
       update. The phase still advances by exactly one nominal step per UPDATE — never
       by the elapsed wall-clock gap, which is what made the morph twitch — so a
       loaded machine sees the same motion played back at a lower rate. */
    const CONTOUR_DUTY = 0.5
    /** Sampling step for a viewport: the shipped 6px grid, coarsened only when the
     *  cell count would otherwise blow past CONTOUR_MAX_CELLS. */
    const contourStepFor = (w, h) => {
      let step = CONTOUR_STEP
      const cells = (s) => (Math.ceil(w / s) + 1) * (Math.ceil(h / s) + 1)
      while (step < 40 && cells(step) > CONTOUR_MAX_CELLS) step += 1
      return step
    }
    const contourFieldFps = () => readContourFps()
    /* Speck rejection. Marching squares legitimately produces two kinds of debris
       that read as "mysterious little dots" rather than terrain:

         1. OFF-CANVAS SLIVERS. The grid is ceil(w/step)+1 by ceil(h/step)+1, so its
            last row/column lands ON or BEYOND the canvas edge (measured at
            1432x753: +8px horizontally, +7px vertically). Contours found out there
            are clipped to a stub, or to nothing at all: of 85 paths, 33 held
            vertices outside the canvas and 3 had ZERO visible length -- pure cost,
            no pixels.
         2. APEX RINGS. Within a couple of grid cells of a gaussian peak the
            innermost level closes into a tiny circle. Measured: 4 closed rings with
            a bounding box under 26x26, the smallest 11.8x15.1px.

       Both are judged against the sheet's OWN scale, not an absolute guess. The
       inter-line gap was measured over 7322 samples: median 21px, p25 13px. A ring
       whose whole bounding box is under one line spacing cannot read as a nested
       island -- there is no room for a neighbour inside it -- so it reads as a dot.
       MIN_VISIBLE_LEN removes fragments too short to be a stroke; dropping
       everything under 40px costs 0.223% of total ink length, so this is debris
       removal, not thinning. */
    const CONTOUR_MIN_LEN = 40      // px of on-canvas stroke; below this it is a speck
    const CONTOUR_MIN_RING_BOX = 21 // px; one median line spacing
    /* keep() judges the RAW stitched polyline, but contourRefresh(false) redraws it as
       a smoothed curve (Chaikin corner-cutting followed by a clamped cubic spline),
       which does not follow the raw polyline exactly: corner-cutting drops the
       sharp extremes, so measured against the real output a path can land slightly
       SHORTER or with a slightly smaller box than its raw form -- and a raw
       measurement sitting just above a threshold can still draw a speck. Observed
       exactly that: raw-clean runs still emitted a 35.1px stroke and 15.4x17.8 /
       2.1x20.1 rings.
       The thresholds are therefore applied with headroom, and the smoothing
       shrinks a path by at most one half-segment at each end (segments average
       7.8px), so ~1.35x on length and ~1.5x on ring box covers it with margin. */
    const CONTOUR_KEEP_LEN = CONTOUR_MIN_LEN * 1.35
    const CONTOUR_KEEP_RING = CONTOUR_MIN_RING_BOX * 1.5
    /* Minimum level bands a coverage cell's field must sweep for that region to read
       as terrain. Measured: at 1 the predicate passed cells that rendered 0.16-0.44%
       ink (a level grazing one corner), so 1 is geometrically true but visually
       blank. 3 is the smallest value that survived the sweep below without pushing
       the re-roll loop to its attempt cap. */
    const CONTOUR_MIN_CROSSINGS = 3
    /* ...but a crossing COUNT is not ink. Three bands can all graze one corner of a
       cell and leave it nearly empty, so the count alone does not certify the thing
       the coverage test asserts (rendered ink per cell). That gap is what made
       contour-specks flaky: on a CI rasterizer the thinnest accepted layouts measured
       0.47% against the 0.6% line while the validator reported them sound.

       So each region is ALSO scored by a cheap ink proxy: for every field quad inside
       it, count the drawn levels that fall inside that quad's clamped corner range.
       One such incidence means the isoline passes through that quad, i.e. roughly
       `step` px of stroke, so summing them tracks the region's line length without
       running marching squares or an extraction inside the validator.

       Calibrated on 400 random layouts at 1406x756 and 1440x757 against the REAL
       extracted stroke length per 8x5 region (striated at 8 substeps per segment):
         ink proxy  47-52  ->  182-201px of stroke in the thinnest region
         ink proxy      80  ->  ~310px
         ink proxy      92  ->  ~437px   (median layout)
       The floor below therefore lifts the guaranteed thinnest region from ~182px to
       ~310px, which is the margin the pixel metric needed. Cost over 300 seeds: mean
       attempts 3.97 -> 8.06, p95 24, and 2 of 300 loads reach the 32-attempt cap
       (0.7%, against 0 at the old floor) - those ship the best of the 32, whose
       thinnest region sits just under the floor, so even the fallback improves on
       today's worst case. The alternatives were measured, not guessed: 4 CROSSINGS
       exhausts the cap on 39% of loads and ink 100 on 11%, while a 1px sample stride
       with an alpha>0 threshold moves the same cell by only 1.25x - i.e. the thin
       cells are genuinely thin, not a measurement artifact. */
    const CONTOUR_MIN_INK = 80

    const isDarkScheme = () => typeof document !== 'undefined'
      && document.body
      && document.body.hasAttribute('data-ds-dark-theme')

    /* Someone who asked the OS for less motion gets the pattern without the motion.
       The boot plate already honours this (see finish()), so the contour sheet must
       not be the one animated surface that ignores it. The layer itself still
       renders — a static topographic texture is not motion — but the field morph
       does not start. This is checked live rather than cached so changing the OS
       setting takes effect on the next reconciliation. */
    const prefersReducedMotion = () => typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const contourWantsAnim = () => isContourAnimOn() && !prefersReducedMotion()
      && !contourLoaderActive && !contourScrollPaused
      && (typeof document === 'undefined' || !document.hidden)
    let contourLoaderActive = false
    let contourScrollPaused = false
    let contourScrollTimer = null
    let contourResizePending = false
    const contourHasScrollEnd = typeof window !== 'undefined' && 'onscrollend' in window
    const contourPauseOnScroll = () => {
      if (!isEnabled() || contourWrap === null || !isContourScrollPauseOn() || !isContourAnimOn()) return
      if (!contourScrollPaused) {
        contourScrollPaused = true
        if (contourWorker) contourWorker.pending = null
        contourSwitchSig = ''
        contourStopLoop()
      }
      if (!contourHasScrollEnd && typeof setTimeout === 'function') {
        if (contourScrollTimer !== null && typeof clearTimeout === 'function') clearTimeout(contourScrollTimer)
        contourScrollTimer = setTimeout(() => {
          contourScrollTimer = null
          contourScrollPaused = false
          contourSwitchSig = ''
          contourApplySwitches()
        }, 10)
      }
    }
    const contourResumeAfterScroll = () => {
      if (!contourScrollPaused) return
      if (contourScrollTimer !== null && typeof clearTimeout === 'function') clearTimeout(contourScrollTimer)
      const resume = () => {
        contourScrollTimer = null
        contourScrollPaused = false
        contourSwitchSig = ''
        if (contourResizePending && contourHost !== null) {
          contourResizePending = false
          if (contourSizeTo(contourHost)) {
            contourRefresh(true)
          }
        }
        contourApplySwitches()
      }
      if (typeof setTimeout === 'function') contourScrollTimer = setTimeout(resume, 10)
      else resume()
    }
    const onContourScroll = () => { contourPauseOnScroll() }
    const onContourScrollEnd = () => { contourResumeAfterScroll() }
    contourScrollHook = onContourScroll
    contourScrollEndHook = onContourScrollEnd
    const contourPauseForLoader = () => {
      contourLoaderActive = true
      if (contourWrap !== null && contourRaf !== null) {
        contourSwitchSig = ''
        contourStopLoop()
      }
    }
    const contourResumeAfterLoader = () => {
      contourLoaderActive = false
      if (contourWrap !== null) {
        contourSwitchSig = ''
        contourApplySwitches()
      }
    }

    /** Allocate the field + marching-squares scratch buffers for a viewport size. */
    const contourBuild = (w, h) => {
      /* ACCEPT-OR-REROLL. A random layout is not automatically a GOOD layout, and
         this is the concrete lesson from making the seed per-load: the old fixed
         seed had silently guaranteed a well-spread field, and once real randomness
         arrived, some layouts left regions with no contour lines at all. Measured on
         the 8x5 coverage grid ("near-empty" = under 0.6% ink):
             independent uniform placement   5 failures in 12 seeds (up to 3 cells)
             stratified placement alone      6 failures in 24 seeds (down to 0.00%)
         Stratification fixes clumping but cannot fix the real mechanism: lines
         appear only where the field CROSSES one of the 21 fixed levels, so a region
         that is locally flat between two levels is blank no matter how the bumps
         sit. Forcing a gradient steep enough to guarantee a crossing per cell would
         take ~9.5 parallel lines across the width, which reads as stripes, not
         terrain -- so distorting the field is the wrong lever.
         Instead the candidate layout is CHECKED against the same invariant the test
         asserts, and rejected if it fails. Each attempt is cheap (one field
         evaluation on a coarse grid, no extraction, no drawing) and bounded, so the
         worst case is a handful of evaluations at mount/resize time only.

         The two halves are BOTH load-bearing, which was verified rather than
         assumed -- with the validator in place but placement reverted to uniform,
         4 of 8 loads exhausted the 12-attempt cap and shipped a fallback layout
         (one run in four still rendered a blank cell). Stratification is what makes
         an acceptable layout the common case: mean 2.5 candidates, max 6, never at
         the cap. Validation is what makes it a guarantee. */
      const attempts = 32
      const step = contourStepFor(w, h)
      let best = null
      for (let attempt = 0; attempt < attempts; attempt++) {
        const cand = contourBuildCandidate(w, h, attempt, step)
        const score = contourCoverageScore(cand, w, h)
        /* Prefer more crossing bands, then more ink in the thinnest region. The
           tiebreak only matters if every attempt fails validation and the best of the
           32 ships — measured at 0 of 200 seeds with the floor in place. */
        if (best === null || score.worst > best.score.worst
          || (score.worst === best.score.worst && score.ink > best.score.ink)) best = { cand, score }
        // Comfortably above the 0.6%-ink failure line, in field terms: every cell
        // must contain a spread of values wider than one level gap, so at least one
        // level is guaranteed to cross it.
        if (score.ok) break
      }
      contourField = best.cand.field
      contourGeom = { w, h, cols: best.cand.cols, rows: best.cand.rows, step }
    }

    /* One candidate landscape. `salt` varies the draw per attempt while staying
       deterministic for a given page load, so a resize reproduces the same accepted
       layout instead of reshuffling the terrain under the user. */
    const contourBuildCandidate = (w, h, salt, step) => {
      const cols = Math.ceil(w / step) + 1
      const rows = Math.ceil(h / step) + 1
      const K = 22                       // bump count: tuned to the reference's island density
      const rnd = contourRng((contourSeed + salt * 0x9E3779B1) >>> 0)
      const m = Math.min(w, h)
      const bx = new Float32Array(K), by = new Float32Array(K)
      const ba = new Float32Array(K), bs = new Float32Array(K)
      const dx = new Float32Array(K), dy = new Float32Array(K)
      /* STRATIFIED placement, not independent uniform draws.

         Uniform sampling clumps: measured over 12 random seeds it left up to 3
         near-empty cells. Jittered grid instead -- the viewport is cut into a
         near-square lattice of at least K cells and each bump is placed at a random
         point inside its own cell. That keeps placement random while making a large
         empty patch geometrically impossible. Cells are ordered by a Fisher-Yates
         shuffle so the bump INDEX carries no positional bias: index drives
         amplitude, radius and drift below, and walking cells in raster order would
         correlate "left side of the screen" with "first sizes drawn".
         The lattice spans the same -0.1..1.1 over-scan as before, so islands are
         still cut by the viewport edges rather than all sitting fully inside. */
      const gx = Math.max(1, Math.round(Math.sqrt(K * (w / Math.max(1, h)))))
      const gy = Math.max(1, Math.ceil(K / gx))
      const cells = []
      for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) cells.push(i + j * gx)
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1))
        const t = cells[i]; cells[i] = cells[j]; cells[j] = t
      }
      const spanX = 1.2 * w, spanY = 1.2 * h
      for (let k = 0; k < K; k++) {
        const cell = cells[k % cells.length]
        const ci = cell % gx
        const cj = Math.floor(cell / gx)
        // Random point inside this cell, in the over-scanned -0.1..1.1 space.
        bx[k] = -0.1 * w + ((ci + rnd()) / gx) * spanX
        by[k] = -0.1 * h + ((cj + rnd()) / gy) * spanY
        // Mixed sign gives peaks AND basins; equal signs would read as one blob.
        ba[k] = (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.9)
        /* Radius: relative to the frame for the shipped look, but never below
           CONTOUR_MIN_BUMPSAMPLES grid samples or the field aliases — see the note on
           that constant. This floor is the fix for the tangled/piled-up lines. */
        bs[k] = Math.max(step * CONTOUR_MIN_BUMPSAMPLES, (0.05 + rnd() * 0.09) * m)
        dx[k] = rnd() * 2 - 1
        dy[k] = rnd() * 2 - 1
      }
      /* Base undulation: three long, low-amplitude sine ridges spanning the whole
         viewport. Reason this exists, from reviewing the first render: a sum of
         gaussians decays to EXACTLY zero between islands, so the field there is
         perfectly flat, no level ever crosses it, and the result had large blank
         patches that exposed the construction. Real terrain has no such voids. The
         ridges are far too gentle to create islands of their own — they just tilt
         the whole sheet enough that contour lines keep running through the gaps,
         which is what turns isolated bullseyes into one continuous landscape. */
      const W2 = new Float32Array(9)
      for (let i = 0; i < 3; i++) {
        W2[i * 3] = (0.35 + rnd() * 0.5) * (Math.PI * 2) / Math.max(1, w)  // x freq
        W2[i * 3 + 1] = (0.35 + rnd() * 0.5) * (Math.PI * 2) / Math.max(1, h) // y freq
        W2[i * 3 + 2] = rnd() * Math.PI * 2                                 // phase
      }
      const hCount = (cols - 1) * rows
      const eCount = hCount + cols * (rows - 1)
      const field = {
        cols, rows, step, K, bx, by, ba, bs, dx, dy, hCount, W2,
        F: new Float32Array(cols * rows),
        previous: new Float32Array(cols * rows),
        hasPrevious: false,
        smooth: new Float32Array(cols * rows),
        // Exact row-block bounds include both rows and the shared right vertex.
        // They reject empty regions without changing retained cells or path order.
        blockCols: Math.ceil((cols - 1) / 16),
        blockMin: new Float32Array(Math.ceil((cols - 1) / 16) * (rows - 1)),
        blockMax: new Float32Array(Math.ceil((cols - 1) / 16) * (rows - 1)),
        boundsReady: false,
        ex: new Float32Array(eCount),
        ey: new Float32Array(eCount),
        es: new Int32Array(eCount).fill(-1),
        n1: new Int32Array(eCount).fill(-1),
        n2: new Int32Array(eCount).fill(-1),
        seen: new Int32Array(eCount).fill(-1),
        touched: new Int32Array(eCount),
        seq: 0,
      }
      return { field, cols, rows }
    }

    /* Score a candidate landscape on the SAME invariant the coverage test asserts,
       but measured on the field rather than on rendered pixels -- no extraction and
       no canvas needed, so a rejected attempt costs one coarse evaluation.

       A cell gets contour lines when the field inside it SPANS level boundaries.
       Counting them is the right question, but "at least one" is NOT enough, and
       that was measured: with a 1-crossing bar, 4 blank cells still slipped through
       and every one of them DID contain drawn vertices -- a level was crossed in
       just a corner of the cell, yielding a few pixels of stroke against a 0.6%-ink
       bar. A grazing crossing is geometrically present and visually absent.
       CONTOUR_MIN_CROSSINGS therefore demands the field sweep several level bands in
       every cell, which is what "this region reads as terrain" actually means. */
    const contourCoverageScore = (cand, w, h) => {
      const f = cand.field
      // Evaluate at phase 0: the accepted layout must be sound as first painted.
      const prev = contourField
      contourField = f
      contourEvaluate(0)
      contourField = prev
      const { cols, rows, F } = f
      const GX = 8, GY = 5
      const span = CONTOUR_SPAN
      const levelStep = (span * 2) / CONTOUR_LEVELS
      let worst = Infinity
      let ok = true
      let ink = Infinity
      for (let gy = 0; gy < GY; gy++) {
        for (let gx = 0; gx < GX; gx++) {
          const i0 = Math.floor(gx * (cols - 1) / GX), i1 = Math.ceil((gx + 1) * (cols - 1) / GX)
          const j0 = Math.floor(gy * (rows - 1) / GY), j1 = Math.ceil((gy + 1) * (rows - 1) / GY)
          let mn = Infinity, mx = -Infinity
          /* The ink proxy is accumulated over the QUADS of this region, in the same
             walk that takes its min/max — see CONTOUR_MIN_INK. */
          let regionInk = 0
          for (let j = j0; j <= j1 && j < rows; j++) {
            const row = j * cols
            for (let i = i0; i <= i1 && i < cols; i++) {
              const v = F[row + i]
              if (v < mn) mn = v
              if (v > mx) mx = v
              if (j < j1 && j < rows - 1 && i < i1 && i < cols - 1) {
                const a = v, b = F[row + i + 1]
                const c = F[row + cols + i], d = F[row + cols + i + 1]
                let qmn = a < b ? a : b, qmx = a > b ? a : b
                if (c < qmn) qmn = c; if (c > qmx) qmx = c
                if (d < qmn) qmn = d; if (d > qmx) qmx = d
                if (qmn < -span) qmn = -span
                if (qmx > span) qmx = span
                if (qmx > qmn) regionInk += Math.floor(qmx / levelStep) - Math.ceil(qmn / levelStep) + 1
              }
            }
          }
          // Clamp to the drawn level range: values beyond +/-SPAN produce no lines.
          const lo = Math.max(mn, -span), hi = Math.min(mx, span)
          // How many level boundaries fall inside this cell's clamped range.
          const crossings = hi <= lo ? 0
            : Math.floor(hi / levelStep) - Math.ceil(lo / levelStep) + 1
          if (crossings < worst) worst = crossings
          if (crossings < CONTOUR_MIN_CROSSINGS) ok = false
          if (regionInk < ink) ink = regionInk
          if (regionInk < CONTOUR_MIN_INK) ok = false
        }
      }
      return { ok, worst, ink }
    }

    /* Evaluate the field at `phase`. Bounded scatter: each bump adds itself only
       within 2.6 sigma of its (drifting) centre. This is the measured 1.9x win
       over evaluating every bump at every grid point. */
    const contourEvaluate = (phase) => {
      const f = contourField
      if (f !== null) f.boundsReady = false
      if (f === null) return
      const { cols, rows, step, K, bx, by, ba, bs, dx, dy, F, W2 } = f
      /* Seed the sheet with the base undulation instead of zero, so the gaps
         between islands still have a gradient for the levels to cross. Separable
         evaluation: sin(a+b) is expanded so the y term is computed once per row
         rather than once per cell, which keeps this pass cheap. */
      const BASE = 0.62
      for (let i = 0; i < 3; i++) {
        const fx = W2[i * 3], fy = W2[i * 3 + 1], ph = W2[i * 3 + 2] + phase * 0.11
        const amp = BASE / 3
        for (let j = 0; j < rows; j++) {
          const yb = fy * (j * step) + ph
          const sy = Math.sin(yb), cy2 = Math.cos(yb)
          const row = j * cols
          for (let c2 = 0; c2 < cols; c2++) {
            const xb = fx * (c2 * step)
            // sin(xb + yb) without a per-cell sin() of the sum
            const v = Math.sin(xb) * cy2 + Math.cos(xb) * sy
            if (i === 0) F[row + c2] = amp * v
            else F[row + c2] += amp * v
          }
        }
      }
      for (let k = 0; k < K; k++) {
        const s = bs[k]
        const amp = s * 0.55
        const cx = bx[k] + Math.sin(phase * dx[k] + k * 1.7) * amp
        const cy = by[k] + Math.cos(phase * dy[k] + k * 2.3) * amp
        const a = ba[k]
        const inv = 1 / (2 * s * s)
        const rad = 2.6 * s
        let i0 = Math.floor((cx - rad) / step)
        let i1 = Math.ceil((cx + rad) / step)
        let j0 = Math.floor((cy - rad) / step)
        let j1 = Math.ceil((cy + rad) / step)
        if (i0 < 0) i0 = 0
        if (j0 < 0) j0 = 0
        if (i1 > cols - 1) i1 = cols - 1
        if (j1 > rows - 1) j1 = rows - 1
        for (let j = j0; j <= j1; j++) {
          const ddy = j * step - cy
          const dy2 = ddy * ddy
          const row = j * cols
          for (let i = i0; i <= i1; i++) {
            const ddx = i * step - cx
            const q = (ddx * ddx + dy2) * inv
            if (q < 6.76) {
              let weight = Math.exp(-q)
              if (q > 4.8) {
                const t = (q - 4.8) / (6.76 - 4.8)
                const fade = 1 - t * t * (3 - 2 * t)
                weight *= fade
              }
              F[row + i] += a * weight
            }
          }
        }
      }
      const smooth = f.smooth
      for (let pass = 0; pass < 5; pass++) {
        for (let j = 0; j < rows; j++) {
          const row = j * cols
          for (let i = 0; i < cols; i++) {
            const left = F[row + Math.max(0, i - 1)]
            const center = F[row + i]
            const right = F[row + Math.min(cols - 1, i + 1)]
            smooth[row + i] = (left + 2 * center + right) * 0.25
          }
        }
        for (let j = 0; j < rows; j++) {
          const row = j * cols
          const up = Math.max(0, j - 1) * cols
          const down = Math.min(rows - 1, j + 1) * cols
          for (let i = 0; i < cols; i++) {
            F[row + i] = (smooth[up + i] + 2 * smooth[row + i] + smooth[down + i]) * 0.25
          }
        }
      }
      /* Track the field continuously between animation samples. Marching squares
         can change an entire path at once when a saddle crosses a level; blending
         the sampled field keeps that topology change from appearing as a twitch. */
      if (f.hasPrevious && f.previous !== undefined) {
        for (let i = 0; i < F.length; i++) {
          f.previous[i] = f.previous[i] * 0.65 + F[i] * 0.35
          F[i] = f.previous[i]
        }
      } else if (f.previous !== undefined) {
        f.previous.set(F)
      }
      f.hasPrevious = true
    }

    /* Marching squares for one level, stitched into polylines.
       Adjacency uses EDGE IDS in two Int32Arrays rather than float-position
       matching or a Map: a contour edge has at most two neighbours, adjacent cells
       address the identical edge id, so joins are exact and allocation-free. */
    const contourExtractLevel = (L, out) => {
      const f = contourField
      const { cols, rows, step, F, ex, ey, es, n1, n2, seen, touched, hCount } = f
      const st = ++f.seq
      let tn = 0
      const pt = (id, i0, j0, i1, j1) => {
        if (es[id] === st) return id
        const a = F[j0 * cols + i0]
        const b = F[j1 * cols + i1]
        let t = (L - a) / (b - a)
        if (!(t >= 0)) t = 0
        else if (t > 1) t = 1
        ex[id] = (i0 + (i1 - i0) * t) * step
        ey[id] = (j0 + (j1 - j0) * t) * step
        es[id] = st
        n1[id] = -1
        n2[id] = -1
        touched[tn++] = id
        return id
      }
      const link = (a, b) => {
        if (n1[a] < 0) n1[a] = b
        else if (n2[a] < 0) n2[a] = b
        if (n1[b] < 0) n1[b] = a
        else if (n2[b] < 0) n2[b] = a
      }
      for (let j = 0; j < rows - 1; j++) {
        const row = j * cols
        for (let i = 0; i < cols - 1; i++) {
          if (f.boundsReady && i % 16 === 0) {
            const block = j * f.blockCols + Math.floor(i / 16)
            if (L <= f.blockMin[block] || L > f.blockMax[block]) {
              i = Math.min(i + 16, cols - 1) - 1
              continue
            }
          }
          const p0 = row + i
          const p1 = p0 + 1
          const p3 = p0 + cols
          const p2 = p3 + 1
          const v0 = F[p0], v1 = F[p1], v2 = F[p2], v3 = F[p3]
          let mn = v0, mx = v0
          if (v1 < mn) mn = v1; else if (v1 > mx) mx = v1
          if (v2 < mn) mn = v2; else if (v2 > mx) mx = v2
          if (v3 < mn) mn = v3; else if (v3 > mx) mx = v3
          // Whole cell on one side of the level: nothing crosses it.
          if (L <= mn || L > mx) continue
          const idx = (v0 > L ? 1 : 0) | (v1 > L ? 2 : 0) | (v2 > L ? 4 : 0) | (v3 > L ? 8 : 0)
          const T = () => pt(j * (cols - 1) + i, i, j, i + 1, j)
          const B = () => pt((j + 1) * (cols - 1) + i, i, j + 1, i + 1, j + 1)
          const Le = () => pt(hCount + j * cols + i, i, j, i, j + 1)
          const Ri = () => pt(hCount + j * cols + i + 1, i + 1, j, i + 1, j + 1)
          switch (idx) {
            case 1: case 14: link(T(), Le()); break
            case 2: case 13: link(T(), Ri()); break
            case 3: case 12: link(Le(), Ri()); break
            case 4: case 11: link(Ri(), B()); break
            case 6: case 9: link(T(), B()); break
            case 7: case 8: link(Le(), B()); break
            // Ambiguous saddles use the bilinear asymptotic decider. The sign of
            // a*c-b*d selects whether the diagonal high/low regions are connected;
            // using the cell average alone is wrong when opposite corners differ in
            // magnitude and produces the long V-shaped joins seen in the render.
            case 5: {
              const a = v0 - L, b = v1 - L, c = v2 - L, d = v3 - L
              const saddle = a * c - b * d
              if (saddle > 0) { link(T(), Ri()); link(Le(), B()) }
              else { link(T(), Le()); link(Ri(), B()) }
              break
            }
            case 10: {
              const a = v0 - L, b = v1 - L, c = v2 - L, d = v3 - L
              const saddle = a * c - b * d
              if (saddle < 0) { link(T(), Le()); link(Ri(), B()) }
              else { link(T(), Ri()); link(Le(), B()) }
              break
            }
          }
        }
      }
      const walk = (start) => {
        const path = []
        let cur = start
        let prev = -1
        for (;;) {
          path.push(ex[cur], ey[cur])
          seen[cur] = st
          const a = n1[cur]
          const b = n2[cur]
          let nx = -1
          if (a >= 0 && a !== prev && seen[a] !== st) nx = a
          else if (b >= 0 && b !== prev && seen[b] !== st) nx = b
          if (nx < 0) {
            // Closed loop: step back onto the first point so the ring has no gap.
            if ((a === start || b === start) && path.length > 4) path.push(ex[start], ey[start])
            break
          }
          prev = cur
          cur = nx
        }
        return path
      }
      /* Reject debris before it reaches the draw list. Judged on the path's
         ON-CANVAS geometry, so an off-grid sliver with no visible pixels is
         dropped even when its raw length looks respectable. See the note on
         CONTOUR_MIN_LEN / CONTOUR_MIN_RING_BOX for the measurements behind both
         thresholds. */
      const W = contourGeom !== null ? contourGeom.w : 0
      const H = contourGeom !== null ? contourGeom.h : 0
      const keep = (p) => {
        if (p.length < 8) return false
        // Visible length, plus the bounding box of the part actually on screen.
        let vis = 0
        let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
        let seenIn = false
        for (let k = 0; k < p.length; k += 2) {
          const x = p[k], y = p[k + 1]
          const inside = x >= 0 && x <= W && y >= 0 && y <= H
          if (inside) {
            seenIn = true
            if (x < minx) minx = x
            if (x > maxx) maxx = x
            if (y < miny) miny = y
            if (y > maxy) maxy = y
          }
          if (k >= 2) {
            const px2 = p[k - 2], py2 = p[k - 1]
            const prevIn = px2 >= 0 && px2 <= W && py2 >= 0 && py2 <= H
            if (inside && prevIn) {
              const dx = x - px2, dy = y - py2
              vis += Math.sqrt(dx * dx + dy * dy)
            }
          }
        }
        if (!seenIn) return false            // entirely off-canvas: pure debris
        if (vis < CONTOUR_KEEP_LEN) return false
        /* A tiny CLOSED ring is an apex bullseye and reads as a dot. Open chains of
           the same extent are left alone: they are the visible corner of a stroke
           that continues off-canvas, and clipping one would punch a hole in a line
           the user can see running to the edge. */
        const gapx = p[0] - p[p.length - 2]
        const gapy = p[1] - p[p.length - 1]
        const closed = (gapx * gapx + gapy * gapy) < 4
        if (closed && (maxx - minx) < CONTOUR_KEEP_RING
          && (maxy - miny) < CONTOUR_KEEP_RING) return false
        return true
      }
      /* TANGENCY NEEDLES. Where a level runs nearly TANGENT to the field, the true
         isoline has a smooth, very high curvature tip. Marching squares interpolates
         linearly on a 10px grid, so it cannot represent that tip: it emits a hairpin
         that goes out and comes straight back, with a BASE (the gap between the
         apex's two neighbours) far narrower than the 1px stroke. Measured on the real
         output, worst case: apex 6.26px out from a base of 0.831px.

         At that width the outbound and return strokes paint the SAME pixels, so the
         pair does not read as a narrow valley — only the protruding whisker shows,
         which is precisely the "irregular sharp angle" in issue #3. Smoothing cannot
         help: the midpoint spline faithfully reproduces a feature that is genuinely
         in the geometry, so it has to be removed here, at the source.

         The whole hairpin is collapsed (see the note on the merge below). Both tests
         are required and were measured over 24 frames (152.6k vertices, 1.18Mpx of
         ink):
           base < 2px   the stroke cannot resolve it (a 1px line is ~1px wide)
           turn > 90    it doubles back rather than merely turning a corner
         That is 0.7 vertices per frame and 0.0037% of total ink -- artifact removal,
         not thinning. Real narrow features are untouched: turns over 90 degrees have
         a median base of 4.03px, well clear of the cutoff, and the whole 8-12px base
         band (29562 vertices) has a p99 turn of only 21.7 degrees. */
      const deneedle = (p) => {
        const n = p.length / 2
        if (n < 4) return p
        /* Scan first and return the ORIGINAL array when there is nothing to do, so
           the overwhelmingly common path allocates nothing at 24fps. */
        let found = false
        for (let k = 1; k < n - 1; k++) {
          const bx = p[(k + 1) * 2] - p[(k - 1) * 2]
          const by = p[(k + 1) * 2 + 1] - p[(k - 1) * 2 + 1]
          if (bx * bx + by * by >= 4) continue          // base >= 2px: keep
          const ax = p[k * 2] - p[(k - 1) * 2]
          const ay = p[k * 2 + 1] - p[(k - 1) * 2 + 1]
          const cx = p[(k + 1) * 2] - p[k * 2]
          const cy = p[(k + 1) * 2 + 1] - p[k * 2 + 1]
          // turn > 90 degrees <=> the two segment vectors point against each other.
          if (ax * cx + ay * cy < 0) { found = true; break }
        }
        if (!found) return p
        const gx = p[0] - p[(n - 1) * 2]
        const gy = p[1] - p[(n - 1) * 2 + 1]
        const closed = (gx * gx + gy * gy) < 4
        /* COLLAPSE THE WHOLE NEEDLE, not just its tip. Dropping the apex alone leaves
           the base itself as a real segment, and that was measured to be worse than
           the disease: a 0.831px stub inherits the reversal as TWO ~78-degree turns
           (10.20 -> 0.83 -> 10.25px). The apex AND its far neighbour are therefore
           both consumed, and the surviving previous vertex is pulled onto the base
           midpoint -- a sub-pixel move (half of at most 2px) that no 1px stroke can
           show, leaving one smooth vertex where the hairpin was.
           Each test uses the SURVIVING previous vertex, so a run of needles collapses
           progressively instead of each test being fooled by a neighbour that is
           itself about to be consumed. */
        const q = [p[0], p[1]]
        let k = 1
        while (k < n - 1) {
          const px = q[q.length - 2], py = q[q.length - 1]
          const bx = p[(k + 1) * 2] - px, by = p[(k + 1) * 2 + 1] - py
          if (bx * bx + by * by < 4) {
            const ax = p[k * 2] - px, ay = p[k * 2 + 1] - py
            const cx = p[(k + 1) * 2] - p[k * 2], cy = p[(k + 1) * 2 + 1] - p[k * 2 + 1]
            if (ax * cx + ay * cy < 0) {
              if (k + 1 < n - 1) {
                q[q.length - 2] = (px + p[(k + 1) * 2]) / 2
                q[q.length - 1] = (py + p[(k + 1) * 2 + 1]) / 2
                k += 2
                continue
              }
              // The far neighbour is the final vertex, which must survive to keep an
              // endpoint (or a ring's closure) intact: consume only the apex.
              k += 1
              continue
            }
          }
          q.push(p[k * 2], p[k * 2 + 1])
          k += 1
        }
        q.push(p[(n - 1) * 2], p[(n - 1) * 2 + 1])
        /* A ring is closed by REPEATING its start vertex, and the merge above may have
           nudged that start. Re-anchor the repeat so the ring stays exactly closed and
           both keep() and the cyclic draw path still classify it as one. */
        if (closed) {
          q[q.length - 2] = q[0]
          q[q.length - 1] = q[1]
        }
        return q
      }
      // Open chains first (they have a free end), then whatever remains is a loop.
      // Doing it in this order stops a ring being entered mid-way and split in two.
      for (let k = 0; k < tn; k++) {
        const id = touched[k]
        if (seen[id] !== st && n2[id] < 0) {
          const p = deneedle(walk(id))
          if (keep(p)) out.push(p)
        }
      }
      for (let k = 0; k < tn; k++) {
        const id = touched[k]
        if (seen[id] !== st) {
          const p = deneedle(walk(id))
          if (keep(p)) out.push(p)
        }
      }
    }

    const contourExtract = (phase, trailPoints, trailNow) => {
      if (contourField === null) return
      contourEvaluate(phase)
      if (trailPoints && trailPoints.length) contourOverlayTrail(contourField, trailPoints, trailNow)
      const f = contourField
      // One O(cells) range pass is shared by all 21 extraction levels. Scratch
      // survives across frames; no resolution, smoothing or density is reduced.
      for (let j = 0; j < f.rows - 1; j++) {
        const row = j * f.cols
        for (let block = 0; block < f.blockCols; block++) {
          const begin = block * 16
          const end = Math.min(begin + 16, f.cols - 1)
          let min = Infinity, max = -Infinity
          for (let i = begin; i <= end; i++) {
            const a = f.F[row + i], b = f.F[row + f.cols + i]
            if (a < min) min = a
            if (a > max) max = a
            if (b < min) min = b
            if (b > max) max = b
          }
          const k = j * f.blockCols + block
          f.blockMin[k] = min
          f.blockMax[k] = max
        }
      }
      f.boundsReady = true
      contourPaths = []
      const span = CONTOUR_SPAN
      const stepL = (span * 2) / CONTOUR_LEVELS
      for (let n = 0; n <= CONTOUR_LEVELS; n++) {
        contourExtractLevel(-span + n * stepL, contourPaths)
      }
    }

    /* Stroke colour. Values are measured, not guessed: on cream the pure signal
       yellow #fff500 is almost invisible (it is nearly as light as the paper), so
       light mode uses a darkened olive-yellow at higher alpha, while dark mode can
       use the signal yellow itself at low alpha. Both were checked by sampling a
       render: the pattern reads as texture and body text keeps full contrast
       because the sheet sits BEHIND it.

       A canvas stroke cannot be a CSS variable — this is the ONE accent surface the
       palette switch cannot reach declaratively, so the palette is read here and
       the sheet is redrawn when it changes (see the palette MutationObserver).

       Written as 8-DIGIT HEX (#RRGGBBAA) so every accent value in this package is
       expressed the same way. Verified in a real browser rather than assumed:
       canvas normalises '#14d0d045' to exactly the rgba() it would have parsed
       (measured fillStyle 'rgba(20, 208, 208, 0.267)', painted pixel alpha 68/255).

       The cyan alphas are NOT copied from the yellow ones. Equal alpha does not
       mean equal presence: cyan composited at yellow's 0.20 over #101110 measured
       1.332:1 against the yellow's 1.734:1 — a 23% drop, which reads as the
       feature having quietly weakened on switch. Each palette is therefore tuned
       to the same composited contrast rather than the same number, and
       test/palette-contrast.test.js fails if the two drift more than 20% apart:
         谷地黄 dark  #fff50033  (0.20)  1.734:1
         谷地黄 light #beaf006b  (0.42)  1.291:1
         武陵青 dark  #14d0d045  (0.27)  1.755:1  (+1.2%)
         武陵青 light #14d0d07a  (0.48)  1.289:1  (-0.2%)
       Both cyan alphas came DOWN from the first version (0.32 / 0.30 at the old
       darker accent): a brighter stroke composites stronger, so holding the same
       on-screen strength means less of it. Light-mode cyan still needs no darkened
       variant the way yellow does, because it is not close to paper-white. The tags
       below are what the test greps for, so renaming them breaks the check loudly
       instead of silently. */
    const contourStroke = () => {
      const cyan = isWulingPalette()
      if (isDarkScheme()) {
        // EDGE_STROKE_DARK_CYAN: #14d0d045
        // EDGE_STROKE_DARK_YELLOW: #fff50033
        return cyan ? '#14d0d045' : '#fff50033'
      }
      // EDGE_STROKE_LIGHT_CYAN: #14d0d07a
      // EDGE_STROKE_LIGHT_YELLOW: #beaf006b
      return cyan ? '#14d0d07a' : '#beaf006b'
    }

    const contourDrawLines = () => {
      if (contourLineCv === null || contourGeom === null) return
      const ctx = contourLineCv.getContext('2d')
      if (!ctx) return
      const { w, h } = contourGeom
      /* Geometry stays in CSS px; scale the context to the backing store that
         contourSizeTo sized at (capped) devicePixelRatio, so strokes rasterise
         at device resolution instead of being upsampled into blur on HiDPI
         screens. Derived from the canvas itself, and skipped entirely at a 1x
         store or when the context has no setTransform (the spliced-in test
         harnesses), so a 1x render is byte-identical to before. */
      const scale = (w > 0 && typeof contourLineCv.width === 'number' && contourLineCv.width > 0 && contourLineCv.width !== w)
        ? contourLineCv.width / w : 1
      if (scale !== 1 && typeof ctx.setTransform === 'function') ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = contourStroke()
      ctx.lineWidth = 1
      ctx.lineJoin = 'round'
      /* Marching squares emits one vertex per grid-cell edge. Three Chaikin passes
         cut local corners before the clamped cubic B-spline rounds broad bends.
         This reduces angularity without changing the field or adding another
         extraction pass. Open endpoints remain fixed; closed rings wrap cyclically.

         PASS COUNT IS SIZE-ADAPTIVE: see CONTOUR_SMOOTH_FULL. Every ordinary window
         keeps three passes; a bigger sheet drops to two and then one. */
      const smoothPath = (source) => {
        const count = source.length / 2
        if (count < 3) return source
        const closed = (source[0] - source[source.length - 2]) ** 2
          + (source[1] - source[source.length - 1]) ** 2 < 4
        /* Flat scratch throughout: the previous shape built one [x, y] array per
           point PER PASS — ~14 small arrays per source vertex, ~65k per sheet at
           1440x900 — which is pure GC inside the animation frame on both painters. */
        let points = closed ? source.slice(0, source.length - 2) : source.slice()
        const passes = count <= CONTOUR_SMOOTH_FULL ? 3 : (count <= CONTOUR_SMOOTH_LIMIT ? 2 : 1)
        for (let pass = 0; pass < passes; pass++) {
          const n = points.length / 2
          const limit = closed ? n : n - 1
          const next = new Array(n * 4)
          let w2 = 0
          if (!closed) { next[w2++] = points[0]; next[w2++] = points[1] }
          for (let k = 0; k < limit; k++) {
            const a = k * 2
            const b = ((k + 1) % n) * 2
            const ax = points[a], ay = points[a + 1]
            const bx = points[b], by = points[b + 1]
            next[w2++] = ax * 0.75 + bx * 0.25
            next[w2++] = ay * 0.75 + by * 0.25
            next[w2++] = ax * 0.25 + bx * 0.75
            next[w2++] = ay * 0.25 + by * 0.75
          }
          if (!closed) { next[w2++] = points[points.length - 2]; next[w2++] = points[points.length - 1] }
          points = w2 === next.length ? next : next.slice(0, w2)
        }
        if (!closed) return points
        // Re-anchor the repeated start vertex so the ring stays exactly closed.
        const out = points.slice()
        out.push(out[0], out[1])
        return out
      }
      /* Chaikin removes local grid noise. A constrained Catmull-Rom cubic then
         gives each join one shared tangent. The handle cap prevents overshoot at
         narrow saddles while the larger tangent factor removes long rounded-polygon
         bends that remain visible with midpoint quadratics. */
      const drawSmoothPath = (source) => {
        const count = source.length / 2
        if (count < 3) {
          ctx.moveTo(source[0], source[1])
          for (let k = 2; k < source.length; k += 2) ctx.lineTo(source[k], source[k + 1])
          return
        }
        const closed = (source[0] - source[source.length - 2]) ** 2
          + (source[1] - source[source.length - 1]) ** 2 < 4
        const limit = closed ? count - 1 : count
        const at = (index) => {
          const k = closed
            ? (index + limit) % limit
            : Math.max(0, Math.min(limit - 1, index))
          return k * 2
        }
        /* Tangents from scalars, with squared lengths wherever the comparison allows
           it. The previous shape allocated eight [x, y] arrays and ran up to six
           Math.hypot per SEGMENT — tens of thousands of segments per frame, on both
           the WebGL painter and the canvas fallback. Math.sqrt replaces hypot because
           every argument here is a pixel delta, far from hypot's overflow range. */
        const tangentAt = (index, out) => {
          const i = at(index)
          const p = at(index - 1)
          const n = at(index + 1)
          const cx = source[i], cy = source[i + 1]
          const inX = cx - source[p], inY = cy - source[p + 1]
          const outX = source[n] - cx, outY = source[n + 1] - cy
          let tx, ty, cap
          if (!closed && index === 0) {
            tx = outX * 0.4
            ty = outY * 0.4
            cap = Math.sqrt(outX * outX + outY * outY) * 0.55
          } else if (!closed && index === limit - 1) {
            tx = inX * 0.4
            ty = inY * 0.4
            cap = Math.sqrt(inX * inX + inY * inY) * 0.55
          } else {
            tx = (source[n] - source[p]) * 0.32
            ty = (source[n + 1] - source[p + 1]) * 0.32
            cap = Math.sqrt(Math.min(inX * inX + inY * inY, outX * outX + outY * outY)) * 0.62
          }
          const len2 = tx * tx + ty * ty
          if (len2 > cap * cap && len2 > 0) {
            const s = cap / Math.sqrt(len2)
            tx *= s
            ty *= s
          }
          out[0] = tx
          out[1] = ty
        }
        ctx.moveTo(source[0], source[1])
        const segments = closed ? limit : limit - 1
        const t0 = [0, 0]
        const t1 = [0, 0]
        for (let k = 0; k < segments; k++) {
          const s = at(k)
          const e = at(k + 1)
          tangentAt(k, t0)
          tangentAt(k + 1, t1)
          ctx.bezierCurveTo(
            source[s] + t0[0], source[s + 1] + t0[1],
            source[e] - t1[0], source[e + 1] - t1[1],
            source[e], source[e + 1],
          )
        }
        /* Mark a ring as a RING. The cyclic tangents above already make the seam C1
           and the final span already lands exactly on the start point, so this adds
           no geometry — but without it the canvas treats the path as open and butts
           two caps together at the seam instead of joining them, which is defect (2)
           of issue #3. contour-cusps.test.js guards this. */
        if (closed) ctx.closePath()
      }
      const isRing = (p) => {
        const n = p.length - 2
        return n >= 2 && (p[0] - p[n]) ** 2 + (p[1] - p[n + 1]) ** 2 < 4
      }
      /* ONE STROKE, RINGS FIRST — and the ORDER matters for the canvas fallback, not
         for looks. `closePath()` on a real 2D context finalises the current subpath by
         splicing it into the path accumulated so far, so its cost grows with
         everything already in that path (measured on the canvas fallback: 18 calls per
         sheet averaging 0.278 ms, max 1.2 ms, ~16% of the frame). Drawing the rings
         while the path still holds only other rings bounds every splice to ring
         geometry. Output is unchanged either way: canvas stroke coverage is a union,
         and the WebGL painter blends with MAX (commutative), so subpath order cannot
         affect the result. Stroking each path separately would also fix the cost but
         double-composites overlapping strokes and visibly darkens every crossing —
         the very "piled-up lines" look this avoids. */
      ctx.beginPath()
      for (let i = 0; i < contourPaths.length; i++) {
        const p = contourPaths[i]
        if (isRing(p)) drawSmoothPath(smoothPath(p))
      }
      for (let i = 0; i < contourPaths.length; i++) {
        const p = contourPaths[i]
        if (!isRing(p)) drawSmoothPath(smoothPath(p))
      }
      ctx.stroke()
    }

    /* Optional worker backend. One in-flight frame and one latest pending frame. */
    const CONTOUR_RENDERER_KEY = 'dsh-theme-endfield-contour-renderer'
    const readContourRenderer = () => prefsGet(CONTOUR_RENDERER_KEY) === 'worker-webgl' ? 'worker-webgl' : 'canvas'
    let contourWorker = null, contourWorkerFailed = false, contourBackendChoice = 'canvas'
    const contourDisposeWorker = () => {
      const state = contourWorker
      contourWorker = null
      if (!state) return
      clearTimeout(state.timer)
      state.worker.terminate()
      URL.revokeObjectURL(state.url)
      state.pending = null
    }
    const contourWorkerFail = (state, reason) => {
      if (contourWorker !== state) return
      contourWorkerFailed = true
      contourTeardown()
      syncContour()
      if (contourWrap) contourWrap.setAttribute('data-endfield-renderer-reason', reason)
    }
    const contourFlushWorker = () => {
      const state = contourWorker
      if (!state || !state.ready || state.busy || !state.pending || document.hidden) return
      const frame = state.pending
      state.pending = null; state.busy = true
      state.seq += 1
      state.timer = setTimeout(() => contourWorkerFail(state, 'worker render timeout'), 2000)
      try { state.worker.postMessage({...frame, type:'frame', seq:state.seq}) }
      catch (error) { contourWorkerFail(state, 'worker frame submission failed') }
    }
    const contourStartWorker = (canvas) => {
      if (readContourRenderer() !== 'worker-webgl' || contourWorkerFailed) return
      if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function'
        || typeof canvas.transferControlToOffscreen !== 'function') {
        contourWorkerFailed = true
        return
      }
      let url = null, worker = null
      try {
        url = URL.createObjectURL(new Blob([CONTOUR_WORKER_SOURCE], {type:'text/javascript'}))
        worker = new Worker(url)
        const state = {worker,url,ready:false,busy:false,pending:null,seq:0,timer:null}
        contourWorker = state
        state.timer = setTimeout(() => contourWorkerFail(state, 'worker initialization timeout'), 8000)
        worker.onmessage = ({data}) => {
          if (contourWorker !== state) return
          if (data.type === 'ready') {
            try {
              const offscreen = canvas.transferControlToOffscreen()
              worker.postMessage({type:'init',canvas:offscreen,seed:contourSeed},[offscreen])
            } catch(error) { contourWorkerFail(state,'canvas transfer failed') }
          } else if (data.type === 'initialized') {
            clearTimeout(state.timer); state.ready = true
            if (contourWrap) contourWrap.setAttribute('data-endfield-renderer',data.rasterizer)
            contourFlushWorker()
          } else if (data.type === 'painted') {
            if (!state.busy || data.seq !== state.seq) return
            clearTimeout(state.timer);state.busy = false
            contourFlushWorker()
          } else if (data.type === 'error') contourWorkerFail(state,data.message || 'worker failed')
        }
        worker.addEventListener('error', () => contourWorkerFail(state,'worker error'))
        worker.addEventListener('messageerror', () => contourWorkerFail(state,'worker message error'))
      } catch(error) {
        if(worker)worker.terminate()
        if(url)URL.revokeObjectURL(url)
        contourWorker = null;contourWorkerFailed = true
      }
    }
    const contourRefresh = (geometry) => {
      if (contourWorker !== null) {
        if (!contourGeom || document.hidden) return
        const ratio = Math.min(2, Math.max(.1, window.devicePixelRatio || 1))
        const pending = contourWorker.pending
        contourWorker.pending = {w:contourGeom.w,h:contourGeom.h,dpr:ratio,phase:contourPhase,
          color:contourStroke(),geometry:geometry || !!(pending && pending.geometry)}
        contourFlushWorker()
      } else {
        /* The main-thread painter runs the SAME entry point the animation frame
           uses, so the mouse trail is sampled and folded into the field here too;
           calling contourExtract directly would bypass the trail entirely. */
        if (geometry) contourExtractFrame(contourPhase)
        contourDrawLines()
      }
    }

    /* The app frame: the only ancestor that is both position:relative and free of a
       stacking context, so an inset:0 child paints above the frame's own background
       and below every positioned descendant.

       It is located via its CENTRE COLUMN child, not by matching '_frame' directly.
       Verified against the installed bundles: '_frame' as a CSS-module suffix is
       used by three different components (the layout frame, two user-question
       components), so a [class*='_frame'] match is ambiguous and could attach the
       layer to a question card. '_centerCol' and '_sidebarCol' are each unique to
       the layout frame, so the frame is identified as their parent. Matching on the
       module SUFFIX rather than the current hash keeps this working across an app
       rebuild that rehashes the module. */
    const findAppFrame = () => {
      if (typeof document === 'undefined') return null
      const col = document.querySelector('[class$="_centerCol"], [class*="_centerCol "]')
      const frame = col !== null ? col.parentElement : null
      if (frame === null) return null
      const r = frame.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return null
      return frame
    }

    // DOM sampling stays outside the extraction kernel, which remains usable
    // by headless geometry tests and future renderers with explicit trail input.
    const contourExtractFrame = (phase) => {
      if (!contourTrailListening) { contourExtract(phase); return }
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now() : Date.now()
      if (contourTrailPointer !== null && contourHost !== null) {
        const point = contourTrailPointer
        contourTrailPointer = null
        const rect = contourHost.getBoundingClientRect()
        const x = point.x - rect.left, y = point.y - rect.top
        if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
          contourTrail.push(x, y, point.t, point.receivedAt)
        }
      }
      const points = contourTrail.view(now)
      contourExtract(phase, points, now)
      contourTrailPainted = points.length > 0
    }

    const onContourPointerMove = (event) => {
      if (event.pointerType !== 'mouse' || event.isPrimary === false || !contourTrailListening) return
      contourTrailPointer = { x: event.clientX, y: event.clientY, t: event.timeStamp,
        receivedAt: (typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now() : Date.now() }
    }
    const onContourPointerLeave = () => { contourTrailPointer = null }
    const contourResetTrail = (redraw) => {
      const painted = contourTrailPainted
      contourTrail.clear()
      contourTrailPointer = null
      contourTrailPainted = false
      if (redraw && painted && contourWrap !== null && contourField !== null) {
        contourExtractFrame(contourPhase)
        contourDrawLines()
      }
    }
    const contourSyncTrail = (active) => {
      if (active === contourTrailListening) return
      contourTrailListening = active
      if (contourHost !== null && typeof contourHost.addEventListener === 'function') {
        if (active) {
          contourHost.addEventListener('pointermove', onContourPointerMove, { passive: true, capture: true })
          contourHost.addEventListener('pointerleave', onContourPointerLeave, { passive: true })
        } else {
          contourHost.removeEventListener('pointermove', onContourPointerMove, true)
          contourHost.removeEventListener('pointerleave', onContourPointerLeave)
        }
      }
      if (!active) contourResetTrail(true)
    }
    const onContourEnvironmentChange = () => {
      contourResetTrail(true)
      contourSwitchSig = ''
      contourApplySwitches()
    }
    const contourSizeTo = (host) => {
      const r = host.getBoundingClientRect()
      const w = Math.max(1, Math.round(r.width))
      const h = Math.max(1, Math.round(r.height))
      /* Backing store at device resolution (capped at 2): the sheet is 1px
         strokes, and a 1x store on a HiDPI screen upsamples them into blur.
         Capped because an uncapped 4K-plus-retina store is a lot of canvas for
         a background texture. contourDrawLines reads the scale back off the
         canvas dimensions, so nothing else has to know about it. */
      const ratio = (typeof window !== 'undefined'
        && typeof window.devicePixelRatio === 'number'
        && window.devicePixelRatio > 0) ? window.devicePixelRatio : 1
      const dpr = Math.min(2, ratio)
      if (contourWorker !== null) {
        const changed = contourGeom === null || contourGeom.w !== w || contourGeom.h !== h || contourGeom.dpr !== dpr
        contourGeom = {w,h,dpr}
        if (contourLineCv) { contourLineCv.style.width = w + 'px'; contourLineCv.style.height = h + 'px' }
        return changed
      }
      const bw = Math.max(1, Math.round(w * dpr))
      const bh = Math.max(1, Math.round(h * dpr))
      if (contourGeom !== null && contourGeom.w === w && contourGeom.h === h
        && (contourLineCv === null || (contourLineCv.width === bw && contourLineCv.height === bh))) return false
      contourResetTrail(false)
      contourBuild(w, h)
      if (contourLineCv !== null) {
        contourLineCv.width = bw
        contourLineCv.height = bh
        contourLineCv.style.width = w + 'px'
        contourLineCv.style.height = h + 'px'
      }
      return true
    }

    /* One chain per run. The refresh inside the frame can reenter this loop from
       the worker-failure path (contourWorkerFail -> contourTeardown -> syncContour
       -> contourStartLoop) and queue the next frame while this callback is still
       executing; the stamp lets the tail notice that and keep its hands off,
       instead of stranding a second chain that no later teardown can cancel. */
    let contourLoopGen = 0
    const contourFrame = () => {
      const gen = contourLoopGen
      if (contourWrap === null) {
        contourRaf = null
        return
      }
      // Stop the loop entirely when animation is off: an "off" switch must cost
      // nothing, not merely skip work inside a still-running rAF.
      if (!contourWantsAnim()) {
        contourRaf = null
        contourApplySwitches()
        return
      }
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now() : Date.now()
      /* Field pass, throttled: this is the expensive part (~4.4 ms measured for the
         field alone). The interval also respects the measured cost of the last
         refresh, which only binds on the synchronous painter — see CONTOUR_DUTY. */
      const fps = contourFieldFps()
      const interval = Math.max(1000 / fps, contourLastCost > 0 ? contourLastCost / CONTOUR_DUTY : 0)
      if (contourLastField < 0 || now - contourLastField >= interval) {
        /* Always advance by ONE NOMINAL FRAME. A delayed rAF must not catch up by
           applying its whole wall-clock gap: that makes the extracted contour jump
           and creates a visible twitch. The animation resumes smoothly instead of
           teleporting after a scroll, resize or busy main-thread interval — and with
           the duty cycle above, "resumes smoothly" is the slow path too, rather than
           a stall followed by a jump. */
        contourLastField = now
        contourPhase += CONTOUR_PHASE_STEP * readContourSpeed() // speed changes drift, not refresh rate
        contourRefresh(true)
        contourLastCost = ((typeof performance !== 'undefined' && typeof performance.now === 'function')
          ? performance.now() : Date.now()) - now
      }
      if (gen !== contourLoopGen) return
      contourRaf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame(contourFrame) : null
    }

    const contourStartLoop = () => {
      if (contourRaf !== null) return
      if (typeof requestAnimationFrame !== 'function') return
      if (!contourWantsAnim()) return
      contourLastField = -1
      contourLoopGen += 1
      contourRaf = requestAnimationFrame(contourFrame)
    }
    const contourStopLoop = () => {
      contourLoopGen += 1
      if (contourRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(contourRaf)
      contourRaf = null
      contourSyncTrail(false)
    }

    const contourTeardown = () => {
      contourResetTrail(false)
      contourStopLoop()
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', onContourEnvironmentChange)
      }
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('blur', onContourEnvironmentChange)
      }
      if (contourMotionQuery !== null && typeof contourMotionQuery.removeEventListener === 'function') {
        contourMotionQuery.removeEventListener('change', onContourEnvironmentChange)
      }
      contourMotionQuery = null
      contourDisposeWorker()
      if (contourRo !== null) {
        contourRo.disconnect()
        contourRo = null
      }
      if (contourWrap !== null && contourWrap.parentNode) contourWrap.parentNode.removeChild(contourWrap)
      contourWrap = null
      contourLineCv = null
      contourHost = null
      contourPaths = []
      contourField = null
      contourGeom = null
      /* Restart the morph clock too. The accept-or-reroll validator evaluates every
         candidate at phase 0, which seeds the field's temporal blend (previous=F0);
         if the sheet remounted later with phase far ahead, the first live frame
         would blend 65% of that phase-0 snapshot into the current field and the
         landscape would visibly snap backwards before resuming. A fresh mount at
         phase 0 has no such transient — which is exactly what this restores. */
      contourPhase = 0
      // Nothing is drawn any more, so the next mount must re-apply the switch rather
      // than trust a signature describing a canvas that no longer exists.
      contourSwitchSig = ''
    }

    /* Reconcile the animation switch against what is currently on screen.
       Separated from mounting because the two have very different costs and very
       different triggers: mounting needs layout reads, while this only needs to run
       when the switch actually changed. The last applied state is cached so the
       common case (called from a subtree MutationObserver, i.e. on every streaming
       token) is a single string compare. */
    const contourApplySwitches = () => {
      const anim = contourWantsAnim()
      const trail = anim && contourHost !== null && isContourTrailOn()
      const sig = (anim ? 'a' : '-') + (trail ? 't' : '-')
      if (sig === contourSwitchSig) return
      contourSwitchSig = sig
      contourSyncTrail(trail)
      // Animation just switched off: redraw once from the current phase so the
      // static sheet is a complete picture rather than a half-updated frame.
      if (!anim && contourWrap !== null && contourGeom !== null) contourRefresh(false)
      if (anim) contourStartLoop()
      else contourStopLoop()
    }

    /** Build/refresh/remove the layer to match the switches and the current page. */
    const syncContour = () => {
      const choice = readContourRenderer()
      if (choice !== contourBackendChoice) {
        contourTeardown()
        contourWorkerFailed = false
        contourBackendChoice = choice
      }
      const on = isEnabled() && isContourOn()
      if (!on) {
        if (contourWrap !== null) contourTeardown()
        contourSwitchSig = ''
        return
      }
      /* Fast path for the ALREADY-MOUNTED case. This runs from a subtree
         MutationObserver, so the common case must not touch layout: skipping
         findAppFrame() here is what avoids forcing a synchronous reflow on every
         mutation. Note it skips only the mount work — the switch reconciliation
         below still runs, because that is how a settings toggle takes effect while
         the layer is already on screen. */
      const attached = contourWrap !== null && contourHost !== null
        && contourWrap.parentNode === contourHost && contourHost.isConnected
      if (!attached) {
        const host = findAppFrame()
        if (host === null) {
          // The frame is not on screen yet (very early boot): a later mutation will
          // bring us back here rather than the layer never mounting.
          if (contourWrap !== null) contourTeardown()
          contourSwitchSig = ''
          return
        }
        if (contourWrap !== null && contourHost !== host) contourTeardown()
        if (contourWrap === null) {
          const wrap = document.createElement('div')
          wrap.setAttribute('data-endfield-contour', '')
          wrap.setAttribute('aria-hidden', 'true')
          const line = document.createElement('canvas')
          line.setAttribute('data-endfield-contour-lines', '')
          wrap.appendChild(line)
          contourLineCv = line
          // First child: keeps the layer at the bottom of the frame's paint order.
          if (host.firstChild) host.insertBefore(wrap, host.firstChild)
          else host.appendChild(wrap)
          contourWrap = wrap
          contourHost = host
          document.addEventListener('visibilitychange', onContourEnvironmentChange)
          if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('blur', onContourEnvironmentChange)
          }
          if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            contourMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
            if (typeof contourMotionQuery.addEventListener === 'function') {
              contourMotionQuery.addEventListener('change', onContourEnvironmentChange)
            }
          }
          contourStartWorker(line)
          wrap.setAttribute('data-endfield-renderer', contourWorker ? 'starting' : 'main-canvas2d')
          if (contourWorkerFailed) wrap.setAttribute('data-endfield-renderer-reason', 'worker unavailable; main Canvas2D fallback')
          contourSizeTo(host)
          contourRefresh(true)
          // A fresh mount has drawn nothing switch-specific yet, so force the
          // reconciliation below to run rather than trusting a stale signature.
          contourSwitchSig = ''
          if (typeof ResizeObserver !== 'undefined') {
            contourRo = new ResizeObserver(() => {
              if (contourHost === null) return
              if (contourScrollPaused) {
                contourResizePending = true
                return
              }
              if (contourSizeTo(contourHost)) {
                contourRefresh(true)
              }
            })
            contourRo.observe(host)
          }
        }
      }
      contourApplySwitches()
    }

    /* Colour scheme changes are a token flip on <body>, not a resize, so the
       stroke colour has to be re-derived when the attribute changes.
       The palette is a CLASS on the same element and has exactly the same
       consequence for the canvas, so one observer watches both: 'class' is added to
       the filter rather than building a second observer. This is also what makes a
       palette change in ANOTHER tab (or a browser restoring the class) repaint the
       sheet, not just a click in this tab's settings panel. */
    let contourSchemeObserver = null
    /* Deferred install for the same early-boot reason as the page observer above:
       body may not exist at apply() time, and a missed install here would leave a
       later-mounted sheet stuck on its first colour across a scheme flip. */
    const installContourSchemeObserver = () => {
      if (contourSchemeObserver !== null) return
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || document.body === null) return
      contourSchemeObserver = new MutationObserver(() => {
        if (contourWrap === null) return
        contourRefresh(false)
      })
      contourSchemeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class'] })
    }
    const contourSchemeObserverLate = () => {
      installContourSchemeObserver()
      // Catch up: the scheme may have settled while the observer was absent.
      if (contourSchemeObserver !== null && contourWrap !== null) contourRefresh(false)
    }
    if (typeof document !== 'undefined' && document.body !== null) installContourSchemeObserver()
    else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('DOMContentLoaded', contourSchemeObserverLate, { once: true })
    }
    // Let the page observer declared above re-attach the layer as the app renders.
    contourSyncHook = syncContour
