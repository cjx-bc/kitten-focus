# 小猫专注（kitten-focus）交互设计与 UX 规范（`docs/ux-spec.md`）

**状态**　2026-11-27 · v2 Design-Before-Code 门禁基线 · CF-01（#31）  
**适用范围**　`0.3.x` P0 下游 #32–#39 的页面、弹窗、原生联动和验收。M1–M4 已有规则继续适用，版本冲突以 §2.4 为准。  
**对齐基准**　交互参考《小鸡专注》，功能见 [v2 方案](cat-companion-plan.md)，视觉采用 [小猫专注品牌规范](brand-spec.md) 和 [DESIGN.md](../DESIGN.md)，业务与原生边界见 §2。  

---

## 1. 目的、范围与硬性 UX 预算（R1–R4）

本规范旨在消除当前前端“工程状态机暴露给学生日常路径”的认知过载，在不改变 `docs/brand-spec.md` 锁定视觉语言、不丢失任何原生控制或辅助能力的前提下，将全部学生核心界面对齐《小鸡专注》的极简心流与渐进披露层级。

### 1.1 硬性预算（R1–R4）

| 规则编号 | 硬性指标 | 量化约束 |
|---|---|---|
| **R1-A** | **单屏决策与 CTA 预算** | 任意主视图与弹窗第一眼最多 **1 个主 CTA**（`.primary`），最多 **4 个开关或决策项/分组**（遵循 Cowan 4±1 工作记忆上限与 `impeccable` Operate 模式）。 |
| **R1-B** | **主屏零工程/诊断状态** | 主学习视图（`TasksView`、`FocusView`、`RestView`、`CalendarView`、`StatisticsView`、一级 `SettingsView`）**0 个**底层工程、诊断或降级状态：`needsReconcile`、`studyDisplay` 的 10 种工程状态（`状态异常`/`检查中`/`不支持`/`待连接`/`待生效`/`已失效`/`已撤销` 等）、`ProtectionStartSummary` 启动诊断清单、`DndSetting`/`NotificationSetting` 的 `runtime-only` 实时监听统计、6 项 `FORCE-01..06` 平铺开关、`升级恢复副本` 入口均禁止出现在一级主屏幕。 |
| **R1-C** | **零弹窗套弹窗（Nested Modals = 0）** | 任意时刻整个 DOM 中最多存在 1 个打开的原生模态框：**`document.querySelectorAll('dialog[open]').length <= 1`**。禁止在未关闭父 `<Sheet>` 的情况下打开子 `<Sheet>`、`ConfirmationDialog`、`AppWhitelistEditor`、`InfoHint`、`StrictStartConfirmation` 或 `RecoverySheet`。 |
| **R1-D** | **高频学生路径 ≤ 2 步** | ① `/focus` 选中待办后点 `开始专注`（1 步），或打开待办选择器 → 点目标行的直接开始（2 步）。② 首次启动自由专注时点 `开始专注`（1 步），已选待办时打开选择器 → 点自由专注行的直接开始（2 步）。③ 暂停、继续、无责取消与滑动放弃各 1 步，非手势替代至多 2 步，严格倒计时依 §2.2。④ 顶栏 `学霸` → 总开关（2 步），关时自动收起，开时立即持久化并可继续配置。⑤ 已在 `/tasks` 时点 `+` 或 `创建第一个待办` → 填名称并 `保存并开始`（2 步）。⑥ `时间轴` → 顶栏切换 `日程`（2 步），在日程页 `+` → 填写并保存（2 步）。⑦ `统计` → `日` 或 `周`（1–2 步）。 |
| **R2** | **《小鸡专注》核心交互 1:1 对齐** | 保留滑动调时、单局三阶段成长、十秒无责取消、左滑放弃、单层结算、自然周农场、可补录时间轴、时长/次数统计和番茄循环的交互顺序与反馈。使用小猫专注品牌、线性图标与自有动物插画。 |
| **R3** | **3 层渐进披露与能力零丢失** | 将低频增强保护、权限诊断、故障恢复、系统提醒、升级恢复副本、独立锁机高级配置收进二级配置或三级诊断中心，确保底层的原生控制、白名单、恢复与帮助能力 **100% 可达、0 丢失**。 |
| **R4** | **视觉、术语与原生边界锁定** | 采用 `docs/brand-spec.md` 的黑白灰、离线等宽数字 Nunito、`24px` 边距、`20px` 圆角、`>= 12px` 辅文、`>= 48×48px` 触控、输入框 A 方案和五栏线性图标。遵守 `GLOSSARY.md` v2、ADR 0004 与 ADR 0005。 |

---

## 2. 架构与原生边界不变量（ADR 0001–0005 与 `GLOSSARY.md`）

### 2.1 ADR 治理状态区分（遵循 `docs/agents/domain.md:14`）

| ADR 编号 | 文档 | 治理状态 | 对本规范的约束 |
|---|---|---|---|
| **ADR 0001** | `docs/adr/0001-vue-capacitor-java.md` | `accepted` | Vue 3 + TypeScript + Capacitor + Android Java + SQLite 架构保持不变。 |
| **ADR 0002** | `docs/adr/0002-local-first-initial-release.md` | `accepted` | 无登录体系、本地优先完整 v1（备份导出/导入保留）。 |
| **ADR 0003** | `docs/adr/0003-reusable-focus-items.md` | `accepted` | `子待办` 可重复使用，无完成勾选框、无已完成列表、无计划日期。 |
| **ADR 0004** | `docs/adr/0004-native-focus-control-boundary.md` | **`proposed`**（2026-11-15，2026-11-21 修订） | 待第三方源码适配与系统探针最终确认，不得伪称已通过全部原生验证；前端必须严格守住其控制所有权、安全出口与如实能力披露边界。 |
| **ADR 0005** | `docs/adr/0005-chickfocus-full-parity-architecture.md` | **`proposed`**（2026-11-27） | 好感与历史高水位从专注记录推导。手动补录仅进入时间轴与时长统计。轻看护、学霸模式和独立锁机构成三档能力，原生会话仍由 ADR 0004 管理。 |

### 2.2 原生会话所有权与插件契约不变量

1. **单一会话与存储所有权**：Java `FocusEngine`、`RestEngine`、`LockEngine`、`FocusControl` 与 SQLite（`LocalStore`）拥有计时、互斥（专注 / 休息 / 锁机）与专注记录的唯一所有权。Vue 层（`src/`）**禁止**建立第二套计时引擎或第二套业务数据库，仅编辑偏好并渲染原生返回快照。
2. **保留全部 40 个 `CatFocus` 方法（支持增量扩展） + 9 个 `AppUpdates` 方法 + 6 个窗口自定义事件**：
   - `CatFocusPlugin.java` 原有 **40 个 `@PluginMethod`** 签名保持不变：
     - `src/platform/bridge.ts`（原有 **34 个** + 增量）：`resolveMainEntry`, `startLock`, `lockAction`, `loadData`, `saveData`, `replaceData`, `startFocus`, `focusAction`, `startRest`, `restAction`, `grantTemporaryAccess`, `observeControl`, `getRecentTasksStatus`, `getLauncherStatus`, `getWallpaperStatus`, `prepareWallpaper`, `requestWallpaperPicker`, `importWallpaperOriginal`, `confirmWallpaperManualRecovery`, `openWallpaperSettings`, `consumeFocusReturn`, `consumeLockReturn`, `protectionStatus`, `listProtectionApps`, `openProtectionSettings`, `previewRecovery`, `confirmRecovery`, `consumeRecoveryReturn`, `exportFile`, `importFile`, `permissions`（增量返回可选字段 `batteryOptimizationIgnored`、`foregroundServiceActive`）, `requestNotifications`, `openAlarmSettings`, `openBatteryOptimizationSettings`（增量）, `syncReminders`；以及对抗层与四维保活增量方法 `setFocusOverlayState`, `getKeepAliveGuide`, `openKeepAliveSettings`, `getDeviceAdminStatus`, `requestDeviceAdmin`, `deactivateDeviceAdmin`。
     - `src/platform/dnd.ts`（**3 个**）：`getDndStatus`, `openDndSettings`, `restoreDnd`。
     - `src/platform/notifications.ts`（**3 个**）：`getNotificationStatus`, `openNotificationAccessSettings`, `rebindNotificationListener`。
   - `AppUpdatesPlugin.java` / `src/platform/updates.ts` 全部 **9 个 `@PluginMethod`** 签名保持不变：`status`, `check`, `download`, `cancel`, `backups`, `exportBackup`, `restoreBackup`, `installPermission`, `install`。
   - 注：`setProtectionPreferences` **不存在**；保护偏好一律通过 `saveData` 持久化到 `AppData.preferences.protection`。
   - 保留全部 **6 个窗口自定义事件**：`open-recovery`、`recovery-return-request`、`focus-return-request`、`lock-return-request`、`protection-recovered`、`rest-exit-request`。
3. **`observeControl()` 只读纯洁性与 `resolveEffectiveProtection(prefs)` 唯一展开缝**：
   - `observeControl()`（`controlDriver.observe()`）必须保持严格只读，对到期时间、记录、闹钟、通知不产生任何副作用。
   - `resolveEffectiveProtection(prefs)`（`src/domain/protectionModules.ts` 与 Java `FocusProtection.resolveEffective`）是分组偏好 `ProtectionModules`（`master`, `apps`, `strict`, `quiet`）展开为扁平原生标志（`study`, `strict`, `dnd`, `interceptNotifications`, `enhancements`, `globalWhitelist`）的**唯一展开缝**。
4. **移除 `StrictStartConfirmation` 与 `FocusControl.java:186-231`（`strictModeConfirmed` 及 `checkStart`）的协调策略**：
   - Java `FocusControl.startFocus(session, strictModeConfirmed)`（`FocusControl.java:186-197`）**直接从 SQLite `LocalStore` 读取已持久化的 `preferences.protection`**（Web 预览读取 `IndexedDB`），接口不接受单轮绕过参数；当 `protection.strict && mode == "countdown"` 时强制校验 `strictModeConfirmed === true`，否则抛出 `"请先确认严格倒计时：开始后不能暂停、取消或提前结束"`；并在 `checkStart`（`FocusControl.java:208-217`）中对**缺失权限**或**待恢复保护项**（`DndProtection`、`NotificationProtection`、`RecentTasksProtection`、`LauncherProtection`、`WallpaperProtection`）抛出可操作的 `IllegalStateException`。
   - **重设计协调方案**：
     - 普通专注、非严格学霸专注及**正计时**（`stopwatch` 不受严格模式约束）**直接调用 `focusDriver.start(session, strictModeConfirmed)`**，彻底移除 `StrictStartConfirmation` 前置拦截，保证 **1–2 步**进入 `/focus`。
     - **严格模式确认门控（含备份恢复与历史迁移保护）**：在 `StudyModeSheet` 内开启 `严格模式` 开关时明确提示“开启后倒计时不可中途暂停或提前结束，正计时不受影响”并记录确认标记 `strictAcknowledged`；**严禁在 `restore()`、升级副本恢复或旧版 `migrateProtectionPreferences` 迁移后盲目传入 `strictModeConfirmed = true`**——上述来源或跨生命周期未显式确认过的配置须清空 `strictAcknowledged`，在首次触发 `strict && mode === 'countdown'` 启动前弹出**单句轻量单层确认弹窗**（`“已开启严格倒计时：开始后不能暂停、取消或提前结束，是否开始？”`，仅 `[取消]` / `[确认开始]`，绝不展示 `ProtectionStartSummary` 工程诊断清单），确认后写入 `strictAcknowledged` 并立即启动；已确认的日常连续启动直接透传 `strictModeConfirmed = true`。
     - **全部 `app.start()` 调用方统一先关后启与单层恢复**：覆盖 **`TasksView.vue`**（`begin`、`startFree`）、**`CalendarView.vue`**（`startFromEvent`）、**`FocusView.vue:64`**（`again()` / `再次开始`）与 **`RestView.vue:45`**（`again()` / `再次专注`）。其中 `TasksView.startFree()` 与 `CalendarView.startFromEvent()` 必须**先执行 `sheet = null` 再调用 `await app.start()`**（杜绝弹窗叠加）。当原生 `focusDriver.start()` 抛出异常时，4 个调用方统一捕获错误并展示**视图级单层恢复提示弹窗**（严禁仅弹 3.5 秒 Toast 或写入已关闭弹窗的 `formError`）：
       - **缺失权限错误**：提供 **`前往学霸模式处理`**（打开 `StudyModeSheet` 至 `'permissions'`）与 **`关闭未就绪保护并开始`**（如实说明将关闭设置中的未就绪保护项——调用 `clearUnreadyProtections` 同款 `saveData` 持久化突变后立即重新捕获 `startingData` 重试 `app.start()`，严禁使用虚假的“本次暂不开启保护并开始”文案）。
       - **待恢复保护项错误**（`Dnd`/`Notification`/`RecentTasks`/`Launcher`/`Wallpaper` 存在未清理的恢复记录）：直接提供 **`前往故障恢复`**（路由至 `/recovery`）与 `[取消]`。
5. **学霸专注期间的强制安全出口**：
   - 当 `isStudySessionLocked(app.focus.session)` 为 `true`（`session.protection.study === true || session.protection.studyLocked === true`，与 `src/navigation/mainEntry.ts:19` 一致）时，`installMainEntryGuard`（`src/navigation/mainEntry.ts`）与 `App.vue` 保持主标签与返回键锁定在 `/focus`，同时**必须确保** `FocusSafetySheet`（`FocusView` 右上角 `⋯`）可在 **2 步内**触达 `/help`、`/emergency`、`/recovery`、`/permissions`，并在返回时回到 `/focus`。
6. **`lockMainInterfaceRestricted` 隔离原则**：
   - `lockMainInterfaceRestricted` 仅属于独立锁机配置 `LockConfiguration`（`LockView.vue` / `LockMainEntrySetting.vue`），**严禁**放回 `StudyModeSheet.vue`。
7. **如实能力反馈**：
   - 严禁在权限未授或非原生预览环境伪装保护已生效；严禁将 `hideRecents`、`hideLauncher`、`wallpaperProtection` 或 `preciseAntiClose` 描述为“系统保证无法强停或卸载”。
