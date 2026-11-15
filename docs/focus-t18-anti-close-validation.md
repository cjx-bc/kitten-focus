# T18 / FORCE-05：精确防关闭（来源已实现，设备验收未完成）

日期：2026-11-15。任务 #19 保持开放；不能将本记录中的编译、浏览器检查或待运行脚本视为 A12 全部通过。

`preciseAntiClose` 是独立、默认关闭的增强选项。在开始专注或锁机时，从保存的偏好冻结到同一原生会话的 protection.enhancements；运行中改偏好只影响下一轮。普通暂停仍受本轮保护，到期只读观察立即停止执行，结束、休息和重启中断沿用统一生命周期清理。

## 自主实现与隐私范围

新增 `FocusAntiClose`、`AntiCloseWindow`、`AntiCloseSystem` 和 `AndroidAntiCloseSystem` 是独立编写的执行器，没有复制候选源码、增加依赖或变更许可。DetoxDroid 固定提交 `f14d2352c1b66a05508253be40dfa478b794d0d4` 仅作为有界扫描、身份区分和恢复责任的设计对照，来源及许可见 [候选核验](references/github-focus-candidates-2026-11-15.md)。平台门禁依据 [Android 边界](references/focus-protection-android-boundaries.md) 中的无障碍和设备管理限制。

只有本轮选择了该能力、未主动撤销、未到期/重启且无障碍授权和连接真实存在时，才进入识别。先核实窗口包是已知且带系统应用标记的 Settings/安装器包，再限制到明确的 app-info、accessibility、admin 或 uninstall 类。根节点所属包还必须与事件包一致。节点最多 160 个、深度 12、单节点文字最多 256 字；只临时读取标题、包名、节点类型和动作文字，不保存或记录节点内容，不读取聊天、网页等任意应用正文。API36 无障碍详情的标题只存在于已知 `com.android.settings:id/collapsing_toolbar` 标题元数据中，因此仅在该精确 ID 无文字时读取其短标题；不读取任意 content-description。无匹配的系统/OEM 页面放行；不将全部设置或安装器拦截。

精确包名/本应用服务组件可识别目标。AOSP 缺少包名时，仅在已知应用标题 ID 上使用本应用安装名称；若任何可见已安装应用同名，或可见应用超过 512 个而无法在预算内确认唯一性，停用名称回退并显示支持受限，不能将同名其他应用视为小猫。目标动作还需匹配中文/英文强退、卸载、服务使用/停止或管理员停用。任意 Settings switch_widget、Wi-Fi 页或其他应用标题不能触发。QA 构建单独显示“小猫专注 QA”，生产应用名称不变，避免与用户原安装的同名产品混淆。

无障碍声明现在需要 `canRetrieveWindowContent=true` 和 `flagReportViewIds`，专用于上述系统设置识别。服务内容事件先按系统包及目标类筛选，才调用统一控制边界；没有轮询扫描或自发重试循环。1500ms 内重复事件不重复触发返回。动作提高已有 MainActivity 任务，不运行第二套返回/回桌面执行器。请求返回成功本身仅显示 `armed`；后续真实主窗口焦点或窗口事件确认返回后，才显示 `protecting`。异常或三秒无确认为 `failed`，不可把上一次成功当作本次成功。

## 身份与恢复

`observeControl().antiClose` 与 `protectionStatus().antiClose` 分别报告偏好、本轮请求、授权、连接、实际返回证据及状态。`identity` 分开返回无障碍、普通管理员、device owner、profile owner；检查失败返回 unknown。当前只使用普通无障碍返回，`systemUninstallBlocked=false`，明确说明普通管理员不等于所有者。本版本不申请/安装管理员、不调用 owner provisioning、不执行系统卸载阻止策略，也不保证系统强停后继续运行。即使存在更高身份，也不以检测成功冒充已执行策略。

