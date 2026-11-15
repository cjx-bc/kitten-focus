# 域名下载与更新

用户已授权实施，并明确不做过渡版；国内网络测试由用户完成。

- 下载页、二维码和更新清单：`https://focus.linma.asia/`，Cloudflare 代理 A 记录。
- APK 正式来源：公开 GitHub Releases，文件名 `xiaomao-focus-0.2.1-debug.apk`。默认候选为 `https://gh-proxy.com/` 加完整 GitHub 原链接。
- 下载顺序在 `downloadUrls` 中配置：候选代理、自有下载域名、GitHub 原站、旧 IP。自有下载域名为 DNS-only A 记录。每个来源只试一次，存储不足和校验失败不换线；系统等待重试或连续 30 秒无传输进度时允许换到下一条。
- 两个源站均为 `47.251.9.162`，没有购买新服务。该结构不能当作已部署中国大陆加速。
- 网络失败或超时时，网页按清单顺序换线，每条最多 20 秒，完成后验证长度和 SHA-256；原生层额外校验包名、版本和相同签名。
- App 先请求域名清单，网络或 HTTP 错误时尝试 `https://47.251.9.162/updates/domain-stable.json`。白名单只包含本仓库对应版本的 GitHub 地址、获准代理前缀、自有域名和旧 IP，兼容旧更新状态；不接收任意第三方 URL。
- 旧 `https://47.251.9.162/updates/stable.json` 保持 0.2.0，不向旧客户端直接下发不认识的域名。用户手动覆盖安装 0.2.1 后，后续更新走新域名。

## Cloudflare 与 HTTPS

已有三个 Tunnel 记录保持不变。新增 focus（代理）和 download-focus（仅 DNS）。不调整全域的既有 SSL 模式。

只针对 `focus.linma.asia` 增加 Configuration Rule「Kitten Focus - strict origin TLS」，SSL 设置 strict。另对该主机 `/updates/` 前缀增加「Kitten Focus - public update manifests」，关闭浏览器完整性检查，避免公开 JSON 接口被当作无浏览器的异常请求（曾复现 403/1010）。其他路径和子域名不受此规则影响。

源站为两个域名申请 Let's Encrypt 域名证书，存储在已有 certificates 目录，现有定时任务自动处理续期。IP 入口保留原 IP 证书，并必须作为 443 default_server：IP 客户端可能不发送 SNI，不能给它返回域名证书。

只缓存页面及静态资源；更新 JSON `Cache-Control: no-store`。主域名不提供 APK，下载域名支持 Range、不可变版本路径和来源为 focus 的 CORS。不能声称 Cloudflare Free 已提供大陆节点或保证国内速度。

## 发布

版本 0.2.1 / versionCode 7。构建默认写入域名更新入口和 IP 备用清单。候选包沿用现有内测签名。

`prepare-update.py` 生成 GitHub 正式地址和下载顺序；先将相同签名、相同哈希的 APK 发布到公开 GitHub Release，再运行 `publish-update.py --publish`。该脚本校验 GitHub 公共文件及自有备用包后，原子切换服务器的 `public/updates/domain-stable.json`。Nginx 将主域名 `/updates/stable.json` 映射到该文件。旧 IP stable 清单不修改。API 令牌不进入清单、APK、网页或代理 URL。

更新下载页面的静态备用链接、版本说明和 download 域名 `/download` 重定向，防止禁用 JavaScript 时得到过旧安装包。页面动态字段仍以最新清单为准。

## 验证

- 14 项业务测试、20 项安卓仪器测试。
- 通过 0.2.0 → 0.2.1 QA 覆盖，再应用内更新到 code 8 的 QA 包；主测试 URL 故意 404，确认 `fallbackUsed=true`，IP 下载、签名与系统安装成功，数据逐字段一致。测试仅针对 QA 路径，完成后撤下 QA 规则与文件。
- 用 Orca 浏览器检查 375/390px 及桌面页面，图片和二维码加载、无横向溢出；实际下载主包并完成 SHA-256。
- 网络环境曾出现本机到源站的 SSH 短时断连，使用本机已配置的 SOCKS 代理作为 SSH 传输通道，仍严格验证原主机指纹，不修改云端认证。
- 国内三次 Wi-Fi、三次手机流量的打开、下载、App 更新耗时由用户验收。当前没有这部分测速结果。

## 免费代理兼容性记录

本机走美国代理，源站也在美国。三个候选（ghfast.top、gh-proxy.com、ghproxy.net）在美国服务器均返回正确的原 APK，Range 返回 206；只有本次响应中的 gh-proxy.com 提供 `Access-Control-Allow-Origin: *`，因此选作网页可替换的默认候选。它不是已证实的“国内最快”线路。本机 Python 的直接/经代理探测均出现 TLS 超时，不能据此推断大陆网络结果。

最终模拟器演练使用当前新代码：覆盖 0.2.0 后读取含 GitHub 正式 URL 的 QA 清单；默认代理在该环境连接失败，系统下载管理器切到 route 1 的自有域名，完成实际下载、APK 校验、来源许可、系统确认安装至 code 8 QA 包，业务数据逐字段一致。QA 文件和临时 Release 完成后撤下。报告包含 `transfer.route` 与 `fallbackUsed`，不将“备用成功”描述成“代理成功”。

后续如果该线路国内不达标，再评估明确计费的对象存储或 CDN；未自动开通收费服务。
