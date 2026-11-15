# T03 当前 MuMu 的安全门禁结果

设备：用户授权的 `127.0.0.1:16416`，Android15 / API35；测试包 `com.xiaomao.focus.wallpaperprobe`。本次只操作独立探针，没有覆盖原应用或改变现有壁纸。

- 独立 APK 使用现有 AGP/Gradle 构建成功，宿主公开命令契约三组通过。
- 实际捕获基线：home ID 2，lock ID -1，普通应用未获得真实原图像素，`Automatic image restore possible: false`。
- 在未勾选可丢弃基线选项时请求启用，应用内确认后返回 `LIMITATION_ACK_REQUIRED`；没有打开系统壁纸选择器，也没有执行壁纸写入。
- 操作前后 `dumpsys wallpaper` 的 system/fallback ID 与组件相同，原 system `ImageWallpaper` 保持。拒绝路径和持久基线在真实设备上得到验证。
- 证据保存于主工作区忽略目录 `artifacts/focus-control/t03/`，包含 APK 构建、会话状态、事件元数据、前后系统状态与截图。

尚未执行真实壁纸选择、关联服务重连增益、静态/动态完整恢复、用户后续选择和重启矩阵。当前没有可靠原图备份，不能为完成测试直接替换用户现有壁纸。T03 探针代码已可操作，但完整验证仍受此测试前提限制；FORCE-04/A11 不能据此标为通过。后续实现需保留实际支持门禁，或在已保全原状态的专用测试基线上补实验。


# API36 official emulator continuation (2026-11-15)

Measured build SHA256: `d1096512bfb27c204ef4851ae86fdc157f22ae3363916791a479457d80d5d656`. Device: D-drive official AVD `KittenFocus_API36_QA`, serial `emulator-5580`, Android16/API36, Google `sdk_gphone64_x86_64`, ordinary probe application UID. Package: `com.xiaomao.focus.wallpaperprobe`; no device owner, root or hidden API. The only test user created was full secondary user **11**, named **KittenT03Probe_20261115_Only**. User0 wallpaper remained outside the experiment. The secondary user's `user_setup_complete` was set to 1 solely to make its fresh desktop available; it is removed with that user at cleanup.

Evidence is in the root workspace ignored directory `artifacts/focus-control/t03-api36/`, including the measured APK, source PNG/receipts, per-stage journals, complete wallpaper dumps, actual UI screenshots and the process-control result directories. `measure-process.py` reproduces the ordinary-process comparison and refuses user0, a mismatched current user, a nonapproved serial or the wrong actual wallpaper/journal condition. It backgrounds the app with a real MAIN/HOME intent before killing only that probe UID's exact main-process PID.

| Experiment | Observation |
| --- | --- |
| Known static baseline | Explicit fixture UI saves a PNG before writing home+shared lock. Written and observed ID7 match the supplied-source receipt; automatic restoration becomes available only for that matching source. No claim of reading an arbitrary user's real original image. |
| Static cancel | Android `LiveWallpaperChange` renders the real probe preview; Back returns `DECLINED`, `unresolved=false`, original home ID7 and shared lock retained. |
| Static unselected ordinary death | PID14699 killed by its own UID; first observed disappearance 0.090s; no service, engine or Activity creation in 15s. `static-unselected/`. |
| Static selected ordinary death | Explicit Android Home+lock selection gives ID8. PID15458 killed; first new main PID15686 observed at 1.328s; `service_create` and `engine_create preview=false` use a new process token, before any manually opened Activity. `static-selected/`. |
| Static reboot | Actual reboot changes bootCount5 to6. This emulator returns to user0; after explicitly starting/unlocking secondary11, the framework creates selected service PID2454/non-preview engine before the probe Activity is opened. This measures restoration after that test user becomes available, not execution while it is locked or stopped. |
| Static stop after reboot | Restores the privately saved source, reports `STATIC_RESTORED_CROP_UNVERIFIED`, and clears responsibility. Original crop/offset metadata is not backed up. |
| Live original and cancel | Explicit Android selection of purple `BaselineWallpaperService` gives original ID11; provider runs in separate `:baseline` process and has no private settings. Capturing it and cancelling the probe's real Android preview returns `DECLINED`, preserving that component. |
| Live unselected ordinary death | On actual Home, PID7868 disappears after own-UID kill; no main service/activity rebind in 15s. The original provider's independent process is not counted. `live-unselected-home/`. An earlier foreground run is retained as diagnostic only in `live-unselected/`. |
| Live selected ordinary death | On actual Home, PID8036 dies; first new main PID8221 observed at2.017s, with new service and non-preview engine before any Activity. `live-selected/`. |
| Live reboot and restore | Second actual reboot changes bootCount6 to7. After secondary11 is started/unlocked, framework PID2429/non-preview engine appears before the Activity. The original purple component is restored through the actual Android Home+lock chooser. Result `LIVE_COMPONENT_RESTORED_SETTINGS_UNVERIFIED`, `unresolved=false`; actual original visible on launcher in `51-live-original-restored-home.png`. |
| Later home choice | Starting from purple original13, Android selects probe for Home only14 while preserving original lock13. Explicit later blue home15 is preserved, status `USER_CHOICE_PRESERVED`, responsibility cleared, no original-home restore write. Actual blue launcher in `56-later-home-preserved-visible.png`. |
| Later lock choice and static visual restoration | A fresh known static original16 is captured. Probe selected Home only17 preserves original lock16. Explicit later red lock18 is created. Stop restores the saved green home as19 while lock18 remains untouched, result `HOME_RESTORED_USER_LOCK_PRESERVED`, `unresolved=false`. Actual green restored launcher61 and red later LOCKSCREEN62 are both visually inspected. |
| Cleanup | Final journal `63-final-resolved-before-cleanup-session.properties` has `unresolved=false`. All private fixture sources and receipts exported. Only created user11 removed; user0 confirmed probe installed=false before removing the otherwise unused test package. Current user0, no probe package, only Owner remains. User0 system/shared ID2 and ImageWallpaper, fallback ID1 and ImageWallpaper unchanged. Canonical metadata identity SHA256 `07cdf985e538d219ab75215bee108185ebc83f5b8cf4b336d3fd499d1a66ede7`, recorded in `cleanup.json`; no arbitrary original-pixel hash is available. |

