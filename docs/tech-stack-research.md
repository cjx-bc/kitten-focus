# 小猫专注：技术栈核实笔记

核查日期：2026-11-14。范围仅为技术选型调研，未实现代码或 UI。后续用户已接受 Vue 3 / TypeScript / Capacitor、Java 原生能力、Java 21 / Spring Boot、SQLite / MySQL、ECharts 与 SVG / 图片 / CSS 动画的选型，见 [需求基线](requirements.md) 和 [ADR 0001](adr/0001-vue-capacitor-java.md)。下文保留调研时的建议与事实记录；具体版本和业务规则不因此自动定案。

已检查 `E:\AGENTS.md`、`E:\codexseeson\AGENTS.md`、项目根与 `docs` 的 `AGENTS.md`，未发现文件；按会话指示读取了 `C:\Users\33428\.codex\RTK.md`。本次只创建此笔记。实际通过 web.run 获取了 Capacitor、Android、DCloud、Spring、Oracle 官方文档；另通过 HTTP 获取官方 npm 发布元数据及 Spring Boot 官方 GitHub release API。没有把搜索摘要当成未读取的正文，也未使用二手教程。

## 结论与适用范围

本项目强制 Vue 和 Java，当前目标是 Android、定制化小猫视觉、待办与子任务、专注、手动课表时间轴、成长商店、统计与我的；第一版无 AI，强力锁机后做。基于这个范围，建议：

- 界面：Vue 3 + TypeScript + Vite，Pinia 管状态、Vue Router 管页面；Capacitor 8 包装 Android，保留标准 Web UI 开发方式。[C1]
- 原生：Java 插件维护专注会话状态、通知与 Android 系统交互；本地数据建议先采用 SQLite。Room 的具体版本、Java 注解处理与工具链适配留到实现阶段验证，不把 Kotlin 作为本项目必需语言。[C2][A1][A2]
- 服务端：需要账号与跨设备同步时接入 Java 21 + Spring Boot + MySQL；第一阶段可以先把本地业务和数据接口边界做好。单体服务足够，当前需求没有引入 Redis、MQ、微服务的依据。此条是架构建议，不是性能实测结论。
- 图表与视觉：可评估 ECharts；小猫形象和界面细节可用 SVG/CSS 与图片资源组合。这两项是选型建议，本次未做库版本核实、兼容性测试或 UI 实现。

## Vue + Capacitor 与 uni-app 的轻量比较

| 与本项目相关的维度 | Vue 3 + Vite + Capacitor | uni-app |
| --- | --- | --- |
| Vue / TypeScript | Capacitor 可加入已有 JavaScript Web 项目，接收构建后的资源目录；Vue/Vite 的产物可走这一接入方式。[C1] | 官方提供 Vue 3 + TypeScript 模板、Vue 3 及 TypeScript 文档。[U1] |
| Android Java 扩展 | 官方插件示例直接使用 Java、`Plugin`、`@CapacitorPlugin` 和 `@PluginMethod`；TS 侧通过桥接接口调用。[C2] | 官方原生插件教程提供 Java 的 `UniModule`、`@UniJSMethod` 示例，Java 并非不可用；但需要选择并维护 DCloud 对应的插件与打包链。[U2] |
| 定制视觉 | 标准 Web 前端到原生桥的边界较直观，适合本项目以自定义排版、插画、动画为主的 UI。此为基于接入模型的工程判断。[C1][C2] | 可制作定制 UI，但需按 uni-app 的组件、运行环境及跨端规则适配；多端收益要与抽象适配成本一起评估。[U1] |
| 多端与发布目标 | 当前 Android 目标足以支撑选用；不需要为尚未确定的平台提前增加抽象。此为范围判断。 | 官方同时覆盖 App、Web、小程序；若后续明确重视小程序复用，值得重新评估。[U1] |
| 后台计时、锁机 | 都要调用或适配 Android 原生能力，Web/框架层不能代替系统生命周期、调度与设备管理限制。[A1][A2][A3] | 同左；不能仅凭框架宣称可靠后台计时或普通应用无条件锁机。[A1][A2][A3] |

