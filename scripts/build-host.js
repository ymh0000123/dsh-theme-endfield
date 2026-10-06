#!/usr/bin/env node
/**
 * build-host.js — 把 src/host 下的源片段拼回插件入口 index.js。
 *
 *   node scripts/build-host.js          写 index.js
 *   node scripts/build-host.js --check  只校验（CI 用）
 *
 * 片段划分与顺序见 src/host/manifest.js。
 */
'use strict'
const path = require('path')
const { run } = require('./lib/bundle-build.js')

run({
  root: path.resolve(__dirname, '..'),
  target: 'index.js',
  manifest: 'src/host/manifest.js',
  label: 'Host entry',
  rebuild: 'npm run build:host',
})
