# 专注保护最终验收报告

结果截止：2026-11-15 20:52 EST（2026-11-16 01:52 UTC）。范围为`0aba658`后的完整专注保护；集成分支为 `integrate/focus-control`，源码及最终夹具已合并至 `dd6cd10e1dc03ad97107ca3d2c41afda91c043d8`。产品源码树与 `8e22e559` 相同，包含R1/R2/R3和旧部分保护配置兼容修复；最终测试夹具提交 `0b55a37150d8b6185a214271a72a2b7bbaef8816` 未改变产品APK。核心实现与本轮可执行叶级测试均通过；**不能判定A01—A18全部通过**。A13真实启动器缓存隐藏仍失败，A11静态视觉与若干平台矩阵明确受限。

## 构建、设备和结论口径

- QA APK：`artifacts/focus-control/final-review-qa10/kitten-focus-control-qa.apk`，SHA256 `60EA961B334DD20D1D3FDAB82D3DD7AE0C8129E4620F4D7F701F80D312A081AA`。宿主58项、TypeScript/Vite及限定app Android构建通过。构建和测试身份见同目录交付manifest；该隔离测试包不会覆盖生产包。
- 官方AVD `KittenFocus_API36_QA`，Android16/API36，`D:/KittenFocus-Android/sdk/platform-tools/adb.exe -s emulator-5580`，普通QA身份`com.xiaomao.focus.qa`。旧MuMu/API35仅历史证据；不用于本轮通过结论。
- 原生公开FocusControl/CatFocus边界真实121/121，0skip，33.742s；APK为`6d3427a07519bf06eeac229856337e56f2eb0641a2b547f7a8b1390b5af51e6a`。最终60EA APK全部7个classes*.dex字节与其相同，记录于`final-review-qa10/native-code-identity.json`，因此121覆盖相同Java。定向13项与121重叠，不报134独立项。
- 121及通知叶级使用test SHA256 `1DC510B2545B815104B548E79C5941528A6AE04855B9D2A721EB5626C00ECD83`。最终Scroll夹具test SHA256 `141EE1FCF98B47A9920C3BF71AFDB0D5D020D9221DBD4422F04A1E1AC991A9C8`，只改ScrollLayoutTest；产品60EA APK与其他原生测试不变。唯一instrumentation计数为**140=121核心+Study5+legacy5+原通知真实2+生命周期真实7**，共享kernel22只计一次，重复targeted13/Scroll2不再累计。
- 下表“通过”限已测设备/身份/列明场景；“受限”保留未满足的验收条件。“原生通过”可能替换OS effect/clock，不能代替真实系统UI；probe与产品证据分别记录。

## A01—A18 状态

“必须结果”逐字保留`docs/focus-control-implementation-spec.md`的验收表；不因实现票关闭缩小规格。

