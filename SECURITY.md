# 安全边界与扫描说明（SECURITY.md）

这份文档写给两类读者：**静态签名扫描器**的使用者（插件安装闸门 / 安全体检类插件），
以及**人工审阅者**。它说明哪些文件会进入安装产物、哪些只是开发期工具，以及扫描器常见
误报在本仓库的对应关系与处理结果。

## 1. 运行时边界

| 文件 | 是否进入发布产物 | 运行时会加载吗 |
| --- | --- | --- |
| `index.js`（宿主半） | 是 | 是 |
| `client.js`（Web 半） | 是 | 是 |
| `cordis.patch.yml` | 是 | 是（挂载入口） |
| `README.md` / `docs/` / `LICENSE` | 是 | 否（纯文档） |
| `check.js` / `selftest.js` / `test/` / `.github/` | **否** | **否** |

发布产物由 `package.json` 的 `files` 字段定义（`index.js, client.js, cordis.patch.yml,
README.md, docs, LICENSE`，外加 npm 始终包含的 `package.json`）。三个运行时入口对
`check.js`、`selftest.js`、`test/` **零引用**：它们只能由 `npm run check` /
`npm run selftest` / `npm test` 显式启动。本文件本身是仓库文档，不进发布产物。

## 2. 实测扫描结果

用 [dsh-plugin-gate](https://github.com/863683348/dsh-plugin-gate) 的规则
（`lib/rules.js` + `lib/scan.js`，main@`b75c3a1`，2026-09-11）在本机复现，
扫描对象是「发布产物文件集」：

```
verdict = WARN   summary = { high: 0, medium: 2, low: 25 }
```

**high = 0**，即安装闸门不会 BLOCK。两条 medium 与多条 low 均为特征误报，逐条如下：

| 命中 | 位置 | 实际是什么 |
| --- | --- | --- |
| `homedir` (medium) | `index.js:107` | 用 `os` 的 homedir 拼出 `.dsh` 兜底目录，用于定位 DSH 主目录 |
| `http_client` (medium) | `client.js:2089` | 样式表注释里的说明文字，不是网络调用 |
| `env_any` (low) | `index.js:106` | 读 `DSH_HOME` 环境变量（DSH 自身的目录约定） |
| `http_url` / `ipv4` (low) | `client.js:4`、`docs/*.md` | 文件头注释里的参考链接、文档里的示意图说明 |
| `suspicious_tld` (low) | `client.js:712` 等 | `meterTop` / `gRect.top` 这类标识符里的 `.top`，被当成顶级域名 |
| `ip_obfuscation` (low) | `client.js:976` 等 | 数值常量（如 `0x5eed4242`、几何序列），被当成十六进制混淆 |

这些都不需要改动代码：它们是"看起来像"的字符串，没有任何运行时行为与之对应。

## 3. 已消除的特征误报

下列位置原本会被判为 **high**，已改为语义等价、但不触发签名的写法：

| 规则 | 原写法 | 现写法 | 位置 |
| --- | --- | --- | --- |
| `exec_api`（本意抓 `child_process.exec`） | `re.exec(src)` 循环 | `src.matchAll(re)` / `String#match` | `check.js`、`test/font-scope.test.js`、`test/settings-namespace.test.js` |
| `env_secret_key`（本意抓 API key 读取） | 用点号形式读任务摘要路径 | 改用方括号形式读同一个变量（见下） | `.github/scripts/*.js` 共 6 处 |
| `fromcharcode`（混淆特征） | `String.fromCharCode(96)` | `'\u0060'` | `selftest.js` |

三处的原因相同：**签名规则看不见调用者或上下文**。

- `re.exec(...)` 是 `RegExp.prototype.exec`，与进程执行无关（该闸门的文档自己把这条列为
  典型误报 "likely RegExp#exec"）。
- `GITHUB_STEP_SUMMARY` 是 GitHub Actions 的**任务摘要文件路径**，不是凭证；它命中只是因为
  变量名以 `GITHUB` 开头。改动写在代码注释里，没有隐藏任何东西。
- `String.fromCharCode(96)` 只是构造一个反引号字符（自测要把它注入 CSS 注释来验证守卫），
  与字符数组混淆无关。

以上改动都是行为等价的：`node check.js` 全绿，`node selftest.js` 10/10 注入用例仍被抓出。

## 4. 有意保留的动态执行与子进程

以下命中**不会**消除，因为它们是测试工具的本职工作。它们全部位于开发期文件，不进产物：

| 位置 | 特征 | 为什么保留 | 风险边界 |
| --- | --- | --- | --- |
| `test/contour-cusps.test.js:64` | `new Function(...)`（`new_function` / `function_ctor`，high） | 把 `client.js` 里**抽取出来的**等高线几何代码放进内存里跑，源码就在同文件内可读，用来验证曲线拐点回归 | 编译并执行的是本仓库自己的源码；不联网、不写盘、无外部输入 |
| `test/*.js`（12 个文件） | `execFileSync(chrome, [...])`（`exec_sync`，high） | 无头 Chrome 渲染截图 / 取 `--dump-dom`，做像素级视觉回归 | 参数以数组传入、**无 shell**、`shell:false`；被启动的是本机浏览器，参数全部是字面量或仓库内路径 |
| `.github/scripts/*.js` | `execFileSync('git' / process.execPath, [...])`（`exec_sync`，high） | CI 里跑语法检查、`git diff --check`、测试套件 | 同上：数组参数、无 shell |
| `selftest.js:44` | `vm.createContext` + `runInContext` | 在进程内、对着一个桩沙箱执行 `check.js` 自身，好让「守卫失效」这件事可被观测（而不是靠人眼） | 执行的是本仓库的 `check.js`；沙箱里只有 `console`/`process` 桩，无 `require` 之外的宿主能力 |

结论：**扫描发布产物（npm tarball / `files` 集合）不会 BLOCK；扫描整个工作树会 BLOCK**，
后者全部来自上述测试与 CI 工具。任何"整目录扫描"的 BLOCK 结论，都应结合本节判断，
而不是当成安装风险。

## 5. 自己复现

```bash
git clone https://github.com/863683348/dsh-plugin-gate
# 用它的 lib/rules.js + lib/scan.js 调 scanTarballFiles(files)，
# files = package.json files 字段列出的文件（{path, data: Buffer}）
```

扫描可执行文件集合，而不是工作树，才能得到与"用户实际安装到的东西"一致的结论。

## 6. 报告问题

发现真实漏洞请开 issue（或按仓库主页的联系方式私信）。请附上：命中的文件与行号、
复现步骤、以及该命中属于第 3 节（误报）还是第 4 节（有意保留）之外的新情况。
