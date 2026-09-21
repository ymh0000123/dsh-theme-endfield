'use strict';
/**
 * dsh-theme-endfield — installed (bundle) HOST half.
 *
 * This module is the cordis plugin the loader mounts when the package is
 * installed through the official CLI:
 *
 *   dsh plugin --profile web add github:ymh0000123/dsh-theme-endfield
 *
 * The `dsh.bundle.patch` layer (cordis.patch.yml) inserts this package's row;
 * the loader requires this main entry and uses its `name` + `apply` exports.
 * The theme itself is pure client-side (browser): token overrides via the
 * `theme` service and a global stylesheet via the `styles` builtin, both
 * registered in the client half (`exports["./client"]` -> client.js).
 *
 * Host-side settings registration (menu: Settings › 终末地主题设置)
 * -------------------------------------------------------------------
 * The theme's preferences used to be kept in the browser's localStorage, which
 * is scoped to a single origin. DSH Desktop binds a fresh, random localhost
 * port on every launch, so a change of port changed the origin and the stored
 * settings silently reset to defaults on restart. The durable authority for
 * the theme's switches now lives with DSH's own user-settings service instead:
 *
 *   - This HOST half registers a persisted settings *namespace*
 *     (`dsh-theme-endfield`) through `ctx.settings.register(ns, schema)`, which
 *     `@deepseek-ai/dsh-settings-file` persists to the profile harness home
 *     (`~/.dsh/.../settings.yaml`). Path and persistence are decided by DSH
 *     itself and are completely independent of the web origin/port.
 *   - The CLIENT half (client.js) reads and writes that namespace through the
 *     browser `ctx.settingsScope` service, and live-reacts to changes via the
 *     scope's subscription. See the comments there for the client side.
 *
 * The namespace fields mirror exactly the setting keys, defaults and polarity
 * the theme has always shipped (see docs/features.md): default-ON switches
 * default to the string '1' and are read with `!== '0'`, default-OFF switches
 * default to '0' and are read with `=== '1'`. Choosing string-typed schema
 * fields keeps the wire section byte-for-byte equivalent to the old stored
 * values, so an existing <settings.yaml> section written by an older build of
 * this plugin would still validate and load without a migration step.
 *
 * `schemastery` is deliberately imported lazily and only from the host realm:
 * this package otherwise ships no runtime dependency beyond the optional
 * cordis peer, so the theme degrades to a no-op the same way it always did in
 * any profile that does not supply a settings service.
 *
 * Host-side audio notifications (optional)
 * -------------------------------------------------------------------
 * `lib/audio.js` plays the two (later: four) notification slots. It is wired
 * here because the host, not the page, is what survives a minimized window.
 * `subprocess` is probed at play time rather than declared in `inject`: a
 * profile without that seam must keep the theme fully working and simply stay
 * silent, not fail to load.
 */

const { AudioRuntime, PREF, FALLBACK: AUDIO_FALLBACK, LOG_TAG } = require('./lib/audio.js');

const NAME = 'dsh-theme-endfield';

/**
 * Settings namespace owned by this plugin, and schema defaults for every
 * field. Field names are the short tails of the original localStorage keys
 * (the `dsh-theme-endfield-` prefix is implied by the namespace). Keeping the
 * actual stored values as strings means old persisted values stay valid with
 * no migration.
 *
 * Default polarity (same rules as before, now enforced by the schema defaults
 * instead of by an "absent key" check, and documented in docs/features.md):
 *   - default-ON switches store '1' and the client reads them as `!== '0'`;
 *   - default-OFF switches store '0' and the client reads them as `=== '1'`;
 *   - palettes / radii / frame-rate / speed each store exactly one of their
 *     documented literals ('valley'/'wuling'; 'square'/'round'; fps in
 *     24/60/120; speed in 1/2/4), with the shipped default filled in here.
 */