`FocusRecovery` 的 `preciseAntiClose` 责任在本轮开始前保存。新增注册的 capability effect 将该责任绑定到实际执行器证据清理，不只写一个诊断项目。主动恢复先持久写入 withdrawn，再清理；失败保留可重试责任。重建、无障碍重连不再启用本轮主动撤销的能力。恢复不停止计时、不放宽严格规则、不删除偏好或名单。此路线没有永久修改系统开关，服务死后也不留下锁定系统策略。

由本应用“前往无障碍设置”进入的必要授权窗口提供五分钟临时放行，可修复或撤回权限；帮助、故障恢复、电话和无关设置继续可用。该放行明确写在原有样式的帮助中，而不是隐藏的绕过条件。

## 已有证据与待验收

以下是首次源码提交时的历史记录；后续真实设备失败、修复和当前结果见下一节。

- 已获得真实浏览器红→绿：选择 preciseAntiClose 时旧代码静默开始，本次改为拒绝不支持的原生保护；7 个 control bridge 测试及全套 37 个 host 测试通过。
- TypeScript/Vite 构建通过。隔离 `.qa` 的 app 和 androidTest APK 已在 JDK21、API36 SDK、`--no-daemon --max-workers=2` 下成功构建。后续同名支持状态文案补丁和合并 T15 后仍需最终组合重建；合并后 38 个 host 测试通过，Vue/TypeScript/Vite 构建通过。
- 原生测试写在用户已确认的 FocusControl 命令/状态边界，仅替换 OS 窗口、身份及返回动作。7 项覆盖自身/其他应用、中文/英文动作、任意设置开关、同名应用、遍历上限、去重、真实返回确认、动作失败/重试、到期、恢复后重建及重连。测试已成功编译，但因共享模拟器租约尚未执行，不报告原生运行通过。
- Orca 浏览器 390×844 检查原有学霸 Sheet：默认关闭、独立保存、显示本机不支持、权限按钮禁用及帮助正文可读；截图位于工作树 `artifacts/t18/original-sheet-390.png`。沿用原黑白组件、字体与开关，未改五栏。
- `scripts/anti-close-device-smoke.mjs` 已做 Node 语法检查，尚未运行。它通过真实 WebView 原生桥接和外部 adb 打开自身 app-info（强停/卸载入口）、卸载确认、无障碍详情，再比较无关设置、其他应用 app-info、拨号、必要授权、恢复和重连。只打开破坏性入口，绝不确认强停/卸载/撤权；保存并恢复 QA 业务数据、原服务列表和授权开关，不触及生产包。需显式设置 `ADB=D:/KittenFocus-Android/sdk/platform-tools/adb.exe`、`ANDROID_SERIAL=emulator-5580`，并先取得共享设备租约。

## API36 真实失败回归（2026-11-15）

首次真实脚本在共享根目录 `artifacts/focus-control/api36/t18-device/results.json` 保留失败：自身 app-info 未返回、卸载确认未返回、从 shell 打开无障碍详情被 `OPEN_ACCESSIBILITY_DETAILS_SETTINGS` 签名权限拒绝。7 项旧原生测试通过并未覆盖这些真实系统元数据。

本次在活动所有权为 null、QA 无障碍关闭时，检查真实 Settings/安装器 XML，再经 FocusControl 公开命令/观察边界逐项执行红→绿。仅替换 OS 元数据和返回动作，真实捕获的固定系统页面保留在 `androidTest/assets/anti-close-api36`；没有增加生产窗口转储 API。

