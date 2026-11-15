# T14 / FORCE-01：桌面与最近任务限制

日期：2026-11-15。普通安装，无障碍窗口事件路线。`navigationHomeRecents` 是现有 `preferences.protection.enhancements` 中独立、默认关闭的选项，不要求学霸或严格开关同时打开。

## 实施与来源

`FocusNavigation.java`、`ControlSession.java`、现有 `FocusControl` / 无障碍服务的接入及 Vue 设置节独立编写，没有复制 Curbox、DetoxDroid、Warden 或其他应用源码，没有增加第三方依赖或改变分发许可。平台事实沿用 [Android 能力边界](references/focus-protection-android-boundaries.md) 中 S7/S9 及应用现有 API；没有宣称获得 device owner、LockTask、系统 Home/Recents 禁用权或防强停能力。

开始时由原生从持久偏好取得本轮增强快照，检查可识别 launcher、无障碍授权与真实服务连接，再先记恢复责任。普通暂停继续适用。事件执行器只匹配系统解析得到的 HOME Activity、launcher 自身的明确 Recents/Overview Activity，以及明确的 SystemUI Recents Activity。任意 SystemUI、权限弹窗、IME、拨号和全局设置均不作为导航目标。

执行器提高现有 MainActivity 的任务，不新建阻挡 Activity。明确 SystemUI Recents 先请求 BACK；launcher 同时承载桌面和 Overview 时只报告“桌面或最近任务窗口”。同一次返回尚未得到确认时不重复启动。事件执行器不读取窗口正文、不上传窗口内容。

## 真实状态与恢复

`CatFocus.protectionStatus().navigation` 和只读 `observeControl().navigation` 分别返回 `supported`、`authorized`、`connected`、`requested`、`preferenceEnabled`、`active`、`state`、原因、最近实际返回时间与窗口类别。开始和授权完成只得到 `armed`，不会显示执行成功；仅在真实目标事件请求返回后，收到本应用 MainActivity 的后续无障碍窗口事件或真实 `onWindowFocusChanged(true)` 回调，才标记 `protecting`。返回请求失败或超过三秒未观察到返回标为失效。读状态不写数据库、不结束专注。

`FocusRecovery` 保存独立的 `navigationRestriction` 责任，在撤销动作前持久保存本轮 `withdrawn`。恢复不结束计时、不放宽严格约束、不删除偏好，重建或服务重连不重新施加已撤销的本轮导航限制。结束、休息、设备重启/到期待结算时事件执行立即失去本轮资格；生命周期结算清理责任和本轮返回证据。本路线没有永久修改系统导航策略，服务退出后也没有系统导航开关需要后台解锁。

## 验证

- 浏览器边界红→绿：浏览器导航能力不得声称授权/执行，选择原生导航增强后不得静默开始。`npm test` 目前 36 项通过；TypeScript/Vite 构建通过。
- 原生边界红→绿：隔离 QA 包 `com.xiaomao.focus.qa`，`emulator-5580` / API 36。最初真实原生失败为 `No value for navigation`；接入后 `FocusControlTest` 10 项全过（无跳过），含独立配置、本轮冻结、暂停、已撤销后重建、实际返回确认、到期只读和休息释放。
- 原生红/绿产物与输出位于工作树 `artifacts/t14/red/result`、`artifacts/t14/green/control`。只安装 `.qa`，未清空或变更原始 `com.xiaomao.focus`。
- 真正系统输入另由 `scripts/navigation-device-smoke.mjs` 执行。它使用外部 adb、真实 WebView 原生桥接和前台 Activity 证据，不在有无障碍服务的用例中依赖可能抑制服务的测试框架。脚本保存并恢复原数据、授权服务列表、授权总开关和导航 overlay。

第二轮外部输入已确认按钮 Home、普通暂停中的 APP_SWITCH 均实际返回 MainActivity，且本轮原生返回时间分别更新为 `1794776377867` 和 `1794776380900`，状态为 `protecting`；原 Sheet 默认关闭/独立保存、必要无障碍授权页面可达也通过。手势 Home 回到 MainActivity 后仍缺少确认，保守状态保持 `failed`，没有作为通过。拨号器检查发现脚本可能在 Activity 切换瞬间取得空前台行，因此已收紧为匹配实际默认拨号器包，待重跑。

手势确认补充读取 `onNewIntent` 后 100、400、1000 毫秒的真实 decor window focus，仅确认已有的本轮待处理返回；不是凭 Intent 送达推定成功。此最新补丁尚待构建与设备重跑，完整 T14 不应关闭。后续还需完成手势 Home/Overview、精确拨号器、恢复后 Home 可达和结束休息释放的全脚本验收。OEM 真机、真实来电/紧急拨号、其他 Android 版本、分屏/桌面差异仍需设备矩阵验证；本机结果不能替代这些条件。

## 首轮真实输入发现与修复

首轮外部脚本已通过原 Sheet 默认关闭、独立保存和真实按钮 Home 返回。按钮 APP_SWITCH 的前台 Activity 与截图均显示回到暂停计时页，但 Android 没有再次发出 MainActivity 的 `TYPE_WINDOW_STATE_CHANGED`；当时按保守规则标记超时失败，没有把前次 Home 成功延用成成功证据。修复增加 MainActivity 真实窗口获得焦点回调，仅在本轮存在待确认返回请求时记录确认；不会凭 `startActivity()` 返回或 `onResume()` 推断成功。

切换导航 overlay 会使 Android 重建 Activity/WebView。脚本在每次切换后关闭旧 CDP/forward 并重新连接，保证后续桥接作用于当前页面。失败产物保留在 `artifacts/focus-control/api36/t14-device/failure.json`、`failure.png`；恢复后的基线保存在 `restored-baseline.json`。首次插桩实际输入用例因测试环境无法保持服务绑定而只在前置条件失败，没有作为导航行为验收，最终改为外部真实输入脚本。

## 最终 API36 实际复验

集成流程使用包含最终窗口焦点补丁的 T12 合并 QA APK（构建在 `958dbb2` 基线上），重新执行全部外部脚本，九组场景全部通过：原 Sheet 默认关闭与独立保存、按钮 Home、暂停中 APP_SWITCH、精确匹配真实默认拨号器、必要授权页、手势 Home、手势 Overview、故障恢复保留计时而解除 Home 限制、下一轮重新生效及正常结束/休息释放。每次返回同时要求本轮 `lastReturnedAt` 更新、`active=true`、实际 topResumedActivity 为 MainActivity 和当前计时页可见；没有只以动作返回值通过。

最终前置故障来自脚本在已重建的 WebView 中重复 `Page.reload`，旧 CDP 上 `document.body` 为 null；删除这个不必要的重载，仍保留导航 overlay 后重新连接及真实 DOM 等待。未修改产品导航规则。证据 `artifacts/focus-control/api36/t14-device/results.json` 和九组实际系统截图；基线服务 `null`、无障碍总开关 `0`、原 gestural overlay 已恢复。此前失败证据保留为历史，不覆盖 OEM、真实来电或其他 API 的未验收范围。
