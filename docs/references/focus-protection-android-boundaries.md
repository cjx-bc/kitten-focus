# Android 专注保护能力与边界

核查日期：2026-11-15。用途：12 图功能开发规格的技术依据；本文件没有实现功能，也没有宣称任何设备测试通过。目标环境由主规格约定为 Android Java、minSdk 24、targetSdk 36、Capacitor 8。以下“可行”仅指平台具备相应接口，仍须原生插件和设备验证。

## 共同实施约束

这是用户在自己的设备上主动选择的本地自控功能。保护类开关默认关闭、逐项解释并授权，启用时展示范围、截止时间、系统限制与恢复入口；不得擅自扩大到其他用户或设备。会话结束、授权撤销和异常恢复都要处理清理；运行中编辑偏好开关遵守主规格的本轮快照规则，不能绕过已确认严格计时约束。需保留紧急恢复，具体入口、默认通知策略及提前结束交互由主规格与用户确认。

“定时自动恢复”是必须验证的产品要求，不能写成所有系统状态下的无条件承诺：进程死亡、设备重启、系统强停与授权撤销可能妨碍应用代码执行，尤其不能依赖一个应用内定时器自行解锁。凡不能证明有独立恢复路径的限制，不得上线。Android 15 明确要求 stopped 包通过用户直接或间接交互退出停止状态，并取消该包全部 PendingIntent；这意味着用闹钟/PendingIntent 作为强停后的唯一自救路径不成立。[S8]

## 能力核查

