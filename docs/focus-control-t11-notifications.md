# T11 固定截止原通知暂缓

T11 / #12 在既有 `FocusControl`、会话与 `FocusRecovery` 中接入普通 Android `NotificationListenerService`。代码独立实现，没有复制 Curbox、NotiFilter 或其他 GPL 通知引擎，也没有另建会话引擎或业务数据库。

## 本轮边界

通知拦截偏好独立保存，默认仍关闭；设置、学霸面板与活动页沿用既有 Sheet、开关、按钮和字体。授权、监听连接、当前是否执行、已请求、已由系统核实暂缓、已观察恢复、当前不存在分别显示。拒绝通知访问不影响计时。

T11 只执行当前确有固定截止的严格倒计时。普通可暂停倒计时与正计时显示 `lifecycle_pending`，不因用户打开通知开关自动开启严格模式。暂停期间的持有续期、正计时租期及提前释放属于紧接的 T12；没有添加“暂停后通知提前全部恢复并停止拦截”的产品规则。此状态是分阶段实现边界，不是删除完整 A06 范围，也不能据此宣称 A06 已通过。

开始时从可信的原生有效白名单快照获取放行集合，运行中修改全局/子待办名单或临时打开应用不会修改本轮通知名单。小猫自身、持续/不可清除、来电、闹钟、全屏提醒和必要系统/紧急通知放行。系统分组可能联动暂缓，第一次请求前登记可见的同组兄弟键，遇到必要例外兄弟则保留整组。还在活动集合中的兄弟键各自请求暂缓。

## 原通知与恢复责任

只调用 API26+ 的公开 `snoozeNotification(originalKey, remainingDuration)`。到期展示、包身份、更新内容和 PendingIntent 由 Android 保留。没有 cancel/repost、正文复制或小猫代发。

`catfocus-notifications-<database>` 是 app-private 运行态 SharedPreferences journal，不进入 AppData、业务导出或升级数据库快照。每个通知键在系统操作之前同步 `commit()`：只保存 key、package、uid、group、会话 id、开机号、单调/墙钟截止及处理阶段，不保存 title、text、任意 extras、Intent URI 或 PendingIntent 对象。不输出真实正文到日志。

系统移除回调或 snoozed 快照用于核实暂缓；同键原通知重新出现才标记观察到恢复。系统撤回期间可能没有回调，因此重连/生命周期工作联合 active 与 snoozed 集合核实；当前两处都不存在的键只记 `absent`，不冒充已恢复。同轮已经恢复的键不会再次暂缓，避免无限重拦截。断连期间原截止仍由系统执行，不依赖小猫进程定时器；重连仅报告当时看到的结果。

新能力通过 `FocusRecovery.RecoveryOperation` 注册到 T08 同一影响清单、确认和重试机制。确认恢复先持久保存 `withdrawn`，停止新拦截且同轮重连不重启。T11 对尚在系统暂缓的原通知保留 `limited` 待恢复责任，直到原截止后核实；不会把“停止新拦截”说成“已释放”。与未清理旧通知冲突的新通知保护或备份替换会被阻止，计时、严格规则与偏好保留。

`NotificationSystem.snooze(key, durationMs)` 保留对已暂缓原键再次改期的公开适配入口。T02 已在历史 API35 MuMu 上观察 `snoozeNotification(key, 1L)` 的提前改期路线，T12 必须在当前官方 API36 与其他目标上重新验证批量释放/开放式租期；不能因没有普通 unsnooze 方法就删除此路线。

## 验证入口

宿主：`powershell -NoProfile -ExecutionPolicy Bypass -File tools/tests/notifications/test-policy.ps1`。首次 red 因缺失通知政策与系统边界符号失败；实现后 5 个字面期望例子通过，覆盖固定剩余时长、截止不再拦截、未连接、有效白名单与必要例外。

原生：`com.xiaomao.focus.FocusNotificationTest` 从 `FocusControl` 公共协调边界验证固定截止、去重、独立于学霸模式、冻结名单、授权/连接/实际处理、只读观察、重建、共享恢复、严格计时保留、撤回与断连。首次 AndroidTest 编译 red 为 8 个缺失 FocusControl seam 符号；接通实现后初版 AndroidTest 编译绿色。后续完整运行结果见下文设备记录。

真实双应用：`FocusNotificationDeviceTest` 需要独立 sender probe 安装且获 POST_NOTIFICATIONS、QA listener 获通知访问、QA 没有活动专注/休息或旧待恢复通知，再由执行者显式传入 `-e runNotificationDeviceFixture true`。测试不会自行安装或授予系统权限；它保存并恢复 QA 默认业务库和 journal，发送唯一合成消息、暂缓、更新、核对正常截止原 key/package/uid/PendingIntent/新 revision，再通过真实通知栏 AccessibilityNodeInfo click 验证 sender 收到 `content_intent_opened`。不使用 `PendingIntent.send()` 冒充用户点击，也不依赖可能被计时通知持续更新阻塞的 UI idle 等待。

设备准备/清理须由持有设备租约的主流程执行，ADB 固定 `D:/KittenFocus-Android/sdk/platform-tools/adb.exe -s emulator-5580`，只安装 `com.xiaomao.focus.qa` 和独立 probe 身份。监听/通知权限与独立包状态先保存基线，结束恢复新增授权和 sender 合成消息。不要将历史 API35 探针成功视为当前 API36 产品通过。

## 当前结果

- 前端 32 项 Vitest、宿主通知政策 5 项通过；前端 TypeScript 与构建通过。
- 初版原生主代码与 AndroidTest 编译通过；完整原生与当前 API36 双应用运行等待设备租约，未据编译结果冒充设备通过。
- 提前立即释放、开放式计时、普通暂停续期、重启/工作资料/OEM 完整矩阵仍由 T12 与后续组合验收承担，A06 尚未全部通过。
