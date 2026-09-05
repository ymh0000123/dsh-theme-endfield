/**
 * settings-scope.browser.js — reusable snippet (source text) that headless
 * Chrome tests inline to provide the dsh settingsScope seam to client.js.
 *
 * The client bundle reads preferences through a fake `ctx.settingsScope` binder
 * provided by the test's stub `ctx`. This snippet returns a fresh binder over an
 * in-memory section seeded from a plain object (field -> stored string), exactly
 * like the Node fixture in ./settings-scope.js. It is intentionally a string of
 * JS meant to be interpolated into the inline <script> of a mock page, because
 * those pages cannot `require()`.
 *
 * Usage inside a page <script> (after client.js has loaded):
 *
 *   var __prefs = __endfieldSettingsScope({ enabled: '1', contour: '1', ... });
 *   mod.apply({ get: function (n) {
 *     if (n === 'theme')      return { overrideTokens: function () { return function () {} } };
 *     if (n === 'settingsScope') return __prefs.binder;
 *     ...
 *   }, effect: function () {} });
 */
const BROWSER_SETTINGS_SCOPE_SNIPPET = `
var __endfieldFieldDefaults = {
  enabled:'1', palette:'valley', radius:'square', contour:'0', contourAnim:'1',
  contourFps:'24', contourSpeed:'2', contourScrollPause:'1', watermark:'1',
  watermarkPersist:'0', loader:'0', thunder:'0', thunderAnim:'0'
};
function __endfieldSettingsScope(initial) {
  function fieldOf(name){ return name.indexOf('dsh-theme-endfield-')===0 ? name.slice('dsh-theme-endfield-'.length) : name; }
  var section = {};
  for (var k in __endfieldFieldDefaults) section[k] = __endfieldFieldDefaults[k];
  if (initial) for (var k2 in initial) if (k2 in __endfieldFieldDefaults) section[k2] = String(initial[k2]);
  var listeners = [];
  var notify = function () { for (var i=0;i<listeners.length;i++){ try{listeners[i]();}catch(e){} } };
  var snap = function () { return { status:'ready', value: __copy(section), writable:true, mode:'host' }; };
  function __copy(o){ var r={}; for(var k in o) r[k]=o[k]; return r; }
  var scope = {
    getSnapshot: snap,
    subscribe: function (l) { listeners.push(l); return function(){var i=listeners.indexOf(l); if(i>=0)listeners.splice(i,1);}; },
    set: function (f, v) { section[f] = String(v); notify(); },
    unset: function (f) { section[f] = __endfieldFieldDefaults[f]; notify(); }
  };
  return {
    binder: { bind: function () { return scope; } },
    section: section,
    getSnapshot: snap,
    set: scope.set,
    /* Drop-in shims so a page that used to call localStorage.setItem(name, v) /
       localStorage.removeItem(name) can call them on this object unchanged. */
    setItem: function (name, v) { scope.set(fieldOf(name), v); },
    removeItem: function (name) { scope.set(fieldOf(name), __endfieldFieldDefaults[fieldOf(name)]); },
    getItem: function (name) { var f = fieldOf(name); return f in section ? section[f] : null; },
    get: function (name){ return fieldOf(name) in section ? section[fieldOf(name)] : undefined; },
    setField: function (name, v) { scope.set(fieldOf(name), v); }
  };
}
`

module.exports = { BROWSER_SETTINGS_SCOPE_SNIPPET }
