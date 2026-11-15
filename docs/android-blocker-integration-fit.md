# Android 专注控制：可复用源码与小猫接入边界

范围更新：用户随后要求完整覆盖 12 张截图，包括独立锁机、独立白名单、通知拦截/释放和六项增强保护。最新范围见[开发规格](focus-control-spec.md)；本文的 Foqos/权限库结论只覆盖可复用的部分模块，不能当作新增全部功能已有现成实现。

核查日期：2026-11-15。核对的是下述实际克隆提交与本项目 Android 源码；未进行候选模块移植、构建或真机测试，因此“可改造”不等于“已兼容”。

结论：本轮没有发现能作为 SDK 引入、稍改配置便覆盖应用屏蔽、白名单、电话例外、会话恢复、浮窗和权限管理的完整模块。最合适的组合是 **Foqos 的纯规则层源码 + 小猫自己的 FocusEngine/SQLite + 小猫原生无障碍执行层**；权限和浮窗可各选真正的 Android library。安装另一个完整应用与把源码纳入本 APK 是两种方案，不能混称集成。

## 首选：Foqos-Android，只移植少量规则类

仓库：[Elias02345/Foqos-Android](https://github.com/Elias02345/Foqos-Android)。核查提交 `883718b17960e64015c410d7bd3269995525e646`。[LICENSE](https://github.com/Elias02345/Foqos-Android/blob/883718b17960e64015c410d7bd3269995525e646/LICENSE) 为 MIT，注明 Elias Kanakidis 与原 iOS 项目作者版权；复制实质源码时保留版权和许可文本。

| 需要的功能 | 实际源码 | 可复用方式 | 仍需完成 |
| --- | --- | --- | --- |
| 应用黑/白名单 | [AccessibilityBlockPolicy.kt](https://github.com/Elias02345/Foqos-Android/blob/883718b17960e64015c410d7bd3269995525e646/app/src/main/kotlin/com/foqos/android/service/accessibility/AccessibilityBlockPolicy.kt) `decideForApp` | 去掉 `@Singleton`、`@Inject` 及对应 import，保留无 Android 框架依赖的判定逻辑；也可按 MIT 移植为 Java | 从现有会话构建快照，事件服务执行 BlockApp；`allowMode=true` 时 `blockedPackages` 实际表示允许集合，建议在适配层改名避免误读 |
| 暂停、休息、临时通行 | 同上；[BlockingState.kt](https://github.com/Elias02345/Foqos-Android/blob/883718b17960e64015c410d7bd3269995525e646/app/src/main/kotlin/com/foqos/android/service/session/BlockingState.kt) | 复用不可变 DTO 思路，`pauseActive`/`breakActive` 放行；`activeGrants` 按截止时间判定 | 这些字段只描述状态，**不会负责启动/结束或持久化**；由 FocusEngine/RestEngine 映射，临时通行另外落 SQLite 并定义重启语义 |
| 来电/拨号/系统例外 | Policy 的 `DIALER_PACKAGES`、`DEFAULT_NEVER_BLOCK`、`neverBlockWithLauncher` | 复用“先系统例外，再规则”的顺序及兜底集合 | 替换自家包名；动态识别当前桌面、默认拨号器和必要系统交互，覆盖 OEM 来电界面、紧急拨号与权限弹窗真机验证；硬编码电话包名不等于完整来电保障 |
| 执行结果与规则验证 | [BlockDecision.kt](https://github.com/Elias02345/Foqos-Android/blob/883718b17960e64015c410d7bd3269995525e646/app/src/main/kotlin/com/foqos/android/service/accessibility/BlockDecision.kt)、[AccessibilityBlockPolicyTest.kt](https://github.com/Elias02345/Foqos-Android/blob/883718b17960e64015c410d7bd3269995525e646/app/src/test/kotlin/com/foqos/android/service/accessibility/AccessibilityBlockPolicyTest.kt) | 复用 Allow/BlockApp 的结果边界；测试覆盖黑白名单、暂停、临时通行、电话和桌面例外 | 针对小猫状态映射与系统例外补测试；上游测试不是本项目通过记录 |

这几个类的移植确实属于“小范围适配”，可避免引入整套 Hilt、Room 或 Compose。但完整 app 的 [build.gradle.kts](https://github.com/Elias02345/Foqos-Android/blob/883718b17960e64015c410d7bd3269995525e646/app/build.gradle.kts) 为 minSdk 26/targetSdk 36，启用 Kotlin、Compose、Hilt、KSP、Room；小猫 minSdk 24，不能把整个 app 作为库直接加入。[ForegroundAppAccessibilityService.kt](https://github.com/Elias02345/Foqos-Android/blob/883718b17960e64015c410d7bd3269995525e646/app/src/main/kotlin/com/foqos/android/service/accessibility/ForegroundAppAccessibilityService.kt) 通过 Hilt EntryPoint 获取 BlockingStateHolder、SessionManager 等，执行层仍要拆改。**不建议把 SessionManager 与小猫并行运行**。

Policy 还有锁设置、拦截安装卸载和网址规则；本轮需求无需引入这些功能，适配时保持 `strictMode=false`、`blockAppInstallation=false`。尤其不默认移植阻止用户关闭无障碍的行为。只用应用规则还可剥离 URI/域名相关代码。

## 其他完整应用：为何不是首选核心

| 仓库/提交/许可 | 实际耦合与缺口 | 对小猫的价值 |
| --- | --- | --- |
| [SelfLock](https://github.com/EtashTyagi/SelfLock)，`57ea0a89cf1749e4b37f3232a4819c0fe61bbf17`，[MIT](https://github.com/EtashTyagi/SelfLock/blob/57ea0a89cf1749e4b37f3232a4819c0fe61bbf17/LICENSE) | [SelfLockAccessibilityService.kt](https://github.com/EtashTyagi/SelfLock/blob/57ea0a89cf1749e4b37f3232a4819c0fe61bbf17/app/src/main/java/com/selflock/app/service/SelfLockAccessibilityService.kt) 注入 AppRuleRepository、WebsiteRuleRepository、CheckBlockStatusUseCase、BlocklistManager；[判定用例](https://github.com/EtashTyagi/SelfLock/blob/57ea0a89cf1749e4b37f3232a4819c0fe61bbf17/app/src/main/java/com/selflock/app/domain/usecase/CheckBlockStatusUseCase.kt) 是排程/日限额，依赖 UsageRepository，不是现有专注会话。整 app minSdk 34、Compose/Hilt/Room/KSP | 可参考窗口变化事件→查包名→启动 BlockOverlayActivity 的短链路。白名单、电话例外与 FocusEngine 接口仍需补；比 Foqos 规则层收益低 |
| [CurBox](https://github.com/curbox-app/curbox-android)，`09958035ab6f444b4d9ceae0627dad37221425ad`，[GPL-3.0](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/LICENSE) | [FocusModeBlocker.kt](https://github.com/curbox-app/curbox-android/blob/09958035ab6f444b4d9ceae0627dad37221425ad/app/src/main/java/neth/iecal/curbox/blockers/FocusModeBlocker.kt) 已有 BLOCK_SELECTED/BLOCK_ALL_EXCEPT_SELECTED、pressHome；同时绑定 AppBlockerService、DataStore settings、Room FocusStats、番茄阶段、通知/声音、AppSuspendHelper；整 app min26/target36 | 功能多但搬运面大，essentialPackages 目前包含 SystemUI/桌面/键盘，不是完整电话例外。源码复用需按 GPL 条件处理，不能当 MIT 零负担片段；不作为本轮首选 |
| [Mindful](https://github.com/akaMrNagar/Mindful)，`b6eb68d500463c54e1127b6cc7ad540f02ae0c8e`，[GPL-2.0](https://github.com/akaMrNagar/Mindful/blob/b6eb68d500463c54e1127b6cc7ad540f02ae0c8e/LICENSE) | [FocusSessionService.kt](https://github.com/akaMrNagar/Mindful/blob/b6eb68d500463c54e1127b6cc7ad540f02ae0c8e/android/app/src/main/java/com/mindful/android/services/timer/FocusSessionService.kt) 自有计时、通知、DND、绑定 MindfulTrackerService；[RestrictionManager.kt](https://github.com/akaMrNagar/Mindful/blob/b6eb68d500463c54e1127b6cc7ad540f02ae0c8e/android/app/src/main/java/com/mindful/android/services/tracking/RestrictionManager.kt) 混合 focusedApps、睡眠、限额与 UsageStats；宿主为 Flutter | 可研究完整产品实现，但将它放入 Capacitor app 不是少量改动；同样需处理 GPL 条件 |

## 与小猫现有代码的具体接缝

现有 `android/app/src/main/java/com/xiaomao/focus/FocusEngine.java` 使用 `LocalStore` SQLite；`startLocked` 写入 `active`，`actionLocked` 处理暂停/继续、到期、提前结束与重启中断，`store.finish` 写记录并清除 active。这套逻辑继续作为唯一会话真相。

1. 在 FocusEngine 增加一个只读的拦截状态快照出口，输出会话 id、running/paused、黑白名单配置；不要让每条无障碍事件直接调用 `action("read")`，该方法会更新通知、检查到期甚至写入记录。
2. 在 `startLocked`、`actionLocked` 暂停/继续及终止分支发布最新快照；`ReminderReceiver` 的到期处理也必须触发更新。无会话、结束、重启判定 interrupted 时立即清空阻断状态。
3. 增加小猫自己的 `FocusAccessibilityService`：处理窗口前台包名 → 获取快照 → 调用移植的 Policy → 原生拦截页面/回桌面。白名单与系统例外需放在执行前判断，重复窗口事件需去抖。
4. 保持 `CatFocusPlugin.startFocus/focusAction` 为现有 Capacitor 入口；新增规则设置/权限状态桥接，前端不另计时。`RestEngine` 的休息只映射规则快照，不复制第三方会话服务。
5. 服务重连、应用进程重建时从 SQLite 重建快照；权限被关闭时反馈真实状态。移植规则类不提供服务保活或权限自动恢复。

上述是改造方案，并非已经实现。应验证 Android 24、26、36、进程死亡、重启、到期、暂停/休息、来电/紧急拨号、白名单切换和权限撤回。

## 真正可依赖引入的辅助库

以下辅助库由并行主调查核对，边界与规则源码移植不同：

| 模块 | 来源及许可 | 接入收益与边界 |
| --- | --- | --- |
| 权限引导 | [getActivity/XXPermissions](https://github.com/getActivity/XXPermissions)，Apache-2.0，Java Android library，min17 | `PermissionLists.java` 有 BindAccessibilityService、PackageUsageStats、SystemAlertWindow、AccessNotificationPolicy、BindNotificationListener、RequestIgnoreBatteryOptimizations。可通过少量 Java/Capacitor 桥接引导对应设置及检查返回状态；它不会自动授予权限或恢复被用户关闭的服务 |
| 浮窗 | [princekin-f/EasyFloat](https://github.com/princekin-f/EasyFloat)，Apache-2.0，Android library，声明 min17 | README 有 Java `create().setLayout().setShowPattern(ALL).show()` 形式示例。库构建仍为 compile/target29 与旧 android-extensions 插件，须验证依赖解析、现代 Gradle 与 target36 行为，不能称已兼容小猫。浮窗库也不负责检测和禁止前台 app |

DND/通知过滤以及状态恢复，本轮没有找到适合“小改即接”的成熟完整模块。建议 DND/通知功能用 Android API 的薄封装补齐，恢复继续依托现有 FocusEngine/LocalStore。采用 MIT/Apache 源码或库时保留相应许可、版权与所需 NOTICE；GPL 候选另按其许可处理分发要求。本报告仅记录实际许可文本和技术适配判断。
