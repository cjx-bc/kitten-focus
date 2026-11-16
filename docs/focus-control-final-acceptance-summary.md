# A01—A18 交付摘要

产品source `8e22e559`；最终fixture提交 `0b55a37150d8b6185a214271a72a2b7bbaef8816`只修改Scroll测试/证据，产品APK不变。最终APK `60EA961B334DD20D1D3FDAB82D3DD7AE0C8129E4620F4D7F701F80D312A081AA`；host58/build通过。Java7dex与121/121、0skip原生已测APK相同。最终UI6/6、真实权限返回、Study5、legacy5、原通知24和生命周期29全部实际PASS。独立instrumentation为140=核心121+Study5+legacy5+原通知实际2+生命周期实际7，共享kernel22只计一次。

121/通知test为 `1DC510B2545B815104B548E79C5941528A6AE04855B9D2A721EB5626C00ECD83`；最终仅Scroll夹具test为 `141EE1FCF98B47A9920C3BF71AFDB0D5D020D9221DBD4422F04A1E1AC991A9C8`。完整报告：[逐项验收](focus-control-final-acceptance.md)。测试包：[QA APK](../artifacts/focus-control/final-review-qa10/kitten-focus-control-qa.apk)。**并非18项无条件全部通过**：A11/A13及物理/OEM/其他API/完整work-profile仍有限制。

| 条目 | 当前结论 |
| --- | --- |
| A01 面板与原UI | 最终UI6、Study5、legacy5通过；原样式截图目视保持。 |
| A02 权限 | R1/R2已修验；最终grant/revoke真实返回自动刷新，旧合法部分配置10诊断行兼容通过。 |
| A03 列表 | 旧R1 APK真实3组通过，搜索/过滤/取消/固定自身/卸载身份齐备；最终Study名单边界通过。 |
| A04 模式 | 历史真实严格/学霸/正计时通过，最终Study3+1+1均0skip。 |
| A05 名单继承 | 真实两待办/空独立/锁机/下一轮通过；最终冻结/预设/备份边界通过。 |
| A06 通知 | 最终24/29真实sender/点击/生命周期通过；完整work-profile/物理电话/OEM/其他API未验。 |
| A07 通知帮助 | 离线8章/10诊断/键盘、最终旧配置UI和真实权限返回刷新通过。 |
| A08 导航限制 | 目标API36按钮/手势/授权/默认拨号器/恢复通过；物理来电/OEM未验。 |
| A09 任务卡 | overview历史矩阵、三入口sameboot恢复/正常guest reboot恢复通过。 |
| A10 主界面 | 冷暖/hash/安全页/普通解除及三入口严格恢复/到期/重启聚合通过。 |
| A11 壁纸 | **受限**：产品SAF/确认/普通kill后同session关联/live视觉恢复通过；静态视觉/crop/provider设置/带壁纸平滑guest reboot未验。 |
| A12 防关闭 | 普通无障碍10native/8实际通过；不宣称系统防卸载，语言/OEM/额外身份未验。 |
| A13 图标 | **受限/失败保留**：Launcher3旧QA图标缓存未隐藏；通知/真实系统fallback/end/rest/升级/重启恢复通过不能清除该失败。 |
| A14 帮助恢复 | 离线/键盘/共享恢复/最终诊断返回通过；12px/48px已修，最大字体全覆盖未验。 |
| A15 锁机 | 普通/严格/R1/R3/预设/真实到期/guest reboot精确中断通过，非全能力笛卡尔矩阵。 |
| A16 放行 | 原生配额/失败/并发/strict和真实四组/1分钟自动重新阻挡通过；3/5分钟完整等待未跑。 |
| A17 快照恢复 | 冻结/恢复不重开/系统fallback/正常guest reboot checkpoint精确中断通过；跨能力/OEM限制保留。 |
| A18 旧业务 | native121含引擎/更新/备份，旧R1六独立业务场景两次运行含302271ms真休息；最终legacy5通过，document-provider保存未真实端到端验证。 |

Scroll最初333像素RED来自原生6px scrollbar进入ROI末3列，DOM/nav/icons未移；夹具按实测gutter裁取并等render frame、断言nav几何，`.002`阈值不变，产品APK未改。Scroll2为19.024s，完整legacy5为42.769s，均0skip/raw基线相等；原study/legacy失败aggregate保留。

正常guest reboot8→9无host restart，alias在Activity前恢复，duration5563ms等于checkpoint、endedAt等于native anchorEpoch，raw基线一致；它不替代T17带壁纸host退出后的保盘冷启动限制。生产包/原MuMu和user0壁纸未动，QA基线精确恢复；早期一个合成记录/偏好残留已披露。
