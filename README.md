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

`client.js` 通过两种机制作用于 DSH Web 界面：

1. **`theme.overrideTokens`** — 覆盖 13 个主题令牌（亮/暗双色），映射终末地官网色板；
2. **`styles.insert`** — 注入全局样式：字体栈、直角化、信号黄强调、中和 DSH 内部 DeepSeek 品牌蓝、hover 反色、表格/按钮/徽章/头部动作黄化等。

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

## 许可证

MIT
