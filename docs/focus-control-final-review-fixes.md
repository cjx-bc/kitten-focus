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

The final native source inventory is **121 tests**, including AuthorizationSettingsTest and the added combined wallpaper case. This is an inventory, not an execution claim. Final targeted GREEN, the entire 121-test batch, and `scripts/final-review-device-smoke.mjs` remain pending until the shared QA device is granted. OEM, actual calls, sound acoustics, wallpaper crop/provider fidelity and launcher-cache limits retain their separately documented evidence boundaries.
