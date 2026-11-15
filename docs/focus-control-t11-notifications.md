# T11 固定截止原通知暂缓

T11 / #12 在既有 `FocusControl`、会话与 `FocusRecovery` 中接入普通 Android `NotificationListenerService`。代码独立实现，没有复制 Curbox、NotiFilter 或其他 GPL 通知引擎，也没有另建会话引擎或业务数据库。

## 本轮边界

通知拦截偏好独立保存，默认仍关闭；设置、学霸面板与活动页沿用既有 Sheet、开关、按钮和字体。授权、监听连接、当前是否执行、已请求、已由系统核实暂缓、已观察恢复、当前不存在分别显示。拒绝通知访问不影响计时。

T11 只执行当前确有固定截止的严格倒计时。普通可暂停倒计时与正计时显示 `lifecycle_pending`，不因用户打开通知开关自动开启严格模式。暂停期间的持有续期、正计时租期及提前释放属于紧接的 T12；没有添加“暂停后通知提前全部恢复并停止拦截”的产品规则。此状态是分阶段实现边界，不是删除完整 A06 范围，也不能据此宣称 A06 已通过。

与 T09 合并后，普通锁机在原生开始时固定通知偏好，并在开始、读取、解除、重连及恢复时传递共享的当前活动所有者。锁机当前同样显示 `lifecycle_pending`，不因为存在倒计时就宣称已经执行通知拦截；锁机通知生命周期由 T12 继续实现。锁机页复用原有通知状态与恢复组件。上一轮尚待释放的通知责任不会被下一轮未请求通知保护的锁机清除，请求通知保护的锁机则先拒绝冲突。

合并静态与宿主检查：34 项 Vitest、TypeScript/Vite 构建、5 项通知政策通过，`git diff --check` 通过。新增两项 `FocusNotificationTest` 覆盖上述锁机状态及前轮恢复责任；本次合并子任务没有启动 Gradle 或设备测试，新增原生用例仍由持有设备租约的主流程执行，不将旧 T11 APK 的通过结果当作新合并 APK 的结果。

开始时从可信的原生有效白名单快照获取放行集合，运行中修改全局/子待办名单或临时打开应用不会修改本轮通知名单。小猫自身、持续/不可清除、来电、闹钟、全屏提醒和必要系统/紧急通知放行。系统分组可能联动暂缓，第一次请求前登记可见的同组兄弟键，遇到必要例外兄弟则保留整组。还在活动集合中的兄弟键各自请求暂缓。

## 原通知与恢复责任

只调用 API26+ 的公开 `snoozeNotification(originalKey, remainingDuration)`。到期展示、包身份、更新内容和 PendingIntent 由 Android 保留。没有 cancel/repost、正文复制或小猫代发。

`catfocus-notifications-<database>` 是 app-private 运行态 SharedPreferences journal，不进入 AppData、业务导出或升级数据库快照。每个通知键在系统操作之前同步 `commit()`：只保存 key、package、uid、group、会话 id、开机号、单调/墙钟截止及处理阶段，不保存 title、text、任意 extras、Intent URI 或 PendingIntent 对象。不输出真实正文到日志。

系统移除回调或 snoozed 快照用于核实暂缓；同键原通知重新出现才标记观察到恢复。系统撤回期间可能没有回调，因此重连/生命周期工作联合 active 与 snoozed 集合核实；当前两处都不存在的键只记 `absent`，不冒充已恢复。同轮已经恢复的键不会再次暂缓，避免无限重拦截。断连期间原截止仍由系统执行，不依赖小猫进程定时器；重连仅报告当时看到的结果。

新能力通过 `FocusRecovery.RecoveryOperation` 注册到 T08 同一影响清单、确认和重试机制。确认恢复先持久保存 `withdrawn`，停止新拦截且同轮重连不重启。T11 对尚在系统暂缓的原通知保留 `limited` 待恢复责任，直到原截止后核实；不会把“停止新拦截”说成“已释放”。与未清理旧通知冲突的新通知保护或备份替换会被阻止，计时、严格规则与偏好保留。

`NotificationSystem.snooze(key, durationMs)` 保留对已暂缓原键再次改期的公开适配入口。T02 已在历史 API35 MuMu 上观察 `snoozeNotification(key, 1L)` 的提前改期路线，T12 必须在当前官方 API36 与其他目标上重新验证批量释放/开放式租期；不能因没有普通 unsnooze 方法就删除此路线。

## 验证入口

宿主：`powershell -NoProfile -ExecutionPolicy Bypass -File tools/tests/notifications/test-policy.ps1`。首次 red 因缺失通知政策与系统边界符号失败；实现后 5 个字面期望例子通过，覆盖固定剩余时长、截止不再拦截、未连接、有效白名单与必要例外。

