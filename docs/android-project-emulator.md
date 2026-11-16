# 项目专用官方 Android 模拟器

部署日期：2026-11-15；目录：`D:\KittenFocus-Android`。已有 MuMu 不被此脚本管理。项目构建仍用原来的 `.tools/android-sdk`；新模拟器自带独立 SDK/镜像/AVD 数据，不改全局环境变量或开机启动。

## 已部署配置

| 项目 | 值 |
| --- | --- |
| Android Emulator | 37.2.13；WHPX 硬件加速实测可用 |
| 系统镜像 | Android 16 / API36、Google APIs、x86_64、revision 7 |
| 实例/序列号 | `KittenFocus_API36_QA` / `emulator-5580`，端口 5580 |
| 默认内存 | **1536MB**，官方 `-lowram` 模式；实际 guest MemTotal 约 1,503,184kB |
| CPU/屏幕 | 2 核；540×960，240dpi |
| 主机内存实测 | 系统刚开机时进程合计约 2.0–2.2GiB；打开项目 QA 页面约 2.3GiB，随负载变化，并非 1.5GB 主机总占用 |
| 存储策略 | 一个系统镜像；无 SD 卡；64MB cache；userdata 基础文件系统约 6GB，动态占盘；无自动快照 |
| 目录文件大小 | SDK 约 5.5GiB，AVD 文件约 2.6GiB；随应用和日志增加，不把虚拟分区容量当实际占用 |
| WebView | 实测 `com.google.android.webview` 133.0.6943.137；不是对“最新版本”的声明 |
| 默认窗口/声音 | 后台无窗口、无音频；按需切换 |

普通启动时此镜像会将 2048MB 自动提高到 2560MB，因此默认显式使用官方低内存选项。`Start-Normal.cmd` 提供 2560MB、窗口和音频的普通模式；先停止原实例才能切换。低内存条件可能改变后台行为，最终后台/重启/组合保护仍须在普通模式及对应真机复核。音频默认关闭，不可据此验收声音/DND实际效果。

## 使用

- 双击 `D:\KittenFocus-Android\Start-Visible.cmd` 操作界面。
- `Start.cmd` 后台运行；`Stop.cmd` 停止并释放客体内存。
- `Rebuild.cmd` 二次确认后只重建本实例，清空其应用/数据/授权，保留已下载镜像。
- 整体删除：先停止并确认 `emulator-5580` 消失，再删除整个 D 盘专用目录。
- 整体删除后重新部署：在项目根执行 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-project-emulator.ps1`。

操作说明和启动脚本模板在 [scripts/android-test-machine](../scripts/android-test-machine/README.md)。部署脚本为 [setup-project-emulator.ps1](../scripts/setup-project-emulator.ps1)。所有环境变量只作用于脚本子进程。

## 此次验证

- 低内存实例启动完成；实际硬件配置是 1536MB/2核/540×960，而非只修改配置文件。
- 现有本地 `com.xiaomao.focus.qa` APK 安装成功，Activity 冷启动成功，待办页面截图已检查。
- ADB、WebView DevTools/CDP 连通；经页面实际调用 `CatFocus.permissions` 成功，返回通知/准确闹钟尚未授权，未以调试方式强行授予权限。
- 模拟器重复启动脚本能识别已有实例；停止、重新创建空白实例、再次启动/安装均执行成功。
- 停止脚本在退出前执行 guest `sync`；实测冷启动后 QA 安装路径与包名保留。一次立即退出曾未保留刚安装的包，添加刷盘后重新验证成功，不把此情形记为正常持久化通过。
- 脚本语法检查通过。没有跑会清数据的项目完整仪器测试，没有声称通知拦截、壁纸恢复或整个 A01—A18 矩阵已验收。

最终保持模拟器关闭以节省内存，预装 QA 包仍保留；下次按需启动。APK 是部署时已有的本地测试产物，不代表自动重新构建了工作区最新代码。后续测试应核对源码提交与 APK 哈希，并显式指定新序列号，避免安装到其他设备。
