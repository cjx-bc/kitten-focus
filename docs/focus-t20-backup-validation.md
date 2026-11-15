# T20 backup compatibility and replacement safety

Implementation keeps schemaVersion=1 and the existing manual backup envelope. New protection and lock configuration fields remain optional. An absent protection configuration means all protection choices are off, and an absent lockConfigurations list means no saved lock configurations. A present partial protection object receives safe missing defaults when read through the manual backup parser.

Both exported and imported business data use positive field lists. They preserve original themes, items, records, deletion IDs, calendar and timetable data, and reusable whitelist, strict and enhancement preferences. Unknown runtime fields, system grants and notification payloads are discarded, including nested configuration extras. Local upgrade snapshots contain only business data, focus records and durable lock history. Older upgrade files are projected again when exported or restored, so an old active, rest, lastFinished or arbitrary adapter document cannot become live state.

Manual replacement and local upgrade restoration both call FocusControl.prepareDataReplacement. An existing focus (including paused) or lock blocks replacement. All registered FocusRecovery operations are confirmed before the database changes. A failed or limited responsibility blocks the replacement and retains both the original business data and the adapter's recovery journal. New adapters must register their recovery operation on the same FocusControl constructor and keep original OS state outside business data and upgrade snapshots. Replacement clears rest and lastFinished according to the original restore behavior; saved focus history remains available without generating another record.

The existing settings Sheet now summarizes lock configurations, global whitelist and protection preferences before confirmation. Invalid imported files clear the candidate, so a previous valid preview cannot be reused. Application startup (including the reload after upgrade restore) and successful manual restoration query installed applications and actual system permission/status APIs. Post-write environment-check failures are reported as checks needing retry, rather than falsely claiming the database was not restored.

## Executed

- Host TDD: the first public makeBackup/readBackup run reproduced eight failures for missing defaults, raw runtime export and invalid new configuration acceptance.
- `npm.cmd test`: 9 files, 47 tests passed, including the eight new public backup cases and original timing/calendar/backup regressions.
- `npm.cmd run build`: vue-tsc and Vite passed.
- Android main and androidTest Java compilation passed.
- `:app:assembleDebug :app:assembleDebugAndroidTest` with `.qa` application suffix passed. The unqualified root assembleAndroidTest task also attempted Capacitor dependency modules' own instrumentation packages and failed their existing Kotlin dependency duplication; the requested app packages build successfully.
- `node --check scripts/backup-device-smoke.mjs` and `git diff --check` passed.

## Pending integrated device validation

Root owns the shared emulator lease and final combined APK. No emulator or production package was mutated by this worker. Keep issue #21 open until actual device evidence is recorded.

Run `com.xiaomao.focus.BackupProtectionTest` on the isolated `.qa` package. Seven cases exercise public FocusControl and UpgradeBackups commands with only clock and OS accessibility/release effects substituted. They cover manual/upgrade rejection, cleanup failures retaining data and recovery duties, hostile old snapshot runtime, and rest/focus-history preservation. The last rest fixture correction creates a new completed focus after replacement because replacement correctly clears lastFinished; rebuild the instrumentation APK before execution.

Run `node scripts/backup-device-smoke.mjs` with the explicit emulator configuration from the shared worker context. It preserves the existing QA business data. It clicks the original export UI, captures its public exportFile OS IPC payload, feeds a real JSON File through the existing input change/parser, verifies preview does not write, clicks confirmation and observes the actual native data. It also verifies visible malformed-file errors and discarded malicious runtime/authorization. It intentionally substitutes the OS file chooser/save effect; it does not claim the Android document-provider save dialog has been tested. Output is under artifacts/focus-control/api36/backup-device.

Final integration must additionally repeat cleanup combinations after the T19 icon adapter is registered and with the real notification/wallpaper adapters, without deleting another application's rules or altering the production installation.
