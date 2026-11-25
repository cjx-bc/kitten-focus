---
name: "小猫专注 (Kitten Focus)"
description: "Monochrome Companion Notebook — calm paper-and-ink order paired with rounded tabular focus numerals, restrained vermilion highlights, and a lively monochrome cat companion."
colors:
  pure-paper: "#ffffff"
  soft-mist: "#f5f5f5"
  ink-charcoal: "#222222"
  slate-muted: "#737378"
  surface-slate: "#66666b"
  hairline-chalk: "#eaeaea"
  field-mist: "#ececee"
  focus-slate: "#838388"
  signal-vermilion: "#ef4e36"
  alert-crimson: "#c13a25"
  blush-alert: "#fff1ef"
typography:
  display:
    fontFamily: "Nunito, sans-serif"
    fontSize: "clamp(72px, 22vw, 112px)"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "-0.065em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "clamp(24px, 7vw, 28px)"
    fontWeight: 750
    lineHeight: 1.3
    letterSpacing: "-0.04em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0em"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
    letterSpacing: "0em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0em"
rounded:
  field: "12px"
  segment: "14px"
  card: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  page: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink-charcoal}"
    textColor: "{colors.pure-paper}"
    rounded: "{rounded.pill}"
    padding: "13px 24px"
    height: "50px"
  button-secondary:
    backgroundColor: "{colors.soft-mist}"
    textColor: "{colors.ink-charcoal}"
    rounded: "{rounded.pill}"
    padding: "13px 24px"
    height: "50px"
  button-danger:
    backgroundColor: "{colors.blush-alert}"
    textColor: "{colors.alert-crimson}"
    rounded: "{rounded.pill}"
    padding: "13px 24px"
    height: "50px"
  card-surface:
    backgroundColor: "{colors.soft-mist}"
    textColor: "{colors.ink-charcoal}"
    rounded: "{rounded.card}"
    padding: "20px"
  input-default:
    backgroundColor: "{colors.soft-mist}"
    textColor: "{colors.ink-charcoal}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
    height: "48px"
  input-focused:
    backgroundColor: "{colors.pure-paper}"
    textColor: "{colors.ink-charcoal}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
    height: "48px"
  chip-default:
    backgroundColor: "{colors.soft-mist}"
    textColor: "{colors.ink-charcoal}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: "48px"
  chip-active:
    backgroundColor: "{colors.ink-charcoal}"
    textColor: "{colors.pure-paper}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
    height: "48px"
  sheet-dialog:
    backgroundColor: "{colors.pure-paper}"
    textColor: "{colors.ink-charcoal}"
    rounded: "{rounded.card}"
    padding: "20px 22px 26px"
  nav-tabbar:
    backgroundColor: "{colors.pure-paper}"
    textColor: "{colors.slate-muted}"
    height: "64px"
---

# Design System: 小猫专注 (Kitten Focus)

## Overview

**Creative North Star: "Monochrome Companion Notebook (黑白手帐与小猫)"**

Kitten Focus trades heavy productivity chrome for the calm clarity of an open monochrome notebook: generous pure-paper white space, soft neutral surfaces, rounded tabular timer numerals, and a restrained monochrome cat-head companion that lowers friction during personal focus sessions.

Strict restraint governs density, color, and motion across a light-only scheme (`24px` page padding, `16px` under `340px`), single primary actions, zero nested modal layers, zero decorative gradients, and calm status semantics that never impose red alerts on optional settings.

**Key Characteristics:**
- High-contrast monochrome surfaces (`#ffffff` canvas, `#f5f5f5` grouped cards, `#222222` ink) with whisper-thin `#eaeaea` hairlines.
- Bundled `Nunito` tabular numerals for timers and counts, paired with crisp system Chinese sans copy (`>= 12px` minimum).
- Soft `20px` card/sheet corners paired with full-pill buttons, switches, and chips backed by `>= 48px × 48px` hit targets.
- Tactile low-anxiety **Input Scheme A** focus styling and brief `150–220ms` transitions that disable cleanly under reduced motion.

## Colors

A light-only palette built on paper white, ink charcoal, dual-calibrated slate grays for AA legibility, and a strictly budgeted vermilion accent.

### Primary
- **Signal Vermilion** (`#ef4e36`): Used sparingly for active theme dots, unread update dots, peak chart highlights, and focal emphasis—never on input focus rings.
- **Alert Crimson** (`#c13a25`): Used for readable warning text, inline form errors, destructive actions, and genuinely required missing permissions (`5.39:1` on white).
- **Blush Alert** (`#fff1ef`): Tinted surface strictly reserved for destructive confirmation pills, error banners, and required-permission alerts.

