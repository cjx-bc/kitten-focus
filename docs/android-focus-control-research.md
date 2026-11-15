# 小猫专注：Android 控制能力开源项目调研

范围更新：本文为早期项目筛选。后续已转向同 APK 内置，并按用户 12 张截图扩展完整功能，当前实施范围以[学霸模式与锁机开发规格](focus-control-spec.md)为准；下文“先 Curbox 外部联动”等属于历史建议。

调研日期：2026-11-15。范围：为当前 Vue 3 / TypeScript / Capacitor 8 / Android Java 21 番茄钟补充应用拦截、允许名单、使用统计和更可靠的原生专注会话。此次仅调研，未接入第三方代码或修改业务逻辑。

## 结论与选择

建议采用两条路线：**先用 Curbox 的本地 AIDL API 验证“番茄钟开始后限制其他应用”的完整体验；长期在本项目编写独立的 Capacitor 原生专注控制模块**。自建模块优先阅读 Mindful 的会话/跟踪架构、Curbox 的允许名单与拦截器拆分，以及 MIT 许可的 SelfLock 小型示例。强制冻结和系统 Lock Task 放到可选进阶模式，不能作为普通安装后的默认能力。[Curbox API][cur-api]、[Mindful 源码][mind-src]、[SelfLock 源码][self-src]、[Android Lock Task][android-lock]

当前项目已有正计时/倒计时、暂停恢复、五分钟休息、AlarmManager 提醒/通知、BOOT 恢复和备份更新。缺口在于原生权限状态、应用选择、实时应用切换检测、按会话执行拦截、勿扰和后台生命周期协调；现有 Manifest 尚无 AccessibilityService、UsageStats、DND 和前台服务声明。现有计时和提醒能力应复用，第三方项目主要补充控制层。

