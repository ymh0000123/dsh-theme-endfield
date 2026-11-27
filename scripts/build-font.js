'use strict';
/**
 * Regenerate `src/styles/sarkaz-font.css` — the @font-face block that carries the
 * Sarkaz typeface inside the client bundle.
 *
 * Why a generator rather than a hand-written fragment: the payload is 19KB of
 * base64, and a blob nobody can proofread is a blob nobody updates when the font
 * changes. The committed `.ttf` under `assets/fonts/` is the source of truth; this
 * script derives the stylesheet from it, and `--check` (wired into `npm run check`)
 * fails the build when the two disagree.
 *
 *   node scripts/build-font.js
 *   node scripts/build-font.js --check
 *
 * Licensing: the typeface is CC BY-NC 4.0 by 罗醭坦 and is NOT covered by this
 * repository's MIT licence. See `assets/fonts/README.md` before shipping it.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FONT = path.join(ROOT, 'assets', 'fonts', 'EndfieldByButan.ttf');
const OUT = path.join(ROOT, 'src', 'styles', 'sarkaz-font.css');

const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(FONT)) {
  console.error(`FAIL  ${path.relative(ROOT, FONT)} is missing — it is the source of the embedded copy.`);
  process.exit(1);
}
const bytes = fs.readFileSync(FONT);

/*
 * The comment below is deliberately part of the generated file: it is the only
 * place a future reader will look when wondering why a font lives in a string.
 */
const HEAD = `      /* 萨卡兹字形：内嵌的 EndfieldByButan.ttf（罗醭坦，CC BY-NC 4.0，非商用）。

         为什么是 base64 而不是 assets 里的 ttf 或一条宿主路由：本插件的交付物
         只有 client.js 一个文件（见 src/client/manifest.js 的开头），字体放外部
         就得再挂一条静态路由，而路由在 webServer 缺席时不存在——那时底部字母行
         会悄悄退回系统字体，属于「看起来像坏了」。内联 19KB 换来零依赖、零请求、
         单文件不变。原字体仍留在 assets/fonts/ 作为出处与可复现来源，
         test/sarkaz-font.test.js 用 SHA-256 钉住两者一致。

         字体只覆盖 A-Z a-z 0-9 与部分标点（U+0020–U+007E 为主）：汉字、č/š/ğ
         这类带变音符的拼写没有字形，会按 font-family 回退到系统字体，这是刻意的
         ——装饰行里混排中文时不该整行变空白。

         本文件由 scripts/build-font.js 生成，不要手改：改字体后跑 npm run font:build。 */
      @font-face {
        font-family: "Endfield Sarkaz";
        font-style: normal;
        /* 字体只有 Regular：声明 400 并让使用处不做合成加粗，否则字形会被撑变形。 */
        font-weight: 400;
        /* 内联数据不会有网络等待，block 只是保证「先有字形再画」，
           避免 3 秒的播报窗口里先闪一帧拉丁字母。 */
        font-display: block;
        src: url("data:font/ttf;base64,`;

const css = HEAD + bytes.toString('base64') + '") format("truetype");\n      }\n';

const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : undefined;
if (existing === css) {
  console.log(`ok       sarkaz-font.css (${bytes.length} bytes font, ${css.length} bytes css)`);
} else if (checkOnly) {
  console.error(`DRIFTED  src/styles/sarkaz-font.css — run: node scripts/build-font.js`);
  process.exit(1);
} else {
  fs.writeFileSync(OUT, css);
  console.log(`${existing === undefined ? 'created ' : 'updated '} src/styles/sarkaz-font.css (${bytes.length} bytes font, ${css.length} bytes css)`);
}
