# T15 自身最近任务卡隐藏与恢复

实现日期：2026-11-15。状态：源码就绪；实际最近任务界面和最终原生运行待设备租约释放后验证。此状态不表示 A09 已通过，issue #16 应保持 OPEN。

## 行为与范围

设置复用原有“提升强制性选项”，独立保存 `preferences.protection.enhancements` 中的 `recentTasksHidden`。开关不立即修改系统，本轮开始时冻结。专注、暂停专注和锁机按同一原生 `FocusControl` 所有权执行；结束、休息和重启中断恢复原状态。

唯一系统写入为自身 `ActivityManager.AppTask.setExcludeFromRecents`。适配器先通过 `getAppTasks()` 限定调用方，再核实包名及 MainActivity（含指向它的自有 alias）。不修改其他包，不添加 MainActivity 永久 excludeFromRecents。已有阻挡页自身的静态排除保持原有职责。

每次修改前同步提交运行私有 SharedPreferences 原任务日志：persistent task ID、base intent component/action/data 身份、原排除标记及施加意图。业务数据、手动备份和升级备份不包含此日志；应用自身 Android backup 已禁用。崩溃后按原日志继续，先确认本应用状态通知和帮助恢复 PendingIntent 可达才隐藏。

恢复按原任务逐项进行，单项失败保留恢复责任并可从共享恢复页重试；未完成恢复会阻止下一轮相冲突的任务隐藏。原先隐藏的任务不强行显示，已移除任务不重建，同 ID 不同 base intent 身份的任务不修改。Android 可能跨重启保留旧最近任务，因此不能假设重启后 flag 自动恢复；同 ID 同身份仍须检查并恢复。原任务被观察到后续改为显示时保留该改动，并撤销本轮继续隐藏。

恢复确认先保存本轮 withdrawal，再写系统；计时及严格规则保持，后续协调不会再次隐藏。恢复不代表防系统强停；任务卡布尔标记不能识别外部写入同一值的来源，因此不声称能检测全部并发同值改动。

## 已执行

- 宿主 RED：`tests/control-bridge.test.ts` 保存任务隐藏选项后浏览器仍启动专注，预期拒绝的测试失败。
- 宿主 GREEN：浏览器明确报告最近任务隐藏只支持 Android；选择保留，活动会话不创建。
- `npm.cmd test`：37 项通过（添加最终状态断言后的复跑见最终提交说明）。
- `npm.cmd run build`：TypeScript 与 Vite 构建通过。
- 首次新建工作区 cap sync 后，QA `assembleDebug`、`assembleDebugAndroidTest` 通过。后续跨重启及 alias 小改、增强白名单接入与新增原生场景还需要最终重建；不能用先前 APK 当最新验证。

## 待执行

设备由 T12 独占，未安装、运行或重启该设备。原生受控 OS seam 测试已编写但尚未运行：`RecentTasksControlTest`，覆盖关闭/开启、冻结、普通暂停、正常休息、失败重试/新轮冲突、明确恢复后不重启、同次启动重建、重启同任务保留或 ID 复用、后续修改、倒计时到期及普通锁机恢复。仅在 `com.xiaomao.focus.qa` 运行，使用独立数据库。

最终新资产流程：`npm.cmd run build` → `npx.cmd cap sync android` → `android/gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest '-PtestApplicationIdSuffix=.qa' --no-daemon --max-workers=2`。JDK21，SDK `E:/codexseeson/fanqiezhong/.tools/android-sdk`。

设备租约获准后，安装两个 QA APK，运行 `com.xiaomao.focus.RecentTasksControlTest`，再运行 `scripts/recent-tasks-device-smoke.mjs`；环境 `ADB=D:/KittenFocus-Android/sdk/platform-tools/adb.exe`、`ANDROID_SERIAL=emulator-5580`。脚本保存真实 launcher overview PNG、UI XML、Android task dumps 和公开桥接快照，验证未启用可见、启用与暂停隐藏、共享恢复可见、恢复后不再隐藏、下一轮和结束/休息恢复。同名其它已安装应用可能使 UI 断言失败，此时须检查截图和任务身份，不能略过并报告成功。

真实进程死亡、实际重启和 OEM/多种 launcher 组合仍需 T22 验证。模拟 OS 测试及 API 读回不能替代真实最近任务界面证据。

## 参考

- Android 官方 `ActivityManager.AppTask`（API21）`getTaskInfo`、`setExcludeFromRecents`。
- Android 官方 `ActivityManager.RecentTaskInfo`、`Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS`。
- Android 官方 `NotificationManager.getActiveNotifications` 与通知授权/频道状态。
- 项目 `docs/references/focus-protection-android-boundaries.md`、`docs/adr/0004-native-focus-control-boundary.md`。
