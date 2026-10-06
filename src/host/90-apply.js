
function apply(ctx, config) {
  /* Diagnostics, once per mount. Without a volatile Config this entry has no
     settings form, so the browser half reads and writes its preferences
     page-locally: every switch still works, and every switch is gone on the next
     reload. That is indistinguishable from "the theme is broken" unless the host
     says what happened — so it says it in the log AND leaves a readable report
     behind, because the reason is a property of this machine's install layout
     (see resolutionRoots) that no generic message can name. */
  if (Config === undefined) {
    reportMissingConfig(ctx);
  } else {
    clearStaleDiagnostic(ctx);
    // Which copy answered, at debug level: the one question that decides whether
    // a form exists at all, and otherwise invisible.
    try {
      if (ctx.logger && typeof ctx.logger.debug === 'function') ctx.logger.debug(NAME + ': Config built from ' + String(SCHEMA_SOURCE) + ' (volatile mode: ' + String(SCHEMA_MODE) + ')');
    } catch (e) { /* logging is never load-bearing */ }
  }

  /* The notification feature installs alongside the settings work below: which
     settings GENERATION answered does not matter to it. A host WITHOUT the
     inject capability starts the engine right here, on the shipped defaults; a
     host WITH it starts the engine when the settings service arrives — and if
     that service never appears, inject keeps waiting, so the engine (and the
     bridge mounted together with it) never comes up. No known DSH generation
     behaves that way. The guard keeps the two in-apply paths from installing
     two engines on one context. */
  // The balance capsule route mounts unconditionally: the page polls it only
  // when its own switch is on, so the route itself costs nothing at rest.
  try { registerBalanceBridge(ctx); } catch (e) { /* never load-bearing */ }

  let audioInstalled = false;
  const startAudio = (settingsScope) => {
    if (audioInstalled) return;
    audioInstalled = true;
    try {
      /* The legacy scope wins where a host hands one out; on 0.1.7 the live
         values are this plugin's own resolved Config (see configPrefScope). */
      installAudio(ctx, settingsScope === undefined ? configPrefScope(ctx, config) : settingsScope);
    } catch (error) {
      // The theme must keep working even if the notification feature cannot
      // install at all.
      console.error(`${LOG_TAG} install failed: ${error && error.message ? error.message : error}`);
    }
  };

  // Wait for the host settings service. Cordis `ctx.inject(['settings'], ...)`
  // WAITS for the service (same convention as @deepseek-ai/dsh-client-ui-theme,
  // dsh-agent-presets, …), so registration is reliable however concurrently
  // mounted plugins interleave; a synchronous `ctx.get('settings')` probe would
  // race and could see it absent.
  //
  // It is still only an ASK, and asking is what has to be feature-detected — the
  // webServer lookup above does. A context without `inject` used to throw here
  // and take the whole mount down; it now ends up on the same defaults-only
  // engine that a host with no settings service gets.
  if (typeof ctx.inject !== 'function') {
    startAudio(undefined);
    return;
  }
  ctx.inject(['settings'], (settingsCtx) => {
    if (!settingsCtx || !settingsCtx.settings) {
      startAudio(undefined);
      return;
    }
    const settings = settingsCtx.settings;

    /* DSH >= 0.1.7: page policy only.
       This plugin renders its own settings page (client.js registers a
       `settings.section` row with four groups and live previews), so the
       auto-generated Config page would be a second, poorer copy of it. An
       absent `autoGenerate:false` policy is what makes DSH add that page.
       Scoped to this plugin's fiber and disposed with the run. */
    if (typeof settings.configure === 'function') {
      try {
        settingsCtx.effect(() => settings.configure({ auto: false }, ctx.fiber));
      } catch (e) {
        // A policy may already be registered for this fiber (double mount);
        // the theme must still load.
      }
    }

    /* DSH <= 0.1.5-rc.2: the legacy namespace registration.
       Those hosts persisted a plugin-declared namespace to
       `<dshHome>/settings.yaml` and mirrored it to the browser through
       `ctx.settingsScope`, which the client half still binds when no
       `configForms` service exists. Feature-detected: on 0.1.7 `register` is
       gone and this branch is simply skipped — the Config above is the
       declaration instead. Its RETURN VALUE is also the only live preference
       scope those hosts expose, so it is what the audio runtime reads. */
    let scope;
    if (typeof settings.register === 'function') {
      const schema = buildSchema(false);
      if (schema !== undefined) {
        try {
          // Registration is scoped to this plugin's fiber and disposed with the run.
          scope = settings.register(LEGACY_NAMESPACE, schema, { applies: 'live' });
        } catch (e) {
          // A throw here must not kill the whole theme; leaving it unregistered
          // just means browser prefs stay page-local on that host generation.
        }
      }
    }
    startAudio(scope);
  });
}