| 功能 | 官方事实与边界 | 规格和实施约束 |
| --- | --- | --- |
| 通知暂存与到期释放 | `NotificationListenerService.snoozeNotification(key, durationMs)`、`getSnoozedNotifications()` 均为 API 26；前者由系统暂时移除通知并在到期重新投递，后者仅查询，不具有释放能力。应等 `onListenerConnected()` 后操作。[S1] | API 24–25 没有这条公开暂存路线，必须显示不支持或提供明确不同语义的可选降级，不能承诺全版本“结束后恢复原通知”。系统对通知撤回、更新、分组、服务持续通知的处理仍须验证。官方接口说明以用户从 listener 界面主动 snooze 单条通知为使用场景，批量自动专注策略必须另作适用性验证。[S1] |
| 提前结束并立即释放通知 | 普通公开 NLS 没有通用 `unsnoozeNotification`。AOSP 当前 `NotificationAssistantService` 整个类标为 `@hide`、`@SystemApi`，其同名方法面向 assistant 的上下文暂存。服务端另有 `unsnoozeNotificationFromSystemListener`，明确检验 `info.isSystem`，否则抛出 `SecurityException("Not allowed to unsnooze before deadline")`。[S2][S3] | 禁止把隐藏 API、反射或普通通知监听授权等同系统/assistant 权限。若会话预定结束时间 T 已知，可验证每条新通知暂存至 T；用户提前结束、延长/缩短会话、切换时区等情形不能直接保证立即释放。短周期重新 snooze 是否可行及是否造成短暂曝光/提醒，必须探针验证；未验证前该方案只记候选。产品需要在“按原截止时间系统释放”和其他方案之间明确选择，不得用复制通知冒充原应用通知。 |
| 取消通知 | `cancelNotification(key)` 的语义是 dismissal，系统实际移除通知，随后回调 removed；不是可逆暂存。[S4] | 不得以 cancel 实现“原通知稍后恢复”。应用自行发送的摘要必须明确来自本应用，不能伪造包身份、渠道或宣称已还原原应用通知。 |
| 隐藏最近任务 | 正确公开方法为 `ActivityManager.AppTask.setExcludeFromRecents(boolean)`，API 21；修改该 task 根 Intent 的 `FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS`。Manifest 对应属性为根 Activity 的 `android:excludeFromRecents`。`Activity` 公共参考页中没有名为 `setExcludeFromRecents` 的方法。[S5][S6] | 仅控制最近任务可见性，不能推导成保活、禁止结束进程或防系统设置强停。关闭会话后要清除本次设置。任务隐藏后仍应有可达的恢复页面。 |
| 无障碍返回桌面、限制桌面/最近任务 | `GLOBAL_ACTION_HOME` 是 API 16 的“返回 Home”动作；`performGlobalAction()` 返回成功与否，动作存在不代表当前可用。它是执行导航，并非系统级禁用 Home/Recents。[S7] | 前台检测后返回桌面属于尽力而为干预，需逐系统/OEM 验证竞态、手势导航、分屏与服务被停用。不得承诺禁止访问系统设置或抢断紧急恢复。 |
| DPC LockTask | 专用设备 LockTask 由 DPC allowlist 控制，通常可限制 Home、非允许应用与通知；screen pinning 可由用户自行退出，不能混写为同级能力。官方按 fully managed、secondary user 等管理模式列出版本限制。[S9] | 若选择此路线，作为明确的设备管理部署模式设计与测试，不能写成普通应用开启无障碍后即可获得。必须先验证退出 LockTask、撤回白名单及紧急恢复；不得借此免除退出设计。 |
| 动态壁纸“保护” | `WallpaperService` 为显示动态壁纸生成 `Engine`，须声明 `BIND_WALLPAPER`；文档没有赋予拒绝强停的权限。[S10] Android 15 把“用户选择应用作为动态壁纸”列为间接用户交互、可解除 stopped 状态的例子，不是壁纸自动解除强停的保证。[S8] | 可以记录为可选壁纸体验/待验证生存性辅助，不得命名为保证防强停。区分任务划走、低内存杀进程、系统设置强停、系统电池限制四种状态。 |
| 隐藏桌面图标 | `activity-alias` 可自行持有 `MAIN` / `LAUNCHER` filter；alias 的 `enabled` 决定能否被系统实例化。组件开关由 `PackageManager.setComponentEnabledSetting` 修改；`DONT_KILL_APP` 只表示不要因组件修改杀应用，并不保护应用免于强停。[S11][S12] | 仅切换 launcher alias，保留实际 Activity 和经过验证的显式恢复入口。启用前需先验证入口可达，结束时重新启用 alias；考虑 launcher 缓存、重启和更新。隐藏图标不改变包安装状态或获得卸载阻止权限，不能写成禁止卸载。[S11][S13] |
| 阻止卸载 | `DevicePolicyManager.setUninstallBlocked` API 21。允许 device owner、profile owner、获 `DELEGATION_BLOCK_UNINSTALL` scope 的 delegate，或持有 `MANAGE_DEVICE_POLICY_APPS_CONTROL` 的主体调用；最后一项为 API 34 的 `internal|role` 权限，面向设备策略管理角色，并非普通运行时授权。[S13][S14] | 普通安装、无障碍授权、激活传统 device admin 均不能直接视为已获得 device owner。真实 owner/profile/delegation 配置须检测与展示，不满足时标记不支持。Owner provisioning 涉及设备初始化流程；API 31 起旧 `ACTION_PROVISION_MANAGED_DEVICE` 启动路线已弃用，不能把一条旧命令当成所有现有手机的开关。[S13] 撤回策略需 `setUninstallBlocked(..., false)` 并验证结果；作用用户/工作资料范围不能泛化为整机。 |

## 实施前技术探针（全部待执行）