| 编号 | 必须结果 | 当前结论及证据范围 |
| --- | --- | --- |
| A01 | 三开关独立且初始关闭；开关不立即执行；状态区分偏好与实际能力；运行中修改标为下一轮；原有五栏、样式和计时入口保持 | **目标设备通过**：模式/本轮快照历史实测，新最终APK真实UI6/6包含通知-only、声音-only、增强-only摘要。原五栏/字体/颜色/Sheet截图经主流程目视保持，Scroll2及完整legacy5均0skip通过。 |
| A02 | 用途、本机处理、关闭方法、暂不开启/前往设置可读；短暂确认期间不可误提交；每次返回重新检查；拒绝或不完整不报成功，只影响对应能力 | **目标设备核心通过**：R1开始前能力拒绝、R2必要授权窗口放行已修并原生/真实UI验证；最终前端真实用途Sheet→Settings授权/撤权→launcher返回自动刷新通过，无reload/手动复查。有效旧部分protection缺enhancements已修，最终UI显示10诊断行。 |
| A03 | 图标/名称与计数准确；过滤保留选项；取消不保存；本应用不可取消；必要例外另列；未安装标记明确，不误匹配同名应用；未开启学霸时可提前编辑 | **所测实际通过**：A03三组包含搜索/无结果计数/系统过滤/取消保存/固定自身/卸载包身份；执行于旧R1 QA10 `4d59b8…`，不是最终R2/R3 APK。独立名单真实对外部应用允许/阻挡另由T06实测，最终Study picker/policy边界通过。 |
| A04 | 普通暂停继续应用限制；严格倒计时原生拒绝暂停、取消、提前结束和放行；只开严格不隐式限制应用；正计时可正常结束且开始前说明 | **目标设备通过**：历史学霸/严格实际允许/阻挡、暂停、实际通知点击、重载/进程重进和自然到期只记一次通过；最终Study5按policy3/denied1/enabled1独立执行，均0skip通过。 |
| A05 | 新一轮正确继承；独立替代而不合并、不随全局变化；空独立仅保留必要例外；恢复跟随只影响后续启动；本轮有效名单保持 | **目标设备通过**：两个待办/独立空/全局修改/恢复跟随/下一轮、锁机复用真实通过；最终Study冻结、锁机预设独立/显式空与备份边界通过。 |
| A06 | 白名单保留、非白名单按本轮处理；释放仍保持原应用身份与有效交互；无过期副本、重复释放、无限重拦截；必要通知保留；请求、成功、失败和受限分开报告；提前立即释放未实现则本项不能通过 | **API36主要实际通过，平台矩阵受限**：最终原通知24/24和生命周期29/29均0skip，含原身份/PendingIntent、真实shade点击、更新/必要通知/复用key、提前结束/正计时/锁机、断连/撤权有限到期和恢复。两批共享22个kernel且已在121内，不重复累计。完整work-profile/真实电话闹钟/其他API/OEM未验。 |
| A07 | 说明显示控制/声音差异、第三方锁屏页和实际支持限制；能定位授权、连接及失败原因；重新授权可复查，不把免打扰当作隐藏通知 | **目标设备通过**：离线8章/10诊断/键盘、最终旧配置UI和grant/revoke实际返回自动刷新、最终NLS生命周期通过；帮助保留第三方锁屏页/系统支持限制。 |
| A08 | 本轮所选限制在目标设备有效；必要系统交互和恢复可达；到期/解除撤销自有导航限制；不报告未支持设备为成功 | **API36通过，平台受限**：真实按钮/手势Home/Overview、暂停、精确默认拨号器、必要授权、恢复/下一轮/结束休息通过。真实来电/紧急拨号、OEM/其他API未验。 |
| A09 | 只隐藏本应用卡片，原状态有记录并可恢复；未启用时不隐藏；恢复失败可见可重试；不把隐藏等同防系统强停 | **API36通过**：历史overview默认/开启/暂停/恢复/下一轮/结束休息；新增三入口严格组合、同boot重建和guest reboot恢复通过，不声明强停免疫或全部OEM。 |
| A10 | 活动锁机期间普通入口只到控制页；允许路径可达；原生和 Vue 入口一致；非锁机或已结束恢复正常主界面 | **API36聚合通过**：冷暖启动/业务hash/四安全页/普通确认解除；三入口严格真实可见按钮共享恢复、同ID截止/不重施加/自然到期及实际guest reboot中断释放通过。原失败运行保留，非一次原脚本全绿。 |
| A11 | 只在用户确认后施加；有真实重连/启动效果证据；恢复原状态或明确报告限制；不覆盖用户后续选择，不把设置成功当保活证明 | **受限**：产品真实SAF/取消/系统确认、选中普通kill约1.672s后新service/非preview engine在Activity前协调原session，未选中15s不重连；live紫原组件实际确认并视觉恢复。静态identity写回/pending=false已验，静态绿色视觉/crop未验；产品后来home/lock仅native，T03实际另记；带壁纸reboot发生host退出后保盘冷启动，不能写平滑guest reboot通过。 |
| A12 | 精确限定目标，必要设置可用；行为与真实权限一致；到期及恢复后撤销；语言/OEM 差异有结果；无授权不宣称系统防卸载 | **API36普通无障碍通过，平台受限**：10native/8实际目标与例外、恢复不重开通过；未用admin/owner策略，不宣称系统禁止卸载/强停。中文/OEM/额外身份未验。 |
| A13 | 未验证可达入口不隐藏；隐藏/恢复只影响本应用启动入口；通知与控制页可恢复；原状态不丢，失败明确可重试；不等同包不能卸载 | **受限/实际cache失败保留**：alias disabled/noactivities但Launcher3仍显示旧QA图标，不能称真实隐藏通过。通知content回focus/action开Sheet、撤通知杀进程后经真实系统Accessibility QA Settings行启动并恢复alias、end/rest、9→10替换和guest reboot前Activity恢复均通过；这些leaf未检查drawer，不清除cache失败。 |
| A14 | 每类帮助有正文；示例与正式规则一致；真实限制不被宣传承诺覆盖；恢复列明影响，取消无操作，确认后结果逐项可读 | **目标设备核心通过**：离线/键盘/取消确认/三入口可见按钮共享恢复/最终10诊断旧数据UI及系统返回刷新通过；12px/48px标准硬偏差已修。最大字体实际可达未完整验证，壁纸/系统限制继续显示。 |
| A15 | 配置可复用；开始前检查与降级明确；普通解除需确认、严格提前解除拒绝；剩余时间与实际状态准确；记录独立、不计专注、不自动休息；结束/中断清理真实 | **API36核心通过，组合范围受限**：普通/严格真实矩阵、R1预检/R3预设独立与[]/legacy继承/冻结/备份通过；三入口严格恢复/自然60000ms/guest reboot checkpoint5563ms精确中断、无focus统计/autoRest通过。非通知+声音+壁纸所有交叉组合。 |
| A16 | 成功才扣、每轮最多三次、同一时刻单目标；期限不延长、次数不重置；不改永久名单、不连带释放通知；严格入口原生拒绝 | **所测通过，实际时长矩阵受限**：原生失败/配额/并发/重建/boot/strict通过；真实四组含1/3/5选项、取消零扣、Settings成功且约59.241秒无后续动作重新阻挡/永久名单不变。真实3/5分钟完整等待未执行。 |
| A17 | 本轮快照和已用次数稳定；临时失效只恢复原能力；主动恢复能力本轮不自动重新开启；重启中断不计间隔；恢复责任保留、冲突新保护被阻止且可修复 | **大量实际通过，完整平台矩阵受限**：冻结/重建/主动撤销/NLS恢复、T17同session关联、真实系统fallback通过；三入口正常guest reboot8→9无hostRestart，Activity前alias恢复、duration5563=checkpoint、endedAt=native anchorEpoch、owner空/任务恢复/无autoRest/raw基线相同。带壁纸平滑reboot/OEM/全部跨能力组合未验。 |
| A18 | 常驻子待办和历史语义保持；休息固定五分钟、不计统计、不自动下一轮；旧备份可读；活动状态/通知正文/授权不被恢复为有效保护；记录不重入、已结束控制不残留 | **核心回归通过，明确范围受限**：host58/native121含FocusEngine6/UpdateProtection8/backup；最终UI6包含旧合法保护配置10诊断行。旧R1实际六独立业务场景来自两次明确运行，含302271ms真休息、后续selector失败保留；主流程视觉审阅原UI稳定。完整legacy5最终42.769s、0skip/raw基线一致通过；OS文档chooser保存效果未真实端到端验证。 |

