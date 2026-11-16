# Final review corrections

The final Standards/Spec review of `8ef4f9e` found three behavior gaps and one grouped accessibility mismatch. The corrections preserve the existing Java/SQLite session owner and original Sheet/Icon UI.

- Selected notification interception and sound DND now reject deterministically unsupported, unauthorized or disconnected starts before owner, reminder or recovery acquisition. Preferences remain selected; the user explicitly authorizes or disables the setting before retrying. Focus confirmation also opens for notifications, sound or enhancements alone and summarizes every selected capability. Lock confirmation uses its effective preset choices.
- All app-initiated accessibility, notification-access, DND, exact-alarm, unknown-source and wallpaper-settings launches share a resolved-target, five-minute authorization exception. Actual APK installation remains prohibited during active focus or lock. Live-wallpaper result routing retains its existing bounded exception and result host.
- Optional `LockConfiguration.enhancements` persists independently. An absent field inherits global choices for legacy data; `[]` means an independently empty choice. Native capture and main-entry policy use the same trusted saved configuration. Running rounds remain frozen, and both portable-backup trust boundaries validate and preserve the field.
- The reviewed auxiliary text is at least 12px and the reviewed help/button/summary targets are at least 48px.

The repeated ordered effect synchronization is now one private helper. Existing additive device-adapter constructors remain intentional: public FocusControl/CatFocus tests substitute only Android effects and clocks, and the targeted constructors preserve those established seams. A dependency bundle would change tested wiring across all capabilities without fixing a demonstrated defect; it is deferred rather than mixed into these mandatory corrections.

The test-only combined wallpaper/recent-task/launcher/main-entry recovery failure and data-replacement regression from `d664607`, and entry/upgrade evidence runner corrections from `9269a21`, are included.

## Executed before final device rotation

- R1 native RED: two failures demonstrated silent selected-unavailable focus admission. R1 native GREEN: both tests passed, covering focus, ordinary lock and strict lock, preserved preferences, no owner/effect duty and explicit disable/retry.
- R2/R3 native RED: actual plugin-launched Settings target remained blocked; preset enhancement snapshot was empty instead of its saved choice. Both failures were observed through the agreed native/public plugin and Android-effect seams.
- Portable backup RED lost independent/empty preset enhancements; GREEN passed. Host suite: 57 tests passed. TypeScript and Vite build passed.
- QA versionCode 10 app and instrumentation compiled with scoped `:app:assembleDebug :app:assembleDebugAndroidTest`. Test-only fixture corrections were recompiled separately. The initial unscoped aggregate build failed in dependency-library instrumentation because of duplicate Kotlin artifacts; that command is not counted as a successful build. An initial code9 install was refused by Android; no downgrade bypass or production-package operation occurred.

Stable final product APK: SHA-256 `6d3427a07519bf06eeac229856337e56f2eb0641a2b547f7a8b1390b5af51e6a` (product source `e28f3f2`). Corrected instrumentation APK: `1dc510b2545b815104b548e79c5941528a6ae04855b9d2a721eb5626c00ecd83` (test source `3c66802`). Local RED/GREEN evidence is under `C:/Users/33428/orca/notes/final-review-*`.

## Final execution

On November 15, 2026 (America/New_York), QA Android 16/API 36 `emulator-5580` executed targeted **13/13** and the full source-derived **121/121** native tests, both with **zero skips**. Full batch instrumentation time was 33.742 seconds. Metadata and raw instrumentation are in `C:/Users/33428/orca/notes/final-review-green/{targeted,final121}` and identify the stable app/test SHA-256 values above.

`scripts/final-review-device-smoke.mjs` then passed all five real WebView/system scenarios: notification-only, sound-only and enhancement-only focus confirmations before ownership; independent lock editor save/edit with explicit-empty semantics and frozen start; and an actual notification-access Settings page reachable during ordinary lock with anti-close off. Settings was first observed blocked outside the whitelist, then remained foreground after the app-initiated authorization launch and rendered its real permission list. The owner remained lock. Screenshots were visually inspected.

Evidence is in `artifacts/focus-control/api36/final-review/`. The final result has `complete=true`, `cleanupCompleted=true`, and matching raw private-file baseline/restoration digests `269b8c1b18cde5856997e696f8614e5bdde28fafa2834db814a1f12bdbb39bbd`; the entire idle QA databases/shared-preferences baseline, system authorization and wallpaper identifiers were preserved. Product sources are unchanged since the compiled `e28f3f2`; subsequent commits change test fixtures, scripts, evidence and documentation only.

OEM, actual calls, sound acoustics, wallpaper crop/provider fidelity and launcher-cache limits retain their separately documented evidence boundaries.

## Legacy diagnostics follow-up

Actual T21 system-return inspection found that a valid old protection object containing `study` and `globalWhitelist` but lacking newer fields caused diagnostics to throw on `enhancements.includes`. A new public diagnostics regression first reproduced that TypeError, then passed after `readProtectionDiagnostics` centrally filled `defaultProtection` without mutating the saved choices. The complete host suite now passes **58/58**, and TypeScript/Vite build passes. The review UI smoke also includes a real partial-legacy preference seed requiring all ten capability rows.

The front-only QA10 APK from `eb892fd` (merged source `62f5ba2`) has SHA-256 `60ea961b334dd20d1d3fdab82d3dd7ae0c8129e4620f4d7f701f80d312a081aa`, retained at `C:/Users/33428/orca/notes/final-diagnostics-green/app.apk`. Its seven `classes*.dex` entries are byte-identical to the previously accepted app. Java and instrumentation source trees are unchanged; test APK remains `1dc510b2545b815104b548e79c5941528a6ae04855b9d2a721eb5626c00ecd83`. New-APK real legacy diagnostics and all final study/legacy/notification leaf groups subsequently passed; see `docs/focus-control-final-leaf-evidence.md` for exact outcomes, retained failed fixture attempts, the measured-scrollbar correction and unique coverage accounting. The121 native result above belongs to the preceding exact APK and unchanged native bytecode; only the legacy ScrollLayoutTest fixture changed in the final test APK.
