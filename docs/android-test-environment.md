# 本机安卓测试环境检查

检查日期：2026-11-15。结论：当前运行的 MuMu 实例具备第一轮专注控制开发联调条件，可作为主要开发测试环境；尚不能作为完整安卓兼容性或真机验收结果。

本次只检查环境与现有应用，没有安装/升级 APK、清除数据、运行仪器测试、更改权限、修改屏幕设置、重启或切换网络。临时建立的 ADB WebView 转发已撤销。

## 实测配置

| 项目 | 本次结果 |
| --- | --- |
| 宿主 | Windows；i5-11300H，8 逻辑处理器，15.8 GB 内存；检查时约 4.5 GB 可用 |
| 虚拟机 | 宿主有 MuMuNxMain / MuMuNxDevice 等进程，当前 ADB 设备在线 |
| ADB 序列号 | `127.0.0.1:16416`；这是本次值，不保证所有启动或实例保持不变 |
| 安卓 | Android 15 / API 35；安全补丁属性 2025-05-05 |
| 架构 | x86_64；系统 ABI 列表另列 arm64-v8a、x86，未测试 ARM 翻译兼容性 |
| 机型属性 | Xiaomi / 22041211A；属于虚拟机报告值，不能当作真实小米 ROM 验收 |
| 虚拟机资源 | 约 3.84 GiB 总内存、2.91 GiB 可用；`/data` 约 119 GB 可用 |
| 显示 | 物理 900×1600，覆盖为 750×1688；物理密度 240，覆盖为 320；本次未修改 |
| WebView | com.android.webview，110.0.5481.154.1；调试协议报告 Chrome/110 |
| 已安装应用 | com.xiaomao.focus，0.2.2 / versionCode 8，minSdk 24 / targetSdk 36，DEBUGGABLE |
| 当前应用状态 | 已运行，可连接 WebView；页面为 `https://localhost/#/tasks` |
| 原生桥接 | 经 WebView 调用 CatFocus.permissions 成功，返回 notifications=false、exactAlarms=false |
| 仪器测试 | 已安装 AndroidJUnitRunner；本次未执行 |
| 本机构建 | JDK 21、项目 SDK Android 36、build-tools 35.0.0 / 36.0.0 及现有 debug/test APK 可见；本次未重新构建 |

## 已检查的测试条件

以下系统设置 Intent 均解析到了设置 Activity：无障碍、Usage Access、显示在其他应用上层、Notification Policy Access、通知访问、电池优化设置。`dumpsys accessibility` 可读，目前没有启用/绑定的第三方无障碍服务。设置入口存在只说明具备验证条件，不等于新增专注功能已经授权或验收通过。

浏览器、桌面 Lawnchair 和系统文件选择器均能解析，可用作允许/受限应用切换与文件操作测试对象。拨号 Intent 没有可处理 Activity；虽然系统声明 telephony features，也不能据此认为真实来电测试可用。当前设备没有 Device Owner 配置。

`run-as com.xiaomao.focus` 可访问调试版私有目录，支持后续 SQLite 排查。WebView DevTools 的 HTTP 列表和 WebSocket 均实测可用，原生权限接口调用成功；因此现有 Node/CDP 页面联调方案可继续使用。

## 可作为开发测试范围

- 应用名单选择、搜索、保存与规则判断。
- 无障碍授权流程、应用切换事件和受限应用阻挡页；待实现后验证。
- 专注开始/暂停/恢复/结束、休息与限制规则联动。
- 悬浮计时、勿扰/通知设置流程；待实现后验证。
- 权限撤回、服务重连、进程重建、息屏和重启的功能行为；本次没有执行这些状态变更测试。
- Capacitor Java 桥接、页面回归和 SQLite 持久化。

## 仍需补充的验收

- 通知、准确闹钟当前未授权，需要后续测试分别覆盖允许与拒绝状态。
- 实际来电、拨号、紧急电话、SIM 与蜂窝网络需要真机；当前实例缺少拨号处理 Activity。
- 国产 ROM 后台限制、长时间锁屏和省电策略需要对应真机；虚拟机 Xiaomi 属性不能替代。
- Android 7/8 和 Android 16 等不同 API 的行为需独立环境，当前 API 35 不能覆盖项目 min24 / target36 的全部范围。
- 当前 WebView 110 适合兼容性观察，也需补较新 WebView 的环境；本次未升级系统组件。
- 当前安装版本号不能证明包含工作区未发布代码；实际联调新增功能前需构建并核对安装包。

## 后续运行约定

先执行设备列表检查，再显式指定目标设备，避免依赖旧默认值：

```powershell
& '.\.tools\android-sdk\platform-tools\adb.exe' devices -l
$env:ADB = (Resolve-Path '.tools/android-sdk/platform-tools/adb.exe').Path
$env:ANDROID_SERIAL = '127.0.0.1:16416'
```

以上仅配置当前 PowerShell 会话。现有 `scripts/android-ui-smoke.mjs` 默认值为 16384，与本次在线实例不同；无需把变化的实例端口硬编码回脚本。

现有 FocusEngineTest 的 Before/After 会重置业务数据，UpdateProtectionTest 也修改备份和业务状态；android-ui-smoke 会覆盖安装并操作业务数据。测试前应先建立备份和恢复步骤，或使用专用干净实例，本次没有直接运行这些脚本。宿主空闲内存有限，优先只运行一个安卓实例。

检查依据：本机进程与资源、ADB devices/getprop/dumpsys/包管理查询、原生权限只读调用，以及仓库测试源码；没有将“入口可用”写成“新增功能已通过”。