8. **单段原生启动屏与无缝首屏交接（`AppTheme.NoActionBarLaunch` + `SplashCoordinator`）**：
   - Android 启动阶段采用单段原生开屏（`#FFFFFF` 纯白背景 + 纯黑白猫头「歪头抖耳 Wink」1000ms 矢量动画，含约 320ms 静候反应停顿后开始歪头抖耳眨眼 + 底部品牌字标「小猫专注 / 专注此刻，陪小猫一起长大」，Android 11 及以下静默降级为纯猫头静态图标），由 `SplashCoordinator` 保持开屏直至 Vue 首帧就绪且至少播完 1000ms 动画（极端情况最长 2000ms 超时放行），随后以 180ms 轻淡出直接进入目标页面。
   - 存在进行中会话（专注 / 休息 / 锁机或系统拉回 `returnToFocus` / `returnToLock` / `openRecovery`）或系统开启减少动态效果时，跳过 1000ms 等待并在前端就绪后立即无阻碍放行。
   - 在原生 Android 环境下，`App.vue` 初始化期 `.boot`（`.boot-native`）保持纯白底不渲染第二段文字闪屏，彻底消除两段割裂；纯网页预览保留 `.boot`（副标「专注此刻，陪小猫一起长大」）。保持全部 40 个 `CatFocus` `@PluginMethod` 签名不变，仅在 `MainActivity` 暴露极简 `window.KittenSplash.notifyReady()` `JavascriptInterface` 通知首帧就绪。
9. **每次启动自动检查更新与不打扰单层提示（Option A）**：
   - 每次冷启动（及 60 秒进程内冷却窗口之外的前台恢复）在后台静默检查更新（`force = false`）；网络异常或离线保持静默，绝不打断学习或阻塞启动。
   - 发现新版本后，在 `App.vue` 仅当 `native === true`、`app.ready`、无进行中专注/休息/锁机会话、处于主标签页（`!full`）、DOM 中无任何打开的 `<dialog>` 且该 `versionCode` 未被用户点击过 `稍后再说` 时，弹出 1 次单层 `<Sheet>`（版本与包大小卡片 + 限高可滚更新说明 + 安心数据备份提示 + 1 个主 CTA `下载更新` / `安装更新` + 次按钮 `稍后再说`）。点击 `稍后再说` 或非下载中关闭弹窗后将该 `versionCode` 记入 `localStorage`，此后同一版本不再主动弹窗打扰（仍保留「我的」小红点与手动检查入口，直到更高 `versionCode` 发布）；下载中提供 `收起，后台继续下载` 出口而不永久忽略当前版本。绝不静默自动下载，且可被 `RecoverySheet` / `ux-close-sheets` 抢占关闭。
10. **Android 前台服务、双引擎免掉权应用限制、全专注全屏覆盖、融合防绕过与四维冷静保活（遵守 ADR 0004）**：
   - **专注/锁机期间前台服务**：`FocusKeepAliveService`（`foregroundServiceType="specialUse"`）仅在专注或独立锁机进行中运行，复用现有专注常驻通知（`Reminders.FOCUS_ID = 40`、`focus-status` 低打扰频道），不弹出第二条通知；`onTaskRemoved` 与活跃期低频心跳守护在会话进行中按需自救拉起，会话结束、重启（未开启重启续锁）或故障恢复后立即停止，平时不在后台驻留，也不挂任何待机保活通知。
   - **全专注全屏原生悬浮窗覆盖与双引擎应用限制**：
     - **普通专注（未开学霸模式）**：开启专注后如已具备悬浮窗权限，由 `FocusBlockOverlay` 提供全屏专注控制覆盖（支持暂停/继续、内联确认结束、返回待办与安全入口）；当用户上滑回桌面、切最近任务或切换至其他应用（`onUserLeaveHint` / `onPause`）时**立即自动收起覆盖层**，确保手机日常操作完全不受影响；切回 `/focus` 时恢复覆盖。若未授予悬浮窗权限，则平滑降级为全屏沉浸 `FocusView`，绝不阻塞 1 步开始专注。
     - **学霸模式 / 独立锁机**：优先以无障碍 `TYPE_ACCESSIBILITY_OVERLAY`（连接时）或 `TYPE_APPLICATION_OVERLAY`（持久化「使用情况访问 + 悬浮窗」免掉权主引擎）执行 **0ms 全屏覆盖 + 按键事件过滤（`dispatchKeyEvent` + 无障碍 `onKeyEvent`）**，不随上滑切出而撤离；内建「白名单应用」快捷切出列表，切入白名单学习应用时自动让路，切离白名单、返回桌面/多任务或触发国产五大 ROM 精准防关闭时 0ms 瞬时遮挡并发 `GLOBAL_ACTION_BACK` 强拉回专注页；遮罩底部常驻冷静 2 步安全出口（`遇到问题？紧急与故障恢复`）。
   - **融合防关闭与可选进阶增强（默认关闭，折叠于 `▸ 进阶防绕过`）**：在精准识别五大国产 ROM 应用详情/卸载/无障碍页并保持 Wi-Fi/蓝牙等日常设置可用之外，提供可选「严格权限目录防撤权」、可选最小空策略普通设备管理器「防卸载保护」（含一键停用）与可选「重启后未到期继续锁机」。
   - **冷静、一步直达、零红标焦虑的四维保活向导**：电池优化放行、自启动白名单跳转、多任务手动锁卡手势图解（与 `hideRecents` 互斥提醒）及可选高阶无障碍均属建议增强项，**绝不**阻塞普通专注/锁机启动，**绝不**计入 `missingPermissions` 缺失权限计数或红标，收拢于 `StudyModeSheet` 同容器内联子视图 `keepAliveGuide`（0 嵌套弹窗）与 Tier 3 `/permissions`、`/help#help-keepalive`。
   - **无障碍断连恢复**：当系统划卡后无障碍开关仍开着（`authorized=true && connected=false`），在二级权限页与授权引导中区分「未授权」与「开关仍在 · 需重开」。复用权限项的设置入口，点一次直达系统无障碍，将「小猫专注」关闭再重开。仅缺无障碍连接且「使用情况访问 + 悬浮窗」已就绪时，说明日常应用限制可正常使用。顶栏仍仅显示「学霸模式 · 关」「学霸模式 · 开」「学霸模式 · 待授权」。
   - **国产 ROM 安全中心信任与保活边界**：侧载版在专注期间使用无障碍时，OPPO 手机管家 / 安全中心、小米安全中心、vivo i 管家、华为 / 荣耀手机管家的病毒查杀或风险管控可能自动撤回无障碍授权。在对应手机管家 / 安全中心将小猫专注设为信任或加入白名单，再重新开启无障碍。三星与原生 Android 在 Android 13 及以上版本侧载安装后，如系统限制首次开启无障碍，先在「应用信息 → 右上角 ⋮」选择「允许受限设置」。入口以设备实际提供的选项为准。
   - **无障碍撤权提醒**：系统撤回无障碍并触发提醒时，通知明确引导用户先在手机管家 / 安全中心将小猫专注设为信任或加入白名单，再重新开启无障碍。展开通知可查看完整提示。已授权的「使用情况访问 + 悬浮窗」可继续支持日常应用限制。
   - **OPPO / ColorOS 自启动与锁卡**：「自启动」用于避免系统拦截通知监听与后台服务绑定。「最近任务锁卡」仅防底部一键清除，手动单卡上滑仍会清理应用。日常退出建议按 Home 或返回键。

10. **轻看护与原生呈现（v2）**
   - `LeaveAppWatcher` 只由 `MainActivity.onStop` 发起离开判定，适用于开启轻看护且正在运行的专注。熄屏、锁屏、通话、有效白名单或临时放行、应用发起的授权设置跳转均豁免。亮屏离开且未豁免时启用 10 秒返回窗口，及时返回则继续计时。超时由原生会话结算为 `early` / `left_app`。学霸遮挡优先拦回，避免重复记账。独立锁机和休息不进入养成结算。
   - 屏幕常亮沿用原生 `FLAG_KEEP_SCREEN_ON`。离线白噪音播放期间，`FocusKeepAliveService` 同时使用 `specialUse|mediaPlayback`，维持锁屏播放，耳机断连时暂停以免改走扬声器。锁屏通知上的暂停、继续、结束依原生严格倒计时权限启用。
   - `FocusBlockOverlay` 采用 `#FFFFFF` 背景、`#F5F5F5` 次级面、`#222222` 主文字、`#EF4E36` 强调、tabular `Nunito` 数字和本轮上阵动物插画。专注待机 `/focus` 且无活动会话时强制抑制遮罩。活动学霸专注或锁机的拦截、安全出口、白名单和故障恢复继续遵循 ADR 0004。

### 2.3 `GLOSSARY.md` 术语契约与禁用词表

#### A. 禁用词与禁入主屏工程术语表
1. **`GLOSSARY.md` 明确 `_Avoid_` 禁用词**（学生界面严禁出现）：
   - `大主题模块` → 用 `待办主题` / `主题`
   - `子日程` → 用 `子待办` / `待办`
   - `番茄数` / `番茄钟`（泛指计时过程）→ 用 `专注` / `专注次数`
   - `待办完成` / `已完成`（**含 `FocusView.vue:151` 现存错误文案 `本次专注已完成`**）→ 用 **`本次专注正常结束`** / `提前结束` / `中断`（`子待办` 无完成状态）
   - `临时待办` → 用 `自由专注`
   - `应用限制模式` / `设备所有者模式` / `系统冻结` / `关闭屏幕` / `锁定系统密码` → 用 `专注限制` / `学霸模式` / `锁机`
   - `后台诊断` → 仅在二级/三级设置中使用 `权限与保护状态`
   - `计划时长` / `总跨度`（指代实际运行时间）→ 用 `实际专注时长`
   - `正计时手动结束` / `失败` → 正计时主动结束用 `正常结束`，倒计时主动提前结束用 `提前结束`
   - `自然年度周数` → 用 `教学周`
   - `金币` / `经验值` / `等级` → 用 `好感`，唯一养成数值。审计继续防止旧 `小猫物品`、`成长形态` 文案回归。
   - `主宠` / `装备宠物` → 用 `上阵动物`，包含 `随机出场`。
   - `猫窝商店` / `家园等级` → 用 `一周农场`，按自然周浏览养成的小动物。
   - `系统强锁` / `无障碍拦截` → 用 `轻看护`，指无需高级权限的离开超时保护。
   - `修改历史记录时长` → 用 `手动补录`，新增遗漏时段。
   - `待办备注` → 单条专注记录的回顾用 `复盘小结`。
   - `结束提示音` → 专注期间的离线环境音用 `白噪音`。`结束提示音` 适用于专注结束铃声（`preferences.sound`），因此保留该设置文案。
   - `赛季通行证` / `排行榜头衔` → 用 `成就徽章`。
2. **主屏禁入工程/遥测黑话**（仅允许出现在 `/permissions`、`/help`、`/recovery` 诊断明细）：
   - `状态异常`、`检查中`、`待连接`、`待生效`、`已撤销`、`已失效`（顶栏 `studyDisplay` 芯片）
   - `监听未连接`、`重连通知监听`、`滚动租期`、`暂缓`、`待核实 X 条`、`已观察原通知恢复`、`已撤回或当前不存在`、`释放失败`、`不存在不等于已恢复`
   - `恢复责任`、`本轮记账`、`原壁纸状态`、`待准备原壁纸状态`、`本轮快照`、`原生检查拦截`、`普通管理员`、`设备所有者`、`资料所有者`
   - `升级恢复副本`（禁止放在一级 `我的` 页面）

#### B. 13 项学生端文案合规替换对照表

| # | 现状文案与位置 | 问题 | 合规学生文案（`GLOSSARY.md` + `ux-spec.md`） | 目标位置 |
|---|---|---|---|---|
| 1 | `学霸模式 · 待授权/状态异常/待连接/已失效/已撤销`（`TasksView.vue:324`） | 顶栏暴露 10 种底层状态 | `学霸` 胶囊显示开关状态，授权说明和处理入口归入 `StudyModeSheet` | `FocusView` 待机顶栏 |
| 2 | `StrictStartConfirmation` + `ProtectionStartSummary` 全部诊断文案 | 每次开始弹窗拦截并倾倒诊断字段 | **从普通开始移除**；严格倒计时提示统一内聚于设置开关，异常时仅提示单层错误恢复 | 已从正常开始路径移除 |
| 3 | `本次专注已完成`（`FocusView.vue:151`） | 违反 `GLOSSARY.md:29`（禁用 `待办完成`） | **`本次专注正常结束`**（搭配 `提前结束` / `专注已中断`） | `FocusView` 结果页 |
| 4 | `临时放行剩余 X 次 · package · 剩余 ...` / `本轮应用限制已撤销`（`FocusView.vue:112-123`） | 专注主画面出现包名与调试遥测 | **从专注主画面移除**；仅保留模式、计时、标题与 `专注进行中` / `已暂停` | `FocusView` |
| 5 | `待核实 X 条 · 已观察原通知恢复 Y 条...` / `撤销本轮声音辅助`（`FocusView.vue:188-189`, `LockView.vue:152`） | 将通知/勿扰底层调试面板直接挂在专注/锁机屏 | **从 `FocusView` 与 `LockView` 移除**；状态与重连收进 `/permissions` 与 `/recovery` | `/permissions`、`/recovery` |
| 6 | `StudyModeSheet` 主页 13+ 控件与底部 `权限与状态/使用帮助/故障恢复` | 首屏过载、工程链接堆积 | 主开关卡片 + 3 个模块行 + 1 个安静入口 `权限与使用帮助 ›` + `完成` CTA | `StudyModeSheet` `home` |
| 7 | `应用限制` 内嵌套 `AppWhitelistEditor` 与技术文案 | 弹窗套弹窗且术语偏技术 | `限制白名单外应用` / `允许临时放行（每轮 3 次）` / `白名单应用（N 个已选 ›）`（弹窗内切换） | `StudyModeSheet` `apps` |
| 8 | `严格模式` 平铺 6 开关 + 5 个重复 `! 待授权` 提示 | 底层防绕过开关噪音极高 | 首屏 3 项核心 + 1 个折叠 `▸ 进阶防绕过` + 顶部单条统一缺失权限条 | `StudyModeSheet` `strict` |
| 9 | `免打扰` 混用 `暂缓`、`监听未连接` | 暴露系统监听内部术语 | `静音与振动`、`拦截通知，结束后释放（不保存正文）`、`白名单应用通知照常显示` | `StudyModeSheet` `quiet` |
| 10 | `新建/编辑待办` 12 项决策 + `<details>规则说明</details>` | 添加待办步骤冗余 | 核心 4 项 + 折叠 `▸ 更多设置（备注 · 独立白名单 · 顺序）` + 主按钮 `保存并开始` | `TasksView` `item` |
| 11 | `我的` 根目录 `权限与保护状态` / `升级恢复副本` / `使用帮助` / `故障恢复` | 工程页面占领个人中心根目录 | 根目录收拢为 `高级保护与诊断 ›`（`/permissions` 四 Tab 中心）与 `检查更新与关于` 内的子视图 | `SettingsView` |
| 12 | `主界面入口：本轮已恢复普通入口 / 本轮只进入锁机控制`（`LockView.vue:138`） | 直接输出内部状态枚举句 | `锁机时限制返回主页`（在锁机折叠高级设置中），锁机运行中仅保留简洁状态 | `LockView` |
| 13 | `恢复状态：待撤销 / 已恢复 / 恢复失败 / 系统受限`（`RecoverySheet.vue:11`） | 工程状态词 | 保留在 `/recovery` 内部并使用通俗中文：`可恢复` / `已恢复` / `未恢复，可重试` / `受系统限制` | `/recovery` |

