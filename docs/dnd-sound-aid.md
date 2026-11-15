# 独立声音免打扰辅助

对应 T13 / GitHub #14。实现于现有 `CatFocus`、Java 专注引擎及 SQLite 会话边界，声音规则与应用限制、通知显示拦截分别选择。代码为本项目独立实现，没有复制 Curbox、DetoxDroid 或其他第三方源码；只使用 Android 官方 `NotificationManager`、`AutomaticZenRule`、`ZenPolicy` API。

## 使用与状态

“我的 → 声音辅助”保存 `preferences.protection.dnd`，默认关闭。说明面板区分声音、振动与通知显示，先解释默认放行来电、重复来电、闹钟和媒体，再由用户进入系统勿扰授权。拒绝授权不会阻止专注计时。设置变更只用于下一轮，开始时原生快照 `dndRequested`，不能由前端伪造本轮选择。

普通暂停保留规则；结束、自动到期进入原有五分钟休息、重启中断和备份替换走原生撤销。专注页可主动撤销本轮声音辅助，计时和偏好保留，同一轮重建或继续计时也不会自动重开。系统规则详情提供独立原生说明/撤销入口。原有五个主导航入口保持。

`getDndStatus()` 与 `observeControl().dnd` 只读，不创建规则、激活规则、写恢复记录或结算计时。`restoreDnd()` 为显式恢复，返回同样状态结构：

| 字段 | 含义 |
| --- | --- |
| `supported` / `permissionGranted` | 系统接口范围与本机勿扰授权分别报告 |
| `requested` / `sessionId` | 本轮快照与恢复记录归属 |
| `phase` | `off`、`permission_required`、`unsupported`、`requested`、`active`、`inactive`、`user_disabled`、`user_modified`、`missing`、`withdrawn`、`restored`、`restoration_failed` 或 `error` |
| `ruleEnabled` / `ruleActive` | 规则开关及系统报告的实际激活状态；无法核实时后者为 `null` |
| `verified` | 系统是否提供了明确的规则激活状态；不表示听觉验收通过 |
| `globalFilter` | 当前合并后的系统勿扰状态，只读取、不改写 |
| `recoveryPending` / `error` | 未完成的本应用恢复责任与具体原因 |

`user_disabled` 表示规则开关关闭；`inactive` 只说明系统报告未激活/已停止，不推断用户动机。已请求不等于已生效。其他应用或系统规则仍可能施加更严格限制。

## 规则与恢复边界

Android 10 / API29 起创建具有本应用配置 Activity、随机 condition URI 的独立自动规则，不调用全局 `setInterruptionFilter` 或 `setNotificationPolicy`。API24–28 缺少本实现需要的独立完整策略范围，明确不支持，不改用全局覆盖。API35 起读取 `getAutomaticZenRuleState`，未知状态如实返回 `ruleActive=null`；API29–34 不声称已核实激活。

私有 `catfocus-dnd-<databaseName>` SharedPreferences 在施加效果前写入 condition、创建尝试及系统返回的规则定义指纹。撤销仅删除 condition 和指纹均符合的本应用规则。用户修改、授权丢失或系统拒绝删除时保留恢复责任，报告 `restoration_failed`；不覆盖后续系统选择。用户主动关闭/移除规则后，同轮不自动重建。创建后、激活前失败仍保留精确撤销责任。系统返回策略可能补全默认字段，因此按实际声音类别核对创建范围，以系统返回的完整定义保护之后的修改，不能用本地构造对象整体相等作创建验收。

偏好通过原有 AppData 备份保存；运行日志、规则编号、授权和 `dndRequested` 活动会话不属于 AppData，备份不能还原为正在执行。Android 整包自动备份仍为关闭。系统强停可能阻断自动生命周期处理，重新打开应用后显式对账，系统勿扰规则页面的本应用恢复入口保持可达；没有声称系统强停免疫。

## 2026-11-15 验证

目标：官方 AVD `KittenFocus_API36_QA`，Android 16 / API36，`emulator-5580`；设备 ADB 来自 `D:\KittenFocus-Android\sdk\platform-tools`。仅安装 `com.xiaomao.focus.qa` 及其测试包，测试使用独立数据库。没有使用旧 MuMu，也没有清空原包、修改全局通知监听器或其他应用的规则。

按用户确认的公开原生控制接缝执行 `FocusDndTest`，仅 Android 勿扰/时钟边界可控：6 项通过（0.973 秒）。5 项验证拒绝权限仍计时、只读重建、暂停保留、主动撤销与偏好独立、修改/关闭规则保留并可重试、到期释放进入休息及重启不重施加；1 项直接使用真实 Android 规则验证开始、暂停、撤销和继续计时。

实测先红后绿：最初整体 `ZenPolicy.equals` 因 API36 补全字段失败，刚创建的规则被误判为修改，未激活且恢复被阻止。修复后系统实测返回：

```json
{"phase":"active","ruleEnabled":true,"ruleActive":true,"verified":true,"globalFilter":2,"recoveryPending":false}
{"phase":"withdrawn","ruleEnabled":false,"ruleActive":null,"verified":false,"globalFilter":1,"recoveryPending":false}
```

真实规则核对来电类别允许、来电联系人为任何人、闹钟允许、媒体允许、消息禁止；撤销前后规则集合与原始规则定义一致，继续计时没有重建。最初失败留下的单条测试规则已通过确切 ID 加完整随机 condition 匹配清理，未按包批量删除。测试仅在原来未授权时临时授权 QA 包，最后撤回该授权；失败时保留恢复日志，测试 fixture 的兜底只删除本次创建的确切 ID。

前端 TypeScript/Vite 构建通过；现有 27 项 Vitest 通过；Java 主包与测试 APK 构建通过。尚未把上述规则验证扩大成真实来电、硬件音频/振动、OEM、API29–35 设备矩阵或强停后自动清理的验收结论。设置页面的最终集成 UI 验证由集成流程记录。
