# 最终回归执行清单（源码就绪，尚未执行）

本文件及新增脚本不是通过证据。执行时记录最终提交、安装 APK SHA256、设备/API、前置状态、实际结果和清理结果。先取得主协调器独立的构建租约与设备租约；本工作树未执行 Gradle、cap sync 或设备操作。最终产品合入后再冻结源码，先完成协调器安排的版本 9 → 10 隐藏入口真实升级，再运行本清单。

沿用已批准边界：实际 QA WebView/原生 CatFocus、Java 计时和 SQLite。新增脚本只驱动现有 Sheet、输入框和原按钮，不访问 Pinia/Vue 实例，不复制业务规则，不重新设计 UI。只使用 `.qa` 包和指定 QA 模拟器，不安装或清理生产包。

## 执行环境

在最终集成根目录运行。工作树缺少忽略的 SDK/设备配置时显式传值；Node 版本需支持现有 `.ts` 导入方式。

```powershell
$env:ADB = 'D:/KittenFocus-Android/sdk/platform-tools/adb.exe'
$env:ANDROID_SERIAL = 'emulator-5580'
$env:ANDROID_APP_ID = 'com.xiaomao.focus.qa'
# 下面两项仅主协调器授予构建租约后执行；不与其他工作树并行。
# npm.cmd run build
# npx.cmd cap sync android
# android/gradlew.bat :app:assembleDebug :app:assembleDebugAndroidTest '-PtestApplicationIdSuffix=.qa' --no-daemon --max-workers=2
```

安装以既有 `run-isolated-android-tests.py` 为准。它验证 `.qa` 包及 instrumentation 目标，保留两个 APK 的 SHA256；新增 `--expected-tests` 同时约束实际执行数量，忽略与 assumption 状态均视为跳过失败。工作树若没有 `.tools`，传 `--aapt E:/codexseeson/fanqiezhong/.tools/android-sdk/build-tools/36.0.0/aapt.exe`，以及最终共同构建的 `--app-apk`、`--test-apk` 绝对路径。

## 原生批次

`python scripts/final-native-plan.py --group final` 从当前源码读取精确方法表；WallpaperControlTest 尚未合入时直接失败，不悄悄缩减最终批次。`core` 只用于明确检查不含壁纸的来源清单。d156443 的核心 14 类共 109 项：

| 类 | 方法数 | 数据/系统边界 |
| --- | ---: | --- |
| FocusControlTest | 11 | 自有唯一库；默认 QA 必须空闲 |
| CatFocusControlBridgeTest | 1 | 真实默认桥接；精确保留并恢复 QA 基线 |
| FocusEngineTest | 6 | 自有唯一库，包括重建；只删除自有库 |
| LockControlTest | 9 | 自有唯一库 |
| TemporaryAccessControlTest | 4 | 自有唯一库 |
| RecoveryControlTest | 4 | 自有唯一库与对应 journal |
| FocusDndTest | 7 | 6 项受控 OS seam；1 项真实系统 rule，保留原授权及其他 rule |
| FocusNotificationTest | 21 | 自有唯一库，受控通知 OS seam |
| RecentTasksControlTest | 7 | 自有唯一库与受控 tasks seam |
| MainEntryControlTest | 4 | 自有唯一库 |
| AntiCloseControlTest | 10 | 自有唯一库，含已保存真实窗口夹具 |
| LauncherControlTest | 10 | 自有唯一库与受控 launcher seam |
| BackupProtectionTest | 7 | 自有唯一库及自有备份目录 |
| UpdateProtectionTest | 8 | 真实默认库/备份路径，保留原始行、备份和升级偏好；无真实安装升级 |

T17 的 WallpaperControlTest 由最终源码加入并重新计数。不要把旧 109 或预期的壁纸项数写作最终实际通过数。

```powershell
$plan = python scripts/final-native-plan.py --group final | ConvertFrom-Json
python scripts/run-isolated-android-tests.py --serial emulator-5580 --class-name $plan.className --expected-tests $plan.expectedTests --timeout 900 --output artifacts/focus-control/api36/final-targeted-native
```

所有核心夹具均要求默认 QA 没有活动专注/锁机、进行中休息和待恢复责任，避免唯一库测试的真实提醒效果覆盖另一轮。Bridge、Study 和 Update 的 `QaBusinessBaseline` 在首次写入前保存默认库两个表的原始行；清理逐字恢复 documents 与全部 focus_records（含 tombstone 隐藏记录），再恢复原业务提醒。恢复前若存在未清理的 OS 责任，测试失败并保留责任，不能清空后伪造通过。FocusEngine 使用已有构造 seam，不新增产品 API。断言均仍通过原产品接口；原始行操作只用于夹具保全。

StudyProtectionBridgeTest 共 5 项，必须分状态：

| plan group | 数量 | 前置与执行 |
| --- | ---: | --- |
| study-policy | 3 | 不依赖授权的名单/防伪造入口；可在原授权基线运行 |
| study-denied | 1 | 仅关闭**精确 QA 无障碍组件**后运行；拒绝方法的 assumption 不得跳过 |
| study-enabled | 1 | 恢复/启用精确 QA 组件且真实服务已绑定；状态要求 authorized=true、connected=true，设置字符串不算连接 |

