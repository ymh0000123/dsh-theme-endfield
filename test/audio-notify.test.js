'use strict';
/**
 * Audio notification — host-half behaviour.
 *
 * The feature's whole risk is misfiring: a sound that plays when it should not
 * is worse than no sound at all, and every judgement it makes is invisible on
 * screen. So this suite pins the three decisions that can go wrong, plus the
 * audio plumbing they feed:
 *
 *   1. WHICH prompt counts as "the user typed this" (classifyPrompt);
 *   2. WHICH finished turn counts as "a final result" (hasVisibleText);
 *   3. WHAT the wiring actually plays for a given event sequence — asserted by
 *      recording real `subprocess.spawn` calls through a fake host context,
 *      including the cases that must stay SILENT.
 *
 * Usage: node test/audio-notify.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const host = require(path.join(ROOT, 'index.js'));
const { AudioRuntime, PREF } = require(path.join(ROOT, 'lib', 'audio.js'));
const { renderWav, scaleWavVolume, parseWav } = require(path.join(ROOT, 'lib', 'tone.js'));
const { SLOTS, SLOT_IDS } = require(path.join(ROOT, 'lib', 'slots.js'));

let failures = 0;
const fail = (m) => { console.error('FAIL  ' + m); failures += 1; };
const pass = (m) => console.log('ok    ' + m);
const check = (condition, message) => { if (condition) pass(message); else fail(message); };

/* ------------------------------------------------------------------ *
 * 1. Prompt classification
 * ------------------------------------------------------------------ */

const composerPrompt = { content: [{ type: 'text', text: 'hi' }], source: { kind: 'user', rpcId: 'rpc-1' } };
const bareUserMessage = { content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } };
const pluginContext = { content: [{ type: 'text', text: 'ctx' }], source: { kind: 'plugin', plugin: 'x' } };
const jobWake = { content: [{ type: 'text', text: 'job done' }], source: { kind: 'user', jobId: 'j1' } };

check(host.classifyPrompt(composerPrompt, true).human === true,
  'a composer prompt (source.kind=user + rpcId) counts as human');
check(host.classifyPrompt(bareUserMessage, true).human === false,
  'a user-source message WITHOUT rpcId is refused while humanOnly is on');
check(host.classifyPrompt(bareUserMessage, false).human === true,
  'the same message is accepted when humanOnly is off (loose mode)');
check(host.classifyPrompt(pluginContext, true).human === false,
  'plugin-injected context is never human');
check(host.classifyPrompt(pluginContext, false).human === false,
  'plugin-injected context stays non-human even in loose mode');
check(host.classifyPrompt(jobWake, true).human === false,
  'a background-job wakeup is not human');
check(host.classifyPrompt(undefined, true).human === false,
  'a message with no source at all is not human');

/* ------------------------------------------------------------------ *
 * 2. "Final result" detection
 * ------------------------------------------------------------------ */

const textBlock = { type: 'text', text: 'done' };
const emptyText = { type: 'text', text: '   ' };
const toolCall = { type: 'tool-call', name: 'read' };

check(host.hasVisibleText({ content: [textBlock] }) === true,
  'an assistant message with visible text counts as a final result');
check(host.hasVisibleText({ content: [toolCall] }) === false,
  'a tool-call-only assistant message is not a final result');
check(host.hasVisibleText({ content: [emptyText] }) === false,
  'whitespace-only text is not a final result');
check(host.hasVisibleText({ content: [textBlock, toolCall] }) === true,
  'text alongside a tool call still counts (the turn spoke to the user)');
check(host.hasVisibleText({ content: [] }) === false, 'an empty message is not a final result');
check(host.hasVisibleText(undefined) === false, 'a missing message is not a final result');

/* ------------------------------------------------------------------ *
 * 3. Sound generation and volume scaling
 * ------------------------------------------------------------------ */

const tone = renderWav(SLOTS['turn-done']);
const parsed = parseWav(tone);
check(parsed !== undefined && parsed.bitsPerSample === 16,
  'the synthesized slot is a 16-bit PCM WAV');
