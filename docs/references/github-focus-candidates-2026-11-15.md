# 新增 GitHub 专注控制候选：源码核验

核验日期：2026-11-15。范围：`docs/focus-control-spec.md` 的完整功能，重点补查通知原身份恢复、强制保护与独立限时控制。本文补充已研究的 Foqos-Android、SelfLock、curbox-android，不替代它们的既有审计。

## 结论

没有找到已经用源码证明完整覆盖 A01—A18 的一个或两个 Android 项目。综合既有 CurBox 审计与本次新增核验，**优先研究 CurBox + DetoxDroid 这两个功能较广的 GPL 项目**：CurBox 提供应用白名单/限时专注/通知暂缓，DetoxDroid 补充防篡改、原状态追踪与恢复。NotiFilter 作为通知暂缓的独立对照，不挤占这两个主要候选。

两项主要候选不是可以默认直接粘贴进现有应用的宽松许可库；组合后仍缺少提前立即释放原通知、当前项目的全局/子待办继承名单、动态壁纸加固和自有图标/最近任务恢复等完整实现。本次新增候选的深入核验以下文为准；CurBox 的既有边界见[具体接缝审计](../android-blocker-integration-fit.md)与[原研究](../android-focus-control-research.md)。

若项目维持现有技术边界及宽松许可复用方向：继续以已审计的 Foqos MIT 规则代码为基础；CurBox、DetoxDroid 和 NotiFilter 作为功能与技术探针的源码对照。若希望实际复制 GPL 源码，应先明确所采用代码和最终分发许可的兼容方案，本文不代替该判断。

## 核验方法与时间边界

- 已读取当前规格和 RTK 指令；实际克隆以下五个公开仓库，读取实现文件、构建配置、许可证和测试目录。
- 查询 GitHub API 的仓库、默认分支提交和最新 release，按下表固定 commit；这些日期均不晚于 2026-11-15。
- 已调用在线 `web.run` 检索及打开 GitHub 页面；该工具本次返回空结果。具体证据来自直接读取 GitHub API 与克隆的 GitHub 源码，未以搜索摘要当实现证据。
- 未编译、未安装、未运行设备测试。测试文件存在不等于测试已经通过；星数也不等于稳定性保证。
- 所有源码链接固定到所审计 commit，避免默认分支变动后无法复核。

## 候选与维护快照

