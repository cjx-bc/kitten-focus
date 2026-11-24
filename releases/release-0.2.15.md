# 小猫专注 v0.2.15 · 真机全量实测问题修复与体验加固（内测版）

- **通知使用权自动重连与冷却兜底**：在 `MainActivity` `onCreate`/`onResume` 自动调用 `FocusNotificationListener.rebindIfAuthorized`（新增 10 秒冷却节流与连接重置），并在前端 `app.ts` 启动专注与独立锁机前于已授权未连接时自动触发 `rebind()` 重试，修复 ColorOS 强停或重开后通知监听长期停留在「已授权但未连接」的问题。
- **专注结算通知文案对齐术语规范**：将 `Reminders.showFinished` 系统通知标题从“本次专注已完成”修正为符合 `GLOSSARY.md` 的“本次专注正常结束”。
- **超窄屏日历与高分屏图表渲染优化**：更新 `docs/ux-spec.md` 与 `CalendarView.vue`，在 `<= 350px` 屏幕下取消 7 列日历水平内边距（`320px` 视口单格拓宽至 `45.7px × 72px`）；通过共用单次注册模块 `catFocusPlugin.ts` 消除 `CatFocus` 重复注册告警；将 ECharts `devicePixelRatio` 上限设为 `2`，大幅降低 4.5x 高分屏画布显存占用；并在「使用帮助」和「本地备份与恢复」中明确披露 ColorOS 强行停止与独立锁机历史保留范围。
- **真机 E2E 与调试安装工具链加固**：`ux-compliance-audit.mjs` 与 `uxAudit.ts` 支持 `<= 340px` `16px` 页边距及 7 列日历几何规则，`ux-e2e-device-runner.mjs` 等待弹窗过渡完成后再截屏，修复 `device-bridge.mjs` 与 `android-dev-install.mjs` 的 ADB 冷启动 `authorizing` 等待、权限只读预检与大包日志缓冲区限制。

版本号为 `0.2.15`，versionCode 为 `21`。沿用 `com.xiaomao.focus` 和原内测签名。已安装的用户可从「我的 → 检查更新」升级，或直接覆盖安装 APK 保留本地数据。

本次通过 24 个测试文件 / 177 项宿主单元测试（0 重复注册告警）、TypeScript/Vite 生产构建、安卓 APK 构建、17 项安卓 JVM 单元测试（`ExampleUnitTest` 1、`BackgroundKeepAliveTest` 3、`FocusNotificationListenerRebindTest` 5、`RemindersCopyTest` 1、`SplashCoordinatorTest` 4、`UpdateCheckPolicyTest` 3）、安卓仪器测试编译检查与包名/签名/完整性校验（`prepare-update.py`），并在 **OPPO Find X7 Ultra（Android 17 / ColorOS 17，API 37，320px 视口）** 真机上通过保留个人数据覆盖升级、`ux-e2e-device-runner.mjs --suite all` 全量回归（10/10 功能场景、28/28 UX 审计检查点、0 JS 错误、0 Logcat 崩溃）及逐项专项真机复测。