原生：`com.xiaomao.focus.FocusNotificationTest` 从 `FocusControl` 公共协调边界验证固定截止、去重、独立于学霸模式、冻结名单、授权/连接/实际处理、只读观察、重建、共享恢复、严格计时保留、撤回与断连。首次 AndroidTest 编译 red 为 8 个缺失 FocusControl seam 符号；接通实现后编译绿色。API36 七项原生 seam 用例已通过，包含 posted 更新不能单凭回调声称恢复，以及系统提前重新显示同键时继续暂缓到原截止。

真实双应用：`FocusNotificationDeviceTest` 需要独立 sender probe 安装且获 POST_NOTIFICATIONS、QA listener 获通知访问、QA 没有活动专注/休息或旧待恢复通知，再由执行者显式传入 `-e runNotificationDeviceFixture true`。测试不会自行安装或授予系统权限；它保存并恢复 QA 默认业务库和 journal，发送唯一合成消息、暂缓、更新、核对正常截止原 key/package/uid/PendingIntent/新 revision，再通过真实通知栏 AccessibilityNodeInfo click 验证 sender 收到 `content_intent_opened`。不使用 `PendingIntent.send()` 冒充用户点击，也不依赖可能被计时通知持续更新阻塞的 UI idle 等待。

设备准备/清理须由持有设备租约的主流程执行，ADB 固定 `D:/KittenFocus-Android/sdk/platform-tools/adb.exe -s emulator-5580`，只安装 `com.xiaomao.focus.qa` 和独立 probe 身份。监听/通知权限与独立包状态先保存基线，结束恢复新增授权和 sender 合成消息。不要将历史 API35 探针成功视为当前 API36 产品通过。

## 当前结果

- 合并 T07 后前端 33 项 Vitest、宿主通知政策 5 项通过；前端 TypeScript 与构建通过。
- QA 主 APK 与 AndroidTest 最终构建通过，且包含集成分支 `b5f27a3` 的临时放行兼容。API36 七项原生控制 seam 用例通过。
- 第一次双应用运行因 instrumentation 重启目标进程后 listener 未重连失败；执行器改为目标进程存在后只切换 QA listener，再调用公开 requestRebind。第二次原通知暂缓、更新到 revision2、原 key/package/uid/PendingIntent 正常截止均通过，但真实通知栏点击没有找到节点；该次仍记失败，证据保留在本机忽略目录 `artifacts/focus-control/t11-api36-first` 与 `t11-api36-green`。窗口检索与真实坐标输入修正等待最终设备复跑，不将 PendingIntent 保持偷换成真实点击通过。
- 提前立即释放、开放式计时、普通暂停续期、重启/工作资料/OEM 完整矩阵仍由 T12 与后续组合验收承担，A06 尚未全部通过。

## API36 最终设备结果

2026-11-15 20:26:44—20:27:01 UTC，`emulator-5580` 官方 API36，独立 QA 与 sender 身份最终 `OK (8 tests)`，原生运行 10.982s。七项控制 seam 与真实双应用固定截止案例全部通过。实测包括原键被系统暂缓、持有期间更新到 revision2、截止后保持原 package/uid/key/PendingIntent 与更新 revision、没有再次无限拦截，以及通知栏真实点击后 sender 收到本次 `content_intent_opened(id=21101, revision=2)`。

Accessibility tree 在本镜像没有暴露该合成标题，因此先保存并目视核对真实通知栏截图：540×960，sender 唯一合成卡片 x24..516 / y325..502，标题约 (200,418)。最终运行显式使用 `--observed-tap 200,420`，测试同时核对屏幕尺寸和原通知仍活动，再用真实系统 `input tap`；不调用 PendingIntent.send。该坐标仅适用于已检查的当前 fixture，其他设备/布局必须先检查截图或改用正常节点点击。保留之前节点路线失败，不能将其擦除成一次全通过。

命令：`python scripts/notification-device-test.py --observed-tap 200,420 --output <ignored-artifacts>/t11-api36-verified`。证据位于主工作区忽略目录 `artifacts/focus-control/t11-api36-verified`，含 instrumentation、APK 哈希、授权/独立包基线与清理结果。诊断截图在 `t11-api36-shade-diagnostic/original-notification-shade.png`。执行器新增的 QA listener 授权已撤销，新安装的 sender 已卸载；原两个系统 listener 保留，QA 业务库和原 journal 已恢复。原包 `com.xiaomao.focus` 没有安装、清空或替换。

最终 SHA-256：

```text
QA app     895170d0dbeaa129b64ea1e5bd8cf090044e530bf9129c1ef8a344e735d360db
QA test    2ad125b2ac132965da88b906ded88f77916173daab6d42cb800c2ff6f379a6f7
sender     06b0d4201806d332b0694825f14ddecf0d677a65102bd7ed1cd22730fccc12b1
```

构建流程是 `npm run build` → `cap sync android` → `.qa` APK，Gradle 全程持有主流程租约且使用 `--no-daemon --max-workers=2`；最终点击修正只重建 AndroidTest APK。包含集成 `b5f27a3` 与 T07 注入构造器兼容。T11 固定截止切片通过，不代表提前释放/正计时完整 A06 通过。
