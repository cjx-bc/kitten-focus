# Notification and lock interaction corrections

Validated on November 15, 2026 against the isolated `com.xiaomao.focus.qa` application, `emulator-5580`, Android 16 / API 36. Production application data and device-owner state were not changed.

## Resulting behavior

- An ordinary original notification updated into a necessary notification is reevaluated from the posted callback and both Android notification sets. A held necessary original receives the same public 1 ms release request used by recovery; an already active necessary original is retained. Restoration is recorded only after Android confirms the original is active.
- Release verification tolerates a maximum 2 second empty-set handoff after a release request. This fixes a device-reproduced race where Android temporarily exposed an original in neither set and the coordinator incorrectly recorded it absent before its return. The responsibility remains pending during that bounded interval.
- A different current original can reuse a key after observed absence in the same round. Android post time is metadata, not a monotonic clock: a lower timestamp remains valid when the current active set confirms key, package, UID and timestamp. Pending updates share one responsibility. Previously absent and previously verified restored history stay truthful. A stale callback without a matching active original cannot create another generation.
- Ordinary and strict locks capture the shared sound preference at start, reject conflicting old sound responsibilities before acquiring ownership, and synchronize the sound adapter after start. Later preference edits affect the next round. Lock statistics and rest behavior remain independent of focus.
- Locks that capture the navigation enhancement now run its support, authorization and connection preflight before acquiring ownership. Lock termination clears its navigation runtime.

## Test evidence

All new deterministic tests use public `FocusControl` commands/status, a real isolated SQLite store, the existing OS-adapter seams and the controlled clock. No notification body is part of the adapter or journal.

| Check | Result | Evidence directory under `artifacts/focus-control/` |
| --- | --- | --- |
| Necessary update already active | RED: ordinary snooze count 2 instead of 1; GREEN | `integration-fixes/necessary-active-red`, `necessary-active-green` |
| Necessary update still held | RED: retained 60000 ms instead of release request 1 ms; GREEN 18/18 | `integration-fixes/necessary-held-red`, `necessary-held-green` |
| Reused absent key, including wall-clock rollback | RED: new original not held; GREEN 19/19 | `api36/integration-fixes/generation-red`, `integration-fixes/generation-green` |
| Reused key after verified restoration and subsequent withdrawal | RED: new original not held; GREEN 20/20 | `api36/integration-fixes/terminal-generation-red`, `terminal-generation-green` |
| Lock sound snapshot, ordinary/strict cleanup and conflicting old responsibility | RED: sound off instead of active; GREEN | `api36/integration-fixes/dnd-lock-red`, `dnd-lock-green` |
| Lock navigation preflight | RED: unavailable requested capability acquired ownership; GREEN in full native batch | `api36/integration-fixes/lock-navigation-red`, `integration-fixes/final-native-38` |
| Control 11 + sound 7 + notification 20 | PASS 38/38, 17.362 s, no skips; includes real Android sound-rule fixture | `integration-fixes/final-native-38` |
| Device-discovered release handoff gap | RED: responsibility became non-pending during empty-set handoff; GREEN notification 21/21, 7.826 s | `integration-fixes/necessary-handoff-red`, `necessary-handoff-green` |
| Independent sender, two real original-notification scenarios | PASS 2/2, 18.379 s | `integration-fixes/final-original-notifications-verified` |

The final real scenarios verified: original key/package/UID/PendingIntent preservation, an ongoing necessary update becoming reachable in 646 ms, confirmed restoration, sender withdrawal of that active original, a new ordinary posting with the same key being held in the same round, early release of that new original, and the existing deadline release followed by a real notification-shade click. The click used `--observed-tap 200,420` only after inspecting this exact fixture's 540×960 screenshot. It did not call `PendingIntent.send()`.

The runner restored both original system notification listeners, accessibility `null` / disabled, and removed its newly installed sender. `result.json` records APK SHA-256 values and `cleanupCompleted=true`. The sound fixture uses `FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES` when acquiring UiAutomation.

## Retained limitations and failed evidence

The initial real run could not locate a shade control through UiAutomation; the inspected-coordinate rerun verified the actual click. A subsequent run exposed the release handoff race, which was fixed and rerun. These failed artifacts remain under `final-original-notifications`, `final-original-notifications-retry` and `final-original-notifications-handoff`.

The attempted immediate sender cancellation of a still-snoozed original did not remove it from Android's snoozed set on this API 36 sequence. That attempted device scenario is not counted as passed. New-generation handling after confirmed absent originals is proven at the deterministic public boundary; the real same-round generation scenario uses a verified restored original followed by actual active-set withdrawal. The implementation does not declare a retained snoozed original absent merely because cancellation was requested.

One failed fixture's process-local business snapshot could not be restored after its cleanup assertion interrupted the test. Its own synthetic countdown subsequently completed. Public bridge cleanup exited that fixture's rest and verified no owner and no pending original responsibilities; one synthetic `notification-updates-5366240093623` completed record and the synthetic protection preferences remain in disposable QA data. No broad data clearing or unrelated record deletion was performed. The final successful fixture preserved and restored this resulting idle QA baseline. The production application was untouched.

Final integration-head combined T22 execution remains the coordinator's responsibility after merging the independent work. This evidence does not substitute for physical calls/alarms, OEM behavior, acoustic testing or older Android versions.
