# Android 测试载体选型核验（2026-11-15）

## 主结论：官方 Android Emulator，API 36 独立测试机

首选 **Google 官方 Android Emulator + Android 16 / API 36、Google APIs、x86_64 的完整手机镜像**，用于承载当前学霸模式、严格倒计时、独立锁机、通知和壁纸实验。选择依据是项目 compile/targetSdk 36、现有 ADB/AndroidJUnitRunner/WebView CDP 工具链，以及整机隔离、持久数据和快照回退需求；这不是宣称该镜像已通过本项目全部验收。Android 16 是与当前目标对应的基线，不代表调查时最新 Android。[E1–E4；适配判断来自项目]

推荐实例 `KittenFocus_API36_QA`：2 个虚拟 CPU、4GB 客体 RAM、720×1280 左右分辨率，图形先用 Automatic；这是针对本机资源的初始配置建议，尚无本机性能实测。SDK 和 AVD 数据规划放 D 盘，预留约 20–30GB 作为镜像、用户数据、快照的工作预算；它是工程预算，不是下载包的精确大小。采用独立 `.qa` 安装；完整手机镜像优先，ATD 不是本任务的主环境，因为官方 ATD 会移除 WallpaperPicker 和 WallpaperBackup 等组件。[E1、E5；配置与空间为建议]

可另外建立 Google Play 镜像实例，验证 release 签名系统下的正常授权边界及组件更新场景。Google Play 镜像不提供 root；其他可 root 镜像也不能用 root 授权结果代替普通用户流程。WebView 实际版本和可更新性在建机后检查，不能由 API 36 直接推断。[E1]

### 本机当次只读检查

本节是 2026-11-15 的本机测量，不是外部平台宣传；空闲资源随运行变化。

| 项目 | 实测 | 对选型的影响 |
| --- | --- | --- |
| 系统/CPU | Windows 11 专业版；i5-11300H，8 逻辑处理器 | 选择 x86_64 客体，避免在 Intel 上选 ARM 客体作为默认路线。 |
| 内存 | 总计约 15.8GiB；当次可用约 3.8GiB | 官方文档建议至少 16GB；本机处于紧张状态，不能承诺流畅。运行新机时应只开一个 Android 实例，构建与设备重测错开。[E3] |
| 磁盘 | E 剩约 2.5GiB；D 剩约 70.6GiB；C 剩约 20.5GiB | 新系统镜像与 AVD 优先规划 D 盘；现有项目不需要搬迁。 |
| 虚拟化 | `HypervisorPresent=True`；WHPX Windows 功能查询因需要提升权限而未获结果 | 无法据 CIM 的 VT/SLAT False 就认定 BIOS 没开虚拟化；WHPX 和 Emulator 加速尚待实测。没有改变 Windows 功能或 BIOS。官方 Windows 推荐 WHPX，AEHD 将在 2026-12-31 结束支持。[E4] |
| 现有设备 | `127.0.0.1:16416` 在线；Android 15/API35/x86_64；WebView `110.0.5481.154.1` | 保留作为此前基线；不能代替 API36 测试。 |
| 现有 SDK | 项目内 SDK 有 API36/platform-tools/build-tools/cmdline-tools，未见 emulator/system-images 目录 | 还没有安装并启动新的官方模拟器。 |

通过现有 SDK 的只读包列表已查到：`emulator` 37.2.13；API36 的 `google_apis/x86_64`、`google_apis_playstore/x86_64`；API24、25、26、35 对应的 x86_64 手机镜像。这里只证明包目录可获取，不证明本机启动和本项目探针通过。当前工具输出使用斜杠包路径，并提示 sdkmanager 已委托新 Android CLI；实际安装以当时 CLI 帮助/Device Manager 为准，不盲抄旧命令。

### 对最新任务的实际价值与边界

