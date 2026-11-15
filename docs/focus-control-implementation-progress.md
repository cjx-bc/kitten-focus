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

当前并行任务：T04 / #5 普通学霸模式、T05 / #6 严格倒计时、T13 / #14 声音辅助。T03 完整壁纸矩阵不因仅门禁通过被关闭为成功。

恢复执行时：T04/T05 源码已合入集成分支，API36 设备复验排队；T06 独立白名单、T08 故障恢复、T13 声音辅助分别在既有工作区由新子 agent 继续。新 API36 镜像实际能解析 `com.android.wallpaper.livepicker/.LiveWallpaperChange`，此前 MuMu 缺选择器的限制不能直接套用，壁纸探针可在新机重新验证。

通知提前释放、不同 API、真实来电、OEM 后台及壁纸支持须按设备结果报告，不能因实现范围已确认而假定系统允许。原有 UI 保持；第三方复制许可未确定的模块使用独立实现，记录参考来源。
