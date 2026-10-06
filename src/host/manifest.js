'use strict'
/**
 * src/host/manifest.js — index.js 的源片段清单（唯一权威的拼接顺序）。
 *
 * index.js 是插件的 Host 半部（package.json 的 main）：DSH 用 Node 的 ESM
 * 加载器 interop 它，所以它必须是普通的 CommonJS 文件，入口只能有一个。
 * 1262 行里其实是四块彼此独立的工作——schemastery 解析与设置 schema、失败
 * 诊断报告、音频通知、余额桥——拆到本目录后每块都能单独读完。
 *
 * 改动规则与 src/client/manifest.js 相同：
 *   1. 只改片段，不要直接改 index.js（它会被下一次构建覆盖）。
 *   2. 片段顺序就是执行顺序，顶层 const 的 TDZ 依赖它，不要重排。
 *   3. 改完跑 npm run build:host，再跑 npm run test。
 */
module.exports = [
  /* ---- 模块头与两个顶层 require -------------------------------------- */
  { file: '00-shell-head.js' },

  /* ---- 插件身份与设置字段默认值 -------------------------------------- */
  { file: '10-identity.js' },

  /* ---- schemastery：候选规格 → 解析 → 建成设置 schema ---------------- */
  { file: '11-schema-specs.js' },
  { file: '12-schema-resolution.js' },
  { file: '13-schema-build.js' },

  /* ---- 设置表单缺失时的诊断报告 -------------------------------------- */
  { file: '14-diagnostics.js' },

  /* ---- 音频通知（Host 半部） ----------------------------------------- */
  { file: '20-audio.js' },

  /* ---- 余额桥：GET /theme-endfield/balance --------------------------- */
  { file: '30-balance-bridge.js' },

  /* ---- apply()：把上面几块接到 ctx 上 -------------------------------- */
  { file: '90-apply.js' },

  /* ---- 模块导出（Config 必须是字面量上的静态属性） ------------------- */
  { file: '99-shell-tail.js' },
]