### 2.4 显式文档冲突日志（遵循 `docs/agents/domain.md:15`）

| 冲突编号 | 冲突文档 | 冲突内容 | `docs/ux-spec.md` 裁决 |
|---|---|---|---|
| **C1** | `focus-control-spec.md:41-50` & `focus-control-ui-proposal.md:29-30` **vs** `study-mode-redesign.md` & `ADR 0004 (2026-11-21)` & R1–R3 | 旧提案在 `StudyModeSheet` 平铺 3 开关 + 6 增强 + 白名单 + 诊断，且在 `TasksView` 顶栏显示 `studyDisplay`。 | 采纳 `1 总开关 + 3 模块` 层级与渐进披露：清除 `TasksView` 工程状态词，`StudyModeSheet` 主页 `<= 4` 决策，进阶防绕过折叠在 `strict` 内，诊断移入 `/permissions`。 |
| **C2** | `focus-control-ui-proposal.md:34`、`focus-control-spec.md:56` & **`study-mode-redesign.md:155`** **vs** R1/R2（`<= 2` 步） | 旧方案及 `study-mode-redesign.md:155` 建议每次受保护/严格专注开始前均弹出 `StrictStartConfirmation` 二次确认。 | **显式替代 `study-mode-redesign.md:155` 的每次开始前弹窗**：正常及常规保护专注 0 弹窗直达 `/focus`；严格模式的不可暂停规则在 `StudyModeSheet` 启用开关时明确告知（`restore()` / 历史迁移后首次触发 `strict && countdown` 时以单句轻量弹窗确认一次），其余连续启动由前端透传 `strictModeConfirmed`，仅在原生 `checkStart` 报错时弹出单层可恢复提示。 |
| **C3** | `focus-control-ui-proposal.md:23`（`14px` 任务卡、`26px` 弹窗）& `focus-control-ui-design.md:11`（`28px` 弹窗）**vs** `brand-spec.md:9`（`20px` 卡片圆角、`24px` 页边距、`#737378`） | `src/style.css` 与旧提案漂移为 `14–17px` 卡片圆角、`26px` `.sheet` 弹窗圆角、`clamp(16px, 5vw, 24px)` 边距与 `--muted: #66666b`。 | R4 锁定 `brand-spec.md:9`：强制全卡片、`.notice` 与 `.sheet` 弹窗圆角统一为 `20px`（`var(--radius)`）、`24px` 边距（极窄屏 `<= 340px` 回退 `16px`）、`>= 12px` 辅文、`>= 48px` 触控；色值采用 `--muted: #737378`（白底 4.72:1）+ `--muted-surface: #66666b`（`#F5F5F5` 底 5.24:1）兼顾原型锁定色与 WCAG AA 4.5:1。超窄屏（`<= 350px`）下日历 7 列周条（`.week-strip`）与月历网格（`.month-grid`）取消水平内边距（`padding-inline: 0`），确保单格宽度最大化占满 `1/7` 视口（`320px` 屏约 `45.7px`，为 7 列不横向滚动的物理上限），高度仍严格保持 `>= 48px`（周条 `72px` / 月历 `48px`），该 7 列几何受限宽度豁免记为 **Geometry-Constrained Exempt**（`width >= 42px && height >= 48px`）。 |
| **C4** | `v1-spec.md:27`（v1 不含强力锁机）**vs** `focus-control-spec.md:7` & `ADR 0004`（包含独立锁机与 `FORCE-01..06`） | 2026-11-15 需求扩展纳入锁机与 6 项增强。 | 保留 `独立锁机` 与 `FORCE-01..06` 全能力，收进二级配置与折叠高级项，保持 5 Tab 与 `CatView`（`小猫还未入驻`）不变。 |
| **C5** | `focus-control-spec.md:47, 140` **vs** `GLOSSARY.md:60` & `study-mode-redesign.md:197, 220` | 旧文档将通知拦截与声音免打扰独立于学霸模式；2026-11-21 改版将其合并为学霸下属模块。 | 遵循 `GLOSSARY.md:60` 与 `ADR 0004 (2026-11-21)`：`免打扰` 从属于 `学霸模式` 总开关。 |
| **C6** | `v1-spec.md:13` & `brand-spec.md`（底部 5 Tab 纯图标无文字）**vs** `ux-heuristics` / `critique-rubric.md:227`（建议导航图标配文字标签） | 通用启发式会扣分纯图标底栏。 | 依 `impeccable/SKILL.md:27`（"The brief wins"）与 R4，保留 5 Tab 纯图标底栏（`待办｜日历｜小猫｜统计｜我的`），强制完整 `aria-label` 与 `aria-current="page"`，在 UX Gate 中标为 **Brief-Exempt**。 |
| **C7** | `docs/references/user/task-structure.jpg` **vs** `craft-floor.md:35` & R1–R3 | 用户草图顶栏有碰撞的 `必开权限` 徽标与左侧竖色条。 | 拒绝两项反模式：顶栏不放工程徽标，卡片不用单侧 `border-left` 色条，改用主题色圆点或整圈微边。 |
| **C8** | `impeccable` `audit.md`（深色模式核查）**vs** `brand-spec.md:9, 13` | `brand-spec.md` 锁定黑白灰浅色模式且禁止伪造主题切换。 | 审计门禁中深色模式检查标为 **`N/A（Brief 锁定浅色模式）`**。 |
| **C9** | C6 旧栏名与首页 **vs** #30 及 ADR 0005 | `待办／日历／小猫` 入口和默认路由更新。 | 自 `0.3.x` 起，`/` 进入专注待机，五栏采用 §5.0。纯图标的 `aria-label`、`aria-current` 与 C6 审计豁免继续适用。待办在专注页选择器内可达，日程与课表在时间轴顶栏无损切换。 |
| **C10** | C4 的 `CatView` 占位及 C8 的浅色范围 **vs** #30 及 ADR 0005 | `小猫还未入驻` 占位迁移为自然周场景。 | 自 `0.3.x` 起按 §5.5.2 实现一周农场，独立锁机与高级配置仍遵循 C4。P0 继续采用浅色基线，深色扩展归 P1。 |
| **C11** | M2 既有计时、结算与固定五分钟休息线框 **vs** #30 及 ADR 0004/0005 | v2 新增后悔期、滑轨、养成结算、轻看护及番茄循环。 | 采用 §5.2 与 §5.6 的 v2 流程。严格倒计时保护、安全出口与会话互斥继续由原生保障。 |

---

## 3. 单层弹窗状态机与 14 条嵌套路径替换规范

### 3.1 `Sheet.vue` 与单层不变量契约

1. **全局单层不变量**：任意时刻 **`document.querySelectorAll('dialog[open]').length <= 1`**。
2. **`Sheet.vue` 单容器与增强契约**：
   - **单 `<Sheet>` 容器规则**：由于 `Sheet.vue:37` 使用 `<Transition name="sheet-motion" @after-leave="releaseDialog">`（离场动画 `120ms` 后才关闭 `<dialog>`），同一页面内的多视图切换（如 `TasksView` `theme`↔`removeTheme`/`item`↔`itemWhitelist`、`CalendarView` `detail`↔`adjust`/`event`/`course`、`SettingsView` `about`↔`backups`、`StatisticsView` `list`↔`detail`、`LockView` `draft` 的 `form`↔`whitelist`/`enhancements`）**必须复用同一个 `<Sheet>` 容器并通过 `v-if` 切换内部主体与 `title`/`backLabel`**；禁止并列书写多个 `<Sheet v-if="...">`，否则离场 `120ms` 内 DOM 会瞬时出现 `2` 个 `dialog[open]`。
   - 新增可选属性 `backLabel?: string` 与事件 `back: []`。当传入 `backLabel` 时，吸顶 `.sheet-header` 左侧渲染 `>= 48px` 返回按钮（`‹ {backLabel}`），右侧保留 `48×48px` 关闭按钮（`×`）。
   - 在开发/测试环境下，当 `<Sheet>` 调用 `showModal()` 前若检测到 `document.querySelectorAll('dialog[open]').length > 0`，立即通过 `console.error('[ux-spec] Nested <dialog> detected')` 报警（测试期可视为断言失败），从基础设施层杜绝回归。
3. **`App.vue` 抢占关闭协调**：
   - 当 `App.vue` 收到后台通知或事件 `open-recovery`、`recovery-return-request`（含冷启动 `consumeRecoveryReturn()`）准备打开 `RecoverySheet` 前，必须先通过全局关闭信号/store 标记关闭当前页面上任何已打开的本地 `<Sheet>`，确保不与后台恢复弹窗叠层。
4. **`AppWhitelistEditor.vue` `inline` 模式**：
   - 新增可选属性 `inline?: boolean`（默认 `false`）。当 `inline === true` 时，直接渲染搜索框、系统应用开关、应用列表与 `确认白名单` 主按钮，**不再包裹 `<Sheet>`**，从而被 `TasksView`（`'itemWhitelist'`）、`StudyModeSheet`（`'whitelist'`）、`LockView`（`draft` 的 `'whitelist'`）无缝嵌入单层弹窗中。
5. **先关闭后跳转（Close-Before-Navigate）规则**：
   - 弹窗内任何触发路由跳转（如 `/permissions`、`/help`、`/recovery`、`/focus`）或全局弹窗（如 `open-recovery`）的操作，**必须先置空/关闭当前 `<Sheet>`**（并在需要时等待关闭完成），再执行 `router.push` 或派发事件。
6. **弹窗内联二次确认（Inline Confirmation）**：
   - 取消弹窗内调用 `ConfirmationDialog`（会打开第二个 `<dialog>`）；改为在当前 `<Sheet>` 底部或冲突区域内原位切换为两步确认条（如 `确认删除？[取消] [确认删除]` 或日程重叠提示条 `[调整时间] [仍然保存]`）。

### 3.2 全量 14 条嵌套弹窗路径替换矩阵

| # | 所属文件 | 原嵌套弹窗路径（Before） | 单层替换方案（After，0 嵌套 `<dialog>`） |
|---|---|---|---|
| **1** | `TasksView.vue` | `sheet === 'item'` → 打开 `AppWhitelistEditor` | 同一个 `<Sheet>` 内切换状态 `sheet = 'itemWhitelist'`（带 `‹ 编辑待办` 返回头 + `<AppWhitelistEditor inline />`），保留 `itemForm` 草稿。 |
| **2** | `TasksView.vue` | `sheet === 'item'` → 点击删除弹出 `ConfirmationDialog` | 在 `'item'` 底部切换内联确认状态 `itemDeleteConfirm = true`（或切至 `sheet = 'itemDeleteConfirm'`），显示 `[取消] [确认删除]`，**删除 `TasksView` 中的 `ConfirmationDialog` 调用**。 |
| **3** | `TasksView.vue` | `sheet === 'free'` → 点开始触发 `StrictStartConfirmation` | 点击 `开始专注` 时**先执行 `sheet = null`**，随后调用 `app.start()`；`StrictStartConfirmation` 已从正常启动路径移除。 |
| **4** | `StudyModeSheet.vue` | `StudyModeSheet` → 打开 `permissionHelp` `<Sheet>` | 同一个 `<Sheet>` 内切换视图 `view = 'permissionGuide'`（与路径 5 合并为统一授权引导页，带 `‹ 学霸模式`）。 |
| **5** | `StudyModeSheet.vue` | `StudyModeSheet` → 打开 `guideOpen` `<Sheet>` | 同上，合并为单层弹窗内视图 `view = 'permissionGuide'`。 |
| **6** | `StudyModeSheet.vue` | `StudyModeSheet` → 打开 `wallpaperConsentOpen` `<Sheet>` | 同一个 `<Sheet>` 内切换视图 `view = 'wallpaperConsent'`（保留两项知情勾选，确认后返回 `view = 'strict'`）。 |
| **7** | `StudyModeSheet.vue` | `StudyModeSheet` → 打开 `AppWhitelistEditor` | 同一个 `<Sheet>` 内切换视图 `view = 'whitelist'`（嵌入 `<AppWhitelistEditor inline />`，确认后返回 `view = 'apps'`）。 |
| **8** | `StudyModeSheet.vue` | `StudyModeSheet` → 触发 `open-recovery` 打开 `RecoverySheet` | 点击 `故障恢复` 时**先执行 `emit('close')` 关闭 `StudyModeSheet`**，再跳转 `/recovery` 或派发 `open-recovery`。 |
| **9** | `CalendarView.vue` | `sheet === 'event'` → 时间冲突弹出 `ConfirmationDialog` | 在 `'event'` 表单内底部渲染内联冲突警示横幅（`"与《xxx》时间重叠"` + `[调整时间]` / `[仍然保存]`）。 |
| **10** | `CalendarView.vue` | `sheet === 'detail'` → 删除日程/课程弹出 `ConfirmationDialog` | 在 `'detail'` 底部切换内联 `confirmDelete: 'once' \| 'all' \| null` 确认条（`[取消]` / `[确认删除]`）。 |
| **11** | `CalendarView.vue` | `sheet === 'detail'` → `startFromEvent()` 触发 `StrictStartConfirmation` | **先执行 `sheet = null`** 再调用 `app.start()`，且正常开始不弹 `StrictStartConfirmation`。 |
| **12** | `SettingsView.vue` | `sheet === 'sound'` → 点击 `InfoHint` 打开第二个 `<Sheet>` | 移除 `sound`（及根目录 `本地数据`）内的 `InfoHint` 弹窗，改为直接展示简洁的 `<p class="field-help">` 内联说明文字。 |
| **13** | `LockView.vue` | `draft` `<Sheet>` → 打开 `AppWhitelistEditor` | 在 `draft` `<Sheet>` 内建立视图栈 `draftView: 'form' \| 'whitelist' \| 'enhancements'`，通过 `‹ 返回配置` 在同一个 `<Sheet>` 内编辑白名单。（注：`LockMainEntrySetting.vue` 中的 `InfoHint` 同步改为内联 `<p class="field-help">`。） |
| **14** | `StatisticsView.vue` | `selected` `<Sheet>` → 删除记录弹出 `ConfirmationDialog` | 将 `showRecords` 与 `selected` 合并为单个记录弹窗 `recordView: 'list' \| 'detail'`，并在 `'detail'` 底部使用内联 `confirmDelete` 确认条替换 `ConfirmationDialog`。 |

