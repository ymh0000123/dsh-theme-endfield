
    /* ---------- Settings page: 主题 (own settings.section) ---------- */
    const slots = ctx.get('slots')
    const disposeRows = []
    let disposeSettings = () => { disposeRows.forEach((d) => d()) }
    if (slots !== undefined) {
      slots.inject('settings.section', () => {
        const d = slots.register(
        /* `label` is a THUNK, not a string: the slot contract re-evaluates it per
           read, so the nav row follows a language switch with no re-registration.

           `locale` is declared ONLY when a locale service actually exists. It is not
           what drives the re-render — ui-renderer's useLocaleRevision subscribes
           EVERY outlet to the locale revision, so this panel re-renders on a language
           switch either way, and the body reads `t` from the apply closure rather than
           from the injected seat. What declaring it buys is the framework's own
           re-derivation of that seat; what it COSTS when the service is missing is a
           hard failure — ui-renderer throws SlotAssemblyError ("entry declares locale
           namespace ... but no locale face is installed") for an entry declaring a
           namespace with no installed face. Declaring it unconditionally would turn a
           composition without the locale plugin from "settings page in Chinese" into
           "settings page crashes", so the key is spread in only when present. */
        Object.assign(
          { name: 'settings.section', id: 'theme-endfield', order: 35, label: () => t('nav') },
          localeReady ? { locale: ENDFIELD_NS } : {}
        ),
        () => {
          const R = (typeof React !== 'undefined') ? React : ((typeof require === 'function') ? require('react') : null)
          if (!R) return null
          const [enabled, setEnabled] = R.useState(isEnabled())
          const [wmOn, setWmOn] = R.useState(isWatermarkOn())
          const [wmPersist, setWmPersist] = R.useState(isWatermarkPersistOn())
          const [loaderOn, setLoaderOn] = R.useState(isLoaderOn())
          const [contourOn, setContourOn] = R.useState(isContourOn())
          const [contourAnim, setContourAnim] = R.useState(isContourAnimOn())
          const [contourTrailOn, setContourTrailOn] = R.useState(isContourTrailOn())
          const [contourRenderer, setContourRenderer] = R.useState(readContourRenderer())
          const [contourFps, setContourFps] = R.useState(readContourFps())
          const [contourSpeed, setContourSpeed] = R.useState(readContourSpeed())
          const [contourScrollPause, setContourScrollPause] = R.useState(isContourScrollPauseOn())
          const [thunderOn, setThunderOn] = R.useState(isThunderOn())
          const [thunderAnim, setThunderAnim] = R.useState(isThunderAnimOn())
          const [balanceOn, setBalanceOn] = R.useState(isBalanceCapsuleOn())
          const [creditDisplay, setCreditDisplay] = R.useState(readCreditDisplay())
          const [palette, setPalette] = R.useState(readPalette())
          const [glass, setGlass] = R.useState(readGlass())
          const [mode, setMode] = R.useState(prefsGet(RADIUS_KEY) || 'square')
          /* 音频通知 is a HOST feature: the browser only owns its switches and
             the preview buttons. `hostState` mirrors what the host half reports
             over /theme-endfield/audio/state (which file each slot actually
             resolved to), so the panel can show the truth instead of assuming
             the bundled tone is in use. */
          const [audioOn, setAudioOn] = R.useState(isAudioOn())
          const [audioBoot, setAudioBoot] = R.useState(isAudioBootOn())
          const [audioStart, setAudioStart] = R.useState(isAudioStartOn())
          const [audioDone, setAudioDone] = R.useState(isAudioDoneOn())
          const [audioVolume, setAudioVolume] = R.useState(readAudioVolume())
          const [audioHumanOnly, setAudioHumanOnly] = R.useState(isAudioHumanOnly())
          const [audioDiag, setAudioDiag] = R.useState(isAudioDiagOn())
          const [hostState, setHostState] = R.useState(null)
          const [previewNote, setPreviewNote] = R.useState('')
          const refreshHostState = () => {
            if (typeof fetch !== 'function') return
            fetch(AUDIO_STATE_URL, { headers: { accept: 'application/json' } })
              .then((res) => (res.ok ? res.json() : null))
              .then((json) => { if (json) setHostState(json) })
              .catch(() => { /* host bridge absent: the rows simply show no source */ })
          }
          /* Re-sync the panel onto the settings section when it finally arrives.
             Every useState above seeded itself from prefsGet() during the FIRST
             render — which, on a real page load, happens while the Host is still
             sending the section, so each read fell back to the schema default.
             Without this effect the switches stayed frozen at those defaults for
             the whole session (the theme's own surfaces recovered, because
             reconcileFromPrefs re-derives them, but the panel's React state had
             no such path): the user sees their settings "reset after refresh"
             even though the values were on disk and the theme was applying them.

             Subscribing to the store rather than using the one-shot
             onPrefsSettled hook is deliberate — that slot is already claimed by
             the boot loader, and a subscription additionally keeps the panel
             honest when the Host or another surface changes a value mid-session.
             prefsEmit runs on every transport snapshot and on every local edit, so
             this simply re-derives the same reads the initializers used; React
             bails out of the re-render when a value is unchanged.

             `useEffect` is feature-detected the way the rest of this panel
             feature-detects React: it must render on a host (or test double)
             whose React face does not expose the hook rather than throwing
             during render. Losing the effect only costs the live re-sync, which
             is no worse than the behaviour before this fix. */
          if (typeof R.useEffect === 'function') {
            panelMounted = true
            /* Re-derive every switch from the store. Kept as one named function so
               the mount pass and every later subscription event run identical
               reads — a switch can never be re-synced from a different source
               than the one the initializers used. */
            const resyncPanelFromPrefs = () => {
              setEnabled(isEnabled())
              setWmOn(isWatermarkOn())
              setWmPersist(isWatermarkPersistOn())
              setLoaderOn(isLoaderOn())
              setContourOn(isContourOn())
              setContourAnim(isContourAnimOn())
              setContourTrailOn(isContourTrailOn())
              setContourRenderer(readContourRenderer())
              setContourFps(readContourFps())
              setContourSpeed(readContourSpeed())
              setContourScrollPause(isContourScrollPauseOn())
              setThunderOn(isThunderOn())
              setThunderAnim(isThunderAnimOn())
              setBalanceOn(isBalanceCapsuleOn())
              setCreditDisplay(readCreditDisplay())
              setPalette(readPalette())
              setGlass(readGlass())
              setMode(prefsGet(RADIUS_KEY) || 'square')
              /* The 音频 rows seed themselves from the same store, so they are
                 re-derived here as well — the section can arrive after the
                 panel's first render, which would otherwise leave every audio
                 switch frozen at its schema default for the whole session. */
              setAudioOn(isAudioOn())
              setAudioBoot(isAudioBootOn())
              setAudioStart(isAudioStartOn())
              setAudioDone(isAudioDoneOn())
              setAudioVolume(readAudioVolume())
              setAudioHumanOnly(isAudioHumanOnly())
              setAudioDiag(isAudioDiagOn())
            }
            R.useEffect(() => {
              /* Subscribe FIRST, then re-derive once. A subscription alone is not
                 enough: the panel can finish mounting AFTER the section already
                 settled, in which case the ready transition that would have
                 notified it has already been emitted and no later event is
                 guaranteed (the mirror only re-reads on a Host document change or
                 a reconnect). Running the pass here makes the panel's state
                 converge whenever it mounts, with no dependence on
                 having been present for the transition. */
              const unsubscribe = prefsSubscribe(resyncPanelFromPrefs)
              resyncPanelFromPrefs()
              return unsubscribe
            }, [])
            // One read per panel mount: the host is the only authority on which
            // file each slot resolved to, and re-reading on every render would
            // hammer the route while the user drags the volume slider. Guarded
            // with the effect above, because the in-process settings tests drive
            // this panel with a minimal recording React that has no effect hook
            // at all — an unguarded call would turn "cannot refresh the source
            // read-out" into "the whole panel throws".
            R.useEffect(() => { refreshHostState() }, [])
          }
          const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--dsw-alias-border-l1)' }
          const labelStyle = { color: 'var(--dsw-alias-label-primary)', fontSize: '13px', fontWeight: 500, lineHeight: '1.5' }
          // Sub-label explaining what a switch does, so the row is self-describing.
          const hintStyle = { display: 'block', color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px', fontWeight: 400, lineHeight: '1.5', marginTop: '2px' }
          const btnStyleFor = (on, disabled) => {
            /* The switches are themed BY the theme they configure, so while the
               theme is ON the "on" fill reads from the palette variable rather
               than a literal — an inline #fff500 here would keep every enabled
               button yellow while the rest of the UI turned cyan.

               But --edge-accent / --edge-btn-muted live in the theme's own
               stylesheet, which unmount() removes when the theme is switched
               OFF. The hardcoded ink (#000) would then sit on a transparent
               button — invisible in dark mode, where the app panel is dark.
               So when the theme is OFF these buttons fall back to app-native
               tokens (filled chip for "on", outline for "off"), which are the
               same surfaces the rest of the settings page uses. */
            const themed = enabled
            return {
              color: !themed ? 'var(--dsw-alias-label-primary)' : (on ? '#000' : 'var(--dsw-alias-label-primary)'),
              background: !themed
                ? (on ? 'var(--dsw-alias-interactive-bg-hover-solid)' : 'transparent')
                : (on ? 'var(--edge-accent)' : 'var(--edge-btn-muted)'),
              border: '1px solid var(--dsw-alias-border-l2)',
              borderRadius: mode === 'round' ? '999px' : '0',
              padding: '4px 14px',
              fontSize: '12px',
              // A disabled control has to look disabled, not merely ignore clicks.
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.45 : 1,
              whiteSpace: 'nowrap',
            }
          }
          const setGlassValue = (value) => {
            if (!GLASS_OPTIONS.includes(value)) return
            prefsSet(GLASS_KEY, value)
            setGlass(value)
            syncGlass()
          }
          const setContourRendererValue = (value) => {
            if (value !== 'canvas' && value !== 'worker-webgl') return
            prefsSet(CONTOUR_RENDERER_KEY, value)
            setContourRenderer(value)
            syncContour()
          }
          /* ---------- toggles ----------
             EVERY handler below derives its `next` value from the STORE
             (prefsGet / the is* / read* readers), never from the React state
             variable of the same name. Those two can disagree, and when they do
             the toggle writes the WRONG value to the durable section:

               - the initial useState(readPalette()) runs while the Host section
                 is still 'loading', so it seeds the schema DEFAULT;
               - the mount effect re-derives it, but that pass and any later
                 subscription pass only run on a store event, so a panel that
                 mounted mid-transition can still be showing a default;
               - prefsGetValue overlays prefsLocalEdited on top of the fetched
                 section, so the store and the rendered switch are two different
                 reads by construction.

             Reading the store here makes the click a decision about the CURRENT
             durable value rather than about whatever the last render happened to
             capture, so a stale panel can no longer persist a default over a
             real choice. The state setter still runs, so the UI follows. */
          const toggleTheme = () => {
            const next = !isEnabled()
            prefsSet(ENABLED_KEY, next ? '1' : '0')
            setEnabled(next)
            if (next) { mount(); syncWatermarkVisibility(); syncContour() }
            else { unmount(); syncWatermarkVisibility() }
            /* The announcement watcher is gated on the master switch too, so it has
               to be reconciled here. unmount() already stops it, but turning the
               theme back ON must restart it — otherwise the feature would stay dead
               until the next page load. */
            syncThunder()
          }
          const toggleContour = () => {
            const next = !isContourOn()
            prefsSet(CONTOUR_KEY, next ? '1' : '0')
            setContourOn(next)
            syncContour()
          }
          /* Palette switch. Everything visual is carried by the class flip inside
             syncPaletteClass(); the only thing that needs explicit work is the
             contour canvas, because a canvas stroke cannot read a CSS variable.
             The redraw is called directly rather than left to the MutationObserver
             so the sheet changes in the same frame as the rest of the UI. */
          const togglePalette = () => {
            const next = readPalette() === 'wuling' ? 'valley' : 'wuling'
            prefsSet(PALETTE_KEY, next)
            setPalette(next)
            syncPaletteClass()
            if (contourWrap !== null) contourRefresh(false)
          }
          const toggleContourTrail = () => {
            const next = !isContourTrailOn()
            prefsSet(CONTOUR_TRAIL_KEY, next ? '1' : '0')
            setContourTrailOn(next)
            syncContour()
          }
          const toggleContourAnim = () => {
            const next = !isContourAnimOn()
            prefsSet(CONTOUR_ANIM_KEY, next ? '1' : '0')
            setContourAnim(next)
            if (!next) {
              contourScrollPaused = false
              if (contourScrollTimer !== null && typeof clearTimeout === 'function') clearTimeout(contourScrollTimer)
              contourScrollTimer = null
            }
            syncContour()
          }
          const setContourFpsValue = (value) => {
            const next = Number(value)
            if (!CONTOUR_FPS_OPTIONS.includes(next)) return
            prefsSet(CONTOUR_FPS_KEY, String(next))
            setContourFps(next)
          }
          const setContourSpeedValue = (value) => {
            const next = Number(value)
            if (!CONTOUR_SPEED_OPTIONS.includes(next)) return
            prefsSet(CONTOUR_SPEED_KEY, String(next))
            setContourSpeed(next)
          }
          const toggleContourScrollPause = () => {
            const next = !isContourScrollPauseOn()
            prefsSet(CONTOUR_SCROLL_PAUSE_KEY, next ? '1' : '0')
            setContourScrollPause(next)
            if (!next) {
              contourScrollPaused = false
              if (contourScrollTimer !== null && typeof clearTimeout === 'function') clearTimeout(contourScrollTimer)
              contourScrollTimer = null
              contourSwitchSig = ''
              contourApplySwitches()
            }
          }
          const toggleWm = () => {
            const next = !isWatermarkOn()
            prefsSet(WATERMARK_KEY, next ? '1' : '0')
            setWmOn(next)
            syncWatermarkVisibility()
          }
          const toggleWmPersist = () => {
            const next = !isWatermarkPersistOn()
            prefsSet(WATERMARK_PERSIST_KEY, next ? '1' : '0')
            setWmPersist(next)
            syncWatermarkVisibility()
          }
          const toggleLoader = () => {
            const next = !isLoaderOn()
            prefsSet(LOADER_KEY, next ? '1' : '0')
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
          const toggleThunder = () => {
            const next = !isThunderOn()
            prefsSet(THUNDER_KEY, next ? '1' : '0')
            setThunderOn(next)
            /* syncThunder() reads the pref store, so the write above is what it acts
               on. Turning it ON also shows the word once: a switch whose effect only
               appears at some unpredictable later moment gives the user no way to
               tell whether it worked. The preview runs BEFORE the watcher attaches,
               so it cannot be mistaken for a real edge. */
            if (next) showThunder(THUNDER_START)
            else destroyThunder()
            syncThunder()
          }
          const previewThunder = () => { showThunder(THUNDER_DONE) }
          const toggleBalanceCapsule = () => {
            const next = !isBalanceCapsuleOn()
            prefsSet(BALANCE_KEY, next ? '1' : '0')
            setBalanceOn(next)
            /* syncBalanceCapsule() reads the pref store, so the write above is what
               it acts on. Turning it ON mounts the capsule immediately: the first
               fetch fires inside showBalanceCapsule, so the numbers appear within
               one round-trip instead of after an arbitrary delay. */
            syncBalanceCapsule()
          }
          /* 已用 / 剩余 is a select, not a toggle: the two values are answers to
             "what does the right-hand percentage read", not polarities of one
             switch, and a two-state toggle button cannot show which side is
             live the way the row's 状态 label does. Mirrors setGlassValue:
             validate, persist, then mirror into React state. The capsule
             repaints on the NEXT fetch — creditsApply reads the pref store per
             answer, so no forced RPC is spent on a cosmetic re-read (the 5-min
             floor stays honest). */
          const CREDIT_DISPLAY_OPTIONS = ['remaining', 'used']
          const setCreditDisplayValue = (value) => {
            if (CREDIT_DISPLAY_OPTIONS.indexOf(value) === -1) return
            prefsSet(CREDIT_DISPLAY_KEY, value)
            setCreditDisplay(value)
          }
          /* 预览: the opening pose is a one-shot moment — a real load shows it once
             and there is no reload button on the settings page. Remounting the
             capsule is the whole preview: destroyBalanceCapsule() clears the timers
             and the node, and the forced show re-runs the brand pose followed by the
             same collapse into the balance row the real load performs. */
          const previewBalanceBoot = () => {
            if (!isEnabled() || !isBalanceCapsuleOn()) return
            destroyBalanceCapsule()
            showBalanceCapsule(true)
          }
          const toggleThunderAnim = () => {
            const next = !isThunderAnimOn()
            prefsSet(THUNDER_ANIM_KEY, next ? '1' : '0')
            setThunderAnim(next)
            /* Nothing to reconcile: the next showThunder() reads the switch and marks
               the plate accordingly. Replaying now is what makes the change legible —
               the difference between the two modes is only visible during the entry,
               so a silent toggle would look like it did nothing. */
            showThunder(THUNDER_START)
          }
          const toggleMode = () => {
            const next = (prefsGet(RADIUS_KEY) || 'square') === 'round' ? 'square' : 'round'
            prefsSet(RADIUS_KEY, next)
            setMode(next)
            if (next === 'round') document.body.classList.add('theme-endfield-round')
            else document.body.classList.remove('theme-endfield-round')
          }
          /* ---------- 音频通知 handlers ----------
             A switch writes its field and updates local state; the host half
             watches the same namespace, so the next event uses the new value
             without a reload. The preview buttons deliberately do NOT play
             anything in the browser: they ask the host, so what you hear while
             testing is exactly what a real notification will sound like. */
          const showPreviewNote = (result) => {
            if (result && result.played) setPreviewNote(t('audioTestOk'))
            else setPreviewNote(t('audioTestFail') + (result && result.why ? '：' + result.why : ''))
          }
          const playPreview = (slot) => { previewSlot(slot).then(showPreviewNote) }
          const audioTestButton = (slot, labelKey) => R.createElement('button', {
            key: 'audio-test-' + slot,
            type: 'button',
            onClick: () => playPreview(slot),
            style: btnStyleFor(false, !audioOn),
            // Previewing while the master switch is off is refused by the host
            // (volume 0 / disabled), so the button says why instead of failing
            // silently.
            disabled: !audioOn,
            title: audioOn ? '' : t('audioNeedOn'),
          }, t('audioTest') + ' · ' + t(labelKey))
          const toggleAudio = () => {
            const next = !audioOn
            prefsSet(AUDIO_ENABLED_KEY, next ? '1' : '0')
            setAudioOn(next)
            // The attention watcher is gated on this switch, so it has to be
            // reconciled here as well as on the pref echo.
            syncAudioAttentionWatch()
            if (next) playPreview('turn-done')
          }
          const toggleAudioStart = () => {
            const next = !audioStart
            prefsSet(AUDIO_TURN_START_KEY, next ? '1' : '0')
            setAudioStart(next)
            if (next) playPreview('turn-start')
          }
          const toggleAudioBoot = () => {
            const next = !audioBoot
            prefsSet(AUDIO_BOOT_KEY, next ? '1' : '0')
            setAudioBoot(next)
            // Preview the boot slot itself: the real one fires from the loader,
            // which is awkward to re-trigger from here.
            if (next) playPreview('boot')
          }
          const toggleAudioDone = () => {
            const next = !audioDone
            prefsSet(AUDIO_TURN_DONE_KEY, next ? '1' : '0')
            setAudioDone(next)
            if (next) playPreview('turn-done')
          }
          const setAudioVolumeValue = (next) => {
            const clamped = Math.min(100, Math.max(0, Math.round(next)))
            prefsSet(AUDIO_VOLUME_KEY, String(clamped))
            setAudioVolume(clamped)
          }
          const toggleAudioHumanOnly = () => {
            const next = !audioHumanOnly
            prefsSet(AUDIO_HUMAN_ONLY_KEY, next ? '1' : '0')
            setAudioHumanOnly(next)
          }
          const toggleAudioDiag = () => {
            const next = !audioDiag
            prefsSet(AUDIO_DIAG_KEY, next ? '1' : '0')
            setAudioDiag(next)
          }
          const applySoundDir = (value) => {
            const text = typeof value === 'string' ? value.trim() : ''
            prefsSet(AUDIO_SOUND_DIR_KEY, text)
            refreshHostState()
          }
          /** The host's view of one slot, or undefined while it has not answered. */
          const slotState = (slot) => {
            if (hostState === null || !Array.isArray(hostState.slots)) return undefined
            return hostState.slots.find((entry) => entry.id === slot)
          }
          // The two reserved rows have no switch, so their value read-out reports
          // whether the SOUND is previewable instead of pretending to be a toggle.
          const audioTestReady = () => (hostState === null ? true : slotState('attention') !== undefined)
          const sourceSummary = () => {
            const done = slotState('turn-done')
            if (done === undefined) return '—'
            if (done.file === null) return t('audioFileMissing')
            return done.bundled ? t('audioFileBundled') : t('audioFileOwn')
          }
          const sourceDetail = () => {
            const rows = []
            for (const slot of ['boot', 'turn-start', 'turn-done']) {
              const state = slotState(slot)
              const name = slot === 'boot' ? t('audioSlotBoot') : slot === 'turn-start' ? t('audioSlotStart') : t('audioSlotDone')
              rows.push(name + t('sep') + (state === undefined || state.file === null ? t('audioFileMissing') : state.file))
            }
            /* How many intervention requests this host half has actually seen.
               Without it, "no sound" cannot distinguish "the event never reached
               the plugin" from "the plugin chose to stay silent" — the two are
               indistinguishable from the page. Re-open this page (or press 刷新)
               after answering a question to watch the counter move. */
            if (hostState !== null && hostState.attention !== undefined) {
              rows.push(t('audioAttentionRow') + t('sep')
                + t('audioSlotUi') + ' ' + String(hostState.attention.ui)
                + ' / ' + t('audioSlotQuestion') + ' ' + String(hostState.attention.question)
                + ' / ' + t('audioSlotApproval') + ' ' + String(hostState.attention.approval))
            }
            if (hostState !== null && Array.isArray(hostState.log) && hostState.log.length > 0) {
              const last = hostState.log[hostState.log.length - 1]
              rows.push(t('audioDiagRow') + t('sep') + last.kind + (last.detail ? ' ' + last.detail : ''))
            }
            return rows.join('　·　')
          }
          const pageStyle = { maxWidth: '640px', padding: '4px 0 16px' }
          /* The ten switches are grouped into four concerns so the page can be
             scanned instead of read as a flat list: 主题 (master switch +
             appearance), 背景 (contour sheet + watermark), 动画 (boot loader),
             娱乐 (雷霆大字 announcements + their entry animation).
             Each group is an editorial numbered header; rows keep their stable
             React keys. The last row of each group drops its divider so the next
             group header's own rule is the only line between groups.

             The header shows the group name in the ACTIVE language plus a latin
             all-caps line. Under English both would collapse to the same word, so
             the second line is dropped there rather than printed twice — the latin
             line is editorial styling for the Chinese name, not a translation. */
          const groupTitle = (no, key, first) => {
            const name = t(key)
            const latin = LOCALE_EN[key]
            const parts = [
              R.createElement('span', { key: 'mark', 'aria-hidden': 'true', style: { width: '4px', height: '14px', flex: '0 0 auto', background: 'currentColor' } }),
              R.createElement('span', { key: 'cn', style: { fontSize: '12px', fontWeight: 600, letterSpacing: '0.14em', lineHeight: '1.5' } }, no + ' ' + name),
            ]
            if (latin !== undefined && latin !== name) {
              parts.push(R.createElement('span', { key: 'en', style: { fontSize: '10px', fontWeight: 500, letterSpacing: '0.2em', opacity: 0.72, lineHeight: '1.5' } }, latin))
            }
            return R.createElement('div', {
              key: 'group-title-' + no,
              className: 'endfield-settings-group-title',
              style: {
                display: 'flex', alignItems: 'center', gap: '8px',
                marginTop: first ? '0' : '26px', paddingBottom: '8px',
                borderBottom: '1px solid var(--dsw-alias-border-l1)',
              },
            }, parts)
          }
          /** "<row label>: <on|off>" — one spelling for every status row. */
          const stateOf = (on) => t(on ? 'on' : 'off')
          const row = (key, last, children) => R.createElement('div', { key, style: last ? { ...rowStyle, borderBottom: 'none' } : rowStyle }, children)
          return R.createElement('div', { className: 'endfield-settings', style: pageStyle }, [
            /* --- 01 主题：总开关在最前，随后是配色与圆角 --- */
            R.createElement('div', { key: 'group-theme' }, [
              groupTitle('01', 'groupTheme', true),
              row('theme', false, [
                R.createElement('span', { style: labelStyle }, t('themeRow') + t('sep') + stateOf(enabled)),
                R.createElement('button', { type: 'button', onClick: toggleTheme, style: btnStyleFor(enabled) }, t(enabled ? 'themeOff' : 'themeOn'))
              ]),
              row('palette', false, [
                R.createElement('span', { style: labelStyle },
                  t('paletteRow') + t('sep') + t(palette === 'wuling' ? 'paletteWuling' : 'paletteValley'),
                  R.createElement('span', { style: hintStyle },
                    t(palette === 'wuling' ? 'paletteHintWuling' : 'paletteHintValley')
                  )
                ),
                // A colour switch should show the colour it offers, not only name it.
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto', alignItems: 'center' } },
                  R.createElement('span', {
                    'aria-hidden': 'true',
                    style: {
                      width: '14px',
                      height: '14px',
                      flex: '0 0 auto',
                      // --edge-accent only exists while the theme stylesheet is
                      // mounted; with the theme off the chip falls back to the
                      // app's own filled surface so it stays visible.
                      background: enabled ? 'var(--edge-accent)' : 'var(--dsw-alias-interactive-bg-hover-solid)',
                      border: '1px solid var(--dsw-alias-border-l2)',
                      borderRadius: mode === 'round' ? '999px' : '0',
                    },
                  }),
                  R.createElement('button', {
                    type: 'button',
                    onClick: togglePalette,
                    style: btnStyleFor(true),
                  }, t(palette === 'wuling' ? 'paletteToValley' : 'paletteToWuling'))
                )
              ]),
              row('glass', false, [
                R.createElement('span', { style: labelStyle }, t('glassRow'),
                  R.createElement('span', { style: hintStyle }, t('glassHint'))),
                R.createElement('select', {
                  'aria-label': t('glassRow'), value: glass,
                  onChange: (event) => setGlassValue(event.target.value),
                  style: { color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)',
                    border: '1px solid var(--dsw-alias-border-l2)', padding: '6px 10px' },
                }, GLASS_OPTIONS.map((value) => R.createElement('option', { key: value, value },
                  t({ off: 'glassOff', subtle: 'glassSubtle', standard: 'glassStandard', strong: 'glassStrong' }[value]))))
              ]),
              row('radius', true, [
                R.createElement('span', { style: labelStyle }, t('radiusRow') + t('sep') + t(mode === 'round' ? 'radiusRound' : 'radiusSquare')),
                R.createElement('button', { type: 'button', onClick: toggleMode, style: btnStyleFor(mode === 'round') }, t(mode === 'round' ? 'radiusToSquare' : 'radiusToRound'))
              ]),
            ]),
            /* --- 02 背景：等高线 + 水印，各自的主开关在前、附属开关在后 --- */
            R.createElement('div', { key: 'group-bg' }, [
              groupTitle('02', 'groupBg', false),
              row('contour', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourRow') + t('sep') + stateOf(contourOn),
                  R.createElement('span', { style: hintStyle },
                    // The sheet follows the palette, so the hint must not name one colour.
                    t(contourOn ? 'contourHintOn' : 'contourHintOff')
                  )
                ),
                R.createElement('button', { type: 'button', onClick: toggleContour, style: btnStyleFor(contourOn) }, t(contourOn ? 'contourOff' : 'contourOn'))
              ]),
              row('contour-anim', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourAnimRow') + t('sep') + stateOf(contourAnim),
                  R.createElement('span', { style: hintStyle },
                    // Say so when the OS preference is overriding the switch, rather
                    // than letting it look like the toggle is broken.
                    (contourAnim && prefersReducedMotion())
                      ? t('contourAnimHintReduced')
                      : t(contourAnim ? 'contourAnimHintOn' : 'contourAnimHintOff')
                  )
                ),
                R.createElement('button', {
                  type: 'button',
                  onClick: toggleContourAnim,
                  style: btnStyleFor(contourAnim, !contourOn),
                  // Only meaningful while the layer itself is on.
                  disabled: !contourOn,
                  title: contourOn ? '' : t('contourAnimNeedLayer'),
                }, t(contourAnim ? 'contourAnimOff' : 'contourAnimOn'))
              ]),
              row('contour-trail', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourTrailRow') + t('sep') + stateOf(contourTrailOn),
                  R.createElement('span', { style: hintStyle }, t('contourTrailHint'))
                ),
                R.createElement('button', {
                  type: 'button', onClick: toggleContourTrail,
                  style: btnStyleFor(contourTrailOn, !contourOn), disabled: !contourOn,
                  title: contourOn ? '' : t('contourAnimNeedLayer'),
                }, t(contourTrailOn ? 'contourTrailOff' : 'contourTrailOn'))
              ]),
              row('contour-renderer', false, [
                R.createElement('span', { style: labelStyle }, t('contourRendererRow'),
                  R.createElement('span', { style: hintStyle }, t('contourRendererHint'))),
                R.createElement('select', { 'aria-label': t('contourRendererRow'), value: contourRenderer,
                  onChange: (event) => setContourRendererValue(event.target.value),
                  style: { color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)',
                    border: '1px solid var(--dsw-alias-border-l2)', padding: '6px 10px' } },
                  R.createElement('option', { value: 'canvas' }, t('contourRendererCanvas')),
                  R.createElement('option', { value: 'worker-webgl' }, t('contourRendererWorker')))
              ]),
              row('contour-fps', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourFpsRow') + t('sep') + contourFps + t('contourFpsUnit'),
                  R.createElement('span', { style: hintStyle }, t('contourFpsHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '4px', flex: '0 0 auto' } },
                  ...CONTOUR_FPS_OPTIONS.map((fps) => R.createElement('button', {
                    key: 'fps-' + fps,
                    type: 'button',
                    onClick: () => setContourFpsValue(fps),
                    style: btnStyleFor(contourFps === fps, !contourOn),
                    disabled: !contourOn,
                    title: contourOn ? '' : t('contourAnimNeedLayer'),
                  }, String(fps)))
                )
              ]),
              row('contour-speed', false, [
                R.createElement('span', { style: labelStyle },
                  t('contourSpeedRow') + t('sep') + t(contourSpeed === 1 ? 'contourSpeedSlow' : contourSpeed === 4 ? 'contourSpeedFast' : 'contourSpeedNormal'),
                  R.createElement('span', { style: hintStyle }, t('contourSpeedHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '4px', flex: '0 0 auto' } },
                  ...CONTOUR_SPEED_OPTIONS.map((speed) => R.createElement('button', {
                    key: 'speed-' + speed,
                    type: 'button',
                    onClick: () => setContourSpeedValue(speed),
                    style: btnStyleFor(contourSpeed === speed, !contourOn),
                    disabled: !contourOn,
                    title: contourOn ? '' : t('contourAnimNeedLayer'),
                  }, t(speed === 1 ? 'contourSpeedSlow' : speed === 4 ? 'contourSpeedFast' : 'contourSpeedNormal')))
                )
              ]),
              row('contour-scroll-pause', true, [
                R.createElement('span', { style: labelStyle },
                  t('contourScrollPauseRow') + t('sep') + stateOf(contourScrollPause),
                  R.createElement('span', { style: hintStyle },
                    t(contourScrollPause ? 'contourScrollPauseHintOn' : 'contourScrollPauseHintOff')
                  )
                ),
                R.createElement('button', {
                  type: 'button',
                  onClick: toggleContourScrollPause,
                  style: btnStyleFor(contourScrollPause, !contourOn),
                  disabled: !contourOn,
                  title: contourOn ? '' : t('contourAnimNeedLayer'),
                }, t(contourScrollPause ? 'contourScrollPauseOff' : 'contourScrollPauseOn'))
              ]),
              row('watermark', false, [
                R.createElement('span', { style: labelStyle }, t('watermarkRow') + t('sep') + stateOf(wmOn)),
                R.createElement('button', { type: 'button', onClick: toggleWm, style: btnStyleFor(wmOn) }, t(wmOn ? 'watermarkOff' : 'watermarkOn'))
              ]),
              row('watermark-persist', true, [
                R.createElement('span', { style: labelStyle },
                  t('wmPersistRow') + t('sep') + stateOf(wmPersist),
                  R.createElement('span', { style: hintStyle },
                    t(wmPersist ? 'wmPersistHintOn' : 'wmPersistHintOff')
                  )
                ),
                R.createElement('button', {
                  type: 'button',
                  onClick: toggleWmPersist,
                  style: btnStyleFor(wmPersist, !wmOn),
                  // The switch only has meaning while the watermark itself is on.
                  disabled: !wmOn,
                  title: wmOn ? '' : t('wmPersistNeedWm'),
                }, t(wmPersist ? 'wmPersistOff' : 'wmPersistOn'))
              ]),
            ]),
            /* --- 03 动画：启动加载动画 --- */
            R.createElement('div', { key: 'group-anim' }, [
              groupTitle('03', 'groupAnim', false),
              row('loader', true, [
                R.createElement('span', { style: labelStyle },
                  t('loaderRow') + t('sep') + stateOf(loaderOn),
                  R.createElement('span', { style: hintStyle },
                    t(loaderOn ? 'loaderHintOn' : 'loaderHintOff')
                  )
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  // Replay only makes sense while the feature is on; it lets the user
                  // re-watch the animation without reloading the page.
                  R.createElement('button', {
                    type: 'button',
                    onClick: replayLoader,
                    // The master switch gates this too: the plate is styled by the
                    // stylesheet the master switch removes, so previewing while the
                    // theme is off has nothing to show (runLoader refuses as well).
                    style: btnStyleFor(false, !loaderOn || !enabled),
                    disabled: !loaderOn || !enabled,
                    title: loaderOn ? '' : t('loaderNeed'),
                  }, t('preview')),
                  R.createElement('button', { type: 'button', onClick: toggleLoader, style: btnStyleFor(loaderOn) }, t(loaderOn ? 'loaderOff' : 'loaderOn'))
                )
              ]),
            ]),
            /* --- 04 娱乐：雷霆大字（主开关 + 入场动画子开关） --- */
            R.createElement('div', { key: 'group-fun' }, [
              groupTitle('04', 'groupFun', false),
              row('thunder', false, [
                R.createElement('span', { style: labelStyle },
                  t('thunderRow') + t('sep') + stateOf(thunderOn),
                  R.createElement('span', { style: hintStyle },
                    t(thunderOn ? 'thunderHintOn' : 'thunderHintOff')
                  )
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  // Same affordance as the boot animation: let the user see the
                  // effect now instead of waiting for the next task boundary.
                  R.createElement('button', {
                    type: 'button',
                    onClick: previewThunder,
                    style: btnStyleFor(false, !thunderOn),
                    disabled: !thunderOn,
                    title: thunderOn ? '' : t('thunderNeed'),
                  }, t('preview')),
                  R.createElement('button', { type: 'button', onClick: toggleThunder, style: btnStyleFor(thunderOn) }, t(thunderOn ? 'thunderOff' : 'thunderOn'))
                )
              ]),
              row('thunder-anim', true, [
                R.createElement('span', { style: labelStyle },
                  t('thunderAnimRow') + t('sep') + stateOf(thunderAnim),
                  R.createElement('span', { style: hintStyle },
                    // Say so when the OS preference is overriding the switch, rather
                    // than letting it look like the toggle is broken.
                    (thunderAnim && prefersReducedMotion())
                      ? t('thunderAnimHintReduced')
                      : t(thunderAnim ? 'thunderAnimHintOn' : 'thunderAnimHintOff')
                  )
                ),
                R.createElement('button', {
                  type: 'button',
                  onClick: toggleThunderAnim,
                  style: btnStyleFor(thunderAnim, !thunderOn),
                  // Only meaningful while the announcement itself is on.
                  disabled: !thunderOn,
                  title: thunderOn ? '' : t('thunderNeed'),
                }, t(thunderAnim ? 'thunderAnimOff' : 'thunderAnimOn'))
              ]),
              /* --- 顶部余额胶囊：同样属于「娱乐」组的悬浮层 --- */
              row('balance-capsule', true, [
                R.createElement('span', { style: labelStyle },
                  t('balanceRow') + t('sep') + stateOf(balanceOn),
                  R.createElement('span', { style: hintStyle },
                    t(balanceOn ? 'balanceHintOn' : 'balanceHintOff')
                  )
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  // Same affordance as the boot plate: the theme draws this opening
                  // pose once per page load, so let the user watch it again without
                  // reloading. Gated on the theme AND the capsule, because the pose is
                  // drawn by the stylesheet the master switch removes.
                  R.createElement('button', {
                    type: 'button',
                    onClick: previewBalanceBoot,
                    style: btnStyleFor(false, !balanceOn || !enabled),
                    disabled: !balanceOn || !enabled,
                    title: balanceOn ? '' : t('balanceNeed'),
                  }, t('preview')),
                  R.createElement('button', {
                    type: 'button',
                    onClick: toggleBalanceCapsule,
                    style: btnStyleFor(balanceOn),
                  }, t(balanceOn ? 'balanceOff' : 'balanceOn'))
                )
              ]),
              /* --- 渠道额度读数：右侧百分比显示已用 or 剩余 ---
                 The row lives directly under the capsule switch because it only
                 describes that capsule's credits mode; the select mirrors the
                 glass/renderer rows rather than a toggle, and the hint states
                 what changes (the right-hand slot) and what does not (the lead
                 figure always stays the remaining balance). */
              row('credit-display', false, [
                R.createElement('span', { style: labelStyle },
                  t('creditDisplayRow') + t('sep') + t(creditDisplay === 'used' ? 'creditDisplayUsed' : 'creditDisplayRemaining'),
                  R.createElement('span', { style: hintStyle },
                    t(creditDisplay === 'used' ? 'creditDisplayHintUsed' : 'creditDisplayHintRemaining')
                  )
                ),
                R.createElement('select', {
                  'aria-label': t('creditDisplayRow'), value: creditDisplay,
                  onChange: (event) => setCreditDisplayValue(event.target.value),
                  style: { color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)',
                    border: '1px solid var(--dsw-alias-border-l2)', padding: '6px 10px' },
                }, CREDIT_DISPLAY_OPTIONS.map((value) => R.createElement('option', { key: value, value },
                  t(value === 'used' ? 'creditDisplayUsed' : 'creditDisplayRemaining'))))
              ]),
            ]),
            /* --- 05 音频：两个生效槽位 + 两个预留槽位 ---
               Every row states WHEN it fires, because that is the whole contract
               of this feature; the two reserved rows say outright that they will
               not fire yet, so a switch that does nothing cannot read as broken. */
            R.createElement('div', { key: 'group-audio' }, [
              groupTitle('05', 'groupAudio', false),
              row('audio', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioRow') + t('sep') + stateOf(audioOn),
                  R.createElement('span', { style: hintStyle },
                    t(audioOn ? 'audioHintOn' : 'audioHintOff')
                  )
                ),
                R.createElement('button', { type: 'button', onClick: toggleAudio, style: btnStyleFor(audioOn) }, t(audioOn ? 'audioOff' : 'audioOn'))
              ]),
              /* The boot row pairs two independent switches stacked on the right:
                 the sound's own on/off, and the loader's preview button. They are
                 separate switches because the loader can be on with no sound. */
              row('audio-boot', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioBootRow') + t('sep') + stateOf(audioBoot),
                  R.createElement('span', { style: hintStyle }, t('audioBootHint'))
                ),
                R.createElement('span', { style: { display: 'flex', flexDirection: 'column', gap: '6px', flex: '0 0 auto', alignItems: 'stretch' } },
                  R.createElement('button', {
                    type: 'button', onClick: replayLoader,
                    style: btnStyleFor(false, !loaderOn || !enabled),
                    disabled: !loaderOn || !enabled,
                    title: loaderOn ? '' : t('loaderNeed'),
                  }, t('preview') + ' · ' + t('loaderRow')),
                  R.createElement('button', {
                    type: 'button', onClick: toggleAudioBoot,
                    style: btnStyleFor(audioBoot, !audioOn), disabled: !audioOn,
                    title: audioOn ? '' : t('audioNeedOn'),
                  }, t(audioBoot ? 'audioBootOff' : 'audioBootOn'))
                )
              ]),
              row('audio-start', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioStartRow') + t('sep') + stateOf(audioStart),
                  R.createElement('span', { style: hintStyle }, t('audioStartHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  audioTestButton('turn-start', 'audioSlotStart'),
                  R.createElement('button', {
                    type: 'button', onClick: toggleAudioStart,
                    style: btnStyleFor(audioStart, !audioOn), disabled: !audioOn,
                    title: audioOn ? '' : t('audioNeedOn'),
                  }, t(audioStart ? 'audioStartOff' : 'audioStartOn'))
                )
              ]),
              row('audio-done', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioDoneRow') + t('sep') + stateOf(audioDone),
                  R.createElement('span', { style: hintStyle }, t('audioDoneHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  audioTestButton('turn-done', 'audioSlotDone'),
                  R.createElement('button', {
                    type: 'button', onClick: toggleAudioDone,
                    style: btnStyleFor(audioDone, !audioOn), disabled: !audioOn,
                    title: audioOn ? '' : t('audioNeedOn'),
                  }, t(audioDone ? 'audioDoneOff' : 'audioDoneOn'))
                )
              ]),
              row('audio-volume', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioVolumeRow') + t('sep') + String(audioVolume) + '%',
                  R.createElement('span', { style: hintStyle }, t('audioVolumeHint'))
                ),
                R.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' } },
                  R.createElement('input', {
                    type: 'range', min: 0, max: 100, step: 5,
                    'aria-label': t('audioVolumeRow'),
                    value: audioVolume,
                    disabled: !audioOn,
                    onChange: (event) => setAudioVolumeValue(Number(event.target.value)),
                    onMouseUp: () => { previewSlot('turn-done').then(showPreviewNote) },
                    style: { width: '140px', accentColor: enabled ? 'var(--edge-accent)' : undefined },
                  }),
                  R.createElement('span', { style: { ...labelStyle, minWidth: '38px', textAlign: 'right' } }, String(audioVolume) + '%')
                )
              ]),
              row('audio-attention', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioAttentionRow') + t('sep') + stateOf(audioTestReady()),
                  R.createElement('span', { style: hintStyle }, t('audioReservedHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  audioTestButton('attention', 'audioSlotAttention')
                )
              ]),
              row('audio-fail', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioTurnFailRow') + t('sep') + stateOf(audioTestReady()),
                  R.createElement('span', { style: hintStyle }, t('audioReservedHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  audioTestButton('turn-fail', 'audioSlotFail')
                )
              ]),
              row('audio-source', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioFileRow') + t('sep') + sourceSummary(),
                  R.createElement('span', { style: hintStyle, wordBreak: 'break-all' }, sourceDetail())
                ),
                R.createElement('button', {
                  type: 'button', onClick: () => { setPreviewNote(''); refreshHostState() },
                  style: btnStyleFor(false),
                }, t('audioRefresh'))
              ]),
              row('audio-dir', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioSoundDirRow') + t('sep') + (readAudioSoundDir() || t('audioSoundDirDefault')),
                  R.createElement('span', { style: hintStyle }, t('audioSoundDirHint'))
                ),
                R.createElement('span', { style: { display: 'flex', gap: '8px', flex: '0 0 auto' } },
                  R.createElement('input', {
                    type: 'text',
                    'aria-label': t('audioSoundDirRow'),
                    defaultValue: readAudioSoundDir(),
                    placeholder: t('audioSoundDirDefault'),
                    onKeyDown: (event) => { if (event.key === 'Enter') applySoundDir(event.target.value) },
                    onBlur: (event) => applySoundDir(event.target.value),
                    style: { width: '200px', color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)', padding: '6px 8px', fontSize: '12px' },
                  })
                )
              ]),
              row('audio-human', false, [
                R.createElement('span', { style: labelStyle },
                  t('audioHumanOnlyRow') + t('sep') + t(audioHumanOnly ? 'audioHumanOnlyOn' : 'audioHumanOnlyOff'),
                  R.createElement('span', { style: hintStyle },
                    t(audioHumanOnly ? 'audioHumanOnlyHintOn' : 'audioHumanOnlyHintOff')
                  )
                ),
                R.createElement('button', {
                  type: 'button', onClick: toggleAudioHumanOnly,
                  style: btnStyleFor(audioHumanOnly, !audioOn), disabled: !audioOn,
                  title: audioOn ? '' : t('audioNeedOn'),
                }, t(audioHumanOnly ? 'audioHumanOnlyOff' : 'audioHumanOnlyOn'))
              ]),
              row('audio-diag', true, [
                R.createElement('span', { style: labelStyle },
                  t('audioDiagRow') + t('sep') + stateOf(audioDiag),
                  R.createElement('span', { style: hintStyle },
                    previewNote !== '' ? previewNote : t('audioDiagHint')
                  )
                ),
                R.createElement('button', { type: 'button', onClick: toggleAudioDiag, style: btnStyleFor(audioDiag) }, t(audioDiag ? 'audioDiagOff' : 'audioDiagOn'))
              ]),
            ]),
          ])
        }
      )
      disposeRows.push(d)
      return d
    })
    }

    ctx.effect(() => () => {
      unmount()
      // Release the idempotency flag so a re-apply after this dispose can mount
      // the theme again; leaving it set killed the theme until a hard reload.
      // The build marker goes with it: a disposed page must look un-mounted to
      // the next apply() no matter which build performs it.
      if (typeof window !== 'undefined') {
        window.__dshThemeEndfieldApplied = false
        delete window.__dshThemeEndfieldBuild
      }
      if (watermarkObserver) watermarkObserver.disconnect()
      /* A deferred observer install may still be waiting on DOMContentLoaded when
         the run ends; drop the pending listener so a disposed run is not wired
         back into the page. removeEventListener is a no-op when it never fired
         or already ran ({ once }), so both branches are safe. */
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('DOMContentLoaded', watermarkObserverLate)
        document.removeEventListener('DOMContentLoaded', contourSchemeObserverLate)
      }
      if (watermarkRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(watermarkRaf)
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') window.removeEventListener('resize', onWatermarkResize)
      if (watermarkEl && watermarkEl.parentNode) watermarkEl.parentNode.removeChild(watermarkEl)
      if (contourScrollTimer !== null && typeof clearTimeout === 'function') clearTimeout(contourScrollTimer)
      contourScrollTimer = null
      contourScrollPaused = false
      // Both scroll listeners went on in capture mode, so both have to come off the
      // same way — dropping only 'scroll' leaks a scrollend listener per plugin run.
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('scroll', onContourScrollEvent, true)
        window.removeEventListener('scrollend', onContourScrollEndEvent, true)
      }
      // The plate owns a rAF handle and a fixed DOM node; both must go with the run.
      destroyLoader()
      // The contour layer owns a rAF handle, a ResizeObserver, a MutationObserver
      // and two canvases — every one of them has to go with the run.
      contourTeardown()
      if (contourSchemeObserver) contourSchemeObserver.disconnect()
      /* The announcement feature owns two store subscriptions, a retry timeout and
         a hide timeout, all of which outlive the DOM node — unmount() covers the
         switched-off path, but a fiber unload while the theme is ON must release
         them here too, or the callbacks keep firing against a dead run. */
      thunderStopWatch()
      destroyThunder()
      // Same reason as the announcement watcher: a poll that outlives its fiber
      // keeps POSTing against a dead run.
      stopAudioAttentionWatch()
      // Same reason: the capsule owns a 60s balance poll and a fixed DOM node,
      // both of which must go with the run.
      destroyBalanceCapsule()
      disposeSettings()
    })
