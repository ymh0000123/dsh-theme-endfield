/**
 * settings-scope.browser.js — reusable snippet (source text) that headless
 * Chrome tests inline to provide the dsh settingsScope seam to client.js.
 *
 * The client bundle reads preferences through a fake `ctx.settingsScope` binder
 * provided by the test's stub `ctx`. This snippet returns a fresh binder over an
 * in-memory section seeded from a plain object, exactly like the Node fixture in
 * ./settings-scope.js. It is intentionally a string of JS meant to be
 * interpolated into the inline <script> of a mock page, because those pages
 * cannot `require()`.
 *
 * THE SECTION IS KEYED BY SCHEMA FIELD NAME (camelCase), exactly like the host's
 * index.js FIELD_DEFAULTS — see the long note in ./settings-scope.js for why a
 * fixture that strips the `dsh-theme-endfield-` prefix instead of mapping it
 * hides the shipped field-name bug. A key the page passes in may be a schema
 * field ('contourAnim'), a UI key ('dsh-theme-endfield-contour-anim'), or a
 * namespaced schema field ('dsh-theme-endfield-contourAnim', the spelling the
 * upstream browser tests seed with); all three name a declared field. The legacy
 * pre-migration spelling ('contour-anim') deliberately does NOT resolve — it must
 * stay an undeclared key so a test can reproduce the shipped bug verbatim.
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
var __endfieldKeyToField = {
  'dsh-theme-endfield-enabled':'enabled', 'dsh-theme-endfield-palette':'palette',
  'dsh-theme-endfield-radius':'radius', 'dsh-theme-endfield-contour':'contour',
  'dsh-theme-endfield-contour-anim':'contourAnim',
  'dsh-theme-endfield-contour-fps':'contourFps',
  'dsh-theme-endfield-contour-speed':'contourSpeed',
  'dsh-theme-endfield-contour-scroll-pause':'contourScrollPause',
  'dsh-theme-endfield-watermark':'watermark',
  'dsh-theme-endfield-watermark-persist':'watermarkPersist',
  'dsh-theme-endfield-loader':'loader', 'dsh-theme-endfield-thunder':'thunder',
  'dsh-theme-endfield-thunder-anim':'thunderAnim'
};
/* UI key -> schema field, mirroring client.js PREFS_KEY_TO_FIELD, plus the
   namespaced schema-field spelling ('dsh-theme-endfield-contourAnim') the
   upstream tests seed with. Anything else (a bare schema field like 'contourAnim',
   or a stray spelling like 'contour-anim') is handed back unchanged: a field name
   is already correct, and a stray spelling must NOT be silently corrected here —
   that is the client's job to never produce, and a fixture that quietly accepted
   it would hide the bug. */
function fieldOf(name){
  if (__endfieldKeyToField.hasOwnProperty(name)) return __endfieldKeyToField[name];
  var NS = 'dsh-theme-endfield-';
  if (name.indexOf(NS) === 0) {
    var tail = name.slice(NS.length);
    if (__endfieldFieldDefaults.hasOwnProperty(tail)) return tail;
  }
  return name;
}
function __endfieldSettingsScope(initial) {
  var section = {};
  for (var k in __endfieldFieldDefaults) section[k] = __endfieldFieldDefaults[k];
  if (initial) for (var k2 in initial) {
    var f = fieldOf(k2);
    if (__endfieldFieldDefaults.hasOwnProperty(f)) section[f] = String(initial[k2]);
  }
  var listeners = [];
  var notify = function () { for (var i=0;i<listeners.length;i++){ try{listeners[i]();}catch(e){} } };
  function __copy(o){ var r={}; for(var k in o) r[k]=o[k]; return r; }
  var snap = function () { return { status:'ready', value: __copy(section), writable:true, mode:'host' }; };
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
    /* Drop-in shims so a page that still speaks the old localStorage-key
       vocabulary keeps working: setItem('dsh-theme-endfield-contour-anim', v)
       now writes the SCHEMA field, which is the whole point. */
    setItem: function (name, v) { scope.set(fieldOf(name), v); },
    removeItem: function (name) { scope.set(fieldOf(name), __endfieldFieldDefaults[fieldOf(name)]); },
    getItem: function (name) { var f = fieldOf(name); return f in section ? section[f] : null; },
    get: function (name){ var f = fieldOf(name); return f in section ? section[f] : undefined; },
    setField: function (name, v) { scope.set(fieldOf(name), v); }
  };
}
`

module.exports = { BROWSER_SETTINGS_SCOPE_SNIPPET }
