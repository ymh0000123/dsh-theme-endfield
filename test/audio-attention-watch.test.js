'use strict';
/**
 * 需要你回应 — the UI-side attention watcher (client half).
 *
 * Why this exists at all: in this deployment the host-side seams never fire (a
 * question was answered while the host counter stayed at 0), so the page has to
 * report "a confirmation box is on screen". That makes three things worth
 * pinning, because each of them can fail silently:
 *
 *   1. the markers match the real UI's semantic anchors, and none of them is a
 *      hashed module class name (which would rot on any upstream rebuild);
 *   2. a box appearing produces exactly ONE report to the host;
 *   3. a box that stays open does not keep reporting, and the watcher stops when
 *      the theme or the audio feature is switched off.
 *
 * Usage: node test/audio-attention-watch.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { settingsScopeStub } = require(path.join(__dirname, 'fixtures', 'settings-scope.js'));

const ROOT = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');

let failures = 0;
const fail = (m) => { console.error('FAIL  ' + m); failures += 1; };
const pass = (m) => console.log('ok    ' + m);
const check = (condition, message) => { if (condition) pass(message); else fail(message); };

const makeReact = () => ({
  useState(init) { return [typeof init === 'function' ? init() : init, () => {}] },
  createElement(type, props, ...children) {
    const kids = [];
    for (const c of children) {
      if (Array.isArray(c)) kids.push(...c);
      else if (c !== null && c !== undefined && c !== false) kids.push(c);
    }
    return { type, props: props || {}, children: kids };
  },
});

const classList = { add() {}, remove() {}, contains: () => false };
const noopEl = () => ({
  style: {}, setAttribute() {}, removeAttribute() {}, appendChild() {}, removeChild() {},
  querySelector: () => null, querySelectorAll: () => [], insertBefore() {},
  getBoundingClientRect: () => ({ width: 0, height: 0, top: 0, left: 0 }),
  classList, className: '', parentNode: null, firstChild: null,
  hasAttribute: () => false, getAttribute: () => null, isConnected: true,
  getContext: () => null, appendData() {}, addEventListener() {}, removeEventListener() {},
});

/* The marker state the test drives: null means "nothing pending on screen". */
let presentSelector = null;
const document = {
  body: Object.assign(noopEl(), { classList }),
  head: noopEl(),
  documentElement: Object.assign(noopEl(), { classList }),
  createElement: () => noopEl(),
  createTextNode: () => noopEl(),
  getElementById: () => null,
  querySelector(selector) {
    /// Any non-empty marker is "on screen" for the selector the watcher asked about.
    if (presentSelector !== null && selector === presentSelector) return noopEl();
    return null;
  },
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
}

const polls = []
const requests = []
const sandbox = {
  window: {
    __ModuleLoader__: null,
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    innerWidth: 1440,
    setTimeout: () => 0, clearTimeout() {},
  },
  document,
  React: makeReact(),
  MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  ResizeObserver: function () { this.observe = () => {}; this.disconnect = () => {} },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  performance: { now: () => 0 },
  // A truthy handle, so the watcher's "already running" guard behaves like the
  // browser's and the poll callback can be driven by hand.
  setInterval: (fn) => { polls.push(fn); return polls.length },
  clearInterval: (handle) => { if (handle > 0) polls[handle - 1] = null },
  setTimeout: () => 0, clearTimeout() {},
  fetch: (url, options) => {
    requests.push({ url, body: options && options.body ? JSON.parse(options.body) : undefined });
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ played: true }) });
  },
  console,
}
sandbox.globalThis = sandbox
sandbox.window.document = document

let loaded = null
sandbox.window.__ModuleLoader__ = { load: (m) => { loaded = m } }
vm.createContext(sandbox)
try {
  new vm.Script(src, { filename: 'client.js' }).runInContext(sandbox)
} catch (e) {
  fail('client.js threw while loading: ' + e.message)
  process.exit(1)
}

