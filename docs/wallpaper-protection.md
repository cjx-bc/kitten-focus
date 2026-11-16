# Wallpaper assistance: production acceptance

This capability follows the independently written T03 route in
`tools/probes/wallpaper/RESULTS.md`. Probe results are evidence for choosing a
route; they do not establish the production session integration.

The approved deterministic test seam is `FocusControl` / `CatFocus`. Tests
replace only the Android wallpaper system and clock. Original-state files and
journals remain private native runtime state, outside business backups. One
`FocusRecovery.RecoveryOperation` exposes the responsibility; this is not a
second session engine.

Activation requires all of these steps:

1. Explain the changed wallpaper, Android confirmation, bounded service
   association, and the lack of a force-stop or OEM survival guarantee.
2. Preserve the currently observed home and lock identities. A static original
   needs an image supplied through Android's document picker, privately copied
   before activation. The user must explicitly acknowledge that the supplied
   image matches the original. Android 13+ arbitrary original pixels are not
   claimed to be readable. A live original records its component and requires
   consent to interactive restoration and unavailable private provider settings.
3. Freeze the preference into the actual native round. Persist the round's
   original-state responsibility before opening Android's live wallpaper picker.
   Preview and a requested picker are distinct from an observed selected
   component. Cancellation leaves the original and other enhancements intact.
4. A real non-preview framework engine may reconcile the existing native
   session. It must not start a second timer or persist a new round. Service work
   is bounded; visibility does not authorize an unbounded background loop.

Ordinary pause retains this round's assistance. End, rest, lock expiry, reboot
interruption, backup replacement and confirmed recovery all honor the same
original-state journal. Static restoration checks ownership before writing and
preserves later lock changes. A live original requires another actual Android
confirmation. Background recovery never accepts that picker automatically.
Failures, partial-write uncertainty and cancelled original selection keep a
visible retry responsibility and block conflicting new wallpaper activation.
A later deliberate home choice is preserved. Crop, offsets, third-party live
settings and concurrent external writes cannot be guaranteed by public APIs.

Device acceptance must use the isolated `.qa` package and a newly recorded
disposable secondary user. The user's user0 original is not a test fixture.
Test-only known source images/providers stay outside production code. Record
the APK hash, user/API, actual picker UI and decisions, before/after identities
and screenshots, process IDs and native session IDs. Compare unselected and
selected ordinary process death; a new service and non-preview engine must
reconcile the same existing round before opening MainActivity. Reboot is a
separate case, never a force-stop claim.

The production manifest declares `FocusWallpaperService` in the application's
normal process. It draws on visibility/surface callbacks and queues at most one
existing-session reconciliation per selected service instance. Preview callbacks
are separate and never settle timing. A bounded 48-event private lifecycle ring
records PID, process token, boot count and the reconciled native session ID;
there is no periodic wallpaper keep-alive loop.

Each Android picker launch has a durable random receipt. The internal result
Activity carries it through recreation; callbacks with a stale receipt cannot
close or replace a later round's picker. A still-open picker retains its duty
even if an already-observed late selection has been restored, because that
picker can still create another effect. New conflicting preparation and manual
acknowledgement are blocked until the matching system result returns. An
unrelated unprotected timer can continue throughout this recovery work.

The two supplied original files are copied through `ACTION_OPEN_DOCUMENT` into
private `no_backup/wallpaper-originals`, with a 20 MB / 64 megapixel limit per
file. Only home and lock slots exist. Old receipts are invalidated durably before
a slot changes. The image URI is not persisted. Matching-current-image consent
is explicit and is not represented as an independent pixel verification. The
existing business backup field lists exclude files, receipts and all wallpaper
runtime journals. Backup replacement consults the same registered recovery duty.

## Reproducible product commands

Run only with the root agent's exclusive device lease. Create and record a fresh
secondary user before these commands; never use Owner/user0 as a fixture. The
T03 fixture APK may create a known green static original and purple live original
inside that user. Export its known source bytes without text conversion and put
the PNG in **that user's** Downloads. These fixtures are test applications, not
production APIs. Verify current user with `am get-current-user` before every
step. Preserve and compare user0 wallpaper metadata before/after cleanup.

