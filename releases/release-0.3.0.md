# 小猫专注 v0.3.0 · 专注孵育、一周农场、时间轴统计与三档防分心（内测版）

- **专注待机首屏与单局黑猫孵育循环（`FocusView.vue`、`FocusEngine.java`、`PetGraphic.vue`）**。应用默认进入 `/focus` 待机页，支持拖动表盘刻度 `5～180` 分钟无级调时及正计时、待办快切与屏幕常亮；专注期小动物随进度呈现 3 阶段成长互动，前 `10` 秒内支持无责撤回（不记入记录与好感），`> 10` 秒支持「左滑放弃」及打断原因记录；按专注时长推进好感度（放弃扣减 `5` 点至 `0` 止）并在大于等于 `5` 分钟时记录小动物产出于农场。
- **12 只百兽双轨图鉴与多毛色皮肤（`pet.ts`、`petSprites.ts`、`PetPickerSheet.vue`）**。默认解锁小黑猫并开放 12 只伙伴（10 只按好感阶梯解锁 + 2 只分别由连续专注 7 天、累计养大 50 只动物里程碑解锁），黑猫与小鸡提供多套毛色皮肤（含「栗子棕」「奶牛黑白斑」「暹罗重点色」「雪团白」等），支持单层弹窗切换同伴、皮肤或每局随机抽取。
- **自定义休息、番茄循环与通知栏操控（`RestEngine.java`、`RestView.vue`、`Reminders.java`）**。支持 `5`/`10`/`15`/`20` 分钟休息时长设定、自动进入休息及番茄循环续轮；可在「我的」设置页开关专注与休息期间的屏幕常亮；系统常驻通知新增原生「暂停/继续」与「结束」按钮（严格倒计时自动遵循不可暂停与不可提前结束规则）。
- **零权限轻看护与三档防分心融合（`LeaveAppWatcher.java`、`FocusBlockOverlay.java`、`StudyModeSheet.vue`）**。新增无额外权限的「离开应用超 10 秒看护」，在熄屏、锁屏、通话、白名单/临时放行及授权跳转外离开超 10 秒自动结算为放弃并发送急救提醒；`FocusBlockOverlay` 统一为简洁黑白高对比遮罩，并与学霸模式（`StudyModeSheet`）及独立锁机（`/lock`）共同组成轻看护、学霸模式、锁机三档防分心。
- **离线白噪音与锁屏续播（`WhiteNoisePlayer.java`、`WhiteNoisePolicy.java`、`whiteNoise.ts`）**。内置 5 路离线 `.wav` 声景（雨声、鸟鸣、溪流、篝火、海浪）支持无缝循环与音量调节；开启白噪音后前台服务自动附加 `mediaPlayback` 维持锁屏持续播放，仅对扬声器场景应用静音与耳机拔出自动暂停保护。
- **一周农场展示与 PNG 打卡图导出（`CatView.vue`、`farmCard.ts`、`exportPng.ts`）**。第三栏升级为自然周农场，按本轮专注产物渲染巡游伙伴（超上限按精确数字汇聚农舍），点击动物可查看对应专注记录，支持周次切换与通过系统 SAF/分享导出高清一周农场打卡图。
- **时间轴、防刷分手动补录与一周四色分布图（`CalendarView.vue`、`manualBackfill.ts`、`weeklyGridPng.ts`）**。日历栏默认呈现专注时间轴与成功/放弃卡片及内联小结编辑，顶部无损保留原有日程与课表视图切换；新增手动补录专注（仅补齐时间轴与时长统计，不刷好感度），支持一键生成一周 `00–23` 时四色分布打卡 PNG。
- **多维统计与 365 热力图（`StatisticsView.vue`、`statistics.ts`）**。保留日/周/月/年/累计 5 个周期并新增总放弃次数、时长/次数口径切换、带均值参考线的趋势动物头柱图，以及单画布可滑动与键盘检视的 365 天年度热力图。
- **Schema-1 兼容与本地备份恢复（`backup.ts`、`BusinessBackupData.java`）**。延续 `v0.2.x` SQLite 与 Schema-1 备份兼容边界，扩展好感、高水位、同伴皮肤及白噪音/番茄偏好的导入导出校验。

版本号为 `0.3.0`，versionCode 为 `25`。沿用 `com.xiaomao.focus` 和原内测签名。已安装的用户可从「我的 → 检查更新」升级，或直接覆盖安装 APK 保留本地数据。

36 个宿主测试文件的 268 项单元测试全部通过，6 个 E2E 测试文件的 38 项浏览器及 UX 预算门禁检查全部通过。TypeScript/Vite 生产构建、Capacitor 同步、Android Debug APK 构建、75 项 Android JVM 单元测试（`ExampleUnitTest` 1、`AntiCloseWindowOemTest` 2、`AppUsageGuardTest` 3、`BackgroundKeepAliveTest` 3、`BusinessBackupDataPetTest` 7、`FocusEngineRegretWindowTest` 6、`FocusNotificationActionsTest` 2、`FocusNotificationListenerRebindTest` 7、`FocusOverlayAndNavPolicyTest` 13、`KeepScreenOnPolicyTest` 2、`LeaveAppWatcherTest` 9、`OemKeepAliveRouterTest` 4、`RemindersCopyTest` 3、`RestEngineCustomDurationTest` 2、`SplashCoordinatorTest` 4、`UpdateCheckPolicyTest` 3、`WhiteNoisePolicyTest` 4）及仪器测试 Java 编译检查全部通过。`prepare-update.py` 校验了包名、版本和签名，生成的 APK 大小为 6,315,731 字节，SHA-256 为 `2a2ea5a9cfbe77b090beee262c896e64a63502e46d4eb532970c9a33ac6b3ac4`。

未运行模拟器回归、真机覆盖安装或自动化真机仪器测试。