| 项目 | 最有价值的补齐点 | 接入性质 | 许可证 | 建议优先级 |
| --- | --- | --- | --- | --- |
| [Curbox][cur] | 应用黑名单/允许名单、专注、网站拦截；真实外部 AIDL 控制接口 | 可做独立应用联动；内部实现供参考 | GPL-3.0 | P0：先验证联动 |
| [Mindful][mind] | 原生专注会话、前台服务、使用统计、无障碍内容识别 | 完整应用参考；公开深链目前不能直接启动控制 | GPL-2.0 | P1：架构参考 |
| [SelfLock][self] | 小型无障碍拦截、规则判断、阻挡 Activity | 参考/选择性复用，需测试与归因 | MIT | P1：较易理解的起点 |
| [Hail][hail] | 冻结/暂停/隐藏应用，多权限后端抽象 | 进阶实现参考 | GPL-3.0 | P2：有明确强控制需求再做 |
| [Shizuku-API][shiz] | 用户授权的 shell/root 身份调用 | 正式 SDK，可直接作为依赖 | MIT | P2：进阶可选依赖 |
| [Dhizuku-API][dhiz] | 共享 Device Owner 能力 | 正式 SDK；依赖已激活的外部 Dhizuku | MIT | P2：受管设备选项 |
| [Google TestDPC][dpc] | Device Owner、应用暂停、Lock Task 允许名单 | 官方示例，适合独立验证 DPC 方案 | Apache-2.0 | P2：专用学习机方案 |
| [Don't Kill My App][dkma] | 厂商后台限制说明与诊断材料 | 文档/数据参考，非保活 SDK | CC-BY-4.0 | P1：后台兼容工作 |

### 维护状态的核验口径

下面日期是调研时浅克隆远程默认分支后，`git log -1 --format='%H %cI %s'` 得到的最新提交者日期，保留当时 SHA；**不是最新发行日期，也不等于核心功能最近修复时间**。GitHub REST API 当次访问被共享 IP 限流，未可靠读取 `archived` 字段；所检查的仓库网页未显示归档横幅，但不能把它当成 API 级确认。没有据此编造星数或承诺维护质量。

| 项目 / 默认分支 | 最新提交日期 | 核验提交（可点击） | 观察 |
| --- | --- | --- | --- |
| Mindful / `main` | 2025-08-27 | [b6eb68d][mind-commit] | 最近提交为本地化修正；距离调研日已一年多，升级适配需自行验证 |
| Curbox / `kt-rewrite` | 2026-11-15 | [0995803][cur-commit] | 当日 README 体积信息更新；当前源码与用户已安装发行包可能不同 |
| SelfLock / `master` | 2026-07-18 | [57ea0a8][self-commit] | 最近提交为 README / MIT 许可，属于小型项目 |
| Hail / `main` | 2026-10-28 | [67a43c8][hail-commit] | 最近提交为翻译，不能据此推断新 Android API 已验证 |
| Shizuku-API / `master` | 2025-05-29 | [a27f6e4][shiz-commit] | SDK 版本补丁提交；宿主 Shizuku 的维护节奏另算 |
| Dhizuku-API / `main` | 2026-11-10 | [fd1b9ff][dhiz-commit] | 最近提交为构建依赖升级 |
| TestDPC / `master` | 2026-09-21 | [e027da9][dpc-commit] | 官方测试 DPC，不是可直接上架的番茄钟产品 |
| Don't Kill My App / `master` | 2026-06-09 | [3616bc8][dkma-commit] | 最近提交更新 Lenovo 说明；厂商页面仍需按系统版本核实 |

## 1. Curbox：最值得先做联动验证

准确仓库为 `curbox-app/curbox-android`，当前默认分支 `kt-rewrite`；旧 DigiPaws / Digital_well_being 搜索结果可能指向前身或分叉，不宜混用。README 和当前源码包含应用/网站拦截、专注及使用统计；重点是原生 Kotlin 控制实现。[仓库][cur]、[许可证][cur-license]

关键入口：

- [`services/AppBlockerService.kt`][cur-service]：AccessibilityService，负责接收事件和调度控制。
- [`blockers/FocusModeBlocker.kt`][cur-focus]：专注规则与拦截；`FocusBlockMode` 明确区分 `BLOCK_SELECTED` 和 `BLOCK_ALL_EXCEPT_SELECTED`，后者可用于“专注期间仅允许选定应用”。
- [`blockers/AppBlocker.kt`][cur-appblock]、`trackers/AppUsageTracker.kt`、`utils/UsageStatsHelper.kt`：规则与统计实现。
- [`api/CurboxApiService.kt`][cur-api-service]、[`api/CurboxApiCommands.kt`][cur-api-commands]、[`ICurboxApi.aidl`][cur-aidl]：实际外部接口，不只是 README 计划；[`apitester`][cur-tester] 提供调用示例。

当前 API 文档标注版本 7，为 Android 本机 Binder/AIDL，支持用户批准后的专注启动/停止、状态查询、使用量查询及专注组操作；不是 HTTP 服务。客户端只需 Android 原生桥接，不需要引入其 Flutter/Room/Firebase 等内部实现，也不以 Shizuku 为 API 调用前提。具体命令、版本新增字段和限制以 [API 文档][cur-api] 及 [命令源码][cur-api-commands] 为准。

**本项目的最短验证路径（工程建议）**：新增实验性 Capacitor `FocusController` 桥接，发现并绑定用户已安装的 Curbox，走其授权界面，先调用 `apiVersion()` / `isGranted()`，再查询专注组，以同一结束时刻执行 `START_FOCUS`，接收可用版本的监听回调并定期校准状态。用户暂停、休息、结束时，要区分“已成功停止控制”和“请求被拒绝”。API 的 `STOP_FOCUS` 受提前退出规则约束；不能假设本项目暂停键总能解除限制。较旧 API 没有同样的字段或功能，应禁用对应入口，不应盲目重试可能重复创建会话的写操作。[API 能力、版本与退出规则][cur-api]

**落地前必须验证**：源码版本 7 是否已经进入拟使用 APK；API 授权撤销、Binder 死亡、Curbox 未安装、番茄钟进程被杀、休息阶段、连续番茄和两端时间调整。两端应选定一个会话状态的权威来源，避免各自倒计时、各自自动进入休息。联动可减少复制实现，但复制 AIDL/示例仍需核对许可证，不能直接宣称“外部调用就完全没有 GPL 义务”。

## 2. Mindful：最完整的会话和跟踪架构参考

准确仓库为 `akaMrNagar/Mindful`。它是 Flutter UI 配合原生 Android Kotlin 的完整数字健康应用，可参考专注、使用统计、应用限制、网站及短视频内容限制的组织方式；并不是可直接添加到 Capacitor 的 Android library。[仓库 README][mind]、[GPL-2.0][mind-license]

关键入口：

- [`services/timer/FocusSessionService.kt`][mind-focus]：原生会话启动、通知、前台服务、结束清理和关联限制。
- [`services/tracking/MindfulTrackerService.kt`][mind-track] 与 [`helpers/usages/AppsUsageHelper.kt`][mind-usage]：前台跟踪和 UsageStats 辅助。
- [`services/accessibility/MindfulAccessibilityService.kt`][mind-src]：无障碍事件筛选、内容识别管理器、事件处理节流；不是系统包管理器权限。
- `android/.../FgMethodCallHandler.kt`：Flutter 到原生会话操作的边界，概念上适合本项目改写为 Capacitor Plugin。

最有用的是“原生会话状态 → 控制规则 → 通知与退出清理”的完整链路。**外部 API 尚不能直接帮本项目开始拦截**：当前 [`docs/API.md`][mind-api] 明确只支持 `OPEN` 深链导航，执行启动会话/拦截和广播事件仍列为未来计划。不要把内部 Flutter 方法通道误认为对其他 App 开放的接口。

建议阅读思路后独立实现本项目的会话状态机；直接复制类需处理 GPL-2.0、Flutter 依赖和存储模型耦合。其旧 target SDK 的服务/DND 写法不代表在本项目当前 target SDK 上无需调整。

## 3. SelfLock：许可宽松、较小的无障碍拦截示例

仓库 `EtashTyagi/SelfLock`，MIT 许可；Android Kotlin / Compose / Room / Hilt 实现。当前 [`app/build.gradle.kts`][self-gradle] 明确 `minSdk=34`、`targetSdk=36`；本项目当前为 `minSdk=24`、`targetSdk=36`，因此不能把整包移入项目后声称覆盖现有 Android 7+ 支持范围，需逐项移植和加版本判断。[仓库][self]、[MIT][self-license]

关键入口为 [`SelfLockAccessibilityService.kt`][self-src]：监听窗口切换，读取包名，经规则仓库和 `CheckBlockStatusUseCase` 判断后启动 `BlockOverlayActivity`；另有 [`MonitoringService.kt`][self-monitor] 和 `data/repository/UsageRepository.kt`。适合快速理解“事件 → 规则 → 阻挡界面”的最小闭环。

选择性复用时保留 MIT 版权/许可，改用本项目现有 SQLite 和原生插件边界即可，不必照搬 Compose/Hilt 全套。其浏览器 URL 识别依赖已知应用的 view ID/文本，网页限制对浏览器版本敏感；启动阻挡 Activity、服务恢复和多窗口行为也必须真机验证。README 的自锁描述不能当作系统级“无法退出”保证。

## 4. Hail：冻结能力和多权限后端参考

仓库 `aistra0528/Hail`，GPL-3.0。它覆盖 stop / disable / hide / suspend 等不同操作和 Root、Shizuku、Dhizuku、Device Owner 后端；这些操作所需身份并不相同。[README 能力矩阵][hail]、[GPL-3.0][hail-license]

关键类为 [`app/AppManager.kt`][hail-manager] 的工作模式分发、[`utils/HShizuku.kt`][hail-shiz] 的特权 Binder 调用、[`utils/HDhizuku.kt`][hail-dhiz] 的共享 Device Owner 调用，以及 `utils/HPolicy.kt` 的自身 Device Owner 路线。后台自动冻结还有 `services/AutoFreezeService.kt` / `work/AutoFreezeWorker.kt`。

适合借鉴“同一控制意图、不同权限后端”的设计，不适合普通安装后直接承诺冻结一切应用。暂停/禁用可能影响目标应用通知、后台任务和后续恢复；本项目若实现，必须持久化由本次会话修改的包与原状态，提供超时、崩溃、重启后的恢复路径，并排除系统设置、电话、默认桌面及必要学习工具。不要直接把卸载功能带入番茄钟流程。

## 5. Shizuku-API：可直接依赖的进阶 SDK

仓库 `RikkaApps/Shizuku-API`，MIT；这是 API SDK 的许可，不能据此推断宿主 Shizuku 或其他引用代码也采用 MIT。官方 README 给出 Gradle 坐标 `dev.rikka.shizuku:api` / `dev.rikka.shizuku:provider`，以及权限申请、Binder 包装和 UserService 用法。[SDK 指南][shiz]、[MIT][shiz-license]

关键入口为 [`api/.../Shizuku.java`][shiz-src]、`ShizukuBinderWrapper.java`、`provider/.../ShizukuProvider.java` 和 `demo/`。本项目可通过 Java 原生插件直接使用 SDK，无需替换 Vue 页面。

Shizuku 提供 shell 或 root 身份，**shell 不等于 root，也不等于 Device Owner**。非 root 设备重启后通常需要再次启动 Shizuku；Android 11+ 可利用无线调试，旧系统需要外部 ADB。用户还需单独安装并启动宿主、批准本项目调用。应把它设计成可选后端，权限或 Binder 消失时及时显示能力降级，不能把它作为普通用户第一次专注的必经步骤。[官方启动要求与权限指南][shiz]

## 6. Dhizuku-API：已有 Device Owner 时的共享能力

仓库 `iamr0s/Dhizuku-API`，SDK 为 MIT，坐标 `io.github.iamr0s:Dhizuku-API`；宿主 [`iamr0s/Dhizuku`][dhiz-host] 的 GPL-3.0 许可独立核对。[API 文档][dhiz-doc]、[SDK MIT][dhiz-license]

入口是 [`dhizuku-api/.../Dhizuku.java`][dhiz-src] 和 `DhizukuBinderWrapper.java`，包含初始化、权限申请和 Binder 包装。它共享的是外部 Dhizuku 已有的 Device Owner 权限；**安装 API 依赖不会自动把手机或本项目变成 Device Owner**。Hail 的 `HDhizuku.kt` 展示了调用应用隐藏/暂停的真实路径。[SDK][dhiz]、[Hail 适配][hail-dhiz]

仅在目标用户明确愿意配置受管设备时评估。已有企业管理/工作资料、账号与设备配置可能妨碍激活；不得把激活或抹除设备列为普通专注模式自动步骤。与 Shizuku 一样要有运行时能力检测和解除控制的兜底。

## 7. Google TestDPC：系统强控制的官方验证样例

仓库 `googlesamples/android-testdpc`，Apache-2.0。它是 Android Enterprise 测试 Device Policy Controller，不是生产可直接嵌入的 AppBlock SDK。[README][dpc]、[Apache-2.0][dpc-license]

建议阅读 [`DevicePolicyManagerGatewayImpl.java`][dpc-gateway] 中 `setPackagesSuspended` / `setLockTaskPackages`、[`policy/locktask/KioskModeActivity.java`][dpc-kiosk] 和 `SetLockTaskFeaturesFragment.java`，用独立测试设备验证“只准使用本应用+允许应用”的方案。

真正 Lock Task 需要 DPC 允许名单，适用于专用/受管设备；普通 Activity 直接 `startLockTask()` 可能只是用户可退出的屏幕固定。Device Admin 的普通授权也不等于 Device Owner。设备所有者的配置受设备状态/部署路径限制，可能需要全新或重置的专用设备；不要向现有手机用户承诺一键强锁。[Android Lock Task][android-lock]、[TestDPC 设置说明][dpc]

适合作为以后“学习机/家长受管模式”独立产品路线，默认消费者模式仍使用用户可撤销的无障碍控制。

## 8. Don't Kill My App：后台诊断资料，而非保活依赖

仓库 `urbandroid-team/dont-kill-my-app`，内容为 CC-BY-4.0。重点目录 [`_vendors-content/`][dkma-vendors]、`_vendors/` 和 `api/v1/` 提供不同厂商的后台限制说明/数据。[README][dkma]、[许可][dkma-license]

本项目可据此设计“通知正常、无障碍启用、后台限制、电池优化、自启动”的诊断与说明页面，并按设备/系统版本进行支持验证。它不会给应用系统特权，也不能保证所有 ROM 的服务永远存活。引用文字、截图或改编内容需归因并标注修改；厂商菜单与说明需持续复核。

## 接入设计建议

### 阶段一：先打通可测量的专注控制闭环

在 Java 原生侧定义 `FocusController`：`getCapabilities()`、`getPermissionState()`、`listLaunchableApps()`、`startSession()`、`pauseSession()`、`stopSession()`、`getState()`；Vue 负责应用选择、会话界面和解释性授权，控制逻辑独立于 WebView。以上是本项目建议接口，不是第三方已有 API。

先用 Curbox 联动验证产品体验，同时决定是否长期要求用户另装应用。先实现选中应用黑名单，再加“除允许名单外均拦截”；电话、默认桌面、输入法、本应用、紧急功能等按角色和运行环境处理，不能把一个机型上的固定系统包名当作所有设备通用名单。

将控制状态绑定到现有会话 ID 和持久化结束时刻，明确暂停、休息、续时、取消、重启的规则。倒计时以持久化时间计算，避免只依赖 JavaScript 定时器或一秒一秒扣值。正常结束和强制中断都执行可重复的清理；读取真实控制状态后再向 UI 报告成功。

### 阶段二：实现自有普通安卓模式

独立编写 `AccessibilityService`，只监听实际需要的窗口/包名事件，用缓存规则和节流避免每个事件读取数据库；受限应用出现时展示原生阻挡界面或执行明确用户选择的返回动作。拦截层需考虑最近任务、多窗口、画中画和系统对后台 Activity 的限制。[AccessibilityService 官方说明][android-access]、[SelfLock 实际入口][self-src]

使用 UsageStats 做使用报告、会话中断复盘和辅助检测。它需要用户在特殊设置中授权，不是普通 runtime permission；其数据是统计/事件查询，不自带禁止应用启动能力。[UsageStatsManager][android-usage]

勿扰作为独立可选能力：请求 Notification Policy Access，记录本次会话自己启用的规则，结束时移除自己的效果，避免覆盖用户或其他应用的勿扰安排。target SDK 35+ 的 `setInterruptionFilter()` 不再用于直接改全局状态，而是操作调用方关联的 AutomaticZenRule；要按当前 API 语义适配。[NotificationManager][android-dnd]

前台服务仅在确有用户可见持续任务时启用，并显示可操作通知；Android 14+ 需正确声明前台服务类型和权限。不能借 `shortService` 跑 25 分钟（约三分钟限制），也不能随意假称 `dataSync` / `mediaPlayback`。`specialUse` 需要描述实际用途且涉及商店申报/审核，其他开源项目的 Manifest 不是上架许可。[FGS 类型][android-fgs]

### 阶段三：可选强控制与受管设备模式

先抽象 `AccessibilityBackend` 与 `ShizukuBackend`，不要把高权限命令混在 Vue 页面；存在受管设备需求后再评估 Dhizuku 或自有 DPC。每条后端都报告能力、授权状态和失败原因。强控制重点是结束后恢复原状态，以及崩溃/重启/授权丢失后的自救，不以“阻止用户撤销全部权限”作为普通应用目标。

## 兼容性和产品承诺边界

| 条件 | 可承诺的行为 | 需要明确的边界 / 验证 |
| --- | --- | --- |
| 普通安装 + 无障碍授权 | 在服务正常运行时识别应用切换并执行软拦截 | 用户可撤权、强停/卸载；系统或 ROM 可限制服务；不是系统冻结 |
| Usage Access | 查询获准范围内的应用统计 | 不等于实时前台判定保证，不提供应用关闭权限 |
| 通知 / AlarmManager | 结束提醒与后台恢复的基础 | Doze、准确闹钟资格、ROM 设置及强停影响需单独验证 |
| 前台服务 | 用户可见的持续会话工作 | 仍受启动限制、类型/时限、用户停止和系统管理约束 |
| Shizuku | 用户启动并批准后执行 shell/root 身份允许的操作 | root 与 ADB 权限不同；重启/服务死亡后可失效 |
| DPC / Device Owner | 在满足部署条件的设备上设允许名单、暂停/隐藏允许操作的应用 | 专用/受管设备路线，不等于普通设备管理员；系统关键应用存在限制 |
| 侧载无障碍服务 | 由用户明确启用 | 部分新 Android/安装来源受“受限设置”保护；引导应解释用途，不绕过系统保护 |

依据：[UsageStats][android-usage]、[FGS][android-fgs]、[Lock Task][android-lock]、[Shizuku][shiz]、[Android 受限设置][android-restricted]。最低验收应覆盖项目最低支持版本、Android 13/14/15/16，Pixel/AOSP 与至少一款目标用户常用国产 ROM；包括锁屏、息屏、省电、重启、杀进程、撤权、跨日、系统时间变更及控制端未安装。此项为建议测试矩阵，本次未运行真机验证。

## 许可与使用方式

- **可直接依赖的 SDK**：Shizuku-API、Dhizuku-API 都是 MIT；保留版权与许可。仍需核对传递依赖、发布制品和宿主许可。
- **宽松许可实现参考**：SelfLock 是 MIT；TestDPC 是 Apache-2.0，复用代码时保留必要许可、版权、修改说明及适用的 NOTICE 内容。
- **GPL 完整应用**：Mindful 为 GPL-2.0，Curbox/Hail 为 GPL-3.0。修改/复制受保护代码并分发派生作品时，需要满足对应 GPL 的源代码、许可及告知义务；不是“免费所以可任意闭源复制”。本项目现有 LICENSE、发行方式和依赖组合应在实际复用前核对。
- **GPL 与 AGPL**：本次入选项目未确认有 AGPL 项目。AGPL 还涉及修改程序通过网络向用户提供服务时的对应源码义务；不可把 GPL、AGPL 和 MIT 混为一谈。[GNU 许可说明][gnu-license]
- **独立应用联动**：Curbox API 是重要工程选项，但进程分离不是自动许可豁免。尤其复制 AIDL/示例及协议耦合的具体方式，需要按文件许可和发布组合核对。
- **内容引用**：Don't Kill My App 为 CC-BY-4.0，改写其文案/截图要保留归因并标注修改。[CC-BY-4.0][dkma-license]

未纳入推荐：商业产品 AppBlock 与 GitHub 同名小项目不能混为一谈；TimeLimit 若上游托管并非当前 GitHub，不为凑数量推荐未知 fork；Kvaesitso 属于启动器方向，不能直接补齐本项目实时应用拦截短板。

## 引用依据

以下链接均为项目自身源码/文档、Android 官方文档或许可原文。源码路径按调研时默认分支；维护快照由上表 commit 链接固定，可将路径中的分支替换为对应 SHA 复现。

[cur]: https://github.com/curbox-app/curbox-android
[cur-commit]: https://github.com/curbox-app/curbox-android/commit/09958035ab6f444b4d9ceae0627dad37221425ad
[cur-license]: https://github.com/curbox-app/curbox-android/blob/kt-rewrite/LICENSE
[cur-api]: https://github.com/curbox-app/curbox-android/blob/kt-rewrite/CURBOX_API.md
[cur-service]: https://github.com/curbox-app/curbox-android/blob/kt-rewrite/app/src/main/java/neth/iecal/curbox/services/AppBlockerService.kt
[cur-focus]: https://github.com/curbox-app/curbox-android/blob/kt-rewrite/app/src/main/java/neth/iecal/curbox/blockers/FocusModeBlocker.kt
[cur-appblock]: https://github.com/curbox-app/curbox-android/blob/kt-rewrite/app/src/main/java/neth/iecal/curbox/blockers/AppBlocker.kt
[cur-api-service]: https://github.com/curbox-app/curbox-android/blob/kt-rewrite/app/src/main/java/neth/iecal/curbox/api/CurboxApiService.kt
[cur-api-commands]: https://github.com/curbox-app/curbox-android/blob/kt-rewrite/app/src/main/java/neth/iecal/curbox/api/CurboxApiCommands.kt
[cur-aidl]: https://github.com/curbox-app/curbox-android/blob/kt-rewrite/app/src/main/aidl/neth/iecal/curbox/api/ICurboxApi.aidl
[cur-tester]: https://github.com/curbox-app/curbox-android/tree/kt-rewrite/apitester/src/main
[mind]: https://github.com/akaMrNagar/Mindful
[mind-commit]: https://github.com/akaMrNagar/Mindful/commit/b6eb68d500463c54e1127b6cc7ad540f02ae0c8e
[mind-license]: https://github.com/akaMrNagar/Mindful/blob/main/LICENSE
[mind-src]: https://github.com/akaMrNagar/Mindful/blob/main/android/app/src/main/java/com/mindful/android/services/accessibility/MindfulAccessibilityService.kt
[mind-focus]: https://github.com/akaMrNagar/Mindful/blob/main/android/app/src/main/java/com/mindful/android/services/timer/FocusSessionService.kt
[mind-track]: https://github.com/akaMrNagar/Mindful/blob/main/android/app/src/main/java/com/mindful/android/services/tracking/MindfulTrackerService.kt
[mind-usage]: https://github.com/akaMrNagar/Mindful/blob/main/android/app/src/main/java/com/mindful/android/helpers/usages/AppsUsageHelper.kt
[mind-api]: https://github.com/akaMrNagar/Mindful/blob/main/docs/API.md
[self]: https://github.com/EtashTyagi/SelfLock
[self-commit]: https://github.com/EtashTyagi/SelfLock/commit/57ea0a89cf1749e4b37f3232a4819c0fe61bbf17
[self-license]: https://github.com/EtashTyagi/SelfLock/blob/master/LICENSE
[self-src]: https://github.com/EtashTyagi/SelfLock/blob/master/app/src/main/java/com/selflock/app/service/SelfLockAccessibilityService.kt
[self-monitor]: https://github.com/EtashTyagi/SelfLock/blob/master/app/src/main/java/com/selflock/app/service/MonitoringService.kt
[self-gradle]: https://github.com/EtashTyagi/SelfLock/blob/master/app/build.gradle.kts
[hail]: https://github.com/aistra0528/Hail
[hail-commit]: https://github.com/aistra0528/Hail/commit/67a43c8ea7d43eddf51d840f3615b97ce6079c9b
[hail-license]: https://github.com/aistra0528/Hail/blob/main/LICENSE
[hail-manager]: https://github.com/aistra0528/Hail/blob/main/app/src/main/kotlin/com/aistra/hail/app/AppManager.kt
[hail-shiz]: https://github.com/aistra0528/Hail/blob/main/app/src/main/kotlin/com/aistra/hail/utils/HShizuku.kt
[hail-dhiz]: https://github.com/aistra0528/Hail/blob/main/app/src/main/kotlin/com/aistra/hail/utils/HDhizuku.kt
[shiz]: https://github.com/RikkaApps/Shizuku-API
[shiz-commit]: https://github.com/RikkaApps/Shizuku-API/commit/a27f6e4151ba7b39965ca47edb2bf0aeed7102e5
[shiz-license]: https://github.com/RikkaApps/Shizuku-API/blob/master/LICENSE
[shiz-src]: https://github.com/RikkaApps/Shizuku-API/blob/master/api/src/main/java/rikka/shizuku/Shizuku.java
[dhiz]: https://github.com/iamr0s/Dhizuku-API
[dhiz-commit]: https://github.com/iamr0s/Dhizuku-API/commit/fd1b9ff0a6f64178cd60cf2cfe8785a5047045e4
[dhiz-doc]: https://github.com/iamr0s/Dhizuku-API/blob/main/docs/README.md
[dhiz-license]: https://github.com/iamr0s/Dhizuku-API/blob/main/LICENSE
[dhiz-src]: https://github.com/iamr0s/Dhizuku-API/blob/main/dhizuku-api/src/main/java/com/rosan/dhizuku/api/Dhizuku.java
[dhiz-host]: https://github.com/iamr0s/Dhizuku
[dpc]: https://github.com/googlesamples/android-testdpc
[dpc-commit]: https://github.com/googlesamples/android-testdpc/commit/e027da9bd9d88e9de77b4180b9457e72747bc374
[dpc-license]: https://github.com/googlesamples/android-testdpc/blob/master/LICENSE
[dpc-gateway]: https://github.com/googlesamples/android-testdpc/blob/master/src/main/java/com/afwsamples/testdpc/DevicePolicyManagerGatewayImpl.java
[dpc-kiosk]: https://github.com/googlesamples/android-testdpc/blob/master/src/main/java/com/afwsamples/testdpc/policy/locktask/KioskModeActivity.java
[dkma]: https://github.com/urbandroid-team/dont-kill-my-app
[dkma-commit]: https://github.com/urbandroid-team/dont-kill-my-app/commit/3616bc8b3b6b3910ac204e107ff0dfd6064f877c
[dkma-license]: https://github.com/urbandroid-team/dont-kill-my-app/blob/master/LICENCE
[dkma-vendors]: https://github.com/urbandroid-team/dont-kill-my-app/tree/master/_vendors-content
[android-lock]: https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode
[android-access]: https://developer.android.com/guide/topics/ui/accessibility/service
[android-usage]: https://developer.android.com/reference/android/app/usage/UsageStatsManager
[android-dnd]: https://developer.android.com/reference/android/app/NotificationManager#setInterruptionFilter(int)
[android-fgs]: https://developer.android.com/develop/background-work/services/fgs/service-types
[android-restricted]: https://support.google.com/android/answer/12623953
[gnu-license]: https://www.gnu.org/licenses/licenses.html