- T03/#4 当前因原有 MuMu 壁纸缺乏完整恢复源而停在门禁检查。新建可丢弃 AVD 后，可先保存自己提供的静态壁纸原文件、已知动态壁纸提供者及设置，并保存整机基线快照，再跑选择/拒绝、恢复、进程死亡和重启矩阵。这解决实验基线问题；**不会赋予生产 APK 读取其他应用/系统壁纸的额外权限**。Android 13/14 对普通壁纸读取的限制仍存在。[E2、E6；项目事实见 #4 评论及 wallpaper probe README]
- 无障碍、通知监听/DND、桌面/最近任务、动态壁纸、重启行为是建机后的资格探针，需逐项实际开启、撤销、观察系统效果。官方 Emulator 是适合的测试载体，不是这些功能已通过的证据。
- 快照用于实验回退；不能把加载快照当作设备重启验收，必须单测真实 guest reboot/cold boot。[E2]
- API24/25 补最低版本与降级；API26 补通知 snooze 边界；API35 复核现有结果；API36 为主。按需顺序安装/启动，不同时运行所有版本。此矩阵来自项目 min24/target36 和通知路线。
- 国产 ROM 的后台清理、真实 SIM 来电/紧急交互及长期锁屏，仍需相应 OEM 真机。官方模拟器支持来电/SMS**模拟**，不能当真实运营商链路结果。[E3；覆盖范围为工程判断]

此轮只检索、只读测量并记录研究；没有安装镜像、关闭 MuMu、修改权限/壁纸、清除数据、重启设备或购买云服务。下一步载体可用标准是下文资格探针与本机启动/资源检查通过。

### 官方 Emulator 来源

- E1 AVD、完整镜像、Google Play/root、配置：https://developer.android.com/studio/run/managing-avds
- E2 快照范围、冷启动及快照失效：https://developer.android.com/studio/run/emulator-snapshots
- E3 Emulator 能力与系统要求：https://developer.android.com/studio/run/emulator
- E4 Windows WHPX 与 AEHD 时间表：https://developer.android.com/studio/run/emulator-acceleration
- E5 ATD 移除的应用：https://developer.android.com/studio/test/gradle-managed-devices
- E6 WallpaperManager 读取限制：https://developer.android.com/reference/android/app/WallpaperManager

## 其他载体

核验范围：Genymotion Desktop / SaaS、Google Android Device Streaming / Developer Device Platform、AWS Device Farm。只依据平台官方资料；未安装、购买、预订设备或运行项目探针。本文补充官方 Android Emulator 之外的选择，不是这些平台已通过本项目验收的证明。

项目依据：ADR 0001、0002 为 accepted；原生专注控制 ADR 0004 为 proposed。当前待验证的是学霸模式、锁机、通知拦截/释放及提升强制性选项，不能把“安装 APK 成功”当成原生能力通过。给定开发机为 Windows、i5-11300H、16GB RAM，项目 minSdk 24、compile/targetSdk 36；设备须支持 API 36 测试，但不能据此假定 Android 16 是调查时最新 Android。

## 建议

**没有一台虚拟机能同时证明标准 Android 行为、各厂商后台限制、真实来电必要功能例外和长期重启恢复。**这是由下述平台范围及会话机制得出的工程判断。推荐保留一个本地、可持久化、可 ADB 操作的 API 36 主载体，再以真实 OEM 手机验收原生控制。没有本地真机时，Google Android Device Streaming 是最贴合现有 ADB 工具链的补充；真实 SIM 来电与长期恢复最终仍用自有真机验收。Genymotion SaaS 可卸载本机虚拟化负载，但其持续计费和手动保存机制使它不适合作为默认长期工作手机。[G1–G7、D1–D3、A1–A4]

| 载体 | 可确认能力 | 本项目主要限制 | 建议定位 |
| --- | --- | --- | --- |
| Genymotion Desktop | Android 16/API 36；标准 SDK ADB 可选；本地设备管理、冷启动、复制、恢复出厂；新版镜像默认 unrooted，可切换 root。[G1–G4] | API 36 需付费；官方要求 16GB+ RAM，本机刚到门槛。Windows 推荐 VirtualBox，官方警告启用 Hyper-V 时启动和性能问题；Windows QEMU 仍属实验且不推荐。不是 OEM ROM。[G1、G2、G5] | 能接受付费及虚拟化环境调整时的本地备选，不能仅凭产品宣传断言比官方 Emulator 更快。 |
| Genymotion SaaS | ARM64 Android 16/API 36；gmsaas 将远程设备接入本机 ADB；可保存自定义镜像/recipe；现代镜像默认 unrooted。[G3、G6、G7] | 改动不自动保存；关闭浏览器不停止设备；运行持续收费。未验证实际重启后 ADB 重连、壁纸组件及特殊授权流程。设备规格外观不等于对应 OEM 系统。[G6–G8] | 本机资源不足时的短期开发/自动化备用。 |
| Google Android Device Streaming / DDP | 真实 Pixel 和 OEM 合作实验室设备；ADB over SSL，可接现有 ADB 工具；Android Studio 和 Android CLI 有入口。[D1、D2] | 会话结束清空并恢复出厂，不能跨归还保留授权、壁纸、会话。具体 API 36/OEM 的实时库存须在目录核对；未发现对本项目所有特殊能力的逐项保证。[D1、D3] | 优先用于短时 OEM 行为与原生能力验收。 |
| AWS Device Farm Remote Access | 真机浏览器操作、APK 上传、Appium endpoint、录像/日志；会话最多 150 分钟。[A1、A2] | 公开远程访问文档没有承诺本机通用 ADB/CDP 直连；云端自动化主机有 adb，不等于本机远程会话有 adb。设备没有运营商连接，不能打电话或发 SMS。API 36 库存需另外确认。[A1–A4] | 适合已有 AWS/Appium 流程的人工兼容性补充；本项目优先级低于 Google streaming。 |

