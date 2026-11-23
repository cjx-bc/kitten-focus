# 应用内更新

2026-11-23 已发布 0.2.12 / versionCode 18：优化单段原生小猫开屏节奏（增加约 320ms 静候反应停顿后再触发歪头抖耳 Wink，总动画时长 1000ms，`MAX_WAIT_MS` 调整为 2000ms，继续保留进行中会话与减少动态效果直通及 180ms 淡出退场）。20 个测试文件 / 161 项宿主单元测试、5 个 E2E 文件 / 32 项浏览器及 UX 门禁检查、TypeScript/Vite 生产构建、安卓 APK 构建、5 项安卓 JVM 单元测试、安卓仪器测试编译检查与包名/签名/完整性校验（`prepare-update.py`）通过，未运行模拟器与真机回归。GitHub Release、官网下载页、`/download` 跳转及线上 `domain-stable.json` 已同步。详见 [0.2.12 发布说明](../releases/release-0.2.12.md)。

2026-11-23 已发布 0.2.11 / versionCode 17：单段原生「歪头抖耳 Wink」纯黑白猫头开屏动画（`AnimatedVectorDrawable` + 底部「小猫专注 / 专注此刻，陪小猫一起长大」品牌标识 + `SplashCoordinator` 首帧就绪保持与 180ms 淡出退场，消除原生/前端两段切换闪屏；进行中会话拉回与减少动态效果跳过等待，Android 7–11 静默降级为纯猫头静态图标）。20 个测试文件 / 161 项宿主单元测试、5 个 E2E 文件 / 32 项浏览器及 UX 门禁检查、TypeScript/Vite 生产构建、安卓 APK 构建、5 项安卓 JVM 单元测试、安卓仪器测试编译检查与包名/签名/完整性校验（`prepare-update.py`）通过，未运行模拟器与真机回归。GitHub Release、官网下载页、`/download` 跳转及线上 `domain-stable.json` 已同步。详见 [0.2.11 发布说明](../releases/release-0.2.11.md)。

2026-11-23 已发布 0.2.10 / versionCode 16：全端交互精简与窄屏适配（单层弹窗与三层渐进披露重构、专注结果页情绪与休息/再来一轮出口、待办防误触单区学霸胶囊与独立图标、日历起止时间整行排布与 320px 周条适配、统计日视图指标与整数纵轴、权限中心单行横滑与术语折叠，以及无障碍服务解绑重连与授权读取加固）。19 个测试文件 / 159 项宿主单元测试、5 个 E2E 文件 / 32 项浏览器与 UX 门禁检查、TypeScript/Vite 生产构建、安卓 APK 构建、安卓 JVM 单元测试、安卓仪器测试编译检查与包名/签名/完整性校验（`prepare-update.py`）通过，未运行模拟器与真机回归。GitHub Release、官网下载页、`/download` 跳转及线上 `domain-stable.json` 已同步。详见 [0.2.10 发布说明](../releases/release-0.2.10.md)。

2026-11-21 已发布 0.2.9 / versionCode 15：重构学霸模式为「总开关 + 应用限制 / 严格模式 / 免打扰 + 授权与权限中心」，支持学霸专注页锁定、推荐默认与自定义记忆及旧版迁移/备份兼容；支持临时放行与白名单通知放行独立开关并优化输入法临时浮层识别；换装全新小猫应用图标并优化待办编辑弹窗交互。19 个测试文件 / 175 项宿主测试、TypeScript/Vite 生产构建、安卓 APK 构建、安卓 JVM 单元测试、安卓仪器测试编译检查与包名/签名/完整性校验（`prepare-update.py`）通过，未运行模拟器与真机回归。GitHub Release、官网下载页、`/download` 跳转及线上 `domain-stable.json` 已同步。详见 [0.2.9 发布说明](../releases/release-0.2.9.md)。

0.2.8 / versionCode 14 优化待办创建、开始专注和主题管理，修复今日统计及跨午夜显示。157 项宿主测试、浏览器待办流程、前端生产构建、安卓 APK 构建、安卓 JVM 单元测试与签名校验通过。按发布要求跳过模拟器测试。详见 [0.2.8 发布说明](../releases/release-0.2.8.md)。

2026-11-19 已发布 0.2.7 / versionCode 13：修复 `NotificationProtection` 严格倒计时到期交接空窗期误判（`absent`）、优化重复日程/课程与锁机快照锁定及壁纸操作修订守卫、精简安卓启动图标/闪屏资源并加固 API 26–36 兼容、修复发布页 `download.js` 20 秒总时长误中断并支持 `SSH_BIND_ADDRESS` 分发同步。宿主机 16 个测试文件 / 143 项单元测试、TypeScript/Vite、正式 APK 构建与签名/完整性校验（`prepare-update.py`）通过；D 盘 API 36 隔离 QA 模拟器通过 125 项核心/兼容性仪器测试、25 项通知原生/真机测试、3 项全局白名单烟雾测试与 5 项业务回归烟雾测试（`--details-only`）。GitHub Release、官网下载页、`/download` 跳转及线上 `domain-stable.json` 已同步。