## 可追溯证据与可重复入口

所有路径相对仓库根；产物均在忽略目录。通知正文、业务快照、私有基线归档不提交。运行器只允许隔离QA包，实际设备操作须显式指定上述ADB/serial。

| 范围 | 实际结果与证据 | 公开运行入口 |
| --- | --- | --- |
| 原生主体/审查修复 | `artifacts/focus-control/review-fixes/green/{final121,targeted}/`：121与定向13通过，重叠不加总 | `scripts/run-isolated-android-tests.py`；FocusControl/CatFocus、FocusEngine、Lock、TemporaryAccess、Recovery、Dnd、Notification、RecentTasks、MainEntry、AntiClose、Launcher、Backup、Update、AuthorizationSettings、Wallpaper测试类 |
| 最终frontend/旧配置/权限返回 | `artifacts/focus-control/final-leaf/new-front/final-review/results.json` 6/6、10诊断行；`final-leaf/permission-return/results.json`实际grant/revoke自动刷新PASS，私有raw基线相等 | `scripts/final-review-device-smoke.mjs`、`scripts/permission-return-device-smoke.mjs` |
| Study5 | `final-leaf/study/{study-policy,study-denied,study-enabled}/result.json`分别3/1/1、0skip；父leaf-summary因其额外捆绑旧Scroll失败仍false，不改写 | StudyProtectionBridgeTest按授权disabled/enabled分别运行；真实enabled绑定与规则效果必需 |
| 最终原通知/生命周期 | `final-leaf/notification-original-observed/` 24/24、17.19s，真实检查截图后200,420点击；`notification-lifecycle/`29/29、210.655s、0skip，listener/accessibility/探针/私有raw基线恢复 | `scripts/notification-device-test.py`；24=kernel22+actual2，29=同kernel22+actual7。kernel22已在121内，只计一次，不能报121+24+29为独立总数 |
| T19通知/备用路径/T21规范化返回 | `api36/final-entry-green/{notification,fallback-final,permission-return-normalized}/`：通知2leaf、fallback、返回PASS；raw还原 | launcher分leaf运行器；实际content/action触摸与系统Accessibility QA Settings行，证据前未用ADB启动MainActivity |
| T22严格三入口/正常guest reboot | `api36/final-entry-green/entry-combination-button/{aggregate-results,reboot-settled-observation,private-baseline-restored}.json`聚合PASS | `scripts/entry-combination-device-smoke.mjs`及真实按钮/reboot分段；保留最初错误host Date.now比较，使用native checkpoint anchor核实，不称原单次全绿 |
| 壁纸产品/T03 probe | `artifacts/focus-control/t17-product/`、`docs/wallpaper-protection.md`；T03在`tools/probes/wallpaper/RESULTS.md` | `scripts/wallpaper-device-smoke.mjs`、`wallpaper-process-smoke.py`；只新建并核对secondary user，不能用user0当fixture |
| A03/原业务 | `api36/final-whitelist-editor/results.json`3/3；`final-business-regression/{aggregate-results,timed-phase-results,results}.json`六独立场景，两次运行，旧R1 APK `4d59b8…`；`docs/focus-control-final-business-ui-evidence.md` | `whitelist-editor-device-smoke.mjs`、`business-regression-device-smoke.mjs`；details-only批次不重做五分钟，不重复计五栏/首次计时 |
| 旧Swipe/Scroll | Swipe3单独通过；`final-leaf/scroll-green/`2/2、19.024s；`final-leaf/legacy-final/`5/5、42.769s、0skip，rawdigest `65e9d35a…`恢复相等 | SwipeNavigationTest、ScrollLayoutTest；产品源码未改，test141EE…夹具修正见下节 |

