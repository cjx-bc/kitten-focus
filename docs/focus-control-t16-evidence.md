# T16 FORCE-03 source handoff

Status: source ready; native build/instrumentation and actual Android routing acceptance remain **PENDING**. No issue closure or device execution is claimed.

`lockMainInterfaceRestricted` is an independent, default-off enhancement in the original enhancement settings section. Trusted `FocusControl.startLock` freezes its saved preference in `originalEnhancedProtectionSettings`; ordinary focus admission discards any forged snapshot. Editing preferences during a lock affects the next round. `FocusControl.resolveMainEntry` observes the existing `ControlSession` owner and timing validity, and supplies the one read-only decision used by MainActivity cold/warm entry and the Vue router guard. No second session engine, database, or Android identity is introduced.

While a selected live lock owns the session, ordinary routes (including direct tasks/statistics/settings hashes) resolve to `/lock`. Exact `/permissions`, `/help`, `/emergency`, `/recovery` and `/lock` routes remain reachable. These are limited safety pages, with the existing Icon/Sheet components; the original five-icon business navigation remains unchanged. The lock page shows whether routing is active or recovered and links every safety destination. Permission guidance opens the real Android accessibility settings; emergency guidance retains the system dialer/lockscreen path.

`FocusRecovery` registers a separate main-entry duty and persists withdrawal before completing recovery. Preview/cancel do not withdraw. Confirmed recovery restores ordinary routes while preserving the same strict lock id, start and target, and cannot relax strict early-end rejection. New `FocusControl` instances and reconnects honor the durable withdrawal. Expiry, ordinary end and boot interruption stop interception through the shared owner validity check.

Executed:

- Public Vue router guard test was red for the missing module, then green after implementation.
- `npm.cmd test`: 8 files, 38 tests passed.
- `npm.cmd run build`: passed, including Vue/TypeScript check; existing large-chunk warning remains.
- `node --check scripts/main-entry-device-smoke.mjs`: passed.
- `git diff --check`: passed.

Not executed (root owns Gradle/device leases):

- Native `MainEntryControlTest` four cases: trusted lock opt-in and exact exceptions; recovery/cancel and retained strict timing across reconstruction; expiry/ordinary end/boot interruption; non-lock/focus/pause/rest and forged admission.
- Actual Android `scripts/main-entry-device-smoke.mjs`: launcher Monkey intent, explicit warm ADB entry, force-stop/cold Activity start, direct business hashes, real permissions Activity, exact help/emergency/recovery pages, visible recovery cancel/confirm, reload and durable strict identity, one-minute expiry, unselected and ordinary selected end. Add `--reboot` to prove actual device boot interruption; without that flag reboot is explicitly unexecuted.

Suggested final root sequence after merging all source:

```powershell
npm.cmd run build
npx.cmd cap sync android
# Use the shared SDK/JDK and QA Gradle args from artifacts/focus-control/worker-context.md.
# Build and run MainEntryControlTest with the isolated runner; require four passes/no skips.
$env:ADB = 'D:/KittenFocus-Android/sdk/platform-tools/adb.exe'
$env:ANDROID_SERIAL = 'emulator-5580'
node scripts/main-entry-device-smoke.mjs --reboot
```

The script asserts `.qa`, preserves/restores QA data and exact accessibility settings, and saves results/screenshots below `artifacts/focus-control/api36/main-entry`. It requires no remaining active QA round before starting. It deliberately waits for strict expiry during cleanup rather than mutating session timing.
