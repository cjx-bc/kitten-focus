# T12 原通知提前释放与有限租期

T12 / #13 延续既有 `FocusControl`、Java 会话、SQLite 和 `FocusRecovery`，没有新增会话引擎或通知正文库。T11 文档记录的是先前固定截止切片；本文件记录后续生命周期实现与独立设备结果。

## 执行规则

- 严格倒计时和严格锁机使用原生固定截止。普通倒计时、普通锁机、正计时和暂停期间采用最长 60 秒的有限租期；已连接的 listener 每 15 秒执行生命周期维护，剩余不超过 15 秒时续期。租期根据本轮剩余时间封顶；暂停不会释放本轮通知。
- 提前结束、正计时结束、锁机解除、休息、故障恢复和重启中断均进入同一通知清理入口。对 Android 仍持有的原键请求公开 `snoozeNotification(originalKey, 1L)`，没有永久取消、正文复制、隐藏 API 或小猫代发。
- 调用前同步保存恢复责任；调用返回只表示已请求。已观察到暂缓的原键重新进入 active 集合，或系统明确给出原通知点击移除事件，才记为已验证恢复。发送端撤回、过期或当前两集合均不存在记为 absent，不能计为恢复。
- `observedHeld` 与当前处理阶段分开保存，避免更新、移除回调或消费原通知抹掉已经验证的事实。终态不会因延迟回调重新开启拦截。
- 释放异常记为 failed；调用成功但系统仍持有时保留请求状态，至少间隔 5 秒后可再次请求原键。断连、撤权和无效果请求保留责任与统一恢复重试入口。未清理旧责任会阻止冲突的新通知保护，纯观察和恢复预览不会调用系统操作。
- 本轮名单仍来自可信原生快照；运行中修改配置及 T07 临时打开应用均不会豁免或释放通知。持续、不可清除、来电、闹钟、全屏及必要通知保留；分组仍沿用 T11 的先记账与必要同组例外规则。

## 对用户的真实反馈

原有 Sheet、开关、按钮、字体和五栏导航保留。通知区分别显示授权、连接、是否执行新拦截、系统已核实暂缓、请求释放、释放失败、已验证恢复、当前不存在。计时与严格约束不因恢复而停止。本轮用户主动撤销后，重连不会重新开启；下一轮仍按保存偏好重新检查。

有限租期保障的是 Android 中不存在无限期暂缓责任；它不能保证服务被强停、系统延迟或 OEM 限制下通知持续隐藏。断连期间的准确恢复瞬间不可由失联 listener 观察，设备验证使用另一普通 listener 的只读 active/snoozed 快照，不伪造回调时间。

## 验证入口与证据

已确认边界为 `FocusControl` / CatFocus 的公开命令与返回快照，`SessionClock` 和通知 OS adapter 用于确定性失败；真实系统效果由独立发送包和普通 NLS 验证。

TDD 已实际执行：普通生命周期的 runtime red → green；60 秒租期的 runtime red → green；恢复失败与请求状态的 runtime red → green；点击先于 posted 快照的编译 red → runtime green。新增回归还覆盖静默无效果后的重试、纯观察、撤权及开机号变化、旧责任冲突、临时应用放行不影响通知。

真实设备 fixture 必须显式 opt in。执行器保存监听、无障碍和包授权基线，检查 QA 身份，测试保存并恢复 QA 业务快照与 runtime journal；仅清理发送端自己生成的合成通知。独立观察器仅在 QA listener 断开或撤权时查询合成发送包的元数据。

```text
python scripts/notification-device-test.py --lifecycle --classes com.xiaomao.focus.FocusNotificationTest,com.xiaomao.focus.FocusNotificationLifecycleDeviceTest --expected-tests 23 --timeout 420 --observed-tap 200,420 --output artifacts/focus-control/t12/lifecycle-api36

python scripts/notification-device-test.py --lifecycle --reboot --classes com.xiaomao.focus.FocusNotificationRebootDeviceTest --expected-tests 1 --timeout 120 --output artifacts/focus-control/t12/reboot-api36
```

`--observed-tap 200,420` 仅用于已目视检查的 540×960 合成原通知卡片；其他设备必须重新检查或采用正常节点点击。它发出真实系统触摸，并要求独立发送端收到本次 id/revision 的新回执，不使用 `PendingIntent.send()` 冒充点击。