const prefStore = settingsScopeStub()
const slots = { inject(_n, fn) { fn() }, register() { return () => {} } }
const mod = loaded.factory(() => null)
const ctx = {
  get: (n) => {
    if (n === 'theme') return { overrideTokens: () => () => {} }
    if (n === 'slots') return slots
    if (n === 'settingsScope') return prefStore.binder
    return undefined
  },
  effect: () => {},
}
try { mod.apply(ctx) } catch (e) { fail('apply() threw: ' + e.message); process.exit(1) }
pass('apply() completed with the theme and audio notifications on')

/* --- 1. the anchors are data attributes, never class names ---
   The markers are attached by apply() (they live in its scope), so they are read
   after it ran. The class-based first attempt rang on unrelated UI cards — 15
   components in the installed client packages share a `_card` class and 8 share
   `_frame` — so "no class matching at all" is the property this guards. */
const markers = mod.__attentionMarkers
if (markers === undefined || !Array.isArray(markers) || markers.length === 0) {
  fail('the client does not export its attention markers, so they cannot be verified')
} else {
  const selectors = markers.map((m) => m.selector)
  check(selectors.includes('[data-approval-key]'),
    'the approval marker uses the attribute the approval panel renders')
  check(selectors.includes('[data-plan-review-key]'),
    'the plan-review marker uses the attribute that panel renders')
  check(selectors.includes('[data-question-key]'),
    'the question marker uses the attribute the dialog renders')
  check(selectors.every((s) => s.startsWith('[data-') && s.endsWith(']')),
    'every marker is a pure data-attribute selector')
  check(selectors.filter((s) => s.includes('class')).length === 0,
    'no marker can collide with the app\'s ~23 module cards')
}

/* --- 2. the poll is running, and reports a box exactly once --- */
check(polls.filter(Boolean).length === 1, 'exactly one attention poll is running');
const poll = polls.find(Boolean)
if (poll === undefined) {
  fail('no attention poll was started, so nothing can be verified further')
} else {
  presentSelector = null
  poll()
  check(requests.length === 0, 'nothing on screen means nothing is reported')

  presentSelector = '[data-approval-key]'
  poll()
  check(requests.length === 1 && requests[0].url === '/theme-endfield/audio/attention',
    'an approval box on screen reports to the host attention route');
  check(requests[0].body.kind === 'approval', 'the report names the kind (approval)');

  poll()
  poll()
  check(requests.length === 1, 'a box that stays open is not reported again');

  presentSelector = null
  poll()
  presentSelector = '[data-question-key]'
  poll()
  check(requests.length === 2 && requests[1].body.kind === 'question',
    'a second box after the first closed is reported again, as a question')

  /* --- 3. the plan-review anchor --- */
  presentSelector = null
  poll()
  presentSelector = '[data-plan-review-key]'
  poll()
  check(requests.length === 3 && requests[2].body.kind === 'plan-review',
    'a plan-review panel reports as its own kind')

  /* --- an unrelated card must NOT report (the field regression) --- */
  presentSelector = null
  poll()
  presentSelector = '[class*="_card"]'
  poll()
  check(requests.length === 3,
    'a plain UI card that is not a confirmation box stays silent')
}

/* --- 4. switching the audio feature off stops the watcher --- */
{
  const handles = polls.length
  prefStore.setField('audioEnabled', '0')
  check(polls.filter(Boolean).length === 0 || polls.length > handles,
    'turning audio notifications off retires the poll')
  const after = polls.filter(Boolean).length
  const before = requests.length
  presentSelector = '[data-approval-key]'
  for (const fn of polls) if (fn) fn()
  check(requests.length === before, 'with audio notifications off nothing is reported')
  prefStore.setField('audioEnabled', '1')
  void after
}

console.log(failures === 0 ? '\nall attention-watcher checks passed' : `\n${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
