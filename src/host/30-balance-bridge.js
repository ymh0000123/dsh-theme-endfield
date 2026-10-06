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
 * ------------------------------------------------------------------------ */
const DSH_CLIENT_VERSION_FALLBACK = '0.2.0-rc.2';

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
            const account = serviceOf(ctx, 'deepseekAccount');
            if (!account || typeof account.getBalance !== 'function') {
              return send(res, 200, { ok: false, why: 'account service absent' });
            }
            const client = {
              version: DSH_CLIENT_VERSION_FALLBACK,
              locale: 'zh-CN',
              timezoneOffsetSeconds: -(new Date()).getTimezoneOffset() * 60,
            };
            const balance = await account.getBalance(client);
            if (!balance || balance.status !== 'ready') {
              return send(res, 200, { ok: false, why: balance && balance.status ? String(balance.status) : 'null' });
            }
            return send(res, 200, {
              ok: true,
              wallets: balance.value || [],
              bonusWallets: balance.bonusWallets || [],
              at: Date.now(),
            });
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

