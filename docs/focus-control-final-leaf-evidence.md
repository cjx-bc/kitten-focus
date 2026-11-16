# Final leaf regression evidence

Device: isolated `com.xiaomao.focus.qa`, Android 16/API36, `emulator-5580`, 540×960 at density240. Production package and user data were untouched. Every phase captured the complete idle QA databases/shared-preferences files, then restored their exact hashes and public business data after checking no active owner or unresolved duty. Listener/accessibility settings were restored exactly.

Final frontend app SHA-256: `60ea961b334dd20d1d3fdab82d3dd7ae0c8129e4620f4d7f701f80d312a081aa` (QA versionCode10). All seven DEX entries are byte-identical to the previously tested native app. Java product source is unchanged since `e28f3f2`.

## Passed on the final frontend

Evidence root: `artifacts/focus-control/final-leaf/`.

| Phase | Result | Evidence |
| --- | --- | --- |
| Review UI with valid partial legacy protection | 6 scenarios passed; ten diagnostics render without missing-field error | `new-front/final-review/results.json` |
| Actual purpose Sheet → Android Settings → launcher return | Grant and revoke automatically refresh without reload/manual recheck | `permission-return/results.json` |
| Study policy | 3/3, zero skipped | `study/study-policy/` |
| Study denied | 1/1, zero skipped | `study/study-denied/` |
| Study enabled | 1/1, zero skipped; exact QA service rebound after instrumentation startup and actually connected | `study/study-enabled/` |
| Original notification dual-app | 24/24, zero skipped; original identity/update/deadline and actual shade click verified | `notification-original-observed/` |
| Notification lifecycle | 29/29, zero skipped, 210.655 seconds | `notification-lifecycle/` |
| Corrected scroll fixture | 2/2, zero skipped | `scroll-green/` |

Notification lifecycle covers early updated-original release with actual shade click, 65-second paused stopwatch lease renewal and rest, ordinary-lock cancellation, explicit recovery/reconnection without restart, finite-lease expiry after listener disconnect and authorization loss, original identity after reconnection, withdrawn originals, and ongoing-notification exceptions.

The original-notification and lifecycle groups both contain the same **22** FocusNotificationTest cases. Their combined unique coverage is **31**, consisting of those22 plus2 original-device and7 lifecycle-device cases. Those22 are already included in the121 native batch; they must not be counted again as new cases. Study5 + legacy5 + notification-device9 add19 unique cases to the121 native baseline when the final legacy group is complete.

## Failed attempts retained and diagnosed

The initial original-notification run passed23/24 but Android UiAutomator could not locate the synthetic notification during the live shade. The captured actual 540×960 image visibly placed `Synthetic probe #21101`, revision2, at x24–516/y324–448. Only then was the existing explicit `200,420` fallback supplied. This is an actual UI tap; no `PendingIntent.send()` was used. The observed retry passed24/24.

Initial combined legacy5 failed3. A bounded isolated retry passed all3 swipe cases and actual vertical scrolling, while both scroll pixel comparisons failed at exactly0.0056179775. A test-only diagnostic APK retained unchanged assertions and captured actual before/during images, window focus, DOM metrics and changed-pixel bounds. Both short/long bottom-edge failures changed exactly333 pixels at x534–536/y810–920: three rightmost columns inside the old534×111 crop. Native scrollbar width was6 physical pixels, fonts were loaded, window focus was true, and navigation top/height were identical before/after. This proved the native overlay scrollbar was included by the old fixed3px inset; navigation content was stationary.

The final fixture uses the measured native scrollbar gutter, retains the0.002 pixel threshold, adds exact navigation-geometry equality, and waits for the appended long-page layout's visual commit. Actual vertical scrolling still must exceed100px. No product styling, navigation or threshold was changed. Diagnostic evidence remains in `scroll-diagnostic/scroll-diagnostics/`; diagnostic instrumentation was removed from source.

The accepted original/lifecycle runs used test APK SHA `1dc510b2545b815104b548e79c5941528a6ae04855b9d2a721eb5626c00ecd83`. Final scroll-fixture test APK is `141ee1fcf98b47a9920c3bf71afdb0d5d020d9221dbd4422f04a1e1ac991a9c8`; only ScrollLayoutTest differs. The121 native behavior cases and product Java are unchanged. Full legacy5 on the corrected fixture is the final pending check at this document checkpoint.