2026-11-17 已发布 0.2.6 / versionCode 12：全盘排查修复前端界面与流程、权限授权等待状态机（`usePendingEnable`）、Top-layer `[popover]` `.toast` 定位、`ProtectionHelpView` 标题对齐、`Chart` 重绘守卫及安卓端 `FocusNavigation` `SessionClock` 同步等多项问题。宿主机 16 个测试文件 / 132 项单元测试、TypeScript/Vite、正式 APK 构建及签名/完整性校验通过；D 盘 API 36 隔离 QA 模拟器通过 121 项核心/保护仪器测试、5 项学习模式测试、5 项滚屏/手势导航触摸测试、6 项 WebView 端到端巡检及软键盘弹窗适配检查。GitHub Release、官网下载页、下载跳转及线上 `domain-stable.json` 同步发布。

2026-11-16 已完整发布 0.2.5 / versionCode 11：响应式布局、统一弹窗与开关、保护状态及白名单显示修正、设置与休息页优化。66 项宿主测试、TypeScript/Vite、Android assembleDebug 和 1 项安卓 JVM 单元测试通过；包名、原签名及 APK 完整性通过 `prepare-update.py` 校验。浏览器巡检覆盖 9 页与 27 组视口。本轮不启动模拟器，也不将旧版的系统效果测试当作本轮复测。GitHub、官网页面、下载跳转、域名 stable 与 IP domain-stable 均已同步，公网 APK 哈希一致。旧 IP stable 仍保留 0.2.0。逐项状态见 [0.2.5 发布记录](../releases/publication-0.2.5.json)。

本次同步曾因本机 Meta/TUN 出站路径提前关闭 TCP/22 而受阻：服务器与 GitHub 的 22 端口都在 SSH banner 前 EOF，但代理中的 GitHub SSH/443 正常；仅为单个 socket 选择物理 WLAN 后，目标服务器 0.42 秒返回 OpenSSH banner，原有密钥成功登录。后续发布通过该单连接通道完成，未修改服务器 SSH 服务、密钥、全局代理或路由表。

2026-11-16 按用户“提交推送，然后发布”的指令准备 0.2.4 / versionCode 10，沿用 `com.xiaomao.focus` 与原内测签名。分发构建通过58项宿主测试、TypeScript/Vite、Android打包及签名/包名校验；D盘API36模拟器正式包冷启动、五栏图标、十项诊断及版本读取通过。此前隔离QA的140项去重原生结果和平台限制见[最终验收报告](focus-control-final-acceptance.md)。0.2.4发布说明明确保留图标缓存、壁纸恢复及OEM/其他API缺口，不声明完整平台矩阵通过。发布结果见[0.2.4发布记录](../releases/publication-0.2.4.json)。

已确认规则：手机首次手动覆盖安装带更新能力的版本，之后在“我的 → 检查更新”完成下载，并通过系统确认安装。

- 面向本人和少量朋友。用户后续已明确要求将 cjx-bc/kitten-focus 改为公有，源码及 Releases 现已公开，安装包免登录下载。
- 更新清单通过 `focus.linma.asia` 提供，IP 保留备用；80 用于证书验证，443 用于 HTTPS。0.2.1 APK 正式来源为公开 GitHub Releases，默认尝试免费代理候选，失败再换备用。
- 每天首次打开时后台检查一次，仅显示红点；手动检查不受时间限制，不自动下载。
- 更新可跳过，离线仍可使用原有功能。
- 有未结束专注（包括暂停）时，可查看更新，结束后才能下载或安装。
- Wi-Fi 下点击直接下载；计费网络先确认包大小。系统下载管理器负责后台传输，支持取消、失败重试。
- 下载后校验长度、SHA-256、包名、版本和签名，安装前再次确认专注状态。
- 升级前本地自动保存恢复副本，保留最近三次；与手动导出分开。迁移失败保留原数据与副本。
- 维持现有内测签名身份，签名密钥仅保存在开发电脑，禁止上传到服务器或 Git。
- 每次发布前完成验证并取得用户确认；原子切换线上版本清单，半上传的文件不对手机声明可用。

本次交付版本为 0.2.0（versionCode 6）。经用户确认后已发布到正式 stable 更新清单；后续版本仍先准备候选包，通过验证并确认后再切换清单。

## 接口

`GET /updates/stable.json`：顶层 `schemaVersion: 1`，`release` 为 null 或包含 `applicationId`、`versionName`、`versionCode`、`minSdk`、`url`、`size`、`sha256`、`notes` 的对象。0.2.1 新增 `downloadUrls`：最多四个不重复 HTTPS 地址，表示下载顺序。`url` 为 GitHub 正式原链接，所有线路必须提供同一个 SHA-256 对应的 APK。客户端只接收本仓库对应版本的 GitHub 原链、获准代理前缀、自有下载域名和 IP 地址。

