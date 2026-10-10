
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
 * TWO BALANCE ROUTES, API KEY FIRST (mirrors dsh-whale-widget v759/v781).
 * A user who only configured DEEPSEEK_API_KEY and never logged into the
 * DeepSeek account gets NOTHING from the account service — that route answers
 * only for the client-login identity. So the handler now tries, in order:
 *   1. API key route — GET https://api.deepseek.com/user/balance with the
 *      resolved DEEPSEEK_API_KEY credential. Always first when a key exists.
 *   2. Account route — the DSH `deepseekAccount` service (the original path).
 * The two never fall back into each other silently in reverse: with a key
 * configured, the key route's answer is authoritative even when it fails
 * (the failure reason is reported so the page can keep stale numbers); the
 * account route is only consulted when no key resolves at all.
 * ------------------------------------------------------------------------ */
const DSH_CLIENT_VERSION_FALLBACK = '0.2.0-rc.2';
const BALANCE_API_URL = 'https://api.deepseek.com/user/balance';
const BALANCE_API_TIMEOUT_MS = 8000;

/* Route 1: the API key path. Resolves the DEEPSEEK_API_KEY credential through
 * the host credentials service and asks the official balance endpoint.
 * Returns null when there is no key to try (caller falls through to the
 * account route) or `{ ok:false, why }` on a definitive failure; a success is
 * the same wallet payload the account route produces, so the page-side
 * contract never changes. Transient network/5xx failures retry once after a
 * short backoff before being reported. */
async function fetchApiKeyBalance(ctx) {
  let cred = null;
  try {
    const credentials = serviceOf(ctx, 'credentials');
    if (credentials && typeof credentials.resolve === 'function') {
      cred = await credentials.resolve('DEEPSEEK_API_KEY');
    }
  } catch (error) {
    return { ok: false, why: 'API key 读取失败: ' + String(error && error.message ? error.message : error) };
  }
  if (!cred || !cred.value) return null; // no key configured -> account route
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(BALANCE_API_URL, {
        headers: { Authorization: 'Bearer ' + cred.value },
        signal: AbortSignal.timeout(BALANCE_API_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = String(error && error.message ? error.message : error);
      if (attempt === 0) { await new Promise((resolve) => setTimeout(resolve, 500)); continue; }
      return { ok: false, why: '余额接口请求失败: ' + lastError };
    }
    if (!res.ok) {
      lastError = 'HTTP ' + res.status;
      if (res.status < 500) return { ok: false, why: '余额接口返回 ' + lastError }; // 4xx: key bad/unauthorized, no retry
      if (attempt === 0) { await new Promise((resolve) => setTimeout(resolve, 500)); continue; }
      return { ok: false, why: '余额接口请求失败: ' + lastError };
    }
    let data;
    try {
      data = await res.json();
    } catch (error) {
      return { ok: false, why: '余额接口返回不是合法 JSON' };
    }
    const infos = Array.isArray(data && data.balance_infos) ? data.balance_infos : [];
    const info = infos.find((x) => x && x.currency === 'CNY') || infos[0];
    if (!info || info.total_balance === undefined || !Number.isFinite(Number(info.total_balance))) {
      return { ok: false, why: '余额接口返回结构异常' };
    }
    return {
      ok: true,
      wallets: [{ currency: String(info.currency || 'CNY'), balance: String(info.total_balance) }],
      bonusWallets: info.granted_balance !== undefined && Number.isFinite(Number(info.granted_balance))
        ? [{ currency: String(info.currency || 'CNY'), balance: String(info.granted_balance) }]
        : [],
      at: Date.now(),
    };
  }
  return { ok: false, why: '余额接口请求失败: ' + lastError }; // unreachable, keeps lint honest
}

/* Route 2: the DSH account-login path (the original implementation). Returns
 * the wallet payload on success, `{ ok:false, why }` on any failure — the
 * why text distinguishes "service absent" (no such host generation) from
 * "not logged in" so a user can tell the two apart. */
async function fetchAccountBalance(ctx) {
  const account = serviceOf(ctx, 'deepseekAccount');
  if (!account || typeof account.getBalance !== 'function') {
    return { ok: false, why: 'account service absent' };
  }
  const client = {
    version: DSH_CLIENT_VERSION_FALLBACK,
    locale: 'zh-CN',
    timezoneOffsetSeconds: -(new Date()).getTimezoneOffset() * 60,
  };
  const balance = await account.getBalance(client);
  if (!balance || balance.status !== 'ready') {
    return { ok: false, why: balance && balance.status ? String(balance.status) : 'null' };
  }
  return {
    ok: true,
    wallets: balance.value || [],
    bonusWallets: balance.bonusWallets || [],
    at: Date.now(),
  };
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
            // API key route first; a resolved key makes its answer authoritative
            // (success or reported failure — no silent fall-through to login).
            const apiKeyResult = await fetchApiKeyBalance(ctx);
            if (apiKeyResult !== null) return send(res, 200, apiKeyResult);
            // No API key configured -> the account-login route.
            return send(res, 200, await fetchAccountBalance(ctx));
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
