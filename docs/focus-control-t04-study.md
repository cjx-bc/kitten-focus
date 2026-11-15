# T04 ordinary study mode and global whitelist

Implementation branch: `task/focus-t04`. Ticket: `cjx-bc/kitten-focus#5`.

## Delivered path

The existing Tasks view opens `StudyModeSheet` using the unchanged shared Sheet,
Icon and global style files. Study preference and actual authorization, connection
and execution status are displayed separately. Permission help explains the local
foreground package check, absence of window content retrieval, how to disable it,
and the effect of revocation. Returning from settings rechecks capability.

The global editor displays launchable application names/icons and package identity,
supports search, multiselection, counts, a system application filter, confirm and
cancel. Filtering preserves the draft selection. The application itself is fixed
allowed; selected missing packages remain visible and unavailable. Selection can
be prepared before enabling study mode. Changes during a session apply next time.

Native `FocusControl.startFocus` captures the stored global policy in the existing
active SQLite session. Client supplied protection fields are replaced. Missing
accessibility authorization or a disconnected service rejects requested study
protection rather than silently beginning an unprotected session. Normal paused
focus remains the owner; ending or entering the existing rest removes that owner.

`FocusAccessibilityService` observes `FocusControl.observeControl()` on foreground
window changes. It never calls lifecycle reads, checkpoints, settles, creates records
or starts rest. Non-whitelisted foreground applications open `FocusBlockActivity`
with the focus title and current time; singleTop/clearTop prevents event-driven page
stacking. Its return action routes to the existing focus view. The activity observes
read-only state and closes when no eligible focus remains or reconciliation is due.

Necessary exceptions include this application, default launcher, default dialer,
resolved dial/emergency applications, current input method, trusted system permission
controllers and system UI. Opening the accessibility settings from the application
creates a five minute settings window. Exceptions are cached for five seconds and
invalidated on input method/configuration changes. Execution exceptions report failed
protection; authorization alone does not report a connected service.

## Contract for following tickets

Optional persisted configuration is `data.preferences.protection`:

```ts
{ study: boolean, strict: boolean, interceptNotifications: boolean, dnd: boolean,
  globalWhitelist: string[], enhancements: string[] }
```

`defaultProtection()` provides all false/empty values. Missing legacy configuration
is disabled. New UI updates spread existing configuration to preserve other modules.
`ActiveFocus.protection` is a native snapshot `{study, source:'global', whitelist}`.
`ActiveFocus.strictMode` belongs to T05 and is independent from application restriction.
Independent item/lock lists and recovery duties remain subsequent ticket work.

Public CatFocus additions are `protectionStatus`, `listProtectionApps`,
`openProtectionSettings` and `consumeFocusReturn`. Browser protection is explicitly
unsupported and requested browser study protection is rejected.

## Validation and remaining device evidence

- Host red/green: initially absent `protectionDriver.status` failed, then truthful
  browser unsupported status passed. A second failing test proved browser start
  previously silently accepted requested study protection; it now rejects it.
- `npm.cmd test`: 27 tests passed.
- `npm.cmd run build`: TypeScript and Vite build passed. Existing large statistics
  chunk warning remains.
- After `npx.cmd cap sync android`, both `:app:assembleDebug` and
  `:app:assembleDebugAndroidTest` passed using Java21, SDK36, QA suffix `.qa`, two
  workers and no daemon. PowerShell requires quoting the complete Gradle suffix
  argument: `'-PtestApplicationIdSuffix=.qa'`.
- Browser visual inspection: 375x812 study sheet uses existing styles; 812x375
  landscape is scrollable and has no horizontal document overflow.
- Root device run reported the public bridge denied authorization and forged policy
  tests passed on API35. Initial enabled test was explicitly skipped while the
  instrumentation restart reconnected accessibility; this is NOT passing evidence.
  Commit `04d100b` waits up to five seconds then asserts real authorization and
  connection, so the enabled acceptance cannot pass by skipping.
- Final merged device acceptance must run
  `StudyProtectionBridgeTest#globalPolicyStaysFrozenAcrossSettingsChangesAndPauseThenReleasesAtRest`
  with the QA service enabled; then observe a real allowed app, real blocked app,
  native block title/time, repeated window events, paused blocking, finish/rest release
  and return to focus. Coordinator owns the device and records this final evidence.
- Actual calls/emergency navigation, OEM background behavior, alternate launchers and
  older supported Android versions remain device coverage requirements, not claims
  established by compilation or this branch's host tests.

## Source and license

All T04 native control code was independently implemented with Android public APIs.
No Curbox/DetoxDroid GPL code or third party control engine was copied, and no
application relicensing was performed. Android platform interfaces used are
AccessibilityService window state events, AccessibilityManager enabled services,
PackageManager launcher queries, TelecomManager default dialer, Settings secure
current input method and explicit activity intents. No window content retrieval,
network transfer, second session engine or separate business database is introduced.
