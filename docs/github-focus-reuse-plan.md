# 完整专注保护功能：GitHub 源码复用选择与整合清单

核验日期：2026-11-15。需求依据：[学霸模式与锁机完整规格](focus-control-spec.md)。界面约束：用户已明确要求保留原有设计风格，所有候选只评估底层模块，不替换现有 Vue 界面、五栏导航、Java 计时、SQLite 和五分钟休息规则。

## 结论

优先进一步适配 **Curbox + DetoxDroid**：前者承担应用限制、白名单、限时专注及系统通知暂缓的主要源码来源，后者承担精确防篡改、额外权限后端区分与恢复日志的源码来源。它们是本轮已审候选中值得拆分复用的组合，**不是已经满足完整规格的两个现成 SDK**。

截至本轮核验，没有找到能以一个或两个仓库、少量修改就证明覆盖 A01—A18 的组合。提前结束后立即释放全部原通知、壁纸加固与原状态恢复，以及六项增强的完整按会话启停/撤销仍有缺口。不能把通知 cancel/repost 当作原通知恢复，也不能把项目 README 的防卸载描述当作普通安装可获得系统策略能力。

本轮已完成线上仓库筛选、固定提交源码阅读、现有架构接缝核对与移植清单。没有复制候选业务代码进正式工程，没有构建候选 APK 或执行设备设置。既有 ADR 的 Foqos 方案仍为 proposed；本文为更完整范围的新选择依据，不静默把架构决定标为已采纳。

## 1. 主候选与本次固定版本