## 关键官方事实

### Genymotion

- Desktop 官方当前产品页明确：免费版提供 Android 5–15，Android 16 仅付费许可。Individual 标价 **US$239.99/年/电脑**，仅适用 freelancer/self-employed，不适用于 employees、contractors、resellers；Business 为 **US$479.99/年/用户与工作站**；Educational **US$49/年/学生与工作站**需资格证明。价格为 2026-11-15 页面快照，购买前复核资格和税费。[G5]
- Desktop 官方要求 Windows 11、VT-x/AMD-V、OpenGL 3.3、16GB+ 内存；部分 Intel 核显存在兼容问题。本机 CPU 满足其“Intel 六代及以后”的代际要求，但没有在该机器上做性能/显卡实测。不要为评估方案直接关闭 Hyper-V，先检查现有 WSL、Docker、模拟器依赖。[G1；最后一句是实施建议]
- Desktop 可配置使用项目同一 Android SDK 工具根目录，减少多套 adb server 竞争；SaaS 的 `gmsaas instances adbconnect` 接入本机 adb。[G2、G6]
- Desktop 与 SaaS 的 API 36 镜像均有明确官方条目；SaaS 旧 x86/x86_64 镜像已弃用，当前 Android 16 属 ARM64 路线。root 开关用于诊断，正式授权/恢复验收应采用 unrooted 配置。[G3；验收方式为建议]
- SaaS 按量 **US$0.06/运行设备分钟**，约 US$3.60/设备小时；设备运行即计费。必须手动保存更改为 custom image/recipe；保存过程会停止实例。gmsaas 启动默认没有 inactivity timeout，关闭浏览器不会自动停止。[G7、G8]
- Phone widget 官方描述的是接收来电/SMS的**模拟**。可帮助检查必要功能例外路由，但不能代替真实蜂窝网络来电、OEM 电话界面和音频中断验收。[G9；适用范围为推论]

### Google：新的迁移状态必须纳入选型

- 2026-11-12 更新的官方 FAQ 已宣布 Firebase Test Lab 将迁移至 **Google Cloud Developer Device Platform（DDP）**；旧 Test Lab 执行支持至 **2027-09-30**，之后旧 console/API 关闭。**Android Device Streaming 不弃用**。[D4]
- Android Studio streaming 文档仍列出 Firebase 项目及免费配额入口；DDP 新入口则要求启用 Cloud Billing。不要把旧 Firebase 免费分钟规则直接套用到新 DDP 项目。[D1、D4]
- DDP 官方价表当前 public preview：真机 streaming **US$0.15/设备分钟**、真机 Device Run **US$0.083/设备分钟**、模拟器 **US$0.017/设备分钟**；秒计费、最低一分钟。FAQ 写旧价匹配至 **2027-04-30**，商品价表写标准价格从“April 2027”开始，日期粒度不一致；未来费用应在实际结算入口复核，本笔记不把两页合成精确切换时刻。[D4、D5]
- 真机 streaming 能复用 ADB 工具且提供 OEM 合作实验室；官方只保证会话隔离和归还后擦除。**未核实**任意 `adb reboot`、设备所有者/管理员、AccessibilityService、NotificationListenerService、DND 授权及 live wallpaper 在所有实验室设备都允许。必须先用小 APK 做一次资格探针，再投入原生改造。[D1、D3]

### AWS

