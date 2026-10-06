#!/usr/bin/env node
/**
 * build-client.js — 把 src/client 下的源片段拼回发布产物 client.js。
 *
 *   node scripts/build-client.js          写 client.js
 *   node scripts/build-client.js --check  只校验（CI 用）
 *
 * 为什么产物还得是单文件、片段顺序为什么不能动，见 src/client/manifest.js。
 */
'use strict'
const path = require('path')
const { run } = require('./lib/bundle-build.js')

run({
  root: path.resolve(__dirname, '..'),
  target: 'client.js',
  manifest: 'src/client/manifest.js',
  label: 'Client bundle',
  rebuild: 'npm run build:client',
})