因此当前倾向 Capacitor；并非认定 uni-app 做不到。若团队已有成熟 uni-app 原生插件、明确的小程序计划，或既有工程约束，结论需要重新加权。

## 已核实：Capacitor 接入与工具链

Capacitor 官方的既有 Web 项目接入条件包括 `package.json`、独立的构建资源目录及其根部 `index.html`；配置 `webDir` 后安装/初始化 Capacitor、添加 Android 平台并同步 Web 产物即可形成桥接工程。Vite 项目通常使用 `dist`，应以实际构建配置为准，不要求采用 Ionic UI 组件。[C1]

官方 Java 插件使用 `Plugin` 子类、注解方法与 `PluginCall`，可以只暴露开始、暂停、恢复、结束、读取当前会话等窄接口；会话持久化与 Android 调度策略应归原生模块负责。这组接口是本项目建议，未编写实现。[C2]

截至核查日，官方 npm `@capacitor/core/latest` 返回 **8.6.2**；建议实施时统一锁定经过验证的 `core` / `cli` / `android` 8.x 版本，不在本文固定全部插件补丁号。[C3] 官方 v8 环境和迁移文档给出的 Android 基线为 Node.js 22+、Android Studio Otter 2025.2.1+、minSdk 24、compileSdk/targetSdk 36、AGP 8.13.0、Gradle Wrapper 8.14.3；Android Studio 配套 JDK应随实际生成工程确认。[C4][C5] 当前官方 Android 构建源码的 Java source/target 为 21；本项目应以 Java 21 开发基线做一次干净构建验证，而不是混用旧教程的 JDK 8/11 配置。[C6] v8.5 的迁移文档说明该次变更仅涉及 iOS，未新增 Android 迁移项。[C7]

## 已核实：后台计时的边界

不应写“切后台后所有 WebView JavaScript 必然暂停”。Android `WebView.onPause()` 文档明确说它**不暂停 JavaScript**；另一个方法 `pauseTimers()` 才会暂停所有 WebView 的布局、解析和 JavaScript 定时器。实际行为还受宿主调用、可见性和系统进程状态影响。[A1]

同时，Android 可回收缓存进程；从 Android 13 起缓存进程甚至可能得到很少或没有执行时间。因此 `setInterval` 每秒减一不能作为锁屏/后台计时的事实来源。[A2] 建议将“专注已过去多久”与“后台持续执行任务”分开：前者保存会话起点、暂停区间与状态，在恢复界面时重新计算；同次开机可用 `SystemClock.elapsedRealtime()`，它包含深度睡眠时间，且不受用户修改墙钟时间影响。[A4]

需要准时提醒或后台持续展示时，再按用途选择 Android 调度、通知及必要的服务。精确闹钟在现代 Android 有权限及用途限制，不能默认永久可用；前台服务也有类型和启动限制，不能仅为保活无条件开启。[A5][A6] 这些限制不妨碍“恢复后时间正确”的设计，但影响提醒准点性与通知体验。

实现阶段必须明确：进程回收后如何恢复、设备重启时会话算继续还是中断、用户手动改时间、通知/闹钟权限被拒绝、各厂商省电策略下的行为。本文不声称仅写 Java 服务就已保证所有设备锁屏后永不被杀。

## 已核实：强力锁机与 Java 服务端

Android lock task 面向专用设备。真正的 lock task 需由 DPC 将应用列入允许名单；没有允许名单时调用 `startLockTask()` 进入的是用户可退出的屏幕固定模式。不能把它承诺为普通消费者下载安装后即可获得的无条件强力锁机。[A3] 因此将强力锁机放到最后单独调研是合理的；其权限流程、设备覆盖与分发方式尚未定案。

