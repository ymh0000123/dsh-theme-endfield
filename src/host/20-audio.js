
/* ------------------------------------------------------------------ *
 * Audio notification host half
 * ------------------------------------------------------------------ */

/** Read a service off the context without letting a missing one throw. */
function serviceOf(ctx, key) {
  try {
    return ctx.get(key);
  } catch (error) {
    return undefined;
  }
}

/**
 * Whether one inbox message is a prompt the USER typed into the composer.
 *
 * The only positive evidence available at this seam is the prompt-RPC identity
 * that DSH attaches to a browser-submitted prompt: `source = { kind: 'user',
 * rpcId }` (`dsh-api-session-controller`, where `promptRpcId()` reads exactly
 * that field). Everything that injects work programmatically — goal rounds,
 * background-job wakeups, subagent hand-offs, plugin context — produces
 * `kind: 'user'` too, or a `next-step` context message, so "has rpcId" is the
 * discriminator; with `humanOnly` off, the looser `kind: 'user'` test applies.
 *
 * @param message - the claimed inbox message.
 * @param humanOnly - whether to require the composer identity.
 * @returns `{ human, why }` for diagnostics.
 */
function classifyPrompt(message, humanOnly) {
  const source = message === undefined || message === null ? undefined : message.source;
  if (source === undefined || source === null) return { human: false, why: 'no source' };
  const kind = source.kind;
  const hasRpcId = typeof source.rpcId === 'string' && source.rpcId !== '';
  if (hasRpcId) return { human: true, why: 'composer prompt (rpcId)' };
  if (kind === 'user' && !humanOnly) return { human: true, why: 'user-source message (humanOnly off)' };
  return { human: false, why: `source.kind=${String(kind)} without rpcId` };
}

/** Whether one assistant message carried visible text (as opposed to only calls). */
function hasVisibleText(message) {
  if (message === undefined || message === null) return false;
  const content = Array.isArray(message.content) ? message.content : [];
  for (const block of content) {
    if (block === null || block === undefined) continue;
    if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') return true;
  }
  return false;
}

/**
 * Install the notification feature on one host context.
 *
 * @param ctx - host Cordis context.
 * @param settingsScope - the registered settings scope, when one exists.
 */