## 实际结果

2026-11-15，官方 API36 `emulator-5580`，普通 QA NLS 与独立 sender 身份。16 项公开 native seam 全部通过；包含 7 项真实生命周期案例的联合运行有 22/23 通过，唯一失败是 instrumentation 默认抑制无障碍服务的锁机 fixture。改用公开 `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES` 后，真实锁机案例单独 `OK (1 test)`，3.989s。没有把失败日志改写为整套一次通过。

| 场景 | 实际观察 |
| --- | --- |
| 提前结束及更新 | 已暂缓原通知更新至 revision2，结束后约 459ms 观察恢复；原 key/package/uid/PendingIntent 与更新版本均保持。真实通知栏触摸后 sender 收到本次 id/revision 的新点击回执 |
| 正计时及暂停 | 暂停后等待 65 秒，原通知仍在 snoozed 集合，证明至少一次有限租期续期；结束进入原有休息，约 476ms 后恢复原通知 |
| 普通锁机解除 | 实际无障碍服务连接后，从原生锁机开始、暂缓到确认解除、原身份恢复均通过，不增加专注记录或进入休息 |
| 用户恢复及重连 | 同一恢复入口请求并核实原通知，计时保留；重连及原通知更新不重新开启本轮拦截 |
| listener 断开 | 独立普通 observer 联合 active/snoozed 快照确认原通知有限到期；断开到重连核实约 60594ms，原身份保持，失联窗口精确回调时刻未声称已知 |
| 通知访问撤回 | 独立 observer 确认原通知有限到期；撤权到重新授权核实约 61057ms，原身份保持，旧责任在核实前保留 |
| 发送端撤回与持续通知 | 已撤回原键结算为 absent，restoredCount=0，无副本；持续合成通知保持活动且未进入拦截 journal |
| 真正设备重启 | prepare `OK (1 test)` 1.471s；真实 ADB reboot、开机号增加后 verify `OK (1 test)` 8.06s。活动所有者中断清理，原键不在两集合，absentCount=1、restoredCount=0；基线与 journal 恢复，私有临时基线文件删除 |
| 工作资料边界 | 新建唯一临时 managed profile `KittenFocusNotificationQA` / user10，只安装合成 sender，不配置 owner、管理员或账号。个人普通 observer 能看到带该 profile uid 的原通知。结果仅证明可见性，未把完整工作资料拦截、释放和交互计为通过；测试后核验 id/名称并移除该 profile |

证据在本 worktree 忽略目录 `artifacts/focus-control/t12/`：`early-api36`、`lifecycle-api36-observer`（22/23 与原失败）、`lock-api36-verified`、`reboot-api36`、`work-profile-api36`；各目录保存 instrumentation、构建 SHA-256、基线与清理结果。更早的 sender 自身 active 查询不能证明可见性的失败实验、空参数设置错误及默认无障碍抑制失败也保留，未当作产品通过。

真实锁机与重启测试所用 QA APK SHA-256 为 `a638dd4831e739e2cfa661386388462f0139ea4f073ec1a58f0abfc7b1a9bedb`，test APK 为 `0403211b18b3e210a3259b5a1bc402eea79189eafcf92dc247ce3bf7a840e81b`。后续合并构建的 APK 另记构建哈希，不能把上述旧 APK 结果冒充新集成 APK 的设备结果。

最终分支合并 `958dbb2`（含 T14/T15）后，37 项 Vitest、通知政策 5 项、Python 执行器语法检查及 TypeScript/Vite 通过；`npm run build` → `cap sync android` → `.qa` 主 APK 与 test APK 构建通过，Gradle 26s、`--no-daemon --max-workers=2`。最终 QA 哈希 `49c391949ce95269402eedae13a5ea8e37826fbd8f4aee43932bfb6402fd4b01`，test 哈希 `20f79db9e8c57e16823b6773e58a1cf3b30f29f5603c80b29ff90e7d692777b8`；内置 `NotificationSetting-vJhVVp7a.js` 已无 `lifecycle_pending`。

所有新增授权撤销，原两个系统 listener 保留，QA 业务快照及 runtime journal 恢复。API24/25 门禁、其他 API/OEM、真机电话/紧急通知、完整工作资料生命周期与最终组合验收仍需覆盖，未据此将完整 A06 标为全部通过。