| 项目 | 固定提交及 UTC 日期 | 最新 release / 发布日 | 维护与构建观察 | 复用定位 |
| --- | --- | --- | --- | --- |
| [flxapps/DetoxDroid](https://github.com/flxapps/DetoxDroid) | `f14d2352c1b66a05508253be40dfa478b794d0d4`，2026-10-27 | `v3.0.1`，2026-10-22 | 未归档；561 stars；min26/target36；多项规则/恢复测试 | GPL-3.0；强制保护与恢复参考首选 |
| [BURG3R5/NotiFilter](https://github.com/BURG3R5/NotiFilter) | `c421ca449c9e5258a7c8c6484e0696164e3fa8f7`，2026-11-14 | `v4.15.1`，2026-10-09 | 未归档；254 stars；默认分支 dev；min29/target36；过滤规则测试 | GPL-3.0；通知暂缓参考首选 |
| [ChristopherLaughlin/warden](https://github.com/ChristopherLaughlin/warden) | `ad62876035ae4f16b303e429d936949359c55f6a`，2026-07-12 | 无 release | 未归档；7 stars；min26/target34；创建与最后提交同为 2026-07-12 | GPL-3.0；较新原型，不作为稳健底座 |
| [blokapp-web/blok](https://github.com/blokapp-web/blok) | `c249ac3290c3fbd6cf81142f7e0b951621484fe8`，2026-06-12 | `v1.0.2`，2026-06-12 | 未归档；3 stars；min26/target35；pushed_at 为 2026-08-28，不能把它误当主分支代码日期 | GPL-3.0；NFC 应用锁参考，通知恢复不符 |
| [akaMrNagar/Mindful](https://github.com/akaMrNagar/Mindful) | `b6eb68d500463c54e1127b6cc7ad540f02ae0c8e`，2025-08-27 | `v1.3.5+145`，2025-08-16 | 未归档；861 stars；Flutter + Kotlin；本次 API 快照显示默认分支一年多未更新 | GPL-2.0；通知汇总参考，原通知恢复不符 |

API 核验入口：各仓库的 `https://api.github.com/repos/{owner}/{repo}`、`/commits/{default_branch}`、`/releases?per_page=1`。星数是本次查询快照。

## 1. DetoxDroid：强制保护与恢复最有价值

源码基准：[固定提交](https://github.com/flxapps/DetoxDroid/commit/f14d2352c1b66a05508253be40dfa478b794d0d4)、[构建参数](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/build.gradle.kts)、[许可证](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/LICENSE)。

### 已有源码证据

1. **精确防关闭/防撤权入口识别**：[CommitmentPasswordTamperGuard.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/system_integration/CommitmentPasswordTamperGuard.kt#L48)。只在承诺密码启用且未解锁时检查；限定 Settings/安装器包名，通过本应用名称、包名、服务名称及窗口类名识别本应用 app-info、无障碍开关、管理员和卸载场景，调用 `GLOBAL_ACTION_HOME` 后显示警告。节点遍历有 500 个上限、1500ms 防重入。比“只要进入设置就全部屏蔽”更贴近 FORCE-05，但机型包名及窗口结构仍需实测。
2. **明确区分普通管理员与 Device Owner**：[DetoxDroidDeviceAdminReceiver.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/system_integration/DetoxDroidDeviceAdminReceiver.kt#L13)。`isGranted()` 实际检查 `isDeviceOwnerApp()`；`setUninstallBlocked()` 先检查该身份才调用 DPM。不能把普通 ACTION_ADD_DEVICE_ADMIN 同意等同于获得此功能。该代码可作为规格“按真实身份报告能力”的参考。
3. **限时加强模式与进程恢复**：[EmergencyBrakeFeature.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/features/EmergencyBrakeFeature.kt#L55) 有持久截止、原生结束处理、重建恢复和活动状态排除备份；[TrustedClock.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/util/TrustedClock.kt) 用 elapsedRealtime 与引导次数减少手动改时跳过限制的机会。
4. **操作前记账、失败保留恢复责任**：[AppSuspender.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/system_integration/AppSuspender.kt)。通过 Shizuku 执行 `pm suspend` / `pm unsuspend`；先持久记录再执行，失败不丢记录，未获得 Shizuku 时保留待恢复。适合参考增强恢复日志。此模块会改其他包的系统挂起状态，本次只读研究，未执行。
5. **不同执行后端**：[DisableAppsFeature.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/features/DisableAppsFeature.kt#L41) 区分普通 overlay BLOCK、Device Owner DEACTIVATE 和 Shizuku SUSPEND；暂停/规则改变时撤销自有挂起与隐藏，电话/锁屏有保护分支。
6. **测试资产**：[EmergencyBrakeTest.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/test/java/com/flx_apps/digitaldetox/EmergencyBrakeTest.kt)、[TrustedClockTest.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/test/java/com/flx_apps/digitaldetox/TrustedClockTest.kt)、[ConfigBackupTest.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/test/java/com/flx_apps/digitaldetox/ConfigBackupTest.kt)。本次未执行。

### 与本规格不能直接对齐的部分

- Emergency Brake 明确提供手动启动后 30 秒撤销，以及等待 10 分钟后的提前结束。它不是 A04 的“严格倒计时原生拒绝提前结束”，必须修改产品规则，不能原样拿来宣称严格锁机。
- Brake 从当前启用功能与规则计算效果，不等于当前项目“子待办/全局继承/独立空白名单/每轮不可变快照”；名单结构要按现有 SQLite 会话另做。
- [SupportsAppExceptionsFeature.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/feature_types/SupportsAppExceptionsFeature.kt) 有 allowlist/blocklist 语义，但其注释明确 Disable Apps 仅支持 ONLY_LIST。不能据此声称已实现本项目“只允许白名单中的应用”。
- [ForceStopRecovery.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/system_integration/ForceStopRecovery.kt#L46) 只在下次进程启动时判断，且需 WRITE_SECURE_SETTINGS 才尝试重新开启无障碍。它不是强停后服务仍运行或立即自启的证据。
- 本次全库检索未找到通知 Listener/snooze/unsnooze 的实现。README 的“fewer notifications”主要是勿扰或额外后端限制应用，不能等同 A06 的独立通知暂存/原身份恢复。
- 未发现满足 FORCE-01 的完整桌面/Recents 限制、FORCE-02 自身任务卡隐藏与恢复、FORCE-04 动态壁纸保活/原壁纸恢复、FORCE-06 自身 launcher alias 隐藏与恢复。其他包 DEACTIVATE 后隐藏图标不是隐藏本应用图标。
- min26 高于当前 min24；复制整个应用还引入 Compose/DataStore/规则体系，与保留 Java/SQLite 的边界不符。

## 2. NotiFilter：真正使用系统暂缓，但没有提前释放方案

源码基准：[固定提交](https://github.com/BURG3R5/NotiFilter/commit/c421ca449c9e5258a7c8c6484e0696164e3fa8f7)、[构建参数](https://github.com/BURG3R5/NotiFilter/blob/c421ca449c9e5258a7c8c6484e0696164e3fa8f7/app/build.gradle.kts)、[许可证](https://github.com/BURG3R5/NotiFilter/blob/c421ca449c9e5258a7c8c6484e0696164e3fa8f7/LICENSE)。

### 已有源码证据

- [NotificationListener.kt BATCH/DELAY](https://github.com/BURG3R5/NotiFilter/blob/c421ca449c9e5258a7c8c6484e0696164e3fa8f7/app/src/main/java/co/adityarajput/notifilter/services/NotificationListener.kt#L251)：BATCH 计算下个批次边界；DELAY 可设固定分钟或当前日程结束时刻；两者使用原 `sbn.key` 调用系统 `snoozeNotification(key, duration)`。这与“cancel 后自己发一条类似消息”有实质区别，适合 M0 正常定时到期的探针。
- 重新出现后的过滤用历史内容/时间差匹配避免无限重复暂缓；BATCH 分支还保留匹配逻辑 TODO。该实现不是按原 key 建立完整状态机，更新、撤回与重复键仍需专门验证。
- [ScheduleTest.kt](https://github.com/BURG3R5/NotiFilter/blob/c421ca449c9e5258a7c8c6484e0696164e3fa8f7/app/src/test/java/co/adityarajput/notifilter/data/models/ScheduleTest.kt)、[FilterTest.kt](https://github.com/BURG3R5/NotiFilter/blob/c421ca449c9e5258a7c8c6484e0696164e3fa8f7/app/src/test/java/co/adityarajput/notifilter/data/models/FilterTest.kt) 等规则测试存在，但不是原通知真实恢复的设备证据。

### 明确缺口

- 全库未找到 unsnooze、snoozedNotifications 查询或提前释放路径。用户提前结束、自由正计时不知结束时刻、服务断连和权限撤销后立即恢复均未由此项目解决。关闭过滤器也不会修改已经交给系统的暂缓期限。
- [strings.xml](https://github.com/BURG3R5/NotiFilter/blob/c421ca449c9e5258a7c8c6484e0696164e3fa8f7/app/src/main/res/values/strings.xml#L163) 的“until the filter becomes inactive”描述应结合实现理解：代码计算当时的计划结束时间；没有在手动停用时主动解除暂缓。不能只引用文案声称支持任意提前释放。
- `onListenerDisconnected()` 仅置空实例并记录；没有释放全部暂缓通知的代码。
- 日志记录原通知 extras，并由 `registerHit` 保存通知历史。本规格优先不保留正文、正文不入日志，因此不能原样移入，需要缩减模型、关闭正文历史并去除敏感日志。
- 项目还存在 REPLACE 动作（cancel 后用 NotiFilter 身份重发）和 DISMISS 动作；这些不能混入本规格“原通知恢复”的实现证明。
- min29/target36，不证明 min24—28 兼容。无 app-block/严格计时/防退出等执行功能。

## 3. 排除“通知拦截即暂存恢复”的其他候选

| 项目 | 实际代码 | 对本规格的结论 |
| --- | --- | --- |
| Warden | [WardenNotificationListener.kt](https://github.com/ChristopherLaughlin/warden/blob/ad62876035ae4f16b303e429d936949359c55f6a/app/src/main/java/com/warden/blocker/system/WardenNotificationListener.kt#L18) 在 blocking active、设置开启且该 app 被启用时直接 `cancelNotification(key)` | 永久移除路径；无暂存/恢复。不能承担 A06 |
| BLOK | [BlokNotificationListenerService.kt](https://github.com/blokapp-web/blok/blob/c249ac3290c3fbd6cf81142f7e0b951621484fe8/app/src/main/java/com/appblocker/service/BlokNotificationListenerService.kt#L54) 对新增与已有通知直接 cancel；状态与名单用 Flow 更新 | 无恢复缓存、系统 snooze 或提前释放；不能承担 A06 |
| Mindful | [MindfulNotificationListenerService.kt](https://github.com/akaMrNagar/Mindful/blob/b6eb68d500463c54e1127b6cc7ad540f02ae0c8e/android/app/src/main/java/com/mindful/android/services/notification/MindfulNotificationListenerService.kt#L74) cancel 后存标题/内容与 PendingIntent；[NotificationBatchReceiver.kt](https://github.com/akaMrNagar/Mindful/blob/b6eb68d500463c54e1127b6cc7ad540f02ae0c8e/android/app/src/main/java/com/mindful/android/receivers/alarm/NotificationBatchReceiver.kt) 使用 Mindful channel、图标和 NotificationManager.notify 重发摘要/消息样式通知 | 能做通知收件箱/汇总，但不是原应用身份恢复；与 A06 及正文存储默认不符 |

Warden 的 [WardenViewModel.cancelFocus()](https://github.com/ChristopherLaughlin/warden/blob/ad62876035ae4f16b303e429d936949359c55f6a/app/src/main/java/com/warden/blocker/ui/WardenViewModel.kt#L64) 确有 Kotlin 层 strict + endAt 拒绝取消检查；不过其他 setter 仍可直接修改名单/主开关，且 [CriticalApps.kt](https://github.com/ChristopherLaughlin/warden/blob/ad62876035ae4f16b303e429d936949359c55f6a/app/src/main/java/com/warden/blocker/util/CriticalApps.kt) 永久豁免 launcher/settings/SystemUI，不能作为 FORCE-01/05 实现。仓库较新且无发布版本，不比已有底座更适合整体采用。

## 与规格逐模块的实际收益

| 规格模块 | 最有用的新证据 | 仍需自己完成/验证 |
| --- | --- | --- |
| A03/A05 全局与独立白名单 | DetoxDroid 名单类型与过滤界面 | 子待办继承/覆盖、独立空名单、SQLite 迁移、确认编辑与会话快照 |
| A04/A15 严格与独立锁机 | DetoxDroid 原生限时状态/TrustedClock；Warden native cancel guard | 严格拒绝所有提前结束入口、与原计时单一所有者、锁机主界面路由 |
| A06 原通知暂存与释放 | NotiFilter 的系统 snooze | 提前立即释放、无截止计时、权限撤销/断连恢复、更新/撤回/工作资料/API矩阵 |
| A08 桌面/多任务限制 | 本次无完整匹配 | 单独技术探针和紧急例外 |
| A09/A13 自有任务卡与图标 | 本次无完整匹配 | 可恢复的 task flag/launcher 入口策略 |
| A11 壁纸加固 | 本次无匹配 | 动态壁纸权限、实际增益、原壁纸恢复 |
| A12 防关闭/撤权/卸载 | DetoxDroid TamperGuard、DO gated uninstall block、恢复日志 | 原生 Java 适配、按会话启停、中文/OEM 定位、故障解除、普通/高权限分别报告 |
| A16 临时放行 | 本次未找到精确 1/3/5 分钟、三次、单目标完整匹配 | 继续沿用现有规格及已审计规则，持久化、失败不扣与严格拒绝 |
| A17/A18 恢复与旧业务 | DetoxDroid 操作前记账、活动态排除备份、测试资产 | 现有 SQLite/备份兼容、重启中断而非自动继续强锁、原五分钟休息回归 |

## 建议的复用顺序

1. 保留现有业务计时和 SQLite；针对 Foqos 的已选 MIT 规则层继续评估，不引入第二套 Session/Room。
2. 将 NotiFilter BATCH/DELAY 写成独立通知探针，以真实原通知测试正常到期、提前结束、通知更新/撤回和断连；如果普通身份无法提前释放，明确返回这一缺口，不把 cancel/repost 当验收替代。
3. 将 DetoxDroid TamperGuard、TrustedClock、AppSuspender 恢复日志列为设计参考。只有明确需要且获用户选择的额外身份才进入高权限后端；本次没有执行任何授权、挂起或设备策略操作。
4. 若最终选择直接复制上述 GPL 代码，先记录准确文件、版权与许可条件；若维持宽松许可方向，用 Android 官方 API 文档与当前项目需求独立实现，避免默认复制这些 GPL 应用。

这份核验只改变候选排序及证据清单，没有修改规格范围或宣称任何新增保护已经实现。
