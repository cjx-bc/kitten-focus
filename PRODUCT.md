# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

Individuals on Android who want a calm, distraction-free personal focus timer paired with long-lived daily organization and self-discipline tools. While the core workflow accommodates academic schedules and semester timetables, the product serves general personal focus and self-discipline habits rather than students exclusively.

## Product Purpose

Connect personal scheduling, reusable focus activities, active Android focus protection, and retrospective time statistics in one offline-first local loop (`Arrange Time -> Pick Reusable Item or Free Focus -> Record Actual Focus -> Review Calendar & Statistics`) without requiring accounts, cloud sync, or complex setup.

## Positioning

Local-first, zero-account Android focus companion whose single source of truth for timing, mutual exclusion (`focus` / `rest` / `lock`), and focus records lives natively in Java + SQLite (`LocalStore`), paired with transparent, opt-in system protection controls (Study Mode app restrictions, notification snooze/release, DND audio rules, independent lock) that honestly report system boundaries instead of faking unbreakable device lockdown.

## Operating Context

- **Runtime & Storage**: Capacitor 8 hybrid shell hosting a Vue 3 + TypeScript + Pinia interface over Android Java (`minSdk 24`, `targetSdk 36`, SQLite `LocalStore`), with browser/IndexedDB mode strictly limited to UI preview.
- **Session Ownership**: Focus sessions, 5-minute post-completion rests, and independent countdown locks share mutually exclusive native ownership; `observeControl()` remains strictly read-only, while active sessions persist across app switches and survive screen-off via `FocusKeepAliveService` (`specialUse` foreground service reusing the single ongoing focus notification).
- **Primary Routines**: Common user actions (starting a reusable item focus, starting free focus, pausing/finishing, toggling Study Mode, checking today's/weekly stats & schedule) are constrained to `<= 2` steps and single-layer dialogs (`0` nested modals).
- **In-App Distribution & Updates**: Distributed directly via APK (GitHub Releases and self-hosted HTTPS mirrors) using consistent debug internal-testing signing, background cold-launch update checks with 60-second cooldown, Option A per-version persistent dismiss (`稍后再说`), metered-network confirmation, SHA-256/signature verification, and automatic pre-upgrade local recovery backups.

## Capabilities and Constraints

- **Core Focus & Reusable Tasks**: Focus items belong to color-coded themes (`待办主题` / `子待办`) and never track completion checkboxes or "completed" states (`GLOSSARY.md` & `ADR 0003`). Supports countdown and stopwatch modes, plus free focus (`自由专注`).
- **Calendar & Semester Timetable**: Personal events (with conflict warnings and linked tasks) plus multi-semester teaching-week timetables (`课表`) with single-session cancellation/adjustment.
- **Statistics**: Day, week, month, year, and cumulative views of actual accumulated focus duration (excluding paused intervals), session counts, and midnight-split allocations.
- **Study Mode & Independent Lock**: Unified Study Mode (`学霸模式` -> `应用限制` / `严格模式` / `免打扰`) plus separate Independent Lock (`独立锁机`) whose records never mix into Focus Statistics (`docs/adr/0004-native-focus-control-boundary.md`).
- **Honest System Boundaries**: No claim of immunity against user force-stop, uninstall, or aggressive OEM background policies; battery optimization exemption (`后台运行不限制`) is a calm, optional recommendation that never blocks focus starts or triggers error badges; `CatView` remains an intentional v1 placeholder (`小猫还未入驻`), with virtual cat growth/items/coins/XP and cloud sync explicitly deferred.
- **Strict Terminology (`GLOSSARY.md`)**: Student/user-facing screens avoid forbidden terms (`番茄钟`, `番茄数`, `待办完成`, `本次专注已完成`, `大主题模块`, `子日程`, `临时待办`) and keep low-level protection telemetry confined to Tier 3 diagnostic views (`/permissions`, `/help`, `/recovery`, `/emergency`).

## Brand Commitments

- **Identity**: `小猫专注` (`Kitten Focus`), Android application ID `com.xiaomao.focus`.
- **Launch Tagline**: `专注此刻，陪小猫一起长大` (pair tagline: `把时间留给认真生活的自己。`).
- **Companion Asset**: Minimal monochrome cat-head mascot (`AppMark` and the single-stage 1000ms native animated splash wink on `#FFFFFF`).
- **Incumbent Authority**: Visual tokens and UX budgets remain governed by `docs/brand-spec.md` and `docs/ux-spec.md` (light-only v1 scheme; dark theme deferred and marked N/A).

## Evidence on Hand

- **Authoritative Specs**: `GLOSSARY.md`, `docs/brand-spec.md`, `docs/ux-spec.md`, `docs/app-updates.md`, `docs/adr/0001`–`0004`, `deploy/landing/index.html`, and the Vue/Android codebase (`src/`, `android/`).
- **Verification Scope**: Host unit tests (Vitest), browser UX/brand E2E checks, Android JVM unit tests, APK signature/integrity checks (`scripts/prepare-update.py`), and landing/update server verification are active in the repository.
- **Explicit Gaps Not to Fabricate**: Do not invent testimonials, user growth metrics, App Store / Google Play reviews, implemented virtual-pet progression mechanics, dark-mode support, or Android physical-device/emulator regression passes when unexecuted.

## Product Principles

1. **Effortless Entry Over Setup Friction**: Everyday focus sessions begin in one or two taps with zero forced pre-start checklists or configuration modals.
2. **Single Source of Native Truth**: UI surfaces mirror SQLite/Java session state cleanly and never run competing timers or business stores.
3. **Calm Restraint Without Anxiety**: Optional system recommendations and version updates avoid red warning badges, nagging dialogs, and exposed engineering jargon.
4. **Honest Boundaries & Safe Exits**: Focus protection always discloses real Android capability limits and keeps help, permissions, recovery, and emergency exits reachable within two steps.

## Accessibility & Inclusion

- Light-only high-contrast monochrome baseline targeting WCAG AA (`>= 4.5:1` body contrast across `#FFFFFF` and `#F5F5F5` card surfaces, `>= 12px` minimum text size, `>= 48px × 48px` touch targets).
- Five-tab icon-only navigation preserves explicit `aria-label` and `aria-current="page"` semantics; focusable headings and inputs avoid trap states.
- Motion and splash animations honor system `prefers-reduced-motion: reduce` by eliminating non-essential waits and CSS transitions/animations.
