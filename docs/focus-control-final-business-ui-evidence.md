# A03 与原业务实际 UI 回归

设备：唯一租约 `D-ADBemulator5580`，Android 16 / API 36，QA 包 `com.xiaomao.focus.qa`，版本 10。执行时间为 2026-11-16 00:49—01:01 UTC（本地 2026-11-15 晚间）。设备租约已释放；本轮没有 Gradle、cap sync、安装、生产数据操作、issue 关闭或推送。

实际已安装 app SHA256：`4d59b8b6f182e40cffb94a5c03c119c23c9c5c09c0084eb38fdab16c8ae574b9`。范围是 R1 原生开始前门禁修复后的 QA10；R2/R3 尚未安装，因此以下不是最终 R2/R3 的 UI 通过证明。runner checkout 最初为 `833a8a1`，夹具修正在 `0475f71` 及后续短批次修正提交。报告中的 sourceCommit 仅表示 runner checkout，安装哈希是产品身份。

所有证据位于集成根目录 `E:/codexseeson/fanqiezhong/artifacts/focus-control/api36/`，业务备份不进入证据。

| 范围 | 实际结果 | 证据 |
| --- | --- | --- |
| A03 编辑名单 | 3/3 场景通过，complete=true，cleanupCompleted=true | `final-whitelist-editor/results.json`，01/02/03 PNG |
| 真实五分钟批次 | 五栏、计时及完整休息 3 场景通过；实际等待 **302271ms**；随后返回待办的选择器等待失败，整轮 complete=false，cleanupCompleted=true | `final-business-regression/timed-phase-results.json`，`07-rest-completed-no-auto-focus.png` |
| 原业务短批次续验 | 5/5 场景通过，complete=true，cleanupCompleted=true；**未再次等待五分钟，也不声称该批验证到期** | `final-business-regression/results.json`，08—15 PNG |

原业务结果来自明确的两个运行：真实计时批次保留原失败；短批次用 `--details-only` 避免重复等待，重建独立合成数据后继续验收。两个批次都验证五栏与首次计时，这些重复场景不累计为不同通过数。联合独立场景是六项：五栏、首次原生计时/结束确认、五分钟休息、同一子待办再用/提前结束/手动休息、日历统计真实记录、课表/原设置入口。不能把该结果改写成“一次脚本全通过”。

A03 实际覆盖：学霸关闭仍可编辑；实际安装应用名/图标；小猫固定允许且不能取消；未安装包保留原包名；名称及包名搜索；无结果仍保持已选数量；多选后关闭系统筛选仍保留选中；取消不保存；确认后重新打开仍保存包集合，固定自身不混入可编辑名单。未重新执行独立名单对外部应用实际阻挡矩阵，它属于已有 `item-whitelist-device-smoke.mjs` 的不同范围。

原业务实际覆盖：点击原顺序五个 icon-only tab、无横向溢出；原 Sheet 创建主题与可复用子待办；正计时暂停时长稳定、重载保持同轮、继续及后台计时；真实 Android WebView confirm 先取消再确认（UIAutomator 识别 Android 按钮资源 ID，真实触摸，未替换 window.confirm）；一条实际完成记录自动进入固定 300000ms 休息，取消退出不改变期限；等候真实到期后无额外记录/统计、无自动下一轮；同一 itemId 改为一分钟倒计时提前结束，手动休息与确认退出，历史独立保留 completed/early；日历关联同一待办、实际页两条记录；统计累计 2 次、待办分组与两条记录 Sheet；课程/学期及原设置可达。

初次准备与调试失败均保留：A03 `attempt-01-failed.json` 是缺少合成保护偏好字段，`attempt-02-interactions-passed-cleanup-drain-failed.json` 是远端 tar 输入关闭后提取未完成导致清理失败；原业务 `attempt-01` 至 `attempt-04` 分别是路由等待、嵌套选择器引号、一次重载超时、原生截图未遵循绝对证据目录。这些都在测试夹具修正，未改产品适配错误选择器。失败时先恢复并校验原始基线，再进入下轮；两个清理失败通过保留的私有归档手动恢复，逐文件校验 951/951 一致后重跑。

每个最终批次的 privateBaselineDigest 与 privateBaselineRestoredDigest 相等：退出时关闭 CDP/QA 进程，精确恢复原数据库及偏好文件字节；重启后公开业务数据与原基线一致，系统无障碍授权集合、通知监听授权集合、壁纸标识相同。未操作系统授权或壁纸；基线恢复后重新同步业务提醒。没有留下活动专注/锁机/休息或待恢复责任。

PNG 是可审阅截图；自动断言只能证明结构和交互。原字体、间距、色彩、五个图标、Sheet 和圆形控制仍由主协调器审阅最终截图。短批次与计时批次使用相同文件名的初始截图可能由后一次重写；07 到期图仅来自真实五分钟批次，08—15 来自短批次。最终 R2/R3 共同 APK 的截图/原生回归、真实升级及组合验收由主协调器另行记录。