The earlier fixture ID mismatch was a safety refusal caused by the fixture calling `clear(FLAG_LOCK)` after its home write. It was corrected to one home+lock source write and verified on the measured APK. It is not evidence that the platform normally changes a setStream return ID.

## Implication for T17

This probe establishes an actual framework association benefit on this one emulator: an explicitly selected live wallpaper is rebound following ordinary process death, unlike the unselected control. It does not establish force-stop immunity, OEM process survival, a revived production focus engine, or a universal original-wallpaper backup.

A production route must keep the original UI's explicit option and system confirmation, then gate activation on a recoverable baseline. Android13+ static originals require an explicitly user-provided original image through a real picker/import flow with an explanation that crop is not preserved, or activation remains limited. A normal API36 app cannot silently export arbitrary current original pixels. An original live component can be journaled and restored only through another Android confirmation; provider settings and independent live lock configurations remain limited. The generated-source receipt and purple provider here are test fixtures, never a production backup feature.

Production must register its private per-round original-state responsibility with shared FocusRecovery before effects, observe the actual selected component/id before reporting active, retain responsibility after cancelled/failed restore, and preserve a later external choice by owned-identity comparison. Finishing timing cannot silently mark a still-selected wallpaper restored; interactive original-component restoration remains a pending, reachable recovery action. A service rebind can reconnect the existing native coordination layer, but cannot make Android force-stopped packages restart. T17 needs its own implementation and acceptance, and was not implemented by this probe continuation.


## Coverage and remaining limits

The measured matrix covers static and live originals, actual enable cancellation and selection, matched 15-second unselected/selected ordinary-process controls, actual reboot followed by that secondary user's availability, static/live original restoration, and explicit later home/lock choices. It does not execute every Cartesian combination of those conditions: later-home preservation was measured with a live original, later-lock preservation with a supplied static original. Later-home ownership preservation also has host command-contract coverage; that is not a claim that the other device combinations were executed.

The two real reboots occurred with the probe selected; an unselected reboot control was not run. Neither force-stop survival nor low-memory/OEM killing, physical OEM launchers, API24/25/26-35 selection/restoration, exact crop/offset reconstruction, arbitrary Android13+ static-original reads, private third-party live settings, and independent live-lock restoration were established. Earlier MuMu rejection remains historical evidence only. Preview=true callbacks never count as selected evidence. The earlier stop-dialog cancellation (`47`) was an in-app cancellation, not an executed cancellation of the original-provider Android picker; original-picker cancellation remains host-contract evidence only.

The emulator's wallpaper-color change can recreate the probe Activity and reset scrolling; several intermediate screenshots capture transitions or the app while a Home command had not taken effect. Actual device verdicts use checked journals/dumps plus the final inspected launcher/lockscreen screenshots and, for process measurements, the before/after screenshots. The earlier foreground live control is explicitly excluded. No user0 wallpaper write or production app data operation was made by this continuation. The final APK and its exact hash were saved with the evidence so earlier fixture failures cannot be confused with the measured successful build.