---

## 4. 三层渐进披露地图与能力重定位矩阵

### 4.1 三层信息架构

| 层级 | 路由 / 入口 | 面向用户的可见范围 | 承载的减法后能力 |
|---|---|---|---|
| **Tier 1：学生日常主面** | `/focus`、`/tasks`、`/rest`、`/calendar`、`/cat`、`/statistics`、一级 `/settings` | 待机与一键开始、待办管理、计时与休息、时间轴与日程/课表、一周农场、今日/本周统计、按组收纳的个人设置。 | **0** 工程状态词、**0** 运行时通知/勿扰遥测面板、**0** 启动前诊断拦截、**0** `升级恢复副本` 根目录入口。 |
| **Tier 2：学生二级配置** | `StudyModeSheet`、`/lock`（`LockView`）、`SettingsView` 各单层弹窗 | **学霸模式主页**：总开关 + 3 模块（`应用限制`/`严格模式`/`免打扰`）+ `权限与使用帮助 ›`；<br>**独立锁机**：预设列表 + 新建/编辑 + 折叠 `锁机高级设置`；<br>**我的弹窗**：默认时长、提醒与声音、本地备份与恢复、检查更新与关于。 | • `StudyModeSheet` → `apps` → `whitelist`（弹窗内白名单）<br>• `StudyModeSheet` → `strict` → 折叠 `▸ 进阶防绕过`（`FORCE-04/05/06` + `wallpaperConsent`）<br>• `StudyModeSheet` → `permissions` / `permissionGuide`<br>• `LockView` `draft` → `whitelist` / `enhancements`（6 项增强弹窗内子视图）<br>• `LockMainEntrySetting`（`lockMainInterfaceRestricted`）保留在 `LockView` 折叠高级区<br>• `UpdateSettings` `升级恢复副本` 收进 `检查更新与关于` 子视图 |
| **Tier 3：高级保护、诊断与 ADR-0004 安全中心** | `/permissions`、`/help`、`/recovery`、`/emergency`（`ProtectionHelpView.vue`） | 4-Tab 专业中心（`权限状态 \| 离线帮助 \| 故障恢复 \| 紧急交互`，单行可横滑），可从 `SettingsView → 高级保护与诊断`、`StudyModeSheet → permissions`、`FocusSafetySheet (⋯)`、`LockView → 遇到问题？` 与系统通知入口进入。 | • `ProtectionDiagnostics.vue`（折叠 `状态含义与检查说明` + 9 项能力 × 8 行 `<dl>` + `重新检查` + 单层用途/授权弹窗）<br>• `RecoverySheet.vue`（全局 `open-recovery` 入口）与 `/recovery` 页内直接渲染的恢复清单（`previewRecovery` / `confirmRecovery` / 壁纸恢复）<br>• `DndSetting` / `NotificationSetting` 的监听重连与故障恢复操作<br>• 8 节离线帮助与 `tel:` 紧急拨号 |

### 4.2 能力重定位总表（保证 0 能力丢失）

| 原能力 / 组件 | 原位置（Before） | 重定位目标（After） | 原生边界与可达性 |
|---|---|---|---|
| `FORCE-01` (`noPauseEnd`) | `StudyModeSheet` `strict` 平铺第 1 项 | `StudyModeSheet` → `strict` 首屏第 1 项（仅倒计时生效） | `resolveEffectiveProtection` 保留 |
| `FORCE-02` (`navigationHomeRecents`) | `StudyModeSheet` `strict` 平铺 + 重复告警 | `StudyModeSheet` → `strict` 首屏第 2 项（顶部单条缺失权限提示） | `resolveEffectiveProtection` 保留 |
| `FORCE-03` (`preciseAntiClose`) | `StudyModeSheet` `strict` 平铺 + 重复告警 | `StudyModeSheet` → `strict` 首屏第 3 项（顶部单条缺失权限提示） | `resolveEffectiveProtection` 保留 |
| `FORCE-04` (`recentTasksHidden`) | `StudyModeSheet` `strict` 平铺第 5 项 | `StudyModeSheet` → `strict` → 折叠 `▸ 进阶防绕过` 第 1 项 | 如实文案，不宣称系统强停免疫 |
| `FORCE-05` (`launcherIconHidden`) | `StudyModeSheet` `strict` 平铺第 6 项 | `StudyModeSheet` → `strict` → 折叠 `▸ 进阶防绕过` 第 2 项 | 保留控制通知找回说明 |
| `FORCE-06` (`wallpaperProtection`) | `StudyModeSheet` `strict` 第 7 项 + 嵌套弹窗 | `StudyModeSheet` → `strict` → 折叠 `▸ 进阶防绕过` 第 3 项 → 弹窗内 `wallpaperConsent` | 保留 2 项知情勾选与壁纸恢复 |
| `lockMainInterfaceRestricted` | `LockView.vue`（`LockMainEntrySetting`） | **继续留在 `LockView.vue`** 折叠 `锁机高级设置与历史` 内（去除 `InfoHint` 嵌套弹窗） | 严格遵守 `ADR 0004:16`，绝不放入学霸模式 |
| `StrictStartConfirmation` | 每次受保护 `app.start()` 强拦截 | 从正常启动移除；仅在未跨生命周期确认的 `strict && countdown`（如备份恢复/历史迁移后）弹单句确认；`startFocus` 异常时在 4 个调用方（`TasksView`/`CalendarView`/`FocusView`/`RestView`）统一弹出单层恢复提示 | 兼容 `FocusControl.java:186-231` |
| `ProtectionStartSummary` | 嵌入 `StrictStartConfirmation` 与 `LockView` `starting` | M2 从专注启动分离；M3 从 `LockView` `starting` 移除后退休 | 全诊断保留在 `/permissions` |
| `DndSetting` (`runtime-only`) | 直接挂载于 `FocusView.vue:188` | 从 `FocusView` 移除；设置留在 `StudyModeSheet` `quiet`，运行恢复在 `/permissions` 与 `/recovery` | 保留 `dndDriver` 3 方法 |
| `NotificationSetting` (`runtime-only`) | 挂载于 `FocusView.vue:189` 与 `LockView.vue:152` | M2 从 `FocusView` 移除、M3 从 `LockView` 移除；设置留在 `StudyModeSheet` `quiet`，监听重连/释放诊断在 `/permissions` 与 `/recovery`（**M3 须在 `ProtectionDiagnostics.vue` `notifications` 卡片内暴露 `重连通知监听` `notificationDriver.rebind()`，条件为 `authorized && !connected`**） | 保留 `notificationDriver` 3 方法 |
| `ProtectionDiagnostics` | 由 `TasksView`/`StrictStartConfirmation` 1 步直跳 | 二级/三级路由 `/permissions`（从 `SettingsView`、`FocusSafetySheet`、`StudyModeSheet` 可达） | 保留 `readProtectionDiagnostics` |
| `RecoverySheet` | 嵌套于 `StudyModeSheet` 且在 `/recovery` 自动弹出 | `/recovery` 页内直接渲染清单；`RecoverySheet` 仅响应全局 `open-recovery`（关闭前置弹窗后打开） | 保留 `previewRecovery`/`confirmRecovery` |
| `UpdateSettings` `升级恢复副本` | 直接暴露在 `SettingsView` 根目录 | 收进 `SettingsView` → `检查更新与关于` 弹窗内子视图（及 `/permissions` 入口） | 保留全部 `AppUpdates` 9 方法 |

---

## 5. 全视图与弹窗线框图、减法清单及预算校验

### 5.0 五栏导航与通用验收

```text
根路由 / --> /focus 待机
已有活动会话 / 安全返回 --> 按 ADR 0004 恢复目的地
+-----------+---------------+----------+----------------+---------------+
| 专注      | 时间轴        | 农场     | 统计           | 我的          |
| /focus    | /calendar     | /cat     | /statistics    | /settings     |
+-----------+---------------+----------+----------------+---------------+
```

- 图中栏名为导航命名和图标按钮的 `aria-label`，激活项标记 `aria-current="page"`。五栏用线性图标与 C6 的纯图标约定。待办和休息由对应主流程入口访问。正在进行的学霸专注须保留原生路由锁定与安全出口。
- 第一眼最多 4 组决策、1 个 `.primary`。同一组的重复列表和互斥选项以一个明确的用途分组。低频操作进入当前容器的子视图、折叠区或二级路由。
- 各视图与面板统一使用 `20px` 卡片圆角和 `24px` 页面边距（`<= 340px` 屏幕使用 `16px`）。所有操作热区 `>= 48×48px`，辅文 `>= 12px`。C3 的几何豁免仅用于极窄屏原有日历七列。
- Dual-Slate AA 按 §6 使用白底 `--muted: #737378`、灰底 `--muted-surface: #66666b`。所有输入采用 A 方案，常态 `#F5F5F5` 底和 `1.5px #ECECEE` 边框，聚焦改为 `#FFFFFF` 底和 `1.5px #838388` 边框，控件尺寸保持一致。
- 页面内多视图复用单个 `<Sheet>`，用返回标题返回上一级草稿。路由跳转、新全局面板与系统文件选择器在关闭当前面板后进入。验收包含开关动画期间 `dialog[open] <= 1`、键盘焦点返回触发点及减少动态效果。

### 5.1 `TasksView.vue`（空态、有待办态、`theme`、`removeTheme`、`item`、`itemWhitelist`、`itemDeleteConfirm`、`free`）

#### A. 线框图

**1. 空态（`!app.themes.length`）**
```text
┌────────────────────────────────────────────────────────┐
│ 待办   [ 🛡 学霸模式 · 关 › ]          [ ⏱ ]   [ ＋ ] │  ← 单区状态胶囊(防误触直进设置) + 自由专注(timer) + 新建主题
│ 11月22日 周日                          今日专注 0分钟 │
│                                                        │
│                    ┌──────────────┐                    │
│                    │   [tasks]    │                    │
│                    └──────────────┘                    │
│                     现在就开始专注                     │
│               不用先分类，点一下就能计时               │
│                                                        │
│            ( ▶  开始 25 分钟专注 )                     │  ← 唯一主 CTA (#222222 胶囊, 1 步直达 /focus)
│            ( ＋ 创建第一个待办   )                     │  ← 次按钮 (#F5F5F5 胶囊, 预设主题"日常学习"免填直开)
│                                                        │
│          例如「英语 → 背单词」，点一下就能开始          │
├────────────────────────────────────────────────────────┤
│  [专注]     [时间轴]    [农场]     [统计]     [我的]    │
└────────────────────────────────────────────────────────┘
```

**2. 有待办态（`app.themes.length > 0`）**
```text
┌────────────────────────────────────────────────────────┐
│ 待办   [ 🛡 学霸模式 · 开 › ]          [自由专注] [＋] │  ← 单区胶囊直进配置 + 自由专注(timer) + 新建主题
│ 11月22日 周日                        今日专注 1小时25分 │
│ ┌────────────────────────────────────────────────────┐ │
│ │ ● 正在专注「背单词」          12分30秒  ›          │ │  ← 仅存在进行中会话时显示
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ ● 英语  ⌄                                [ ＋ ] [ ⋯ ] │  ← 主题行：折叠 + 添加待办 + 编辑主题
│ ┌────────────────────────────────────────────────────┐ │
│ │ 背单词                                        ( ▶ )│ │  ← 20px 圆角卡片；点击主区 = 1 步直接开始！
│ │ 倒计时 · 25 分钟 · 今日 1 次，25 分钟         │ ⋯  │ │  ← 右侧 48px 编辑热区
│ └────────────────────────────────────────────────────┘ │
│ ┌────────────────────────────────────────────────────┐ │
│ │ 练听力                                        ( ▶ )│ │
│ │ 正计时                                        │ ⋯  │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ ● 数学  ›                                [ ＋ ] [ ⋯ ] │
├────────────────────────────────────────────────────────┤
│  [专注]     [时间轴]    [农场]     [统计]     [我的]    │
└────────────────────────────────────────────────────────┘
```
*顶栏 `学霸模式` 单区状态胶囊三态与防误触 2 步开关规则*：
- **单区入口**（总决策组计 1 组，`>= 48px` 高/宽热区，彻底消除困倦单手误触）：点击打开单层 `StudyModeSheet`（关闭/开启态进 `'home'`，警示态直达 `'permissions'`）；在 `StudyModeSheet` 内拨动总开关即可 2 步完成开/关切换。
- **三态外观**：关闭态 `学霸模式 · 关`（`#F5F5F5` 底 `#66666b` 字 + `1px solid var(--line)` 微边界）；开启就绪态 `学霸模式 · 开`（`#222222` 底 `#FFFFFF` 字）；开启但原生缺权限态 `学霸模式 · 待授权`（`#FFF1EF` 底 `#C13A25` 字）。

