# T03 wallpaper auxiliary probe

Isolated Java Android app for [kitten-focus #4](https://github.com/cjx-bc/kitten-focus/issues/4), with application ID `com.xiaomao.focus.wallpaperprobe`, min API 24 / target API 36. It does not change the production app, its manifest, focus sessions or data. This is independently written code; no third-party wallpaper source is incorporated.

The launcher is always available as a recovery entry. The app has no root, shell, accessibility, device-owner, foreground-service or hidden-API identity. `WallpaperService` is bound by Android after preview/selection. `SET_WALLPAPER` is used only for requested restoration of a saved static image; activation always opens `ACTION_CHANGE_LIVE_WALLPAPER` with `EXTRA_LIVE_WALLPAPER_COMPONENT` and requires Android confirmation. Requesting, cancelling, selecting, reconnecting and recovering are different states.

## Status on 2026-11-15

- Host public-command contract: **passed**, including cancellation, process reconstruction, later wallpaper choice, and a partial restoration write interrupted before recovery.
- All Android Java sources compiled with `javac` against Android API 36: **passed**.
- APK build: queued for the root agent's Gradle lease; **not run by this worker**.
- Actual device service selection/reconnect, static/live visual restoration and reboot: **not yet verified**. No device commands, installation, wallpaper changes or device restarts were performed by this worker. These checks remain required; an API return cannot pass A11.

Root's read-only MuMu baseline was reported as system `ImageWallpaper`, system ID 2, no separate lock entry. Shell UID 2000 could not read `/data/system/users/0/wallpaper*`. This metadata is not a pixel/crop backup. **Keep the disposable-baseline checkbox OFF and do not activate the probe on that existing wallpaper unless a complete external recovery source has first been preserved.** A blocked activation is useful limitation evidence, not a reason to grant broader privileges.

## Build and host test

From the repository root in PowerShell:

```powershell
$env:JAVA_HOME = 'C:/Program Files/Microsoft/jdk-21.0.12.8-hotspot'
$env:ANDROID_HOME = 'E:/codexseeson/fanqiezhong/.tools/android-sdk'
powershell -NoProfile -ExecutionPolicy Bypass -File tools/probes/wallpaper/test-contract.ps1 -JavaHome $env:JAVA_HOME
& android/gradlew.bat -p tools/probes/wallpaper --offline --no-daemon :app:assembleDebug
```

APK: `tools/probes/wallpaper/app/build/outputs/apk/debug/app-debug.apk`. The standalone project uses the existing Gradle wrapper and AGP 8.13.0, but does not include the production project. Run builds serially on the shared host. If dependencies have not been cached, omit `--offline` for a deliberate dependency fetch.

The test seam is the native probe's public command API `ProbeSession` and its returned snapshots. The fake replaces only Android wallpaper effects and durable storage. No private-method tests or service call-count assertions are used. Compilation alone does not verify Android's actual effects.

## Safe first device check: existing wallpaper unchanged

Back up installed production APK/data using the established project procedure before starting device work. Save `adb shell dumpsys wallpaper` and a screenshot as metadata/visual evidence; these alone cannot restore a custom wallpaper. Root owns the shared emulator/device lease.

```powershell
adb install -r tools/probes/wallpaper/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.xiaomao.focus.wallpaperprobe/.ProbeActivity
```

1. Select **Capture original wallpaper state**. Record home/lock IDs, live components, API/device, and `Automatic image restore possible`.
2. On Android 13+, the probe intentionally does not read a purported wallpaper backup: Android 13 may return the system default instead of the user's image; Android 14+ rejects normal access. The journal explicitly records that original image pixels are unavailable.
3. Leave the disposable-baseline checkbox OFF. Request confirmation in the app and continue. An incomplete baseline yields `LIMITATION_ACK_REQUIRED` and **no system picker and no wallpaper write**. Decline/cancel is also an observable action. Capture the status and unchanged `dumpsys wallpaper` IDs.
4. Stop/retry with no activated experiment; capture evidence. Do not clear app data while an unresolved responsibility exists.

Storage read permission is offered only on API 24–32; refusal is recorded and does not imply readiness. Older versions declare `QUERY_ALL_PACKAGES` through API 33 only because the official `getWallpaperInfo()` documentation requires it to discover the live component. Modern versions use the wallpaper service `<queries>` declaration. The app does not enumerate/log installed apps.

## Full disposable-device experiment

Perform this only with a deliberately disposable baseline whose original image/provider and any settings have been separately saved. If replacing an existing personal baseline cannot be reversed, stop at the safe check above. The checkbox is explicit acknowledgment of an independently recoverable test state, never proof that a backup exists.

1. Capture the baseline. A second capture is refused while previous recovery remains unresolved. If the wallpaper changes between capture and enable, enable returns `BASELINE_STALE` without opening the picker.
2. If necessary, acknowledge the disposable baseline limitation. Select **Request system wallpaper confirmation**, then confirm in Android's preview UI. First run a refusal control: cancel the Android preview, return to the probe, and observe `DECLINED` with the original IDs retained. Preview callbacks are recorded with `preview=true` and must not count as selected-wallpaper evidence.
3. Repeat and select the probe in Android's UI. Return to observe `ACTIVE`, the probe component and a new home wallpaper ID. The dark wallpaper shows a clock and a recovery reminder. A selected live wallpaper alone is not a keep-alive result.
4. Export the evidence before each process experiment. Compare the same-duration unselected control and selected condition. Open Home, record PID and callbacks; background the probe; then test ordinary process death only on this disposable environment. If `am kill` does not actually kill the process, record that fact rather than claiming a reconstruction.

```powershell
adb shell pidof com.xiaomao.focus.wallpaperprobe
adb shell am kill com.xiaomao.focus.wallpaperprobe
adb shell pidof com.xiaomao.focus.wallpaperprobe
adb shell dumpsys wallpaper
```

5. Reopen Home and later the probe. Compare `service_create`, `engine_create`, `preview=false`, PID, `processToken`, `elapsedMs` and `bootCount`. A new service process before manually opening the probe is evidence of a system wallpaper rebind. A new `activity_create` after launching the app is not that evidence. Record both successful and failed rebinds, latency and device/API. The service's own rebind does **not** demonstrate that the production focus engine was revived.
6. Separately test device reboot with preserved data; `bootCount` distinguishes reboot from process reconstruction. The receiver only records/rechecks and never reapplies wallpaper. Do not reboot the shared VM without the root agent's lease. Do not equate `force-stop` with ordinary process death; Android/OEM may keep a force-stopped package stopped. There is no force-stop immunity claim.
7. Select **Stop and restore original** and confirm. For a readable static baseline the app restores saved home/lock image files, observes a changed static identity and reports `STATIC_RESTORED_CROP_UNVERIFIED`. Original crop, offsets and OEM transforms are not public backup data; compare visually. An original shared lock is restored using `clear(FLAG_LOCK)`. A later separate lock choice is preserved.
8. For an original live component, restoration opens Android's picker for that component and requires another user confirmation. It reports `LIVE_COMPONENT_RESTORED_SETTINGS_UNVERIFIED`; original provider settings, crop and independent live lock configuration cannot be guaranteed. A separate live lock requires manual recovery via system wallpaper settings. Missing provider/picker, cancellation or unavailable original retains the retry/recovery entry.
9. While active, deliberately choose a new home wallpaper in system settings. Stop/refresh must report `USER_CHOICE_PRESERVED` and perform no restoration write. Test a lock-only change as well: saved home may be restored while the later lock ID is preserved. Android has no atomic compare-and-set for wallpapers; an external concurrent selection in the narrow interval between identity check and a restore call cannot be guaranteed. Do not run competing wallpaper writers during restoration.
10. Simulate unavailable original image or a restoration failure using the public boundary host test; for device testing preserve the backup files first. Failures remain `RESTORE_FAILED` / `RESTORE_UNCERTAIN` with responsibility retained. A partial write followed by process death is not mislabeled as a user choice. Resolve uncertainty with manual recovery, verify visually, then explicitly acknowledge it. The probe does not silently clear or reapply a failed restoration.
11. At the end, restore the original or preserve the deliberately later user selection. Confirm visually and with `dumpsys wallpaper`; export all evidence. Keep backup files until visual verification is complete. If recovery remains incomplete, keep the APK/data installed and record the remaining responsibility rather than uninstalling away its recovery entry. Uninstall only this probe after completion; never clear the production app.

Stopping requests restoration and stops the animated auxiliary work on the next visible frame. Android may keep a still-selected `WallpaperService` bound until a wallpaper is replaced; a failed/manual recovery does not falsely claim the system service was destroyed. The app does not run unrelated protected work from that service.

## Evidence export

Debug `run-as` reads this separate app's own private directory; it does not elevate the app or read system wallpaper storage. Capture output on the host outside the repository. Never use shell redirection into the production package.

```powershell
adb shell run-as com.xiaomao.focus.wallpaperprobe cat files/wallpaper-probe/session.properties
adb shell run-as com.xiaomao.focus.wallpaperprobe cat files/wallpaper-probe/events.jsonl
adb shell dumpsys wallpaper
```

`events.jsonl` contains timestamps, API/model, PID/process token, boot count, lifecycle events and state reasons. It has no notification content or production data. Static image backups stay in this app's private `files/wallpaper-probe/` folder with Android backup disabled. Its state and images must not be imported into a production backup.

Record for every matrix row: build commit/APK hash, device/API/OEM, ordinary identity, baseline type/home+lock IDs, source backup availability, confirmation/cancellation, before/after screenshots and wallpaper dumps, event log, actual reconnection latency, restoration outcome and remaining responsibility. Required rows are static/live × refusal/selection × ordinary process death/reboot × unchanged/later home choice/later lock choice. Mark unexecuted rows **pending**, unsupported rows **limited**, and incomplete restoration **failed/limited**. T03/A11 is not passed by the host contract or a denied metadata check.

## Official API basis (checked 2026-11-15)

- [WallpaperManager](https://developer.android.com/reference/android/app/WallpaperManager): `ACTION_CHANGE_LIVE_WALLPAPER`, `EXTRA_LIVE_WALLPAPER_COMPONENT`, `getWallpaperFile(int)` Android 13 default-image/Android 14 access restriction, `getWallpaperId(int)` identity, `getWallpaperInfo()` visibility, `getWallpaperInfo(int)` API 34 separate lock, `clear(FLAG_LOCK)`, `setStream`.
- [WallpaperService](https://developer.android.com/reference/android/service/wallpaper/WallpaperService): framework binding and `BIND_WALLPAPER` declaration.
- [WallpaperService.Engine](https://developer.android.com/reference/android/service/wallpaper/WallpaperService.Engine): preview, visibility and surface lifecycle observations.

No undocumented guarantee is inferred from these APIs. API24/25/26+ and physical-device OEM/launcher behavior still require separate results; the MuMu API35 check cannot stand in for them.
