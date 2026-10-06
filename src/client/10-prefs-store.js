    /* ---------- Durable preference store (replaces localStorage) ----------
       The theme's switches used to persist through `localStorage`, which DSH
       Desktop broke on every restart: Desktop binds a fresh random localhost
       port per launch, so the origin (and thus the browser storage scope)
       changed and the saved settings silently reset to defaults.

       The durable authority is DSH's own settings service, and DSH 0.1.7-rc.1
       moved it once more. The whole pre-0.1.7 seam — a host
       `ctx.settings.register(namespace, schema)` persisted by
       `@deepseek-ai/dsh-settings-file` to `<dshHome>/settings.yaml`, mirrored
       to the browser as the `ctx.settingsScope` service — is GONE: the package
       is not in the distribution any more, `settings.yaml` is not the settings
       carrier, and the client has no `settingsScope` service at all.

       What replaced it (see index.js for the host side):

         host    the plugin entry exports a schemastery `Config` whose fields
                 are `.volatile()`. `ctx.settings` projects it into a form and
                 persists user edits into the PROFILE PATCH
                 (<profile>/cordis.patch.yml) through `ctx.configEditor`,
                 i.e. a path owned by DSH and independent of the web origin.
         client  `ctx.get('configForms')` — the settings domain's shared-form
                 service — `.get(<profile entry id>)` returns that entry's
                 ConfigForm: getSnapshot() / subscribe() / set() / unset() /
                 mutate().

       The namespace is now the PROFILE ENTRY ID, not a plugin-chosen string:
       this package's cordis.patch.yml inserts `id: theme-endfield`, and
       index.js exports that same id as SETTINGS_ENTRY. Both halves still speak
       the old namespace string for the legacy fallback and as the prefix of
       every UI key in the tables below.

       Older hosts (<= 0.1.5-rc.2) keep the old seam, which this file still
       binds when no `configForms` service exists — see the transport-selection
       note further down. Either way the values live host-side, so:

         dsh web     (browser, fixed loopback port)  -> host persistence
         DSH Desktop (browser, random loopback port) -> host persistence

       Both are loopback pages, so DSH resolves the connection to 'host' mode
       and the values land on disk; a change of port does not move them because
       nothing lives in browser storage any more.

       Value model. Namespace fields are the tails of the old localStorage keys
       and are stored as the same strings, so the semantics (and any older
       <settings.yaml> section from a prior build) keep scanning identically:
         default-ON switches store  '1'  and read as  !== '0'
         default-OFF switches store '0'  and read as  === '1'
         palette/radius/fps/speed  store one of their documented literals.
       FIELD_DEFAULTS is the shipped fallback and mirrors index.js.

       Resilience. Before the transport hands us a section (boot), or in an
       environment with neither settings service at all (an out-of-DSH page,
       in-process tests), the store falls back to FIELD_DEFAULTS overlaid with
       any in-page overrides made this session. Writes are committed to the
       settings transport only when it is ready + writable; otherwise they are
       kept session-local so toggles still work in place but do not persist
       (there is no durable backend to persist to — and no localStorage). */
    /* DSH 0.1.7-rc.1 settings namespace: the profile entry id of this plugin's
       row (index.js SETTINGS_ENTRY, cordis.patch.yml `id: theme-endfield`).
       `configForms.get()` is keyed by exactly that string. */
    const PREFS_ENTRY = 'theme-endfield'
    /* Pre-0.1.7 namespace string. Still the prefix of every UI key in the
       tables below, and the namespace the legacy `settingsScope` bind asks
       for — so it stays even though the modern transport never uses it. */
    const PREFS_NS = 'dsh-theme-endfield'
    const PREFS_FIELD_DEFAULTS = {
      enabled: '1',
      palette: 'valley',
      radius: 'square',
      glass: 'off',
      contour: '0',
      contourAnim: '1',
      contourFps: '24',
      contourSpeed: '2',
      contourRenderer: 'canvas',
      contourScrollPause: '1',
      contourTrail: '0',
      watermark: '1',
      watermarkPersist: '0',
      loader: '0',
      thunder: '0',
      thunderAnim: '0',
      /* 顶部余额胶囊 — opt-in, like thunder: a fixed capsule at the top center
         of the frame showing the account balance, fed by the host-side
         /theme-endfield/balance route. Ships OFF so an upgrade never adds a
         floating element the user did not ask for. */
      balanceCapsule: '0',
      /* 渠道额度胶囊的右侧百分比读数选「已用」还是「剩余」——两个值都有真实语义，
         不存在默认就错的答案，所以默认 used（与插件自身徽章一致的读法）。
         仅影响 credits 模式的右侧百分比槽位；左侧主数字始终为剩余额度。 */
      creditDisplay: 'remaining',
      /* 音频通知 (host half: lib/audio.js). Two live slots — the prompt that
         starts a turn and the final answer that ends one. `audioAttention` and
         `audioTurnFail` are 预留: the sounds and switches ship, the triggers do
         not, and the settings rows say so.

         The MASTER switch ships OFF (opt-in), mirroring index.js FIELD_DEFAULTS
         and lib/audio.js FALLBACK: an install that upgrades into this feature
         must not start making noise by itself. The per-slot switches stay ON, so
         turning the master on is what starts the sound. */
      audioEnabled: '0',
      audioVolume: '100',
      audioBoot: '1',
      audioTurnStart: '1',
      audioTurnDone: '1',
      audioAttention: '1',
      audioTurnFail: '1',
      audioDebounceMs: '2500',
      audioSoundDir: '',
      audioHumanOnly: '1',
      audioDiag: '0',
    }
    /* Convert a namespaced storage key tail to the camelCase field the settings
       schema declares (index.js FIELD_DEFAULTS). A build that derived the field
       by stripping the namespace prefix instead left a compound name in its
       kebab-case spelling, so this conversion is also the read migration for any
       key the explicit table below does not list. */
    const prefsFieldFromKey = (rawKey) => {
      const prefix = PREFS_NS + '-'
      const tail = rawKey.indexOf(prefix) === 0 ? rawKey.slice(prefix.length) : rawKey
      return tail.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase())
    }
    /* Which schema field each UI/store key names. The left half is the key the
       theme's own code has always used (the localStorage-era name, which the
       settings rows, locales and tests all still speak); the right half is the
       field the HOST registered in its schema (index.js FIELD_DEFAULTS — the
       only names a scope.set can actually store).

       THEY ARE NOT THE SAME STRING for any compound field, and deriving one
       from the other by stripping the namespace prefix — the old
       `k.slice(PREFS_NS.length + 1)` — is the bug this table exists to kill: it
       turned 'dsh-theme-endfield-thunder-anim' into 'thunder-anim', while the
       schema declares 'thunderAnim'. Six fields were affected (thunderAnim,
       contourAnim, contourFps, contourSpeed, contourScrollPause,
       watermarkPersist): the write landed on an UNDECLARED key, schemastery
       kept it (it validates declared fields and passes extras through) but the
       declared field stayed at its default, so the switch worked for the page
       session, persisted junk into settings.yaml, and came back at its default
       on the next load. Hence "开关刷新后复位".

       Keys are therefore listed EXPLICITLY, never computed. */
    const PREFS_KEY_TO_FIELD = {
      'dsh-theme-endfield-enabled': 'enabled',
      'dsh-theme-endfield-palette': 'palette',
      'dsh-theme-endfield-radius': 'radius',
      'dsh-theme-endfield-glass': 'glass',
      'dsh-theme-endfield-contour': 'contour',
      'dsh-theme-endfield-contour-anim': 'contourAnim',
      'dsh-theme-endfield-contour-fps': 'contourFps',
      'dsh-theme-endfield-contour-speed': 'contourSpeed',
      'dsh-theme-endfield-contour-renderer': 'contourRenderer',
      /* The renderer row's own key is the BARE 'contourRenderer' (a
         localStorage-era name), not the namespaced spelling. It is listed
         explicitly because test/settings-namespace.test.js requires the table to
         cover every UI key the panel uses, and because the prefix-strip fallback
         turning 'contourRenderer' into 'contourrenderer' is exactly the class of
         silent mismatch this table exists to prevent. */
      contourRenderer: 'contourRenderer',
      'dsh-theme-endfield-contour-scroll-pause': 'contourScrollPause',
      'dsh-theme-endfield-contour-trail': 'contourTrail',
      'dsh-theme-endfield-watermark': 'watermark',
      'dsh-theme-endfield-watermark-persist': 'watermarkPersist',
      'dsh-theme-endfield-loader': 'loader',
      'dsh-theme-endfield-thunder': 'thunder',
      'dsh-theme-endfield-thunder-anim': 'thunderAnim',
      'dsh-theme-endfield-balance-capsule': 'balanceCapsule',
      'dsh-theme-endfield-credit-display': 'creditDisplay',
      /* 音频通知. These tails happen to equal their schema fields, so every one of
         them would also resolve correctly through the prefix-strip fallback — they
         are listed explicitly because test/settings-namespace.test.js asserts that
         EVERY declared host field has a mapping entry, and because "the mapping is
         the one place a UI key becomes a field" only holds if it is complete. */
      'dsh-theme-endfield-audio-enabled': 'audioEnabled',
      'dsh-theme-endfield-audio-volume': 'audioVolume',
      'dsh-theme-endfield-audio-boot': 'audioBoot',
      'dsh-theme-endfield-audio-turn-start': 'audioTurnStart',
      'dsh-theme-endfield-audio-turn-done': 'audioTurnDone',
      'dsh-theme-endfield-audio-attention': 'audioAttention',
      'dsh-theme-endfield-audio-turn-fail': 'audioTurnFail',
      'dsh-theme-endfield-audio-debounce-ms': 'audioDebounceMs',
      'dsh-theme-endfield-audio-sound-dir': 'audioSoundDir',
      'dsh-theme-endfield-audio-human-only': 'audioHumanOnly',
      'dsh-theme-endfield-audio-diag': 'audioDiag',
    }
    /* The pre-migration spelling of a compound field, for the sections that the
       buggy build already wrote: 'contourAnim' -> 'contour-anim'. Derived from
       the table (not from the schema, which cannot know it) so the two can never
       drift, and only for fields that really do have a distinct legacy double:
       every single-word field maps to itself and is skipped. */
    const PREFS_FIELD_TO_LEGACY_KEY = (() => {
      const m = {}
      for (const field of Object.keys(PREFS_KEY_TO_FIELD)) {
        const f = PREFS_KEY_TO_FIELD[field]
        const legacy = field.slice(PREFS_NS.length + 1)
        if (legacy !== f) m[f] = legacy
      }
      return m
    })()
    /* The single place a UI/store key turns into a schema field name: both the
       read path (prefsGet) and the write path (prefsSet/prefsCommit) go through
       it, so a switch can never read a field other than the one it writes. A key
       that is already a field name passes through, which is what the settings
       panel's own state and the tests use. */
    const prefsFieldOf = (rawKey) => {
      if (Object.prototype.hasOwnProperty.call(PREFS_KEY_TO_FIELD, rawKey)) return PREFS_KEY_TO_FIELD[rawKey]
      if (Object.prototype.hasOwnProperty.call(PREFS_FIELD_DEFAULTS, rawKey)) return rawKey
      /* Last resort: a key this table does not list. It is camelCased through
         prefsFieldFromKey rather than handed back as the raw tail, so a compound
         name reaching this path still lands on the camelCase field the host
         DECLARES instead of on an undeclared kebab key — which is precisely the
         failure mode the table above exists to prevent, and which a future
         compound row could otherwise reintroduce silently. */
      return prefsFieldFromKey(rawKey)
    }
