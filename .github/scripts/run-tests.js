#!/usr/bin/env node
/**
 * run-tests.js — 跑 test:ci 清单里的每个测试，一次报出**全部**失败。
 *
 * 为什么不直接 `npm run test:ci`：那个脚本是 `node a && node b && ...` 串联，
 * 第一个测试失败就短路，后面 18 个根本不跑。PR 作者于是只看到一个问题，修完
 * 推一次，再看到下一个。这里逐个跑、逐个记账，一轮 CI 报完。
 *
 * 清单从 package.json 的 test:ci 里解析出来，不在这里另抄一份——两处清单迟早
 * 会漂移，而漂移的方向总是「CI 少跑了一个」。
 */
'use strict'
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const SCRIPT = process.argv[2] || 'test:ci'
const PER_TEST_TIMEOUT_MS = 5 * 60 * 1000

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const line = (pkg.scripts || {})[SCRIPT]
if (!line) {
  console.error(`::error::package.json 里没有 scripts.${SCRIPT}`)
  process.exit(1)
}

// `node check.js && node test/foo.test.js && ...` → ['check.js', 'test/foo.test.js', ...]
const tests = line.split('&&')
  .map((s) => s.trim())
  .map((s) => (s.match(/^node\s+(\S+)$/) || [])[1])
  .filter(Boolean)

if (tests.length === 0) {
  console.error(`::error::无法从 scripts.${SCRIPT} 解析出测试清单`)
  process.exit(1)
}

const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

/** 从测试输出里挑出真正说明问题的行，作为注解正文。 */
function reasonOf(out, code, timedOut) {
  if (timedOut) return `测试超时（超过 ${PER_TEST_TIMEOUT_MS / 1000}s）`
  const hits = out.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(FAIL|no chrome|no result|Error|AssertionError)/i.test(l))
  if (hits.length > 0) return hits.slice(0, 4).join(' / ')
  const tail = out.trim().split(/\r?\n/).slice(-3).join(' / ')
  return tail || `退出码 ${code}`
}

const results = []
const started = process.hrtime.bigint()

for (const rel of tests) {
  const t0 = process.hrtime.bigint()
  const p = spawnSync(process.execPath, [rel], {
    cwd: ROOT, encoding: 'utf8', timeout: PER_TEST_TIMEOUT_MS,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const ms = Number((process.hrtime.bigint() - t0) / 1000000n)
  const out = String(p.stdout || '') + String(p.stderr || '')
  const timedOut = p.error && p.error.code === 'ETIMEDOUT'
  const ok = !timedOut && p.status === 0

  results.push({ rel, ok, ms, out, reason: ok ? '' : reasonOf(out, p.status, timedOut) })

  // 实时回显，日志里保持和本地一致的可读性。
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${rel}  (${ms}ms)`)
  if (!ok) {
    console.log(out.trimEnd().split(/\r?\n/).map((l) => '      ' + l).join('\n'))
    console.log(`::error file=${rel},line=1,title=测试失败::${esc(results[results.length - 1].reason)}`)
  }
}

const totalMs = Number((process.hrtime.bigint() - started) / 1000000n)
const failed = results.filter((r) => !r.ok)

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary) {
  const out = [`## 测试套件 \`${SCRIPT}\``, '']
  out.push(failed.length === 0
    ? `✅ ${results.length} 项全部通过（${(totalMs / 1000).toFixed(1)}s）。`
    : `❌ ${failed.length} / ${results.length} 项失败（${(totalMs / 1000).toFixed(1)}s）。`)
  out.push('')
  out.push('| 测试 | 结果 | 耗时 |', '| --- | --- | --- |')
  for (const r of results) {
    out.push(`| \`${r.rel}\` | ${r.ok ? '✅' : '❌'} | ${r.ms}ms |`)
  }
  out.push('')
  for (const r of failed) {
    out.push(`<details open><summary>❌ <code>${r.rel}</code></summary>`, '', '```text',
      r.out.trim().slice(-4000) || '(无输出)', '```', '', '</details>', '')
  }
  fs.appendFileSync(summary, out.join('\n') + '\n')
}

console.log()
if (failed.length > 0) {
  console.error(`${failed.length} / ${results.length} 项失败：`)
  for (const r of failed) console.error(`  - ${r.rel}  ${r.reason}`)
  process.exit(1)
}
console.log(`ok  ${results.length} 项全部通过（${(totalMs / 1000).toFixed(1)}s）`)
