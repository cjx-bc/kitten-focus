# 完整专注保护实现进度

集成分支：`integrate/focus-control`。实现基线：`0aba658`，包含已确认的规格、任务图与原型。所有功能按父 issue #1 和子 issue #2—#24 验收；此文记录开发证据，不代替真实功能结果。

## 本轮环境

- 用户恢复开发并指定后续改用 D 盘新建官方模拟器：`D:\KittenFocus-Android`，AVD `KittenFocus_API36_QA`，ADB `emulator-5580`，Android16 / API36。启动后已核对 AVD 名、API 与 `sys.boot_completed=1`。后续设备命令显式指定此序列号，ADB 使用该目录的 platform-tools；项目构建 SDK 仍为原有 `.tools/android-sdk`。
- MuMu `127.0.0.1:16416` / API35 仅是暂停前的历史证据，不再作为本轮默认目标。测试机更换不把旧 API35 通过结果算为 API36 已验证。
- 新模拟器已有 QA 安装，覆盖前已保存该包私有目录和系统壁纸/授权/设备状态到本机忽略目录 `artifacts/focus-control/api36-device-baseline`。原 MuMu 及其应用数据不改动。
- 开始前已保存现有 `com.xiaomao.focus` 私有数据、安装 APK、无障碍/通知监听器、壁纸、设备策略和 app-op 的只读快照，位于本机忽略目录 `artifacts/focus-control/device-backup/20261115-131923`，不提交敏感数据。
- 后续主应用测试优先使用 `-PtestApplicationIdSuffix=.qa` 独立安装，不清除或卸载原有包。通知/壁纸实验使用独立 probe 包。
- 基线：23 项 Vitest 通过；TypeScript 与前端构建通过。尚未据此声明新增控制通过设备验收。
- 多个开发工作区可并行编辑；Gradle 构建和虚拟机修改由主流程串行调度，避免争用。

## 初始执行前沿

| 任务 | 工作分支 | 当前产物 |
| --- | --- | --- |
| T01 / #2 | task/focus-t01 | 已合入；25 项宿主测试、11 项虚拟机原生测试、实际 WebView→CatFocus 专注/暂停/继续/结束/休息闭环通过 |
| T02 / #3 | task/focus-t02 | 已合入；API35 通知正常到期、公开短时重新暂缓的提前恢复、更新/撤回/分组/重复/必要例外/断连完成探针验证 |
| T03 / #4 | task/focus-t03 | 已合入；3 组宿主契约、API36 Java 编译与 APK 构建通过；实际设备拒绝不可恢复基线后未改壁纸，完整效果仍待验证 |

T01 源码提交 `19b3a7d`，合入提交 `65ed4bc`。只读观察不结算、不写记录；显式生命周期处理沿用旧规则。测试仅在 `com.xiaomao.focus.qa` 运行，设备证据位于本机忽略目录 `artifacts/focus-control/t01/`。旧包 `com.xiaomao.focus` 未清空或覆盖。

T02 合入提交 `6c42dcb`。API35 普通 listener 对已暂缓的原 key 再调用公开 `snoozeNotification(key, 1L)`，五轮在 208—240ms 恢复，原包、key、PendingIntent 及真实通知栏点击保持；不存在通用公开 unsnooze 方法不代表本设备无法通过重新暂缓改期。该路线仍需产品级批量释放、正计时及更多 API/OEM 验证。探针的两包均已卸载，监听授权恢复原始 null，详见 notification probe 的 RESULTS。

T04 / #5、T05 / #6 已完成本轮 API36 验收并关闭：普通学霸模式实际验证允许 Chrome、拦截 Settings 并显示当前事项、暂停仍限制、结束和休息解除；严格模式实际验证开始确认/取消、原生拒绝各提前操作、Android 返回/通知返回 intent/重载/进程重进保持同轮、一分钟自然到期只记一次并进入五分钟休息、正计时仍可暂停结束。运行器分别为 `scripts/study-mode-device-smoke.mjs` 和 `scripts/strict-mode-device-smoke.mjs`，证据在本机忽略目录 `artifacts/focus-control/api36/{study-device,strict-device}`。通知返回 intent 已执行，不将其描述成实际通知栏点击或声音验收。

