# Native focus control boundary (T01)

`CatFocus` keeps the existing `startFocus`, `focusAction`, `startRest`,
`restAction`, `loadData` and `replaceData` signatures and result shapes.
Their native session work now enters `FocusControl`; Java `FocusEngine`,
`RestEngine` and the existing SQLite store still own timing and records.
Reminder/boot reconciliation and the update precondition enter the same boundary.
The Vue screens and polling lifecycle are unchanged.

## Observation

`CatFocus.observeControl()` (web wrapper: `controlDriver.observe()`) returns:

```ts
interface ControlSnapshot {
  owner: 'focus' | 'rest' | null
  focus: FocusSnapshot // { session, elapsedMs }, no finished record
  rest: RestSnapshot   // { session, remainingMs }
  needsReconcile: boolean
}
```

Observation reads detached stored session data and projects elapsed/remaining time.
It does not checkpoint, write a record, alter a deadline, settle a session, start
rest, schedule/cancel an alarm or publish/cancel a notification. A caller may
modify its returned JSON without changing the stored session.

An active focus, including a paused focus, owns control. A running rest owns
control when no focus is active. A completed rest remains observable without an
owner. Due or rebooted stored sessions remain visible until lifecycle processing;
`needsReconcile` reports that work is pending. A due countdown is capped in the
observation, and a rebooted focus exposes only its checkpointed time. Consumers
must consider this flag and the session deadline before applying control rules.

## Lifecycle

`focusAction('read')` and `restAction('read')` retain their existing settlement
behavior for compatibility. `FocusControl.reconcile()` explicitly performs this
work for native boot/refresh callbacks. Event-driven rule observation should call
`observeControl()` instead of a lifecycle read.

Normal countdown completion and stopwatch finish pass ownership to the existing
five-minute rest. Early countdown finish keeps manual rest available. Rest start
is idempotent for the same source record; a paused focus or running rest rejects
another focus. Replacement uses the coordinator's existing-session check and
focus/rest reminder cleanup.

## Verification

Host bridge tests use public drivers and a substitute for the external IndexedDB
boundary. Native `FocusControlTest` uses the same commands with a controlled device
clock and an isolated test SQLite file; `CatFocusControlBridgeTest` exercises the
real plugin methods while capturing only their transport replies. Both new native
test classes require the `.qa` application suffix before setup can change data.

The production clock uses Android elapsed realtime, wall time and boot count.
No test-only bridge method, second session engine or new production database is
introduced. Device acceptance and final integration evidence are tracked by the
coordinator separately from compilation results.