const NAMESPACE = 'dsh-theme-endfield';
const FIELD_DEFAULTS = {
  enabled: '1',             // 终末地主题 —— default on
  palette: 'valley',        // 主题配色 —— 谷地黄 (walley default)
  radius: 'square',         // 主题圆角 —— 直角
  contour: '0',             // 等高线背景 —— default off
  contourAnim: '1',         // 动态等高线 —— default on
  contourFps: '24',         // 动态帧率 —— 24 FPS
  contourSpeed: '2',        // 动态速度 —— 标准 2x
  /* The contour renderer switch existed in the client (and in the schema's
     spirit) but was never DECLARED here, so it lived only in the page: the
     setting page wrote it and the host stored it as a passthrough extra. Declared
     now so the namespace documents every field the panel offers — and because
     test/settings-namespace.test.js requires a declared field for every mapped
     row. 'canvas' is the shipped default; 'worker-webgl' is the opt-in. */
  contourRenderer: 'canvas', // 等高线绘制 —— canvas / worker-webgl
  contourScrollPause: '1',  // 滚动暂停 —— default on
  watermark: '1',           // 背景水印 —— default on
  watermarkPersist: '0',    // 水印保持显示 —— default off
  loader: '0',              // 启动加载动画 —— default off
  thunder: '0',             // 雷霆大字 —— default off
  thunderAnim: '0',         // 大字入场动画 —— default off
  // --- 音频通知 ---------------------------------------------------------
  // Two slots only: the prompt that starts a turn, and the final answer that
  // ends one. `attention` / `turn-fail` exist as sounds and switches but are
  // not wired to events yet, so a switch that does nothing cannot surprise
  // anyone: the settings page labels them 预留.
  audioEnabled: '1',        // 音频通知总开关 —— default on
  audioVolume: '100',        // 音量 0-100 —— rescaled PCM, not system volume
  audioTurnStart: '1',      // 任务开始音 —— 会话框提交后播放
  audioTurnDone: '1',       // 任务结束音 —— 最终结果产出后播放
  audioAttention: '1',      // (预留) 需要你回应
  audioTurnFail: '1',       // (预留) 出错
  audioDebounceMs: '2500',  // 同一槽位最小间隔
  audioSoundDir: '',        // 自定义音效目录，留空则用工作区/桌面/内置
  audioHumanOnly: '1',      // 开始音只认会话框提交（带 rpcId 的用户消息）
  audioDiag: '0',           // 诊断日志 —— 记录事件与判定结果
};

/* Resolve a Schemastery namespace builder lazily.
   1) Published profile installs put schemastery / @deepseek-ai/schemastery on
      this package's OWN require path (real bundles like dsh-better-sidebar do
      `import z from "schemastery"` and it resolves). Those are covered by the
      first two tries below.
   2) A DEV-LINK bundle (this repo symlinked into the profile's node_modules,
      e.g. `"dsh-theme-endfield": "link:E:/..."`) does NOT: its files resolve
      from the repo path, where no schemastery lives — so bare/scoped require
      throws MODULE_NOT_FOUND and (with the old loader) registration silently
      would never happen (the "settings won't save" symptom). So when those
      requires miss we additionally DISCOVER the builder from the DSH module
      roots that physically exist on disk.
   Kept guarded throughout: a profile with no schemastery anywhere degrades to
   a no-op rather than crashing the host half. */
