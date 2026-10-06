    const onContourVisibility = () => {
      if (document.hidden && contourWorker) contourWorker.pending = null
      if (!document.hidden && contourWrap) contourRefresh(true)
      contourSwitchSig = ''
      contourApplySwitches()
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', onContourVisibility)
      ctx.effect(() => () => document.removeEventListener('visibilitychange', onContourVisibility))
    }

