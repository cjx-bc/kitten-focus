# 小猫专注 v0.2.14 · 覆盖升级自动重连通知监听与真机调试提效（内测版）

- **覆盖安装自动重连通知监听（`ACTION_MY_PACKAGE_REPLACED`）**：在 `FocusNotificationListener` 新增 `shouldRequestRebind` / `rebindIfAuthorized`，并在 `ReminderReceiver` 收到系统替换包广播后自动请求系统重新绑定已授权的通知监听服务，减少升级后“已授权但等待连接”状态。
- **真机调试一键覆盖安装与自动恢复权限脚本**：新增 `npm.cmd run android:dev-install`、`npm.cmd run android:install` 与 `npm.cmd run android:grant`（`scripts/android-dev-install.mjs`），支持通过 ADB 保留数据覆盖安装并按设备 API 级别自动恢复受限设置、通知、准时闹钟、电池优化白名单、安装更新权限、勿扰权限、通知使用权与无障碍服务（保留其他应用已开启服务，并附 OPPO / ColorOS「禁止权限监控」一次性设置提示）。

版本号为 `0.2.14`，versionCode 为 `20`。沿用 `com.xiaomao.focus` 和原内测签名。已安装的用户可从「我的 → 检查更新」升级，或直接覆盖安装 APK 保留本地数据。

本次通过 23 个测试文件 / 174 项宿主单元测试、TypeScript/Vite 生产构建、安卓 APK 构建、15 项安卓 JVM 单元测试（`ExampleUnitTest` 1、`BackgroundKeepAliveTest` 3、`FocusNotificationListenerRebindTest` 4、`SplashCoordinatorTest` 4、`UpdateCheckPolicyTest` 3）、安卓仪器测试编译检查与包名、签名和完整性校验（`prepare-update.py`）。未运行模拟器与真机回归测试。
