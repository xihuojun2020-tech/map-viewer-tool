# 地图查看工具

把历史叙述和小说情节放回地图，帮助读者理解人物、地形、势力与战争之间的关系。

产品面向不同历史时期与历史题材小说。**当前实现的首个底图是汉末三国，其他时期尚未接入。** 地理底图与小说剧情包分开：底图提供地势、水系、州郡和地点；剧情包提供随阅读位置变化的势力、人物、军队与进攻方向。模型提取有文字依据的事实，程序负责校验、时间状态和地图绘制。

## 当前功能

- 完整地图可缩放、拖动；州郡参考线、行政中心、地名与势力覆盖分别显示。
- 史实按年、月、连续七日窗口浏览；《三国演义》按回目浏览；导入小说按章节和段落回看。
- 点击势力、人物、兵人或进攻箭头查看依据，区分当前局势、回忆、文中计划与条件推演。缺载内容保持未知。
- 安卓支持导入文本、截图识字、悬浮截图、书库查询、下载已有地图及按需分析。自己的模型接口直连供应商，托管分析走服务器。
- 同一来源、同一分析范围可复用服务端结果；新增章节复用已完成部分。剧情包校验通过后安装，保留阅读位置，可离线查看。
- 手机和平板支持横竖屏；PC 使用宽屏布局。移动端资料面板、图例和详细设置按需展开。

0.1.10 修复了文案更新后旧小说地图与书库不兼容的问题，保留已有阅读位置和分析缓存；同时校正进度单位、资料说明，以及收起图例后州名和势力名的避让。

当前 PC 版本是本地 Python 服务加浏览器界面，**不是已完成的原生 Windows/macOS 安装程序**。安卓最低系统版本为 Android 8，鸿蒙原生版本尚未实现。

## PC 启动

需要 Python 3.10 或以上版本，地图查看本身不需要模型密钥或第三方 Python 库。

```sh
python server.py --port 8790
```

浏览器访问 <http://127.0.0.1:8790/>。Windows 可运行 `启动地图.ps1`，默认使用 `py -3`；指定解释器时使用 `./启动地图.ps1 -Python python`。

本地服务默认只监听本机。若主动允许局域网设备连接，可使用 `--host 0.0.0.0`；不要把这个开发用静态服务器直接当作公网托管分析接口。

## 安卓构建

需要 JDK 17、Android SDK 35、Gradle 8.11.1 和 Python 3.10+。将 SDK 位置写入本机 `android/local.properties`（不提交），或配置 Android SDK 环境。

```powershell
./scripts/build_android.ps1 -Variant Debug -JavaHome $env:JAVA_HOME
```

也可以直接运行：

```sh
python scripts/build_android_assets.py
gradle -p android :app:assembleDebug
```

没有发布签名配置时，调试包使用开发者自己的默认调试签名。正式发布需在私有环境中提供 `MAPTOOL_KEYSTORE` 和 `MAPTOOL_STORE_PASSWORD`，密钥别名为 `map-tool`。官方安装包使用既有签名与包名 `cn.maptool.reader`，更名不会清空已保存内容。

`android/update-public.der` **只有更新验签公钥**，可以公开；APK 签名私钥、更新签名私钥和密码不在仓库中。自行运营更新服务时，需要更换自己的公钥、客户端更新地址与服务器地址，再使用自己的私钥生成更新清单。

当前服务器地址在 `web/tools.mjs`、安卓 `MainActivity.kt` 和 `AppUpdates.kt` 中明确指定；公开地址不是密钥，访问托管接口仍需要独立凭据。Fork 后部署到自己的服务器时应修改这些地址；不要期待官方凭据随源码提供。

## 服务器源码与部署

`backend/` 包含取文适配、书库、任务队列、模型分析、用户隔离、断点复用与剧情包发布；`scripts/compile_layer.mjs` 复用客户端同一个地图编译器。

Python 后端仅使用标准库；地图编译需要 Node.js 22。服务器默认监听本机端口，经 Nginx 提供 HTTPS。部署步骤、systemd 单元、Nginx 示例和空白配置模板见 [公开部署说明](deploy/公开部署说明.md)。没有省略服务器业务代码，也没有把真实环境配置混入模板。

可选书源组件来自 [fanqie-lite-api](https://github.com/Maicy0609/fanqie-lite-api)，固定提交和许可证见 `deploy/source.lock.json`。本项目通过本机 HTTP 调用三个必要接口，没有将其身份池、正文缓存或密钥公开。部署者应按自身取得的内容使用权限配置书源。

## 代码与数据

| 目录 | 内容 |
|---|---|
| `web/` | PC/移动端地图界面、场景状态、地图渲染与剧情包处理 |
| `android/` | 安卓 WebView、导入、识字、悬浮截图、密钥存储及更新 |
| `backend/` | 托管分析与书库服务 |
| `deploy/` | 可自行部署的配置模板与组件版本 |
| `scripts/` | 地图资料构建、打包和编译工具 |
| `data/` | 有来源说明的历史资料和演示输入 |
| `tests/` | 时间状态、地图、模型协议与书库检查 |

程序的自有代码按 **GPL-3.0** 开源，完整条款见 [LICENSE](LICENSE)。第三方代码、地理资料和古籍整理内容保留原许可证及署名，详见 [第三方资料说明](THIRD_PARTY_NOTICES.md) 与 `web/assets/DATA-NOTICES.txt`。

公开资料包不包含来源和许可未核实的用户地图压缩包，也不包含用户小说、截图、私有任务或服务端身份池。公开版的海陆参照使用 Natural Earth 数据，不带私有原包的沿海补齐；示例引文使用原创功能演示文字。用户本机已有资料不会因准备开源而删除。

现有州郡线是现代研究重建资料，部分建置跨期；势力区块为明确标注的概略显示范围，不是考定的古代地籍。水文展示侧重阅读理解，不能当作完整的三国古河道复原。

## 检查与贡献

```sh
node --test tests/scene-state.test.mjs tests/layer-client.test.mjs tests/layer-publish.test.mjs tests/map-version.test.mjs tests/story-compile.test.mjs
python -m unittest discover -s tests -p 'library*_test.py'
python -m unittest discover -s tests -p 'analysis_test.py'
python -m unittest discover -s tests -p 'novel_source_test.py'
python -m unittest discover -s tests -p 'speed_pipeline_test.py'
```

上面的核心检查不调用真实模型，也不需要维护者凭据。完整地理检查另需 Shapely、Pillow、NumPy 或 jsonschema，并先运行 `scripts/build_data.py` 生成本地史料索引；`user_regions_test.py` 和区域预览检查需要未公开的用户地图原包。部分旧研究截图脚本使用本机 Playwright/浏览器路径；这些不是运行预构建地图所必需的依赖。运行前可查看对应脚本的 import 和路径设置。

`web/map-compatibility.json` 只登记已经核对过的资料摘要配对。当前文案版本沿用已部署协议版本，下载包仍校验完整字节。修改资料后可运行 `python scripts/check_copy_compatibility.py 旧版web目录 候选web目录` 核对允许的说明字段；编号、几何或其他运行数据变化不能直接加入此文案兼容组。

密钥检查使用 Gitleaks：

```sh
gitleaks dir --redact=100 .
gitleaks git --redact=100 .
```

提交时不要附带 API key、访问凭据、签名文件、真实 `.env`、小说全文或运行数据库。漏洞报告中也不要粘贴这些内容。新增历史时期时应同时提供资料出处、精度和许可说明，不能把模型推断当作史实。
