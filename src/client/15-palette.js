
    /* ---------- accent palette: 谷地黄 (default) / 武陵青 / 重燃赤 / 浸蓝 / 基石蓝 ----------
       The palette is ONE class on <body>; the stylesheet defines all five
       variable sets, so switching is a class flip with no restyling work here.
       Because the app applies its theme tokens as inline body styles and this
       theme's token overrides are var(--edge-accent) references, those tokens
       re-resolve on the same flip — no JS repaint, no theme.overrideTokens()
       re-registration.

       'valley' (谷地黄, signal yellow) is the DEFAULT, so an unset field and any
       unrecognised value both mean yellow. Only the exact literals 'wuling' /
       'ember' / 'abyss' / 'foundation' select the others, which keeps a corrupt
       stored value (schema rejects / outside the fallback) from silently changing
       the shipped look.

       The map is the single place that knows a palette's class name. Everything
       downstream asks activePalette() instead of testing one class by name, so a
       palette is one CSS block plus one entry here — and no consumer can keep
       quietly reporting "not wuling" for a palette it has never heard of.
       (That was the shape of the bug this refactor removes: the contour canvas
       used to ask isWulingPalette(), which would have painted a new palette with
       the YELLOW stroke and looked like the feature breaking on switch.)

       The one surface a class cannot reach is the contour canvas, which is painted
       by JS — hence syncPalette() redraws it after a flip. */
    const PALETTE_KEY = 'dsh-theme-endfield-palette'
    const PALETTE_CLASSES = {
      wuling: 'theme-endfield-wuling',
      ember: 'theme-endfield-ember',
      abyss: 'theme-endfield-abyss',
      foundation: 'theme-endfield-foundation',
    }
    /* Order is the shipped order, not a set: the settings row lists these as the
       options of its <select>, so this array is simultaneously the allow-list for
       a stored value and the order the user reads. The reading order is
       deliberate — default (warm), cool, hot, deep, ice. */
    const PALETTES = ['valley', 'wuling', 'ember', 'abyss', 'foundation']
    const readPalette = () => {
      const stored = prefsGet(PALETTE_KEY)
      return PALETTES.indexOf(stored) === -1 ? 'valley' : stored
    }
    /* Read from the DOM, not from storage: the canvas must match what is actually
       on screen. While the theme is switched off every class is absent, so the
       sheet keeps its default palette instead of following an ignored preference. */
    const activePalette = () => {
      if (typeof document === 'undefined' || document.body === null) return 'valley'
      const list = document.body.classList
      for (let i = 0; i < PALETTES.length; i++) {
        const cls = PALETTE_CLASSES[PALETTES[i]]
        if (cls !== undefined && list.contains(cls)) return PALETTES[i]
      }
      return 'valley'
    }
    const isWulingPalette = () => activePalette() === 'wuling'
    const isEmberPalette = () => activePalette() === 'ember'
    const isAbyssPalette = () => activePalette() === 'abyss'
    const isFoundationPalette = () => activePalette() === 'foundation'
    /* No nextPalette() any more: the settings row is a <select>, so "which one do
       I get" is answered by the option the user picked rather than by arithmetic
       over this array. The order above still matters — it is the option order. */
    const syncPaletteClass = () => {
      if (typeof document === 'undefined' || document.body === null) return
      const wanted = readPalette()
      for (const name of PALETTES) {
        const cls = PALETTE_CLASSES[name]
        if (cls === undefined) continue
        // The class only applies while the theme owns the page; unmount() drops it.
        if (isEnabled() && wanted === name) document.body.classList.add(cls)
        else document.body.classList.remove(cls)
      }
    }
