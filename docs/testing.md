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
| `client.js` 能编译 | 用 `vm.Script` 在进程内解析、不执行 |
| 回合状态标签仍通过 `background-image` 改色 | 写成 `color:` 对渐变文字无效，属于「改了但没生效」的静默失败 |

## selftest.js — 校验器自检

把上述每个真实问题注入 `client.js` 的**副本**并断言 `check.js` 确实失败，同时断言注入本身生效（避免空跑）。

---

## 配色

```bash
node test/palette-contrast.test.js   # 两套配色每个角色的对比度（从真实 CSS 里读值）
node test/palette-switch.test.js     # 真实浏览器里切换配色，22 项断言
node test/settings-buttons.test.js   # 强调色底上的按钮文字对比度（32 项，含回归守卫）
node test/hover-check.js             # 用 CDP 真的移动鼠标，验证真实 :hover 规则
node test/verify-shots.js            # 解码四张截图统计强调色像素
```

**`palette-contrast.test.js`** 从 `client.js` 的实际样式表里把变量读出来再验算。覆盖 27 项：实心底 + 墨色字达 AA、悬停底同样达标、渐变文字四个色标对**两种**可能底色都达 AA、暗色强调色作图标墨色 ≥3、两配色的等高线合成对比度相差 ≤20% 且高于 1.06 感知下限、hero 光晕不比原品牌蓝更响、两配色确实不同、强调色写成 6 位十六进制，以及**武陵青的亮度必须落在 45%–56% 区间且留在青碧色轴上**。

**`palette-switch.test.js`** 在真实浏览器里跑真实 `client.js`，并**按应用的真实方式把令牌写成 `<body>` 行内样式**——用样式表 `:root` 假装会让测试通过而线上坏掉，这种不对称正是它存在的理由。断言：默认是谷地黄且不带 class；11 个变量全部**非空**；`--dsw-alias-brand-primary` 在切换后**自动**变成青色（令牌层没有重新注册）；`rgba(var(--rgb), α)` 型半透明色块随之切换；渐变文字换色；**画布被重绘且新描边偏青**（B 通道高于 R）；关闭主题后不残留 class。

