# T02 实测记录：API 35 MuMu 原通知暂缓与改期

测试日期：2026-11-15，事件覆盖 18:28:54–18:37:22 UTC。设备状态原始墙钟以 epoch 毫秒保存，界面时区显示的次日日期不作为测试日期。只在用户授权的 MuMu 实例 `127.0.0.1:16416` 运行隔离 debug 包；未变更小猫原包或用户数据。

## 环境与身份

- Android API 35；manufacturer `Xiaomi`，model `22041211A`；指纹 `Xiaomi/cupid/cupid:15/V417IR/1171:user/release-keys`。这是模拟器报告的信息，不是小米真机兼容性验证。
- sender `com.xiaomao.focus.probe.sender` uid 10072；controller `com.xiaomao.focus.probe.controller` uid 10073。控制端是普通通知 listener，未启用 assistant、root、device owner 或隐藏 API。
- Java 21.0.12、AGP 8.13.0、Gradle 8.14.3、compile/target 36、min 24。独立 sender/controller debug 构建成功；初次 24s，修正重复点击记录后增量 17s。
- 发送端通知权限已获准，通知 enabled；本次 fullScreenAllowed=true，监听端实际收到带 fullScreenIntent 的合成通知。

## 实际观察

| 场景 | 系统和探针观察 | 结论范围 |
| --- | --- | --- |
| 正常截止 | #1101 暂缓约 4s，removed reason=18，查询在 snoozed 集合；四次回调比原截止晚 234 / 213 / 217 / 221ms | 同 key、包/uid、创建者和进程内同一个 PendingIntent 恢复。修正后的重复点击案例在通知栏真实点击后记录 sender `content_intent_opened(id=1101, revision=1)` |
| 明确提前结束能力 | `early_release` 报告普通 NLS 无公开通用 unsnooze 方法，不调用反射或特权接口 | 这个方法缺口仍存在，不等于其他公开操作都不能改期 |
| 再 snooze 1ms | 已暂缓 #1102 再调用公开 `snoozeNotification(originalKey, 1L)`；五轮重复均约 208–240ms 后恢复，见下表 | 本设备存在可复现的**原通知提前改期路线**；不是 cancel/repost。仍不能当作所有 API/OEM 的保证 |
| 发送端更新 | #1103 暂缓时发送 revision=2，到期返回 revision=2，原身份保持，回调比计划晚 209ms | 系统保留更新后的内容；本探针只记录合成 revision，不采集正文 |
| 发送端撤回 | #1104 暂缓后由 sender cancel；原截止后 4.5s 检查，两集合均没有该 id，未出现 reappeared | 没有恢复已撤回的旧消息。系统未给 listener 新的撤回回调，旧 journal 不能单独证明消息仍存在 |
| 分组 | 暂缓 summary #200 时系统同时 removed #201/#202 reason=18；之后对子项 hold 因已非 active 拒绝；到期三条以原分组、包和 key 回到 active，snoozed 为空 | 存在系统分组联动，不能按一条请求等于一条暂缓记账。summary 回调比计划晚 214ms |
| 重复 | 同 tag/id #1105 连发两版，仅一条活动 key，revision=2；暂缓后重复 hold 被拒绝；到期仅原 key 回来 | 没有代发副本；回调比计划晚 226ms |
| 必要通知例外 | ongoing、call、alarm、实际 fullScreenIntent 四种合成通知均在控制端 `necessary_exception` 拒绝，仍为活动通知 | 验证的是探针豁免策略，未声称真实通话/闹钟端到端行为通过 |
| 无固定结束时间 | `no_deadline` 明确拒绝，未启动无限期或滚动暂缓 | 该产品策略尚待 T12 实现、量化与恢复验证 |
| 监听断开 | #1106 先暂缓 4s；requestUnbind 后快照命令返回 disconnected；5s 后 requestRebind，目标在 active，不在 snoozed | 系统到期不依赖本进程定时器。断连窗口精确恢复时刻不可观察，未伪造 posted 回调 |

提前改期重复试验（原计划 7s；均记录原 key/包/创建者、同一个 PendingIntent）：

| 轮次 | short snooze 请求 → 实际回调 | 相对原截止 | 原始点击 |
| --- | ---: | ---: | --- |
| 1 | 210ms | 提前 6276ms | 通知栏真实点击后 sender 记录 #1102 revision 1 |
| 2 | 208ms | 提前 6290ms | 未额外点击 |
| 3 | 240ms | 提前 5117ms | 未额外点击 |
| 4 | 209ms | 提前 6273ms | 未额外点击 |
| 5 | 213ms | 提前 6273ms | 未额外点击 |

首次探索也观察到 215ms 后恢复、早于原截止 5432ms，随后以上五轮用于重复确认。该现象修正了“普通 listener 没有 unsnooze，所以原截止前绝无公开路线”的过强推论；官方文档仍未将这种重设已暂缓 key 截止的用法定义为跨设备保证。

## 验证中发现并修复的问题

最初通过广播 receiver 调用原 PendingIntent，`send()` 返回但没有 sender 点击回执；不能作为打开成功。改为真实通知栏点击证明原动作。重复点击时 Android 将已有 sender task 带到前台，原 Activity 没有新回执；发送 Intent 增加 NEW_TASK / CLEAR_TOP / SINGLE_TOP，已有 `onNewIntent` 路径记录新点击，修正后正常/提前两种点击均通过。

本 MuMu 的 UIAutomator dump 退出码 139；人工查看合成通知位置后，runner 用显式 `--tap-position 300 500` 点击。原始失败记录保留为失败，没有合并成成功日志。坐标并非其他屏幕的通用方案。

主机的 hold 决策检查通过：API 24/25 不调用 snooze、固定截止差值、listener 断开、必要通知、无截止、已过截止。可执行 runner 已通过 Python 编译检查；设备各案例与五轮重复由同一公开命令/事件合同执行。尚未在设备验证 API 24/25、26、33、36、其他 OEM、重启、锁屏、音响/振动或逐帧曝光；未完成 A06、T12 或完整产品验收。

## 证据与清理

完整原始元数据在本 worktree 忽略的 `results/`：`mumu-api35-cases.json`、`mumu-api35-repeats.json`、`mumu-api35-final-events.json`；最后一份含 controller 230 条、sender 34 条事件。初始探索失败保存于 run/run2/run3 JSON。未提交真实消息正文或完整系统通知 dump。

`device-baseline.json` 记录本次原监听配置为 `null`。结束先清理 sender 自己的合成通知，再撤销 controller 监听授权、删除本次产生的空设置，回读仍为 `null`；两个本次新装 probe 包均已卸载成功。`cleanup.json` 保存恢复结果，小猫原包未改动。

最终 APK SHA-256：

```text
sender-debug.apk     ac803b38b53f20e1e75ff8add0b965797945c9d0baab59dcf225f7ad8eba6751
controller-debug.apk ef257b2d557c487fdb61f9948b0691f07090d8255337dfa7434406a4a91528f0
```

下一实现应将已验证的 duration 改期作为 API 35 当前设备的候选能力，再做批量释放、开放式会话、权限丢失、分组关联和恢复责任整合；不因本探针结果关闭或删除后续通知实现任务。官方来源与可重复命令见 [README](README.md)。