```powershell
$env:ADB = 'D:/KittenFocus-Android/sdk/platform-tools/adb.exe'
$env:ANDROID_SERIAL = 'emulator-5580'
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action configure
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action import --image-name KittenT17-original.png
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action prepare
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action start-cancel
# Finish the declined round, exit rest, and explicitly prepare the same original again.
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action finish
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action exit-rest
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action prepare
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action start-select --target home
python scripts/wallpaper-process-smoke.py --adb $env:ADB --serial emulator-5580 --user <created-id> --condition selected --session-id <saved-native-round-id> --out <evidence-dir>
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action finish
# For a captured original live component, ending leaves an interactive duty:
node scripts/wallpaper-device-smoke.mjs --user <created-id> --action restore-live --target both
```

Each product UI stage captures actual screenshots, wallpaper dumps, bridge
observations and shared recovery results. `wallpaper-process-smoke.py` does not
open MainActivity after killing the exact selected user's own QA process. Its
selected verdict requires a new framework service, non-preview engine and the
same pre-existing native session ID before any new Activity event. Compare its
`--condition unselected` control for the same interval. The script checks real
process disappearance and refuses to confuse another user's QA process with the
disposable user's process.

## Validation status

| Check | Evidence / result |
| --- | --- |
| First native observation tracer | Official API36 runtime RED (missing wallpaper JSON), then GREEN 1/1; `artifacts/focus-control/api36/t17-first-{red,green}`. |
| Live-original round | Missing public commands/constructor compilation RED, then official API36 native GREEN 2/2, 3.135 seconds, no skips; `t17-round-green`. OS wallpaper effects substituted only at the approved boundary. |
| Supplied-static original and selected-engine existing-round reconciliation | Direct javac missing-command RED, then official API36 native GREEN 3/3, 5.696 seconds, no skips; `t17-static-green`. This is deterministic integration evidence, not an actual wallpaper selection/rebind verdict. |
| Later static choice | Native runtime RED mislabeled a preserved later static image as restored; GREEN 4/4, 7.161 seconds, no skips. It now reports `user_choice_preserved` without a write; `t17-later-static-{red,green}`. |
| Late picker, strict failure, manual acknowledgement and reboot | Actual native lifecycle RED at orphaned late selection, then GREEN 5/5, 14.592 seconds, no skips. The same round survives pause/reconstruction; strict timing remains enforced; later unprotected timer is not replaced; `t17-late-picker-red`, `t17-coherent-green`. |
| Picker receipt | Direct javac RED at the token-aware callback, then official API36 native GREEN 5/5, 5.186 seconds, no skips. A stale old callback leaves the new picker open; `t17-token-green`. |
| Interrupted lock-first restore | Actual native RED at a lock write interrupted before Home; `t17-partial-lock-red`, 4.25 seconds. Minimal fix retains uncertainty whenever either owned identity changed. Final integrated native GREEN 5/5, 7.426 seconds, no skips; `t17-final-native-green`. |
| Diagnostics | Existing public CatFocus aggregation RED → GREEN 7/7; latest host suite 56/56 after integration merge. Reports actual native support, preview/selection distinction, pending restoration as actionable, and withdrawn/later choice as off. |
| UI | Vue type check/build passed. Actual browser screenshots at 375 px phone and 812 px landscape; no horizontal overflow. Root font-size scaling was requested, but existing pixel-sized component copy does not establish full Android Dynamic Type/largest-font coverage. Browser support remains unavailable truthfully. |
| Production device matrix | Actual SAF, picker cancellation/selection, native session association, supplied-image writeback and live-original restoration measured below. |

## Measured production API36 result

