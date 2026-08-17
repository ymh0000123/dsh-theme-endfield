# dsh-theme-endfield

**Edge Intelligence Theme** — 参考《明日方舟：终末地》（Arknights: Endfield）官网视觉风格制作的 DSH（DeepSeek Harness）Web 主题插件（动态 Cordis 插件，Client 半部）。

> 参考：<https://endfield.hypergryph.com>（国际版 <https://endfield.gryphline.com>）

## 设计语言

还原终末地官网的「工业编辑风」：

- **色板**：奶油纸底 `#f6f6f3` / 墨黑文字 `#101110` / 信号黄强调 `#fff500`（暗色：纸底 `#101110`、面板 `#181a18`、文字 `#f5f5f0`）
- **字体**：Arial / Helvetica Neue / PingFang SC / Microsoft YaHei，开启 `tnum` 等宽数字
- **直角化**：按钮、输入框、卡片、菜单、标签、气泡全部 `border-radius: 0`（状态圆点/头像/加载圈保留圆形）
- **信号黄交互**：悬停反色、焦点环、输入光标、滚动条、表格行、按钮、激活项、Markdown 标记

## 实现方式

`client.js` 通过三种机制作用于 DSH Web 界面：

1. **`theme.overrideTokens`** — 覆盖 13 个主题令牌（亮/暗双色），映射终末地官网色板；
2. **`styles.insert`** — 注入全局样式：字体栈、直角化、信号黄强调、中和 DSH 内部 DeepSeek 品牌蓝、hover 反色、表格/按钮/徽章/头部动作黄化等；
3. **设置页开关** — 「终末地主题设置」提供背景水印、**水印保持显示**、主题总开关、圆角模式四个开关，均由 `localStorage` 持久化。

### 背景水印与「水印保持显示」

水印默认只在**新建会话页**（hero）显示，居中跟随标题。开启「水印保持显示」后，对话页等**非新建会话页面**也会显示水印：

- 水印挂载在**会话列内部**，以 `z-index: -1` 位于正文**之下**（该列在水印挂载期间获得 `isolation: isolate` 与 `position: relative`，卸载后自动还原为 `static` / `auto`）；
- `pointer-events: none`，不拦截点击与文本选择；
- 非 hero 页透明度为 `0.16`（hero 页 `0.13`）。该值经真实页面实测标定：`0.07` 在深色下合成为 `#202120`（对 `#101110` 仅 16/255，约 1.17:1）几乎不可见；`0.22` 虽清晰但大字母边缘会与正文视觉打架；`0.16` 约为深色 1.54:1 / 浅色 1.40:1。

该开关需先开启「背景水印」；未开启时按钮为禁用态。

### 防浏览器误翻译

水印是品牌名，不应被 Chrome/Edge「翻译此页」、Google 翻译挂件或翻译插件改写。采取结构性 + 声明式双重防护：

- **结构性（主要手段）**：字形由 CSS `content`（`::before`）绘制，元素本身**没有任何 DOM 文本节点**（实测 `textContent.length === 0`、`childNodes === 0`），逐文本节点遍历的翻译器根本看不到它；
- **声明式**：`translate="no"`（HTML5 标准 opt-out，Chrome/Edge 遵循）、`class="notranslate"`（Google 翻译自有钩子）、`lang="en"`（避免被判定为中文正文）；
- `aria-hidden="true"`：纯装饰元素不进入无障碍树。

> 实测：模拟翻译器改写会话列内 **781 个文本节点**后，水印内被改写的节点数为 **0**，字形仍为 `ENDFIELD`。

## 安装

### 作为 DSH 插件（推荐）

```bash
dsh plugin --profile web add github:ymh0000123/dsh-theme-endfield
```

`dsh plugin` 会转发给 profile 目录的 pnpm 完成安装，并根据包内的 `cordis.patch.yml`（`dsh.bundle.patch`）自动把插件行挂进 bundle 栈，同时把 `exports["./client"]`（`client.js`）登记为浏览器端 client bundle。安装后重启（或重新加载）web profile 即生效。

> 本主题是纯 Client 半部插件：Host 半部（`index.js`）为空实现，全部效果由浏览器端的 token 覆盖 + 样式注入完成。

### 作为动态 Cordis 插件（临时试用）

1. 打开 `client.js`，复制 `apply(ctx) { ... }` 函数体；
2. 在 DSH 会话中用 `cordis_define` 新建插件，将函数体粘贴为 **Client 代码**（`return { apply(ctx) { ... } }`），
   在 `cordis_run` 中激活该 Package；
3. 刷新页面即生效；在 Run 卡片上停止插件即可完全卸载（token 层与样式层自动拆除）。

> 提示：`client.js` 依赖 DSH Client 运行时提供的 `theme` 服务、`styles` 内建与 `ctx.effect`，仅在 DSH Web 环境中可用，不能直接在普通浏览器中运行。

## 卸载

```bash
dsh plugin --profile web rm dsh-theme-endfield
```

## 使用

以动态 Cordis 插件的 **Client 代码**加载 `client.js` 的内容（`apply` 返回 Cordis Plugin），激活后刷新页面即生效；停止插件会自动拆除全部样式副作用。

## 特性清单

- [x] 终末地官网色板（亮/暗）
- [x] 信号黄 `::selection`、光标、焦点环
- [x] 全局直角化
- [x] 中和残留蓝色（状态点、气泡、信息按钮、侧栏激活项、偏蓝文字）
- [x] hover 文字反色
- [x] 表格行悬停实心黄底黑字
- [x] 新建会话按钮黄底黑字
- [x] Cordis 操作按钮（run/stop/approve）黄化
- [x] 会话头部动作（agent preset 徽标 / 子代理 / 任务）黄化
- [x] 背景 ENDFIELD 水印（hero 页跟随标题居中）
- [x] 水印保持显示开关（非新建会话页面亦显示，置于正文之下）
- [x] Cordis 审批按钮图标与自身底色对比（黄底黑勾 / 红底白叉）

## 许可证

MIT