function loadSchemastery() {
  let found = null;
  // 1) conventional require-path placement
  for (const spec of ['@deepseek-ai/schemastery', 'schemastery']) {
    try { found = require(spec); break; } catch (e) { found = null; }
  }
  // 2) DEV-LINK fallback: scan the DSH module roots that actually exist.
  if (found === null || found === undefined) {
    try {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const dshHome = (typeof process !== 'undefined' && process.env && process.env.DSH_HOME)
        || path.join(typeof os.homedir === 'function' ? os.homedir() : '', '.dsh');
      const roots = [];
      // per-profile node_modules, then the shared profiles-level node_modules
      for (const p of [
        path.join(dshHome, 'profiles', 'node_modules', '@deepseek-ai', 'schemastery'),
        path.join(dshHome, 'profiles', 'node_modules', 'schemastery'),
      ]) roots.push(p);
      const profileDir = path.join(dshHome, 'profiles');
      if (fs.existsSync(profileDir)) {
        for (const name of fs.readdirSync(profileDir)) {
          roots.push(path.join(profileDir, name, 'node_modules', '@deepseek-ai', 'schemastery'));
          roots.push(path.join(profileDir, name, 'node_modules', 'schemastery'));
        }
      }
      for (const p of roots) {
        if (!p) continue;
        try { if (fs.existsSync(path.join(p, 'package.json'))) { found = require(p); if (found) break; } }
        catch (e) { found = null; }
      }
    } catch (e) { /* ignore discovery errors */ }
  }
  // Normalize a CJS default-export wrapper to a plain { string, object } API.
  if (found && found.default && !found.object && found.default.object && found.default.string) {
    found = { string: (v) => found.default.string(v), object: (o) => found.default.object(o) };
  }
  return (found && typeof found.object === 'function' && typeof found.string === 'function') ? found : undefined;
}

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

  // Reserved triggers: the slots and switches ship now, the events later.
  ctx.on('approval/request', (request, next) => {
    if (audio.diagnosing) audio.note('approval/request', String(request === undefined ? '' : request.kind || ''));
    if (audio.enabled(PREF.attention)) audio.play('attention', { reason: 'approval request' });
    return typeof next === 'function' ? next() : undefined;
  });

  ctx.on('user-questions/request', (request, next) => {
    if (audio.diagnosing) audio.note('user-questions/request', 'pending question');
    if (audio.enabled(PREF.attention)) audio.play('attention', { reason: 'user question' });
    return typeof next === 'function' ? next() : undefined;
  });

  ctx.on('agent/error', ({ agent }) => {
    if (!isRootAgent(agent)) return;
    if (audio.enabled(PREF.fail)) audio.play('turn-fail', { reason: 'turn error' });
  });

  ctx.on('agent/turn-stopping', ({ agent, turn }) => {
    if (!isRootAgent(agent)) return;
    if (!audio.enabled(PREF.done)) return;
    const key = turnKey(agent, turn);
    const hadText = terminals.get(key) === true;
    terminals.delete(key);
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
          const pathname = String(req.url || '').split('?')[0];
          try {
            if (req.method === 'GET' && pathname === '/theme-endfield/audio/state') {
              return send(res, 200, audio.snapshot());
            }
            if (req.method === 'POST' && pathname === '/theme-endfield/audio/preview') {
              const body = await readJson(req);
              const result = audio.play(String(body.slot || ''), { force: true, reason: 'settings preview' });
              return send(res, result.played ? 200 : 409, Object.assign({ slot: body.slot }, result));
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

function apply(ctx) {
  // Register the durable namespace the moment the Host settings service stands.
  //
  // Deliberately NO early `ctx.get('settings')` bail here: mounting plugins run
  // concurrently and the settings service can legitimately settle AFTER this
  // apply() — a synchronous probe at that instant would see it absent and make
  // us `return`, so the namespace would never be registered and browser writes
  // would hit a scope that reports `status:'unavailable'` (settings "won't
  // save"). Cordis `ctx.inject(['settings'], ...)` instead WAITS for the service
  // (same convention as @deepseek-ai/dsh-client-ui-theme, dsh-client-locale,
  // dsh-agent-presets, …), so registration is reliable however they interleave.
  let audioInstalled = false;
  const startAudio = (settingsScope) => {
    if (audioInstalled) return;
    audioInstalled = true;
    try {
      installAudio(ctx, settingsScope);
    } catch (error) {
      // The theme must keep working even if the notification feature cannot
      // install at all.
      console.error(`${LOG_TAG} install failed: ${error && error.message ? error.message : error}`);
    }
  };

  ctx.inject(['settings'], (settingsCtx) => {
    if (!settingsCtx || !settingsCtx.settings) {
      startAudio(undefined);
      return;
    }
    // Registration requires a Schemastery schema. Resolve lazily (only now, when
    // the host settings service is real); a profile with no schema builder keeps
    // the theme a no-op instead of crashing on require.
    const z = loadSchemastery();
    if (z === undefined || typeof z.object !== 'function' || typeof z.string !== 'function') {
      startAudio(undefined);
      return;
    }
    const fields = {};
    for (const [field, fallback] of Object.entries(FIELD_DEFAULTS)) {
      fields[field] = z.string().default(fallback);
    }
    const schema = z.object(fields);
    let scope;
    try {
      // Registration is scoped to this plugin's fiber and disposed with the run.
      scope = settingsCtx.settings.register(NAMESPACE, schema, { applies: 'live' });
    } catch (e) {
      // A throw here must not kill the whole theme; leaving it unregistered just
      // means browser prefs stay page-local (no durable document to write to).
      scope = undefined;
    }
    startAudio(scope);
  });
}

module.exports = {
  name: NAME,
  apply,
  // Exposed for tests/documentation.
  NAMESPACE,
  FIELD_DEFAULTS,
  AUDIO_PREF_DEFAULTS: AUDIO_FALLBACK,
  classifyPrompt,
  hasVisibleText,
  installAudio,
};