**3. `TasksView` 单层弹窗栈（单 `<Sheet>` 容器切换：`theme` / `removeTheme` / `item` / `itemWhitelist` / `free`）**
```text
[Sheet: theme]                         [Sheet: removeTheme] (同 <Sheet> 切换)
┌ 编辑主题 ────────────────────── × ┐  ┌ ‹ 编辑主题  删除主题 ──────── × ┐
│ 主题名称                           │  │ 删除“英语”后，历史专注记录仍保留。│
│ [ 英语                           ] │  │ 这个主题里有 2 个待办，怎么处理？   │
│ 主题颜色                           │  │ (○) 移到其他主题  [ 数学 ⌄ ]      │
│ (●) ( ) ( ) ( ) ( ) ( )            │  │ (○) 一并删除这 2 个待办           │
│ 调整顺序                [ ↑ ] [ ↓ ]│  │                                   │
│ [            保存主题            ] │  │ [       删除主题和 2 个待办     ] │
│               删除主题             │  └───────────────────────────────────┘
└────────────────────────────────────┘

[Sheet: item] (首屏仅 4 个表单分组)    [Sheet: itemWhitelist] (同 <Sheet> 切换)
┌ 新建待办 ────────────────────── × ┐  ┌ ‹ 编辑待办  子待办独立白名单 ─ × ┐
│ 1.待办名称                         │  │ [ 🔍 搜索应用（名称或包名）     ] │
│   [ 背单词                       ] │  │ 显示系统应用                (━○) │
│ 2.计时设置  [ 倒计时 | 正计时 ]    │  │ 已选 3 个应用                     │
│   时长(分)  [ 25 ]   [25] [45] [60]│  │ [✓] 微信               com.tencent│
│ 3.所属主题  [ 英语 ⌄ ]             │  │ [ ] 哔哩哔哩            tv.danmaku│
│   (无主题时预填"日常学习"+快捷胶囊)│  │ [          确认白名单           ] │
│ 4.▸ 更多设置（备注 · 独立白名单 · 顺序）└───────────────────────────────────┘
│   (展开: 备注 / 跟随全局或独立白名单)
│ ! 若存在 blocker，提示并禁用保存并开始，改以 [保存待办] 为主按钮
│ [           保存并开始           ] │  ← 先 sheet=null 再 app.start()
│                仅保存              │  ← 编辑态主按钮为 [ 保存待办 ] + 删除待办
│ (删除内联确认: 确认删除？[取消][删除])│  ← 0 嵌套 ConfirmationDialog
└────────────────────────────────────┘

[Sheet: free] (自由专注)
┌ 自由专注 ────────────────────── × ┐
│ [ 倒计时 | 正计时 ]                │
│ 专注时长（分钟）                   │
│ [ 25 ]   [ 25 分钟 ] [ 45 ] [ 60 ] │
│ [           ▶ 开始专注           ] │  ← 先 sheet=null 再 app.start()，失败转视图级恢复弹窗
└────────────────────────────────────┘
```
- **空态首建 `newThemeMode`（`!app.themes.length`）与 `blocker` 护栏**：当 `app.themes.length === 0` 点击 `创建第一个待办` 时，`newThemeName` **默认预填 `"日常学习"`**（并提供 `[日常学习] [英语] [数学] [阅读]` 快捷胶囊，允许直接留用或改名），学生只需输入待办名称即可 2 步完成 `保存并开始`；新建待办打开后名称输入框自动聚焦；若当前存在 `blocker`（已有专注/休息/锁机进行中），`item` 弹窗内展示 `blocker.text` 单行提示并将主按钮切换为 `保存待办`（禁用或隐藏 `保存并开始`），防止保存后启动报错。

#### B. 减法清单与预算校验

`/tasks` 从 `/focus` 的待办选择器进入。保留待办主题及子待办创建、编辑、删除、排序、启动和独立白名单。待办管理返回专注待机，按钮可直接启动已有子待办，正在进行会话的入口继续可达。此页和各编辑面板均继承 §5.0 的触控、字号、色值与输入框规则。

| 元素（Before） | 动作 | 调整后（After） |
|---|---|---|
| `studyEntry` + `studyDisplay` 10 态工程词 + `11px` 字号 | **移除替换** | 单区状态胶囊：`学霸模式 · 关` / `学霸模式 · 开` / `学霸模式 · 待授权`（盾牌图标 + 右箭头，直进 `StudyModeSheet` 防误触，`>= 12px`，`>= 48px`）；自由专注改用 `timer` 图标 |
| 底部重复 `新建主题`（`489`）与 `自由专注`（`492`） | **移除** | 仅保留顶栏单一入口（空态保留居中 1 主按钮 + 1 次按钮） |
| `.blocker-hint`（`373`）重复说明段 | **移除** | 由 `.ongoing` 单条提示条直接承载 |
| `item` 内独立分组过多 + 2 个折叠面板 + `<details>规则说明</details>` | **合并简化** | 合并 `计时方式` + `时长` 为 `计时设置`，首屏共 `4` 组表单（`待办名称`、`计时设置`、`所属主题`、`▸ 更多设置`），规则简化为 1 行 |
| 新建 `item` 仅 `保存待办` 且 `!app.themes.length` 主题为空阻塞 | **升级预填** | 首屏主 CTA = `保存并开始`（默认预填 `"日常学习"`，无 `blocker` 时 2 步直达 `/focus`；有 `blocker` 时退回 `保存待办`） |
| `AppWhitelistEditor` / `ConfirmationDialog` / `StrictStartConfirmation` 3 条嵌套路径 | **消除** | 同 `<Sheet>` 内切换 `itemWhitelist` + 内联删除确认 + 先关弹窗后启动（异常转视图级恢复弹窗） |

- **预算校验**：主视图第一眼主 CTA `<= 1`（空态 1 / 有待办 0），顶栏+列表决策组 `<= 4`；`item` 等所有子弹窗均 `1` 主 CTA、`<= 4` 首屏表单/决策组、`0` 嵌套弹窗。

---

### 5.2 `FocusView.vue`（`/focus`）与 `RestView.vue`（`/rest`）

#### A. 专注待机与快捷面板

```text
+--------------------------------------------------------------+
| [自由专注 v]                            [盾牌 学霸] [音符]    |
|                      （上阵动物）                             |
|                       [换伙伴 >]                             |
|                          25:00                               |
|                   倒计时 · 滑动调时长                         |
|                 [15] [25] [45] [60] [正计时]                  |
|                      [ 开始专注 ]                            |
+--------------------------------------------------------------+

+-- 选择待办 ------- x +  +-- 白噪音 ---------- x +  +-- 换伙伴 -------- x +
| [管理全部待办 >]     |  | [关闭]    [雨声]      |  | 好感 35             |
| 自由专注      [开始] |  | [鸟鸣]    [溪流]      |  | [随机出场]          |
| 英语                 |  | [篝火]    [海浪]      |  | [小黑猫] [小黄鸡]  |
| 背单词        [开始] |  | 音量 [---o----] 60%   |  | （12 只，可滚动）   |
| 练听力        [开始] |  |                      |  | [所选动物的毛色 >]  |
+----------------------+  +----------------------+  +---------------------+
```

- 待办按主题分组。点行名称切换待机选项并返回。行尾次级 `开始` 用可访问名称标明关联项，点按后直接启动。首次无选择时显示自由专注。管理入口先关 Sheet，再到 `/tasks`，返回时保留选择。
- 点动物触发蹦跳和短气泡，减少动态效果时保留静态反馈。换伙伴胶囊单独打开 12 只动物和随机出场名册，选中后可在同一个 Sheet 进入毛色视图。小黑猫和小黄鸡各三款毛色，锁定项显示解锁条件。
- 数字热区滑动调时 `5–180` 分钟，每 `18px` 步进 5 分钟，低于最小档切为正计时。标记 `data-tab-swipe-ignore`，快捷分钟条可由键盘聚焦或触屏展开，含正计时入口。
- 学霸开关进入 §5.3 的 `StudyModeSheet`。白噪音在单 Sheet 选 5 首离线曲目或关闭，音量独立为 `0–100%`。待办、学霸、白噪音与名册/毛色遵循 §3 排他打开契约。启动锁定本轮动物与毛色，异常遵循 §2.2。独立锁机入口保留在 `我的`。

#### B. 运行与结算

```text
+-- 背单词 ------------------------------------------- [ ... ] -+
|                       （本轮动物）                            |
|                          24:52                               |
|                        专注进行中                            |
|        <10 秒      [取消]           [暂停]                   |
|        >=10 秒     [<< 左滑放弃]    [暂停]                   |
|        已暂停      [<< 左滑放弃]    [继续]                   |
|        正计时      [结束]           [暂停 / 继续]             |
|        严格倒计时  （保留安全菜单）                           |
+--------------------------------------------------------------+

+-- 专注正常结束 -------------+   +-- 提前结束 ----------------+
|       （成体插画）           |   |        （翻车插画）         |
|        25 分钟               |   | 完蛋！你的{动物名}挂了      |
|    好感 +5 · 农场 +1 只      |   |        好感 -5              |
| 复盘小结 [写一句小结     ]   |   | 复盘小结 [记一句打断原因 ]  |
|                     0 / 100 |   | [回消息] [刷视频]           |
| [ 休息 {restMinutes} 分钟 ]  |   | [临时有事] [走神了]          |
| [返回首页]                  |   | [ 返回首页 ] [重新开始]     |
+-----------------------------+   +----------------------------+

+-- 专注辅助与安全出口 --- x +
| 紧急与必要交互          > |
| 故障恢复                > |
| 权限与保护状态          > |
| 使用帮助                > |
+---------------------------+
```

- 倒计时按进度 `0–33%`、`33–75%`、`75–100%` 显示三阶段成长，正计时按 `0–8`、`8–20`、`20+` 分钟切换。普通倒计时 `elapsedMs < 10_000` 时取消无责、回待机且不写记录。达到 10 秒后使用 `« 左滑放弃` 轨道，另提供同一动作的可访问确认入口。正计时主动结束走正常结束。严格倒计时隐藏暂停、取消和放弃，原生执行同等约束。
- 安全菜单 `⋯` 和正计时结束确认遵守单层契约。安全 Sheet 到四个安全路由各两步，先关闭再跳转。从主画面移走运行态通知/勿扰调试面板、临时放行遥测和重复帮助入口。
- 成功结算展示本轮真实增长的好感和农场养成只数。提前结束按养成规则展示 `-5`（好感下限为 0），离开未归补充简短原因。复盘输入最多 100 个 Unicode 码点，保存到本条记录，快捷词填入同一个输入框。成功主 CTA 为休息，提前结束主 CTA 为 `返回首页`，`↻ 重新开始` 为 `.secondary` 并沿用本轮设置。设备重启的中断独立显示 `专注已中断` 并保留实际时长。

#### C. 休息与循环

```text
+-- 休息中 -------------------+   +-- 休息结束 -------------------+
|          10 分钟            |   | 本次专注 · 背单词 · 25 分钟    |
|            09:42            |   | [ 再次专注 ]                  |
|          [退出休息]         |   | [返回首页]                    |
+-----------------------------+   +-------------------------------+
```

- 设置支持 `5 / 10 / 15 / 20` 分钟。休息按钮使用有效配置。开启 `autoRest` 后，正常倒计时完成展示约 1.5 秒成功反馈并进入 `/rest`。同时开启 `pomodoroLoop` 时，休息自然结束自动按上轮待办与时长开始新一轮，仍经过原生启动校验。手动退出返回待机。关闭循环时由用户在完成态决定是否再次专注。
- 休息退出确认与再次开始异常各使用单层 Sheet。休息卡用 20px 圆角，计时与进度来自原生快照。

#### D. 减法清单与预算校验

| 状态 | 首屏决策组（最多 4） | 主 CTA 数 |
|---|---|---:|
| 待机 | 待办、学霸、白噪音、本轮专注配置（调时与换伙伴）。快捷分钟按需展开 | 1 |
| 运行和暂停 | 暂停/继续、取消/结束/滑轨、安全菜单。严格态仅保留安全菜单 | 0–1 |
| 结算和休息 | 复盘输入与快捷词同组，行动区按状态保留休息、返回或重新开始 | 1 |
| 快捷面板与确认 | 待办行按主题同组，名册和毛色顺序切换，白噪音两组（曲目、音量），安全出口四组 | 0–1 |

各状态全部应用 §5.0 的 `48×48px` 热区、`12px` 辅文、Dual-Slate AA 与输入框 A，包括滑轨、音量滑杆和复盘输入。全程零嵌套。

---

### 5.3 `StudyModeSheet.vue`（单层 9 视图弹窗栈）

#### A. 线框图

