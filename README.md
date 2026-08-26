# dsh-theme-endfield

参考《明日方舟：终末地》官网风格的 DSH Web 主题插件。

奶油纸底、墨黑文字、信号黄/武陵青强调色、全直角工业编辑风。插件只运行在 Client 侧，通过主题令牌和样式覆盖界面，不修改应用代码。

## 安装

```bash
dsh plugin --profile web add github:ymh0000123/dsh-theme-endfield
```

重启或重新加载 `web` profile 后生效。卸载：

```bash
dsh plugin --profile web rm dsh-theme-endfield
```

## 功能

在 **设置 › 终末地主题设置** 中调整：

- 主题总开关、谷地黄/武陵青配色、直角/圆角模式；
- 等高线背景、动态开关、`24 / 60 / 120 FPS`；
- 等高线速度 `1x / 2x / 4x`；
- 背景水印及持续显示；
- 启动加载动画；
- 雷霆大字及入场动画。

所有设置均使用 `localStorage` 持久化，设置文案支持中英文。动态等高线支持系统减少动态效果偏好，动画帧率和速度可独立调整。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/design-language.md](docs/design-language.md) | 色板、令牌映射与对比度规则 |
| [docs/features.md](docs/features.md) | 功能行为、默认值、存储键与边界情况 |
| [docs/engineering-notes.md](docs/engineering-notes.md) | 算法、层叠、动画和性能实现说明 |
| [docs/testing.md](docs/testing.md) | 校验脚本与测试套件说明 |

## 开发与验证

```bash
node check.js
node selftest.js
npm test
```

`npm test` 覆盖样式不变量、配色、设置页、真实浏览器渲染、等高线平滑/尖点、动画可访问性、覆盖率和 24/60/120 FPS 性能预算。部分浏览器测试需要本机安装 Chrome 或 Edge。

## 项目结构

```text
client.js          Client 侧主题实现
index.js           Host 侧空实现
cordis.patch.yml   Bundle 注入配置
check.js           样式表静态校验
selftest.js        校验器自检
test/              渲染、设置、配色与性能测试
docs/              设计、功能、工程与测试文档
```

## 许可证

MIT
