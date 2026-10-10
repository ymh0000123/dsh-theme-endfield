'use strict';
/**
 * The API-key half of the balance route.
 *
 * Why this needs its own file: the account platform only answers when the user
 * signed in to platform.deepseek.com, and a machine that runs on a stored
 * `DEEPSEEK_API_KEY` alone therefore saw the capsule read `--` forever with
 * nothing on screen explaining it. The route now falls back to the public
 * balance endpoint — and that fallback is the ONLY part of this plugin that
 * talks to a remote host from the HOST process, so none of it can be observed
 * in the offline client tests. It is driven here against stub credentials and a
 * stub fetch.
 *
 * What is pinned, in the order the route itself resolves it:
 *
 *   1. `readApiKeyBalance` maps the vendor envelope
 *      (`{ balance_infos: [{ currency, total_balance }] }`) onto the wallet
 *      shape the capsule reads (`{ currency, balance }`), drops a half-empty
 *      entry rather than guessing, and turns every failure into a REASON —
 *      it must never throw, because the caller reports `why` to the page;
 *   2. the key comes from the credentials service first and the launch
 *      environment second, and no key is ever echoed into the result;
 *   3. `registerBalanceBridge` prefers the account path and only falls back,
 *      keeps the account half's own answer as `account`, and answers `404` off
 *      its exact path;
 *   4. the fallback is cached, so the capsule's minute poll plus a second tab
 *      do not multiply upstream reads.
 *
 * Usage: node test/balance-bridge-api-key.test.js
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(ROOT, 'index.js');

let failures = 0;
const fail = (m) => { console.error('FAIL  ' + m); failures += 1; };
const pass = (m) => console.log('ok    ' + m);
const check = (condition, message) => { if (condition) pass(message); else fail(message); };

/* The key must not come from the machine running the test, or the "no key"
   cases silently pass for the wrong reason locally and fail in CI (or the
   reverse). The real value is restored before exit. */
const AMBIENT = Object.prototype.hasOwnProperty.call(process.env, 'DEEPSEEK_API_KEY')
  ? process.env.DEEPSEEK_API_KEY : undefined;
delete process.env.DEEPSEEK_API_KEY;
process.on('exit', () => {
  if (AMBIENT !== undefined) process.env.DEEPSEEK_API_KEY = AMBIENT;
});

const HOST = require(ENTRY);

/* The route memoises the API-key answer in MODULE scope, which is right for a
   long-lived host (one balance poll a minute per tab) but would let one case
   below answer the next one. Re-requiring the entry hands each route case the
   cold state it is actually asserting about. */
const freshHost = () => {
  delete require.cache[require.resolve(ENTRY)];
  return require(ENTRY);
};

/* ---------- a ctx whose only service is the one under test ---------- */
const ctxWith = (services) => ({
  get: (key) => services[key],
  on: () => () => {},
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : undefined; },
  logger: { debug() {}, info() {}, warn() {}, error() {} },
});

const credentialsOf = (hit) => ({ resolve: async () => hit });

/** A fetch stub that records its calls, so "cached" can be asserted. */
const fetchOf = (responder) => {
  const calls = [];
  const stub = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init, calls.length);
  };
  stub.calls = calls;
  return stub;
};

const jsonResponse = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const REAL_FETCH = globalThis.fetch;
const withFetch = (stub) => { globalThis.fetch = stub; };
const restoreFetch = () => { globalThis.fetch = REAL_FETCH; };

/* ==========================================================================
 * 1. readApiKeyBalance — the pure read, driven directly (no cache involved)
 * ========================================================================== */
