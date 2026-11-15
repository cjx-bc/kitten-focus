# T10 strict independent lock evidence

Date: 2026-11-15. Ticket: #11. Extends T09 through the existing native FocusControl, LockEngine and SQLite active owner.

Saved `lockConfigurations[].strict` is optional for compatibility; only the boolean `true` enables strict locking. New UI configurations default to ordinary locking. The lock choice is independent of the focus strict preference. CatFocus.startLock takes a saved configuration ID and `strictLockConfirmed`; that flag acknowledges the displayed start rules and does not supply the native policy. The native boundary reads the saved configuration, rejects an unacknowledged strict start before registering protection, and freezes `strictMode` in the active lock session.

Before the original monotonic deadline, LockEngine rejects every non-read operation for a strict lock, including confirmed finish, pause, resume and cancel. Focus commands, new focus/lock/rest starts and data replacement retain the shared active-owner exclusions. Editing the saved configuration affects the next round. Recreating the native controller or WebView does not change the active snapshot or deadline. Notifications and blocking screens identify strict locking without offering early unlock or temporary access.

The existing recovery journal withdraws actual protection while retaining the same strict countdown. Canceling recovery does nothing; confirmed recovery does not settle, pause or replace the lock. Reconnecting a withdrawn service does not reactivate that round's protection. Natural expiry writes one independent lock result and performs normal cleanup; it creates no focus record, focus statistics or rest. Reboot interrupts using the saved checkpoint, excludes the reboot gap and does not restart locking.

The UI reuses the existing Sheet, Icon, input, switch, typography, colors and five main tabs. Strict configuration, start rules, running status and recovery copy are added to the T09 flow. Android's necessary/emergency interactions remain governed by the existing application exceptions. No additional third-party source, session engine or business database is introduced.

## Executed red/green checks

- First native runtime red on the isolated API36 QA app: `savedStrictLockRequiresExplicitStartAcknowledgementBeforeAnyProtection` failed with `Strict lock must require acknowledgement`. Parent-run evidence: `artifacts/focus-control/api36/t10-red` in the integration workspace. After the native admission guard, the same method passed: **1 test**, 0.134 seconds, own `artifacts/focus-control/api36/t10-first-green/instrumentation.txt`.
- Second native runtime red: `strictLockRejectsEveryEarlyControlAfterRecreationConfigurationEditsAndRecovery` failed with `Saved strict configuration is the native rule` at line 132, **1 failure, zero skipped**. Evidence: `artifacts/focus-control/api36/t10-second-red/instrumentation.txt`. The test traverses configuration edits, recreation, both sides of recovery, all forbidden controls, the last millisecond and the original deadline. A separate strict reboot test covers saved time and independent result semantics.
- Host regression: **34 tests passed** and the TypeScript/Vite production build passed after merging the T11 notification implementation and its corrected fixture.

Final native green and actual one-minute UI/OS evidence are recorded below after execution; compilation alone is not accepted as proof of strict locking.