- API36 Compose `SpaActivity` 无 header ID。识别要求 App info 页标题、首个 ScrollView 内容组中的唯一自身安装名，以及 Force stop 与 Uninstall 两个动作共同出现。名称位于正文或列表、其他应用标题或同名冲突不能替代自身标题。
- Google 安装器的自身确认标题为 `android:id/alertTitle`，动作是 OK。只有精确卸载问题 `android:id/message` 与正向按钮 `android:id/button1` 同时出现才补足动作证据；普通 OK 不触发。
- 无障碍详情的 Use 文本在原始树深度 14，未放宽深度预算。已知工具栏自身短标题与深度 11 的 `main_switch_bar` 共同确认自身服务页面；普通 `switch_widget` 不触发。
- 脚本先在非活动状态观察实际 Settings 无障碍列表的 QA 服务行位置，活动后从列表真实点击进入详情，不再调用被限制的详情 Intent。UiAutomator 只用于非活动准备，活动验证继续依赖真实服务、窗口焦点及桥接状态。
- API36 会复用 SpaActivity；打开 app-info 时清理该 Settings 任务，并在非活动准备确认 QA 名称与 Force stop 已渲染，避免把先前 Settings 应用详情误当自身详情。替换数据后等待真实应用初始化再开始本轮。

工作树证据：`artifacts/t18-red-spa` → `t18-green-spa`；`t18-red-uninstall` → `t18-green-uninstall`（原生 9 项通过）；无障碍红证据在共享根目录 `artifacts/focus-control/api36/t18-service-red`。真实 `t18-actual-spa-trace` 与 `t18-actual-uninstall` 已分别观察自身入口返回主窗口后变为 protecting。

第一次修复后 SPA 实际返回了主窗口，但三秒内未确认而诚实报告 failed，保留在 `artifacts/t18-actual-spa`。随后相同 APK 的带时序重跑通过，最终组合中再次通过；未通过延长超时或把 startActivity 成功当作保护成功来掩盖失败。这个早期延迟风险没有删除，也不以过去的成功覆盖新一次未确认的返回。

最终 QA APK SHA-256：`0d1b53461d99d4ea8f9d24c0bc72f26f8a2ae0bc8248db4ffa368a5eff77faaa`。JDK21/API36 的 `:app:assembleDebug :app:assembleDebugAndroidTest` 成功；54 项 host 测试及 TypeScript/Vite 构建通过。设备最终结果：

| 边界 / 场景 | 结果 | 工作树证据 |
| --- | --- | --- |
| FocusControl 原生公开边界，原有 7 项与 3 项真实系统元数据回归 | 10/10 通过，无跳过 | `artifacts/t18-green-final-native` |
| 自身 app-info、卸载确认、无障碍服务详情 | 3/3 真实返回且分别记录新 lastReturnedAt / lastTarget；实际 mCurrentFocus 为 QA MainActivity | `artifacts/t18-final-device/results.json` 与 `return-timeline-*.json` |
| Wi-Fi、其他应用详情、真实拨号页、必要授权 | 4/4 保持可达 | 同目录 01/02/06/07 截图及结果 |
| 主动恢复后计时保留、服务重连不再启用本轮防关闭 | 通过 | 同目录 08 结果及截图 |
| 测试恢复 | owner 为 null，原 services=`null`、accessibility_enabled=`0` 原样恢复 | 同目录 `baseline.json` / `restored-baseline.json` |

实际脚本 `scripts/anti-close-device-smoke.mjs` 默认运行完整 8 场景；`T18_SCENARIOS=03,04,05` 可缩小诊断循环，`T18_OUTPUT` 可将每次失败与重跑分别保存。三个真实元数据回归均先在公开边界运行到自己的自身目标断言失败，再实现对应识别；未用“无异常”冒充行为通过。未确认任何强停、卸载或撤销权限动作；无生产包变更、owner provisioning 或额外管理权限。

中文系统页面、额外管理身份及代表 OEM 尚待设备验收；其他语言、厂商入口、真实紧急来电和系统强停后行为均未验证。API36 本次实际身份是普通无障碍，普通管理员、device owner、profile owner 均为 false，未执行设备策略。无障碍不再连接时本路线本就无法拦截。完整 A12 不应关闭，不能把单一 API/语言结果当作“全部防关闭已完成”。