每组都用同一 `final-native-plan.py --group <组名>` 生成 selector/count，传给上面的隔离执行器并使用各自输出目录。调用前保存精确原无障碍组件集合；只修改 QA 一项，最后恢复原集合与真实连接。禁止直接执行整个 Study 类取得“带跳过的绿”。`FocusDndTest` 首次 UiAutomation 使用 `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES`；Study 启用批次若重启 instrumentation 后仍未绑定，必须修复夹具并重跑，不能改为 assume。

ScrollLayoutTest 2 项与 SwipeNavigationTest 3 项作为 `legacy-ui` 独立批次。它们使用普通 UiAutomation，可能抑制无障碍；运行时无活动保护，结束后重新核实原服务连接，再运行需要授权的实际场景。它们不能作为学霸模式实际服务仍在运行的证据。

通知真实原通知/点击、生命周期和重启按专用 `notification-device-test.py` 运行：

```powershell
$original = python scripts/final-native-plan.py --group notification-original | ConvertFrom-Json
python scripts/notification-device-test.py --classes $original.className --expected-tests $original.expectedTests --timeout 420 --output artifacts/focus-control/api36/final-notification-original
$lifecycle = python scripts/final-native-plan.py --group notification-lifecycle | ConvertFrom-Json
python scripts/notification-device-test.py --lifecycle --classes $lifecycle.className --expected-tests $lifecycle.expectedTests --timeout 420 --output artifacts/focus-control/api36/final-notification-lifecycle
```

当前两个批次分别为 21+2、21+7；其中 21 kernel 项重复执行，不相加宣称不同测试。重启另用 runner 的 `--reboot` 流程（先查看其 `--help`），`notification-reboot` 是 prepare/verify 两阶段中的同一项。实际 shade 点击必须先审阅当前合成通知截图后提供坐标，不用 PendingIntent.send 代替。监听器/探针组件与授权由专用 runner 保存恢复；不泛删系统 listener 或声音规则。

## 新增实际 WebView 验收

```powershell
node scripts/whitelist-editor-device-smoke.mjs
node scripts/business-regression-device-smoke.mjs
```

两个脚本只接受空闲且无旧恢复责任的 QA 基线，通过既有 `android-qa.mjs` 连接真实 WebView。业务基线只留在进程内存，不写入报告或调试输出；退出前结束自己的普通会话、确认无残留责任，恢复基线并重新初始化页面，再核对业务数据。未发生断电/进程被强杀时，失败也会尝试恢复；`cleanupCompleted=false` 的报告需要协调器处理，不能直接重跑并覆盖残留。脚本本身不修改任何系统授权。

| 脚本/验收 | 实际操作及独立预期 | 产物 |
| --- | --- | --- |
| whitelist-editor / A03 | 学霸关闭时打开全局名单；真实查询安装应用；固定小猫勾选不可关闭；缺失包显示原标识与“未安装”；按真实系统应用名称/包名搜索，多选后搜索无结果/关闭系统筛选仍保留已选 3 项；取消不保存；重开确认后包集合持久、固定自身不混入可编辑名单 | `final-whitelist-editor/results.json`，3 张 PNG |
| business-regression / A01 | 点击原五个 icon-only tab，顺序待办/日历/小猫/统计/我的；当前状态和无横向溢出；原待办表单、全屏大数字及圆形控制；原日历/课表/设置截图 | `final-business-regression/01-tab-*.png` 等 |
| business-regression / A18 | UI 创建主题/常驻子待办；真实正计时暂停稳定、重载同轮、继续及后台增长；真实 Android 结束确认先取消再同意；一条真实完成记录、自动固定五分钟休息；取消退出不重置期限；实际完整等待休息到期，不记统计/不自动下一轮 | 同目录 result、原生对话框与休息 PNG；`waitedMs` 是实际等待时间 |
| business-regression / A18 | **同一 itemId** 再次用作一分钟倒计时，提前结束后无自动休息，手动进入五分钟休息且确认退出；两个状态 completed/early；日历创建关联日程，实际页显示两条真实记录；统计累计 2 次、待办分组和记录 Sheet；浏览不改变记录 | 日历/统计/常驻待办 PNG、分场景结果 |

原生 Android 确认使用实际 UIAutomator 识别当前对话框资源 ID 后点击按钮中心；不替换 `window.confirm`。五分钟脚本没有缩短时钟或跳过等待模式；约六分钟，运行期间 console 定期打印剩余时长。自动脚本只断言保留原结构与交互，字体/间距/颜色/原图标是否符合原设计仍须逐张查看最终 APK 截图，不能把 DOM 数量当像素审阅。

现有 `item-whitelist-device-smoke.mjs` 验证独立名单覆盖、跟随全局、空独立名单与真实外部应用限制；新增 A03 脚本补的是名单编辑器操作，两者范围不同。`backup-device-smoke.mjs` 继续负责旧备份/坏文件/正式导入确认；`updater-smoke.mjs` 与原生更新测试不能代替版本 9 → 10 的真实升级。本清单不把这些其他脚本的历史结果改写为最终共同 APK 通过。

## 本次已执行与未执行

已执行：新增 JS 的 `node --check`；Python 执行器 `--help`；源码清单 core=109、Study=3/1/1、legacy-ui=5、notification=23/28/1 的生成及 selector 存在检查；`git diff --check`。这些都是宿主源码检查。

未执行：新增 Java 夹具编译、全部原生批次、A03 实际交互、完整旧业务实际五分钟等待、最终视觉审阅、真实升级、最终共同 APK 的通知/壁纸/入口组合。执行后只按对应 result 与 APK 哈希填写验收矩阵，主协调器决定 issue 状态。
