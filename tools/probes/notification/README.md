# 原通知暂缓探针（T02 / #3）

这个独立 Gradle 工程构建两个**仅 debug** APK，不加入主应用的 Manifest、服务、会话或数据库。发送端 `com.xiaomao.focus.probe.sender` 生成合成通知，控制端 `com.xiaomao.focus.probe.controller` 使用普通 `NotificationListenerService` 身份。控制端只筛选这个发送包，不取消通知、不代发通知、不反射隐藏 API、不配置 assistant、设备所有者或系统权限。

本探针验证公开 API 的实际效果；[设备结果](RESULTS.md)不代表完整 A06 已通过。两端都有可操作的原生界面；导出的显式广播入口只属于这些隔离调试包，不是小猫产品 API。

## 构建与主机检查

使用根工程现有 Gradle 8.14.3 wrapper、AGP 8.13.0、Java 17+ 与 Android SDK 36；无需 npm 或 AndroidX 依赖。必须在根任务分配的构建窗口运行，避免与其他 Gradle 构建争用资源。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\probes\notification\build.ps1 `
  -SdkPath E:\codexseeson\fanqiezhong\.tools\android-sdk `
  -JavaHome 'C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot'

# 只运行主机检查，不启动 Gradle
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\probes\notification\self-check.ps1 `
  -JavaHome 'C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot'
python -m py_compile tools/probes/notification/run-scenarios.py
```

输出为 `sender/build/outputs/apk/debug/sender-debug.apk` 与 `controller/build/outputs/apk/debug/controller-debug.apk`。`results/`、Gradle 缓存、构建文件和本地 SDK 配置均忽略。主机测试经过实际 red → green：先缺失 `HoldRequest` 编译失败，再分别观察固定截止、断连/必要例外/无截止场景断言失败后补实现。它们验证公开 hold 命令的决策结果，不能替代 Android 系统效果验证。

## 隔离设备操作

只在已授权的测试设备运行。先记录 `settings get secure enabled_notification_listeners`、设备/API 和测试包是否已安装；恢复时保留其他监听器，勿覆盖原有应用数据。正常安装后可以从桌面打开两个中文探针界面，发送端请求 Android 13+ 通知权限，控制端打开系统通知使用权设置，手动为控制端授权。

等效的开发设备命令（`$adb` 和 `$serial` 需要按当前环境设置）：

```powershell
$adb = 'E:\codexseeson\fanqiezhong\.tools\android-sdk\platform-tools\adb.exe'
$serial = '127.0.0.1:16416'
$listenerBaseline = & $adb -s $serial shell settings get secure enabled_notification_listeners
& $adb -s $serial install -r tools/probes/notification/sender/build/outputs/apk/debug/sender-debug.apk
& $adb -s $serial install -r tools/probes/notification/controller/build/outputs/apk/debug/controller-debug.apk
# 仅 API 33+；低版本跳过
& $adb -s $serial shell pm grant com.xiaomao.focus.probe.sender android.permission.POST_NOTIFICATIONS
& $adb -s $serial shell cmd notification allow_listener com.xiaomao.focus.probe.controller/.ProbeListener
& $adb -s $serial shell am start -n com.xiaomao.focus.probe.controller/.ControllerActivity
try {
  python tools/probes/notification/run-scenarios.py --adb $adb --serial $serial --case all
} finally {
  & $adb -s $serial shell am broadcast -n com.xiaomao.focus.probe.sender/.CommandReceiver --es op cancel_all
  # 若开始前未给此探针授权，撤销本次新增的监听授权。
  if (-not $listenerBaseline.Contains('com.xiaomao.focus.probe.controller')) {
    & $adb -s $serial shell cmd notification disallow_listener com.xiaomao.focus.probe.controller/.ProbeListener
  }
  # 回读并与保存的原始基线比较；基线原本不存在时删除本次留下的空设置。
  if ($listenerBaseline.Trim() -eq 'null') {
    & $adb -s $serial shell settings delete secure enabled_notification_listeners
  }
  & $adb -s $serial shell settings get secure enabled_notification_listeners
}
```

脚本不会安装、授权或改系统设置；它通过公开广播和 JSONL 事件观察实际系统状态，失败返回非零，同时保存所有已观察到的案例。默认逐案例执行 normal / early / update / withdraw / group / duplicate / exceptions / disconnect，或用 `--case` 单独运行。normal 必须在通知栏真实点击合成通知，不能把 `PendingIntent.send()` 返回当成点击已生效。优先使用 UIAutomator 查找唯一合成标题；MuMu 本次 UIAutomator 进程 exit 139，因此在视觉确认标题坐标后使用 `--tap-position 300 500`。此坐标仅适用于已确认的本次屏幕位置，换分辨率/通知数量必须重新确认；可直接在界面手动点击并检查发送端事件。

重复整套实验前可执行发送端 `cancel_all` 清理旧合成通知，使通知栏点击定位明确。此动作是发送者撤回自己的测试消息，不是控制端恢复路线。安装前没有的探针包可在保存 JSONL 后卸载；保留应用时也要撤销实验新增的监听授权。

## 显式命令合同

广播使用 `am broadcast -n <package>/.CommandReceiver --es op <operation>`；`id` / `revision` 是 `--ei`，`duration_ms` 是 `--el`，`kind` 是 `--es`。默认 `id=101`、`revision=1`、`duration_ms=15000`、`kind=normal`。

