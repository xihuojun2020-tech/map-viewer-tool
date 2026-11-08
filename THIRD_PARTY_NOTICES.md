# 第三方代码与地图资料

GPL-3.0 适用于本项目的自有程序代码，不替代以下第三方许可。发行时保留 `web/assets/DATA-NOTICES.txt`、各组件 LICENSE 以及原始来源链接。

| 内容 | 许可与来源 |
|---|---|
| MapLibre GL JS 5.6.1 | BSD-3-Clause；`web/assets/MAPLIBRE-LICENSE.txt` |
| Leaflet 1.9.4 | BSD-2-Clause；`web/assets/leaflet/LICENSE` |
| Three.js r160、GLTFLoader、BufferGeometryUtils | MIT；`web/assets/THREE-LICENSE.txt`；导入路径改为本地相对路径 |
| AndroidX WebKit、Core KTX | Apache-2.0；由 Google Maven 提供，版本见 `android/app/build.gradle.kts` |
| Google ML Kit 中文文字识别 | Google 提供的二进制 SDK，不属于本项目 GPL 自有源码；[SDK 使用条款](https://developers.google.com/ml-kit/terms)，安卓识字构建会下载该依赖 |
| OpenCC 字典 | Apache-2.0；`web/assets/OPENCC-LICENSE.txt` |
| Yuk Tung Liu 的 ChineseCalendar | GPL-3.0；`data/references/chinese-calendar/LICENSE.txt`；离线历法适配脚本同样采用 GPL-3.0 |
| Esiymbro 建安郡国图及 Zunkir/Kanguole 东汉参考图衍生边界 | CC BY-SA 4.0；作者、源图与修改说明见 DATA-NOTICES |
| Koba-chan 地势图 | CC BY-SA 3.0；保留原作者与地势资料来源 |
| Natural Earth 海陆与河网 | Public domain；仅为现代地理参照 |
| USGS/NOAA 等地形数据经 Terrain Tiles 提供 | 按原数据署名要求保留来源，详见 DATA-NOTICES |
| 黄河研究示意 | CC BY-SA 4.0；保留原图争议和精度说明 |
| 长坂战役水系研究示意 | CC BY-SA 3.0；仅作配准研究图层，不称精确古河道 |
| Wikisource 古籍与 Wikipedia 整理内容 | 原文及整理材料分别依其来源条款；保留固定修订号、来源 URL 和相关 CC BY-SA 署名 |
| 可选独立取文服务 fanqie-lite-api | GPL-3.0；上游源码未修改；固定版本见 `deploy/source.lock.json` |

城池及类别兵人来自本项目程序生成，没有混入研究时参考的 0 A.D. 模型或贴图。公开包不包含电视剧参考截图、许可未核实的用户地图原包和衍生沿海补丁，也不包含用户导入小说或截图片段。

公开示例的文字为项目编写的功能演示，不是《三国演义》或其他小说的原文。它用于验证程序对计划、实际行动、人物和军队的区分，不构成历史事实声明。

安卓完整安装包还包含依赖的二进制；公开源码不等于这些 SDK 也采用 GPL。公开分发 APK 前需单独核对这些组件的分发条款与 GPL 组合条件，本次开源候选交付以源码为准。
