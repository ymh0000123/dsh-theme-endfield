'use strict';
/**
 * Regenerate the bundled notification sounds under `sounds/`.
 *
 * The files are generated, not committed as binary art, so the package carries
 * no audio licensing question and the timbre is fully described by
 * `lib/slots.js`. Run it after editing a slot definition:
 *
 *   node scripts/build-sounds.js
 *   node scripts/build-sounds.js --check   # verify the committed files match
 */

const fs = require('fs');
const path = require('path');
const { renderWav } = require('../lib/tone.js');
const { SLOTS, SLOT_IDS } = require('../lib/slots.js');

const OUT_DIR = path.join(__dirname, '..', 'sounds');
const checkOnly = process.argv.includes('--check');

let drifted = 0;
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const id of SLOT_IDS) {
  const target = path.join(OUT_DIR, `${id}.wav`);
  const bytes = renderWav(SLOTS[id]);
  const existing = fs.existsSync(target) ? fs.readFileSync(target) : undefined;
  if (existing !== undefined && existing.equals(bytes)) {
    console.log(`ok       ${id}.wav (${bytes.length} bytes)`);
    continue;
  }
  if (checkOnly) {
    drifted += 1;
    console.log(`DRIFTED  ${id}.wav — run: node scripts/build-sounds.js`);
    continue;
  }
  fs.writeFileSync(target, bytes);
  console.log(`${existing === undefined ? 'created ' : 'updated '} ${id}.wav (${bytes.length} bytes)`);
}
if (checkOnly && drifted > 0) {
  console.error(`\n${drifted} sound file(s) out of date.`);
  process.exitCode = 1;
} else if (checkOnly) {
  console.log('\nall sound files are up to date.');
}
