Captured on 2026-11-15 from the isolated `com.xiaomao.focus.qa` package on
`KittenFocus_API36_QA` (Android 16 / API 36, English Settings).

The QA round was inactive (`observeControl().owner == null`) and its accessibility
service was disabled before UiAutomator inspection. These are deliberately opened
system Settings / installer pages, never arbitrary app windows. XML retains only
the real node hierarchy, package, view ID, text and node class used by the OS adapter.
The accessibility fixture additionally retains only the exact system
`com.android.settings:id/collapsing_toolbar` title metadata; all other descriptions
are omitted. Its `Use …` text is at depth 14, so the 12-depth recognizer must use the
known toolbar heading at depth 5 and main service switch at depth 11.
Original inspection artifacts are in the worker's ignored `artifacts/t18-capture`.

* `own-app-info`: fresh APPLICATION_DETAILS_SETTINGS task, own QA header in Compose
  SpaActivity, followed by the observed Uninstall and Force stop actions.
* `own-uninstall`: ACTION_DELETE confirmation, Google installer, own exact alert
  title, uninstall question and OK/Cancel actions. No uninstall was confirmed.
* `own-accessibility`: opened ACCESSIBILITY_SETTINGS, then tapped the observed exact
  QA service row. No signature-protected details deep link and no permission grant.

The public FocusControl regression tests replay these through the OS-only metadata
adapter. They complement, rather than replace, the real active device smoke test.
