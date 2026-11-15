# T06 independent item whitelists

Ticket: `cjx-bc/kitten-focus#7`. Implementation branch: `task/focus-t06`.

## Stored contract

`FocusItem.whitelist` is optional. Both absence (legacy items) and
`{ source: 'global' }` inherit `preferences.protection.globalWhitelist` at the next
start. `{ source: 'custom', packages: string[] }` replaces that global list.
An empty custom array is meaningful and stays custom. Package identity is the
Android package name, never the displayed application name.

`ActiveFocus.protection` snapshots `{ study, source: 'global' | 'custom', whitelist }`.
The Android snapshot adds the application's own package as a fixed exception;
necessary system interactions remain the separate T04 exceptions. Custom packages
do not merge with global packages. Global or item edits do not rewrite an active
snapshot. Restoring following global affects the next start, which reads the then
current global list. Free focus and items without configuration inherit global.

Native `startFocus` ignores client supplied protection/whitelist fields. It resolves
`session.itemId` against persisted, nondeleted items before selecting packages. A
missing or deleted item cannot supply a client custom policy. The browser bridge
uses the same stored selection semantics and continues to reject requested study
protection because browser application blocking is unsupported.

Schema version remains 1. Old backups need no additional fields. Backup import
validates any supplied independent configuration before replacing business data;
empty lists and saved unavailable package identities round trip unchanged.

## Interface

The existing item Sheet contains following-global and independent choices. Editing
the package list changes only the item draft. Confirming that list still requires
the existing Save item action; closing the item discards those draft changes.
Closing the package editor discards its selection changes. Saving during a focus
states that changes affect a later round. The start confirmation identifies the
actual global/custom source and count.

`AppWhitelistEditor` is shared by the global and item forms. Its public props are
`open`, `title`, `packages`, optional `saving` and `saveError`; it emits `close` and
`confirm(packages)`. A future lock configuration can reuse this component. Search
and system filtering preserve selections, fixed self access cannot be unchecked,
and saved missing packages remain visible with their identity and unavailable
label. Fixed self access does not get inserted into an otherwise empty saved custom
array. Original Sheet, Icon, navigation and design tokens remain in use.

## Validation

- Host red/green: malformed custom backup was accepted before validation; the
  regression now rejects it. A forged browser policy formerly overrode the saved
  item; it now uses the saved custom list and freezes it across configuration edits.
- Host bridge coverage also checks restored inheritance reads the newest global on
  the next start, independent empty lists, a second legacy item, and free focus.
- Backup coverage accepts legacy items without a list and preserves empty or
  unavailable custom packages. All 31 host tests passed before the final merge.
- Official Android 16 / API 36, `emulator-5580`: coordinator observed the native
  custom-source regression fail (`expected custom, got global`), then pass using
  the public CatFocus bridge. Evidence: root `artifacts/focus-control/api36/t06-red`
  and `t06-green-first`.
- The native matrix additionally checks fixed self access, global replacement,
  current snapshot stability, restore-following, independent empty, a second item,
  and free focus. Its final merged execution is tracked by the coordinator.
- A second native regression covers the public application picker retaining an
  unavailable package saved only in a custom item. Its red/green results are tracked
  by the coordinator.
- Browser QA used an isolated origin at port 4316 with real persisted data and the
  existing forms. Missing package labels, cancel list, cancel item after confirming
  an empty draft, save empty/reload, and restore following/reload were observed.
  Portrait 375×812 and landscape 812×375 were inspected; no horizontal document
  overflow, and the landscape Sheet scrolls. The temporary browser tab and server
  were closed after the checks.
- TypeScript/Vite and QA Android APK/test APK builds passed. Vite retains the
  existing large statistics chunk warning.

Final edit → start → real allowed/blocked application validation must use the
coordinator's exclusive official API 36 device lease and matching freshly built
WebView assets. This document does not count a policy snapshot alone as proof of
foreground blocking. The target matrix is custom Chrome/global Settings, then
restore following global and verify the opposite result on the next round.
Older API versions and OEM/call/emergency cases remain whole-project device
coverage; no result here claims those environments were exercised.

## Source

This feature is independently implemented on the existing Vue/Capacitor/Java/SQLite
boundary. No third-party control engine or new session/database is introduced.