### Neutral
- **Pure Paper** (`#ffffff`): Viewport canvas, modal sheets, focused fields, and secondary pills lifted onto `#f5f5f5` cards.
- **Soft Mist** (`#f5f5f5`): Grouped settings panels, summary cards, release preview blocks, secondary pills, segmented tracks, and resting inputs.
- **Ink Charcoal** (`#222222`): Primary copy, headings, active navigation icons, checked switches, active chips, and primary CTA capsules.
- **Slate Muted** (`#737378`): Captions and inactive tabbar icons directly on `#ffffff` Pure Paper (`4.72:1` AA).
- **Surface Slate** (`#66666b`): Captions, muted icons, and optional status labels inside `#f5f5f5` or `#fff1ef` cards (`5.24:1` AA).
- **Hairline Chalk** (`#eaeaea`): Internal settings row dividers, subtle borders, and chart grid hairlines.
- **Field Mist** (`#ececee`): Resting `1.5px` stroke around text, number, date, select, and textarea fields.
- **Focus Slate** (`#838388`): Focused input border and keyboard `:focus-visible` `2px` outline (`4px` offset).

### Named Rules
**The One-Accent Restraint Rule.** Signal Vermilion (`#ef4e36`) appears only on small focal indicators so black Ink Charcoal capsules stay the sole primary action anchor.
**The Dual-Slate AA Rule.** Secondary text on `#ffffff` uses Slate Muted (`#737378`), while secondary text inside `#f5f5f5` or `#fff1ef` surfaces MUST use Surface Slate (`#66666b`).
**The Zero-Panic Optionality Rule.** Recommended optional settings (such as `后台运行不限制`) avoid `#c13a25` / `#fff1ef`; ungranted items sit in calm Surface Slate (`#66666b`) and granted items show Ink Charcoal (`#222222`) with a check icon.

## Typography

**Display Font:** Offline bundled `Nunito` variable font (`Nunito, sans-serif`) for clocks, metrics, percentages, and file sizes.
**Body Font:** System UI Chinese sans stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif`) for labels and help copy.

**Character:** Rounded geometric numerals soften long focus timers while native sans keeps compact Android screens immediately legible.

### Hierarchy
- **Display** (`900`, `clamp(72px, 22vw, 112px)`, `1.2`, tracking `-0.065em`, `tabular-nums`): Centered focus/rest timer; compacts to `clamp(58px, 16vw, 83px)` for multi-hour clocks.
- **Headline** (`750`, `clamp(24px, 7vw, 28px)`, `1.3`, tracking `-0.04em`): Top-level tab page headings.
- **Title** (`700`, `20px`, `1.4`): Sheet headers, secondary page headings, and brand titles.
- **Body** (`400`, `15px` base / `14px` sheet / `13px` notes, `1.7`): Interface copy and `1.9` line-height long-form offline help.
- **Label** (`500`–`600`, `12px`–`13px`, `1.5`): Row subtitles, captions, badges, and chart axes (`>= 12px` everywhere).

### Named Rules
**The Tabular-Time Rule.** Every timer, metric readout, percentage, and package size uses `Nunito` with `tabular-nums` to prevent horizontal digit jitter.
**The 12px Legibility Floor Rule.** No visible text, chart axis label, timetable label, or status badge may fall below `12px`.

## Layout

Single-column vertical flow anchored by sticky bottom icon navigation across five main tabs (`/tasks`, `/calendar`, `/cat`, `/statistics`, `/settings`). Inline margins stay `24px` (`16px` below `340px`), centered in a `520px` max-width frame from `600px` upward, following a `4px / 8px` vertical rhythm (`4px` label gap, `8px`–`10px` card stack, `16px` group spacing, `24px` section separation).

Three-tier disclosure keeps everyday workflows simple: Tier 1 primary tabs allow `<= 1` primary CTA, `<= 4` first-glance decision groups, and zero telemetry; Tier 2 settings, Study Mode, and launch update sheets use single-layer inline steps; Tier 3 (`/permissions`, `/help`, `/recovery`, `/emergency`) holds diagnostics and multi-brand instructions.

## Elevation & Depth

Surfaces separate through tonal stepping (`#ffffff` vs `#f5f5f5`) and `1px` hairlines (`#eaeaea`) rather than drop shadows. Cards remain flat at rest; ambient shadow is restricted to floating modal dialogs, the desktop frame, and switch thumbs.

### Shadow Vocabulary
- **Sheet Modal Depth** (`box-shadow: 0 20px 80px rgba(0, 0, 0, 0.133)`): Lifts centered modal sheets over a `#00000055` backdrop.
- **Desktop Frame Hairline** (`box-shadow: 0 0 0 1px #e7e7e7, 0 20px 80px rgba(0, 0, 0, 0.031)`): Frames the `520px` centered app column on wide screens.
- **Switch Thumb Elevation** (`box-shadow: 0 1px 3px rgba(0, 0, 0, 0.141)`): Defines circular toggle thumbs over muted tracks.

### Named Rules
**The Tonal-First Flatness Rule.** At rest inside a page flow, cards, list groups, notices, and navigation bars rely purely on background stepping and `#eaeaea` hairlines—never drop shadows or gradients.

## Shapes

