小猫专注 v0.2.6 · 稳定性与体验修复（内测版）

分发状态：GitHub、官网下载页和应用内更新已同步。

- 待办、日历、课表与统计：修复重复全天日程、课表表单同步、日期清空边界、`focus` / `rest` 状态切换、防连点及统计空状态安全处理。
- 弹窗与界面：修复 Top-layer `[popover]` `.toast` 在浏览器默认 `inset`/`margin`/`border` 下的偏移问题；修正保护诊断与帮助页标题右偏；优化图表 `ResizeObserver` 无效重绘、锁机确认弹窗间距与 Sheet 焦点归还。
- 权限授权状态机：抽离 `usePendingEnable` 统一处理学霸模式、勿扰、通知拦截、桌面导航限制、精确防关闭、近期任务隐藏、桌面入口限制与壁纸保护的授权等待与自动撤销回退。
- 安卓原生与桥接：`FocusNavigation` 统一注入 `SessionClock` 消除慢速设备时钟漂移；完善 `FocusProtection`、`FocusAntiClose`、`LauncherProtection`、`MainActivity`、`CatFocusPlugin`、`AppUpdatesPlugin`、`UpgradeBackups`、`Reminders` 与 `WallpaperConfirmationActivity` 边界保护。

安装：正式包名 `com.xiaomao.focus`，版本 `0.2.6` / versionCode `12`，沿用现有内测签名。请直接覆盖安装，**不要先卸载旧版**。0.2.1 及后续版本也可从“我的 → 检查更新”下载安装。

验证范围：本轮在代码修订后完成 16 个宿主测试文件 / 132 项单元测试、TypeScript/Vite 与安卓正式包构建与签名/完整性校验，并在 D 盘 Android 16 / API 36 隔离 QA 模拟器上通过 121 项核心/保护仪器测试、5 项学习模式原生测试、5 项滚屏/手势导航触摸测试、6 项 WebView 端到端巡检与软键盘弹窗适配检查。真机厂商定制系统与物理设备特性仍以实际设备为准，见 `docs/focus-control-final-acceptance.md`。
