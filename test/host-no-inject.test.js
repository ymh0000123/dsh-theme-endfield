/* The host half asks for the settings service with Cordis `ctx.inject`, which
   WAITS for it — so on a host that never provides `settings` the callback is not
   the only thing that is missing: an unprobed `ctx.inject` used to throw out of
   apply() and take the whole theme down with it. The webServer ask right above it
   (index.js:1064) is feature-detected; the settings ask was not. These cases pin
   that a context without `inject` still mounts, and still gets the audio engine
   running on its shipped defaults. */
const assert = require('node:assert/strict')
const path = require('node:path')
const host = require(path.join(__dirname, '..', 'index.js'))

/** A cordis context that offers no `inject` at all, and no services. */
function bareCtx() {
  const events = []
  return {
    events,
    get: () => undefined,
    on: (name) => { events.push(name); return () => {} },
    effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : undefined },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  }
}

/* The engine registers its turn/approval listeners as it installs, so an event
   name on the context is the observable fact that it installed at all. */
const ENGINE_LISTENER = 'agent/inbox/claimed';

;(async () => {
  {
    const ctx = bareCtx();
    assert.doesNotThrow(() => host.apply(ctx, undefined),
      'apply() must survive a host without ctx.inject');
    assert.ok(ctx.events.includes(ENGINE_LISTENER),
      'a host without ctx.inject must still install the audio engine on its defaults');
  }
  {
    // A host that DOES offer inject keeps using it, and still installs the engine.
    const asked = [];
    const settings = { configure() {}, register: () => ({ get: () => ({}), watch: () => () => {} }) };
    const ctx = Object.assign(bareCtx(), {
      inject(deps, cb) {
        asked.push(deps.join(','));
        if (deps.includes('settings')) cb({ settings, effect: () => {} });
      },
    });
    assert.doesNotThrow(() => host.apply(ctx, undefined));
    assert.ok(asked.includes('settings'), 'the settings service is still awaited via inject');
    assert.ok(ctx.events.includes(ENGINE_LISTENER),
      'the legacy register() scope path must still install the engine');
  }
  console.log('PASS: host half mounts without ctx.inject, and keeps using it when present');
})().catch((error) => { console.error(error); process.exitCode = 1 });
