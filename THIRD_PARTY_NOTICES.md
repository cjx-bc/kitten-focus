# 第三方资源

- Vue、Vue Router、Pinia、Vite、TypeScript、Capacitor、ECharts、idb 等依赖的许可证随对应 npm 包提供。
- 数字字体 Nunito：SIL Open Font License 1.1，许可见 `public/fonts/OFL.txt`。
- 应用内线性图标：Lucide，ISC License，许可见 `licenses/lucide-ISC.txt`。
- 关于页 GitHub 标识：来自 GitHub 官方品牌素材（https://github.com/logos），仅用于链接项目仓库；GitHub 标识归 GitHub, Inc. 所有。
- `docs/references` 下的界面截图用于设计参考，不打包进应用，也不是本应用的原创视觉资源。

## 专注保护的实现来源

本轮核查了 Curbox 和 DetoxDroid 的固定提交，具体模块、许可证及缺口见 `docs/github-focus-reuse-plan.md`。两者的 GPL-3.0 业务代码未复制进本工程，也未引入它们的 UI、会话引擎或数据库。正式应用中的控制协调、应用限制、通知暂缓与释放、六项增强和恢复记账由本项目围绕公开 Android API 独立实现；研究候选不代表已集成其源码，也不改变本项目的分发许可。

通知与壁纸探针是本项目的验证工具。系统 API、设备实测范围及剩余限制分别记录在 `docs/references/focus-protection-android-boundaries.md`、`tools/probes/notification/RESULTS.md` 和 `tools/probes/wallpaper/RESULTS.md`。第三方字体、图标及 npm 依赖继续按上述各自许可证使用。
