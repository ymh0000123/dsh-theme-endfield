#!/usr/bin/env node
/**
 * whitespace-check.js — 把 `git diff --check` 的抱怨转成 PR 行内注解。
 *
 * 陷阱：CI 上工作树是干净的（刚 checkout），裸跑 `git diff --check` 不检查任何
 * 东西而永远通过。必须显式给出比对区间，所以这里从事件类型推出 base：
 *   pull_request → PR 的 base sha .. HEAD（只看这个 PR 引入的改动）
 *   push         → HEAD~1 .. HEAD
 * 拿不到父提交（首次提交、force push 后）就跳过，而不是假装通过。
 */
'use strict'
const { execFileSync } = require('child_process')
const fs = require('fs')

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

function resolveRange() {
  const base = process.env.BASE_SHA
  if (base) {
    try {
      git(['rev-parse', '--verify', base])
      return { from: base, to: 'HEAD', label: `PR base ${base.slice(0, 8)} .. HEAD` }
    } catch {
      console.log(`::warning::拿不到 PR base ${base}，退回单提交比对`)
    }
  }
  try {
    git(['rev-parse', '--verify', 'HEAD~1'])
    return { from: 'HEAD~1', to: 'HEAD', label: '最近一个提交' }
  } catch {
    return null
  }
}

const range = resolveRange()
if (range === null) {
  console.log('跳过：没有可比对的父提交')
  process.exit(0)
}
console.log('比对区间：' + range.label)

let raw = ''
try {
  git(['diff', '--check', range.from, range.to])
} catch (e) {
  // --check 发现问题时以非零退出，抱怨内容在 stdout。
  raw = String(e.stdout || '')
}

// 形如 `client.js:4178: trailing whitespace.`，续行是那行内容本身（以 + 开头）。
const problems = []
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^(.+?):(\d+):\s*(.+)$/)
  if (m) problems.push({ file: m[1], line: Number(m[2]), msg: m[3].trim() })
}

for (const p of problems) {
  console.log(`${p.file}:${p.line}: ${p.msg}`)
  console.log(`::error file=${p.file},line=${p.line},title=空白字符问题::${esc(p.msg)}`)
}

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
  const out = ['## 行尾空白与冲突标记', '', `比对区间：${range.label}`, '']
  if (problems.length === 0) {
    out.push('✅ 未发现行尾空白或冲突标记。')
  } else {
    out.push(`❌ 发现 ${problems.length} 处。`, '', '| 文件 | 行 | 问题 |', '| --- | --- | --- |')
    for (const p of problems) out.push(`| \`${p.file}\` | ${p.line} | ${p.msg} |`)
  }
  fs.appendFileSync(summary, out.join('\n') + '\n')
}

if (problems.length > 0) {
  console.error('\n发现 ' + problems.length + ' 处空白字符问题')
  process.exit(1)
}
console.log('ok  未发现空白字符问题')