function installAudio(ctx, settingsScope) {
  const audio = new AudioRuntime(ctx);
  const terminals = new Map(); // `${sessionId}:${turn}` -> saw a text answer
  const playedDone = new Set(); // turn keys already reported, so a turn speaks once
  /** How many human-intervention requests actually reached this host half.
      `ui` counts confirmations the PAGE observed and reported — the path that
      actually works in this deployment; `approval`/`question` count the host-side
      seams, which a different composition may drive instead. */
  const attentionSeen = { approval: 0, question: 0, ui: 0, uiLastAt: 0, uiLastKind: '' };

  if (settingsScope !== undefined) {
    try {
      audio.setValues(settingsScope.get());
      settingsScope.watch(() => {
        audio.setValues(settingsScope.get());
      });
    } catch (error) {
      audio.note('settings-unavailable', String(error && error.message ? error.message : error));
    }
  }

  /** Whether one agent is a top-level conversation (never a subagent). */
  const isRootAgent = (agent) => {
    if (agent === undefined || agent === null) return false;
    const agents = serviceOf(ctx, 'agents');
    if (agents === undefined || typeof agents.roots !== 'function') return true; // cannot tell: stay permissive
    try {
      return agents.roots().some((candidate) => candidate === agent || candidate?.id === agent.id);
    } catch (error) {
      return true;
    }
  };

  const turnKey = (agent, turn) => `${agent === undefined ? '?' : agent.id}:${turn}`;

  // --- event wiring --------------------------------------------------
  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    if (!isRootAgent(agent)) return;
    const verdict = classifyPrompt(message, audio.enabled(PREF.humanOnly));
    if (audio.diagnosing) {
      audio.note('inbox/claimed', `turn=${turn} -> ${verdict.why}`);
    }
    if (!verdict.human) return;
    if (!audio.enabled(PREF.start)) return;
    audio.play('turn-start', { reason: 'human prompt' });
  });

  ctx.on('session/event', (subject, event) => {
    if (event === null || event === undefined) return;
    if (event.type !== 'assistant/message') return;
    const data = event.data;
    if (data === null || data === undefined) return;
    const sessionId = subject !== null && subject !== undefined && subject.id !== undefined ? subject.id : '?';
    const key = `${sessionId}:${data.turn}`;
    if (hasVisibleText(data.message)) terminals.set(key, true);
    else if (!terminals.has(key)) terminals.set(key, false);
  });

  /* The two "a human has to do something" triggers, and the ONLY things that
     sound besides the boot plate and a finished answer.

     A turn that fails on its own is deliberately NOT one of them: the user's
     rule is that an error needing no human decision should stay silent, so
     `agent/error` is not wired to any slot. The `turn-fail` sound still ships
     and can still be previewed, but nothing fires it.

     Each handler keeps a counter so the settings bridge can answer "did the host
     actually receive this request?" — the failure mode where the event exists
     but never reaches a host listener is otherwise invisible from the outside. */
  ctx.on('approval/request', (request, next) => {
    attentionSeen.approval += 1;
    if (audio.diagnosing) audio.note('approval/request', String(request === undefined ? '' : request.kind || ''));
    if (audio.enabled(PREF.attention)) {
      /* This event is a waterfall: play() must never be allowed to throw past
         next(), or the whole approval chain dies exactly the way the
         tools/execute note below describes. play() itself guards its file
         parsing, so this is the belt to that brace. */
      try { audio.play('attention', { reason: 'approval request' }); }
      catch (error) { audio.note('play-threw', `approval/request: ${error && error.message ? error.message : error}`); }
    }
    return typeof next === 'function' ? next() : undefined;
  });

  ctx.on('user-questions/request', (request, next) => {
    attentionSeen.question += 1;
    if (audio.diagnosing) audio.note('user-questions/request', 'pending question');
    if (audio.enabled(PREF.attention)) {
      // Same waterfall contract as approval/request above.
      try { audio.play('attention', { reason: 'user question' }); }
      catch (error) { audio.note('play-threw', `user-questions/request: ${error && error.message ? error.message : error}`); }
    }
    return typeof next === 'function' ? next() : undefined;
  });

  /* There is deliberately NO `tools/execute` handler here.

     An earlier version added one as a redundant second trigger for
     `ask_user_question`. It was wrong and it was destructive: `tools/execute` is
     a WATERFALL (`dsh-tools`: `await this.ctx.waterfall(carrier, 'tools/execute',
     mutableExec, () => this.dispatchToolBody(mutableExec))`), so a listener that
     inspects the call and returns `undefined` without calling `next()` reports
     "no result" for that tool — the tool never runs and the failure surfaces on
     every subsequent call in the session (observed as every tool returning
     `Cannot read properties of undefined (reading 'isError')` while this plugin
     was mounted, and the tool chain recovering the moment it was removed).

     The attention slot does not need it: `approval/request` and
     `user-questions/request` are the two moments that need a human, and both are
     already wired above to the same slot. A redundant path is not worth a seam
     that can silently break every tool in the profile. */

  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    const key = turnKey(agent, turn);
    /* Cleanup runs BEFORE the switches below. Both early returns used to sit in
       front of the delete, which leaked entries two ways: subagent turns fail
       isRootAgent yet are recorded by the session/event handler above, and a
       user who turned the done sound off stopped reaping anything at all. */
    const hadText = terminals.get(key) === true;
    terminals.delete(key);
    if (!isRootAgent(agent)) return;
    if (!audio.enabled(PREF.done)) return;
    // One report per turn, and only for a turn that actually produced a written
    // result: a turn the user interrupted, or one that stopped on an approval
    // prompt, has nothing to announce.
    if (!hadText) {
      if (audio.diagnosing) audio.note('turn-stopping', `turn=${turn} no final text -> silent`);
      return;
    }
    if (playedDone.has(key)) return;
    playedDone.add(key);
    if (playedDone.size > 64) playedDone.delete(playedDone.values().next().value);
    audio.play('turn-done', { reason: 'final answer' });
  });

  // --- settings-page bridge (preview + diagnostics) -------------------
  const registerBridge = (webServer) => {
    if (webServer === undefined || typeof webServer.register !== 'function') {
      audio.note('bridge-unavailable', 'webServer service absent; preview buttons disabled');
      return;
    }
    const readJson = (req) => new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 65536) body = body.slice(0, 65536);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(body === '' ? '{}' : body)); } catch (error) { resolve({}); }
      });
      req.on('error', () => resolve({}));
    });
    const send = (res, code, payload) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(payload));
    };
    try {
      webServer.register({
        kind: 'prefix',
        path: '/theme-endfield/audio',
        handler: async (req, res) => {
          const url = String(req.url || '');
          const pathname = url.split('?')[0];
          const query = url.includes('?') ? new URLSearchParams(url.slice(url.indexOf('?') + 1)) : new URLSearchParams();
          /* Both preview routes force the play (bypassing the debounce window),
             because a preview that silently does nothing is indistinguishable
             from a broken feature. The GET form takes the slot in the query
             string so a non-JS caller can trigger the same play; neither route
             is a new capability — both end in audio.play() under the user's own
             settings, and the Host web server already authenticates the page. */
          const playForPreview = (slotId, reason) => {
            const id = String(slotId || '');
            // The slot's own switch is authoritative even for a preview: playing a
            // sound the user switched off would make the switch look broken.
            if (SLOT_IDS.includes(id) && !audio.slotEnabled(id)) {
              return { slot: id, played: false, why: `slot switch "${id}" is off` };
            }
            const result = audio.play(id, { force: true, reason });
            return Object.assign({ slot: id }, result);
          };
          try {
            if (req.method === 'GET' && pathname === '/theme-endfield/audio/state') {
              // `attention` rides along so a caller can tell "the host never got
              // the request" apart from "the host got it and chose to stay
              // silent" — the two look identical from the page otherwise.
              return send(res, 200, Object.assign(audio.snapshot(), { attention: Object.assign({}, attentionSeen) }));
            }
            if (req.method === 'GET' && pathname === '/theme-endfield/audio/preview') {
              const result = playForPreview(query.get('slot'), 'preview (GET)');
              return send(res, result.played ? 200 : 409, result);
            }
            if (req.method === 'POST' && pathname === '/theme-endfield/audio/preview') {
              const body = await readJson(req);
              const result = playForPreview(body.slot, 'settings preview');
              return send(res, result.played ? 200 : 409, result);
            }
            /* The page reports "a confirmation box is on screen".

               This route exists because the two host-side seams that would
               normally carry this moment (`approval/request`,
               `user-questions/request`) do not fire in every composition: in this
               deployment `ask_user_question` is provided OUTSIDE the profile's
               plugin stack, so `dsh-tool-ask-user` never runs and the waterfall is
               never raised — measured directly as a zero counter while a question
               was on screen. The UI is the one place the moment is always real.

               It deliberately does NOT force: unlike a settings preview, a real
               notification must respect the switch, the volume and the per-slot
               debounce, all of which stay owned by the host. `force` is what makes
               a preview bypass the window, and reusing it here would let two rapid
               boxes beep twice because the browser holds no shared clock. */
            if (req.method === 'POST' && pathname === '/theme-endfield/audio/attention') {
              const body = await readJson(req);
              attentionSeen.ui += 1;
              attentionSeen.uiLastAt = Date.now();
              attentionSeen.uiLastKind = String(body.kind || 'pending');
              if (audio.diagnosing) audio.note('attention (page)', `saw ${attentionSeen.uiLastKind}`);
              if (!audio.slotEnabled('attention')) {
                return send(res, 409, { played: false, why: 'slot switch "attention" is off' });
              }
              const result = audio.play('attention', { reason: `page: ${attentionSeen.uiLastKind}` });
              return send(res, result.played ? 200 : 409, result);
            }
            return send(res, 404, { error: 'not found' });
          } catch (error) {
            return send(res, 500, { error: String(error && error.message ? error.message : error) });
          }
        },
      });
      audio.note('bridge', 'settings bridge mounted at /theme-endfield/audio');
    } catch (error) {
      audio.note('bridge-failed', String(error && error.message ? error.message : error));
    }
  };
  const webServerNow = serviceOf(ctx, 'webServer');
  if (webServerNow !== undefined) registerBridge(webServerNow);
  else if (typeof ctx.inject === 'function') ctx.inject(['webServer'], (scope) => registerBridge(scope.webServer));

  console.log(`${LOG_TAG} ready (host half)`);
  return audio;
}