## 失败保留与审查处置

原Spec审查R1缺通知/声音预检、R2自身限制阻挡授权修复、R3锁机预设增强偏好遗漏均已修复；121/定向13/真实UI6验证。有效旧部分protection缺enhancements导致诊断页崩溃经`eb892fd`中央默认值修复，host RED→GREEN、最终实际10诊断行及权限返回通过，静态复审已关闭。品牌辅助字12px/目标48px偏差和重复同步helper已修；长构造参数为可选非阻塞维护建议。审查未授权把未执行矩阵判绿。

原Scroll像素RED已实测定位为夹具ROI包含Android原生scrollbar：density240下原生bar6px，旧右inset3留下最后3列，ROI534×111恰333像素改变（x534—536）；DOM nav bounds/icon位置不变，真实长页vertical scroll >100通过。修正只按实测gutter裁取并等待render frame，另断言nav DOM几何，原`.002`阈值不放宽；Scroll2与完整legacy5均0skip/raw基线相同通过。首次study/legacy整体失败日志保留，不改写成原始一次全绿。

T19原抽屉缓存不一致、T17静态过渡截图/host退出、旧业务计时后selector失败、初始NLS shade定位失败、原host-clock断言与慢初始化/无效confirm夹具失败均保留；相同问题的后续成功只覆盖明确重跑场景，不删除旧失败或写成一次全过。

## 未覆盖与恢复保全

- **A13限制仍有效**：Launcher3真实旧QA图标缓存未隐藏；组件状态/API与恢复leaf通过均不能替代抽屉实际效果。
- **A11限制仍有效**：静态identity恢复不证明绿色图像/crop/offset，原live组件恢复不证明第三方provider私有设置；产品后来home/lock实际组合未重做。带壁纸adb reboot后host退出，原因未知、旧stdout/stderr未保存；同盘无wipe/snapshot冷启动boot7→8只证明用户可用后的framework协调与恢复责任。T22正常guest reboot8→9属于三入口组合，不消除壁纸平滑reboot缺口。
- 仅官方API36普通权限。物理真实来电/紧急/闹钟、声学结果、OEM后台/launcher、其他Android API和完整managed-work-profile拦截释放交互未验；T12工作资料仅证明可见性。full secondary user不是work profile。
- 普通无障碍不等于device owner或系统防卸载；没有owner provisioning。最近任务/alias/壁纸不构成系统强停免疫。真实3/5分钟放行完整等待、最大字体全部交互可达与所有能力笛卡尔组合未执行。
- 私有原始文件digest在成功批次恢复相等。壁纸仅创建/移除user10及unused probe，user0 wallpaper id2/which3/ImageWallpaper未变；生产`com.xiaomao.focus`和原MuMu未清空/覆盖。早期一次通知失败夹具留下一个已完成合成记录及偏好在QA基线中，已披露、owner空/责任不pending，未广泛清库。

本轮计划的最终叶级测试已经收齐。最终合并commit/文件位置与issue状态由交付manifest记录；T19/T22/T23及父issue继续保留上述实际失败与平台验收缺口，不将实现任务关闭转述为18项无条件全通过。
