# 小猫专注 v0.2.17 · 无障碍稳定性加固与全屏覆盖 / 严管防绕过升级（内测版）

- **无障碍单进程回归与连接稳定性修复（`AndroidManifest.xml`、`FocusAccessibilityService`、`FocusProtection`、`Reminders`）**：移除破坏静态状态共享的 `:a11y` 独立进程拆离与非标准前台守护通知，恢复主进程内 `FocusAccessibilityService` 状态与 `FocusBlockOverlay` / `LocalStore` 同步；将 `onUnbind` 返回值修正为 `false` 确保系统重连时重新触发 `onServiceConnected`，补充 `onTaskRemoved` 仅保留会话期保活闹钟拉起；`FocusProtection.authorized` 同时校验全局 `ACCESSIBILITY_ENABLED` 开关与 `ENABLED_ACCESSIBILITY_SERVICES`，避免残留假阳性并在授权保留但服务断连时返回明确原因。
- **专注中保活看门狗与品牌自启动 4 步向导（`FocusKeepAliveService`、`OemKeepAliveRouter`、`StudyModeSheet`、`ProtectionDiagnostics`）**：`FocusKeepAliveService` 新增会话期 2 秒看门狗、划卡 `onTaskRemoved` 闹钟拉起与 180 秒心跳自检；新增按品牌适配的 4 步「后台防清理与保活」向导并适配 ColorOS（`com.oplus.battery`）自启动设置路由；`ProtectionDiagnostics` 同步补充电池优化与自启动入口。
- **全屏专注覆盖层与可选严管防绕过增强（`FocusBlockOverlay`、`DeviceAdminProtection`、`FocusAntiClose`、`FocusEngine`、`StudyModeSheet`）**：统一未开学霸/学霸锁定/拦截页/防退出拉回四态覆盖层，支持按键拦截、安全路由让位与白名单应用切换宽限；严格模式新增可选「严格权限目录防撤权」「设备管理器防卸载（随时可一键停用）」「重启后未到期继续锁机」，适配各品牌应用详情页与 Google Shell 白名单包名映射。

版本号为 `0.2.17`，versionCode 为 `23`。沿用 `com.xiaomao.focus` 和原内测签名。已安装的用户可从「我的 → 检查更新」升级，或直接覆盖安装 APK 保留本地数据。

本次通过 26 个测试文件 / 184 项宿主单元测试、TypeScript/Vite 生产构建、Capacitor 同步、安卓 Debug APK 构建、34 项安卓 JVM 单元测试（`ExampleUnitTest` 1、`AntiCloseWindowOemTest` 2、`AppUsageGuardTest` 3、`BackgroundKeepAliveTest` 3、`FocusNotificationListenerRebindTest` 5、`FocusOverlayAndNavPolicyTest` 10、`OemKeepAliveRouterTest` 2、`RemindersCopyTest` 1、`SplashCoordinatorTest` 4、`UpdateCheckPolicyTest` 3）、安卓仪器测试编译检查与包名/签名/完整性校验（`prepare-update.py`）。未运行模拟器与自动化真机回归测试。
