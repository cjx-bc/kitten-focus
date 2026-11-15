# 应用内更新

已确认规则：手机首次手动覆盖安装带更新能力的版本，之后在“我的 → 检查更新”完成下载，并通过系统确认安装。

- 面向本人和少量朋友，源码保持私有，安装包免登录下载。
- 更新地址使用自有服务器 `47.251.9.162` 的 HTTPS 服务；80 用于证书验证，443 用于下载，证书自动续期。
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

`GET /updates/stable.json`：顶层 `schemaVersion: 1`，`release` 为 null（尚无发布）或包含 `applicationId`、`versionName`、`versionCode`、`minSdk`、`url`、`size`、`sha256`、`notes` 的对象。只接收同一更新站点下的 HTTPS APK 地址。

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

本次服务器目录为 `/opt/kitten-focus`，服务容器 `kitten-focus-updates`。没有恢复已被用户删除的图书系统容器，数据库卷仍保留。服务器只存公开 APK、清单和 TLS 服务证书，应用签名密钥只保存在开发电脑。

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
