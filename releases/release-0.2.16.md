# 小猫专注 v0.2.16 · 双引擎免掉权应用限制与悬浮窗阻挡兜底（内测版）

- **双引擎免掉权应用限制（`AppUsageGuard`、`UsageAppMonitor`、`FocusBlockOverlay`）**：日常「应用限制」与「独立锁机」优先采用 **「使用情况访问（`PACKAGE_USAGE_STATS`）+ 悬浮窗（`SYSTEM_ALERT_WINDOW`）」** 持久化权限执行，从多任务划卡退出、强行停止或重启手机后系统均不会撤回授权；会话期间由 `FocusKeepAliveService` 托管轻量前台应用监测，检测到名单外应用时优先拉起 `FocusBlockActivity`，在厂商拦截后台弹窗时自动以全屏 `FocusBlockOverlay` 遮罩兜底并保留「返回当前会话」与「临时打开应用」出口。
- **无障碍服务降级为高阶增强可选引擎**：仅开启「限制桌面与最近任务」或「精确防关闭」时才需要无障碍服务；已连接无障碍时保留瞬时识别能力，未开启或被系统撤回时由「使用情况访问 + 悬浮窗」主引擎无缝接管。
- **前端授权引导、诊断与文档同步升级**：更新 `StudyModeSheet`、`LockView`、`ProtectionDiagnostics`、`studyPermissions`、`protectionDisplay`、`protectionHelp` 及 `docs/ux-spec.md`，围绕持久化权限重构缺失权限提示、引导步骤与边界说明。
- **真机调试授权脚本扩展**：`scripts/android-dev-install.mjs` 与 `scripts/lib/android-dev-install.mjs` 新增 `GET_USAGE_STATS` 与 `SYSTEM_ALERT_WINDOW` 尽力授权步骤。

版本号为 `0.2.16`，versionCode 为 `22`。沿用 `com.xiaomao.focus` 和原内测签名。已安装的用户可从「我的 → 检查更新」升级，或直接覆盖安装 APK 保留本地数据。

本次通过 24 个测试文件 / 179 项宿主单元测试、TypeScript/Vite 生产构建、Capacitor 同步、安卓 Debug APK 构建、19 项安卓 JVM 单元测试（`ExampleUnitTest` 1、`AppUsageGuardTest` 2、`BackgroundKeepAliveTest` 3、`FocusNotificationListenerRebindTest` 5、`RemindersCopyTest` 1、`SplashCoordinatorTest` 4、`UpdateCheckPolicyTest` 3）、安卓仪器测试编译检查与包名/签名/完整性校验（`prepare-update.py`）。未运行模拟器与自动化真机回归测试。