Geometry pairs soft rectangular containers with pill controls:
- **Cards, Notices, Diagnostics & Sheets**: Uniform `20px` radius (`--radius`), zero nested cards, and white bordered secondary pills when nested inside `#f5f5f5`.
- **Buttons, Chips, Switches & Toasts**: Full capsule corners (`999px`) with `>= 48px × 48px` minimum hit targets.
- **Fields & Segmented Tracks**: Grounded `12px` field corners and `14px` outer segmented tracks holding `11px` active pills.
- **Icons & Mascot**: Consistent `1.8`-stroke Lucide line icons (`2.4` when active in tabbar) alongside the monochrome cat-head emblem (squircle `22%` corner radius) and single-stage 1000ms splash wink (`~320ms` calm eye-contact pause before winking).

## Components

### Buttons
- **Shape**: Full pill (`999px`), `>= 50px` primary/secondary height (`>= 48px` text links/icon buttons), `600` weight (`15px`).
- **Primary**: `#222222` background, `#ffffff` text, `120ms` active dim (`opacity: 0.65`); strictly `<= 1` per screen/sheet.
- **Secondary & Danger**: `#f5f5f5` with `#222222` text (automatically lifted to `#ffffff` + `1px solid #eaeaea` border inside `#f5f5f5` cards); destructive actions use `#fff1ef` + `#c13a25`; quiet actions (`稍后再说`) use borderless `48px`-tall text links.

### Chips
- **Style**: Pill capsule (`999px`), `10px 16px` padding, `48px` minimum dimensions, `#f5f5f5` background with `#222222` `13px` label.
- **State**: Active selection flips crisply to `#222222` fill and `#ffffff` text without resizing.

### Cards / Containers
- **Style**: `20px` radius, flat `#f5f5f5` fill, `20px` padding (`16px 18px` compact cards, `0 17px` settings groups with `50px` rows separated by `1px solid #eaeaea`).

### Inputs / Fields (Input Scheme A)
- **Style**: `#f5f5f5` fill, `1.5px solid #ececee` border, `12px` radius, `>= 48px` height.
- **Focus**: Transitions to `#ffffff` fill and `1.5px solid #838388` border at identical dimensions with zero coral focus glow; non-text focus rings use `2px solid #838388` at `4px` offset.

### Navigation & Single-Layer Sheets
- Five-tab icon-only bar (`60–64px` + bottom inset, `#737378` resting / `#222222` `2.4`-stroke active, `aria-label`, optional `6px` `#ef4e36` update dot).
- Centered `<dialog>` overlays (`max-width: 496px`, `20px` radius, sticky header with optional back step, `180ms` enter / `120ms` leave) reusing one active modal at a time.

### Signature Components
- **Monochrome Cat Splash**: Pure `#ffffff` native launch screen with monochrome cat-head wink and `专注此刻，陪小猫一起长大` tagline, fading cleanly into the web shell without a second splash screen.
- **Calm Permission & Release Cards**: Soft Mist containers pairing plain subtitles with neutral slate/charcoal state labels, background download hiding (`收起，后台继续下载`), and Option A per-version dismissal.

## Do's and Don'ts

### Do:
- **Do** preserve pure `20px` corners across every card, notice, diagnostic disclosure, and dialog sheet, paired with `>= 48px × 48px` hit targets and `>= 12px` typography.
- **Do** use Surface Slate (`#66666b`) rather than Slate Muted (`#737378`) whenever muted copy, icons, or quiet buttons sit inside a `#f5f5f5` card or `#fff1ef` banner, maintaining `>= 4.5:1` contrast.
- **Do** pair white-bordered secondary capsules (`#ffffff` fill + `1px solid #eaeaea`) whenever a secondary CTA sits inside a `#f5f5f5` card or permission card.
- **Do** reuse the single open modal container with inline view transitions and confirm strips so at most one native `<dialog>` is open at any time.
- **Do** format every timer, metric, package size, and progress percentage in `Nunito` with `tabular-nums`, and guard all transitions/animations behind reduced-motion rules.

### Don't:
- **Don't** place more than 1 primary CTA or more than 4 first-glance decision controls on any screen or sheet, and never expose engineering telemetry on Tier 1 home views.
- **Don't** use red warning colors (`#ef4e36` / `#c13a25` / `#fff1ef`), warning triangles, or blocking dialogs on optional recommendations like battery optimization exemption (`后台运行不限制`) or version updates.
- **Don't** use single-sided colored left border stripes, nested cards-inside-cards, decorative color gradients, emoji placeholders in place of Lucide line icons, or eyebrows/kickers above headings.
- **Don't** render focus glow outlines in `#ef4e36` on text/select/date inputs; follow Input Scheme A (`#f5f5f5`/`#ececee` -> `#ffffff`/`#838388`) with unchanged box dimensions.
- **Don't** introduce dark-theme toggles, fake Android immunity claims (`防强停`/`防卸载`), or forbidden glossary copy (`番茄钟`, `待办完成`, `本次专注已完成`) into any surface.