- Remote Access 有浏览器控制和 Appium URL；云端 automated custom test host 包含 Android SDK Platform-Tools/adb。两条能力不能互相替代，不应承诺像本地 USB 手机一样直接运行 `adb forward` 或 WebView CDP。[A1、A2、A3]
- 官方 Device capabilities 明确没有运营商连接，不能打电话/发 SMS。支持 OEM 型号/系统版本选择不等于支持真实蜂窝行为。[A4]
- 官方当前按量 **US$0.17/设备分钟**，新试用为一次性 **1,000 设备分钟**，同时适用于自动化测试和 remote sessions；不是每月重复免费额度。[A5]
- 私有设备 instance profile 可配置 session/run 后是否重启、清理 APK、保留指定包。该能力属于私有设备，不可套到公共设备；也不能据此推断用户可在公共远程会话中任意重启并继续保留连接。[A6]

## 为本项目安排的资格探针（建议，尚未执行）

1. 先安装隔离 `.qa` 包及独立通知发送测试 APK，记录系统 API、WebView provider/version、设备/OEM。验证本机 ADB 可见、logcat、instrumentation、调试 WebView socket 与 CDP forward；API 36 并不自动保证 WebView 版本或可更新性。
2. 在系统设置实际开启无障碍服务、通知读取和 DND 特殊访问，验证撤销后的“保护失效”反馈；不要只用 root/secure settings 强写来证明正常用户能授权。
3. 以独立应用发普通/ongoing/分组通知，验证 snooze、到期释放及提前释放探针；外部应用通知暂缓的可行性须在目标 OS 实测。
4. 验证静态/动态壁纸设置、锁屏/桌面恢复、授权撤销及当前 live wallpaper 切换；OEM 的壁纸选择器和 launcher 要独立验收。
5. 验证退出前台、清最近任务、进程死亡、force-stop、重启，并分别记录预期与实际恢复；快照恢复不能代替完整设备启动。云平台先确认重启不终止预订，再做此项。
6. 真实来电、紧急/系统必要交互、OEM 后台清理、长时间锁屏、充电/省电模式：留给带真实 SIM 的自有 OEM 真机。云设备无明确承诺时记为未覆盖。

通过标准：以上相关能力有日志与复现步骤，再把载体升级为“可用”。本研究没有声称任何候选已全部通过。

## 官方来源

- G1 Genymotion Desktop requirements / Windows hypervisor：https://docs.genymotion.com/quickstart/desktop_install/
- G2 Desktop ADB settings：https://docs.genymotion.com/usage/desktop/general_settings/
- G3 Android images and root matrix：https://docs.genymotion.com/features/root/
- G4 Desktop virtual device management / cold boot：https://docs.genymotion.com/usage/desktop/vd_settings/
- G5 Desktop plans, eligibility, Android 16 paid：https://www.genymotion.com/product-desktop/
- G6 SaaS ADB：https://docs.genymotion.com/usage/saas/connect_adb/
- G7 SaaS saving and lifecycle：https://docs.genymotion.com/usage/saas/first_steps/
- G8 SaaS pricing：https://docs.genymotion.com/usage/saas/pricing/
- G9 Phone simulation：https://docs.genymotion.com/features/phone/
- D1 Android Studio streaming, ADB, OEM labs, reset, CLI：https://developer.android.com/studio/run/android-device-streaming
- D2 Android Device Streaming Firebase entry：https://firebase.google.com/docs/test-lab/android/android-device-streaming
- D3 Device Streaming API overview：https://docs.cloud.google.com/device-streaming/docs/overview
- D4 Firebase Test Lab migration/deprecation FAQ：https://firebase.google.com/docs/test-lab/migrate-faq
- D5 DDP product and pricing：https://cloud.google.com/products/developer-device-platform
- A1 AWS remote access：https://docs.aws.amazon.com/devicefarm/latest/developerguide/remote-access.html
- A2 AWS remote sessions / 150 minute limit：https://docs.aws.amazon.com/devicefarm/latest/developerguide/how-to-use-session.html
- A3 AWS automation host / adb：https://docs.aws.amazon.com/devicefarm/latest/developerguide/custom-test-environments-hosts-android.html
- A4 AWS device capabilities：https://docs.aws.amazon.com/devicefarm/latest/developerguide/devices.html
- A5 AWS pricing：https://aws.amazon.com/device-farm/pricing/
- A6 AWS private instance profiles：https://docs.aws.amazon.com/devicefarm/latest/developerguide/set-up-private-devices-account-settings.html
