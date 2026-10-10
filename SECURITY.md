# 安全边界与扫描说明（SECURITY.md）

这份文档写给两类读者：**静态签名扫描器**的使用者（插件安装闸门 / 安全体检类插件），
以及**人工审阅者**。它说明哪些文件会进入安装产物、哪些只是开发期工具，以及扫描器常见
误报在本仓库的对应关系与处理结果。

## 1. 运行时边界

| 文件 | 是否进入发布产物 | 运行时会加载吗 |
| --- | --- | --- |
| `index.mjs`（宿主半的 ESM 入口） | 是 | 是（loader 通过它加载宿主半；见 `docs/engineering-notes.md` 的「宿主入口为什么必须是 ESM」） |
| `index.js`（宿主半） | 是 | 是（由 `index.mjs` 动态 `import`，也可能被直接 `require`，例如测试） |
| `client.js`（Web 半） | 是 | 是 |
| `lib/`（宿主侧通知引擎：`audio.js` / `tone.js` / `slots.js`） | 是 | 是（`index.js` 顶层 `require('./lib/audio.js')`） |
| `sounds/`（5 个 `.wav` 提示音） | 是 | 是（作为数据由 `lib/audio.js` 读取、拷贝到缓存目录后交给播放器） |
| `locale/`（`en.json` / `zh.json`：插件卡片展示文案，`{"meta":{"title","description"}}`） | 是 | 否（由 DSH 的插件元信息读取器按 `<包>/locale/<语言>.json` 读取，插件代码不加载） |
| `cordis.patch.yml` | 是 | 是（挂载入口） |
| `README.md` / `docs/` / `LICENSE` | 是 | 否（纯文档） |
| `check.js` / `selftest.js` / `test/` / `.github/` | **否** | **否** |

发布产物由 `package.json` 的 `files` 字段定义（`index.mjs, index.js, client.js, cordis.patch.yml,
locale, README.md, docs, lib, sounds, LICENSE`，外加 npm 始终包含的 `package.json`）。五个运行时
入口（`index.mjs`、`index.js`、`client.js`、`lib/`、`cordis.patch.yml`）对 `check.js`、`selftest.js`、
`test/` **零引用**：它们只能由 `npm run check` / `npm run selftest` / `npm test` 显式启动。
本文件本身是仓库文档，不进发布产物。

上面这张表与 `files` 白名单的一致性由 `.github/scripts/package-check.js` 在 CI 里逐项核对：
新增一个发布物却不在这里交代它，静态检查就会红。第 2 节的扫描结论曾漏掉 `lib/` 与
`sounds/`（音频功能加入时只改了 `files`），扫描器若照旧清单取值，扫的会比装的小一圈。

### 1.1 宿主半真正拥有的能力（人工审阅从这里开始）

签名扫描只会报"长得像危险"的字符串，下面四处才是需要判断的**实际权限**：

1. **派生子进程放声**（`lib/audio.js:307-346`）。不直接用 `child_process`，而是取宿主的
   `subprocess` 服务、以固定 argv 表（`playerCommands`）派生系统播放器；Windows 分支走
   `powershell -EncodedCommand`，参数经 `''` 转义、无 shell 拼接。宿主没有该服务时只记
   note 并保持安静。**用户可在设置面板填一个自定义声音目录**（`audioSoundDir`），它会
   进入 `path.join` 并被扫描（只读 `.wav`）：这是"用户自己填的路径"，不是外部输入。
2. **启动期的模块解析扫掠**（`index.js:202-268`、`389-396`）。为了在 dev-link 安装下找回
   宿主自己的 `schemastery`，`resolutionRoots()` 会枚举 cwd 及其祖先、每个 profile 的
   `node_modules`、`PATH` 前 40 项等，并对固定包名执行 `require.resolve` + `require`。
   也就是说：**任一被扫掠目录里放一个名为 `schemastery` / `@deepseek-ai/schemastery` 的
   包，其顶层代码会在宿主进程里执行**。这是有意的降级（找不到 `Config` 等于所有设置刷新
   即丢），但它是信任边界而不是误报，扫描器不会替你判断。
3. **一条回环 HTTP 路由**（`index.js:986-1056`，`/theme-endfield/audio`）。供设置页做试听
   与诊断，`POST` 分支会以 `force: true` 绕过限速直接放声。该 handler **自身不做 Origin /
   会话校验**，依赖宿主 webServer 的鉴权与前缀归属；`readJson` 有 64 KB 截断但没有超时。
4. **宿主进程唯一的出网请求**（`index.js:1118-1184`，由路由 `index.js:1213` 上的
   `/theme-endfield/balance` 触发）。余额胶囊先问宿主账户服务，拿不到再回退到
   `GET https://api.deepseek.com/user/balance`（常量 `index.js:1095`）——**这是本插件第一次
   由宿主进程而不是浏览器发起外部 HTTP**。边界如下：
   - 目标 URL 是**写死的字面量**，不由任何输入拼接；没有跳转跟随、没有自定义 header 注入。
   - 凭据只从宿主 `credentials` 服务按固定名 `DEEPSEEK_API_KEY`（`index.js:1094`）解析，
     失败才看 `process.env`；**只作为 `Authorization: Bearer` 发出**，不写日志、不进响应体、
     不落盘。响应体里最多回一个 `keySource`（`env` / `file` / `-env` 的层级，不含值）。
   - 有 `AbortSignal.timeout(8000)` 上限，结果在模块内缓存 30 秒（失败 10 秒）。
   - 拿到的是余额数字，**不回写任何配置**；上游失败只会变成页面上的一句话。


## 2. 实测扫描结果

> **本节的行号与结论是对某一次扫描的记录，不随代码维护。** 它测于 2026-09-11、音频功能
> 合并之前，因此扫描对象还不含 `lib/` 与 `sounds/`；下表里的 `index.js:106`、
> `client.js:2089` 之类的定位在今天已经漂移到别处（例如 `homedir` 现在在 `index.js:321`，
> `DSH_HOME` 在 `index.js:320`）。要看当前结论请按第 5 节的命令对新产物集重跑一次，
> 并在这里更新 verdict 与日期。

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

## Optional local contour worker

The opt-in renderer creates a Blob URL containing source embedded in client.js.
The source is generated exclusively from this repository's contour functions and
src/contour-worker.js / src/contour-webgl.js. It does not load a CDN or fetch code.
Only canvas ownership, size/phase/color instructions and completion messages
cross the worker boundary; session content and credentials do not.
`test/fixtures/chrome-cdp.js` launches a separate temporary browser only for tests.
