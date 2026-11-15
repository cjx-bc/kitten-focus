# T07 temporary application access

Ticket: `cjx-bc/kitten-focus#8`. Independently implemented using the existing
CatFocus, Java clock and SQLite session. No third-party control source was copied.

`CatFocus.grantTemporaryAccess({sessionId, targetPackage, durationMinutes,
requestId, replaceConfirmed?})` accepts only 1, 3 or 5 minutes. Its typed result
contains `status` (`granted`, `denied`, `confirmation-required` or `failed`),
`reason`, `replayed` and the current `state`. Browser use explicitly rejects as
unsupported. Native strict countdown, absent/finished/rebooted focus, non-study
focus and a recovered application restriction all reject at this same boundary.

The native start replaces caller-supplied runtime counts and targets. Each active
session stores one private `temporaryAccessRuntime` object in its existing SQLite
document: a used count, at most three successful request identities and one grant.
Public focus snapshots expose only `temporaryAccess`: used/remaining uses, current
target package/name, remaining milliseconds and a display expiry. A repeated
successful request never launches again, spends again or extends a deadline;
reusing its identifier with different parameters rejects. Concurrent requests are
serialized on the same LocalStore monitor as timer lifecycle work.

Native authorization, connected accessibility service and a launchable target are
checked before changing the grant. One durable document write contains the grant
and its debit. The launch runs under the same store lock; a thrown launch failure
restores the previous document, including its original target and deadline. A
failed replacement therefore does not terminate the existing grant or spend a use.
The maximum is three successful grants per session. An active grant requires
explicit replacement confirmation; merely opening or cancelling either dialog
does not invoke the grant command.

Deadlines use elapsed realtime and boot identity, separately from focus elapsed
time. Pausing does not extend them. Recreating the process retains both count and
deadline. Read-only observation projects expiration; it does not settle timing,
write records, start rest or update notifications. Accessibility reads this
projection, permits only the one target and rechecks the foreground grant at most
once per second, including when the target stays open through expiry. A bounded
recheck also avoids extending a deadline by time spent asleep. Ending, entering
rest, reboot interruption and backup replacement remove the active session and
its grant; a new session always starts with zero uses. Explicit recovery withdraws
the capability for this round and makes the old grant ineffective even after
service reconnection.

The service supplies the actual blocked package to the existing native block
page. Its 1/3/5 minute picker returns to that application's real launcher entry on
success. Replacement names the preceding application and has separate confirm
and cancel actions. Strict countdown hides the action and the native guard still
rejects direct requests. The timer keeps its existing layout and adds a compact
remaining uses / target / remaining time line. Permanent global/item whitelists,
necessary system exceptions, notification exceptions and DND configuration are
unchanged by this command.

## Verification

- Public browser driver red: missing `temporaryAccessDriver.grant`; green:
  unsupported browser use rejects without pretending an Android app opened.
- Native first red: public grant command and launch OS adapter were missing.
- Official API 36 emulator: the first native grant/pause/recreation/expiry test
  passed without skips, recorded by the coordinator under
  `artifacts/focus-control/api36/t07-green-first`.
- Host suite after merging T08/T13: 29 tests passed; TypeScript/Vite build passed.
  The pre-existing statistics chunk warning remains.
- QA app and instrumentation APKs assembled with Java 21, SDK 36,
  `--no-daemon --max-workers=2 '-PtestApplicationIdSuffix=.qa'`.
- The complete native suite additionally covers launch failure, revoked service,
  confirmed replacement, concurrent cap enforcement, idempotent retries, strict
  denial, recovered protection, client-forged runtime and reboot interruption.
  Its device result and the real external-app picker/open/automatic-reblock smoke
  are recorded by the integration coordinator separately from compilation.

API 24/25, alternate launchers and OEM background restrictions remain separate
device coverage. An authorized service can be disconnected or stopped by Android;
temporary access does not claim immunity from system process termination.
