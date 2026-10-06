    /* ---------- accent palette: 谷地黄 (default) / 武陵青 ----------
       The palette is ONE class on <body>; the stylesheet defines both variable
       sets, so switching is a class flip with no restyling work here. Because the
       app applies its theme tokens as inline body styles and this theme's token
       overrides are var(--edge-accent) references, those tokens re-resolve on the
       same flip — no JS repaint, no theme.overrideTokens() re-registration.

       'valley' (谷地黄, signal yellow) is the DEFAULT, so an unset field and any
       unrecognised value both mean yellow. Only the exact string 'wuling' selects
       武陵青, which keeps a corrupt stored value (schema rejects / outside the
       fallback) from silently changing the shipped look.

       The one surface a class cannot reach is the contour canvas, which is painted
       by JS — hence syncPalette() redraws it, and the observer below catches a flip
       made in another tab or by the browser restoring state. */
    const PALETTE_KEY = 'dsh-theme-endfield-palette'
    const PALETTE_CLASS = 'theme-endfield-wuling'
    const readPalette = () => (prefsGet(PALETTE_KEY) === 'wuling' ? 'wuling' : 'valley')
    /* Read from the DOM, not from storage: the canvas must match what is actually
       on screen. While the theme is switched off the class is absent, so the sheet
       keeps its default palette instead of following an ignored preference. */
    const isWulingPalette = () => typeof document !== 'undefined'
      && document.body !== null
      && document.body.classList.contains(PALETTE_CLASS)
    const syncPaletteClass = () => {
      if (typeof document === 'undefined' || document.body === null) return
      // The class only applies while the theme owns the page; unmount() drops it.
      if (isEnabled() && readPalette() === 'wuling') document.body.classList.add(PALETTE_CLASS)
      else document.body.classList.remove(PALETTE_CLASS)
    }