| 探针 | 最小实验与通过标准 |
| --- | --- |
| P1 通知 API 24/25/26/33/35/36 | 独立测试通知发送端 + 本项目 NLS 原型；记录 key、原包名、时间、removed reason、posted、snoozed 查询结果。24–25 验证能力门禁；26+ 验证固定 T 到期重新出现，保留原包身份与 PendingIntent。覆盖分组、持续通知、发送端更新/撤回、手机重启、listener 断连与重新授权。无完整日志不得宣称“无损恢复”。 |
| P2 提前退出 | 会话 T 前退出，确认普通应用无公开立即 unsnooze 路线；如试验短周期暂存，量化最大释放等待、重复响铃、闪现和循环重入，并将实测结果带回产品决策。不得用反射绕过系统身份检验。 |
| P3 强停与恢复 | 在 AOSP 模拟器与至少一种目标 OEM 真机，分别任务划走、`am kill`、用户系统设置强停、重启；检查定时状态、FGS、PendingIntent、壁纸、图标与恢复入口。重点验证 Android 15/16 stopped 行为；预期系统强停可使应用停止，不能将其记录为缺陷绕过。 |
| P4 桌面/最近任务 | `getAppTasks()` 切换 exclude 并验证恢复；无障碍原型记录 Home/Recents 动作返回值与实际 UI，在手势导航、分屏、锁屏、权限撤销下验证。紧急退出页始终属于允许路径，不允许被保护逻辑再拦截。 |
| P5 图标隐藏 | 单独 launcher alias 切换；在隐藏前后、进程死亡、重启、升级、授权撤销后打开恢复 Activity 并重新显示图标。不能证明强停后恢复入口仍可达时不得启用该能力。 |
| P6 管理模式 | 仅在可重置的自有测试设备/模拟器验证 DO、PO、delegate 与普通模式；分别调用 uninstall block true/false 并查询实际状态，记录 SecurityException 和 Android 14+ policy result。单独验证 lock task allowlist/退出；不得在真实日用设备试验性配置 owner 或重置设备。 |

## 官方来源

- S1 — NLS public API：<https://developer.android.com/reference/android/service/notification/NotificationListenerService>（`snoozeNotification`、`getSnoozedNotifications`）。
- S2 — AOSP NotificationAssistantService：<https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/service/notification/NotificationAssistantService.java>（class 的 `@hide` / `@SystemApi`；`unsnoozeNotification`）。
- S3 — AOSP NotificationManagerService：<https://android.googlesource.com/platform/frameworks/base/+/android16-release/services/core/java/com/android/server/notification/NotificationManagerService.java>（`unsnoozeNotificationFromAssistant`、`unsnoozeNotificationFromSystemListener`）。
- S4 — AOSP NLS：<https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/service/notification/NotificationListenerService.java>（`cancelNotification`、duration snooze）。
- S5 — AppTask：<https://developer.android.com/reference/android/app/ActivityManager.AppTask#setExcludeFromRecents(boolean)>。
- S6 — Activity manifest / public API：<https://developer.android.com/guide/topics/manifest/activity-element#exclude>；<https://developer.android.com/reference/android/app/Activity>。
- S7 — AccessibilityService：<https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#GLOBAL_ACTION_HOME>；<https://developer.android.com/reference/android/accessibilityservice/AccessibilityService#performGlobalAction(int)>。
- S8 — Android 15 stopped state：<https://developer.android.com/about/versions/15/behavior-changes-all#enhanced-stop-states>。
- S9 — LockTask 官方指南：<https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode>。
- S10 — WallpaperService：<https://developer.android.com/reference/android/service/wallpaper/WallpaperService>。
- S11 — activity-alias：<https://developer.android.com/guide/topics/manifest/activity-alias-element>。
- S12 — PackageManager：<https://developer.android.com/reference/android/content/pm/PackageManager#setComponentEnabledSetting(android.content.ComponentName,int,int)>；`DONT_KILL_APP`。
- S13 — DevicePolicyManager：<https://developer.android.com/reference/android/app/admin/DevicePolicyManager#setUninstallBlocked(android.content.ComponentName,java.lang.String,boolean)>；同页 provisioning 与 delegation 文档。
- S14 — 策略权限：<https://developer.android.com/reference/android/Manifest.permission#MANAGE_DEVICE_POLICY_APPS_CONTROL>。

以上 AOSP 链接分别使用 Android16 分支或 main；main 后续可能变化，实施时应记录实际查看的提交与设备版本。源码核查解释平台边界，不能代替 minSdk 24 至 target 36 的版本设备验证。
