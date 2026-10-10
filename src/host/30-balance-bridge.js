
/* ---------------------------------------------------------------------------
 * Balance bridge — GET /theme-endfield/balance
 *
 * The browser half cannot reach the account balance itself: only Host
 * consumers can obtain the request credential the account service needs, so
 * the capsule in the page asks THIS route instead. The handler mirrors the
 * account service's own client-metadata shape (version/locale/timezone) and
 * returns the balance payload verbatim; a failure is reported as
 * { ok: false } rather than a thrown 500 so the page can keep the last known
 * numbers on screen instead of flickering an error state.
 *
 * TWO SOURCES, IN ORDER. The account platform is the primary read, but it only
 * ever answers when the user has actually signed in to platform.deepseek.com —
 * an API key in the credential store is NOT a session, so a machine that runs
 * fine on `DEEPSEEK_API_KEY` alone got the documented `--` forever, with
 * nothing on screen saying why. The route therefore falls back to the public
 * API-key balance endpoint when the account path yields no ready balance, and
 * it now reports WHICH source answered (`source`) plus a readable reason when
 * neither can (`why`, with the account half's own answer kept in `account`).
 * The fallback uses only a credential the user already stored for model access
 * — nothing here reads a key that was not configured.
 * ------------------------------------------------------------------------ */
const DSH_CLIENT_VERSION_FALLBACK = '0.2.0-rc.2';
/* Name only: the credentials service resolves the VALUE, so the key itself
   never appears in this file, in a log line, or in a response body. */
const BALANCE_API_KEY_REF = 'DEEPSEEK_API_KEY';
const BALANCE_API_URL = 'https://api.deepseek.com/user/balance';
/* Bounded so a stalled upstream can never hold the page's poll open. */
const BALANCE_API_TIMEOUT_MS = 8000;
/* The page polls once a minute; two tabs must not turn that into two reads a
   minute, and a failing upstream must not be hammered. Both TTLs sit at or
   below the poll cadence, so a cache hit can never serve a stale-looking
   number for longer than the capsule's own refresh interval. */
const BALANCE_API_CACHE_MS = 30000;
const BALANCE_API_FAIL_CACHE_MS = 10000;
let balanceApiCache = { at: 0, ttl: 0, value: null };

/**
 * The API-key balance, shaped exactly like the account payload's wallets.
 *
 * `https://api.deepseek.com/user/balance` answers
 * `{ is_available, balance_infos: [{ currency, total_balance, ... }] }`, while
 * the capsule reads `{ currency, balance }` pairs — so this is a rename, not a
 * recomputation: the string the vendor sent is the string that reaches the
 * page, and an entry missing either half is dropped rather than guessed at.
 *
 * Resolves to `{ ok: true, wallets, source }` or `{ ok: false, why, source }`
 * and never throws: every failure is a reason the caller can report.
 */
async function readApiKeyBalance(ctx) {
  const credentials = serviceOf(ctx, 'credentials');
  let key;
  let source = 'none';
  if (credentials !== undefined && typeof credentials.resolve === 'function') {
    try {
      /* A plain string is the whole runtime contract: DSH's credentialRef() is
         an identity brand plus a shape check, and the local provider looks the
         reference up by string. Importing that package here would add a
         resolution-sweep target for no behavioural difference. */
      const hit = await credentials.resolve(BALANCE_API_KEY_REF);
      if (hit !== undefined && hit !== null && typeof hit.value === 'string' && hit.value !== '') {
        key = hit.value;
        source = typeof hit.source === 'string' && hit.source !== '' ? hit.source : 'credentials';
      }
    } catch (error) {
      /* Provider absent or unreadable: fall through to the launch environment
         instead of failing the whole read. */
    }
  }
  if (key === undefined && typeof process !== 'undefined' && process.env) {
    const ambient = process.env[BALANCE_API_KEY_REF];
    if (typeof ambient === 'string' && ambient !== '') {
      key = ambient;
      source = 'env';
    }
  }
  if (key === undefined) return { ok: false, why: 'no-api-key', source: 'none' };
  if (typeof fetch !== 'function') return { ok: false, why: 'fetch unavailable', source };
  try {
    const signal = typeof AbortSignal === 'function' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(BALANCE_API_TIMEOUT_MS)
      : undefined;
    const response = await fetch(BALANCE_API_URL, {
      method: 'GET',
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, why: 'api-key rejected', source };
    }
    if (!response.ok) return { ok: false, why: `balance http ${response.status}`, source };
    const body = await response.json();
    const infos = body && Array.isArray(body.balance_infos) ? body.balance_infos : [];
    const wallets = [];
    for (const info of infos) {
      if (info === null || typeof info !== 'object') continue;
      const currency = typeof info.currency === 'string' ? info.currency : '';
      const raw = info.total_balance;
      const balance = typeof raw === 'string'
        ? raw
        : (typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '');
      if (currency === '' || balance === '') continue;
      wallets.push({ currency, balance });
    }
    if (wallets.length === 0) return { ok: false, why: 'balance empty', source };
    return { ok: true, wallets, source };
  } catch (error) {
    return {
      ok: false,
      why: 'balance request failed: ' + String(error && error.message ? error.message : error),
      source,
    };
  }
}

