    /* --- transport selection ------------------------------------------------
       Two DSH generations expose the same durable-preference seam under
       different names, and the theme has to work on both without throwing on
       whichever is absent:

         0.1.7-rc.1   cfg = ctx.get('configForms')   (the settings domain's
                      shared-form service)
                      cfg.get(<profile entry id>) -> ConfigForm with
                      getSnapshot() / subscribe() / set() / unset() / mutate()
                      and a snapshot of { status, value, base, user, revision,
                      writable, mode }. set() returns Promise<boolean>: false
                      means the Host refused or SKIPPED the write (the classic
                      case being memory mode on a non-loopback page).
         <=0.1.5-rc.2 binder = ctx.get('settingsScope') / ctx.settingsScope
                      binder.bind({ namespace, decode }) -> scope with the same
                      snapshot fields, and a fire-and-forget set().

       Same snapshot vocabulary, same write intent, so everything downstream of
       acquisition is shared; only the lookup, the namespace string and the
       settlement of set() differ. `configForms` is tried FIRST because on
       0.1.7 the legacy service does not exist at all.

       A ConfigForm is keyed by the PROFILE ENTRY ID, which the patch layer
       assigns: this package's own bundle patch inserts `theme-endfield`, but a
       hand-written insert may use the package name and the loader's tree path
       prefixes include groups with `include:`. PREFS_ENTRY_CANDIDATES lists the
       spellings this package can be installed under, in likelihood order.
       Acquisition prefers whichever candidate the Host actually SERVES and
       otherwise binds the first one immediately: a form is only a lazy view over
       the shared mirror, so binding early is what lets a slow boot deliver its
       section late instead of losing that page load's settings entirely. A wrong
       guess self-heals — while the bound form reports 'unavailable' and the
       mirror reloads, prefsOnScopeChange moves the binding to whichever
       candidate is served. */
    const PREFS_ENTRY_CANDIDATES = [
      PREFS_ENTRY,                   // this package's cordis.patch.yml row id
      'include:' + PREFS_ENTRY,      // loader tree path when bundle-mounted
      PREFS_NS,                      // a row inserted under the old namespace name
      'include:' + PREFS_NS,
    ]
    /* The 0.1.7 shared-form service, or undefined on a host that has none. Both
       access forms are tried: the injected-property spelling DSH's own client
       plugins use, then the optional-lookup form this module has always used. */
    const getConfigForms = () => {
      try {
        if (ctx.configForms !== undefined && ctx.configForms !== null
          && typeof ctx.configForms.get === 'function') return ctx.configForms
      } catch (e) { /* property may be a getter that throws when not available */ }
      try {
        const forms = ctx.get('configForms')
        if (forms !== undefined && forms !== null && typeof forms.get === 'function') return forms
      } catch (e) { /* optional service lookup */ }
      return undefined
    }
    // Try the idiomatic injected-property access first (how DSH client plugins like
    // dsh-client-locale consume services — exports.inject plus `ctx.xxx`), then
    // the lookup form this module has historically used for optional services.
    const getSettingsScopeBinder = () => {
      try {
        if (ctx.settingsScope !== undefined && ctx.settingsScope !== null
          && typeof ctx.settingsScope.bind === 'function') return ctx.settingsScope
      } catch (e) { /* property may be a getter that throws when not available */ }
      try { return ctx.get('settingsScope') } catch (e) { return undefined }
    }
    /* The namespaces the Host's describe view actually SERVES, for diagnostics.
       This is the one fact that tells "the host half exported no Config" apart
       from "the client bound an entry spelling this install does not use": both
       leave the bound form unserved, and only the served list says which one
       happened. Returns null while the mirror has not answered yet. */
    const prefsServedNamespaces = () => {
      try {
        const forms = getConfigForms()
        if (forms === undefined || typeof forms.describe !== 'function') return null
        const mirrored = forms.describe().getSnapshot()
        const view = mirrored && mirrored.view
        if (!view || !Array.isArray(view.namespaces)) return null
        return view.namespaces.map((row) => row && row.ns)
      } catch (e) { return null }
    }
    /* Snapshot of any transport object, or null when it cannot be read. */
    const prefsSnapshotOf = (scope) => {
      if (!scope || typeof scope.getSnapshot !== 'function') return null
      try { return scope.getSnapshot() } catch (e) { return null }
    }
    /* The first CANDIDATE spelling the Host actually serves (status 'ready'),
       or null. Kept separate from acquisition because it is also the re-check a
       bound-but-unserved form runs when the mirror reloads. */
    const prefsFindReadyForm = () => {
      const forms = getConfigForms()
      if (forms === undefined) return null
      for (const ns of PREFS_ENTRY_CANDIDATES) {
        let form = null
        try { form = forms.get(ns) } catch (e) { form = null }
        if (!form || typeof form.getSnapshot !== 'function') continue
        const snap = prefsSnapshotOf(form)
        if (snap !== null && snap.status === 'ready') return { scope: form, kind: 'configForms', ns }
      }
      return null
    }
    /* Acquire the transport for this page.
       A SERVED candidate wins outright. Otherwise the FIRST candidate is bound
       anyway, even while the mirror is still 'loading' or reports it
       'unavailable': a ConfigForm always exists (it is a lazy view over the
       shared mirror), and binding it immediately is what lets a slow or
       later-served Host still deliver its section through the subscription —
       exactly how the legacy binder behaved. A wrong guess is not fatal:
       prefsOnScopeChange re-selects as soon as another candidate is served. */
    const acquirePrefsScope = () => {
      const ready = prefsFindReadyForm()
      if (ready !== null) return ready
      const forms = getConfigForms()
      if (forms !== undefined) {
        for (const ns of PREFS_ENTRY_CANDIDATES) {
          let form = null
          try { form = forms.get(ns) } catch (e) { form = null }
          if (form && typeof form.getSnapshot === 'function') return { scope: form, kind: 'configForms', ns }
        }
      }
      const binder = getSettingsScopeBinder()
      if (binder !== undefined && binder !== null && typeof binder.bind === 'function') {
        let scope = null
        try { scope = binder.bind({ namespace: PREFS_NS, decode: prefsResolveSection }) } catch (e) { dbg('bind threw', e && e.message); scope = null }
        if (scope !== null && scope !== undefined) return { scope, kind: 'settingsScope', ns: PREFS_NS }
      }
      return null
    }
    /* A schema-accepted section from the transport, else in-memory defaults
       (PREFS_FIELD_DEFAULTS is the fallback BEFORE a first section arrives).
       Fields the user has edited this session are overlaid ON TOP on purpose: a
       toggle writes prefsLocal synchronously and only then does the host echo the
       section back, so reading the fetched section first would show the panel the
       new state while the theme still acted on the old one until the round-trip
       closed. Only EDITED fields are overlaid (see prefsLocalEdited), so a served
       value for any other field is still what the theme reads. */
    let prefsOverlayCache = null
    const prefsGetValue = () => {
      const base = prefsFieldValue || PREFS_FIELD_DEFAULTS
      if (prefsLocalEdited.size === 0) return base
      /* Hot path: the contour loop and the watermark observer read prefs many
         times per frame. Rebuilding this overlay per read allocated a fresh
         ~24-key object every time; caching it against the base-section
         REFERENCE keeps those reads allocation-free. prefsSet invalidates on
         every edit (the only place prefsLocalEdited grows), and a new section
         from the host arrives as a different `base` reference, so a stale pair
         can never be served. Callers treat the result as read-only — prefsGet
         is the sole runtime consumer and only reads single fields. */
      if (prefsOverlayCache !== null && prefsOverlayCache.base === base) return prefsOverlayCache.out
      const out = Object.assign({}, base)
      for (const field of prefsLocalEdited) out[field] = prefsLocal[field]
      prefsOverlayCache = { base, out }
      return out
    }
    /** read one field as its raw stored string: <stored-or-default>, never null. */
    const prefsGet = (rawKey) => {
      const field = prefsFieldOf(rawKey)
      const sec = prefsGetValue()
      if (sec && Object.prototype.hasOwnProperty.call(sec, field)) return String(sec[field])
      return PREFS_FIELD_DEFAULTS[field]
    }
    /** subscribe to any change of the whole namespace (transport or local). */
    const prefsSubscribe = (listener) => {
      prefsListeners.push(listener)
      return () => {
        const i = prefsListeners.indexOf(listener)
        if (i >= 0) prefsListeners.splice(i, 1)
      }
    }
    const prefsEmit = () => {
      for (const l of prefsListeners.slice()) { try { l() } catch (e) { /* keep going */ } }
      if (reconcileFromPrefs) try { reconcileFromPrefs() } catch (e) { /* keep going */ }
    }
    /* The FIRST authoritative section of a page load is a moment of its own: it is
       the instant the stored preferences become knowable at all. On a real page
       load the Host serves that section over the wire, so every read made while
       apply() runs — including the boot plate's — falls back to the schema
       defaults. A surface whose whole job happens at startup therefore cannot act
       on its apply()-time read; it hangs off this transition instead.

       Fires at most once per page load, and only AFTER the section has been
       resolved (prefsFieldValue assigned) and any legacy migration has run, so a
       hook reading prefsGet() sees final values rather than a half-applied
       snapshot. Deliberately not re-fired by later sections: a section that
       changes later is an ordinary runtime edit, not a page load. */
    const prefsMarkSettled = () => {
      if (prefsSettledOnce) return
      prefsSettledOnce = true
      if (onPrefsSettled) try { onPrefsSettled() } catch (e) { /* keep going */ }
    }
    const dbg = (...a) => { try { if (typeof console !== 'undefined' && console.warn) console.warn('[dsh-theme-endfield:prefs]', ...a) } catch (e) { /* noop */ } }