| 身份 | op | 行为 / 结果 |
| --- | --- | --- |
| sender | `post`, `update` | 使用同一个 `tag=probe` + id 发送或更新通知，revision 仅为合成元数据 |
| sender | `withdraw` | 发送端撤回指定 id；用于检查被暂缓消息是否仍被系统撤回 |
| sender | `group` | 发送 summary #200、children #201/#202，固定 `probe_group` |
| sender | `duplicate` | 同一 id 连发两个 revision，检查通知键去重 |
| sender | `cancel_all` | 清理发送端自己的全部合成通知 |
| controller | `snapshot` | 只读取发送端活动/暂缓通知元数据；API 24/25 标记不支持 snooze |
| controller | `hold` | 仅暂缓活动目标到固定截止；id=-1 选择发送端所有活动通知，1..300000ms；不支持或必要通知明确拒绝 |
| controller | `no_deadline` | 返回 `unsupported_no_deadline`，不假装已有无限期暂存策略 |
| controller | `early_release` | 返回 `no_public_unsnooze_api_for_ordinary_listener`，不执行隐藏 unsnooze |
| controller | `resnooze_short` | 对指定已暂缓 key 再调用公开 `snoozeNotification(key, 1L)`；记录实验请求，等待真实回调/快照，不声称跨设备保证 |
| controller | `click` | 尝试调用活动原通知的 PendingIntent；可能受后台 Activity 启动限制。必须另见发送端 `content_intent_opened` 才算已打开 |
| controller | `disconnect`, `rebind` | 公开 `requestUnbind` / `requestRebind`，验证失联窗口内系统到期与重连后状态 |

`kind` 允许 `normal` / `ongoing` / `call` / `alarm` / `full_screen`。控制端豁免持续、不可清除、call/alarm 类别和实际带 fullScreenIntent 的通知。发送端记录系统是否允许 full-screen intent，未获得该能力时不能把该案例当成真正全屏提醒通过。固定时长采用 `elapsedRealtime`；请求写入后才调用系统。重复 hold 一个已暂缓目标因不在活动集合而拒绝，避免制造第二份本地通知。

## 元数据合同与判读

两端 app-private `files/probe-events.jsonl` 为逐行 JSON，Logcat tag=`NotificationProbe` 同步输出相同行。最外层字段：`schema=1`、`event`、`wallTimeMs`、`elapsedMs`、`actorPackage`、`actorUid`、`api`、`manufacturer`、`model`、`fingerprint`、`details`。

通知元数据只含 package/uid/key/id/tag/postTime、groupKey/groupSummary、flags/category/ongoing/clearable、channelId、必要例外判定、合成 revision 与 PendingIntent 创建者包/uid。**不存 title、text、任意 extras、Intent URI、消息正文或 PendingIntent 序列化对象。** 监听其他包的回调直接忽略。异常只记录类名；不导出系统完整 notification dump。

关键事件：`snooze_requested` 保存请求墙钟/单调时间与预定释放时刻；`snooze_call_returned` 只表示调用返回；`notification_removed(reason=18)` 与 snapshot.snoozed 才是实际暂缓证据；`notification_reappeared` 保存实际回调时刻、相对原截止偏差、原键/包/创建者与进程内 PendingIntent 等同性。原始内容更新需要同时检查 revision；更新 PendingIntent 的 extras 是发送者行为。进程重建后 PI 等同性为 null，不能填 true。

暂缓期间由发送端撤回，系统本次未再给 listener 撤回回调；因此本地 hold journal 可能保留无法观察的旧责任。它是实验相关性记录，不是产品恢复引擎：必须联合发送端撤回记录与活动/暂缓快照判断，不得仅凭未来同键 posted 断言旧消息恢复。断连窗口内的精确系统恢复时刻不可观察，重连时只报告当时已活动，不能伪造到期回调时间。通知声音、振动、闪现和重启行为需要额外实测，本 runner 没有证明它们。

```powershell
& $adb -s $serial shell run-as com.xiaomao.focus.probe.sender cat files/probe-events.jsonl
& $adb -s $serial shell run-as com.xiaomao.focus.probe.controller cat files/probe-events.jsonl
```

## 来源与许可

实现为本项目独立 Java 代码，没有复制 Curbox/NotiFilter/GPL 源码；它们只提供了研究方向。2026-11-15 核对下列官方原始资料：

- [NLS 公开接口](https://developer.android.com/reference/android/service/notification/NotificationListenerService)：`snoozeNotification` / `getSnoozedNotifications` 自 API 26；连接后才操作；没有普通公开 unsnooze 方法。
- [StatusBarNotification](https://developer.android.com/reference/android/service/notification/StatusBarNotification)：原包、key、id、group、clearable 等元数据。
- [PendingIntent](https://developer.android.com/reference/android/app/PendingIntent)：创建者身份、equals 与原始点击动作；[后台启动限制](https://developer.android.com/guide/components/activities/background-starts)解释“send 返回而未启动”需要实测。
- [Android 16 分支 NotificationAssistantService](https://android.googlesource.com/platform/frameworks/base/+/99b01a65cc4c104933788b3143285ab6bae65827/core/java/android/service/notification/NotificationAssistantService.java)：类为 `@hide` / `@SystemApi`。
- [Android 16 分支 NotificationManagerService](https://android.googlesource.com/platform/frameworks/base/+/99b01a65cc4c104933788b3143285ab6bae65827/services/core/java/com/android/server/notification/NotificationManagerService.java)：系统 listener 提前 unsnooze 检验 `info.isSystem`。所读 android16-release ref 为 `99b01a65cc4c104933788b3143285ab6bae65827`。这不等于已暂缓 key 的公开 duration snooze 一定不能改期；本次设备观察了相反结果，见 RESULTS。

API 24/25、26、33、36 与其他 OEM/真机尚未设备覆盖。不要把本次 API 35 MuMu 的短 snooze 改期结果推广成平台保证，后续 T12 仍负责产品侧开放式计时、批量结束释放、恢复责任和逐设备能力反馈。
