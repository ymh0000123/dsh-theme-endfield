    /* ---------- 音频通知 preferences (host half owns playback) ----------
       The browser's whole job here is switches, a volume number and the preview
       buttons; every sound is played by the host process, including the previews
       (that is the point: the preview must go through the same path as a real
       notification, or testing it proves nothing). The keys below pass through
       prefsFieldOf unchanged and equal the schema field names, so a switch can
       never write an undeclared field. */
    const AUDIO_ENABLED_KEY = 'audioEnabled'
    const AUDIO_BOOT_KEY = 'audioBoot'
    const AUDIO_TURN_START_KEY = 'audioTurnStart'
    const AUDIO_TURN_DONE_KEY = 'audioTurnDone'
    const AUDIO_VOLUME_KEY = 'audioVolume'
    const AUDIO_HUMAN_ONLY_KEY = 'audioHumanOnly'
    const AUDIO_DIAG_KEY = 'audioDiag'
    const AUDIO_SOUND_DIR_KEY = 'audioSoundDir'
    const AUDIO_STATE_URL = '/theme-endfield/audio/state'
    const AUDIO_PREVIEW_URL = '/theme-endfield/audio/preview'
    const AUDIO_ATTENTION_URL = '/theme-endfield/audio/attention'
    /* ---------- 顶部余额胶囊 (host half owns the balance query) ----------
       The page cannot reach the account service itself — only Host consumers
       can obtain the request credential — so the capsule polls the host-side
       route below and renders whatever it returns. */
    const BALANCE_URL = '/theme-endfield/balance'
    const BALANCE_POLL_MS = 60000
    // The pricing window ticks every second (countdown to the next edge).
    const BALANCE_TICK_MS = 1000
    // The capsule opens as the brand panel and collapses into the balance row
    // once the first account answer lands (success or failure — an offline host
    // must not leave the brand pose up forever). MIN keeps the brand readable on
    // a fast network; MAX is the cap when nothing ever answers.
    const BALANCE_BOOT_MIN_MS = 900
    const BALANCE_BOOT_MAX_MS = 5000
    /* ---------- 渠道额度 (dsh-codearts-auth / jet-hub) ----------
       When the session's model directory names one of the providers the
       dsh-codearts-auth plugin serves, the capsule swaps the DeepSeek wallet
       read for that channel's remaining credits. The numbers come over the
       same management RPC the plugin's own client uses —
       connection.rpc.call('/api', 'jet-hub', { method: 'usage.badge', ... }) —
       so session credentials and the host-side badge cache (TTL 120s, failure
       TTL 15s) come for free; the page only ever names the provider.
       The id table IS the plugin's contract: usage.badge answers for these
       twelve, and anything else — notably the built-in DeepSeek models — keeps
       the wallet display, so an absent plugin can never blank the capsule. */
    const JET_HUB_RPC_SCOPE = '/api'
    const JET_HUB_RPC_CHANNEL = 'jet-hub'
    const JET_HUB_PROVIDER_LABELS = {
      codearts: 'CodeArts',
      buddy: 'CodeBuddy',
      workbuddy: 'WorkBuddy',
      lobsterai: 'LobsterAI',
      qoder: 'Qoder',
      qodercn: 'Qoder CN',
      trae: 'TRAE',
      cline: 'Cline',
      loomy: 'Loomy',
      raccoon: 'Raccoon',
      minimax: 'MiniMax',
      zcode: 'ZCode',
      opencode: 'OpenCode',
    }
    // Default ON for the master switch and both live slots; default OFF for the
    // diagnostics switch, so the host console stays quiet unless asked.
    const isAudioOn = () => prefsGet(AUDIO_ENABLED_KEY) !== '0'
    const isAudioBootOn = () => prefsGet(AUDIO_BOOT_KEY) !== '0'
    const isAudioStartOn = () => prefsGet(AUDIO_TURN_START_KEY) !== '0'
    const isAudioDoneOn = () => prefsGet(AUDIO_TURN_DONE_KEY) !== '0'
    const isAudioHumanOnly = () => prefsGet(AUDIO_HUMAN_ONLY_KEY) !== '0'
    const isAudioDiagOn = () => prefsGet(AUDIO_DIAG_KEY) === '1'
    const readAudioVolume = () => {
      const parsed = Number.parseInt(prefsGet(AUDIO_VOLUME_KEY), 10)
      return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 100
    }
    const readAudioSoundDir = () => prefsGet(AUDIO_SOUND_DIR_KEY) || ''
    /** Ask the host to play one slot through the real notification path. */
    const previewSlot = (slot) => {
      if (typeof fetch !== 'function') return Promise.resolve({ played: false, why: 'no fetch' })
      return fetch(AUDIO_PREVIEW_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot }),
      }).then(
        (res) => res.json().catch(() => ({ played: false, why: 'bad response' })),
        (error) => ({ played: false, why: String(error && error.message ? error.message : error) }),
      )
    }