check(tone.length === 44 + Math.floor(44100 * SLOTS['turn-done'].duration) * 2,
  'the WAV length matches the declared duration');

const scaled = scaleWavVolume(tone, 50);
check(scaled.length === tone.length, 'volume scaling preserves the byte length');
const half = parseWav(scaled);
check(half !== undefined && half.dataOffset === parsed.dataOffset,
  'volume scaling keeps the data offset (header untouched)');
let sourcePeak = 0;
let scaledPeak = 0;
for (let i = 0; i + 1 < parsed.dataSize; i += 2) {
  sourcePeak = Math.max(sourcePeak, Math.abs(tone.readInt16LE(parsed.dataOffset + i)));
  scaledPeak = Math.max(scaledPeak, Math.abs(scaled.readInt16LE(half.dataOffset + i)));
}
check(scaledPeak > 0 && scaledPeak < sourcePeak * 0.6,
  `50% volume roughly halves the peak (${sourcePeak} -> ${scaledPeak})`);
check(scaleWavVolume(tone, 100) === tone, '100% volume is a no-op that returns the same buffer');

for (const id of SLOT_IDS) {
  const bundled = path.join(ROOT, 'sounds', `${id}.wav`);
  if (!fs.existsSync(bundled)) { fail(`bundled sound ${id}.wav is missing`); continue; }
  const bytes = fs.readFileSync(bundled);
  const same = bytes.equals(renderWav(SLOTS[id]));
  check(same, `bundled sounds/${id}.wav matches its slot definition`);
}

/* ------------------------------------------------------------------ *
 * 4. Wiring: what actually plays for an event sequence
 * ------------------------------------------------------------------ */

/** A fake host context recording spawns, with an in-memory settings section. */
function makeHost(initial) {
  const spawns = [];
  const listeners = new Map();
  const section = Object.assign({}, host.FIELD_DEFAULTS, initial || {});
  const scope = {
    get: () => Object.assign({}, section),
    watch: () => () => {},
    update: () => undefined,
  };
  const ctx = {
    get(name) {
      if (name === 'subprocess') {
        return {
          spawn(options) {
            spawns.push(options);
            return { done: Promise.resolve({ code: 0 }) };
          },
        };
      }
      if (name === 'agents') return { roots: () => roots };
      if (name === 'workspace') return { root: () => ROOT };
      return undefined;
    },
    on(name, listener) {
      const list = listeners.get(name) || [];
      list.push(listener);
      listeners.set(name, list);
      return () => {};
    },
    inject() { return () => {}; },
  };
  const roots = [];
  const emit = (name, ...args) => {
    for (const listener of listeners.get(name) || []) {
      const result = listener(...args);
      if (typeof result === 'function') result();
    }
  };
  return { ctx, scope, spawns, emit, roots, section };
}

