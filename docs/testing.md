# 测试与校验

```bash
node check.js      # 样式表静态不变量
node selftest.js   # 反向验证 check.js 真能抓到那些问题
npm test           # 上面两项 + 配色 / 设置页 / 渲染 / 覆盖率 / 性能全部验证
```

本仓库的测试有一条贯穿原则：**从真实 `client.js` 里读值，不复述数值。** 复述只能测到副本——一次样式表编辑后，测试仍会对着旧数字通过。

第二条原则：**每条断言都做过反向对照（变异验证）。** 故意把被测行为改坏，确认该断言真的会失败。一个从未被观察到失败过的校验，不能算证据。

> **运行环境。** 带「真实浏览器」字样的脚本会 spawn 本机 Chrome 做无头渲染，需要本机安装 Chrome。以下脚本是**纯进程内**的，任何环境都能跑：`check.js`、`selftest.js`、`palette-contrast`、`settings-rows`、`settings-locale`、`thunder-edges`。

---

## check.js — 样式表静态不变量

主题样式表是**一整个 JavaScript 模板字符串**，有几类改动会在「文件仍能解析」的情况下悄悄破坏效果。检查项：

| 检查 | 守的是什么 |
| --- | --- |
| 模板字符串内无反引号 | 写在 CSS 注释里也会提前闭合，整个 client bundle 解析失败 |
| 无 `${...}` | 在模板字符串里那是插值，不是 CSS |
| CSS 注释成对、花括号配平 | 花括号在剥离注释后再统计 |
| 顶层没有漏进散文 | 抓「注释提前闭合」——注释本身仍是配平的，真正的破坏是残留文字落到顶层、与下一条选择器黏在一起 |
| `--edge-word` / `--edge-gap` 在**实际生效的 CSS** 里有定义 | 注释里提到不算 |
| 10 个调色板变量全部有定义 | 缺任一变量都不会优雅降级：读它的每条声明都会被丢弃 |
| `body.theme-endfield-wuling` 块存在 | 缺这个块则切换按钮点了没反应 |
| 没有任何 `--edge-*` 变量在 `:root` 里引用 `--dsw-*` 令牌 | 结构化检查，守 [:root 陷阱](engineering-notes.md#变量必须声明在-body-而不是-root) |
| 样式表里没有 `--dsw-font-family:` / `--ds-font-family-code:` 声明 | 这两个令牌是**应用的公共接口**（应用用它渲染 UI 根字体），主题声明它就会连第三方挂件的字体一起改掉，见[字体令牌](engineering-notes.md#字体令牌是应用的公共接口不是主题的开关) |
| `client.js` 能编译 | 用 `vm.Script` 在进程内解析、不执行 |
| 回合状态标签仍通过 0.2 的两个 `--dsw-alias-label-deep-diving*` 令牌改色（且没有残留 `[class*='turnStatus']`） | 0.2 把该标签改成遮罩扫光文字，唯一能改色的途径就是那两个令牌；留着按类名匹配的旧规则会「改了但没生效」 |
| 雷霆大字仍从列表行的 `retainedBy.mainView` 解析当前会话、且仍经过 `thunderCurrentId(snap)` | 上游删掉了列表快照的 `current` 字段（view selection 移出 Controller）；退回读那个字段会让功能**永久静默**，见[生命周期与竞态](engineering-notes.md#五类生命周期与竞态) |
| `--dsw-menu-surface-fill` 在两种配色下都钉在 `var(--dsw-alias-bg-overlay)`，且不得退回出厂的 `#f8f9fa94` / `#43454a73` | 0.2 的菜单是「半透明材质 + 40px 模糊」，出厂填充（58% / 45%）在等高线底上合成到与页面只差几步 RGB，面板读成**没有背景**，见[菜单底色](#菜单底色) |
| 节假日表覆盖**当前北京年份**、每条 `makeup` 都是周六/周日、每条 span 逐日展开成自己的名字 | 排班表由主题本地保管，而通知每年 11 月才更新；缺年份、把调休挪到工作日、或抄错日期都会**静默**把假期按高峰计价，见[峰谷定价窗口与法定节假日](engineering-notes.md#峰谷定价窗口与法定节假日) |

## selftest.js — 校验器自检

把上述每个真实问题注入 `client.js` 的**副本**并断言 `check.js` 确实失败，同时断言注入本身生效（避免空跑）。

---

## 源码/产物一致性 — build-*.js --check

```bash
npm run check:host    # node scripts/build-host.js --check
npm run check:client  # node scripts/build-client.js --check
npm run check:worker  # node scripts/build-contour-worker.js --check
```

`client.js` 与 `index.js` 是 `src/` 下片段拼出来的产物（见 [工程笔记的「源码是真源，产物是拼出来的」](engineering-notes.md#源码是真源产物是拼出来的)）。这三条命令重新拼一遍并与仓库里的产物逐字节比较，守的是**没人能只改源码、忘了重新构建**。`npm run check` 与 `npm run test:ci` 的链首都串了这三条，CI 的 static job 里也单独跑一次（`构建产物未过期` 这一步）。

失败时长这样：

```text
client.js is stale (first difference at line 4096); run npm run build:client
```

照提示跑对应命令即可；改产物本身不是修法，下一次 `--check` 还会红。

`test/worker-eol.test.js` 是这三条门禁的**行尾**回归：它在临时目录里造一份 LF 检出和一份 CRLF 检出，断言两份都能通过 `build-contour-worker.js --check`、注入一处真实改动后必须失败、写模式产出的文件行尾统一。它的输入清单（`INPUTS`）跟着构建走 —— kernel 在 `src/client/20-contour.js`，生成块是独立片段 `src/client/21-contour-worker.embed.js`。改动构建输入时这个清单必须一起改，否则测试会在错误的文件上打印「通过」。

---

## 选择器与主题化落点

```bash
node test/selector-guard.test.js   # 静态：禁止哈希选择器，且哈希无关的钩子必须还在
node test/preset-chip.test.js      # 真实浏览器：头部预设徽章必须真的被主题化
```

**`selector-guard.test.js`** 是 issue #17 的守卫，分两部分：剥离注释后 bundle 里**不得**再出现 `<hash>_` 形式的类名（哈希 = 6 位混合大小写 + 下划线）；以及 JS 探测器和样式表依赖的**每个哈希无关钩子**都必须存在——少一个钩子，对应功能就会在真实页面上静默失效。

**`preset-chip.test.js`** 守的是这类字符串守卫**看不见**的那一半：钩子在源码里，不代表选择器真的匹配得到元素。它按**在运行中的 GUI 上量出来的**骨架搭夹具——包括那一层**没有 class 的插槽条目包裹层**：

```
_centerCol > _header > _titleRow > _titleCluster > _headerActions
  > div（无 class） > span._label > svg._icon
```

加载真实 `client.js`，然后断言**结果**而不是选择器文本：徽章被强调色填充、字为黑色；**并且尺寸仍是上游的**——180px 上限保留、实测宽度在合理范围（夹具里 90px）、包裹层保持 `display:block`、`_headerActions` 保持 `flex:none`。

最后那两条不是凑数：**主题在这里只负责配色，几何归上游**。曾经为了让徽章"撑满动作行"而压平包裹层 + 增长容器，真实页面上直接变成一条横贯会话列的黄色长条（976px 的行里占 923px）。这类断言要同时守住两侧：既不能没上色，也不能被拉成长条。

另配三条反向断言：插槽里没有徽章时容器必须保持上游的 `flex:none`（否则每个没有 preset 的会话都会被撑开）；同一插槽里 jobs 式条目的 `_label`（藏在下拉菜单深处、只有文字）必须保持原样；容器**之外**一个仅仅以 `_label` 结尾的标签也必须保持原样——后两条正是这条选择器必须靠"徽章自己带图标"来锁定、而不能裸匹配后代的原因。

夹具用语义假名（`probe_headerActions` 等）而不是真哈希，所以上游重新哈希不会让这条测试说谎；它能稳稳抓住「后缀写对了、层数写错了」这一类回归。**注意：这条测试的夹具本身就是它的核心资产**——它曾经漏掉那层无 class 包裹层，于是选择器在夹具上命中、测试全绿，而真实页面一个元素都没匹配到。改动夹具结构时，务必对着真实 DOM 核，别为了让选择器通过而搭。

> 变异验证 5 类：把选择器换回"漏掉包裹层"的那版 → 2 条断言红（含线上看到的灰底）；把图标判据换成裸后代 → jobs 标签与容器外 `_label` 两条反向断言红；重新加回"压平包裹层 + 增长容器" → 两条"变成长条"断言红。

---

## 样式表投递与幂等

```bash
npm run test:sheet                            # 真实浏览器：同 build 重复挂载不换表，换 build 必须换表
node .dsh-vision-toolkit/tmp/live-probe15.js  # live 复核（本地探针，不入库）
```

**`theme-sheet-refresh.test.js`** 守的是「代码明明改了、页面还是老样子」这类**不报错**的失效。`apply()` 的页面级幂等标志（`__dshThemeEndfieldApplied`）本意是挡 boot loader + cordis 组合造成的重复挂载，但 `dsh-client-modules` 的 `rebuilt()`/HMR 会把新 bundle 送进**已经跑过旧 build** 的长驻标签页，且这条路不走 dispose——布尔标志挡不住它，新代码在第一行就返回，旧样式表一直留到标签页关闭。

现在标志配一个 build marker：同 build 仍然短路，marker 缺失或不等就先摘掉旧样式表再正常安装。三段断言：源码里每次置标志都必须同时记 marker、dispose 必须一起释放、样式表首行注释必须等于 marker 字面量（`check.js` 禁止样式表里出现模板插值，所以这行只能是字面量，由这条断言钉住同步）；真实 DOM 上同 build 重复 `apply()` 不换表；删掉 marker 后再 `apply()` 必须换表（`replaced` / `staleGone` 都为真）。

marker 落在样式表首行，所以「页面挂的是哪一版」可以直接在控制台读出来：

```js
document.querySelector('style[data-plugin="dsh-theme-endfield"]').textContent.slice(0, 80)
```

```bash
npm run test:corners                          # 源码级：stadium/圆形规则必须带 corner-shape: round
```

**`corner-shape.test.js`** 守的是「999px 写了、画出来不是半圆」这一类失效：宿主在 `@supports (corner-shape:superellipse(1.5))` 里给全元素默认方圆角（Chrome 139+），主题里每条要「半圆/正圆」的规则必须在同一规则体里声明 `corner-shape: round`（999px 胶囊 ×3 + 50% 圆形化通道），余额胶囊家族（badge/ring/clock/brand-mark）由胶囊根规则继承豁免。老渲染器把它当未知属性丢弃，零成本。

---

**`live-probe15.js`** 是同一件事在真实 GUI 上的复核：全新导航后挂上的表首行就是当前 marker；随后模拟长驻标签页（保留标志、删掉 marker、把已挂样式表换成旧内容），再跑**服务器当场下发的那份 bundle**，旧表被摘掉、新表带上 marker，页面无异常。

---

## 配色

```bash
node test/palette-contrast.test.js   # 两套配色每个角色的对比度（从真实 CSS 里读值）
node test/palette-switch.test.js     # 真实浏览器里切换配色，22 项断言
node test/settings-buttons.test.js   # 强调色底上的按钮文字对比度（32 项，含回归守卫）
node test/hover-check.js             # 用 CDP 真的移动鼠标，验证真实 :hover 规则（3 个面，24 项）
node test/verify-shots.js            # 解码四张截图统计强调色像素
```

**`palette-contrast.test.js`** 从 `client.js` 的实际样式表里把变量读出来再验算。覆盖 27 项：实心底 + 墨色字达 AA、悬停底同样达标、回合状态四个色标对**两种**可能底色都达 AA、暗色强调色作图标墨色 ≥3、两配色的等高线合成对比度相差 ≤20% 且高于 1.06 感知下限、hero 光晕不比原品牌蓝更响（该 `*_heroGlow` 模块在 0.2 已不存在，规则保留为自愈钩子）、两配色确实不同、强调色写成 6 位十六进制，以及**武陵青的亮度必须落在 45%–56% 区间且留在青碧色轴上**。

**`palette-switch.test.js`** 在真实浏览器里跑真实 `client.js`，并**按应用的真实方式把令牌写成 `<body>` 行内样式**——用样式表 `:root` 假装会让测试通过而线上坏掉，这种不对称正是它存在的理由。断言：默认是谷地黄且不带 class；11 个变量全部**非空**；`--dsw-alias-brand-primary` 在切换后**自动**变成青色（令牌层没有重新注册）；`rgba(var(--rgb), α)` 型半透明色块随之切换；**回合状态文字换色**（0.2 的 `<hash>_running` 读 `--dsw-alias-label-deep-diving`，页面按 0.2 的真实 CSS 造形，量的是真实机制而不是 0.1.x 的渐变文本）；**画布被重绘且新描边偏青**（B 通道高于 R）；关闭主题后不残留 class。

**`settings-buttons.test.js`** 读计算样式，用同特异度的 `.HOVERPROBE` 类替代 `:hover`。这是合理的层叠等价，但反向对照暴露了它的边界（见[验证方法论](engineering-notes.md#计算样式触发不了-hover)），因此有了下一个脚本。

**`hover-check.js`** 通过 DevTools 协议**真的移动鼠标**到按钮上，再截图量字形与填充的对比度。夹具用的是**当前安装态 bundle 里逐字抄下来的上游 CSS**，覆盖三个面：设置 › 模型的 `编辑`（`_secondaryButton`，强调底落在按钮自己身上）、`添加模型提供商`（`_addButton` **及其外层 `_addActions` 包裹层**——这一条就是模型设置页那次反馈）、输入区 `+`（`_add` 钩子的真实目标，收敛作用域后必须仍在反色）。每个面在两种配色 × 两种模式下各测字形对比度；添加按钮额外断言**外层容器不得被实心强调色填充**，输入区 `+` 额外断言悬停底色**仍是实心强调色**、常态墨色在暗色下仍是强调色、亮色下**不被暗色规则上色**。反向对照：把 `client.js` 换回修复前那版，模型页两条断言在暗色下报 1.06:1 / 1.75:1 红，与反馈截图吻合。

**`verify-shots.js`** 只用 `zlib` 解码 PNG（不引依赖），按色相家族统计像素，用「黄 5.47% → 0.39%、青 0.42% → 5.40%、中性约 93% 不变」这样的数字代替「看起来像换了」。

---

## 菜单底色

```bash
node test/menu-surface.test.js   # 真实 MenuSurface 标记 + 两种配色 + 像素证明「不透出」
```

**`menu-surface.test.js`** 守的是 0.2 起**所有菜单共用**的那套材质。菜单不再自己上色：`MenuSurface` 原语在面板**背后**挂一层 `_material`（绝对定位、`inset:0`、`z-index:-1`、`pointer-events:none`），值来自 `background: var(--dsw-menu-surface-fill)`，再叠 `backdrop-filter: var(--dsw-menu-backdrop-filter)`（平台默认 `blur(40px) saturate(150%)`）；`--dsw-specific-menu` 也只是 `var(--dsw-menu-surface-fill)` 的别名，所以**一个令牌**就覆盖了斜杠命令菜单、模型选择、右键菜单。

出厂填充是**半透明字面量**：亮色 `#f8f9fa94`（58%）、暗色 `#43454a73`（45%）。在纯色底上它靠 40px 模糊兜住；在本主题的等高线底上，合成结果与页面底色只差几个 RGB 步进，于是面板看起来「没有背景」，会话文字直接透出来（用户反馈：「菜单的背景没了」）。

夹具照**安装态真实标记**搭：`_surface` / `_material` 两层 + `data-menu-material="translucent"` + 设计平台的默认令牌 + 那几条 CSS；背景铺一条 8px 的青色条纹当作「会被透出的东西」。同一个页面跑两次真实浏览器——出厂默认、以及主题加载后（令牌按应用的真实做法写成 `<body>` 行内样式），**两种配色各跑一遍**（`node test/menu-surface.test.js dark` / `light`，两个值都在 `test` 链里）。断言：

- 出厂填充确实是半透明（`rgba(67, 69, 74, 0.45)` / `rgba(248, 249, 250, 0.58)`；Chrome 把 115/255 序列化成 0.45）；
- 主题后填充是不透明 `rgb(28, 30, 28)`（亮色 `rgb(242, 242, 236)`），`--dsw-specific-menu` 探针同值；
- 40px 模糊**仍在**（那是平台自己的合成路径与 macOS backing，主题故意不动）；
- 菜单填充**不等于**页面底色——「不透明但用了页面色」是另一种形式的没有背景，而应用自己在 macOS 上的不透明 backing 用的正是 `--dsw-alias-bg-base`；
- **像素**：菜单矩形内一条 344×116 的无字带，主题渲染下**与填充不同的像素为 0**；出厂渲染下差异 9280px / 12 种颜色（阴性对照，证明夹具真的能复现这个 bug，而不只是「夹具恰好是纯色」）。

> 变异验证：把令牌值换回出厂的 `#43454a73` → 「不透明」与像素两条断言全红，`check.js` 的同名守卫 + `selftest.js` 的注入用例在静态层也报错。

---

## 顶部余额胶囊

```bash
node test/balance-window.test.js         # 峰谷窗口算术（纯函数，从 client.js 切片）
node test/balance-capsule.test.js        # 胶囊标记 / CSS / 绘制 / 设置行（静态切片）
node test/balance-bridge-api-key.test.js # 宿主余额桥：账户优先、API Key 回退、失败原因
node test/balance-diagnosis.test.js      # 设置行如何解释空胶囊（真实面板 + 桩路由）
```

**`balance-bridge-api-key.test.js`** 是本仓库唯一**真的调用 `HOST.apply` 一半**的余额测试：它 `require('index.js')`，用桩 `credentials` 服务与桩 `fetch` 驱动 `readApiKeyBalance` 与路由 handler，**不打网络**（路由的 `fetch` 是注入的 `globalThis.fetch`，每条用例 `restoreFetch()` 复原）。35 项断言分两组：

- **读函数**：无凭据服务 / `resolve` 返回 `undefined` / `resolve` 抛错，三者都必须落成 `why: 'no-api-key'` 而**不抛**；厂商信封 `{ balance_infos: [{ currency, total_balance }] }` 映射成 `{ currency, balance }` 且字符串原样透传（`11.26` 不是 `11.2600001`）；USD 与数字型 `total_balance` 都能过；**半空条目被丢弃而不是补 0**——补 0 恰好就是胶囊文档里承诺绝不画的东西；`401/403` 报 `api-key rejected`、`5xx` 报带状态码的 `balance http 500`（两者要给用户完全不同的建议）；`fetch` 抛错变成 `balance request failed: …` 前缀且不逃逸；无 `fetch` 的运行时报 `fetch unavailable`；没有凭据服务时 `process.env.DEEPSEEK_API_KEY` 是第二来源且 `source === 'env'`。另有两条**防泄漏**断言：密钥值不得出现在返回体里，`keySource` 只暴露 `env/file/-env` 层级。
- **路由**：账户 `ready` 时 `source: 'account'` 且 API Key 端点**一次都没被调用**；账户返回 `null`（本机没登录记录——正是这次故障的现场）时回退成 `source: 'api-key'` 并给出 `keySource`；紧接着的第二次请求命中 30 秒缓存、**上游读次数不增**；两个来源都没有时仍是 `200` + `ok:false` + `why:'no-api-key'` + `account:'null'`（页面据此写出「为什么是 `--`」）；相邻路径与非 `GET` 都是 `404`；账户服务缺失时 `account: 'account service absent'`。

模块作用域的缓存会让前一条用例喂饱后一条，所以每条路由用例都 `freshHost()`（清 `require.cache` 后重取 `index.js`）——这是**测试侧**的隔离手段，生产里那份缓存是要保留的（页面 60 秒轮询 + 多标签页不该变成多倍上游请求）。

**`balance-diagnosis.test.js`** 覆盖另一半：胶囊失败时**刻意保留上一次的数字**（闪一个错误状态比留旧值更糟），所以「为什么是 `--`」只能由设置页回答——这个文件就是把那句话钉住。它没有网络也没有浏览器，在 `vm` 里跑 `client.js`，用一个**带 `useEffect` 的记录型 React**（与 `settings-rows.test.js` 的极简桩不同，见下）渲染真实设置面板，`fetch` 换成一条固定回复，然后断言面板文字：

- 账户取到余额时**一句解释都不加**——没坏就不用解释；`source: 'api-key'` 时必须写明「这个数字来自 API Key，不是平台账户」，因为用户可能正对着平台页面核对。
- 路由能发出的每种 `why` 都对应**自己那句话**：`no-api-key`（没登录且没配 key）、`api-key rejected`（key 被上游拒绝）、其余（可重试的失败）——三者给用户的下一步动作完全不同，混成一句就等于没说。
- 该沉默时必须沉默：胶囊关着时不为一个屏幕上看不到的surface 写解释；桥完全不通（`fetch` reject）时不指控账户；页面没有 `fetch` 时面板仍要渲染。
- 最后一条是**行为**断言而不是文案断言：`useEffect(fn, [])` 必须只在挂载时读一次路由（三次渲染总共 2 次读取：胶囊自己 1 次 + 面板 1 次）。这条要求桩**尊重依赖数组**——最初把 `useEffect` 写成每次渲染都入队，于是正确的单次探针看起来像轮询循环，测试以错误的理由变红。

**`balance-window.test.js`** 把 `const BALANCE_HOLIDAY_NOTICES` 到 `const balancePaintWindow` 之间的源码切出来，在 `vm` 里用 `{ Math, Date }` 求值——切片边界本身就是断言，结构性改动会把切片挪走并响亮失败（旧版起点是 `const BALANCE_PEAK_WINDOWS`，节假日数据加在它之前后必须跟着改）。所有时刻都用 `bj(y, mo, d, h, mi, s) = new Date(Date.UTC(y, mo-1, d, h-8, mi, s))` 造成固定瞬时，因此结果与跑测试的机器时区无关。69 项断言分四组：

- **工作日**：周四 08:59 / 09:00 / 11:59 / 12:00 / 13:59 / 14:00 / 17:59 / 18:00 的峰谷；12-14 谷段 `totalMs = 2h`；20:00 的谷段一路读到次日 09:00（15h）；23:30 倒计时 9h30m。
- **周末**：周六 00:00 / 12:00 都是低谷，且窗口是 **Fri 18:00 → Mon 09:00 的 63h**（不是按天的 24h）；周日 23:00 剩 10h；周一 07:00 剩 2h；周六 09:40 剩 47h20m 且 `elapsedPct = 25`。
- **法定节假日**：元旦（周四）10:00 是低谷、`holiday = '元旦'`，窗口 12-31 18:00 → 01-05 09:00（111h）；春节窗口 255h，02-14 / 02-28 调休仍是低谷、02-24 回到高峰；清明 / 劳动 / 端午 / 中秋各自成对断言「节日当天低谷 + 次日高峰」；国庆（周一）10:00 低谷、窗口 183h、10-07 23:59 剩 9h01m、10-08 00:00 仍是同一段谷、10-08 09:00 高峰；**2027-01-01 无表可查 → 回退按工作日高峰**，把「未收录年份的代价」钉住。
- **表完整性**：展开恰为 33 天（3+9+3+5+3+3+7）、每条 span 每一天都映射到自己的名字；末尾三个断言直接调用切出来的**真** `balanceFormatCountdown`（旧版是在测试里重写一遍格式化，等于什么都没验）。

**`balance-capsule.test.js`** 从安装态标记里切片：胶囊 DOM 顺序、`slotsWritten` 只允许写标记内已存在的属性（例外集 `STATE_ATTRS`）、样式表选择器不得成孤儿、圆环 `conic-gradient` / `mask` / `elapsedPct * 3.6`、药丸 32px / 999px / `min-width: 300px`、**480px → 316px 两级窄屏断点**、开场 pose 448×72、品牌 lockup。本次新增的一条断言把节假日的落点钉死：**`win.holiday` 只被一行读取，且那一行在 brand-title 块内**——胶囊宽 300px、316px 断点由它推出，节假日名一旦爬进「时段剩余」行就会撑宽。窄屏两级也各自钉死：480px 只隐藏 `data-endfield-balance-remain-run`（「时段剩余hh:mm:ss」，手机宽度）、且**不得**触碰 `phase`（高峰/低谷 标签要留下）、必须排在 316px 之前（阶梯，而不是互相遮蔽）；同格里还断言 `min-width: 0` 与隐藏规则**写在同一个媒体块里**——地板不让，读数减少后 `margin-left: auto` 会把富余像素全吞成空白，胶囊根本不会变短。

收起动画新增三条互相咬合的断言（成因见 [engineering-notes.md § 胶囊收起：transition 不能和状态选择器同生共死](engineering-notes.md#胶囊收起transition-不能和状态选择器同生共死)）：基础选择器 `[data-endfield-balance] > :not(brand)` 携带 `transition: opacity … <延迟>`；pose 选择器**只许**按住 `opacity: 0`、出现 transition 即失败；品牌层自己的 transition 也必须挂在基础规则上。用 `node .dsh-vision-toolkit/tmp/pose-probe.js`（每 40ms 采样 computed height / opacity）可复现修复前的 `rowO: 0 → 1` 跳帧，与修复后的 0 → 0.16 → 0.36 → 0.65 → 0.94 → 1 平滑爬升。

形状不变式（成因见 [engineering-notes.md § 胶囊两端不圆：形状不能依赖"收起时写回"](engineering-notes.md#胶囊两端不圆形状不能依赖收起时写回)）：轮廓是**画出来的**——`balance-capsule.test.js` 钉住三层渐变（两个端头 `radial-gradient` 圆盘 + 中间实色带、都以 `--endfield-balance-cap` 定位）、`@property` 把 cap 注册为 `<length>` 且 pose 态 36px / 基础态 16px、transition 列表补间该属性，以及挂载把 `border-radius` 钉为 `0 !important`（源码不得再出现 999px / 14px 的半径写入——任何裁剪盒都会把坏渲染器的 squircle 重新暴露）。锁步可用 `node .dsh-vision-toolkit/tmp/drawn-check.js` 复测：每 30ms 采样 computed height 与 cap，断言 |cap − height/2| ≤ 0.6px。

> 变异验证：`check.js` 第 7 段配 `selftest.js` 三条注入用例——把当前年份改名、把 `05-09` 调休写成周五、把清明 span 伸回 01-01 造成重叠——分别得到「no entry for the current Beijing year」「not a Saturday or Sunday」「does not expand to its own name」。

---

## 输出滚动动画

```bash
npm run test:scroll                   # node test/scroll-anim.test.js
```

这个功能有两种**完全相反**的失败方式，而显而易见的那种实现恰好会踩中第二种：**没有可见效果**（补偿晚了一帧，原始硬跳照常绘制——看起来像个死功能），以及**跟随被破坏**（`scroll-behavior: smooth` 或任何写 `scrollTop` 的写法：实测回读拿到旧位置、`floor - oldTop > 25` 把跟随意图翻成「读者已离开」，于是输出静默地不再跟随自己）。因此这份测试的断言必须同时守住两侧，而且每一条视觉结论都要配一个**在同一页里取到的**负向对照。

**A 部分——源码接线，不用浏览器。** 从 `client.js` 里切出本功能的片段（而不是整个 bundle：整个 bundle 本来就没写 `scrollTop`，切片才让「这段代码从不移动端口」成为关于**设计**的陈述，而不是当前文件的巧合）。断言：片段里**不得**出现任何 `scrollTop` 赋值或 `scrollTo(` 调用（应用的跟随意图就是从写后回读推出来的）；必须挂的是 passive 的 `scroll` 监听；端口与对话栏都只能用无哈希的 `data-conversation-scroll` / `data-chat-flow` 钩子；片段里不得出现任何哈希类名；`prefers-reduced-motion`、`wasAtFloor` 与 `delta <= 0.5` 这几个门控表达式必须真实存在；卸载与挂载路径必须分别调到 `destroyScrollAnim()` / `syncScrollAnim()`，且页面观察器的钩子必须在每一次渲染后重新挂上。最后是 prefs 契约：两个新字段必须在 `FIELD_DEFAULTS` 里声明（`scrollAnim` 出厂为 `'1'`，即默认开启）、且 UI 键必须映射到声明字段（issue #15 那一类 bug：字段名对不上就静默落盘到没人读的地方）。

**B 部分——真实浏览器里的真实产物。** 夹具按**发布版 bundle 里的真实链条**搭（类名、以及那条 `overflow: visible clip` 包含关系都是照抄的——「transform 会不会把端口撑大」正是这个设计依赖的前提）。每次跑都先做控制组、再做功能开，两趟走同一段代码路径：

| 断言 | 内容 |
| --- | --- |
| 挂上了 | 端口被标成 `idle`，说明运行时真的接上了真实滚动容器 |
| **负向对照**（功能关） | 一个步进必须画成整段硬跳：`maxStep == rawStride`（96px），且零 transform——**这一条失败就说明夹具根本没有复现它声称要消除的那个硬跳**，后面所有「平滑了」的结论都不成立 |
| 平滑 | 最差单帧屏上位移 96px → 约 20–38px（低于控制组的 80%），且最大 transform > 5px（真的动了对话栏） |
| **时机** | 从静止起单独做一次钉底，**下一帧**必须已经看到 transform：这条守的是「补偿必须写在 `scroll` 处理函数里，不能挪进 `rAF`」——一个把绘制延后一帧的变体在本夹具上能骗过平滑断言（实测在更大夹具上退化到 224px），却会在这一条上直接红（见下方变异验证） |
| 诚实 | 应用写 `scrollTop` 后的回读误差**恰好为 0**（并统计回读次数，确保这条路真的被走到过）——这就是 `scroll-behavior: smooth` 那条否决的可执行形式 |
| 静止 | transform 被清空、端口回到 `idle`、且相对应用自己的 floor 残差为 0（不是「差不多」） |
| 滞后 | **两个速率**各测一次：真实流式（96px/s）中位数 ≤24px（实测约 3px），夸张合成速率（1600px/s）只要求有界（实测约 110px）；并断言**最小值不得为负**——负滞后物理上不可能，出现即说明基线取早了、整个指标不可信（本仓库踩过：基线早 9.6px → 指标读到 -12px） |
| 被兜住 | `translateY(240px)` 后 `scrollHeight` 与 floor 都不变 |
| React 替换 | 在 offset **飞行中**替换对话栏 / 整个端口：旧节点必须不留 transform 与状态钩子，新节点必须接上并且能动画 |
| 多端口 | 第二个滚动容器（嵌入视图）必须能挂上、独立动画、被移除时干净卸载 |
| **布局重排** | 按真实 `ReasoningRow` 的形状（折叠 24px 盒子 + 展开挂载 body）展开，并用应用自己的 `ResizeObserver` 触发重钉底：位移**不得比关闭功能时更多**、且**不得产生任何 transform**。这条是为用户报告的「展开思考时抽搐」补的回归 |

**门控**在同一页里逐条实测，且必须**两侧都成立**：流式步进必须真的产生 offset（门控不能太紧——把正常跟随也判成「非流式」就是一种静默失效），而滚轮手势、向上滚动、从阅读位置跳转、超大步进**必须**保持瞬时。

> 这条门控测试自己踩过一个坑，值得记下：第一版「增长内容再钉底」是把 `scrollTop` 写在一个**已经钉在底部**的端口上，于是写入被钳制成零位移，门控根本没被测到、还报了一次假失败。现在的 `streamStep()` 先把内容长高、再让应用去钉底，也就是流式真正的形状：端口**结束**在 floor 上、**开始**时在它上方 d px。
>
> 「从阅读位置跳转」那一条还踩过第二个坑，更隐蔽：第一版先退 700px 再跳回底部，可 700px 本来就超过 `cap`、会被**另一条**门控拒绝，于是把 `wasAtFloor` 整段删掉测试照样全绿。现在这一条让读者停在离底 100px、由应用钉一段 250px 的内容（低于 `cap`、且只有「端口确实在底部」才能成立），`wasAtFloor` 因此成了唯一能拒绝它的判据。
>
> 而「布局重排」那一条是**被用户实测补上来的**：原有四条几何门控看似充分（从底部出发 + 向下 + 不超 cap），但展开折叠区同样满足这三条。少了这一条时，展开思考块会凭空多出 159px 位移并花 659ms 滑回来。它的判别力由变异 **M4**（把补偿改回 `visual = delta`，即修复前的代码）验证——该断言报 `151.5px vs 0.5px` 变红。


**reduced-motion** 用替换 `matchMedia` 的方式让 `prefers-reduced-motion` 答「是」，断言开关仍是开的时候补偿**完全不发生**（系统偏好压过开关）。

**关闭即释放**：先让 offset 真的存在（同样是「长高再钉底」的形状，写在一个已钉底的端口上会没有东西可释放），再把开关拨到 `'0'`，断言 offset 立即清空、之后保持惰性、且端口上的状态钩子被摘掉——一个变成孤儿的 transform 会让对话栏在本次会话余下的时间里一直偏移。

> **变异验证 2 类，都必须报错**（这两条正是由一个独立复核者先发现「测试抓不住」才补上的）：
>
> | 注入 | 症状 | 现在由哪条断言抓住 |
> | --- | --- | --- |
> | 把 `scrollAnimPaint` 从 `scroll` 处理函数挪进 `requestAnimationFrame` | 本夹具上**完全看不出**（平滑断言照过），但更大的夹具上最差单帧退到 **224px** | **时机**那条：从静止起单次钉底，下一帧必须已经有 transform |
> | 删掉 `!wasAtFloor` | 读者停在历史中间时被强行动画（250px 被摊成 51px 帧步） | **门控**里「从阅读位置跳转」那条（重构后 `wasAtFloor` 是唯一能拒绝它的判据） |
>
> 注入脚本在 `.dsh-vision-toolkit/tmp/mutation-check.js`（本地探针，不入库）。注意它**不用 `git checkout` 还原**：本片段是新文件、不在 HEAD 里，而暂存区当时还是旧版本，`git checkout --` 会静默复活一个已经修掉的缺陷。它改为按字节备份并在结束时校验 SHA256 一致。


> 与其它浏览器用例一样，脚本最后断言页面**没有报任何错误**；它 spawn 本机 Chrome 做无头渲染（见开头的运行环境说明）。

---

## 设置页

```bash
node test/settings-rows.test.js     # 设置面板真实渲染 + 开关联动
node test/settings-durable-hold.test.js  # 命名空间未就绪时的写入 gate + 补写（旧世代 settingsScope）
node test/settings-config-forms.test.js  # 0.1.7 的 configForms transport（entry id / volatile / 拒写补写 / 退订）
node test/settings-config-fallback.test.js # Host Config 字段契约与选择顺序（不依赖本机 schemastery）
node test/settings-namespace.test.js # 存储字段名对齐 schema + 旧拼写迁移 + 三条读/写边界
node test/settings-off.test.js      # 关闭主题后设置页仍可读
node test/settings-locale.test.js   # 跟随语言设置（zh/en 词典对齐 + 切换生效）
node test/host-esm-entry.test.js    # ESM 宿主入口：default 上的转出面 + 无 schemastery 时仍能加载
```

**`settings-rows.test.js`** 不用浏览器也不用 React：以**记录型 `React` / `slots` + 假的设置 transport**（`test/fixtures/settings-scope.js`）在进程内跑一次真实 `apply()`，抓下设置面板真正的元素树。设置页是用户唯一能碰到这些开关的入口，而那里的错误（抛异常、漏 key、开关写错了 DSH 设置的字段）check.js 与画布测试都看不见。

> 说明：这个插件从 **`localStorage` 迁移到了 DSH 的持久化设置服务**（见 features.md / engineering-notes.md）。因此设置类测试不再往浏览器存储里塞值，而是驱动假的 transport：除 `settings-config-forms.test.js` 之外的用例走旧世代 `ctx.settingsScope`（fixture 的 `settingsScopeStub`，在内存里扮演 `<settings.yaml>` 的命名字段节），新世代由 `configFormsStub` 扮演 `ctx.configForms`（命名空间 = profile entry id）。断言 31 行齐全且归入 5 个分组容器、key 唯一、分组标题（01 主题 / 02 背景 / 03 动画 / 04 娱乐 / 05 音频）与配色样式规则都在、配色行默认显示谷地黄且按钮提供「切换武陵青」、点击把 `palette` 写成 `wuling`、存了 `wuling` 时反向提供「切换谷地黄」并标注 `#14d0d0`、图层关闭时子开关为 disabled、开启后恢复可用，雷霆大字与大字入场动画均默认为关、说明文字包含「任务开始」/「任务完成」与 3 秒、**子开关只写自己的字段而不误写主开关的**，以及点击确实写入文档里那个 DSH 设置字段。

**`settings-durable-hold.test.js`**（旧世代 `settingsScope` 路径；0.1.7 上同一份写入 gate / 补写契约由 `settings-config-forms.test.js` 覆盖）用**两阶段假 `ctx.settingsScope`** 复现那条历史告警：宿主半部 `ctx.settings.register(...)` 尚未跑、命名空间还没进 Host 的 served 列表前，scope 快照是 `{ status:'unavailable', writable:true, mode:'host' }`——单看 `writable` 会照写不误却落不到盘。它先在未就绪态切「圆角 / 武陵青」，断言**没有任何 `scope.set` 出线**（旧 bug 会打 `commit … status= unavailable` 并静默丢脏）；随后模拟文档 committed、命名空间进入 served 列表、快照翻为 `status:'ready'`，断言订阅路径把两份 held 编辑**自动补写**进文档，且不会重复写两遍（replay 有 re-entrancy 护栏）。

**`settings-config-forms.test.js`** 守的是 0.1.7-rc.1 换掉整套 settings API 之后最容易「看起来正常、其实没保存」的几处：它用假 `configForms` 服务（fixture 的 `configFormsStub`，只有被 `serve()` 过的命名空间才报 `status:'ready'`）驱动真实 client，断言

- **两半的 entry id 一致**：`client.js` 的 `PREFS_ENTRY` == `index.js` 的 `SETTINGS_ENTRY` == `cordis.patch.yml` 里那一行的 `id`（命名空间是 entry id，任一处对不上就全程读不到）；
- **Host `Config` 真的可编辑**：31 个字段齐全、无多余字段、**每个字段都带 `.volatile()`** 且默认值等于 `FIELD_DEFAULTS`——漏一个 volatile 就是 0.1.7 版的「设置保存不了」（该断言在拿不到 schemastery 的环境里自动跳过，CI 无 DSH 时不会误报——**也正因为会跳过，它没能在唯一要紧的环境里发现问题**：本机 web profile 恰好就是「拿不到可用的 schemastery」这台机器，于是这一整段断言空跑，`Config` 缺失一路绿灯。字段契约与选择顺序现由 `settings-config-fallback.test.js` 无条件断言）；
- **被 served 的表单会被绑定并采纳**（存档里的 `palette: wuling` 直接落到 `<body>` 的 class）；
- **entry id 是探测出来的**：只 served `include:theme-endfield` 时写入也落在那个拼写上；
- **拒写与未就绪都算 held**：`set()` 解析为 `false`、或命名空间尚未 served 时，编辑不改变文档、也不假装保存；一旦拒写解除（下一次快照）或命名空间进入 served，held 编辑被自动补写；
- **memory 模式（非 loopback 页面）永不下盘**：一次写都不发生；
- **静默 ready**：命名空间开始被服务但镜像**完全不通知**任何表单时，有界 settle watch（20 × 500ms）会自己重新读取、采纳、切到被 served 的拼写并补写——这是旧世代 250 ms binder 轮询的等价安全网；
- **退订**：run 拆除时调用 `form.subscribe()` 返回的 disposer（`ConfigForm` 是 provider 拥有、跨插件共享的实例，漏掉就是给下一次 run 泄漏监听器）。

> 覆盖面说明：0.1.7 transport 由上面这个用例在**进程内**验证。三个 headless 浏览器用例（`settings-off` / `settings-buttons` / `loader-late-prefs`）注入的仍是旧世代 `settingsScope` 缝（`test/fixtures/settings-scope.browser.js`），因为它们验证的是渲染、对比度与启动动画，与 transport 是哪一代无关。

> **「设置刷新后复位」的排查顺序。** 这条症状有两个完全不同的成因，先分清再动手：
>
> 1. **Host 半没导出 `Config`** —— 用 `cordis_inspect` 的 host `Config.listConfigs`（或 `dsh` 的插件面板）看该 entry 的状态：`absent` 就是没有 Config，`schema` 才是正常。此时 DSH 根本不投影表单，client 只能停在 session-local。成因见[工程笔记](engineering-notes.md#加载期解析-schemasterydev-link-安装必须显式去找v111-起加固v112-加自检报告v1113-改为结构化扫描)：dev-link 安装下 `require('@deepseek-ai/schemastery')` 必然失败，要靠 `resolutionRoots()` 显式找回。**注意「找不到」有两种，修法不同**：候选根全都解析不到（报告里是 `error: MODULE_NOT_FOUND`），与「解析得到、require 却抛错」（报告里是 `loadError`，v1.1.5 起才有这个字段）——后者本机就是如此：唯一带 `.volatile()` 的 3.18.4 解析得到但加载失败，而能加载的两个副本都没有 `.volatile()`。自 v1.1.5 起，只要还有一个能设 `meta.volatile` 的 builder（哪怕没有 `.volatile()`，靠 `.extra('volatile', true)` 合成）就照样投影表单，见[找不到 .volatile() 也必须能存](engineering-notes.md#找不到-volatile-也必须能存v115)。
> 2. **Host 侧代码太旧**（进程里跑的还是上一次启动时 import 的模块）。**浏览器刷新只重载 `client.js`**；`index.js` 的改动必须**整进程重启 DSH** 才生效，`dsh-hmr` 不观察 `**/node_modules`。
>
> 一个能直接分辨两者的判据：构建不出 `Config` 时，`index.js` 会往 profile 目录写 `theme-endfield-diagnostic.json`（成功则自动删除）。**该文件存在**说明进程里的代码已经是新的、且**连一个能设 volatile 标记的 builder 都没拿到**（文件里有每个候选根的 `require.resolve` / `require` 结果、`schemaMode` 与 `loaderStartedAt`）；**该文件不存在而状态仍是 `absent`** 说明进程里跑的还是旧模块——重启，而不是改代码。
>
> 另有一条纯命令行的等价验证（在仓库根目录跑）：`node test/settings-config-forms.test.js` —— 它 `require` 的正是真实 `index.js`，路径解析与 Host 进程完全一致，因此它能直接回答「这台机器上 `Config` 到底能不能构建出来」（拿不到 schemastery 时该断言自动跳过并打印原因）；`node test/settings-config-fallback.test.js` 进一步**不依赖本机 schemastery**，无条件断言字段契约与选择顺序。

**`settings-namespace.test.js`** 守的是 issue #15：**存进命名空间的字段名必须与 Host schema 一致**。它不信任任何一侧的字面量，而是三份交叉验证——从 `client.js` 源码里读出的 `PREFS_KEY_TO_FIELD`、Host `index.js` 的 `FIELD_DEFAULTS`、以及设置面板**真实渲染出来的**每个开关（点击后断言出线的字段名是声明字段，且没有任何未声明字段的写入）。六条复合字段（`contourAnim` / `contourFps` / `contourSpeed` / `contourScrollPause` / `watermarkPersist` / `thunderAnim`）逐条覆盖——**只测单字段的用例抓不到这个 bug**，因为它们新旧写法恰好同名。

随后用它复现线上存档的形状（声明字段在默认值旁多出一行旧拼写键），断言这些值被搬回声明字段、且**不会**凭空给没记录过的字段写值；再断言反过来的一条：用户真的在声明字段上设过非默认值时，旧拼写的键**不得**覆盖它。

最后两条是同 issue 里的另两个发现：写入后面板必须**立刻**读到新值（不依赖宿主回相），以及命名空间未就绪时「改回默认值」的编辑不能因为「本地值等于默认」就被丢掉。

> 变异验证 7 类，全部必须报错：把 `prefsFieldOf` 改回按前缀推导（原始 bug）、表里某条映射到相邻的错字段、删掉迁移、让迁移覆盖用户设过的值、`prefsSet` 不再叠加本地值（旧读序）、脏标记在「等于宿主值」时直接清、脏标记在「等于默认值」时直接清。

**`settings-off.test.js`** 守的是设置页自己最脆弱的时刻：**开关按钮的强调色底来自主题样式表，而样式表随主题关闭被移除**。它在真实浏览器里加载真实 `client.js`，以应用**自己的默认令牌**（亮 / 暗两套）把主题关掉，用 `slots` 桩抓出真实元素树并物化成 DOM，然后断言每个按钮的合成对比度 ≥ 4.5。

> 这个测试抓到过真 bug：修复前暗色模式下「切换武陵青」与「切为静态」两个常亮按钮是 `#000` 落在透明底上、对深色面板仅约 1.1:1，修复后全部 ≥ 11.5:1。

**`settings-locale.test.js`** 配一个按运行时契约造形的假 `locale` 服务（`register(ns, dicts)` / `bind(ns)`，含 `active → en → 键名` 的查找链，并**复现真实服务对重复 `(ns, locale)` 的抛错**）。覆盖：注册了自己的命名空间；**en 与 zh 键集完全一致**、无空译文、且两种语言实质不同（防止「翻译」其实是复制）；注册声明了 `locale:`、`label` 是 thunk 且随语言变化；zh 渲染为中文而 **en 渲染无任何残留中文与中日韩标点**；未知语言回退到 en 而不漏键名；词典只注册一次、可随 `ctx.effect` 注销并重新注册；以及**完全没有 locale 服务时页面照常渲染为中文、且不声明 `locale:`**。

---

## 启动加载屏

```bash
node test/loader-performance.test.js   # 启动窗口内的开销与几何
node test/loader-late-prefs.test.js    # 设置节晚于 apply() 到达时，动画还播不播
```

**`loader-late-prefs.test.js`** 守的是「开关明明写着开，启动动画却再也不出现」。加载屏在 `apply()` 里**同步读一次** `loader` 就决定播不播，而真实页面上设置节是**走线上拉的**：`settingsScope` 快照此刻还是 `{ status:'loading', value: undefined }`（见 `dsh-client-ui-settings` 的 `SettingsScopeSnapshot` 契约），于是这次读落到 schema 默认值 `'0'`——默认关——加载屏永远不播；而 `reconcileFromPrefs` 又**刻意不重放**启动屏（它是「每次页面加载只播一次」的片子），所以它再没有第二次机会。

这正是它比别的开关更脆的地方：其余每个由偏好驱动的表面都会在稍后的 ready 转变里重新推导（`mount` / `syncContour` / `syncThunder` / 圆角 / 配色…），**只有加载屏那次读取无从恢复**。修复由存储层的**首次权威节**（`prefsMarkSettled` → `onPrefsSettled`）回调启动屏，并仍然只播一次。

测试给 `__endfieldSettingsScope(initial, { readyDelayMs })` 传延迟，让假 scope 先答 `loading` 再翻 `ready`，三个场景各起一页真实浏览器（真实 `apply()` + 真实 DOM，轮询整个片子生命周期）：

- **A** 存 `loader:"1"`、节迟到 250ms —— 片子必须真的播出来（**这就是原 bug**）；
- **B** 存 `"0"` —— 不得播；
- **C** 首个节是 `"0"`、之后运行期改成 `"1"` —— 不得重放（每次页面加载只播一次的契约）。

> 变异验证 2 类，都必须报错：删掉订阅里的首次节回调（回到原 bug，A 立刻红）、去掉 `prefsSettledOnce` 一次性护栏（运行期改动会重放，C 立刻红）。

---

## 雷霆大字

```bash
node test/thunder-edges.test.js     # 边沿/生命周期/样式契约
node test/thunder-shot.js           # 真实渲染截图 + 像素对比度断言
node test/thunder-dismiss.test.js   # 点击关闭：真实指针事件 + 命中测试 + 监听器核账
```

**`thunder-edges.test.js`** 在进程内跑真实 `client.js`，配一个按运行时契约造形的假 `sessions` 服务和一个**可控时钟**，因此 3 秒窗口是被断言的而不是被等待的。覆盖：关闭时**不订阅**（零开销）；`false→true` 播「任务开始」、`true→false` 播「任务完成」；**同值连续推送 25 次不重复播报**；2999ms 仍在、3000ms 已隐藏；入场动画默认关闭时大字带静态标记、开启后不带，且两种状态下 3 秒时长都不变；系统「减少动态效果」压过已开启的动画开关；切进已在运行的会话不误报、但其结束仍播报；离开的会话被退订；关闭主题会移除大字并退订、重新开启会恢复；**服务迟到后仍能自动接上**；**新契约（当前会话 = 列表里被 `mainView` retain 的那一行）下能接上**、旧 `current` 契约仍兼容、列表连 `subscribe()` 都没有时靠有界重试补上；`ctx.effect` 拆除时释放全部订阅与节点。

另有 14 条**样式契约**断言（固定定位、居中、`pointer-events: none`、`font-weight: 900`、`clamp()` 字号、白色字面量、层级低于加载屏、`prefers-reduced-motion`、静态分支取消动画并强制 `opacity: 1`）——这些是本机无布局引擎时看不见、却最容易被后续重构悄悄改掉的视觉事实。

> 变异验证共 20 类：默认改成 opt-out、边沿退化成电平、去掉基线、时长改成 5s、两个词对调、不自动隐藏、去掉 `aria-hidden`、切换会话不退订、拆除不退订、白色换成令牌、粗体改成 400、层级盖过加载屏、服务缓存不重试、动画默认改成 opt-out、静态标记永不打 / 永远打、系统偏好不再覆盖、子开关误写主开关的键、子开关未禁用、静态分支丢掉 `opacity: 1`、**当前会话解析退回已删除的 `current` 字段**（=`check.js` 的 `mainView` 守卫 + `selftest.js` 里那条「回到已被移除的字段，于是永远静默」）。

**`thunder-shot.js`** 补的是结构断言看不见的那一半：**像素**。它在真实浏览器里跑真实 `client.js`，通过主题自己的订阅路径触发播报，输出亮 / 暗 × 开始 / 完成共四张截图，然后解码 PNG 并断言：中央带的近白像素占比（字形确实出现）、压暗底确实压暗（亮色）或仍为近黑（暗色）、以及白字对压暗后表面的**合成对比度 ≥ 3**。

**`thunder-dismiss.test.js`** 守「点击任意处立即关闭」——这条只能在真实浏览器里验，因为它本质是个**命中测试**问题。18 条断言覆盖：大字在屏幕上时空白处与被覆盖按钮的顶层元素**仍是页面自己的元素**；点空白处大字立即消失且**这一次点击照常抵达**；点真实按钮则**既关掉大字又触发按钮**；控件调 `stopPropagation` 时仍能关闭（捕获阶段）而该控件自己的处理器照常收到事件；关闭后再点不报错、大字不复活；提前关闭会取消 3 秒定时器；以及**监听器收支平衡**——显示中恰好持有 1 个，关闭后归零。

> 变异验证 6 种写错的实现：不挂监听、**挂在遮罩上（点击黑洞）**、不摘监听、不取消定时器、用冒泡阶段、用 `click` 代替 `pointerdown`。

---

## 等高线背景

`check.js` 只能证明文件可解析，这不等于功能有效。这些脚本把**真实的 `client.js`** 放进一个按安装态 bundle 复刻的应用 DOM/CSS 里跑，然后**对实测像素断言**：

```bash
node test/contour-render.test.js      # 21 项行为断言
node test/contour-specks.test.js      # 残渣过滤 + 随机种子 + 空白格
node test/contour-smoothness.test.js  # 曲线平滑（对比直线段渲染）
node test/contour-cusps.test.js       # 逐帧尖点 / 锐角（issue #3）
node test/contour-a11y.test.js        # prefers-reduced-motion 行为
node test/contour-coverage.test.js    # 8×5 分区墨迹覆盖率
node test/contour-perf.test.js        # 稳态帧成本（n=80）
node test/contour-bounds.test.js      # 扫描边界与全扫的逐坐标等价
node test/contour-worker.test.js      # worker 内核与主线程一致
node test/shoot.js                    # 输出亮/暗 × 两配色共四张截图供肉眼复核
```

**`contour-render.test.js`** 覆盖：关闭时不创建节点且**不改动应用底色**；开启时画布挂进应用外框、图层确实上色、不透明底色已让位；正文颜色不变且仍可命中测试（图层在其**之下**）；动画开启时像素随时间变化、关闭后**完全静止**、**重新开启后再次变化**；暗色仍上色；拆除后节点归零。

> 这套脚本抓到了三个真实 bug，都不是解析错误：子开关在已挂载时失效、TDZ 崩溃隐患、重启动画的首帧是空转。详见[工程笔记](engineering-notes.md#等高线背景)。

**`contour-specks.test.js`** 守四件事，并逐一做了反向对照：改回写死种子 → 报「5 次加载地形完全相同」；关掉过滤器 → 报 9 条全画布外、15 条短描边、7 个小环；空白格门槛调回 1 → 空白格重现。

**`contour-smoothness.test.js`** 把**真实的绘制函数原样切出**来跑，而不是重写一份等价逻辑。它拿同一批几何分别用曲线和直线段各画一遍，比较像素：曲线版必须**显著不同**（证明平滑真的生效）、**总墨迹量基本不变**（证明形状没被扭曲）、且抗锯齿覆盖更多。

**`contour-cusps.test.js`** 补的是上面那条留下的**盲区**：`smoothness` 只比较**单帧**里「曲线画」与「直线画」的像素差，因此看不见两种画法**共有**的缺陷，也从不推进动画。issue #3 的锐角正是如此——每帧都在，只是随场漂移不断换位置，所以整套测试全绿而屏幕上每帧约有 127 个尖刺。

这个脚本改为**量真正画出来的曲线本身**：桩掉一个 2d context，让**原样切出的** `contourDrawLines()` 自己录下 `moveTo/lineTo/quadraticCurveTo/closePath` 调用流，再密集采样这条流、逐点测转角（闭合子路径**连接缝一起按循环测**）。样条的分段布局不在测试里重算，所以测试不会悄悄偏离它要检查的渲染器。

跑 12 帧真实动画序列，断言：**任一帧都没有尖点（>150°）**、**没有锐角（>90°）**、中段仍平滑（p99 < 12°，兜住「又退化成折线」）、且闭合环**确实是按环画的**（守机制而非只守症状）。三个方向对照都做了：还原末段 `quadraticCurveTo` → 报 146 个尖点；把 `closePath()` 变成空操作 → 报「0 个闭合子路径」；只删发夹尖端不删整根 → 最大转角从 65° 回升到 127°。

**`contour-a11y.test.js`** 用 `--force-prefers-reduced-motion` 在**整个浏览器**层面施加该偏好（页面脚本无法切换它），然后在动效开关为「开」的前提下断言：图案仍渲染、场**零变化**。

**`contour-coverage.test.js`** 直接读**画布本身**而非截图：截图里应用自己的卡片、输入区遮罩和正文会盖住图案，无法回答「场里有没有空白」。它把画布切成 8×5 分区并统计墨迹占比。

**`contour-perf.test.js`** 不走 `requestAnimationFrame`——headless 会挂起 / 合并 rAF，只能采到 n=1，而没有分布支撑的数字不算测量。它按函数名把算法源码从 `client.js` 里原样切出后在紧循环里计时，并丢弃前两次采样（冷启动含 JIT 预热）。

该脚本对 24 / 60 / 120 fps **逐个**比预算，并在第一个超标处失败——所以真正卡住它的门槛是 **8.3ms（120fps）**，不是 41.7ms：报数时别只看「41.7ms 预算」那一行。

> **提取到的名字必须跟着 `client.js` 走。** 这些「原样切出」的脚本按名字抓函数与常量，切出来少一个就是页面里的 `ReferenceError`，而它只会表现为 `no result` / 一行 `CONTOUR_... is not defined`。新增或重命名内核里的函数与常量时（例如 `contourStepFor`、`CONTOUR_MAX_CELLS`、`CONTOUR_MIN_BUMPSAMPLES`、`CONTOUR_SMOOTH_*`），要同步 `contour-smoothness` / `contour-cusps` / `contour-bounds` / `contour-perf` 的名单、`scripts/build-contour-worker.js` 的 `names`，以及 `src/contour-worker.js` 顶部手工镜像的常量——worker 里少一个常量同样是运行时 `ReferenceError`。

---

## 字体作用域

```bash
node test/font-scope.test.js   # 第三方挂件字体 + 主题自有表面字体，同一页一次跑完
```

主题曾经在自己的样式表里声明应用的 UI 根字体令牌（`--dsw-font-family`），连带把 `font-feature-settings` / `font-variant-ligatures` 挂在 `body` 上。三项都会**继承**进注入到应用根节点的第三方挂件——挂件写着 `font-family:inherit`，于是它的余额数字被换成主题的 Arial。详见[字体令牌是应用的公共接口](engineering-notes.md#字体令牌是应用的公共接口不是主题的开关)。

这个脚本把**三类节点放在同一页**：应用自己的 `:root` 字体令牌声明（照抄安装态 bundle）、一个注入应用根节点的 `font-family:inherit` 挂件、以及主题的全部自有表面（启动加载屏、水印字标；设置面板根由源码断言其带 `.endfield-settings` 类并有对应规则）。断言：

- 根令牌与 `body` 解析值**与应用声明逐字相同**（`--dsw-font-family` / `--ds-font-family-code` 都没被改写）；
- 挂件与其数字拿回**应用字体栈**，且 `font-feature-settings` / `font-variant-ligatures` 为 `normal`；
- 加载屏与水印**仍在主题字体**（Arial）上，并各自带着 `tnum` + `ss01`（这两条属性已从 `body` 下移到元素自身，必须跟进）。

> 变异验证：把旧的 `:root { --dsw-font-family: Arial… }` 注回去，本脚本报「挂件字体被主题偷走」（4 条红），`check.js` 同时报「令牌被主题声明」，`selftest.js` 也有一条对应注入用例。

---

## 水印层叠

```bash
node test/watermark-stacking.test.js
```

四条结论都做了反向对照（故意改坏必须报错）：改回 `z-index:1` → 报 9945 px 越界；深色 alpha 调回 `0.16` → 报 1.558:1 过强；alpha 降到 `0.004` → 同时报「不可见」与「低于感知下限」。

这个测试的两个方法论坑（不能用命中测试判断 `pointer-events:none` 的层叠、两版渲染必须只差 alpha）见[验证方法论](engineering-notes.md#命中测试判断不了-pointer-events-none-的层叠)。

---

## 截图辅助

```bash
npm run shots          # 输出亮/暗 × 两配色共四张截图
npm run shots:verify   # 上面 + 解码统计强调色像素
```

这两个不是断言，是给肉眼复核用的。数值化的那一半在 `verify-shots.js` 里。

> **夹具必须照抄真实骨架，不能照抄选择器。** 头部夹具曾经把预设徽章直接挂在 `.wSkVaW_header` 下——那恰好就是主题当时选择器假设的形状，于是截图看着一切正常，而真实 0.1.5-rc.2 早已把徽章放到三层之下（`_titleRow > _titleCluster > _headerActions`），主题那条选择器在真实页面上一个元素都没匹配到。**当夹具是为了让选择器通过而搭出来的，它就从验证退化成了同义反复。** 改动头部 / 侧栏等夹具结构时，请对着 `@deepseek-ai/dsh-client-ui-*` 的真实渲染代码核一遍。
