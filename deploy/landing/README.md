# 下载介绍页

独立静态页面，地址 `https://focus.linma.asia/`。不依赖外部字体或脚本；二维码固定指向下载介绍页。

版本、说明、大小、SHA-256 和下载顺序从同域 `/updates/stable.json` 读取。正式 APK 来自公开 GitHub Releases，默认尝试 gh-proxy.com 候选；网页完成下载后核对长度和 SHA-256，再交给浏览器保存。

网络错误或每条线路 20 秒超时时切换到下一个已批准来源，每条只试一次。内容不匹配不切线路；浏览器不支持所需 API 时退回普通 APK 链接。原生客户端使用系统下载管理器，不依赖此脚本。网页另提供自有服务器备用下载和 GitHub 原站链接。

Cloudflare 仅代理 `focus.linma.asia`，下载域名为 DNS-only。HTTPS 在源站使用域名证书，自动续期；仅该主域名的 Configuration Rule 配置 Strict SSL，公开 `/updates/` 路径关闭浏览器完整性检查，避免更新器被误判。

页面 `download-main` 和 `backup-download` 的内置静态链接、`nginx.conf` 的 `/download` 最新版本重定向需要跟随发布更新。动态版本清单禁止缓存。国内速度验收由用户在本地 Wi-Fi 和手机流量完成。
