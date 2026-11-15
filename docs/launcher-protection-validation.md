# T19 自身桌面入口隐藏与恢复

实现使用独立 `com.xiaomao.focus.LauncherAlias` 承载普通 MAIN/LAUNCHER 入口，目标为一直保留的 MainActivity。仅修改本包此 alias 的 enabled setting，不修改 MainActivity、其他组件、包状态或系统桌面数据。生产应用名不变；QA alias 采用已有 `${focusAppLabel}` 区分测试应用。

`launcherIconHidden` 默认不选，原生 FocusControl 在专注或锁机开始时固定本轮选择。启动前先检查通知权限、通知渠道和 MainActivity 是否可用；开始生成控制通知后，隐藏前再次读取实际活动通知，要求控制 PendingIntent 和“帮助与故障恢复”action 属于本包。缺少入口不会隐藏。开始失败时不会新增会话；开始后验证入口失败时，计时可继续，状态显示本轮撤销和原因。

组件原始 enabled setting、会话、启动代号及版本写入独立私有恢复 journal；保存成功后才写 PackageManager。恢复精确回写 DEFAULT/ENABLED 等原状态，原本停用的入口不擅自开启。发现后续组件更改时保留后续选择并撤销本轮隐藏。恢复失败保留责任并可重试，阻止新一轮冲突隐藏和覆盖备份。通知失效、正常结束、休息、重启中断、版本变化、MY_PACKAGE_REPLACED 和确认故障恢复均进入同一恢复路径；同轮撤销不因通知恢复或服务重连再次隐藏。

`getLauncherStatus` 与 `observeControl.launcher` 区分组件状态、PackageManager 是否解析出 alias、通知入口可达和恢复待办。`launcherCacheVerified` 固定 false：原生组件 API 无法证明厂商启动器已刷新屏幕缓存。页面明确提示等待缓存刷新。普通安装无法保证强停后自动执行恢复、不能禁止卸载；MainActivity 显式恢复入口始终保留。

## 已执行验证

- TDD 首条公共 FocusControl 测试先编译失败于缺少 LauncherSystem 与注入构造器，随后 QA APK 与 instrumentation APK 编译通过。
- 浏览器 Vitest 40 项通过，包括选中图标隐藏时拒绝启动与 unsupported 状态；TypeScript/Vite build 通过。
- `scripts/launcher-device-smoke.mjs` 语法检查通过。

## 设备验证交接

原生公共边界测试类：`com.xiaomao.focus.LauncherControlTest`（10 场景）。只替换 OS 组件/通知边界及时间，复用真实原生会话、SQLite 与恢复协调层。执行需要设备租约、最新 QA app/test APK 和 `scripts/run-isolated-android-tests.py`。

真实系统脚本：`node scripts/launcher-device-smoke.mjs`，需要 `ADB=D:/KittenFocus-Android/sdk/platform-tools/adb.exe`、`ANDROID_SERIAL=emulator-5580` 和已安装最新 `.qa` APK。保存 app drawer 前后截图/XML，实际点击控制通知与恢复 action、确认原组件状态恢复，验证拒绝通知权限、默认关闭、正常结束/休息与进程死亡恢复。脚本拒绝非默认 alias 基线；恢复 QA 数据与原通知授权，不更改其他应用或 launcher 数据。通知处于暂停态以避免活动 chronometer 妨碍 UiAutomator idle。

**截至本文件提交，10 项原生用例运行、真实启动器/通知场景、真实重启与 APK 升级仍待执行；编译成功不算实际系统效果通过。** 设备租约由主执行者持有，T19 不在无租约时安装、重启或操作设备。真实重启应先开始活动隐藏，重启后确认 alias 已恢复、会话中断、原始状态未丢。真实升级应保留活动隐藏并覆盖安装更高版本 QA APK，确认 MY_PACKAGE_REPLACED 恢复且该轮不再隐藏。
