小猫专注 v0.2.7 · 兼容性加固与通知恢复修复（内测版）

分发状态：GitHub、官网下载页和应用内更新已同步。

- 通知恢复与控制：`NotificationProtection` 修复严格倒计时自然到期交接空窗导致的误判（`absent`），补充回归单测；`FocusNotificationDeviceTest` 与 `FocusNotificationLifecycleDeviceTest` 改为通用节点/坐标点击以适配非 540×960 分辨率。
- 日历、锁机与壁纸：优化重复日程/课程时间枚举与单次编辑冲突校验（`calendar.ts` / `CalendarView.vue`）；锁机确认弹窗绑定准备时点数据快照（`LockView.vue` / `stores/app.ts`）；壁纸辅助页增加操作修订守卫（`WallpaperSetting.vue`）。
- 安卓原生与资源精简：精简冗余启动图与 launcher 前景资源，新增 `cat_mark.xml` 与 `data_extraction_rules.xml`；适配 `FocusBlockActivity` 返回键分发与 `AndroidDndSystem` / `Reminders` / `UpgradeBackups` / `FocusNavigation` / `FocusNotificationListener` API 26–36 边界并新增 `AndroidCompatibilityTest`。
- 发布页与分发链路：修复发布页 `download.js` 20 秒总时长误中断（改为分块无进展超时）；`publish-update.py` 支持 `SSH_BIND_ADDRESS` 绑定物理网卡及远端下载校验兜底；修复 Gradle `buildConfig = true` 弃用警告与设备烟雾测试脚本。

安装：正式包名 `com.xiaomao.focus`，版本 `0.2.7` / versionCode `13`，沿用现有内测签名。请直接覆盖安装，**不要先卸载旧版**。0.2.1 及后续版本也可从“我的 → 检查更新”下载安装。

验证范围：本轮完成 16 个宿主测试文件 / 143 项单元测试、TypeScript/Vite、正式 APK 构建与签名/完整性校验（`prepare-update.py`），并在 D 盘 Android 16 / API 36 隔离 QA 模拟器上通过 125 项核心与兼容性仪器测试、25 项通知原生/真机测试、3 项全局白名单烟雾测试与 5 项业务回归烟雾测试（`--details-only`）。真机厂商定制系统与物理设备特性仍以实际设备为准，见 `docs/focus-control-final-acceptance.md`。