Evidence: root ignored `artifacts/focus-control/t17-product/`. Measured production
source native tip `95e48c4` (including shared integration `87c75e4`), APK SHA256
`a66dd97aa28a87639634f4710d59c4273fc59be4e453c6ff5b63bcf534519e0c`.
Only newly created full secondary user **10**, name
**KittenT17Product_20261115_Only**, was used. System user0 remained outside all
wallpaper writes. The separate T03 fixture exported its generated known source
through its ordinary per-user MediaStore Downloads API; production imported it
through actual `ACTION_OPEN_DOCUMENT`, copied it privately and required the
matching-original/limitations acknowledgement. No production URI/path bypass or
arbitrary original-pixel backup exists.

- **Actual refusal/selection:** the Android picker cancel path reported
  `declined`, original home20/lock-1 retained, no pending duty. Actual Home
  confirmation selected production `FocusWallpaperService` as home21 and
  reported active. Preview remained distinct. Screenshots include the real cat
  wallpaper picker (`09-select-picker.png`) and per-stage product evidence.
- **Matched ordinary process death:** the 15-second unselected control killed
  PID27500 and produced no new service, engine or Activity. The selected control
  killed PID28912; PID29283 was first sampled at **1.672 seconds**, then logged
  framework `service_create`, `engine_create(preview=false)` and
  `existing_session_reconciled` for the same session
  `wallpaper-product-1794787657404`, with elapsed60957 ms and no Activity opened
  after the kill. This is production engine association evidence, not merely a
  changed wallpaper or a promise of force-stop/OEM immunity. See
  `selected/result.json`, `unselected/result.json` and before/after screenshots.
- **Supplied static writeback:** normal end entered rest, restored a static
  identity and retained the supplied image in private storage. Actual journal
  `11-static-native-journal.xml` records original20, owned21, `pending=false`,
  `phase=restored`, `restoreAttempted=false`; bridge `static/finish-after.json`
  independently records the resulting home/lock identities. A properly settled
  restored-green launcher screenshot was **not obtained**; transition screenshots
  are retained and do not establish pixel/crop fidelity. Static visual acceptance
  remains a stated gap.
- **Boot interruption and live original:** after actual live-original capture
  and production Home selection, `adb reboot` was issued. The host emulator
  process exited; its cause is unverified, and old emulator stdout/stderr were
  not preserved before the canonical `D:/KittenFocus-Android/Start.ps1` restarted
  the same disks without snapshots/wipe. This is not a seamless guest-reboot
  success claim. BootCount7→8 is recorded. After user10 became available, before
  opening MainActivity, PID2559 logged service56803 ms, non-preview engine58788
  ms and native reconciliation76631 ms, owner null. The interrupted round's
  responsibility remained `recovery_pending`. Actual Android Home+lock
  confirmation restored the original purple component, `pending=false`, with
  the actual launcher visually verified in `14-live-original-restored-home.png`.
  Third-party provider settings and exact crop remain unverified.
- **Cleanup:** the final resolved journal and lifecycle ring, private supplied
  image and wallpaper dumps were exported. Only created user10 was stopped and
  removed; the otherwise-unused probe package was removed after confirming it
  was not installed for user0. Current user0, only Owner remains. `cleanup.json`
  verifies user0 id2, which3 and ImageWallpaper component unchanged. No arbitrary
  original-pixel hash is claimed. Both shared device and Gradle leases released.

Secondary-user first-boot SystemUI ANR/cold WebView process churn, a denied direct
shell storage push, and zero-byte shell MediaStore setup were fixture failures;
they are retained as limitations and never counted as successful imports. The
successful source was exported by the independent test fixture and selected in
the real SAF UI. Host CDP helpers now reselect the current selected-user process
while waiting for its WebView; image import waits by observing the real async
result rather than leaving a 15-second awaited CDP expression open behind SAF.

Product later-home/lock preservation, partial writes, strict recovery, stale
picker receipts and timing boot interruption have native seam coverage. Actual
later-home/lock device combinations were not repeated for production; T03's
matrix remains separate evidence. Actual product seamless reboot, physical/OEM,
all API combinations and static pixel/crop visual fidelity remain unverified.

Physical/OEM and unmeasured API combinations remain explicitly unverified.