```text
[view: 'home'] (首屏: 1 主 CTA, 4 决策项)
┌ 学霸模式 ─────────────────────────── × ┐
│ ┌────────────────────────────────────┐ │
│ │ 学霸模式                     (●━━) │ │  ← 决策 1: 总开关（立即 saveData 生效；
│ │ 专注期间锁定专注页，限制分心应用   │ │     拨动关闭时自动收起弹窗，2 步完成关闭；
│ │ ⚠ 还差 1 项权限 · 去处理 ›        │ │     拨动开启时持久化并按需留页提示缺权/配置）
│ └────────────────────────────────────┘ │
│  🛡 应用限制    已选 8 个应用  › (●━━) │  ← 决策 2 -> view='apps'
│  ⏱ 严格模式    默认 3 项      › (━○) │  ← 决策 3 -> view='strict'
│  🔕 免打扰      静音与拦截通知 › (●━━) │  ← 决策 4 -> view='quiet'
│ [                完成                ] │  ← 唯一主 CTA (48px+)
│             权限与使用帮助 ›           │  ← 安静入口 -> view='permissions'
└────────────────────────────────────────┘

[view: 'apps'] (‹ 学霸模式)                [view: 'whitelist'] (‹ 应用限制)
┌ ‹ 学霸模式  应用限制         (●━━) × ┐  ┌ ‹ 应用限制  白名单应用 ───────── × ┐
│ 仅允许白名单内应用与必要系统交互。   │  │ <AppWhitelistEditor inline />      │
│ [⚠ 还差无障碍权限 · 去授权 ›]        │  │ (搜索/系统应用/复选列表)           │
│ 限制白名单外应用（暂停仍限制） (●━━) │  │ [           确认白名单           ] │
│ 允许临时放行（每轮 3 次）      (●━━) │  └────────────────────────────────────┘
│ 白名单应用               8 个已选  › │
│ [            恢复推荐默认          ] │  [view: 'wallpaperConsent'] (‹ 严格模式)
└──────────────────────────────────────┘  ┌ ‹ 严格模式  壁纸辅助保护说明 ─── × ┐
                                          │ 2 项知情勾选（不宣称系统强停免疫） │
[view: 'strict'] (‹ 学霸模式)             │ [         确认保存原状态           ] │
┌ ‹ 学霸模式  严格模式         (●━━) × ┐  └────────────────────────────────────┘
│ 开启后倒计时不可暂停，切出桌面会拉回。│
│ [⚠ 还差无障碍权限 · 去授权 ›]        │  [view: 'permissions' / 'permissionGuide' / 'keepAliveGuide']
│ 倒计时不可暂停、不可提前结束   (●━━) │  ┌ ‹ 学霸模式  权限与使用帮助 ───── × ┐
│ 限制桌面与最近任务（切出拉回） (●━━) │  │ 仅缺无障碍连接时提示日常限制可用   │
│ 精确防关闭（拦截强退与卸载）   (●━━) │  │ 无障碍 · 开关仍在 · 需重开          │
│ ▸ 进阶防绕过（可能影响日常使用）     │  │ [前往重开无障碍]（复用原设置入口） │
│   (展开含 FORCE-04 隐藏最近任务 /    │  │ [四维保活与锁卡向导 ›]及原有帮助入口│
│    FORCE-05 隐藏桌面图标 /           │  └────────────────────────────────────┘
│    FORCE-06 壁纸辅助保护 /           │    └→ [view: 'keepAliveGuide'] (‹ 权限与使用帮助)
│    严格权限目录防撤权 /              │       (同容器单层 4 步保活向导: FGS / 电池优化 /
│    防卸载保护（设备管理器）/         │        本机自启动直达 / 本机锁卡手势 + 互斥提示)
│    重启后未到期继续锁机)             │
│ [            恢复推荐默认          ] │  [view: 'quiet'] (‹ 学霸模式)
└──────────────────────────────────────┘  ┌ ‹ 学霸模式  免打扰           (●━━) × ┐
                                          │ 减少专注期间的声音、振动与通知打扰。│
                                          │ [⚠ 还差 1 项通知权限 · 去授权 ›]   │
                                          │ 静音与振动（保留来电与闹钟） (●━━) │
                                          │ 拦截通知，结束后释放         (●━━) │
                                          │ 白名单应用通知照常显示       (●━━) │
                                          │ [            恢复推荐默认          ] │
                                          └────────────────────────────────────┘
```

#### B. 减法清单与预算校验
| 元素（Before） | 动作 | 调整后（After） |
|---|---|---|
| 顶栏 `display.text` 工程态胶囊 + 独立 `授权与权限` 行 + 3 条底部工程链接 | **移除合并** | 卡片内 1 行状态提示 + 底部 1 个 `权限与使用帮助 ›` 安静链接 |
| `strict` 平铺 7 个开关 + 5 个重复 `! 待授权` 按钮 | **渐进披露** | 首屏 3 核心开关 + 1 折叠 `▸ 进阶防绕过`（`FORCE-04/05/06`）+ 顶部单条缺失权限提示 |
| 5 条嵌套弹窗（`permissionHelp`、`guideOpen`、`wallpaperConsentOpen`、`AppWhitelistEditor`、`RecoverySheet`） | **消除** | 全弹窗内单层视图切换（`view` 状态机）+ 关闭后跳转 `/recovery` |
| 无障碍断连时的通用状态和设置操作 | **复用并明确状态** | `permissions` / `permissionGuide` 使用同一权限项直达系统无障碍。双引擎已就绪且仅缺无障碍连接时显示一条说明，新增主 CTA、开关和嵌套弹窗均为 0。 |

- **预算校验**：`home` 首屏主 CTA = `1`（`完成`），决策项 = `4`（总开关 + 3 模块）；配合 `TasksView` 顶栏单区状态胶囊（1 步打开配置）及 `StudyModeSheet` 内拨动关闭总开关自动收起（2 步），Flow 4 严格满足 `<= 2` 步、零误触且不破坏模块与缺失权限配置；`apps` / `strict` / `quiet` 各自首屏决策项 `<= 4`，主 CTA `<= 1`，嵌套弹窗 = `0`。

---

### 5.4 `CalendarView.vue`（`/calendar`）

#### A. 默认时间轴、补录与周图

```text
+-- 时间轴 ------------------- [时间轴 | 日程 | 课表] ---+
| 一   二   三   四   五   六   日                [今天] |
| 11 月 27 日       [+]                 [一周分布图 >]   |
| 09:00  （动物与毛色）背单词          25 分钟 [编辑]    |
|        复盘小结                                         |
| 10:30  （橙红整框 · 幽灵图标）提前结束        [编辑]    |
| 14:00  （浅灰）手动补录 · 阅读               [编辑]    |
+---------------------------------------------------------+

+-- 手动补录 ---------------- x +   +-- 一周分布图 ---------------- x +
| 标题 [ 阅读                ] |   | 周一  周二  周三  周四 ... 周日  |
| 日期 [ 2026-11-27          ] |   | 00:00 [一周时段矩阵]            |
| 时段 [ 14:00 ] - [ 14:25 ]   |   | 23:00                           |
| 复盘小结 [ 可选             ] |   | 黑/斜纹/橙红/浅灰图例           |
| [ 保存补录 ]                 |   | [ 保存 PNG ]                     |
+-------------------------------+   +----------------------------------+
```

- 默认视图为时间轴，7 日条定位到日期。完成卡展示本轮动物与毛色，提前结束卡使用 `#EF4E36` 整圈描边和小幽灵插画（线框语义为 `👻`），补录卡以浅灰和文字标明来源。记录的编辑动作在卡内展开 `复盘小结`，上限 100 个 Unicode 码点。
- 日期旁 `+` 打开单 Sheet 的手动补录表单，校验日期、起止时间和必填标题。补录进入时间轴和时长统计，养成与成就按 ADR 0005 排除。卡内小结保存后保持选中日期。
- 周图按自然周预览 `00:00–23:00` 分布，黑为专注，斜纹为暂停，橙红为提前结束，浅灰为手动补录。保存只有一个主 CTA，经 Android Storage Access Framework（SAF）导出 PNG。
- 顶栏互斥切换时间轴、日程与课表。切换保留各视图自身的选择、既有数据和操作。补录与周图预览以同一个 `<Sheet>` 切换，日程/课表编辑和确认沿用下节。
- **减法与预算**　时间轴首屏四组为视图切换、日期、补录、周图。记录的同类小结操作随列表项呈现。空态只保留一个主 CTA，补录表单四组与单主按钮，周图一个主按钮，均零嵌套。触控、辅文、Dual-Slate AA 与输入框 A 按 §5.0，图例同时使用文字与图形。

#### B. 日程与课表保留线框

```text
[主屏: 切换到日程]                        [... 溢出菜单 (单层 Sheet)]
┌────────────────────────────────────┐    ┌ 日历视图与设置 ─────────────── × ┐
│ 日历                [今天]   [•••] │    │ 切换到课表视图                 › │
│ 周一 周二 周三 [周四] 周五 周六 周日│    │ 展开 / 收起月历（2026年11月）  › │
│  6    7    8   [ 9 ]  10   11   12 │    │ 学期与每日节次设置             › │
│       •         •           •      │    │ (课表模式且>1学期: 切换学期列表) │
│ (<  2026年11月  >     [收起])      │    └──────────────────────────────────┘
│ (周条选中用#222高对比,<=350px自适配)│
│ 5月9日 周四  (+)     [ 计划 | 实际 ]│  ← 有日程时 (+) 为唯一主 CTA；空态时 (+) 降为 .icon-button.soft
│                      4项 · 3时28分 │
│  o  09:00 ~ 10:05                  │    [主屏: 课表模式]
│  │  ┌────────────────────────────┐ │    ┌──────────────────────────────────┐
│  │  │ 高数复习                   │ │    │ ‹ 日程   < 第 12 周 >    [+] [•••]│  ← 周次步进 >=48px
│  │  │ 已关联待办 · 复习矩阵      │ │    │ < 横向可滚 7列×节次网格 >=12px >  │    ([•••] 含切换/编辑/新建学期)
│  │  └────────────────────────────┘ │    │ (课程块取消 borderLeft，改用整框 │
└────────────────────────────────────┘    │  淡底色 + 1px 微边，防 360px 裁切)│
                                          └──────────────────────────────────┘

[空态线框: 日程·计划 / 日程·实际 / 课表] (头栏 (+) 统一为 .icon-button.soft，确保主 CTA <= 1)
┌ 日程·计划 (!dayItems.length) ──────┐    ┌ 课表 (!currentSemester) ─────────┐
│ 今天，留一点时间给自己             │    │ 开始一个新的学期                 │
│ 安排一段学习，也安排一段休息       │    │ 设置学期和上课时间，课程按周排好 │
│ [         ＋ 添加日程            ] │    │ [           设置学期           ] │ ← 唯一主 CTA (.primary)
└────────────────────────────────────┘    └──────────────────────────────────┘
┌ 日程·实际 (!actualRecords.length) ─┐
│ 今天还没有专注记录                 │
│ [            去专注              ] │ ← .secondary 跳转 /focus
└────────────────────────────────────┘

[Sheet: event] (添加/编辑日程，时间整行)    [Sheet: detail] (日程/课程详情，<= 4 决策组)
┌ 添加日程 ────────────────────── × ┐    ┌ 日程/课程详情 ──────────────── × ┐
│ 日程名称 [ 复习英语              ] │    │ 高数复习                        │
│ [ 全天日程                   ○━━ ] │    │ 09:00 — 10:05 · 关联待办：复习  │
│ 开始时间 [ 2026-11-23 09:30      ] │    │ 1.[   开始关联待办的专注       ] │ ← 1 主 CTA (先关弹窗再start)
│ 结束时间 [ 2026-11-23 10:30      ] │    │ 2.[仅本次调课]  3.[编辑整门课程] │   (普通日程此处为[编辑日程])
│ 重复/待办 [ 不重复 ▾ ] [ 关联待办▾]│    │ ─────────────────────────────── │
│ ▸ 更多选项（提醒 · 备注 · 截止）   │    │ 4.[ 停课 / 删除 ]                │ ← 点后内联展开:
│ ! 与《高数》重叠 [调整时间][仍然保存]│   │   [仅本次停课] [删除整组] [取消] │   (<= 4 首屏决策组)
│ [            保存日程            ] │    └─────────────────────────────────┘
                                          └─────────────────────────────────┘

[Sheet: semester] (同 <Sheet> 切换)       [Sheet: course] (同 <Sheet> 切换)
┌ ‹ 课表  学期与上课时间 ──────── × ┐    ┌ 添加 / 编辑课程 ───────────── × ┐
│ 学期名称 [ 2026 秋季学期         ] │    │ 课程名称 [ 高等数学             ] │
│ 第一教学周的周一 [ 2026-09-07    ] │    │ 星期与节次 [周二▾] [1节▾]~[2节▾] │
│ 教学周数 [ 18 ]                    │    │ 教学周范围 [第 1 周] ~ [第 16 周] │
│ ▸ 每日节次时间（共 12 节，点此展开）│   │ ▸ 更多课程信息（单双周/教室/色/提醒）│
│ [       保存并设为当前学期       ] │    │ [           保存课程            ] │
└────────────────────────────────────┘    └─────────────────────────────────┘

[Sheet: adjust] (从 detail 同 <Sheet> 切换 ‹ 课程详情)
┌ ‹ 课程详情  仅本次调课 ──────── × ┐
│ 高等数学 · 原安排 2026-11-22       │
│ 新的开始时间 [ 2026-11-23 14:00  ] │
│ 新的结束时间 [ 2026-11-23 15:40  ] │
│ [           确认本次调课         ] │
└────────────────────────────────────┘
```

#### C. 日程与课表减法清单
| 元素（Before） | 动作 | 调整后（After） |
|---|---|---|
| 原日历视图切换、月历栏与学期操作 | **重定位与补齐** | 顶栏直接切换视图，溢出菜单收纳月历展开、学期切换及编辑。课表顶栏保留教学周步进。首屏按视图、日期或教学周、添加、溢出四组验收。 |
| 空态 `.primary` 与顶栏 `(+)` 可能双 `.primary` 冲突 | **互斥降级** | 当 `日程·计划` 空态（`添加日程`）或 `课表` 空态（`设置学期`）显示 `.primary` 主按钮时，顶栏 `(+)` 强制使用 `.icon-button.soft`（次级按钮），保证全屏 `.primary <= 1` |
| `event` 冲突 `ConfirmationDialog`、`detail` 删除 `ConfirmationDialog`、`detail` `StrictStartConfirmation` | **消除嵌套** | 内联冲突条、内联删除确认、先 `sheet = null` 再跳转 `/focus`（异常转视图级单层恢复弹窗） |
| `detail` 关联课程平铺 5 个按钮 | **合并收敛** | 底部 `删除/停课` 收敛为 1 个入口 `[停课 / 删除]`，点击后内联展开 `[仅本次停课] [删除整组] [取消]`，使首屏决策组 `<= 4` |
| `event`（8–10 控件）、`course`（11 控件）、`semester`（长节次列表） | **折叠简化** | 次要字段收进折叠 `<details>`，首屏均 `<= 4` 组 + `1` 主 CTA |
| `.course-block` `borderLeft: '3px solid'`（`314` 行） | **Craft Floor 修复** | 改为整框柔底 + `1px solid ${color}33` 细边框 |
| 13 处 `7px–11px` 字号、42–44px 按钮、`17px` 卡片圆角 | **品牌参数修复** | 全部 `>= 12px`、`.course-grid` 支持 `overflow-x: auto`、`>= 48px`、`20px` 圆角；`event` 起止时间改为整行排布、选中今天默认下一个整/半点、`<= 350px` 周条防溢出、选中态改为 `var(--ink)` 高对比、`今` 升级为 `今天` 胶囊 |

---

### 5.5 `StatisticsView.vue`（`/statistics`）与 `CatView.vue`（`/cat`）

#### 5.5.1 统计

