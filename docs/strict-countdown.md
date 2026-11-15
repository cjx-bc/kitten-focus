# Strict countdown (T05 / #6)

Implemented independently in this repository; no third-party source was copied.
Existing Vue components, Java timing, SQLite records and the five-minute rest
remain the implementation boundaries.

## Public contract

- `preferences.protection.strict` is optional for old data and defaults to false.
  It is independent of `study`, notifications and system permissions. The strict
  settings Sheet persists it with `useApp.mutate` and explains the next-round rule.
- `CatFocus.startFocus` keeps its `session` argument and accepts the optional
  `strictModeConfirmed: boolean` acknowledgement. This acknowledges the prompt;
  it does not choose the strict policy. Native `FocusControl` reads the persisted
  Boolean `data.preferences.protection.strict` and snapshots `session.strictMode`
  itself. Caller-provided `session.strictMode` cannot enable or disable the rule.
- Strict countdown starts without the acknowledgement reject before ownership is
  acquired. All existing Vue starts share an existing-style Sheet confirmation.
  Stopwatch confirmation explicitly says strict mode does not apply. Study mode
  also uses this prompt to show the global whitelist count and required service.
- Native start normalizes the new timer to running, zero elapsed/paused time and
  empty segments. The session is detached from the caller's JSON.
- Before the strict countdown deadline, every non-`read` focus action rejects with
  an observable error, including pause, finish, cancel and unknown actions. Start
  and data replacement continue to reject while a focus owns control. Changing
  the preference after start cannot remove the captured rule.
- Observation remains read-only. A due or rebooted session follows the existing
  lifecycle settlement before a strict guard can block it. Normal completion
  writes one record and starts the existing five-minute rest; reboot interruption
  preserves checkpointed time and does not start rest. Stopwatch still pauses,
  resumes and normally finishes.
- The timer page hides pause/end only for the native strict countdown snapshot.
  Back navigation and the existing notification return path keep timing alive.
  The browser driver mirrors the strict countdown rule using persisted preferences.
  Existing system notifications have no pause/end action to bypass the guard.

## Verification on 2026-11-15

The coordinator ran the isolated `.qa` APK on the existing API 35 MuMu device.
Each new native control test uses its own SQLite file and a controlled clock;
cleanup closes and deletes that test file instead of illegally finishing a strict
session. There is no production test bypass.

- Red: `strictCountdownRequiresConfirmationBeforeStart` failed with
  `Strict countdown must be confirmed before it can start`; its first green passed.
- Red: `strictCountdownKeepsItsRulesAfterPreferenceChangesAndRecreation` failed
  with `Strict countdown accepted pause` before the action guard was added.
- Final native run: 15 passed: eight `FocusControlTest`, one real plugin bridge
  test and six legacy `FocusEngineTest`. Coordinator evidence is under
  `artifacts/focus-control/t05/complete-native`; the two red runs and first green
  are retained under the adjacent T05 artifact directories.
- `npm.cmd test`: four files, 27 tests passed. TypeScript check and Vite build
  passed. QA debug APK and instrumentation APK assembled with
  `--no-daemon --max-workers=2 -PtestApplicationIdSuffix=.qa`.
- Orca browser at 390 × 844: initial-off settings, toggle persistence after reload,
  strict start prompt, no pause/end controls during the countdown and reload with
  the same strict timer were observed. The existing design and five tabs remain.

## Device acceptance still separate

The coordinator's final integrated UI smoke must cover the merged study/strict
Sheet, stopwatch non-applicability prompt, notification return, Android back and
warm/cold app re-entry. API 24/25 and other device compatibility remain separate
from this API 35 run. The current notification has only a return action; future
native notification controls must invoke the same `FocusControl` boundary.
Help and protection recovery must remain reachable and must not finish strict
timing. System force stop immunity is not promised by strict countdown.