Spring Boot 官方系统要求页在核查时显示 **4.1.2：至少 Java 17，兼容到 Java 27**，需要 Spring Framework 7.0.10+。官方 release API 同时返回非预发布的 `v4.1.2`，发布时间 **2026-10-22**，两项相互印证；这里没有用旧知识推断“最新”。[S1][S2] Java 21 落在官方支持区间，Oracle 官方将 Java 21 列为 LTS，因此选择 Java 21 可行。[S1][J1] 实施时再锁定具体 Spring Boot 小版本及数据库访问依赖，本文不需要为一个专注应用引入分布式架构。

## 尚未确认 / 开工前的小范围验证

1. 用户已确认 Capacitor 路线与安卓目标，随后访谈已确认第一阶段免登录、本地完整使用，账号与云同步后移，见 [ADR 0002](adr/0002-local-first-initial-release.md)。小程序或 iOS 不属于当前已确认目标。
2. 在目标 Android 真机完成最小验证：Vue 页面调用 Java 插件；锁屏和切后台后返回时间正确；杀进程后数据恢复；结束通知在授权与拒绝情况下行为清楚。
3. Java 21、Capacitor 8.x、SQLite 访问层、选定原生插件在实际工程中构建通过；第三方插件维护情况尚未评估。未把 Spring Boot 的 Java 兼容范围误当成所有第三方库的兼容承诺。
4. 分发渠道、最低支持系统/机型、通知和精确提醒权限、重启策略及强力锁机能力边界。此为必要的产品与实现选择，尚未测量。

## 官方来源

所有来源均于 2026-11-14 读取。正文 `[编号]` 对应以下可复查 URL；部分动态页未来可能改变。

- [C1] Capacitor — Installing Capacitor（既有 Web 项目接入）：https://capacitorjs.com/docs/getting-started
- [C2] Capacitor — Android Plugin Guide（Java 示例）：https://capacitorjs.com/docs/plugins/android
- [C3] npm 官方发布元数据，`@capacitor/core/latest`（HTTP 实际返回 8.6.2）：https://registry.npmjs.org/@capacitor/core/latest
- [C4] Capacitor — Environment Setup：https://capacitorjs.com/docs/getting-started/environment-setup
- [C5] Capacitor — Updating to 8.0：https://capacitorjs.com/docs/updating/8-0
- [C6] Capacitor 官方仓库 — Android build.gradle（main，移动分支，HTTP 实际读取）：https://raw.githubusercontent.com/ionic-team/capacitor/main/android/capacitor/build.gradle
- [C7] Capacitor — Updating to 8.5：https://capacitorjs.com/docs/updating/8-5
- [U1] DCloud — TypeScript 支持（含 Vue 3 + TS CLI 模板）：https://uniapp.dcloud.net.cn/tutorial/typescript.html
- [U2] DCloud — Android 原生插件开发（Java 模块示例；文内历史工具版本不能当成当前通用基线）：https://nativesupport.dcloud.net.cn/NativePlugin/course/android.html
- [A1] Android — WebView API（`onPause`、`pauseTimers`）：https://developer.android.com/reference/android/webkit/WebView
- [A2] Android — Processes and app lifecycle：https://developer.android.com/guide/components/activities/process-lifecycle
- [A3] Android — Lock task mode：https://developer.android.com/work/dpc/dedicated-devices/lock-task-mode
- [A4] Android — SystemClock（`elapsedRealtime`）：https://developer.android.com/reference/android/os/SystemClock
- [A5] Android — Schedule alarms：https://developer.android.com/develop/background-work/services/alarms/schedule
- [A6] Android — Foreground service types：https://developer.android.com/develop/background-work/services/fgs/service-types
- [S1] Spring Boot — System Requirements：https://docs.spring.io/spring-boot/system-requirements.html
- [S2] Spring 官方 GitHub latest release API（HTTP 实际读取）：https://api.github.com/repos/spring-projects/spring-boot/releases/latest
- [J1] Oracle — Java SE Support Roadmap（LTS 版本）：https://www.oracle.com/java/technologies/java-se-support-roadmap.html
