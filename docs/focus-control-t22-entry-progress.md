# T19/T21/T22 entry acceptance checkpoint

November 15, 2026, isolated `com.xiaomao.focus.qa`, official API36 `emulator-5580`. Product source was integration `8ef4f9e`; the higher-version APK was versionCode 10 / `0.2.3-focus-control-qa`, SHA256 `3931b6dbd49c438615a5b2e9eb09e25c5bb23b43b82fa4c1a7d19948da14757b`. These results do not cover subsequent R1/R2 source fixes. Production data, device-owner state and wallpaper were untouched.

## Actual higher-version replacement

Evidence is in root ignored `artifacts/focus-control/api36/final-entry/upgrade9-to10/`. `replacement-identity-before.json` independently records installed versionCode 9 and APK target versionCode 10. `replacement-before.json` records the active paused round with the own launcher alias disabled and verified. `replacement-install.txt` records actual `adb install -r` success.

After installation, the script observed the alias resolve through PackageManager **before** launching any QA Activity. A real launcher monkey action returned to the app using `connectQa({launch:false})`. Assertions confirmed installed versionCode 10, original component state 0, withdrawn launcher journal with no pending responsibility, the same paused focus ID, retained notification permission and no rehide after reload. The subsequent drawer fixture failed before its end-of-script report, so this is partial upgrade evidence, not a complete successful launcher-script run. `post-upgrade-actual-state.json` preserves the later actual observation together with the original before state; its text explicitly notes attempted cleanup may already have executed.

Cleanup initially encountered an old WebView store write racing replacement. The independent cleanup brought QA to the foreground, finished its own ordinary round, reloaded the settled store, replaced the saved baseline, reloaded again and compared the complete public business data. `baseline-restored.json` records exact restoration, owner null, no pending responsibility, installed versionCode 10. The original notification permission was restored. No extra launcher-fixture records were retained.

## Retained failures and limits

- `launcher/` and `launcher-retry/` retain early drawer failures. A swipe starting at y850 intersected the Pixel search bar. The revised script starts at y650 and requires the actual `apps_view`, preventing an empty home screen from counting as a hidden drawer icon.
- `launcher-drawer-fixed/03-enabled-hidden-failed.{png,xml}` proves a real cache mismatch on installed v9: the actual app drawer still displayed the QA icon, while PackageManager returned no launcher Activity and native component state was 2 with the recovery notification reachable. This actual drawer effect is **not passed**. The product exposes `launcherCacheVerified=false`.
- `launcher-cache-limited/04-control-notification.png` shows the actual QA paused control card, title, content and help/recovery action. UiAutomator could not reach idle, so an actual content/action tap was not proven. `failure.json` is retained. The script now accepts optional inspected coordinates for these two exact synthetic notification controls and captures a screenshot before each real `input tap`; no PendingIntent shortcut is used.
- `upgrade9-to10/12-package-replacement-restores-visible-failed.png` shows home instead of an open drawer. The fixture failed; it does not demonstrate missing restored launcher availability. The script now captures native status before HOME, saves upgrade assertions before drawer work, and returns the app to foreground before bridge cleanup, avoiding background WebView callback timeouts.

The optional `--continue-cache-limitation` keeps `passed=false` and an explicit cache mismatch while allowing independent recovery checks to proceed. `--upgrade-only` isolates package replacement. A higher-version migration is removed from pending only after actual installed and target version codes are observed and compared.

## Source ready, not yet executed

`permission-return-device-smoke.mjs` still awaits actual execution of permission purpose Sheet → system Settings → QA-only accessibility fixture change → real launcher return, with product automatic diagnostic refresh in both directions. `entry-combination-device-smoke.mjs --reboot` still awaits process reconstruction, shared UI recovery and actual boot interruption of strict lock + main interface + own task + own alias. These are not green based on preparation.

Test-only commit `d664607` adds the approved public `FocusControl` combined wallpaper/entry failure test using existing OS adapters and controlled clock: four enhancements under a strict lock, wallpaper restoration failure while alias/task/main route restore, same strict identity after coordinator recreation, preserved originally hidden task, blocked data replacement until retry, then successful replacement. It was not compiled or run in this worker; the coordinator is incorporating it into the subsequent native batch.

The worker released its exclusive device lease after verified cleanup. No Gradle or Capacitor operation was performed by this worker. Further actual tests must use a fresh explicit lease and the coordinator's fixed final APK.
