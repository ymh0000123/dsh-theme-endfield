# dsh-theme-endfield

参考《明日方舟：终末地》官网风格的 DSH Web 主题插件。

奶油纸底、墨黑文字、信号黄/武陵青强调色、全直角工业编辑风。插件只运行在 Client 侧，通过主题令牌和样式覆盖界面，不修改应用代码。

## 安装

```bash
dsh plugin --profile web add github:ymh0000123/dsh-theme-endfield
```

重启或重新加载 `web` profile 后生效。**更新插件文件时注意**：Client 半（`client.js`）由 Host 按请求从磁盘读取，浏览器刷新即可生效；Host 半（`index.js`）只在 profile 启动时 import 一次，**必须整进程重启 DSH** 才会重新加载（`dsh-hmr` 的 watch 默认忽略 `**/node_modules`，软链安装的仓库文件不在其观察范围内）。只刷新页面时，运行的仍是启动时那份 Host 代码。卸载：

```bash
dsh plugin --profile web rm dsh-theme-endfield
```

## 功能

在 **设置 › 终末地主题设置** 中调整：

- 主题总开关、谷地黄/武陵青配色、直角/圆角模式；
- 等高线背景、动态开关、`24 / 60 / 120 FPS`；
- 等高线速度 `1x / 2x / 4x`；
- 可选鼠标轨迹：鼠标附近的等高线局部变形并逐渐恢复，默认关闭；
- 背景水印及持续显示；
- 启动加载动画；
- 雷霆大字及入场动画。

所有设置由 DSH 自己的设置服务持久化，与页面 origin/端口无关：在 **DSH 0.1.7-rc.1** 上，Host `index.js` 导出一份字段全部 `.volatile()` 的 schemastery `Config`（命名空间 = 本插件 profile entry id `theme-endfield`），浏览器 `client.js` 通过 `ctx.configForms` 读写并订阅，值随 `<profile>/cordis.patch.yml` 落盘；在**旧版 DSH** 上则回落到 `ctx.settings.register('dsh-theme-endfield', schema)` + `ctx.settingsScope`（`<dshHome>/settings.yaml`）。两代都与页面 origin 无关，因此 DSH web 与 DSH Desktop 都能正确保存并在重启/换端口后恢复，不再使用会被 Desktop 随机端口清空的 `localStorage`。详见 [docs/features.md](docs/features.md) 与 [docs/engineering-notes.md](docs/engineering-notes.md)；0.1.7 升级后旧设置需要在设置页重设一次（`settings.yaml` 已被 DSH 废弃，见 [engineering-notes.md § DSH 0.1.7-rc.1 换掉了整套 settings API](docs/engineering-notes.md#dsh-017-rc1-换掉了整套-settings-api-v110-已跟进)）。设置文案支持中英文；动态等高线尊重系统「减少动态效果」，动画帧率和速度可独立调整。

**如果开关总是「刷新后复位」**：先看 Host 侧有没有这份 `Config`（`Config.listConfigs` 对该 entry 报 `absent` 就是没有）。没有 Config 时 DSH 不投影任何表单，Host `apply()` 会打一行 warn 并在 profile 目录留下报告文件 `theme-endfield-diagnostic.json`（`Config` 构建成功时会自动删除它；报告里的 `schemaMode` / `loaded` / `loadError` 会写明走了哪条解析路径、以及某个副本是否「解析得到却加载失败」）——排查与判据见 [docs/testing.md](docs/testing.md#设置页)。另外注意：**改 Host 半（`index.js`）必须整进程重启 DSH**，刷新页面只重载 `client.js`。

## 文档

| 文档 | 内容 |
| --- | --- |
| [docs/design-language.md](docs/design-language.md) | 色板、令牌映射与对比度规则 |
| [docs/features.md](docs/features.md) | 功能行为、默认值、存储键与边界情况 |
| [docs/engineering-notes.md](docs/engineering-notes.md) | 算法、层叠、动画和性能实现说明 |
| [docs/testing.md](docs/testing.md) | 校验脚本与测试套件说明 |
| [docs/contour-trail.md](docs/contour-trail.md) | 鼠标轨迹的采样、衰减与验证 |

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
index.js           Host 侧：导出 volatile Config，声明设置命名空间
cordis.patch.yml   Bundle 注入配置
check.js           样式表静态校验
selftest.js        校验器自检
test/              渲染、设置、配色与性能测试
docs/              设计、功能、工程与测试文档
```

## 素材归属

本插件是**非官方同人作品**，与鹰角网络（Hypergryph）不存在任何隶属、赞助或背书关系。

- 《明日方舟：终末地》（Arknights: Endfield）的游戏名称、标识、商标、官网视觉与设计语言及相关美术素材，版权归**鹰角网络（上海鹰角网络科技有限公司，Hypergryph Network Technology）**所有。
- 本仓库中的**部分素材**（如 `assets/` 下的界面截图，以及主题中还原的 `ENDFIELD` 字标、信号黄配色与工业编辑风版式）源自或参考上述作品及其官网，仅用于**学习、展示与非商业用途**；其权利仍归鹰角网络所有，**不在本项目的 MIT 许可证覆盖范围内**。
- 本项目的原创代码（`client.js`、`index.js`、`src/`、`scripts/`、`test/` 等）以 MIT 许可证发布。
- 若权利方认为本仓库中的任何素材使用不当，请通过 Issue 联系，我们会立即删除或替换相关内容。

## 许可证

MIT，仅覆盖本项目的原创代码；第三方素材的归属见[素材归属](#素材归属)。

## Star History

<a href="https://www.star-history.com/?repos=ymh0000123%2Fdsh-theme-endfield&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ymh0000123/dsh-theme-endfield&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ymh0000123/dsh-theme-endfield&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ymh0000123/dsh-theme-endfield&type=date&legend=top-left" />
 </picture>
</a>
