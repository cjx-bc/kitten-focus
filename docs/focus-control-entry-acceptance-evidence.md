# T16、T19、T21 设备补验交接

2026-11-15，API 36 / Android 16，官方隔离模拟器 `emulator-5580`，仅 `com.xiaomao.focus.qa`。本工作树为 `cjx-bc/acceptance-finish`；未修改产品实现、未清理或操作生产包。

实际安装的是集成分支 `c547c50` 构建的 APK，SHA-256：

`c1963e0d88bba37a779ed31349d2e22e1b94c3c5880dd5d4fe2e20e89e6ac92b`

证据在工作树忽略目录 `artifacts/focus-control/api36/acceptance-finish/`。每个会修改配置的脚本保存业务数据及相关系统开关基线，并在 finally 恢复；控制所有者已清空后归还设备租约。没有执行重启、升级或真实通话。

## 本次已执行

| 检查 | 结果与证据 |
| --- | --- |
| 主机测试与构建 | `npm.cmd test` 55/55；`npm.cmd run build` 通过。 |
| T16 真实入口、路由与冷启动 | `main-entry/01-launcher-and-hash-restricted.png` 及 `main-entry-final2/01-launcher-and-hash-restricted.png`。桌面启动、显式普通启动、五个业务 hash 重定向、四个安全页及强停后同一严格锁机身份通过。整份脚本没有一次完整通过，不能把日志标为整文件 GREEN。 |
| T16 普通锁机真实解除 | `ordinary/results.json`、`ordinary/ordinary-confirmed-unlock-restores-settings.png`。未选增强时可进业务；下一轮选择后重定向锁机；等待真实按钮和 Sheet 挂载后点击“提前解除 → 确认解除”；所有者变空并可进设置。可用 `scripts/main-entry-ordinary-device-smoke.mjs` 单独重复，无需再等待严格倒计时。 |
| T21 Android 离线帮助 | `help/results.json`、`help/help-offline.json` 及两张截图。实际 Android WebView 的 8 个完整章节、10 项诊断、Enter 激活目录并聚焦/滚动至恢复正文、窄屏无横向溢出全部通过。只对该 CDP WebView 临时关闭网络，finally 恢复，不改变宿主机或模拟器全局网络。 |
| T19 Launcher3 原始与默认关闭 | `launcher/01-original-visible.{xml,png}`、`launcher/02-default-off-visible.{xml,png}`。实际应用抽屉可见，PackageManager 解析与截图一致。 |
| T19 通知拒绝门槛 | `gate/result.json`。显式等待新页面上下文后，原生偏好确认为 `launcherIconHidden`，实际 `POST_NOTIFICATIONS granted=false`、`recoveryAvailable=false`；开始专注被拒绝，所有者仍为空，图标组件保持默认。 |

## 夹具问题与修正

首次图标全脚本在拒绝门槛处出现“没有抛错”。`Page.reload` 返回时旧页面的 `.tabbar` 仍存在，旧 Pinia 可覆盖刚写入的偏好。聚焦重测使用旧文档标记，等标记消失和新应用初始化后，实际门槛正确拒绝；未改动或放宽产品断言。集成提交 `c227b2d` 已在公共 QA helper 修复该类重载等待。

本工作树还修复了重复夹具保留 `#/lock` 导致等待不到普通五栏界面的问题：种子写入后先定位 `#/tasks` 再重载。保存失败日志，并在失败清理时将 QA 带回前台，避免后台 WebView 的暂停回调阻塞自然到期清理。

新增的 T21 “系统授权页按 Back 返回”检查遇到系统设置已有返回栈，即使四次 Back 仍未恢复原应用。相关失败留在 `main-entry/failure.json`、`main-entry-final2/failure.json`；这段新增检查已从 T16 长脚本移除，不能算权限刷新验收通过。应在无活动计时的独立窗口通过实际普通启动或最近任务返回，再检查诊断刷新，避免重复严格锁机长夹具。

## 仍待实际执行

- T19：使用已修复重载等待的完整 `scripts/launcher-device-smoke.mjs`，验证隐藏后的真实应用抽屉、控制通知内容点击、通知恢复动作、正常结束/休息恢复、以及通知撤权杀进程后的用户系统设置备用路径。备用路径为实际系统“无障碍 → 小猫专注 QA → Settings”行；`connectQa({ launch: false })` 只连接该点击已启动的进程。没有用显式启动 MainActivity 或 PendingIntent.send 冒充该证明。
- T21：系统返回后的真实动态权限/连接刷新；隐藏图标后的通知恢复入口。离线/键盘/滚动部分已通过。
- T22：`scripts/entry-combination-device-smoke.mjs` 已准备、仅语法检查，尚未设备执行。覆盖严格锁机同时选择禁止主界面、隐藏图标和最近任务，真实恢复 Sheet 一次撤销三项，并检查同一严格身份/截止时间、重连与重载不重新施加。它不能代替壁纸、通知拦截或真实 OEM 组合验收。
- 重启与真实升级尚未执行；仍由后续 T22 集成窗口完成。T16 历史严格恢复/自然到期证据及原生 4 项结果需与集成分支原有记录一并汇总，不能从本次部分长脚本日志推断。

`scripts/help-device-smoke.mjs` 可以在独立空闲窗口重测帮助；上述脚本均只允许隔离 QA 包。运行需要显式设置 `ADB=D:/KittenFocus-Android/sdk/platform-tools/adb.exe` 与 `ANDROID_SERIAL=emulator-5580`，并先取得协调器设备租约。