;(async () => {
  /* 1a. no credentials service, no ambient key: a REASON, not a throw. */
  {
    restoreFetch();
    const result = await HOST.readApiKeyBalance(ctxWith({}));
    check(result.ok === false && result.why === 'no-api-key',
      'a credential-less host reports why=no-api-key instead of throwing (got ' + JSON.stringify(result) + ')');
    check(result.source === 'none', 'and names no source, so the page cannot imply a key was tried');
  }

  /* 1b. credentials service resolves nothing (未配置): same reason. */
  {
    const result = await HOST.readApiKeyBalance(ctxWith({
      credentials: credentialsOf(undefined),
    }));
    check(result.ok === false && result.why === 'no-api-key',
      'a provider that resolves undefined is treated as "not configured", not as an error');
  }

  /* 1c. a resolve() that throws must not take the read down with it. */
  {
    const exploding = { resolve: async () => { throw new Error('provider offline'); } };
    const result = await HOST.readApiKeyBalance(ctxWith({ credentials: exploding }));
    check(result.ok === false && result.why === 'no-api-key',
      'a throwing credentials provider degrades to why=no-api-key (got ' + JSON.stringify(result) + ')');
  }

  /* 1d. the happy path: vendor envelope -> wallet shape, verbatim strings. */
  {
    const fetchStub = fetchOf(() => jsonResponse(200, {
      is_available: true,
      balance_infos: [
        { currency: 'CNY', total_balance: '11.26', granted_balance: '0.00', topped_up_balance: '11.26' },
      ],
    }));
    withFetch(fetchStub);
    const result = await HOST.readApiKeyBalance(ctxWith({
      credentials: credentialsOf({ value: 'sk-test', source: 'file' }),
    }));
    restoreFetch();
    check(result.ok === true, 'a 200 with a well-formed envelope is a success (got ' + JSON.stringify(result) + ')');
    check(JSON.stringify(result.wallets) === JSON.stringify([{ currency: 'CNY', balance: '11.26' }]),
      'total_balance is renamed to balance and passed through as the SAME string the vendor sent');
    check(result.source === 'file', 'the credential source layer reaches the caller (env/file/-env), never the value');
    check(JSON.stringify(result).indexOf('sk-test') === -1, 'the key itself never appears in the result');
    const call = fetchStub.calls[0];
    check(call.url === 'https://api.deepseek.com/user/balance',
      'the request targets the public balance endpoint (got ' + call.url + ')');
    check(call.init && call.init.headers && call.init.headers.authorization === 'Bearer sk-test',
      'the key travels as a bearer token');
    check(call.init.signal !== undefined, 'the request is bounded by a timeout signal');
  }

  /* 1e. the same endpoint can answer in USD, and numbers are normalised. */
  {
    withFetch(fetchOf(() => jsonResponse(200, {
      balance_infos: [
        { currency: 'USD', total_balance: 4.5 },
        { currency: 'CNY', total_balance: '0.00' },
      ],
    })));
    const result = await HOST.readApiKeyBalance(ctxWith({
      credentials: credentialsOf({ value: 'sk-test', source: 'file' }),
    }));
    restoreFetch();
    check(result.ok === true && result.wallets.length === 2,
      'every currency entry is reported, not just the first');
    check(result.wallets[0].balance === '4.5',
      'a numeric total_balance is stringified rather than dropped');
  }

  /* 1f. entries that are missing half of themselves are DROPPED, never zeroed:
     a fabricated 0 is exactly what the capsule documents it will not paint. */
  {
    withFetch(fetchOf(() => jsonResponse(200, {
      balance_infos: [
        { currency: 'CNY' },
        { total_balance: '9.99' },
        { currency: 'CNY', total_balance: '1.00' },
        null,
        'nonsense',
      ],
    })));
    const result = await HOST.readApiKeyBalance(ctxWith({
      credentials: credentialsOf({ value: 'sk-test', source: 'file' }),
    }));
    restoreFetch();
    check(result.ok === true && JSON.stringify(result.wallets) === JSON.stringify([{ currency: 'CNY', balance: '1.00' }]),
      'half-empty and non-object entries are dropped instead of becoming 0 (got ' + JSON.stringify(result.wallets) + ')');
  }

  /* 1g. nothing usable at all is a reason, not an empty wallet list. */
  {
    withFetch(fetchOf(() => jsonResponse(200, { balance_infos: [] })));
    const result = await HOST.readApiKeyBalance(ctxWith({
      credentials: credentialsOf({ value: 'sk-test', source: 'file' }),
    }));
    restoreFetch();
    check(result.ok === false && result.why === 'balance empty',
      'an envelope with no usable wallet reports why=balance empty');
  }

  /* 1h. a rejected key is distinguishable from a network failure: the two need
     different advice ("replace the key" vs "retry later"). */
  {
    withFetch(fetchOf(() => jsonResponse(401, { error: 'unauthorized' })));
    const rejected = await HOST.readApiKeyBalance(ctxWith({
      credentials: credentialsOf({ value: 'sk-bad', source: 'env' }),
    }));
    withFetch(fetchOf(() => jsonResponse(403, {})));
    const forbidden = await HOST.readApiKeyBalance(ctxWith({
      credentials: credentialsOf({ value: 'sk-bad', source: 'env' }),
    }));
    withFetch(fetchOf(() => jsonResponse(500, {})));
    const server = await HOST.readApiKeyBalance(ctxWith({
      credentials: credentialsOf({ value: 'sk-test', source: 'file' }),
    }));
    restoreFetch();
    check(rejected.ok === false && rejected.why === 'api-key rejected', '401 reports why=api-key rejected');
    check(forbidden.ok === false && forbidden.why === 'api-key rejected', '403 reports the same');
    check(server.ok === false && server.why === 'balance http 500',
      'a 5xx carries its status instead of masquerading as a bad key (got ' + server.why + ')');
  }

  /* 1i. a thrown fetch is a reason too — this function must never reject. */
  {
    withFetch(fetchOf(() => { throw new Error('ECONNREFUSED'); }));
    let threw = null;
    let result = null;
    try {
      result = await HOST.readApiKeyBalance(ctxWith({
        credentials: credentialsOf({ value: 'sk-test', source: 'file' }),
      }));
    } catch (error) { threw = error; }
    restoreFetch();
    check(threw === null, 'a thrown fetch does not escape the read');
    check(result !== null && result.ok === false && /^balance request failed: /.test(String(result.why)),
      'it becomes a reason the page can print (got ' + JSON.stringify(result) + ')');
  }

  /* 1j. a host without fetch (older Node) says so rather than crashing. */
  {
    globalThis.fetch = undefined;
    const result = await HOST.readApiKeyBalance(ctxWith({
      credentials: credentialsOf({ value: 'sk-test', source: 'file' }),
    }));
    restoreFetch();
    check(result.ok === false && result.why === 'fetch unavailable',
      'a runtime without fetch reports why=fetch unavailable');
  }

  /* 1k. the launch environment is the second source, used only when the
     credentials service has nothing. */
  {
    withFetch(fetchOf(() => jsonResponse(200, { balance_infos: [{ currency: 'CNY', total_balance: '7.00' }] })));
    process.env.DEEPSEEK_API_KEY = 'sk-ambient';
    const result = await HOST.readApiKeyBalance(ctxWith({}));
    delete process.env.DEEPSEEK_API_KEY;
    restoreFetch();
    check(result.ok === true && result.source === 'env',
      'an exported DEEPSEEK_API_KEY is used when the credentials service is absent');
  }

  /* ==========================================================================
   * 2. the route itself: account first, key second, and the fallback is cached
   * ========================================================================== */
  /* Each route case mounts into a freshly required entry, so the module-scope
     cache starts empty and the assertions are about the route, not about the
     case that happened to run before it. */
  const mountRoute = () => {
    let handler = null;
    const webServer = { register: (route) => { handler = route.handler; return () => {}; } };
    return { webServer, handlerNow: () => handler };
  };
  const call = async (handler, { method = 'GET', url = '/theme-endfield/balance' } = {}) => {
    let status = 0;
    let body = null;
    const res = {
      writeHead(code) { status = code; },
      end(text) { body = JSON.parse(text); },
    };
    await handler({ method, url }, res);
    return { status, body };
  };

  /* 2a. a signed-in account wins, and the fallback is not consulted at all. */
  {
    const mounted = mountRoute();
    const host = freshHost();
    const fetchStub = fetchOf(() => jsonResponse(200, { balance_infos: [{ currency: 'CNY', total_balance: '1.00' }] }));
    withFetch(fetchStub);
    host.registerBalanceBridge(ctxWith({
      webServer: mounted.webServer,
      deepseekAccount: { getBalance: async () => ({ status: 'ready', value: [{ currency: 'CNY', balance: '11.26' }], bonusWallets: [] }) },
      credentials: credentialsOf({ value: 'sk-test', source: 'file' }),
    }));
    const answered = await call(mounted.handlerNow());
    restoreFetch();
    check(answered.body && answered.body.ok === true && answered.body.source === 'account',
      'a ready account balance is reported as source=account');
    check(fetchStub.calls.length === 0,
      'and the API-key endpoint is not called at all when the account answered');
  }

  /* 2b. the account half answering `null` (no sign-in record) is exactly the
     case that used to leave `--` on screen unexplained. */
  {
    const mounted = mountRoute();
    const host = freshHost();
    const fetchStub = fetchOf(() => jsonResponse(200, {
      balance_infos: [{ currency: 'CNY', total_balance: '11.26' }],
    }));
    withFetch(fetchStub);
    host.registerBalanceBridge(ctxWith({
      webServer: mounted.webServer,
      deepseekAccount: { getBalance: async () => null },
      credentials: credentialsOf({ value: 'sk-test', source: 'file' }),
    }));
    const first = await call(mounted.handlerNow());
    const readsAfterFirst = fetchStub.calls.length;
    const second = await call(mounted.handlerNow());
    const readsAfterSecond = fetchStub.calls.length;
    restoreFetch();
    check(first.body && first.body.ok === true && first.body.source === 'api-key',
      'an account read that yields null falls back to the API-key balance');
    check(first.body && first.body.keySource === 'file',
      'the payload says which credential layer answered, not which key it was');
    check(first.body && Array.isArray(first.body.wallets) && first.body.wallets.length === 1,
      'and carries the wallets the capsule reads');
    check(readsAfterSecond === readsAfterFirst,
      'a second request within the cache window costs no further upstream read ('
      + readsAfterFirst + ' then ' + readsAfterSecond + ')');
    check(second.body && second.body.ok === true, 'the cached answer is still a full success payload');
  }

  /* 2c. neither source: the reason reaches the page WITH the account half's own
     answer, so "not signed in" and "no key" stay distinguishable. */
  {
    const mounted = mountRoute();
    const host = freshHost();
    restoreFetch();
    host.registerBalanceBridge(ctxWith({
      webServer: mounted.webServer,
      deepseekAccount: { getBalance: async () => null },
      credentials: credentialsOf(undefined),
    }));
    const answered = await call(mounted.handlerNow());
    check(answered.status === 200,
      'a total failure is still a 200, so the capsule keeps its last number instead of erroring');
    check(answered.body && answered.body.ok === false && answered.body.why === 'no-api-key',
      'the page is told why the capsule is empty (got ' + JSON.stringify(answered.body) + ')');
    check(answered.body && answered.body.account === 'null',
      'and the account half\'s own answer is preserved for diagnosis');
  }

  /* 2d. the route answers only its own path and only GET. */
  {
    const mounted = mountRoute();
    freshHost().registerBalanceBridge(ctxWith({
      webServer: mounted.webServer,
      deepseekAccount: { getBalance: async () => null },
    }));
    const wrongPath = await call(mounted.handlerNow(), { url: '/theme-endfield/balance/extra' });
    const wrongMethod = await call(mounted.handlerNow(), { method: 'POST' });
    check(wrongPath.status === 404, 'a neighbouring path is a 404, not a balance read');
    check(wrongMethod.status === 404, 'a non-GET method is a 404, not a balance read');
  }

  /* 2e. an account service that is absent altogether is a reported reason. */
  {
    const mounted = mountRoute();
    HOST.registerBalanceBridge(ctxWith({ webServer: mounted.webServer }));
    const answered = await call(mounted.handlerNow());
    const body = answered.body || {};
    check(body.ok === false && body.account === 'account service absent',
      'a host with no account service reports that as the account-side reason (got ' + JSON.stringify(body) + ')');
  }

  if (failures > 0) {
    console.error('\nFAIL: ' + failures + ' check(s) failed');
    process.exit(1);
  }
  console.log('\nPASS: the balance route prefers the account, falls back to the API key, and explains every failure');
})().catch((error) => {
  restoreFetch();
  console.error(error);
  process.exit(1);
});