**`settings-buttons.test.js`** 读计算样式，用同特异度的 `.HOVERPROBE` 类替代 `:hover`。这是合理的层叠等价，但反向对照暴露了它的边界（见[验证方法论](engineering-notes.md#计算样式触发不了-hover)），因此有了下一个脚本。

**`hover-check.js`** 通过 DevTools 协议**真的移动鼠标**到按钮上，再截图量字形与填充的对比度。

**`verify-shots.js`** 只用 `zlib` 解码 PNG（不引依赖），按色相家族统计像素，用「黄 5.47% → 0.39%、青 0.42% → 5.40%、中性约 93% 不变」这样的数字代替「看起来像换了」。

---

## 设置页

```bash
node test/settings-rows.test.js     # 设置面板真实渲染 + 开关联动
node test/settings-durable-hold.test.js  # 命名空间未就绪时的写入 gate + 补写
node test/settings-off.test.js      # 关闭主题后设置页仍可读
node test/settings-locale.test.js   # 跟随语言设置（zh/en 词典对齐 + 切换生效）
```

**`settings-rows.test.js`** 不用浏览器也不用 React：以**记录型 `React` / `slots` + 假的 `ctx.settingsScope` 绑定器**（`test/fixtures/settings-scope.js`）在进程内跑一次真实 `apply()`，抓下设置面板真正的元素树。设置页是用户唯一能碰到这些开关的入口，而那里的错误（抛异常、漏 key、开关写错了 DSH 设置的字段）check.js 与画布测试都看不见。

> 说明：这个插件从 **`localStorage` 迁移到了 DSH 的持久化设置命名空间**（见 features.md / engineering-notes.md）。因此设置类测试不再往浏览器存储里塞值，而是驱动假的 `ctx.settingsScope` 绑定器——它在内存里扮演 `<settings.yaml>` 中的命名字段节。断言 10 行齐全且归入 4 个分组容器、key 唯一、分组标题（01 主题 / 02 背景 / 03 动画 / 04 娱乐）与配色样式规则都在、配色行默认显示谷地黄且按钮提供「切换武陵青」、点击把 `palette` 写成 `wuling`、存了 `wuling` 时反向提供「切换谷地黄」并标注 `#14d0d0`、图层关闭时子开关为 disabled、开启后恢复可用，雷霆大字与大字入场动画均默认为关、说明文字包含「任务开始」/「任务完成」与 3 秒、**子开关只写自己的字段而不误写主开关的**，以及点击确实写入文档里那个 DSH 设置字段。

**`settings-durable-hold.test.js`** 用**两阶段假 `ctx.settingsScope`** 复现那条真实告警：宿主半部 `ctx.settings.register(...)` 尚未跑、命名空间还没进 Host 的 served 列表前，scope 快照是 `{ status:'unavailable', writable:true, mode:'host' }`——单看 `writable` 会照写不误却落不到盘。它先在未就绪态切「圆角 / 武陵青」，断言**没有任何 `scope.set` 出线**（旧 bug 会打 `commit … status= unavailable` 并静默丢脏）；随后模拟文档 committed、命名空间进入 served 列表、快照翻为 `status:'ready'`，断言订阅路径把两份 held 编辑**自动补写**进 `settings.yaml`，且不会重复写两遍（replay 有 re-entrancy 护栏）。

**`settings-off.test.js`** 守的是设置页自己最脆弱的时刻：**开关按钮的强调色底来自主题样式表，而样式表随主题关闭被移除**。它在真实浏览器里加载真实 `client.js`，以应用**自己的默认令牌**（亮 / 暗两套）把主题关掉，用 `slots` 桩抓出真实元素树并物化成 DOM，然后断言每个按钮的合成对比度 ≥ 4.5。

> 这个测试抓到过真 bug：修复前暗色模式下「切换武陵青」与「切为静态」两个常亮按钮是 `#000` 落在透明底上、对深色面板仅约 1.1:1，修复后全部 ≥ 11.5:1。

**`settings-locale.test.js`** 配一个按运行时契约造形的假 `locale` 服务（`register(ns, dicts)` / `bind(ns)`，含 `active → en → 键名` 的查找链，并**复现真实服务对重复 `(ns, locale)` 的抛错**）。覆盖：注册了自己的命名空间；**en 与 zh 键集完全一致**、无空译文、且两种语言实质不同（防止「翻译」其实是复制）；注册声明了 `locale:`、`label` 是 thunk 且随语言变化；zh 渲染为中文而 **en 渲染无任何残留中文与中日韩标点**；未知语言回退到 en 而不漏键名；词典只注册一次、可随 `ctx.effect` 注销并重新注册；以及**完全没有 locale 服务时页面照常渲染为中文、且不声明 `locale:`**。

---

## 雷霆大字

```bash
node test/thunder-edges.test.js     # 边沿/生命周期/样式契约
node test/thunder-shot.js           # 真实渲染截图 + 像素对比度断言
node test/thunder-dismiss.test.js   # 点击关闭：真实指针事件 + 命中测试 + 监听器核账
```

**`thunder-edges.test.js`** 在进程内跑真实 `client.js`，配一个按运行时契约造形的假 `sessions` 服务和一个**可控时钟**，因此 3 秒窗口是被断言的而不是被等待的。覆盖：关闭时**不订阅**（零开销）；`false→true` 播「任务开始」、`true→false` 播「任务完成」；**同值连续推送 25 次不重复播报**；2999ms 仍在、3000ms 已隐藏；入场动画默认关闭时大字带静态标记、开启后不带，且两种状态下 3 秒时长都不变；系统「减少动态效果」压过已开启的动画开关；切进已在运行的会话不误报、但其结束仍播报；离开的会话被退订；关闭主题会移除大字并退订、重新开启会恢复；**服务迟到后仍能自动接上**；`ctx.effect` 拆除时释放全部订阅与节点。

另有 14 条**样式契约**断言（固定定位、居中、`pointer-events: none`、`font-weight: 900`、`clamp()` 字号、白色字面量、层级低于加载屏、`prefers-reduced-motion`、静态分支取消动画并强制 `opacity: 1`）——这些是本机无布局引擎时看不见、却最容易被后续重构悄悄改掉的视觉事实。

> 变异验证共 19 类：默认改成 opt-out、边沿退化成电平、去掉基线、时长改成 5s、两个词对调、不自动隐藏、去掉 `aria-hidden`、切换会话不退订、拆除不退订、白色换成令牌、粗体改成 400、层级盖过加载屏、服务缓存不重试、动画默认改成 opt-out、静态标记永不打 / 永远打、系统偏好不再覆盖、子开关误写主开关的键、子开关未禁用、静态分支丢掉 `opacity: 1`。

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

实测稳态：p95 8.6ms / 41.7ms 预算，约 81% 余量。

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