/**
 * readApiKeyBalance() behind a small cache, so the capsule's minute poll and a
 * second tab share one upstream read. A failure is cached for a shorter TTL
 * than a success, so a recovered key is picked up quickly.
 */
async function readApiKeyBalanceCached(ctx, now) {
  if (balanceApiCache.value !== null && now - balanceApiCache.at < balanceApiCache.ttl) {
    return balanceApiCache.value;
  }
  const value = await readApiKeyBalance(ctx);
  balanceApiCache = {
    at: now,
    ttl: value.ok ? BALANCE_API_CACHE_MS : BALANCE_API_FAIL_CACHE_MS,
    value,
  };
  return value;
}

function registerBalanceBridge(ctx) {
  const webServer = serviceOf(ctx, 'webServer');
  const mount = (webServer) => {
    if (webServer === undefined || typeof webServer.register !== 'function') return;
    const send = (res, code, payload) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(payload));
    };
    try {
      webServer.register({
        kind: 'prefix',
        path: '/theme-endfield/balance',
        handler: async (req, res) => {
          const pathname = String(req.url || '').split('?')[0];
          if (req.method !== 'GET' || pathname !== '/theme-endfield/balance') {
            return send(res, 404, { error: 'not found' });
          }
          try {
            /* Primary: the signed-in account platform. Any answer other than a
               ready balance (`null` when no sign-in record exists, a
               non-ready status, a missing service) is kept as the reason the
               account half could not answer, then the API-key fallback runs. */
            let accountWhy;
            const account = serviceOf(ctx, 'deepseekAccount');
            if (!account || typeof account.getBalance !== 'function') {
              accountWhy = 'account service absent';
            } else {
              const client = {
                version: DSH_CLIENT_VERSION_FALLBACK,
                locale: 'zh-CN',
                timezoneOffsetSeconds: -(new Date()).getTimezoneOffset() * 60,
              };
              const balance = await account.getBalance(client);
              if (balance && balance.status === 'ready') {
                return send(res, 200, {
                  ok: true,
                  source: 'account',
                  wallets: balance.value || [],
                  bonusWallets: balance.bonusWallets || [],
                  at: Date.now(),
                });
              }
              accountWhy = balance && balance.status ? String(balance.status) : 'null';
            }
            const fallback = await readApiKeyBalanceCached(ctx, Date.now());
            if (fallback.ok) {
              return send(res, 200, {
                ok: true,
                source: 'api-key',
                /* Which layer supplied the key (env / file / .env), never the
                   key itself — enough to explain a surprising number without
                   disclosing a secret. */
                keySource: fallback.source,
                wallets: fallback.wallets,
                bonusWallets: [],
                at: Date.now(),
              });
            }
            return send(res, 200, { ok: false, why: fallback.why, account: accountWhy });
          } catch (error) {
            return send(res, 200, { ok: false, why: String(error && error.message ? error.message : error) });
          }
        },
      });
    } catch (error) {
      console.error(`${LOG_TAG} balance bridge failed: ${error && error.message ? error.message : error}`);
    }
  };
  if (webServer !== undefined) mount(webServer);
  else if (typeof ctx.inject === 'function') ctx.inject(['webServer'], (scope) => mount(scope.webServer));
}

/**
 * A `get()` / `watch()` view over this plugin's OWN resolved Config.
 *
 * DSH >= 0.1.7 has no scope to hand a plugin: a preference edit reaches a running
 * entry as a committed `.volatile()` reference — the loader writes it into the
 * live config and emits `loader/volatile-update` — so the current values are read
 * straight off the resolved config `apply()` was started with (every
 * `.volatile()` leaf is a `{ get() }` reference) and the audio runtime re-reads
 * them whenever the loader commits a new one.
 *
 * Returns `undefined` when there is nothing to read, which leaves the runtime on
 * its shipped defaults — the same behaviour as a host with no settings service.
 *
 * @param ctx - host Cordis context; its event seam is optional.
 * @param config - the resolved plugin config (volatile leaves or plain values).
 */
function configPrefScope(ctx, config) {
  if (config === undefined || config === null || typeof config !== 'object') return undefined;
  const read = () => {
    const values = {};
    for (const [key, value] of Object.entries(config)) {
      if (value === undefined || value === null) continue;
      values[key] = typeof value.get === 'function' ? value.get() : value;
    }
    return values;
  };
  return {
    get: read,
    watch: (listener) => {
      if (typeof ctx.on !== 'function') return () => {};
      try {
        return ctx.on('loader/volatile-update', () => { listener(); });
      } catch (error) {
        return () => {};
      }
    },
  };
}