```text
+-- 统计 ----------------------------- [专注记录] -----+
| [日 | 周 | 月 | 年 | 累计]                            |
| [<]               本周                         [>]   |
| 58 小时 25 分 · 128 次 · 提前结束次数 4              |
| [按时长 <-> 按次数]                                  |
| 专注趋势   （红冠黑头柱 / 浅灰休息头柱）              |
| --------- 平均值 ----------------------------------- |
| 分布        [主题 | 待办]  （在概览下方）              |
| 年视图      [单画布 365 日热力图]                      |
|            11 月 27 日 · 1 小时 25 分                 |
+-------------------------------------------------------+

+-- 专注记录 ----------------- x +   +-- < 返回列表 · 专注详情 --- x +
| 11-27 · 高数复习 · 25 分钟  > |   | 高数复习 · 正常结束 · 25 分钟 |
| 11-27 · 背单词   · 15 分钟  > |   | 09:00–09:25                  |
|                               |   | [删除记录] -> [取消] [确认] |
+-------------------------------+   +------------------------------+
```

- 概览新增 `提前结束次数`（放弃次数）。`按时长 ⇄ 按次数` 同步切换趋势和分布，标题与轴单位跟随指标。保留日、周、月、年、累计周期、日期步进与主题/待办分布。日概览保留最长单次。趋势使用均值虚线、达标的红冠黑头和浅灰休息头，数值与状态有文本说明。
- 年视图的 365 日热力图使用单个画布容器，指针按住后滑选日期，显示日期与数值。容器有 `>= 48×48px` 的可触达区、键盘日期步进与读屏摘要，日期格不拆分为数百枚按钮。
- 记录入口仅保留右上一个。`list` → `detail` 在同一 `<Sheet>`，删除走详情内联确认。统计首屏四组为周期、日期步进、统计单位、记录入口，主 CTA 为 0。分布选择与热力图在各自区块。详情最多 1 主 CTA、4 组、0 嵌套。轴标、提示和记录表单全部按 §5.0 验收。

#### 5.5.2 一周农场

```text
+-- [<] 一周农场 [>] ------------------ [小屋 128] [ ... ] -+
|                  11 月 23 日–29 日                         |
|                                                             |
|    （散步动物）         （散步动物）        （散步动物）      |
|                                                             |
|  选中动物 · 背单词 · 11 月 27 日 · 25 分钟  [查看记录 >]     |
+-------------------------------------------------------------+

+-- 农场操作 -------------------- x +
| [ 保存本周农场打卡图 ]             |
+-----------------------------------+
```

- 用自然周步进浏览历史周。小屋角标显示当周实际养成总数，场景按确定性抽样显示最多 36 只。系统减少动态效果时静态陈列。点小动物蹦跳并显示底部来源记录栏，支持查阅对应专注记录。空周保留周步进与简短空态。
- 溢出菜单打开一个 `<Sheet>` 进入保存动作，在当前面板内切换预览。用 Android SAF 导出当周时长、养成总数和场景的打卡 PNG。
- **减法与预算**　占位页更新为一周场景。数量由小屋角标承载，选中动物的来源信息只在记录栏展示。首屏为自然周步进、动物场景、溢出菜单和选中时的记录操作四组，主 CTA 为 0。导出面板至多一个主 CTA、零嵌套。动物点按区、周步进、辅文与颜色遵循 §5.0。

---

### 5.6 `SettingsView.vue`（`/settings`）

```text
+-- 我的 --------------------------+   +-- 计时与休息 ----------------- x +
| 专注设置                         |   | 休息时长 [5] [10] [15] [20] 分钟|
| 默认专注时长          25 分钟 > |   | 自动进入休息               [开] |
| 计时与休息             5 分钟 > |   | 番茄循环                   [关] |
| 屏幕常亮                  [开] |   | [ 保存设置 ]                    |
| 提醒与声音                   > |   +---------------------------------+
|                                 |
| 专注保护                        |   +-- 提醒与声音 ----------------- x +
| 学霸模式                     > |   | 结束提示音 / 结束振动            |
| 独立锁机                     > |   | 系统提醒与后台                  |
| 轻看护                    [开] |   | 学霸模式 · 免打扰设置         > |
|                                 |   | [ 完成 ]                        |
| 数据与支持                      |   +---------------------------------+
| 本地备份与恢复               > |
| 高级保护与诊断               > |   +-- 检查更新与关于 -------------- x +
| 检查更新与关于               > |   | [ 检查更新 / 下载 / 安装 ]      |
+---------------------------------+   | GitHub 项目 / 官方网站          |
                                      | 最近更新与开源许可            > |
+-- 默认专注时长 -------------- x +   | 升级恢复副本                  > |
| 时长（分钟） [25]               |   +---------------------------------+
| [25 分钟] [45 分钟] [60 分钟]    |    同一 Sheet 内查看副本、导出或恢复
| [ 保存设置 ]                    |    恢复使用内联确认
+---------------------------------+
+-- 本地备份与恢复 ------------ x +
| [ 导出备份 ]                    |
| [从备份恢复]                    |
+---------------------------------+
```

- `计时与休息` 集中配置休息时长、`自动进入休息`、`番茄循环`。关闭自动休息时显示循环的生效条件。屏幕常亮与轻看护各保留一个开关，轻看护仅用一行解释熄屏/通话等豁免。结束提示音和结束振动归到提醒与声音，保留原生提醒和免打扰入口。
- **减法清单**　主屏只保留设置类别、常用开关与入口。免打扰等保护细节进入学霸模式，权限、诊断、故障恢复进入 `/permissions` 四标签中心。升级副本在 `检查更新与关于` 的同一个 Sheet 内切换。移除 `InfoHint` 内嵌弹窗，备份和恢复只保留一个根入口，二次确认内联显示。
- **预算校验**　首屏专注设置组 4 行，其他各组至多 4 行，主 CTA 为 0。计时与休息 Sheet 为 3 个决策组、1 个主 CTA。默认专注时长保留数字输入和快捷时长组。各子视图共用单个 `<Sheet>`，最多 1 个主 CTA 和 0 个嵌套弹窗。各行、控件和输入统一遵循 §5.0 的 `48×48px`、`12px`、Dual-Slate AA 和输入框 A。

---

### 5.7 `LockView.vue`（空闲态、运行态、`draft`、`starting`、`ending`、`LockMainEntrySetting`）

#### A. 线框图

```text
[空闲态]                                  [锁机进行中]
┌────────────────────────────────────┐    ┌────────────────────────────────────┐
│ ‹  独立锁机                        │    │ ‹  独立锁机                        │
│ 独立于待办专注，单纯锁机不计统计。 │    │       普通锁机 / 严格锁机进行中    │
│ ┌────────────────────────────────┐ │    │                                    │
│ │ 晚自习锁机       [编辑] [开始] │ │    │              24 : 59             │ ← 卡片内 [开始] 为 .secondary
│ │ 25分钟 · 普通锁机 · 全局白名单 │ │    │             晚自习锁机             │
│ └────────────────────────────────┘ │    │       仅允许白名单内 4 个应用      │
│ [         新建锁机配置           ] │    │                                    │
│ ▸ 锁机高级设置与历史 ⌄ (入口·历史) │    │ [         提前解除锁机           ] │ (普通锁机)
│   └─ 锁机时限制返回主页 (●━━) + 历史│   │         遇到问题？帮助与恢复       │ -> /help
└────────────────────────────────────┘    └────────────────────────────────────┘

[Sheet: draft (单层 3 视图栈: form <-> whitelist / enhancements)]
┌ 锁机配置 ────────────────────── × ┐    ┌ ‹ 锁机配置  独立增强选项 ──── × ┐
│ 锁机名称 [ 晚自习锁机            ] │    │ 使用独立增强选项           (●━━) │
│ 时长(分) [ 25 ]  严格锁机    (━○) │    │ 6 项防绕过开关（弹窗内子视图）    │
│ 白名单   [ 跟随全局 ▾ ] (编辑 ›)  │    │ [          完成选择            ] │
│ 增强保护 [ 跟随全局 ▾ ] (自定义 ›)│    └──────────────────────────────────┘
│ [           保存配置             ] │  ← [starting]: 仅缺权限或严格锁机时提示
└────────────────────────────────────┘    [ending]: 确认解除？[继续][确认解除]
```

#### B. 减法清单与预算校验
- **移除** `NotificationSetting runtime-only`、`mainEntry` 工程长句、`status?.reason` 原始字符串、`重新检查保护` + 4 条冗余底部链接 → 运行态底部仅留 1 条 `遇到问题？帮助与恢复`（`/help`）。
- **降级单 CTA**：将每个预设卡片内的 `[开始]` 按钮（`LockView.vue:146`）从 `.primary` **降级为 `.secondary`**，使 `新建锁机配置` 成为空闲态唯一的 `.primary` 主 CTA（避免 `N` 张预设卡产生 `N + 1` 个主按钮）。
- **保留并折叠** `LockMainEntrySetting`（`lockMainInterfaceRestricted`）与 `锁机历史` 在 `▸ 锁机高级设置与历史` 内，并将 `LockMainEntrySetting` 的 `InfoHint` 改为内联文字。
- **消除嵌套**：`draft` 通过同一 `<Sheet>` 内部视图栈（`'form' \| 'whitelist' \| 'enhancements'`）嵌入 `<AppWhitelistEditor inline />` 与 6 项独立增强开关；`starting` 移除 `ProtectionStartSummary` 诊断列表，普通就绪锁机可快速开始，仅 `strict` 或缺失权限时显示单句确认/授权引导。
- **预算校验**：空闲态每张预设卡仅 `编辑`/`开始`（`.secondary`），主 CTA `<= 1`（`新建锁机配置`），`draft` 首屏 4 组字段 + 1 主 CTA。

---

### 5.8 `ProtectionHelpView.vue`（`/permissions`、`/help`、`/emergency`、`/recovery` + `ProtectionDiagnostics` + `RecoverySheet`）

- **结构定位**：作为 Tier 3 专业诊断与安全出口中心，完整保留 4 个顶部 Tab（`权限状态 \| 离线帮助 \| 故障恢复 \| 紧急交互`，单行不换行且支持横向滚动）、`ProtectionDiagnostics.vue`（将五态说明与检查规则折叠为 `状态含义与检查说明` 列表 + 单层 `permission` 详情弹窗）、`tel:` 紧急拨号与学霸/锁机返回逻辑（`returnPath`）。
- **关键修复**：移除 `/recovery` 路由下自动弹出 `RecoverySheet` 的行为（`ProtectionHelpView.vue:16-17, 33`），改为直接在 `/recovery` 页面内渲染本轮可恢复项清单与操作按钮；`RecoverySheet.vue` 仅保留给 `App.vue` 处理后台通知 `recovery-return-request` / `open-recovery`（并确保开启前关闭任意本地弹窗）。
- **预算校验**：`/permissions` 主视图 1 个刷新/操作主节奏，单层弹窗 `<= 1`，`ProtectionHelpView` `.help-contents`、`.capability`、`.recovery-step` 圆角全部统一为 `20px`。

---

### 5.9 `StrictStartConfirmation.vue` 与 `ProtectionStartSummary.vue` 处置

| 组件 | M2 处置 | M3 处置 | 替代机制 |
|---|---|---|---|
| `StrictStartConfirmation.vue` | **从 `App.vue` 与 `stores/app.ts` 正常开始流中移除**（含移除 `startConfirmation` 状态与拦截门） | 确认无引用后删除（或 M2 更新单测后直接删除） | `StudyModeSheet` 内开启严格模式时完成规则告知；原生 `startFocus` 抛出异常时在视图层显示单层可恢复提示 |
| `ProtectionStartSummary.vue` | **从专注启动流彻底剥离**（文件暂留至 M3 结束，因 `LockView.vue:13, 158` 仍临时引用） | **M3 重构 `LockView.vue` 时同步解除引用并删除** | 能力就绪度由 `StudyModeSheet` 顶部条与 Tier 3 `/permissions`（`ProtectionDiagnostics`）承担 |

---

### 5.10 6 个孤立遗留组件删除清单（Deletion Manifest，M2 执行）

经全仓检索，以下 6 个改版前组件在 `src/` **生产代码中引用数为 0**（仅组内自引用），但仍被 3 个单测文件引用，须在 M2 **一并删除文件并同步迁移对应单测断言至 `StudyModeSheet.vue`**：

| # | 文件路径 | 行数 | 生产引用 | 需在 M2 同步迁移的测试文件 |
|---|---|---|---|---|
| 1 | `src/components/AntiCloseSettings.vue` | 94 | 0（仅被 `EnhancedProtectionSettings` 引用） | `tests/permission-toggle-components.test.ts:16` |
| 2 | `src/components/EnhancedProtectionSettings.vue` | 116 | 0 | `tests/permission-toggle-components.test.ts:15` |
| 3 | `src/components/LauncherSetting.vue` | 116 | 0（仅被 `EnhancedProtectionSettings` 引用） | `tests/permission-toggle-components.test.ts:18` |
| 4 | `src/components/RecentTasksSetting.vue` | 115 | 0（仅被 `EnhancedProtectionSettings` 引用） | `tests/permission-toggle-components.test.ts:17` |
| 5 | `src/components/StrictModeSetting.vue` | 79 | 0 | `tests/study-mode-redesign.test.ts:87`, `tests/ui-audit-fixes.test.ts:63` |
| 6 | `src/components/WallpaperSetting.vue` | 149 | 0（仅被 `EnhancedProtectionSettings` 引用） | `tests/permission-toggle-components.test.ts:19`, `tests/ui-audit-fixes.test.ts:65` |

---

## 6. 锁定视觉修复规范（`docs/brand-spec.md` 合规，M2/M3 执行）

### 6.1 `--muted` 色值与 WCAG AA 对比度双令牌协调

经相对亮度计算验证：
- `#737378`（`brand-spec.md:9` 锁定次文字）在 `#FFFFFF` 白底对比度为 **4.72 : 1**（通过 AA `>= 4.5:1`），但在 `#F5F5F5` 灰卡底对比度为 **4.33 : 1**（略低于 4.5:1）。
- `#66666b` 在 `#FFFFFF` 为 **5.71 : 1**、在 `#F5F5F5` 为 **5.24 : 1**、在 `#FFF1EF` 为 **5.19 : 1**（全表面通过 AA）。
- **规范决策**：
  - 设置 `--muted: #737378;`（精确还原 `docs/brand-spec.md:9`，用于 `#FFFFFF` 主页面背景上的次要文字及底栏未激活图标 `.tabbar a`）。
  - 新增 `--muted-surface: #66666b;`（专用于 `#F5F5F5` / `#FFF1EF` 卡片、设置组、输入框占位或辅文，保证全表面 `>= 4.5:1` AA 可读性）。
  - 所有正文级红字警示统一使用 `#c13a25`（白底 `5.39:1` / 灰底 `4.94:1`），`#ef4e36` 仅用于品牌强调点、进度或大号 UI 元素。

