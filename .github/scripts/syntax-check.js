#!/usr/bin/env node
/**
 * syntax-check.js — 逐文件 `node --check`，失败转成 PR 行内注解。
 *
 * 为什么值得单独一步：整个主题样式表是**一个**模板字面量传给 insertCss(`...`)。
 * 里面任何一个游离反引号都会提前终结字面量，让整个 client bundle 在解析期就
 * 挂掉——不是某条规则失效，是全盘失效。所以先把每个文件过一遍解析器。
 *
 * 注解用 GitHub 的 workflow command 发（::error file=...,line=...::），这条路
 * 不需要任何写权限，所以在来自 fork 的 PR 上同样有效——本仓库的 PR 恰好都是
 * fork PR，用 API 写评论那条路在这里是走不通的。
 */
'use strict'
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const TARGETS = ['index.js', 'client.js', 'check.js', 'selftest.js']

for (const f of fs.readdirSync(path.join(ROOT, 'test')).sort()) {
  if (f.endsWith('.js')) TARGETS.push('test/' + f)
}

/** GitHub 注解要求仓库相对路径 + 正斜杠；node 在 Windows 上吐绝对路径带反斜杠。 */
const toRepoPath = (p) => path.relative(ROOT, path.resolve(ROOT, p)).split(path.sep).join('/')

/** 从 node --check 的 stderr 里抠出行号。首行形如 `<abs path>:<line>`。 */
function parseLine(stderr) {
  const m = stderr.match(/^.*?:(\d+)\s*$/m)
  return m ? Number(m[1]) : 1
}

/** workflow command 的值里换行/回车必须转义，否则注解会被截断。 */
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

const failures = []

for (const rel of TARGETS) {
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log('ok    ' + rel)
  } catch (e) {
    const stderr = String(e.stderr || e.message || '')
    const line = parseLine(stderr)
    // 只取真正说明问题的那行，整段 stack 留给日志和摘要。
    const reason = (stderr.match(/^\w*(?:Error|Warning).*$/m) || ['解析失败'])[0].trim()
    failures.push({ rel, line, reason, stderr })
    console.log('FAIL  ' + rel + ':' + line + '  ' + reason)
    console.log(`::error file=${toRepoPath(rel)},line=${line},title=语法错误::${esc(reason)}`)
  }
}

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
  const out = ['## 语法解析', '']
  if (failures.length === 0) {
    out.push(`✅ ${TARGETS.length} 个文件全部通过 \`node --check\`。`)
  } else {
    out.push(`❌ ${failures.length} / ${TARGETS.length} 个文件解析失败。`, '')
    out.push('| 文件 | 行 | 原因 |', '| --- | --- | --- |')
    for (const f of failures) out.push(`| \`${f.rel}\` | ${f.line} | ${f.reason} |`)
    out.push('')
    for (const f of failures) {
      out.push(`<details><summary><code>${f.rel}</code></summary>`, '', '```text', f.stderr.trim(), '```', '', '</details>', '')
    }
  }
  fs.appendFileSync(summary, out.join('\n') + '\n')
}

if (failures.length > 0) {
  console.error('\n' + failures.length + ' 个文件无法解析')
  process.exit(1)
}
console.log('\nok  ' + TARGETS.length + ' 个文件全部通过解析')
