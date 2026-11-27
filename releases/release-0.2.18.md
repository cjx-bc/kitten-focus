# 小猫专注 v0.2.18 · 通知使用权与无障碍恢复（内测版）

- **通知监听前台组件重绑回退（`FocusNotificationListener`）**。通知使用权仍获授权时，先请求系统重绑，等待 `REBIND_VERIFY_DELAY_MS`（800 ms）后检查连接。如果应用处于前台且监听仍未连接，通过 `try/finally` 禁用后重新启用自身监听组件，组件切换冷却为 30 秒。`FocusNotificationListenerRebindTest` 覆盖重绑条件与冷却规则。
- **区分无障碍未授权和开关保留但服务断连（`studyPermissions.ts`、`protectionDisplay.ts`、`FocusProtection.java`、`StudyModeSheet.vue`）**。权限页显示「开关仍在 · 需重开」，提供「前往重开无障碍」入口，说明如何在系统设置关闭再开启小猫专注。日常应用限制可继续使用已就绪的「使用情况访问 + 悬浮窗」。严格权限目录防撤权也纳入学霸模式的无障碍状态判断。
- **补齐各品牌后台恢复指引（`OemKeepAliveRouter.java`、`Reminders.java`、`protectionHelp.ts`、`docs/ux-spec.md`）**。OPPO/ColorOS、小米/澎湃 OS、vivo/OriginOS、华为/荣耀及三星各有对应说明，涵盖手机管家或安全中心信任白名单、风险管控或 Android 受限设置，并补充通用 Android 路径。离线帮助同步更新。无障碍撤权提醒使用 `BigTextStyle`，展开后可查看恢复步骤。

版本号为 `0.2.18`，versionCode 为 `24`。沿用 `com.xiaomao.focus` 和原内测签名。已安装的用户可从「我的 → 检查更新」升级，或直接覆盖安装 APK 保留本地数据。

26 个宿主测试文件的 187 项测试全部通过。TypeScript/Vite 生产构建、Capacitor 同步、Android Debug APK 构建、39 项 Android JVM 单元测试（`ExampleUnitTest` 1、`AntiCloseWindowOemTest` 2、`AppUsageGuardTest` 3、`BackgroundKeepAliveTest` 3、`FocusNotificationListenerRebindTest` 7、`FocusOverlayAndNavPolicyTest` 10、`OemKeepAliveRouterTest` 4、`RemindersCopyTest` 2、`SplashCoordinatorTest` 4、`UpdateCheckPolicyTest` 3）及仪器测试的 Java 编译检查全部通过。`prepare-update.py` 校验了包名、版本和签名，生成的 APK 大小为 4,918,320 字节，SHA-256 为 `2f56a49ff8478a1a3b609ae6db1d0c7082d065316d72601abb84081ada201ecf`。

OPPO Find X7 Ultra（PHY110，Android 17 / ColorOS V17.0.0）使用 `adb install -r` 从 0.2.17（versionCode 23）覆盖升级到 0.2.18（versionCode 24）。设备本地时间 `firstInstallTime` 为 2026-11-15 14:27:41，升级前后一致，`lastUpdateTime` 从 2026-11-27 16:17:51 更新到 2026-11-27 16:56:40。系统确认小猫专注与木木记账的无障碍服务均已绑定、崩溃服务列表为空、通知监听已连接。权限页一度显示无障碍重开引导，随后在未操作开关的情况下显示「已就绪」。核验了 ColorOS「后台防清理与保活」第 3 步中的「手机管家 / 安全中心」及「信任或白名单」文案，随后返回待办主页。

未运行模拟器回归或自动化真机仪器测试。