文件名含版本号，已发布 APK 不覆盖。清单禁止缓存，APK 可缓存并支持 Range，发布脚本先验证服务器文件哈希再替换清单。

## 官方资料

- Android DownloadManager：https://developer.android.com/reference/android/app/DownloadManager
- 安装权限：https://developer.android.com/reference/android/content/pm/PackageManager#canRequestPackageInstalls()
- 应用更新身份：https://developer.android.com/google/play/app-updates
- IP HTTPS 证书：https://letsencrypt.org/2026/03/11/shorter-certs-certbot/

## 验证记录

0.2.0：14 项业务测试、18 项安卓测试通过；独立 Android 15 模拟器完成 0.1.4 → 0.2.0 QA → 0.2.1-qa2 的覆盖安装、应用内下载和系统安装确认，业务数据完全一致，原生安装前副本存在。具体证据和限制见 [verification.md](verification.md)。

发布时重新核对 HTTPS 公网安装包长度、SHA-256 与正式清单，均与已验证候选包一致。正式下载地址为 `https://47.251.9.162/releases/xiaomao-focus-0.2.0.apk`，首次手动覆盖安装；安装 0.2.0 后会显示已经是最新版本，等下次发布更高版本时才能在应用内更新。

原生网络失败采用可注入的清单读取接口验证 IOException；实际 HTTPS 网络和安装链路已运行。真实蜂窝网络确认、厂商省电策略、API 24 下载服务的证书兼容仍待物理设备验证，不能把模拟器结果等同于所有设备支持。

## 开发与发布

服务器目录为 `/opt/kitten-focus`，服务容器 `kitten-focus-updates`。没有恢复已被用户删除的图书系统容器，数据库卷仍保留。服务器只存公开 APK、清单和 TLS 服务证书，应用签名密钥只保存在开发电脑。域名与公开下载策略见 [domain-distribution.md](domain-distribution.md)。

应用最低 API 24。更新检查额外信任域内的公开 ISRG Root X1，以照顾较旧设备；系统 DownloadManager 的实际信任链取决于设备系统。新增公开根证书来自 Let's Encrypt 官网，SHA-256 为 `96bcec06264976f37460779acf28c5a7cfe8a3c0aaae11a8ffcee05c0bddf08c6`，不是关闭证书校验。

签名备份位于开发电脑 `C:\Users\33428\.codex\signing-backups\kitten-focus-internal.keystore`，已限制目录 ACL，不进 Git。当前内测继续使用原 Android Debug 身份；换开发电脑或改签名必须先处理兼容，不能直接生成新签名。

先构建并生成清单：

```powershell
npm.cmd run build
npx.cmd cap sync android
.\android\gradlew.bat -p android :app:assembleDebug --console=plain
python scripts/prepare-update.py --apk releases/xiaomao-focus-0.2.0-debug.apk --notes-file releases/notes-0.2.0.txt --output releases/update-0.2.0.json
python scripts/publish-update.py --apk releases/xiaomao-focus-0.2.0-debug.apk --manifest releases/update-0.2.0.json
```

上面的最后一步只上传至服务器私有候选目录，不修改在线清单。用户确认后，使用同样参数加 `--publish` 才会公开 APK 并原子发布 stable 清单。发布脚本会检查远程文件 SHA-256、实际公网下载内容，再切换清单；已有 APK 同名内容不可覆盖，旧清单留存在服务器的 manifest-history。

默认构建读取 stable。自动升级演练使用 Gradle 参数 `-PupdateChannel=qa-20261114-c98b` 和递增的 `updateVersionCode` / `updateVersionName`，仅用于测试；不能把 QA 版本发给日常用户。先准备两个 QA APK 和 QA 清单，再在干净测试模拟器执行 `ANDROID_SERIAL=... node scripts/updater-smoke.mjs`。

## 服务器运维

部署配置为 `deploy/updates/compose.yaml`、`nginx.conf`、`renew-certificates.sh` 和 systemd service/timer。镜像固定摘要。每 6 小时检查短周期 IP 证书，续签后重载 Nginx。无邮箱的 ACME 账号不依赖邮件提醒，应检查定时任务和证书到期日期。

```powershell
ssh myserver "sudo -n systemctl status kitten-focus-cert-renew.timer --no-pager"
ssh myserver "sudo -n journalctl -u kitten-focus-cert-renew.service -n 30 --no-pager"
curl.exe --noproxy '*' https://47.251.9.162/health
```

端口 80、443 已实际从公网访问。当前云端已允许访问，没有改动不相关的端口或恢复图书服务。更换公网 IP 前必须同时修改证书、服务地址、客户端信任域和发布脚本，并先发过渡版。
