"use strict"
/**
 * src/client/manifest.js — client.js 的源片段清单（唯一权威的拼接顺序）。
 *
 * client.js 是发布产物：DSH 的 web modules 只按 package.json 的
 * exports["./client"] 取一个浏览器 bundle，所以交付物必须仍是单文件。
 * 但它自身的 8986 行里有 18 个功能分区（偏好存储 / 传输 /
 * 持久化闸门 / 等高线 / 开机屏 / 雷霆大字 / 余额胶囊 / 渠道额度 /
 * 峰谷定价 / 主题样式表 / 设置页 …），全部挤在一个函数体里，既没法按
 * 功能审阅，也让每次改动都要在一份 547KB 的文件里定位。
 *
 * 因此：源码按分区拆到本目录，scripts/build-client.js 按这份清单原样
 * 拼回 client.js。拼接是纯粹的字面拼接——没有包装、重排、插值或行尾
 * 改写，所以 node scripts/build-client.js --check 能证明产物与源码逐字节一致。
 *
 * 改动规则
 * --------
 *   1. 只改本目录下的片段，不要直接改 client.js（它会被下一次构建覆盖）。
 *   2. 片段顺序就是执行顺序：它们合起来是同一个 function apply(ctx) 的
 *      函数体，作用域、声明顺序、TDZ 语义都依赖这个顺序，不要重排。
 *   3. 改完跑 npm run build:client，再跑 npm run test。
 *
 * 片段本身不是完整 JS（它们共享同一个函数体的缩进与作用域），所以
 * .github/scripts/syntax-check.js 仍只解析拼好的 client.js；CI 另外跑
 * build:client --check 作为产物未过期的门禁。
 */
module.exports = [
  /* ---- 外壳：模块头、SHEET_MARKER、insertCss、apply() 的开场 ---------- */
  { file: '00-shell-head.js' },

  /* ---- 偏好存储：DSH 设置命名空间 / configForms / settingsScope ------ */
  { file: '10-prefs-store.js' },
  { file: '11-prefs-fields.js' },
  { file: '12-attention.js' },
  { file: '13-transport.js' },
  { file: '14-durable-gate.js' },

  /* ---- 色板与背景水印 ---------------------------------------------- */
  { file: '15-palette.js' },
  { file: '16-watermark.js' },

  /* ---- 等高线背景（含生成的内嵌 worker） ---------------------------- */
  { file: '20-contour.js' },
  { file: '21-contour-worker.embed.js' },
  { file: '22-contour-visibility.js' },

  /* ---- 开机屏 / 雷霆大字 / 观察器 / 余额胶囊 / 渠道额度 -------------- */
  { file: '30-boot-loader.js' },
  { file: '31-thunder.js' },
  { file: '32-attention-watch.js' },
  { file: '33-balance-capsule.js' },
  { file: '34-credits.js' },

  /* ---- 峰谷定价窗口与挂载 -------------------------------------------- */
  { file: '40-balance-pricing.js' },
  { file: '41-mount-tokens.js' },

  /* ---- 主题样式表：唯一那个巨型模板字面量的内容 ---------------------- */
  { file: '../styles/theme.css' },

  /* ---- 挂载收尾 / 卸载 / 设置页文案与渲染 --------------------------- */
  { file: '42-mount-tail.js' },
  { file: '43-unmount.js' },
  { file: '50-settings-copy.js' },
  { file: '51-settings-page.js' },

  /* ---- 外壳：apply() 收尾、exports 挂载、factory 收尾 --------------- */
  { file: '99-shell-tail.js' },
]
