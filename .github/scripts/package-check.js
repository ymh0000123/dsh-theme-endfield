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

/* One subpath can name its file directly, or name one per resolution condition
   (`{"import": "./index.mjs", "require": "./index.js"}` — the host half needs both
   spellings, see docs/engineering-notes.md). Flatten to the string leaves so every
   one is stat'ed: a condition pointing at a file that is not shipped is precisely
   the "installs but never loads" failure this gate exists for. */
const exportTargets = (value) => {
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') return Object.values(value).flatMap(exportTargets)
  return []
}

for (const [sub, spec] of Object.entries(pkg.exports || {})) {
  const targets = exportTargets(spec)
  if (targets.length === 0) {
    checked.push({ label: `exports["${sub}"]`, ok: false })
    problems.push(`exports["${sub}"] 既不是路径字符串，也没有任何条件分支`)
    continue
  }
  for (const target of targets) {
    const label = `exports["${sub}"] -> ${target}`
    /* A wildcard subpath (`./locale/*.json`) deliberately has no literal file to stat:
       its whole point is to expose every file in that directory, which DSH's plugin
       metadata reader resolves by name (`<pkg>/locale/en.json`) to fill a plugin card.
       Check the directory it fans out from instead of the pattern itself. */
    if (target.includes('*')) {
      const dir = path.dirname(path.join(ROOT, target))
      const ext = path.extname(target)
      if (fs.existsSync(dir) && fs.readdirSync(dir).some((name) => name.endsWith(ext))) {
        checked.push({ label, ok: true })
      } else {
        checked.push({ label, ok: false })
        problems.push(`exports["${sub}"] 的匹配目录 ${path.relative(ROOT, dir) || '.'} 里没有可匹配的文件`)
      }
      continue
    }
    if (fs.existsSync(path.join(ROOT, target))) checked.push({ label, ok: true })
    else {
      checked.push({ label, ok: false })
      problems.push(`exports["${sub}"] 指向不存在的 ${target}`)
    }
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

/* SECURITY.md 第 1 节是扫描器和人工审阅者据以圈定"发布产物"的清单，所以它必须
   跟 files 白名单逐项对得上。音频那一次把 lib/ 与 sounds/ 加进了产物、却没有动
   这份清单，结果是闸门扫的文件集比实际安装的小一圈，而 verdict=WARN 看着仍然绿。
   这里只核对文件集：新增一个发布物时，先让它在 SECURITY.md 里被交代过。 */
const SECURITY_SECTION = (() => {
  const doc = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8')
  const from = doc.indexOf('## 1')
  const to = doc.indexOf('## 2', from + 1)
  return from < 0 ? '' : doc.slice(from, to < 0 ? doc.length : to)
})()
const backticked = (name) => new RegExp('`' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/?`')
for (const f of pkg.files || []) {
  const label = `SECURITY.md 第 1 节: ${f}`
  if (backticked(f).test(SECURITY_SECTION)) checked.push({ label, ok: true })
  else {
    checked.push({ label, ok: false })
    problems.push(`SECURITY.md 第 1 节没把 ${f} 记进发布产物，而 package.json 的 files 会发布它`)
  }
}

for (const c of checked) console.log((c.ok ? 'ok    ' : 'FAIL  ') + c.label)
for (const p of problems) console.log(`::error file=package.json,line=1,title=package.json 不自洽::${esc(p)}`)

const summary = process.env['GITHUB_STEP_SUMMARY'] // 任务摘要文件路径，不是凭证；点号写法会被凭证特征规则误判
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