/** Wait for the fire-and-forget play path to settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

(async () => {
  const rootAgent = { id: 'session-1' };
  const childAgent = { id: 'subagent-1' };

  // --- the two live slots ---
  {
    const h = makeHost();
    h.roots.push(rootAgent);
    host.installAudio(h.ctx, h.scope);
    h.emit('agent/inbox/claimed', { agent: rootAgent, message: composerPrompt, turn: 1 });
    await settle();
    check(h.spawns.length === 1, 'a composer prompt plays the start sound');

    // A programmatic wakeup on the same seam must not.
    h.emit('agent/inbox/claimed', { agent: rootAgent, message: jobWake, turn: 2 });
    await settle();
    check(h.spawns.length === 1, 'a background wakeup does not play the start sound');

    // A subagent's prompt must not either.
    h.emit('agent/inbox/claimed', { agent: childAgent, message: composerPrompt, turn: 1 });
    await settle();
    check(h.spawns.length === 1, 'a subagent prompt does not play the start sound');
  }

  // --- final result, and the cases that must stay silent ---
  {
    const h = makeHost();
    h.roots.push(rootAgent);
    host.installAudio(h.ctx, h.scope);

    const session = { id: 'session-1' };
    h.emit('session/event', session, { type: 'assistant/message', data: { turn: 5, message: { content: [textBlock] } } });
    h.emit('agent/turn-stopping', { agent: rootAgent, turn: 5 });
    await settle();
    check(h.spawns.length === 1, 'a turn that produced text plays the end sound');

    // Same turn again: one sound per turn.
    h.emit('agent/turn-stopping', { agent: rootAgent, turn: 5 });
    await settle();
    check(h.spawns.length === 1, 'a turn never reports itself twice');

    // Tool-only turn (no final text) stays silent — this is the "you are not
    // done yet, the agent is still waiting on something" case.
    h.emit('session/event', session, { type: 'assistant/message', data: { turn: 6, message: { content: [toolCall] } } });
    h.emit('agent/turn-stopping', { agent: rootAgent, turn: 6 });
    await settle();
    check(h.spawns.length === 1, 'a tool-only turn plays nothing');

    // A subagent finishing is not the main conversation finishing.
    h.emit('session/event', { id: 'subagent-1' }, { type: 'assistant/message', data: { turn: 1, message: { content: [textBlock] } } });
    h.emit('agent/turn-stopping', { agent: childAgent, turn: 1 });
    await settle();
    check(h.spawns.length === 1, 'a subagent turn-ending plays nothing');
  }

  // --- switches actually gate playback ---
  {
    const h = makeHost({ audioTurnStart: '0', audioTurnDone: '0' });
    h.roots.push(rootAgent);
    host.installAudio(h.ctx, h.scope);
    h.emit('agent/inbox/claimed', { agent: rootAgent, message: composerPrompt, turn: 1 });
    h.emit('session/event', { id: 'session-1' }, { type: 'assistant/message', data: { turn: 1, message: { content: [textBlock] } } });
    h.emit('agent/turn-stopping', { agent: rootAgent, turn: 1 });
    await settle();
    check(h.spawns.length === 0, 'both slot switches off means total silence');
  }
  {
    const h = makeHost({ audioEnabled: '0' });
    h.roots.push(rootAgent);
    host.installAudio(h.ctx, h.scope);
    h.emit('agent/inbox/claimed', { agent: rootAgent, message: composerPrompt, turn: 1 });
    await settle();
    check(h.spawns.length === 0, 'the master switch off silences every slot');
  }
  {
    const h = makeHost({ audioVolume: '0' });
    h.roots.push(rootAgent);
    host.installAudio(h.ctx, h.scope);
    h.emit('agent/inbox/claimed', { agent: rootAgent, message: composerPrompt, turn: 1 });
    await settle();
    check(h.spawns.length === 0, 'volume 0 counts as silence and spawns no player');
  }

  // --- debounce, and the preview that must bypass it ---
  {
    const h = makeHost();
    h.roots.push(rootAgent);
    const audio = host.installAudio(h.ctx, h.scope);
    h.emit('approval/request', { kind: 'exec' }, () => undefined);
    await settle();
    check(h.spawns.length === 1, 'an approval request plays (reserved slot, already wired)');
    h.emit('approval/request', { kind: 'exec' }, () => undefined);
    await settle();
    check(h.spawns.length === 1, 'a second approval inside the debounce window stays silent');
    const preview = audio.play('attention', { force: true, reason: 'test' });
    await settle();
    check(preview.played === true && h.spawns.length === 2,
      'a forced preview bypasses the debounce window');
  }

  // --- degradation without the subprocess seam ---
  {
    const h = makeHost();
    const bare = {
      get: (name) => (name === 'agents' ? { roots: () => [rootAgent] } : undefined),
      on: h.ctx.on,
      inject: () => () => {},
    };
    const audio = host.installAudio(bare, h.scope);
    const result = audio.play('turn-done', { force: true });
    check(result.played === false && /subprocess/.test(String(result.why)),
      'without the subprocess service the feature reports why instead of throwing');
  }

  // --- resolution order: a user file overrides the bundled tone ---
  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'endfield-audio-'));
    fs.copyFileSync(path.join(ROOT, 'sounds', 'turn-done.wav'), path.join(dir, 'turn-done.wav'));
    const h = makeHost({ audioSoundDir: dir });
    h.roots.push(rootAgent);
    const audio = host.installAudio(h.ctx, h.scope);
    const resolved = audio.resolve('turn-done');
    check(resolved !== undefined && resolved.file.startsWith(dir),
      'a .wav in the configured directory overrides the bundled tone');
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // --- volume scaling writes a cache file and plays that instead ---
  {
    const h = makeHost({ audioVolume: '40' });
    h.roots.push(rootAgent);
    const audio = host.installAudio(h.ctx, h.scope);
    h.emit('agent/inbox/claimed', { agent: rootAgent, message: composerPrompt, turn: 1 });
    await settle();
    check(h.spawns.length === 1, 'a scaled-volume play still spawns a player');
    const argv = h.spawns[0] === undefined ? [] : h.spawns[0].argv;
    /* Windows hands the player an -EncodedCommand script, so the path is inside
       base64; decode it rather than pattern-matching the opaque argument. */
    const encodedIndex = argv.indexOf('-EncodedCommand');
    const script = encodedIndex >= 0
      ? Buffer.from(String(argv[encodedIndex + 1]), 'base64').toString('utf16le')
      : argv.join(' ');
    const bundled = path.join(ROOT, 'sounds', 'turn-done.wav');
    check(/dsh-theme-endfield/i.test(script) && !script.includes(bundled),
      'the player is handed the volume-scaled cache copy, not the bundled file');
  }

  // --- the boot bridge: the page reports "the plate started", the host decides ---
  {
    const routes = [];
    const h = makeHost();
    h.roots.push(rootAgent);
    const ctx = Object.assign({}, h.ctx, {
      get(name) {
        if (name === 'webServer') return { register(route) { routes.push(route); return () => {}; } };
        return h.ctx.get(name);
      },
    });
    host.installAudio(ctx, h.scope);
    check(routes.length === 1 && routes[0].path === '/theme-endfield/audio',
      'the preview/diagnostics bridge mounts when a web server exists');

    /** Drive one route request through a fake req/res pair. */
    const call = (method, url) => new Promise((resolve) => {
      const req = { method, url, on() {}, headers: {} };
      const res = {
        statusCode: 0,
        writeHead(code) { this.statusCode = code; },
        end(body) { resolve({ status: this.statusCode, body: body === undefined ? {} : JSON.parse(body) }); },
      };
      Promise.resolve(routes[routes.length - 1].handler(req, res)).catch(() => resolve({ status: 500, body: {} }));
    });

    const state = await call('GET', '/theme-endfield/audio/state');
    check(state.status === 200 && Array.isArray(state.body.slots),
      'GET /state answers with the slot snapshot the settings page reads');
    const bootSlot = state.body.slots.find((s) => s.id === 'boot');
    check(bootSlot !== undefined && bootSlot.file !== null && /boot\.wav$/.test(String(bootSlot.file)),
      'the snapshot reports the boot slot resolving to its own file');

    // A page load fires exactly this: no body, one query parameter.
    const played = await call('GET', '/theme-endfield/audio/preview?slot=boot');
    await settle();
    check(played.status === 200 && played.body.played === true && h.spawns.length === 1,
      'GET /preview?slot=boot plays the boot sound (the loader path)');

    const unknown = await call('GET', '/theme-endfield/audio/preview?slot=nope');
    await settle();
    check(unknown.status === 409 && h.spawns.length === 1,
      'an unknown slot is refused instead of playing something else');

    // The host owns the switch: with the boot slot off, the page's request must
    // not turn into sound.
    const off = makeHost({ audioBoot: '0' });
    off.roots.push(rootAgent);
    const ctx2 = Object.assign({}, off.ctx, {
      get(name) {
        if (name === 'webServer') return { register(route) { routes.push(route); return () => {}; } };
        return off.ctx.get(name);
      },
    });
    host.installAudio(ctx2, off.scope);
    const refused = await call('GET', '/theme-endfield/audio/preview?slot=boot');
    await settle();
    check(refused.status === 409 && off.spawns.length === 0,
      'the boot switch off makes the loader request a no-op');
  }

  console.log(failures === 0 ? '\nall audio-notification tests passed' : `\n${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
