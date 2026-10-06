    const unmount = () => {
      if (!mounted) return
      mounted = false
      disposeToken()
      disposeStyles()
      disposeToken = () => {}
      disposeStyles = () => {}
      // Guarded like every other body touch: an unload race must not throw here.
      if (typeof document !== 'undefined' && document.body !== null) {
        document.body.classList.remove('theme-endfield-round')
        /* The palette class must go with the stylesheet that gives it meaning:
           left behind it would be a class nothing defines, and it would make
           isWulingPalette() report a palette the page is no longer using. The
           stored preference is untouched, so re-enabling restores it. */
        document.body.classList.remove(PALETTE_CLASS)
        document.body.removeAttribute?.('data-endfield-glass')
      }
      // The plate is styled by the theme stylesheet just torn down — an orphaned
      // plate would sit there as an unstyled black-less div, so drop it too.
      destroyLoader()
      // Same reasoning for the contour sheet: its positioning and the background
      // transparency rules it depends on both live in that stylesheet, so leaving
      // it mounted would drop two raw canvases into the app's layout flow.
      contourTeardown()
      /* The announcement plate is styled entirely by that stylesheet too, so an
         in-flight word would become an unstyled, un-positioned block of text in the
         document flow. Stop watching as well: with the theme off there is nothing to
         announce into. */
      thunderStopWatch()
      destroyThunder()
      /* The watermark must go with the stylesheet too, and it cannot wait for
         syncWatermarkVisibility(): with the sheet torn down its
         `opacity: var(--edge-wm-alpha)` computes invalid and falls back to 1,
         so an orphaned mark sits on the page as a fully opaque 9.5vw ENDFIELD.
         This path also runs when the switch is turned off from ANOTHER window
         (reconcileFromPrefs -> unmount), where nothing else removes the node —
         the local toggle path only looked covered because toggleTheme happened
         to call syncWatermarkVisibility() itself. */
      if (watermarkRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(watermarkRaf)
      watermarkRaf = null
      if (watermarkEl !== null && watermarkEl.parentNode) watermarkEl.parentNode.removeChild(watermarkEl)
      watermarkEl = null
      watermarkHost = null
      // The attention poll belongs to the themed, audio-enabled page; leaving it
      // running would keep reporting confirmations for a theme that is off.
      stopAudioAttentionWatch()
      // Same for the balance capsule: its poll and its node both live inside the
      // themed page, and its styles were just torn down with the sheet above.
      destroyBalanceCapsule()
    }

    if (isEnabled()) {
      mount()
      syncWatermarkVisibility()
      // The contour sheet needs the stylesheet mount() just inserted, and the app
      // frame to exist; syncContour is a no-op until both are true and the
      // watermark's MutationObserver retries it as the app renders.
      syncContour()
      // Boot animation: only on a real page load, only when switched on, and only
      // after the stylesheet above exists (mount() inserted it).
      if (isLoaderOn()) runLoader()
      // Task announcements: subscribes only while switched on, and the first value
      // it reads is a baseline, so enabling mid-turn stays silent.
      syncThunder()
      // 需要你回应: starts only while the theme and the audio feature are both on.
      syncAudioAttentionWatch()
      // 顶部余额胶囊: mounts only while its own switch is on, and polls the
      // host-side balance route only while mounted.
      syncBalanceCapsule()
    }

    /* Live preference reconciler. The namespace scope subscription in the store
       block near the top of apply() calls this every time an authoritative
       section change lands (our own committed writes echo back, another window /
       device edits the same profile's settings document
       (<profile>/cordis.patch.yml on 0.1.7, <dshHome>/settings.yaml before it),
       or the host reverts a value). It mirrors the initial mount block above so a
       runtime change re-paints exactly the live surfaces it can: the master switch mounts/unmounts
       the token + stylesheet layers, then radius/palette/watermark/contour/
       thunder re-derive from the new value. The boot loader is deliberately not
       replayed here: it is a once-per-page-load plate, so a mid-session section
       change must not slam a startup animation over a running app. The one thing
       that DOES start it outside apply() is the first authoritative settle
       (onPrefsSettled) — that is the same page-load moment, not a later edit — plus
       the plate's own toggle and 预览 button. Every layer entry point is idempotent
       (mount() and unmount() guard on `mounted`, syncContour is a no-op until the
       frame and stylesheet exist), so repeated echoes are cheap and safe. */
    reconcileFromPrefs = () => {
      const enabledNext = isEnabled()
      const enabledNow = mounted
      if (enabledNext && !enabledNow) mount()
      else if (!enabledNext && enabledNow) unmount()
      if (enabledNext) {
        // These sync helpers read the store on each call, so no snapshot passing.
        syncRadiusMode()
        syncGlass()
        syncPaletteClass()
        syncWatermarkVisibility()
        syncContour()
        syncThunder()
        // Same reason: it re-reads both switches and starts or stops the poll.
        syncAudioAttentionWatch()
        // Same reason: it re-reads its switch and mounts or removes the capsule.
        syncBalanceCapsule()
      } else {
        // Switched off mid-session: the watcher must not keep polling a page the
        // theme no longer owns.
        stopAudioAttentionWatch()
        // And the capsule must not keep polling the balance route on an unthemed
        // page — destroyBalanceCapsule also clears its interval.
        destroyBalanceCapsule()
      }
    }
