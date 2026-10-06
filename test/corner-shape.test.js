/* Regression guard for the 「999px 画出来不是半圆」 trap.

   The host stylesheet roots corner-shape at superellipse(1.5) for EVERY element
   behind @supports (confirmed in the delivered app css: :root --dsw-corner-shape
   + *, ::before, ::after). On any renderer that implements the property
   (Chrome 139+, measured on Chrome 154) a stadium radius therefore DRAWS as a
   squircle — a 36px button with computed border-radius: 999px showed ~14px
   circle-equivalent caps, and the user-visible 「确认启用完全权限？」 capsules
   were rounded rectangles, not the reference's semicircular ends. The host
   opts its own pills/spinners back to round one element at a time; anything
   THIS theme asks to be a stadium or a circle must say corner-shape: round on
   the same rule, because the shape only matters where a radius is non-zero.

   Source-level only (no browser): the property is inert on renderers without
   support, so the assertion is that the declarations EXIST next to the radii
   that need them, not what they compute to. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8')

/* Every rule body that asks for a stadium must also ask for the round shape. */
const blocks = [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
let stadiums = 0
for (const [, selector, body] of blocks) {
  if (!/border-radius:\s*999px/.test(body)) continue
  const covered = /corner-shape:\s*round/.test(body)
  const inherited = /\[data-endfield-balance/.test(selector) /* the pill root carries it; badge/ring/clock/brand-mark inherit */
  if (covered) stadiums++
  else assert.ok(inherited,
    'a 999px rule without corner-shape: round draws as a squircle on Chrome 139+:\n' +
    selector.trim().slice(0, 160))
}
assert.ok(stadiums >= 3, 'the approval / confirmation / cordis pill rules must carry corner-shape: round')

/* The re-circled pass (avatars/spinners/dots) paints real circles only with the
   round shape: 50% of a square is not a circle under superellipse(1.5). */
const circlePass = blocks.find(([, , body]) => /border-radius:\s*50% !important/.test(body))
assert.ok(circlePass, 'the theme must re-circle avatars/spinners/dots')
assert.ok(/corner-shape:\s*round/.test(circlePass[2]), 'the 50% circle pass must pin corner-shape: round too')

console.log('PASS: every stadium/circle radius pairs with corner-shape: round')