| 项目 | 核验版本 | 维护快照 | 定位 |
| --- | --- | --- | --- |
| [Curbox](https://github.com/curbox-app/curbox-android) | [`09958035ab6f444b4d9ceae0627dad37221425ad`](https://github.com/curbox-app/curbox-android/commit/09958035ab6f444b4d9ceae0627dad37221425ad)，提交 2026-11-15；release `7` 同日发布 | GitHub API 查询未归档、1535 stars；[构建](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/app/build.gradle.kts) min26 / target36；存在规则、备份兼容和 Android 会话测试文件 | 主要控制模块候选 |
| [DetoxDroid](https://github.com/flxapps/DetoxDroid) | [`f14d2352c1b66a05508253be40dfa478b794d0d4`](https://github.com/flxapps/DetoxDroid/commit/f14d2352c1b66a05508253be40dfa478b794d0d4)，提交 2026-10-27；release `v3.0.1` 于 2026-10-22 发布 | GitHub API 查询未归档、561 stars；[构建](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/build.gradle.kts) min26 / target36；存在限时、时钟和备份测试文件 | 防篡改与恢复模块候选 |

维护日期、星数只记录查询快照。测试文件存在不等于本次已运行或已通过，更不等于所有 OEM 兼容。小猫 min24，两个候选 min26，不能整体搬入后宣称保持 Android 7+ 全部能力。

两个项目均为 GPL-3.0，详见 [Curbox LICENSE](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/LICENSE) 与 [DetoxDroid LICENSE](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/LICENSE)。直接复制、修改并分发需要处理对应 GPL 条件，包括整合作品的适用许可与对应源码提供，不能只加一条署名就视为完成。当前没有发现用户已经选择整合后产品的分发许可，因此本次先形成准确的文件级清单，不替用户发布或改写项目许可。

## 2. Curbox 可用的具体模块

以下路径均相对于 `app/src/main/java/neth/iecal/curbox/`。

| 模块 | 真实源码 | 已核对的行为 | 适配重点 |
| --- | --- | --- | --- |
| 应用白名单限制 | [blockers/FocusModeBlocker.kt](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/app/src/main/java/neth/iecal/curbox/blockers/FocusModeBlocker.kt) | 明确区分 BLOCK_SELECTED 与 BLOCK_ALL_EXCEPT_SELECTED；处理前台事件、目标时刻与控制解除 | 输入改为小猫本轮只读快照；执行改为小猫原生阻挡页；电话/输入法/必要系统例外单独核对 |
| 可复用配置、严格结束 | [data/models/ManualFocusGroup.kt](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/app/src/main/java/neth/iecal/curbox/data/models/ManualFocusGroup.kt)、[api/ApiRestrictionPolicy.kt](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/app/src/main/java/neth/iecal/curbox/api/ApiRestrictionPolicy.kt)、[api/CurboxApiCommands.kt](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/app/src/main/java/neth/iecal/curbox/api/CurboxApiCommands.kt) | 配置含 packages、blockMode、exitable；start/stop 都检查 canReplaceFocus，未到期且不可退出的当前配置不能被 API 替换或停止 | 本项目严格约束放到 FocusEngine 原生入口；正计时不套严格规则；外部 API 受保护不代表原样复制后小猫所有入口也已受保护 |
| 服务与执行生命周期 | [services/AppBlockerService.kt](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/app/src/main/java/neth/iecal/curbox/services/AppBlockerService.kt) | 无障碍事件调度、模块 setup/onDestroy、DND 协调 | 不引入完整 blocker 集合和其他网站/短视频功能；保留小猫自己的服务状态与会话所有权 |
| 原通知系统暂缓 | [services/ScheduledNotificationsService.kt](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/app/src/main/java/neth/iecal/curbox/services/ScheduledNotificationsService.kt) | 使用原 sbn.key 调用 snoozeNotification 至下一投递时刻；豁免允许应用、持续/不可清除通知、来电、闹钟及全屏提醒；有释放窗口防止到期再次拦截 | 改为本轮名单与目标时刻；建立会话归属及 key 去重；当前无任意提前结束立即释放接口，不能声称 A06 完成 |
| 防撤权/卸载入口 | [blockers/AntiUninstallBlocker.kt](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/app/src/main/java/neth/iecal/curbox/blockers/AntiUninstallBlocker.kt) | 检查管理员和无障碍相关设置入口并返回；有窗口扫描节流 | 与 DetoxDroid Guard 对比后选一套，避免双重回跳；需修复空 root 风险、英文标签假设及系统版本差异 |

具体审阅观察：AntiUninstallBlocker 在稍后 `root ?: return` 之前已使用 `rootInActiveWindow.findAccessibilityNodeInfosByText`；移植前需补空窗口处理。其 ServiceProtectionManager 中“device owner survives force stop”的注释不能当系统事实，不按该注释承诺强停免疫，也不自动执行设置 owner 的命令。

Curbox 已有通知暂缓代码，因此没有为了凑第二个仓库再把整套 NotiFilter 引入。多一个通知 Listener 也不会自动补出提前释放能力。

## 3. DetoxDroid 可用的具体模块

以下路径均相对于 `app/src/main/java/com/flx_apps/digitaldetox/`。

| 模块 | 真实源码 | 已核对的行为 | 适配重点 |
| --- | --- | --- | --- |
| 精确防篡改 | [system_integration/CommitmentPasswordTamperGuard.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/system_integration/CommitmentPasswordTamperGuard.kt) | 限定设置/安装器范围，通过本应用标识、窗口与节点检测撤权、app-info、管理员和卸载场景；500 节点上限与防重入 | 改为本轮 FORCE-05，保留必要授权与恢复窗口；不要带入密码产品流程；中文与 OEM 仍需验证 |
| 设备身份门禁 | [system_integration/DetoxDroidDeviceAdminReceiver.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/system_integration/DetoxDroidDeviceAdminReceiver.kt) | 普通管理员和 isDeviceOwnerApp 分开检测；仅满足 owner 条件后才调用 setUninstallBlocked | 返回可用/需授权/受限及原因；普通无障碍和管理员不能伪装成 owner；撤销需确认真实结果 |
| 系统变更恢复日志 | [system_integration/AppSuspender.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/system_integration/AppSuspender.kt) | 先记账再执行；失败保留恢复责任；挂起/解除挂起有状态跟踪 | 复用该结构到小猫自己的图标/任务/壁纸恢复日志；额外挂起后端不是普通模式默认功能 |
| 时钟与活动状态 | [util/TrustedClock.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/util/TrustedClock.kt)、[features/EmergencyBrakeFeature.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/features/EmergencyBrakeFeature.kt) | 截止与重建恢复、单调时钟、活动状态排除备份 | 小猫已有 elapsedRealtime + bootId，不替换第二套时钟。该 Brake 有 30 秒撤销和 10 分钟等待后提前结束，不能原样当严格锁机 |
| 意外结束后的诊断 | [system_integration/ForceStopRecovery.kt](https://github.com/flxapps/DetoxDroid/blob/f14d2352c1b66a05508253be40dfa478b794d0d4/app/src/main/java/com/flx_apps/digitaldetox/system_integration/ForceStopRecovery.kt) | 下次进程启动后检查上次服务记录；有额外 WRITE_SECURE_SETTINGS 时尝试重启无障碍 | 按小猫授权和用户关闭意愿适配，不能把它解释为强停后立即自动恢复或永远关闭不了 |

测试资产包括 EmergencyBrakeTest、TrustedClockTest、ConfigBackupTest；本次读取并确认存在，没有运行结果。相关细节及更多固定文件链接见[候选证据报告](references/github-focus-candidates-2026-11-15.md)。

## 4. 与完整规格逐项对照

“有源码可改”表示候选里存在可定位的实现，不表示已移入小猫或通过设备验收。

| 规格要求 | 当前候选能提供 | 仍需在小猫实现或验证 |
| --- | --- | --- |
| A01 三开关与设置面板 | 仅底层能力素材 | 沿用现有 Vue/Sheet 完成配置与真实状态展示 |
| A02 按需授权与返回检查 | 两项目有引导/检测材料 | 小猫桥接、短暂确认、拒绝与返回复查 |
| A03 应用列表与筛选 | 包名/名单基础 | 系统 App 筛选、草稿确认、固定小猫、未安装标记 |
| A04 学霸与严格独立 | Curbox allowlist + exitable gate | 小猫原生所有入口统一拒绝；正计时豁免；普通暂停继续限制 |
| A05 全局/独立名单 | Curbox 每配置 packages | 子待办继承、独立空名单、恢复跟随、本轮固定 |
| A06 通知暂存/释放 | Curbox 系统 snooze、必要通知例外 | 任意提前释放、无固定结束时间、撤回/更新/重复、断连与 API24—25 边界 |
| A07 通知帮助 | 行为与边界源码 | 结合真实设备结果写离线说明 |
| A08 FORCE-01 桌面/多任务限制 | 有无障碍执行基础 | 两个候选未找到完整匹配；需单独实现和验证导航/紧急例外 |
| A09 FORCE-02 自身最近任务隐藏 | 无完整按会话实现 | 原生 task flag 记录与恢复；不能只写 Manifest 永久隐藏 |
| A10 FORCE-03 锁机禁止主界面 | 无小猫路由实现 | MainActivity + Vue 路由统一保护，帮助/授权/恢复仍可达 |
| A11 FORCE-04 壁纸加固 | 本轮未找到完整源码闭环 | 单独验证服务增益、授权、原壁纸记录与恢复 |
| A12 FORCE-05 防关闭 | Curbox/DetoxDroid 精确场景检测；后者身份门禁更清楚 | 只选一套执行，按会话启停、OEM/语言测试、故障出口和撤销 |
| A13 FORCE-06 隐藏自身图标 | 无完整自身 alias 隐藏/恢复 | launcher alias、可达恢复入口、故障/重启/升级恢复 |
| A14 帮助 | 可参考已核验实现 | 不复制其他产品宣传与界面；本地离线内容 |
| A15 独立锁机 | Curbox 限时配置可提供基础 | 共用所有权、专用锁机会话、待定的提前解除/统计交互 |
| A16 临时放行 | 两主候选未证明精确符合 1/3/5 分钟、三次、单目标 | 小猫 SQLite 原子扣次、期限、幂等、严格拒绝；Foqos 有有用参考但不自动增加第三套执行引擎 |
| A17 快照与恢复 | DetoxDroid 恢复日志/活动态排除 | 与小猫重启中断、进程恢复、权限重连及本轮固定策略结合 |
| A18 旧业务回归 | 沿用小猫现有代码 | 待办、两种计时、五分钟休息、日历/统计、更新/备份完整回归 |

## 5. 整合方式

保留现有 `FocusEngine`、`RestEngine`、`LocalStore` 和 `CatFocusPlugin`，不把第三方完整 App 当 library 引入，不把 Curbox 的 Room/DataStore 会话与小猫并行运行。

建议小猫新增下列原生边界：

1. `FocusControlCoordinator`：专注/锁机单一活动所有权、开始检查、本轮有效配置、结束与清理。现有 Java 引擎继续决定专注实际时长。
2. `ControlSnapshot` + `AppBlockPolicy`：只读名单、模式、临时放行与实际能力。无障碍事件只读取，不能每次调用现有 `focusAction("read")`；当前 read 会结算、写状态和更新通知。
3. `FocusAccessibilityService` + `BlockedAppActivity`：按名单执行、必要系统例外、重复事件去抖。拆出 Curbox 相应控制逻辑，原生阻挡界面使用小猫设计。
4. `NotificationHoldService`：从 Curbox 最小暂缓实现适配，只接小猫会话和名单，不引入另一套通知日程；对提前释放结果明确报告。
5. `TamperGuard`：优先拆 DetoxDroid 的有界扫描与明确身份门禁；不要并行运行 Curbox 的同类 guard。
6. `ProtectionRecoveryJournal`：写入原状态后才修改图标/最近任务/壁纸，正常结束、休息、重启中断和备份恢复统一撤销；逐项报告失败。
7. Capacitor 方法：设置/名单读写、应用查询、权限与支持查询、锁机开始/结束、临时放行与恢复。Vue 继续只负责配置和显示。

原生依赖优先做小范围 Java 移植，或隔离少量 Kotlin；不为了复用几个类引入 Compose UI、整套数据库、捐赠/账号/云服务、网站拦截和其他无关功能。

## 6. 必须先做的三个验证

1. **通知**：独立发送测试应用 + Listener，检查正常倒计时、提前结束、正计时、锁机取消、更新/撤回及断连；不能以 cancel 后自行重发通过 A06。
2. **增强与恢复**：逐项检查原状态、成功/失败反馈、用户恢复路径和到期撤销；壁纸、最近任务、自身图标不得只测开关保存。
3. **小猫会话兼容**：普通暂停仍限制、严格拒绝、五分钟休息释放、下一轮获取新配置、进程恢复不重置放行、重启中断不残留。

这些验证决定具体模块可接受程度，不能把两个仓库最近有更新等同于功能已扎实通过。

## 7. 未选作主组合的候选

| 项目 | 核查结论 |
| --- | --- |
| [Foqos-Android](https://github.com/Elias02345/Foqos-Android) | MIT；已有纯规则、临时放行与测试，适合作为宽松许可路线。原 pauseActive 会放开应用，与本规格普通暂停继续限制不同；strictMode 指设置屏蔽而非本项目严格倒计时。没有本轮找到的系统通知 Listener 暂存模块。不能只靠它覆盖完整规格 |
| [NotiFilter](https://github.com/BURG3R5/NotiFilter) | GPL-3.0；确有 BATCH/DELAY 系统 snooze，但没有提前立即释放方案；原通知正文历史与日志还需按本规格削减。Curbox 已提供同类最小路线，暂不把它作为第三个依赖 |
| [Mindful](https://github.com/akaMrNagar/Mindful) | GPL-2.0；专注/跟踪完整，但通知取消后保存正文并以自身身份重发，不符合原通知恢复目标；不与 GPL-3 源码随意混合复制 |
| [shell-ninja/Blocker-App](https://github.com/shell-ninja/Blocker-App) | 固定 `029d3350878abc1ad35215eaf88eca71993864c8`；GPL-3.0，2026-11-12 release v1.0.6.8。虽然有完整 focus/防篡改宣传，通知 Listener 实际 cancel；AccessibilityService 单文件约 382KB，且自身最近任务是在 Activity 启动/暂停时隐藏，没有本轮到期恢复闭环。拆分与验证成本较高，不作为扎实整合首选 |
| [Warden](https://github.com/ChristopherLaughlin/warden)、[BLOK](https://github.com/blokapp-web/blok) | 相关通知分支直接 cancel，没有原通知暂存恢复；其余代码不能填平六项增强缺口 |

若不采用 GPL 源码直接整合，优先保持 Foqos MIT 纯规则 + 自有原生执行与官方 API 的实现路线；不要把“参考开源”与“复制源码”混为一谈。

## 本轮证据与边界

- 通过 GitHub API 核对仓库、commit、release、license、archived；通过固定源码核验行为，而非只读 README。
- 使用 Repomix 打包 Curbox 定向源码 31 文件（317656 字符）及 Blocker-App 37 文件（1020241 字符），另打包 DetoxDroid 控制/恢复/测试相关源码。打包在系统临时目录，不混入小猫产品代码。
- 新增候选的固定文件证据见[详细核验](references/github-focus-candidates-2026-11-15.md)；现有 Java 接缝见[早期接入分析](android-blocker-integration-fit.md)；平台探针依据见[安卓边界核查](references/focus-protection-android-boundaries.md)。
- 本次是源码选择和整合设计证据，未提供构建/设备通过结果，未修改正式 UI、应用许可、设备权限、图标、壁纸或其他应用状态。
