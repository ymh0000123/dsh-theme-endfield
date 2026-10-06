#!/usr/bin/env node
/**
 * bundle-build.js — 把一份 manifest 列出的源片段按顺序拼回单文件产物。
 *
 * client.js 与 index.js 都是**交付物**而不是源码：DSH 的 web modules 只按
 * package.json 的 exports 取一个浏览器 bundle，插件入口也必须是普通 CommonJS
 * 文件，所以两者都只能有一个产物文件。于是源码按功能分区拆到 src/client/ 与
 * src/host/，由这里拼回产物。
 *
 * 拼接是纯字面拼接——没有包装、重排、插值，也不改写片段内容——所以 --check
 * 能证明产物与源码逐字节一致：产物过期、或有人绕过片段直接改了产物，都会失败。
 */
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

/* 片段先归一化到 LF 再拼接：工作区是 CRLF（core.autocrlf），Linux 检出是 LF，
   两种检出必须拼出同一份内容。产物再按工作区自己的行尾写回，这样 --check 的
   严格相等在两种检出上都成立（同样的理由见 scripts/build-contour-worker.js）。 */
const toLf = (text) => text.replace(/\r\n/g, '\n')

/** 按 manifest 顺序读出所有片段，返回拼接后的逻辑内容（LF）。 */
function assemble(root, manifest) {
  const manifestPath = path.join(root, manifest)
  const entries = require(manifestPath)
  if (!Array.isArray(entries) || entries.length === 0) {
    throw Error(manifest + ' must export a non-empty array')
  }
  const dir = path.dirname(manifestPath)
  const body = entries
    .map((entry, i) => {
      const file = path.resolve(dir, entry.file)
      if (!fs.existsSync(file)) {
        throw Error('Missing source fragment ' + entry.file + ' (listed by ' + manifest + ')')
      }
      const text = toLf(fs.readFileSync(file, 'utf8'))
      // 片段必须自带结尾换行，否则拼接处会和下一段粘成同一行。
      if (i < entries.length - 1 && !text.endsWith('\n')) {
        throw Error('Fragment must end with a newline: ' + entry.file)
      }
      return text
    })
    .join('')
  return { body, count: entries.length }
}

/** 构建一个产物：--check 只校验，否则写回。 */
function run({ root, target, manifest, label, rebuild }) {
  const targetFile = path.join(root, target)
  const { body, count } = assemble(root, manifest)
  const current = fs.existsSync(targetFile) ? fs.readFileSync(targetFile, 'utf8') : ''
  const nl = current.includes('\r\n') ? '\r\n' : '\n'
  const out = body.replace(/\n/g, nl)
  new vm.Script(out) // 拼接错误在写出文件之前就暴露
  const summary = out.length + ' bytes from ' + count + ' fragments'
  if (process.argv.includes('--check')) {
    if (out !== current) {
      // 只报第一处差异的行号：整份产物的 diff 在 CI 日志里没法看。
      let i = 0
      while (i < out.length && i < current.length && out[i] === current[i]) i++
      const line = out.slice(0, i).split('\n').length
      throw Error(target + ' is stale (first difference at line ' + line + '); run ' + rebuild)
    }
    console.log(label + ' verified: ' + summary)
  } else {
    fs.writeFileSync(targetFile, out)
    console.log(label + ' written: ' + summary)
  }
}

module.exports = { assemble, run }