T08 恢复控制和 T13 声音辅助已分别合入 `537b7f3`、`5c83f65`；共享恢复确认可逐项撤销应用限制和本应用声音规则，保留严格计时与偏好。合并后的四组恢复、六组声音与两组名单原生测试在 API36 共 **12 项全部通过，无跳过**，证据在 `artifacts/focus-control/api36/t06-recovery-dnd-final`；共享恢复的实际 UI/系统组合仍须执行 `scripts/recovery-device-smoke.mjs`。

T06 独立白名单已合入 `a009621` 并关闭 #7。除原生名单矩阵外，实际编辑/保存/开始后 Chrome 可用、Settings 被拦截，修改全局及恢复跟随不改变本轮、下一轮才跟随最新全局、另一旧待办继承、空独立名单均已通过设备操作。运行器 `scripts/item-whitelist-device-smoke.mjs`，设备证据保存在 T06 工作区的 `artifacts/focus-control/api36/item-whitelists`。首次原生合并复验的失败来自旧测试比较整段 JSON，而观察快照新增了明确的撤销状态；已改为逐项检验名单来源、包集合和撤销语义，并实际重跑通过。

严格模式进一步补查了真实通知栏点击：旧通知只打开通用主 Activity，实测仍停在 `#/tasks`。`4ad8c03` 修复为独立计时返回 Intent，保留实际通知栏截图及专用点击测试；新 APK 已构建，等待设备租约后复验。此前直接 Intent 的测试结果仍保留，不冒充真实点击通过。

`4ad8c03` 的实际通知栏点击已复验通过：截图可见本轮标题，点击返回计时页，之后重载和进程重进仍是原严格会话，最终自然到期。`scripts/recovery-device-smoke.mjs` 的四组实际组合场景也已全部通过：取消保留真实拦截与声音规则、确认撤销两者但保留严格计时和偏好、重建不重开、到期只记一次并进入原休息。T08 / #9 与 T13 / #14 已关闭；声音只验规则与生命周期，不将无音频模拟器当作声学验收。

T07 临时放行已合入 `c16f60d` 并关闭 #8：四组原生测试及真实取消、Settings 放行、无后续操作下约 59.241 秒自动重新拦截、永久名单不变均通过。证据 `artifacts/focus-control/api36/t07-device`、`t07-complete-native-green`，最终宿主测试 33 项及前端构建通过。

T09 已合入 `eb158b5` 并关闭 #10；最新源码重新构建后六组原生测试与两组实际 UI 流程全部通过，包含伪造 kind 不能改变专注所有权、独立名单保存/复用、取消和确认解除、真实一分钟到期、不记专注和不进入休息。最终计时字体及阻挡页锁机语义已修正并复验。

T11 固定截止通知已合入 `501413f`；独立发送端的暂缓、更新 revision2、原键/包/UID/PendingIntent、到期和真实通知栏点击回执已经通过。合并后的两组新增锁机边界暴露测试未先退出既有五分钟休息的问题，已修正 fixture。原通知被阅读后覆盖历史恢复状态的真实缺陷由 `118fe5b` 修复：最小回归先失败后通过；随后十组原生边界加一组双应用实际场景共 **11 项通过**，证据 `artifacts/focus-control/api36/t11-merged/history-diagnostic`。源代码诊断日志已移除。实际消费前显式核实系统活动集合，T12 进一步保留系统点击原因，补无恢复回调先到的时序。

当前 T10 严格锁机、T12 提前/开放式通知释放及 T14 限制桌面/多任务并行实现。严格锁机九组原生测试通过，真实一分钟界面正在复验；T12 普通提前释放首组已先失败后通过，第二组有限续期已实测失败后实施；T14 十组原生测试及实际 Home 返回通过，最近任务的真实窗口确认正在修正。T03 完整壁纸矩阵不因仅门禁通过被关闭为成功。

恢复执行时：T04/T05 源码已合入集成分支，API36 设备复验排队；T06 独立白名单、T08 故障恢复、T13 声音辅助分别在既有工作区由新子 agent 继续。新 API36 镜像实际能解析 `com.android.wallpaper.livepicker/.LiveWallpaperChange`，此前 MuMu 缺选择器的限制不能直接套用，壁纸探针可在新机重新验证。

通知提前释放、不同 API、真实来电、OEM 后台及壁纸支持须按设备结果报告，不能因实现范围已确认而假定系统允许。原有 UI 保持；第三方复制许可未确定的模块使用独立实现，记录参考来源。