### 6.2 `src/style.css` 与各组件 CSS 逐项修复表

| 文件与位置 | 当前违规值 | 目标合规值（M2/M3 修复） | 对应规范 |
|---|---|---|---|
| `src/style.css:12` | `--muted: #66666b;` | `--muted: #737378;` + `--muted-surface: #66666b;`（所有 `#F5F5F5`/`#FFF1EF` 浅底卡片、设置组与容器内的次文字必须改用 `var(--muted-surface)`，防止 `--muted` 改为 `#737378` 后对比度跌至 `4.33:1`） | `brand-spec.md:9` + AA |
| `src/style.css:21` | `--page-inline: clamp(16px, 5vw, 24px);` | `--page-inline: 24px;`（`@media (max-width: 340px) { --page-inline: 16px; }`） | `24px` 页面边距 |
| `src/style.css:125, 506, 721, 752` | `#F5F5F5` 容器内 `small`、`segmented button`、`.notice`、`.record p` 使用 `var(--muted)` | 卡片/浅底容器内 `small`、`.segmented button`（`:506`）、`.notice`（`:721`）、`.record p`（`:752`）全部改用 **`color: var(--muted-surface)`**（白底独立 `small` 保留 `var(--muted)`） | AA `>= 4.5:1` |
| `src/style.css:232-235, 262, 503, 521, 539-540` | `.icon-button.small` (`44px`), `.text-button` (`44px`), `.segmented button` (`42px`), `.chip` (`42px`), `.color-swatch` (`38px`) | 全部触控区域提升至 **`>= 48px × 48px`**（色块外层热区 `48×48px` 包裹 `32px` 内圆） | `>= 48px` 触控 |
| `src/style.css:379` | `.tabbar a { color: #8c8c91; }` | `color: var(--muted);`（`#737378`, `4.72:1`） | AA 对比度 |
| `src/style.css:434, 717, 738` | `.sheet` (`border-radius: 26px`)、`.notice` (`14px`)、`.record` (`16px`) | 统一为 **`border-radius: var(--radius);`（`20px`）** | `20px` 卡片与弹窗圆角（C3） |
| `TasksView.vue` | `14px/18px` 圆角（`.task-card`/`.ongoing`/`.item-options`）、`11px` 字号、`:846` `@media (max-width: 360px)` 图标按钮 `44×44px`、`:1007` `.task-more` `width: 46px`、`:839, :1161` `44px`；`:840, 973, 1010, 1148` 在 `#F5F5F5` 上用 `var(--muted)` | `20px` 圆角、`>= 12px` 字号、全部按钮与 `.task-more` / 小屏顶栏按钮 **`>= 48px × 48px`**；`:840`（默认 `.study-chip`）、`:973`（`.task-text p`）、`:1010`（`.task-more`）、`:1148`（`.option-value`）改用 **`var(--muted-surface)`** | R4 + AA `>= 4.5:1` |
| `FocusView.vue` & `RestView.vue` | `#6c6c72`、44px 链接；`RestView:159` `32px` 与 **`:200` `@media (max-height: 500px)` `.rest-stage { border-radius: 24px }`**、`RestView:163, 167, 168`（`#88888d`/`#e2e2e5`/`#77777c`）、`:171` `11px` 标签、**`:161, 171`**（`.stage-heading` / `.receipt-label`）在 `#F5F5F5` 上用 `var(--muted)` | `>= 48px`、`20px` 圆角（含 `:159` 与 `:200` 媒体查询）、`>= 12px` 辅文、`#88888d`→`#737378`/`#ef4e36`、`#e2e2e5`→`var(--line)`（`#eaeaea`）、`#77777c`→`#222222`/`#737378`；`RestView:161, 171` 等 `#F5F5F5` 内次文字改 **`var(--muted-surface)`** | R4 + AA `>= 4.5:1` |
| `StudyModeSheet.vue` | `11px` 徽章（`:1371`）、`14px` 卡片圆角（`:1359`）、**`:1281-1285` `.switch-compact` (`42×44px`)** 与 32–44px 按钮；**`:1243, 1246, 1348, 1378, 1382, 1385` 越界色值 `#b44318`（4 处）/ `#2f7a4d`（2 处）**；**`:1231` `.status-pill`、`:1375` `.perm-badge`** 在 `#F5F5F5` 上用 `var(--muted)` | `>= 12px`、`20px` 圆角、`.switch-compact` 与全部可点区 **`>= 48px × 48px`**；越界 `#b44318`→`#c13a25`、`#2f7a4d`→`var(--ink)`（`#222222`）并保留锁定底色；`:1231, 1375` 改用 **`var(--muted-surface)`** | R4 + AA + 锁定色板 |
| `CalendarView.vue:314` | `.course-block` `borderLeft: '3px solid ' + o.color` | **删除单侧色条**；改用 `background: o.color + '16'` + `border: '1px solid ' + o.color + '33'` | `craft-floor.md:35` |
| `CalendarView.vue`（13 处样式 + 浅底辅文） | `7px–11px` 辅文、42–44px 控件、`17px` 卡片圆角、`#f8f8f8`；**`:931, 984, 992, 1009`**（`.mini-switch button`、`.timeline-card p`、`.linked-label`、`.all-day-list span`）在 `#F5F5F5` 上用 `var(--muted)` | 全文字 `>= 12px`（`.course-grid` 包裹 `overflow-x: auto` + `min-width: 520px`）、`>= 48px`、`20px`、`var(--surface)`；`:931, 984, 992, 1009` 改用 **`var(--muted-surface)`** | R4 + AA + 响应式 |
| `StatisticsView.vue` | `trendOption` `#8e8e93` / `10px`（`:115, 120, 122`）、**`hourOption` 柱色 `#77777c`（`:168`）**、`:113` `#e5e5e5`、`:121` `#ededed`、`#f7f7f7`、平铺分割线、44–45px 按钮、`10–11px` 文案；**`:418, 432`**（`.overview-grid > div > span`、`strong small`）在 `#F5F5F5` 上用 `var(--muted)` | ECharts 轴标改 `#737378` / `fontSize: 12`，`#e5e5e5`/`#ededed`→`#eaeaea`，`hourOption:168` `#77777c`→`#737378`（峰值用 `#EF4E36`）；`var(--surface)`、`20px` 独立卡片、`>= 48px`、`>= 12px`；`:418, 432` 改 **`var(--muted-surface)`** | R4 + AA 对比度 |
| `SettingsView.vue` & `UpdateSettings.vue` | `#e9e9eb` 分割线、`#a0a0a5`、`11px`、`16px` 圆角、44px 链接；**`SettingsView.vue:394, 397, 416, 429`**（`.settings-value`、`.settings-row > svg`、`.about-badge`、`.about-section-heading time`）在 `#F5F5F5` 上用 `var(--muted)` | `var(--line)`、**`var(--muted-surface)`**（含 `:394, 397, 416, 429`）、`>= 12px`、`20px` 圆角、`>= 48px` | R4 + AA `>= 4.5:1` |
| `LockView.vue` | **`:145` 使用 `<div class="settings-group">` 但该类仅在 `SettingsView.vue:363` scoped 定义（全局与 `LockView` 均缺失）**；预设卡片内 `.primary` 开始按钮与 `#F5F5F5` 卡片内 `.muted`；触控/辅助文本未显式锁定 `>= 48px` / `>= 12px` | 将 `.settings-group` 提升至 `src/style.css`（或在 `LockView.vue` 显式定义 `background: var(--surface); border-radius: var(--radius);` `20px`）；卡片内次文字用 `var(--muted-surface)`，所有按钮与链接 `>= 48px`、辅文 `>= 12px` | R4 + 组件样式完整性 |
| `ProtectionHelpView.vue` / `ProtectionDiagnostics.vue` / `RecoverySheet.vue` | `14px/16px/18px` 卡片圆角；`ProtectionDiagnostics.vue:95, 99`（`.capability-state`、`dt`）在 `#F5F5F5` `.capability` 卡片内用 `var(--muted)` | 全部统一为 `border-radius: var(--radius);`（`20px`）；`ProtectionDiagnostics.vue:95, 99` 改 **`var(--muted-surface)`** | `20px` 圆角 + AA |
| `InfoHint` / `DndSetting` / `NotificationSetting` | 44px `.hint-trigger`、`11px` `.compact-status` | `>= 48px`、`>= 12px` | R4 锁定参数 |

- **输入框 A 方案与动效**：全部 text/number/date/select/textarea 统一 `#F5F5F5` + `1.5px solid #ECECEE` → 聚焦白底 `#FFFFFF` + `1.5px solid #838388`，禁止外围 `#EF4E36` 焦点环；统一线性 SVG 图标（`Icon.vue`，`@lucide/vue`, `stroke-width: 1.8`）；`150–220ms` 淡入并尊重 `prefers-reduced-motion`；禁止装饰渐变、禁止卡片套卡片、禁止标题上方 kicker/eyebrow。

---

## 7. M2 / M3 / M4 与 0.3.x UX 审计门禁清单（5-Gate Rubric）

M2（核心专注流与学霸模式）、M3（日历、统计、设置、锁机与诊断）、M4（全量验收）及 v2 #32–#39 交付前按受影响范围核验以下五道门禁。

### Gate 1 — 设计先于代码与硬性预算（R1）
- [ ] 修改 `.vue` 前已完成 `docs/ux-spec.md` 对应线框图与减法清单核对。
- [ ] 任意主视图与弹窗第一眼 **主 CTA `<= 1`**，**开关或决策组 `<= 4`**。
- [ ] **弹窗套弹窗 = 0**（全流程实测 `document.querySelectorAll('dialog[open]').length <= 1`）。
- [ ] **主屏工程/诊断/降级控件 = 0**（无 `studyDisplay` 10 态、无 `ProtectionStartSummary`、无 `DndSetting`/`NotificationSetting` `runtime-only`、无 `升级恢复副本`、无平铺 6 项防绕过开关）。
- [ ] 7 项高频学生操作全部实测 **`<= 2` 步**完成。

### Gate 2 — 渐进披露、术语与 ADR 0004 原生边界（R3、R4、`GLOSSARY.md`）
- [ ] 所有重定位能力（`FORCE-01..06`、独立/全局白名单、权限矩阵、8 行能力诊断、故障恢复、`UpdateSettings` 升级恢复副本、独立锁机）均可从二级设置 `<= 3` 步到达，**0 能力丢失**。
- [ ] 学霸专注锁定期间，主导航锁定 `/focus`，同时 `/help`、`/emergency`、`/recovery`、`/permissions` 可达且可返回 `/focus`。
- [ ] `strict`（`noPauseEnd`）仅原生约束倒计时，不约束正计时；`lockMainInterfaceRestricted` 仅保留在 `LockView`；`observeControl()` 保持只读；`resolveEffectiveProtection()` 保持唯一展开缝；不宣称系统强停/卸载免疫。
- [ ] 全界面禁用词为 0（尤其结果页使用 **`本次专注正常结束`**，禁用 `本次专注已完成`）。
- [ ] 轻看护豁免、待机遮罩抑制、白噪音锁屏播放与原生通知控制符合 §2.2。手动补录仅进入时间轴与时长统计。

### Gate 3 — `docs/brand-spec.md` 视觉与 `impeccable` Craft Floor 核查（R4）
- [ ] 色板严格为 `#FFFFFF` / `#F5F5F5` / `#222222` / `#737378`（卡片内 `#66666b`） / `#EAEAEA` / `#EF4E36`，0 装饰渐变。
- [ ] 离线 `Nunito` 计时数字 + 中文无衬线；辅助文字 **`>= 12px`**（含 ECharts 与 7 列课表）；页边距 `24px`；卡片圆角统一 `20px`；输入框符合 A 方案。
- [ ] 全部交互控件 **`>= 48px × 48px`**；`390×844` 与 `1.3×` 字体缩放下 **0 横向溢出**。
- [ ] Craft Floor 禁用项清零：0 嵌套卡片、0 单侧 `border-left` 色条、0 emoji/Unicode 假图标、0 标题上方 eyebrow。五栏核对 §5.0 的顺序、路由、可访问名称与当前项。农场核对自然周步进、真实计数、最多 36 只可点动物和减少动态效果。P0 使用浅色基线。

### Gate 4 — 启发式与认知负荷评分（`impeccable` + `ux-heuristics`）
- [ ] 认知负荷 8 项检查（`Single focus`, `Chunking <= 4`, `Grouping`, `Visual hierarchy`, `One thing at a time`, `Minimal choices <= 4`, `Working memory`, `Progressive disclosure`）失败项 **`<= 1`**。
- [ ] Nielsen 10 条启发式总分 **`>= 30/40`**，单项不低于 `2` 分（Brief-Exempt 纯图标底栏除外）。
- [ ] Krug Trunk Test：任意页面可 3 秒内识别当前位置、唯一主操作与返回路径。
- [ ] 多角色走查（首次学生 / 高频学生 / 单手握持 / 无障碍读屏与对比度 / 空态长文案拒权及 Web 预览）通过：
  - **P0 / Severity 4（阻塞/灾难级）**：**0 个**
  - **P1 / Severity 3（严重级）**：**0 个**
  - **P2 / Severity 2（次要级）**：全项目 `<= 3` 个并记录

### Gate 5 — 构建、自动化测试与 OPPO 真机验证（M4）
- [ ] `npx vue-tsc --noEmit`（包含在 `npm run build` 中）、`npm test`（`vitest`）与 `npm run build`（`vite`）全部通过，0 回归。
- [ ] 黑盒 E2E 套件（`TEST_INFRA.md` / `TEST_READY.md`）全通过（含 0 嵌套 `<dialog>`、主 CTA `<= 1`、0 横向溢出）。
- [ ] 0.3.x 对应切片补齐待机首屏、滑动调时及键盘替代、左滑放弃、切换日程与课表、补录、农场及周图 SAF 导出、365 日热力图滑选门禁，随路由迁移同步更新自动化入口。
- [ ] OPPO 物理真机经 `orca emulator`（`adb`）实测待办、学霸模式、专注/休息、日历/课表、统计与权限恢复流程无布局异常与原生层报错。
