# dsh-theme-endfield

**Edge Intelligence Theme** — 参考《明日方舟：终末地》官网视觉风格的 DSH（DeepSeek Harness）Web 主题插件。

奶油纸底、墨黑文字、信号黄强调、全直角的「工业编辑风」。纯 Client 半部插件：不修改应用代码，只覆盖主题令牌 + 注入一张样式表。

> 视觉参考：<https://endfield.hypergryph.com>（国际版 <https://endfield.gryphline.com>）

## 快速开始

```bash
dsh plugin --profile web add github:ymh0000123/dsh-theme-endfield
```

重启（或重新加载）web profile 即生效。安装后在 **设置 › 终末地主题设置** 调整全部开关。

卸载：

```bash
dsh plugin --profile web rm dsh-theme-endfield
```

<details>
<summary>临时试用（不安装，作为动态 Cordis 插件）</summary>

1. 复制 `client.js` 里 `apply(ctx) { ... }` 的函数体；
2. 用 `cordis_define` 新建插件，粘贴为 **Client 代码**（`return { apply(ctx) { ... } }`），再用 `cordis_run` 激活；
3. 刷新页面生效；在 Run 卡片上停止插件即完全卸载（令牌层与样式层自动拆除）。

`client.js` 依赖 DSH Client 运行时的 `theme` 服务与 `styles` 内建，不能在普通浏览器里直接运行。

</details>

## 设计语言速览

| 维度 | 取值 |
| --- | --- |
| 纸底 | 亮 `#e8e8e2` / 暗 `#101110` |
| 文字 | 亮 `#101110` / 暗 `#f5f5f0` |
| 强调色 | **谷地黄** `#fff500`（默认）或 **武陵青** `#14d0d0`，设置页一键切换 |
| 字体 | Arial / Helvetica Neue / PingFang SC / Microsoft YaHei，开启 `tnum` 等宽数字 |
| 圆角 | 全部 `0`（状态点、头像、加载圈保留圆形），可切回圆角 |

完整的色板、令牌映射、强调色角色与对比度门槛见 **[docs/design-language.md](docs/design-language.md)**。

## 设置项

设置页分四组，共 12 个设置项，全部由 `localStorage` 持久化，文案跟随 DSH 的语言设置（中/英）。

| 组 | 开关 | 默认 |
| --- | --- | --- |
| 01 主题 | 终末地主题（总开关） | 开 |
| | 主题配色（谷地黄 / 武陵青） | 谷地黄 |
| | 主题圆角（直角 / 圆角） | 直角 |
| 02 背景 | 等高线背景 | 关 |
| | 动态等高线 | 开（需先开启等高线背景） |
| | 动态帧率 | 24 / 60 / 120 FPS（默认 24） |
| | 动态速度 | 1x / 2x / 4x（默认 2x；慢速 / 标准 / 快速） |
| | 背景水印 | 开 |
| | 水印保持显示 | 关（需先开启背景水印） |
| 03 动画 | 启动加载动画 | 关 |
| 04 娱乐 | 雷霆大字 | 关 |
| | 大字入场动画 | 关（需先开启雷霆大字） |

各开关的行为细节、存储键与实现要点见 **[docs/features.md](docs/features.md)**。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/design-language.md](docs/design-language.md) | 色板、令牌映射、强调色角色、对比度规则 —— **想学设计语言从这里开始** |
| [docs/features.md](docs/features.md) | 各设置项的行为、默认值、存储键与边界情况 |
| [docs/engineering-notes.md](docs/engineering-notes.md) | 实现决策与实测数据（等高线算法、层叠、加载屏排版、i18n） |
| [docs/testing.md](docs/testing.md) | 校验脚本与测试套件说明 |

## 开发

```bash
node check.js     # 样式表不变量（模板字符串、注释配平、变量定义、:root 陷阱）
node selftest.js  # 反向验证 check.js 真能抓到那些问题
npm test          # 全部校验：配色 / 设置页 / 渲染 / 覆盖率 / 性能
```

主题样式表是**一整个 JavaScript 模板字符串**，有几类改动会在「文件仍能解析」的情况下静默失效，因此这些不变量固化成了脚本。详见 [docs/testing.md](docs/testing.md)。

> 部分测试要在真实浏览器里量像素，需要本机安装 Chrome。纯进程内的那部分（`check.js`、`selftest.js`、`settings-rows`、`settings-locale`、`thunder-edges`、`palette-contrast`）不依赖浏览器。

## 项目结构

```
client.js          浏览器端全部实现（令牌覆盖 + 样式表 + 设置页 + 各功能图层）
index.js           Host 半部，空实现（主题是纯客户端的）
cordis.patch.yml   安装时把插件行挂进 bundle 栈
check.js           样式表静态校验
selftest.js        校验器自检
test/              渲染、配色、设置页、性能测试
docs/              设计与工程文档
```

## 许可证

MIT
