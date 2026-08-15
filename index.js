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
 * registered in the client half (`exports["./client"]` -> client.js). The
 * host half is intentionally a no-op.
 */
const NAME = 'dsh-theme-endfield';

function apply() {
  // Pure client-side theme — nothing to do in the host realm.
}

module.exports = {
  name: NAME,
  apply
};
