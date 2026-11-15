# T08 故障恢复

Ticket: `cjx-bc/kitten-focus#9`. Independently implemented; no third-party control source copied.

`CatFocus.previewRecovery()` returns an opaque revision, registered steps and pending status.
It is read-only, so closing/cancelling the existing-style recovery Sheet has no side effects.
`confirmRecovery({revision})` rejects a changed pending impact list and otherwise withdraws
each outstanding duty independently. Results are `restored`, `failed` or `limited`, with
retryability and a reason. Repeated completed requests are idempotent. Only actual registered
capabilities appear; unimplemented enhancement switches do not become fictional restore steps.

The initial real operation is application restriction. The runtime SharedPreferences journal
is committed before a protected active session can become visible. Explicit recovery commits
the per-session withdrawal before the OS release signal. `observeControl` projects that latch
into `protection.applicationsWithdrawn`, which both accessibility enforcement and the native
block page honor. Service reconnection/recreation cannot restart a withdrawn capability.
The captured study preference and whitelist remain; the status explains `recovered` separately.
Neither recovery command invokes pause, finish, settlement or business data replacement.
Strict countdown guards continue to reject all early lifecycle mutations after recovery.

Normal lifecycle release also records a result. Failed duties survive process recreation,
business data replacement and upgrade backup restoration. A conflicting protected start is
rejected until recovery succeeds; unrelated timing remains available. Journal files are named
`catfocus-recovery-<databaseName>`, separate from AppData and SQLite upgrade snapshots. Android
application backup is disabled. Old duties are never cleared by importing client business data.

Entries are reachable from the study status Sheet, full-screen timer, settings help and an
action on the existing focus status notification. The action sends `openRecovery` to the
existing MainActivity; cold and warm intents consume it and open the same Sheet. It does not
send a timer finish intent. Android Back closes the topmost Sheet first.

## Verification

- Host red: missing public recovery driver failed `recovery-bridge.test.ts`; green verifies
  browser explicitly reports no Android recovery and refuses to claim successful restoration.
- Host suite: 28 tests passed. TypeScript/Vite build passed; existing statistics chunk warning remains.
- `RecoveryControlTest` uses the real native control and isolated SQLite, with the confirmed
  OS authorization/release and clock seams for deterministic permission/failure/expiry behavior.
  It covers preview/cancel purity, strict preservation, durable withdrawal, idempotence, failure
  responsibility retention, blocked conflicting starts and successful retry. No production bypass
  or second session engine is added. On 2026-11-15 the coordinator ran both tests on the
  official API 36 emulator: two passed, zero skipped. Evidence is in the integration
  workspace's `artifacts/focus-control/api36/t08-native` directory. This run proves the
  native contract with injected OS failures; actual external-app restoration remains a
  separate coordinator-owned device check.
- QA debug application and instrumentation APKs assembled with Java 21, SDK 36,
  `--no-daemon --max-workers=2 -PtestApplicationIdSuffix=.qa`.
- Orca browser visual inspection at 390 × 844: the original-style help/recovery Sheet,
  explicit browser limitation and cancel action render without horizontal document overflow.

Notification/DND/task/icon/wallpaper operations must use this coordinator's responsibility and
result flow when their actual OS adapters land. OS-specific original-state metadata stays in
the adapter, never in business backups. T13 exposes `getDndStatus`/`restoreDnd` for this integration;
until combined, this branch's recovery Sheet claims only its real application-restriction duty.
