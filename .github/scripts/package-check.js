#!/usr/bin/env node
/**
 * package-check.js — package.json 的对外承诺是否兑现。
 *
 * exports 指向不存在的文件、或 files 白名单漏掉一个发布物，本地永远看不出来
 * （文件就在工作区里），只有别人 `dsh plugin add` 装的时候才炸。
 */
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

const problems = []
const checked = []

for (const [sub, target] of Object.entries(pkg.exports || {})) {
  const label = `exports["${sub}"] -> ${target}`
  if (fs.existsSync(path.join(ROOT, target))) checked.push({ label, ok: true })
  else {
    checked.push({ label, ok: false })
    problems.push(`exports["${sub}"] 指向不存在的 ${target}`)
  }
}

for (const f of pkg.files || []) {
  const label = `files: ${f}`
  if (fs.existsSync(path.join(ROOT, f))) checked.push({ label, ok: true })
  else {
    checked.push({ label, ok: false })
    problems.push(`files 列出了不存在的 ${f}`)
  }
}

// main 也是入口，漏了同样装不上。
if (pkg.main && !fs.existsSync(path.join(ROOT, pkg.main))) {
  checked.push({ label: `main: ${pkg.main}`, ok: false })
  problems.push(`main 指向不存在的 ${pkg.main}`)
} else if (pkg.main) {
  checked.push({ label: `main: ${pkg.main}`, ok: true })
}

for (const c of checked) console.log((c.ok ? 'ok    ' : 'FAIL  ') + c.label)
for (const p of problems) console.log(`::error file=package.json,line=1,title=package.json 不自洽::${esc(p)}`)

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
  const out = ['## package.json 自洽性', '']
  out.push(problems.length === 0
    ? `✅ ${checked.length} 项入口与发布物全部存在。`
    : `❌ ${problems.length} 项不自洽。`)
  out.push('')
  out.push('| 项 | 结果 |', '| --- | --- |')
  for (const c of checked) out.push(`| \`${c.label}\` | ${c.ok ? '✅' : '❌'} |`)
  fs.appendFileSync(summary, out.join('\n') + '\n')
}

if (problems.length > 0) {
  console.error('\n' + problems.length + ' 项不自洽')
  process.exit(1)
}
console.log('\nok  ' + checked.length + ' 项全部存在')
