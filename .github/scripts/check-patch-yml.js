#!/usr/bin/env node
/**
 * check-patch-yml.js — 校验 cordis.patch.yml，`dsh plugin add` 的挂载入口。
 *
 * 这个文件不是普通配置：profile 启动时会把它当作一条挂载行合并进 bundle 栈。
 * 结构错了不会报错，只会让插件静默地装上但不挂载——所以除了「能解析」之外
 * 还断言挂载行本身存在且带 id。
 *
 * 用法：check-patch-yml.js <js-yaml 转出的 json 文件>
 * YAML 解析交给 `npx js-yaml`（走 Node 生态，不引入 Python/PyYAML，也就避开
 * 了 Ubuntu 24.04 上 PEP 668 拒绝 pip 装包的坑）。
 */
'use strict'
const fs = require('fs')

const PLUGIN = 'dsh-theme-endfield'
const SOURCE = 'cordis.patch.yml'
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

function fail(msg) {
  console.error('FAIL  ' + msg)
  console.log(`::error file=${SOURCE},line=1,title=挂载配置无效::${esc(msg)}`)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) fs.appendFileSync(summary, `## ${SOURCE}\n\n❌ ${msg}\n`)
  process.exit(1)
}

const jsonPath = process.argv[2]
if (!jsonPath) fail('用法：check-patch-yml.js <json 文件>')

let doc
try {
  doc = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
} catch (e) {
  fail(`${SOURCE} 不是合法 YAML（js-yaml 无输出）：${e.message}`)
}

if (!Array.isArray(doc)) fail(`顶层应为数组，实际是 ${doc === null ? 'null（空文件？）' : typeof doc}`)

const section = doc.find((e) => e && typeof e === 'object' && !Array.isArray(e) && 'insert' in e)
if (!section) fail('缺少 insert 段')

const rows = section.insert
if (!Array.isArray(rows)) fail(`insert 应为数组，实际是 ${typeof rows}`)

const row = rows.find((r) => r && typeof r === 'object' && r.name === PLUGIN)
if (!row) {
  const names = rows.filter((r) => r && typeof r === 'object').map((r) => r.name)
  fail(`insert 里没有 ${PLUGIN} 行，只有 ${JSON.stringify(names)}`)
}
if (!row.id) fail('插件行缺少 id')

const msg = `${SOURCE} 解析通过，挂载 ${row.id} -> ${row.name}`
console.log('ok    ' + msg)
const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) fs.appendFileSync(summary, `## ${SOURCE}\n\n✅ ${msg}\n`)
