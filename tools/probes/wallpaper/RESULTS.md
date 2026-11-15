# T03 当前 MuMu 的安全门禁结果

设备：用户授权的 `127.0.0.1:16416`，Android15 / API35；测试包 `com.xiaomao.focus.wallpaperprobe`。本次只操作独立探针，没有覆盖原应用或改变现有壁纸。

- 独立 APK 使用现有 AGP/Gradle 构建成功，宿主公开命令契约三组通过。
- 实际捕获基线：home ID 2，lock ID -1，普通应用未获得真实原图像素，`Automatic image restore possible: false`。
- 在未勾选可丢弃基线选项时请求启用，应用内确认后返回 `LIMITATION_ACK_REQUIRED`；没有打开系统壁纸选择器，也没有执行壁纸写入。
- 操作前后 `dumpsys wallpaper` 的 system/fallback ID 与组件相同，原 system `ImageWallpaper` 保持。拒绝路径和持久基线在真实设备上得到验证。
- 证据保存于主工作区忽略目录 `artifacts/focus-control/t03/`，包含 APK 构建、会话状态、事件元数据、前后系统状态与截图。

尚未执行真实壁纸选择、关联服务重连增益、静态/动态完整恢复、用户后续选择和重启矩阵。当前没有可靠原图备份，不能为完成测试直接替换用户现有壁纸。T03 探针代码已可操作，但完整验证仍受此测试前提限制；FORCE-04/A11 不能据此标为通过。后续实现需保留实际支持门禁，或在已保全原状态的专用测试基线上补实验。
