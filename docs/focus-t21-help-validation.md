# T21 offline help and truthful protection diagnostics

Implemented on 2026-11-15 against integration `66295f9` (includes T19 launcher and T20 backup changes). No new Android control engine, storage, native effects, or permission grants were added.

`ProtectionHelpView` now ships eight complete sections in `src/content/protectionHelp.ts`: independent mode choices, whitelist inheritance/empty override, notification display versus sound and third-party lockscreen boundaries, independent normal/strict lock, all six enhancements, permission/admin/owner distinctions, 1/3/5-minute single-target temporary grants and three-success quota, and confirmation/cancel/retry/withdrawal recovery lifecycle. Wallpaper remains explicitly unintegrated until its owning ticket supplies the real execution and restoration contract. Technical probes are not advertised as product support.

`readProtectionDiagnostics` reads the existing CatFocus protection, control observation, notification, sound, recents, launcher, and recovery-preview contracts. The five entry states are derived per ability from preference, native round request, authorization, connection, effect and journal results. A failed module does not erase independent successful observations; failed reads show unknown execution/request/recovery rather than false success. Restoration responsibilities come from the existing adapter preview used by RecoverySheet. Permission and connection never imply a verified navigation return, notification release or sound effect. Launcher component verification is distinguished from actual launcher-cache behavior. Devices reporting owner identity still do not claim an implemented system uninstall block.

Settings, active focus and lock expose the offline help and diagnostics. The existing routes remain allowed by native/Vue main-entry policy. Existing RecoverySheet performs all confirmation and retry actions. Native app-resume, window focus, document visibility, recovery events, three-second visible polling and the explicit recheck refresh diagnostics. Checking status does not mutate protection. Permission purposes and decline choices use the existing Sheet; no fonts, icons, tab definitions or global theme were replaced.

## Executed validation

- `npm.cmd test`: 10 files, 54 tests passed, including six public CatFocus diagnostics scenarios. The OS plugin is replaced only at the agreed native boundary. Initial missing-module red and later unknown-after-read-error/shared-journal-recovery red cases were observed before implementation; final cases pass.
- `npm.cmd run build`: passed (`vue-tsc --noEmit` and Vite). Existing statistics chunk-size warning remains.
- `git diff --check`: passed.
- Orca CLI browser at `http://127.0.0.1:5191/#/help`, page `7a5d774b-b860-4aba-9688-3332bc2b0c0b`: help has eight sections and complete body text; existing font stack retained.
- At 390x844 and 844x390 mobile viewport, document scrollWidth equals innerWidth (390 and 844 respectively). Diagnostics expose ten capability cards without horizontal overflow.
- Browser offline mode enabled using `orca exec --page … --command 'set offline true'`. With the shipped view already loaded, keyboard Enter navigated from diagnostics to help; all eight bodies remained readable. Keyboard Enter on the recovery directory link focused `help-recovery`, scrolled it into view (top approximately 68px) and preserved the router path. Offline navigation to recovery opened the existing Sheet; Escape closed it with zero dialogs remaining. This is a loaded-asset offline UI check, not a claim that the Vite website is an offline-installable PWA.
- Keyboard Space on a focused capability summary expanded the details and exposed support/auth/connection/request/execution/verification/recovery fields; native browser semantics and focus outline remained available.
- Browser network inspection reported zero resources outside the localhost origin for the help/status page. Offline mode was restored to false after the check.
- Screenshots inspected and saved locally (ignored): `artifacts/t21/help-390.png`, `status-expanded-390.png`, `status-844.png`.

## Remaining integrated Android check

Pure frontend change: no Gradle, Capacitor sync, device mutation or lease was used by this worker. The final combined APK must still exercise these new pages through real control-notification entry after launcher hiding and main-interface restriction, verify permission return/resume refresh, and read the help in airplane/offline mode. Native execution evidence from other tickets is not replaced by the host/browser results above. Real acoustic, OEM launcher-cache, phone-call and device-owner policy behavior are not claimed.

If control notifications are unavailable after hiding, help only suggests the system accessibility detail's app-settings entry when the local system provides it; it is not counted as a universally verified fallback. T19/T22 own the actual fallback gate and integrated device proof.
