# 小猫专注专用 Android 测试机

安装目录：`D:\KittenFocus-Android`。SDK、系统镜像、AVD 数据、模拟器配置、临时文件及启动日志都放在这个目录；使用现有系统 ADB 服务，不改项目构建 SDK、不注册开机启动。

固定设备：`KittenFocus_API36_QA`，ADB 序列号 `emulator-5580`，控制台端口 5580。

## 启停

- `Start.cmd`：默认节省资源，后台无窗口、无音频。
- `Start-Visible.cmd`：显示安卓窗口，仍用低内存配置。需要音频时在命令行添加 `-Audio`。
- `Start-Normal.cmd`：显示窗口、开启音频，使用 2560MB 普通模式。先停止正在运行的实例再切换模式。
- `Stop.cmd`：只关闭本项目实例，退出后释放模拟器内存。不会关闭 MuMu，也不会终止共享 ADB 服务。
- `Rebuild.cmd`：确认后清除本测试机的全部应用、授权和数据，保留 SDK/镜像下载，重新创建空白测试机；不会自动启动。

## 节省资源配置

- 默认 1536MB 客体 RAM，2 个虚拟 CPU，540×960、240dpi；启动带官方 `-lowram` 参数。主机进程还有图形及虚拟化开销，实际内存不等于 1.5GB。
- Android 16/API36、Google APIs、x86_64 完整手机镜像；未安装 Android Studio 或额外 Android 版本。
- 无 SD 卡、无摄像头、无设备外框、无开机动画，不自动保存/加载快照；每次冷启动但保留应用数据。
- 默认关闭音频：声音、DND、振动及多媒体验收时使用普通模式/显式启用音频，并补真机。
- 基础 userdata 文件系统约 6GB，镜像自带；按需实际占盘，不提前另建大 SD 卡。设置低于基础文件系统不能真正缩小它。
- 低内存模式用于日常联调，可能改变系统后台行为；进程保活、后台恢复和最终兼容性要在普通模式及所需真机复核。

MuMu 当前仍可能占用几 GB 内存，建议手动正常退出不用的 MuMu 后再启动本实例。脚本不会代为关闭已有设备。不开机时本目录仅占磁盘，不占客体 RAM。

## ADB 与项目

```powershell
$env:ADB = 'D:\KittenFocus-Android\sdk\platform-tools\adb.exe'
$env:ANDROID_SERIAL = 'emulator-5580'
& $env:ADB devices -l
& $env:ADB -s $env:ANDROID_SERIAL shell getprop sys.boot_completed
# 返回 1 才说明系统启动完成。
```

专用测试机可以安装 `.qa` APK、运行会初始化测试数据的仪器测试。所有设备命令仍显式指定序列号；不要依赖唯一设备假设。正式应用的功能验收、特殊权限授权、通知和壁纸矩阵需分别执行；部署成功不代表这些功能全通过。

## 删除和恢复部署

彻底删除：先运行 `Stop.cmd`，确认设备已从 `adb devices` 消失，再删除整个 `D:\KittenFocus-Android` 文件夹。删除后本测试机数据无法恢复；项目源码和既有 MuMu 数据不在此文件夹。

整个目录删除后的重新部署，在项目根目录执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-project-emulator.ps1
```

部署脚本复用项目 `.tools/android-sdk` 的命令行工具、已接受的 SDK licenses、platform-tools，重新下载所需 emulator 与 API36 镜像到 D 盘。仅重建测试机用 `Rebuild.cmd`，无需重新下载约数 GB 的镜像。

首次下载/解压可能需要数分钟。启动日志位于 `logs`；`-no-snapshot` 只关闭自动快照，不清空应用数据。未来若手动保存快照，应自行管理其额外磁盘占用。
