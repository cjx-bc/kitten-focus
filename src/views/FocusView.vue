<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import type { FocusItem, Mode, WhiteNoiseId } from '../domain/model'
import { timer, duration } from '../domain/dates'
import { REGRET_WINDOW_MS } from '../domain/focus'
import { getAnimalMeta } from '../domain/pet'
import { resolveRestDurationMs } from '../domain/rest'
import { studyCapsuleDisplay } from '../domain/protectionDisplay'
import { isStudySessionLocked } from '../navigation/mainEntry'
import { protectionDriver } from '../platform/bridge'
import {
  WHITE_NOISE_TRACKS,
  clampWhiteNoiseVolume,
  normalizeWhiteNoiseId,
  setWhiteNoiseLiveVolume,
  syncWhiteNoisePlayback,
} from '../platform/whiteNoise'
import type { ProtectionStatus } from '../domain/model'
import Icon from '../components/Icon.vue'
import PetGraphic from '../components/PetGraphic.vue'
import PetPickerSheet from '../components/PetPickerSheet.vue'
import Sheet from '../components/Sheet.vue'
import { waitForDialogClose } from '../components/sheetClose'
import StudyModeSheet from '../components/StudyModeSheet.vue'
import {
  classifyStartError,
  getUnreadyProtectionIds,
  isCancelledStartError,
  type StartErrorKind,
} from '../domain/startRecovery'

type FocusSheet = 'tasks' | 'whiteNoise' | 'safety' | 'endConfirm' | 'startError' | null

const PET_BUBBLES = ['今天也要加油！', '喵～陪你专注', '稳住节奏！', '写完这轮就休息～'] as const
const INTERRUPT_CHIPS = ['回消息', '刷视频', '临时有事', '走神了'] as const
const QUICK_MINUTES = [15, 25, 45, 60] as const
const DRAG_STEP_PX = 18

const app = useApp(),
  router = useRouter(),
  busy = ref(false),
  focusSheet = ref<FocusSheet>(null),
  petOpen = ref(false),
  studyOpen = ref(false),
  studyInitialView = ref<'home' | 'permissions'>('home'),
  pendingFinishSessionId = ref<string | null>(null),
  startError = ref<{
    message: string
    kind: StartErrorKind
    item: FocusItem | null
    mode?: Mode
    minutes?: number
  } | null>(null),
  protectionState = ref<ProtectionStatus | null>(null)

let protectionRevision = 0

// Standby state
const standbyMode = ref<Mode>('countdown')
const standbyMinutes = ref<number>(25)
const petBouncing = ref(false)
const petBubble = ref('')
let bounceTimer: ReturnType<typeof setTimeout> | undefined
let bubbleTimer: ReturnType<typeof setTimeout> | undefined

// Note draft on settlement
const noteDraft = ref('')

const defaultMinutes = computed(() => app.data.preferences.defaultMinutes || 25)
const restMinutes = computed(() =>
  Math.round(resolveRestDurationMs(app.data.preferences.restMinutes) / 60_000),
)
const selectedItem = computed<FocusItem | null>(() => {
  const id = app.data.pet?.lastSelectedItemId
  if (!id) return null
  return app.items.find((i) => i.id === id) ?? null
})

watch(
  [selectedItem, defaultMinutes],
  ([item, defMin]) => {
    if (item) {
      standbyMode.value = item.mode
      standbyMinutes.value = Math.min(180, Math.max(5, item.minutes || defMin))
    } else {
      standbyMode.value = 'countdown'
      standbyMinutes.value = Math.min(180, Math.max(5, defMin))
    }
  },
  { immediate: true },
)

const isRandomCompanion = computed(() => app.data.pet?.selectedAnimalId === 'random')
const standbyAnimalId = computed(() => {
  const sel = app.data.pet?.selectedAnimalId
  if (sel && sel !== 'random' && app.petProjection.unlockedAnimals.includes(sel)) return sel
  return 'black-cat'
})
const standbySkinId = computed(() => {
  const id = standbyAnimalId.value
  const skin = app.data.pet?.selectedSkins?.[id]
  const unlocked = app.petProjection.unlockedSkins[id] ?? ['default']
  return skin && unlocked.includes(skin) ? skin : 'default'
})
const standbyAnimalMeta = computed(() => getAnimalMeta(standbyAnimalId.value))

const studyCapsule = computed(() =>
  studyCapsuleDisplay(app.data.preferences.protection, protectionState.value),
)
const studyCapsuleAriaLabel = computed(() => {
  if (studyCapsule.value.tone === 'warning') return '学霸模式待授权，点击处理权限'
  return studyCapsule.value.masterOn ? '学霸模式已开启，点击配置或关闭' : '学霸模式未开启，点击开启或配置'
})

async function refreshProtection() {
  const rev = ++protectionRevision
  try {
    const value = await protectionDriver.status()
    if (rev === protectionRevision) protectionState.value = value
  } catch {
    if (rev === protectionRevision) protectionState.value = null
  }
}

function openStudyFromCapsule() {
  if (busy.value || focusSheet.value !== null || petOpen.value) return
  studyInitialView.value = studyCapsule.value.tone === 'warning' ? 'permissions' : 'home'
  studyOpen.value = true
}

function openPetPicker() {
  if (busy.value || focusSheet.value !== null || studyOpen.value) return
  petOpen.value = true
}

onMounted(() => {
  void refreshProtection()
  document.addEventListener('visibilitychange', onVisibilityRefresh)
  window.addEventListener('protection-recovered', onVisibilityRefresh)
})
onBeforeUnmount(() => {
  protectionRevision++
  clearTimeout(bounceTimer)
  clearTimeout(bubbleTimer)
  clearTimeout(whiteNoiseSaveTimer)
  document.removeEventListener('visibilitychange', onVisibilityRefresh)
  window.removeEventListener('protection-recovered', onVisibilityRefresh)
})
function onVisibilityRefresh() {
  if (!document.hidden) void refreshProtection()
}
watch([() => app.data.preferences.protection, () => studyOpen.value], refreshProtection)

const session = computed(() => app.focus.session),
  studyLocked = computed(() => isStudySessionLocked(session.value)),
  strict = computed(() => session.value?.mode === 'countdown' && session.value.strictMode === true),
  result = computed(() => app.lastResult),
  canRest = computed(() =>
    Boolean(result.value && result.value.status === 'completed' && result.value.durationMs > 0),
  ),
  inRegretWindow = computed(() => Boolean(session.value && app.focus.elapsedMs < REGRET_WINDOW_MS)),
  display = computed(() =>
    session.value?.mode === 'countdown'
      ? Math.max(0, session.value.targetMs - app.focus.elapsedMs)
      : app.focus.elapsedMs,
  ),
  reducedMotionPref = computed(() => app.data.preferences.animation === 'off'),
  runningPetStage = computed<1 | 2 | 3>(() => {
    const s = session.value
    if (!s) return 1
    if (s.mode === 'countdown') {
      const p = s.targetMs > 0 ? app.focus.elapsedMs / s.targetMs : 0
      return p < 0.33 ? 1 : p < 0.75 ? 2 : 3
    }
    const ms = app.focus.elapsedMs
    return ms < 8 * 60_000 ? 1 : ms < 20 * 60_000 ? 2 : 3
  })

const resultEffect = computed(() =>
  result.value ? app.petProjection.recordEffects.get(result.value.id) : undefined,
)
const resultAnimalMeta = computed(() => getAnimalMeta(result.value?.animalId ?? 'black-cat'))

watch(
  () => result.value?.id,
  () => {
    noteDraft.value = result.value?.note ?? ''
  },
  { immediate: true },
)

const focusSheetTitle = computed(() => {
  if (focusSheet.value === 'tasks') return '选择专注事项'
  if (focusSheet.value === 'whiteNoise') return '白噪音'
  if (focusSheet.value === 'safety') return '专注辅助与安全出口'
  if (focusSheet.value === 'endConfirm') return '结束本次专注？'
  if (focusSheet.value === 'startError') return '无法开始专注'
  return ''
})

// White noise preferences & live volume control
const whiteNoiseTrack = computed<WhiteNoiseId>(() =>
  normalizeWhiteNoiseId(app.data.preferences.whiteNoise),
)
const storedWhiteNoiseVolume = computed(() =>
  clampWhiteNoiseVolume(app.data.preferences.whiteNoiseVolume),
)
const whiteNoiseVolumeDraft = ref<number | null>(null)
let whiteNoiseSaveTimer: ReturnType<typeof setTimeout> | undefined

watch(storedWhiteNoiseVolume, (next) => {
  if (whiteNoiseVolumeDraft.value !== null && Math.abs(whiteNoiseVolumeDraft.value - next) < 0.005) {
    whiteNoiseVolumeDraft.value = null
  }
})

const whiteNoiseVolume = computed(() => whiteNoiseVolumeDraft.value ?? storedWhiteNoiseVolume.value)
const whiteNoisePercent = computed(() => Math.round(whiteNoiseVolume.value * 100))

async function selectWhiteNoise(trackId: WhiteNoiseId) {
  if (busy.value) return
  try {
    await app.mutate((d) => {
      d.preferences.whiteNoise = trackId
      if (d.preferences.whiteNoiseVolume === undefined) {
        d.preferences.whiteNoiseVolume = clampWhiteNoiseVolume(whiteNoiseVolumeDraft.value ?? undefined)
      }
    })
    await syncWhiteNoisePlayback(
      {
        track: trackId,
        volume: clampWhiteNoiseVolume(app.data.preferences.whiteNoiseVolume),
        hasActiveFocus: Boolean(app.focus.session),
        sessionState: app.focus.session?.state ?? null,
      },
      true,
    )
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}

async function flushWhiteNoiseVolume() {
  clearTimeout(whiteNoiseSaveTimer)
  whiteNoiseSaveTimer = undefined
  const draft = whiteNoiseVolumeDraft.value
  if (draft === null) return
  const clamped = Math.round(clampWhiteNoiseVolume(draft) * 100) / 100
  whiteNoiseVolumeDraft.value = null
  if (Math.abs(clamped - storedWhiteNoiseVolume.value) < 0.005 && app.data.preferences.whiteNoiseVolume !== undefined) {
    return
  }
  try {
    await app.mutate((d) => {
      d.preferences.whiteNoiseVolume = clamped
    })
    await syncWhiteNoisePlayback(
      {
        track: whiteNoiseTrack.value,
        volume: clamped,
        hasActiveFocus: Boolean(app.focus.session),
        sessionState: app.focus.session?.state ?? null,
      },
      true,
    )
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}

function onWhiteNoiseVolumeInput(e: Event) {
  const pct = Number((e.target as HTMLInputElement).value)
  const vol = clampWhiteNoiseVolume(Number.isFinite(pct) ? pct / 100 : undefined)
  whiteNoiseVolumeDraft.value = vol
  setWhiteNoiseLiveVolume(vol)
  clearTimeout(whiteNoiseSaveTimer)
  whiteNoiseSaveTimer = setTimeout(() => {
    void flushWhiteNoiseVolume()
  }, 80)
}

function onWhiteNoiseVolumeChange() {
  void flushWhiteNoiseVolume()
}

const safetyRoutes = [
  { path: '/emergency', label: '紧急与必要交互（拨号/急救/输入法）' },
  { path: '/recovery', label: '故障恢复（撤销本轮保护，保留计时）' },
  { path: '/permissions', label: '权限与保护状态' },
  { path: '/help', label: '使用帮助' },
] as const

function closeFocusSheet() {
  if (busy.value) return
  if (focusSheet.value === 'whiteNoise') {
    void flushWhiteNoiseVolume()
  }
  focusSheet.value = null
  pendingFinishSessionId.value = null
  startError.value = null
}

// Standby interactions
function onPetTap() {
  petBouncing.value = false
  clearTimeout(bounceTimer)
  clearTimeout(bubbleTimer)
  requestAnimationFrame(() => {
    petBouncing.value = true
  })
  bounceTimer = setTimeout(() => {
    petBouncing.value = false
  }, 320)
  const next = PET_BUBBLES[Math.floor(Math.random() * PET_BUBBLES.length)] ?? PET_BUBBLES[0]
  petBubble.value = next
  bubbleTimer = setTimeout(() => {
    petBubble.value = ''
  }, 2200)
}

function vibrateStep() {
  if (
    app.data.preferences.vibration &&
    typeof navigator !== 'undefined' &&
    'vibrate' in navigator &&
    (navigator.userActivation?.hasBeenActive ?? true)
  ) {
    try {
      navigator.vibrate(8)
    } catch {}
  }
}

function stepDuration(steps: number) {
  if (!steps) return
  let mode = standbyMode.value
  let mins = standbyMinutes.value
  const dir = steps > 0 ? 1 : -1
  for (let i = 0; i < Math.abs(steps); i++) {
    if (dir > 0) {
      if (mode === 'stopwatch') {
        mode = 'countdown'
        mins = 5
      } else {
        mins = Math.min(180, mins + 5)
      }
    } else {
      if (mode === 'countdown') {
        if (mins <= 5) {
          mode = 'stopwatch'
          mins = 5
        } else {
          mins = Math.max(5, mins - 5)
        }
      }
    }
  }
  if (mode !== standbyMode.value || mins !== standbyMinutes.value) {
    standbyMode.value = mode
    standbyMinutes.value = mins
    vibrateStep()
  }
}

function setQuickMinutes(mins: number) {
  standbyMode.value = 'countdown'
  standbyMinutes.value = mins
  vibrateStep()
}

function setStopwatchMode() {
  standbyMode.value = 'stopwatch'
  vibrateStep()
}

// Clock drag gesture (isolated from tabSwipe via data-tab-swipe-ignore)
let dragKind: 'touch' | 'mouse' | null = null
let dragStartX = 0
let dragStartY = 0
let dragConsumed = 0

function beginClockDrag(kind: 'touch' | 'mouse', x: number, y: number) {
  dragKind = kind
  dragStartX = x
  dragStartY = y
  dragConsumed = 0
}
function moveClockDrag(x: number, y: number) {
  if (!dragKind) return
  const dx = x - dragStartX
  const dy = y - dragStartY
  const axisDelta = Math.abs(dx) > Math.abs(dy) ? dx : -dy
  const steps = Math.trunc((axisDelta - dragConsumed) / DRAG_STEP_PX)
  if (steps !== 0) {
    dragConsumed += steps * DRAG_STEP_PX
    stepDuration(steps)
  }
}
function endClockDrag() {
  dragKind = null
}

function onClockTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  if (!t) return
  e.stopPropagation()
  beginClockDrag('touch', t.clientX, t.clientY)
}
function onClockTouchMove(e: TouchEvent) {
  if (dragKind !== 'touch') return
  const t = e.touches[0]
  if (!t) return
  e.stopPropagation()
  if (e.cancelable) e.preventDefault()
  moveClockDrag(t.clientX, t.clientY)
}
function onClockTouchEnd(e: TouchEvent) {
  if (dragKind !== 'touch') return
  e.stopPropagation()
  endClockDrag()
}
function onClockPointerDown(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  e.stopPropagation()
  ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
  beginClockDrag('mouse', e.clientX, e.clientY)
}
function onClockPointerMove(e: PointerEvent) {
  if (dragKind !== 'mouse') return
  moveClockDrag(e.clientX, e.clientY)
}
function onClockPointerUp() {
  if (dragKind !== 'mouse') return
  endClockDrag()
}
function onClockKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
    e.preventDefault()
    stepDuration(1)
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
    e.preventDefault()
    stepDuration(-1)
  }
}

async function chooseStandbyItem(item: FocusItem | null) {
  focusSheet.value = null
  try {
    await app.selectStandbyItem(item?.id ?? null)
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}

async function quickStartItem(item: FocusItem | null) {
  if (busy.value) return
  focusSheet.value = null
  await waitForDialogClose()
  await app.selectStandbyItem(item?.id ?? null).catch(() => {})
  const mode = item ? item.mode : 'countdown'
  const mins = item ? item.minutes : defaultMinutes.value
  await startFocusSession(item, mode, mins)
}

async function goManageTasks() {
  focusSheet.value = null
  await waitForDialogClose()
  await router.push('/tasks')
}

async function startStandbyFocus() {
  await startFocusSession(selectedItem.value, standbyMode.value, standbyMinutes.value)
}

async function startFocusSessionInner(item: FocusItem | null, mode: Mode, minutes: number) {
  try {
    await app.start(item, mode, minutes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!isCancelledStartError(message)) {
      startError.value = { message, kind: classifyStartError(message), item, mode, minutes }
      focusSheet.value = 'startError'
    }
  }
}

async function startFocusSession(item: FocusItem | null, mode: Mode, minutes: number) {
  if (busy.value) return
  busy.value = true
  try {
    await startFocusSessionInner(item, mode, minutes)
  } finally {
    busy.value = false
  }
}

// Running / paused actions
function onBackClick() {
  if (studyLocked.value) {
    app.notify('学霸模式进行中，结束后可返回')
    return
  }
  void router.replace('/tasks')
}

async function toggle() {
  busy.value = true
  try {
    await app.action(session.value?.state === 'paused' ? 'resume' : 'pause')
  } catch (e) {
    app.notify(String(e))
  } finally {
    busy.value = false
  }
}

async function cancelFocus() {
  if (strict.value || busy.value) return
  busy.value = true
  try {
    await app.action('cancel')
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

function finish() {
  const sessionId = session.value?.id
  if (!sessionId || strict.value || busy.value) return
  pendingFinishSessionId.value = sessionId
  focusSheet.value = 'endConfirm'
}

async function confirmFinish() {
  const sessionId = pendingFinishSessionId.value
  if (!sessionId || session.value?.id !== sessionId || strict.value || busy.value) {
    focusSheet.value = null
    pendingFinishSessionId.value = null
    return
  }
  busy.value = true
  try {
    await app.action('finish')
    focusSheet.value = null
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
    focusSheet.value = null
  } finally {
    busy.value = false
    pendingFinishSessionId.value = null
  }
}

// Left-swipe give-up track
const giveupOffsetPx = ref(0)
const giveupTrackRef = ref<HTMLElement | null>(null)
let giveupDrag: 'touch' | 'mouse' | null = null
let giveupStartX = 0
let giveupMoved = false

function giveupMaxOffset(): number {
  const w = giveupTrackRef.value?.clientWidth ?? 220
  return Math.max(100, w - 60)
}
function startGiveup(kind: 'touch' | 'mouse', x: number) {
  if (busy.value || strict.value) return
  giveupDrag = kind
  giveupStartX = x
  giveupMoved = false
  giveupOffsetPx.value = 0
}
function moveGiveup(x: number) {
  if (!giveupDrag) return
  const dx = Math.min(0, x - giveupStartX)
  if (Math.abs(dx) > 6) giveupMoved = true
  const max = giveupMaxOffset()
  giveupOffsetPx.value = Math.max(-max, dx)
}
async function endGiveup() {
  if (!giveupDrag) return
  const offset = giveupOffsetPx.value
  const threshold = giveupMaxOffset() * 0.65
  const wasMoved = giveupMoved
  giveupDrag = null
  giveupOffsetPx.value = 0
  if (wasMoved && Math.abs(offset) >= threshold && !busy.value && !strict.value) {
    busy.value = true
    try {
      await app.action('finish')
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e))
    } finally {
      busy.value = false
    }
  }
}
function onGiveupTouchStart(e: TouchEvent) {
  const t = e.touches[0]
  if (!t) return
  e.stopPropagation()
  startGiveup('touch', t.clientX)
}
function onGiveupTouchMove(e: TouchEvent) {
  if (giveupDrag !== 'touch') return
  const t = e.touches[0]
  if (!t) return
  e.stopPropagation()
  if (e.cancelable) e.preventDefault()
  moveGiveup(t.clientX)
}
function onGiveupTouchEnd(e: TouchEvent) {
  if (giveupDrag !== 'touch') return
  e.stopPropagation()
  void endGiveup()
}
function onGiveupPointerDown(e: PointerEvent) {
  if (e.pointerType === 'touch') return
  e.stopPropagation()
  startGiveup('mouse', e.clientX)
}
function onGiveupPointerMove(e: PointerEvent) {
  if (giveupDrag !== 'mouse') return
  if (!giveupMoved && Math.abs(e.clientX - giveupStartX) > 6) {
    try {
      ;(e.currentTarget as HTMLElement | null)?.setPointerCapture?.(e.pointerId)
    } catch {}
  }
  moveGiveup(e.clientX)
}
function onGiveupPointerUp() {
  if (giveupDrag !== 'mouse') return
  void endGiveup()
}

// Settlement actions
function onNoteInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  const chars = [...val]
  noteDraft.value = chars.length > 100 ? chars.slice(0, 100).join('') : val
}

async function saveNoteIfChanged() {
  const rec = result.value
  if (!rec) return
  const next = [...noteDraft.value].slice(0, 100).join('')
  if ((rec.note ?? '') === next) return
  try {
    await app.updateRecordNote(rec.id, next)
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}

async function pickInterruptChip(chip: string) {
  noteDraft.value = chip
  await saveNoteIfChanged()
}

const autoRestPending = computed(() =>
  Boolean(
    result.value &&
      app.rest.session?.state === 'running' &&
      app.rest.session.record.id === result.value.id,
  ),
)

async function backHome() {
  await saveNoteIfChanged()
  if (autoRestPending.value) {
    await app.exitRest()
  }
  app.dismissResult()
}

async function goSafety(path: string) {
  if (busy.value) return
  focusSheet.value = null
  await waitForDialogClose()
  await router.push(path)
}

async function again() {
  const previous = result.value
  if (!previous || busy.value) return
  busy.value = true
  try {
    const trimmed = [...noteDraft.value].slice(0, 100).join('')
    if ((previous.note ?? '') !== trimmed) {
      await saveNoteIfChanged()
    }
    const item = app.items.find((i) => i.id === previous.itemId) || null
    await startFocusSessionInner(item, previous.mode, previous.targetMs / 60000)
  } finally {
    busy.value = false
  }
}

async function goRecoveryFromStartError() {
  if (busy.value) return
  focusSheet.value = null
  startError.value = null
  await waitForDialogClose()
  await router.push('/recovery')
}

async function openStudyFromStartError() {
  if (busy.value) return
  focusSheet.value = null
  startError.value = null
  await waitForDialogClose()
  studyInitialView.value = 'permissions'
  studyOpen.value = true
}

async function clearUnreadyAndRetry() {
  const pending = startError.value
  if (!pending || busy.value) return
  busy.value = true
  try {
    const ids = await getUnreadyProtectionIds(app.data.preferences.protection)
    if (!ids.length) {
      focusSheet.value = null
      startError.value = null
      await waitForDialogClose()
      studyInitialView.value = 'permissions'
      studyOpen.value = true
      return
    }
    await app.clearUnreadyProtections(ids, true)
    focusSheet.value = null
    startError.value = null
    await waitForDialogClose()
    busy.value = false
    await startFocusSession(pending.item, pending.mode ?? 'countdown', pending.minutes ?? defaultMinutes.value)
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

async function rest() {
  if (busy.value) return
  await saveNoteIfChanged()
  if (autoRestPending.value) {
    await router.replace('/rest')
    return
  }
  busy.value = true
  try {
    await app.startRest()
    await router.replace('/rest')
  } catch (error) {
    app.notify(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="focus-page" :class="{ standby: !session && !result }">
    <!-- Running / Paused Header -->
    <header v-if="session" class="focus-header">
      <button
        type="button"
        class="icon-button"
        :aria-label="studyLocked ? '学霸模式进行中，专注页已锁定' : '返回待办，保持计时'"
        @click="onBackClick"
      >
        <Icon :name="studyLocked ? 'lock' : 'back'" />
      </button>
      <span class="focus-header-title">{{
        session.themeId && session.themeName ? session.themeName : '小猫专注'
      }}</span>
      <div class="header-tools" data-decision-group>
        <button
          type="button"
          class="icon-button soft white-noise-trigger"
          :class="{ active: whiteNoiseTrack !== 'off' }"
          aria-label="白噪音"
          aria-haspopup="dialog"
          :aria-expanded="focusSheet === 'whiteNoise'"
          @click="focusSheet = 'whiteNoise'"
        >
          <Icon name="music" :size="20" />
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label="专注辅助与安全出口"
          aria-haspopup="dialog"
          :aria-expanded="focusSheet === 'safety'"
          @click="focusSheet = 'safety'"
        >
          <Icon name="more" />
        </button>
      </div>
    </header>

    <!-- Standby Header -->
    <header v-else-if="!result" class="focus-header standby-header">
      <button
        type="button"
        class="task-pill"
        aria-haspopup="dialog"
        :aria-expanded="focusSheet === 'tasks'"
        @click="focusSheet = 'tasks'"
      >
        <span class="task-pill-label">{{ selectedItem ? selectedItem.title : '自由专注' }}</span>
        <Icon name="down" :size="15" />
      </button>
      <div class="header-tools" data-decision-group>
        <button
          type="button"
          class="study-capsule"
          :data-tone="studyCapsule.tone"
          :aria-label="studyCapsuleAriaLabel"
          aria-haspopup="dialog"
          :aria-expanded="studyOpen"
          :disabled="busy"
          @click="openStudyFromCapsule"
        >
          <Icon name="shield" :size="15" class="study-shield" />
          <span class="study-label">{{ studyCapsule.text }}</span>
          <Icon name="right" :size="14" class="study-chevron" />
        </button>
        <button
          type="button"
          class="icon-button soft white-noise-trigger"
          :class="{ active: whiteNoiseTrack !== 'off' }"
          aria-label="白噪音"
          aria-haspopup="dialog"
          :aria-expanded="focusSheet === 'whiteNoise'"
          @click="focusSheet = 'whiteNoise'"
        >
          <Icon name="music" :size="20" />
        </button>
      </div>
    </header>

    <!-- Running / Paused Body -->
    <template v-if="session">
      <div class="focus-center">
        <PetGraphic
          :animal-id="session.animalId ?? 'black-cat'"
          :skin-id="session.skinId ?? 'default'"
          :stage="runningPetStage"
          :size="116"
          :reduced-motion="reducedMotionPref"
        />
        <div class="focus-mode">
          {{ session.mode === 'countdown' ? '倒计时专注' : '正计时专注' }}
        </div>
        <div class="focus-clock number" :class="{ 'long-clock': display >= 3600000 }">
          {{ timer(display) }}
        </div>
        <div class="focus-name">{{ session.title }}</div>
        <p class="focus-status">
          <span v-if="session.state === 'running'" class="status-dot" />{{
            session.state === 'paused' ? '已暂停' : '专注进行中'
          }}
        </p>
      </div>
      <div class="focus-bottom">
        <p v-if="strict">严格倒计时 · 不能暂停或提前结束</p>
        <div v-else-if="inRegretWindow" class="focus-controls">
          <button
            type="button"
            class="secondary cancel-control"
            :disabled="busy"
            @click="cancelFocus"
          >
            取消
          </button>
          <button
            type="button"
            class="pause-control"
            data-ux-role="primary-cta"
            :aria-label="session.state === 'paused' ? '继续专注' : '暂停专注'"
            :disabled="busy"
            @click="toggle"
          >
            <Icon :name="session.state === 'paused' ? 'play' : 'pause'" :size="32" />
          </button>
        </div>
        <div v-else-if="session.mode === 'countdown'" class="focus-controls countdown-controls">
          <div
            ref="giveupTrackRef"
            class="giveup-track"
            data-tab-swipe-ignore
            @touchstart.passive="onGiveupTouchStart"
            @touchmove="onGiveupTouchMove"
            @touchend="onGiveupTouchEnd"
            @touchcancel="onGiveupTouchEnd"
            @pointerdown="onGiveupPointerDown"
            @pointermove="onGiveupPointerMove"
            @pointerup="onGiveupPointerUp"
            @pointercancel="onGiveupPointerUp"
          >
            <span class="giveup-label">« 左滑放弃</span>
            <button
              type="button"
              class="giveup-thumb"
              aria-label="放弃专注"
              :disabled="busy"
              :style="{ transform: `translateX(${giveupOffsetPx}px)` }"
              @click.stop="finish"
            >
              <Icon name="left" :size="20" />
            </button>
          </div>
          <button
            type="button"
            class="pause-control"
            data-ux-role="primary-cta"
            :aria-label="session.state === 'paused' ? '继续专注' : '暂停专注'"
            :disabled="busy"
            @click="toggle"
          >
            <Icon :name="session.state === 'paused' ? 'play' : 'pause'" :size="32" />
          </button>
        </div>
        <div v-else class="focus-controls">
          <button
            type="button"
            class="pause-control"
            data-ux-role="primary-cta"
            :aria-label="session.state === 'paused' ? '继续专注' : '暂停专注'"
            :disabled="busy"
            @click="toggle"
          >
            <Icon :name="session.state === 'paused' ? 'play' : 'pause'" :size="32" />
          </button>
          <button
            type="button"
            class="end-control"
            aria-label="结束专注"
            :disabled="busy"
            @click="finish"
          >
            <Icon name="stop" :size="24" />
          </button>
        </div>
      </div>
    </template>

    <!-- Settlement Screen -->
    <template v-else-if="result">
      <div class="focus-result">
        <PetGraphic
          :animal-id="result.animalId ?? 'black-cat'"
          :skin-id="result.skinId ?? 'default'"
          :stage="result.status === 'completed' ? 3 : result.status === 'early' ? 'failed' : 'standby'"
          :size="116"
          :reduced-motion="reducedMotionPref"
        />
        <h1>
          {{
            result.status === 'completed'
              ? '本次专注正常结束'
              : result.status === 'early'
                ? resultAnimalMeta.failTitle
                : '专注已中断'
          }}
        </h1>
        <p v-if="result.status === 'early' && result.failReason === 'left_app'" class="muted">
          离开专注太久，没能救回来
        </p>
        <p class="muted">{{ result.title }}</p>
        <div class="result-duration number">{{ duration(result.durationMs) }}</div>
        <p class="muted">实际专注时长</p>
        <p v-if="result.status === 'completed' && resultEffect && resultEffect.litter > 0" class="result-pet-reward">
          好感 +{{ resultEffect.affectionDelta }} · 农场 +{{ resultEffect.litter }} 只
        </p>
        <p v-else-if="result.status === 'early'" class="result-pet-penalty">
          好感 -5
        </p>

        <div v-if="result.status !== 'interrupted'" class="note-box">
          <div class="note-input-row">
            <input
              :value="noteDraft"
              type="text"
              :aria-label="result.status === 'early' ? '打断原因' : '复盘小结'"
              :placeholder="result.status === 'early' ? '记一句打断原因' : '写一句复盘小结'"
              @input="onNoteInput"
              @blur="saveNoteIfChanged"
              @keydown.enter.prevent="saveNoteIfChanged"
            />
            <span class="note-count number">{{ [...noteDraft].length }}/100</span>
          </div>
          <div v-if="result.status === 'early'" class="chip-row note-chips">
            <button
              v-for="chip in INTERRUPT_CHIPS"
              :key="chip"
              type="button"
              class="chip"
              :class="{ active: noteDraft === chip }"
              @click="pickInterruptChip(chip)"
            >
              {{ chip }}
            </button>
          </div>
        </div>

        <template v-if="canRest">
          <p v-if="autoRestPending" class="muted">即将自动进入 {{ restMinutes }} 分钟休息…</p>
          <button type="button" class="primary wide" :disabled="busy" @click="rest">
            <Icon name="clock" :size="18" />休息 {{ restMinutes }} 分钟
          </button>
          <div class="result-secondary-actions">
            <button type="button" class="text-button" :disabled="busy" @click="again">
              再次开始
            </button>
            <button type="button" class="text-button" @click="backHome">返回首页</button>
          </div>
        </template>
        <template v-else-if="result.status === 'early'">
          <div class="result-stack-actions">
            <button type="button" class="primary wide" @click="backHome">返回首页</button>
            <button type="button" class="secondary wide" :disabled="busy" @click="again">
              重新开始
            </button>
          </div>
        </template>
        <template v-else>
          <button type="button" class="primary wide" :disabled="busy" @click="again">
            <Icon name="refresh" :size="18" />重新开始
          </button>
          <button type="button" class="text-button" @click="backHome">返回首页</button>
        </template>
      </div>
    </template>

    <!-- Standby Body -->
    <template v-else>
      <div v-if="app.lock.session" class="lock-blocker-wrap">
        <button type="button" class="ongoing" data-ux-card @click="router.push('/lock')">
          <span class="row">
            <Icon name="lock" />
            <span>{{ app.lock.session.title }}<small>锁机进行中 · 返回处理</small></span>
          </span>
          <Icon name="right" :size="18" />
        </button>
      </div>

      <div class="standby-stage">
        <div class="standby-pet-group" data-decision-group>
          <div class="pet-bubble" :class="{ visible: Boolean(petBubble) }" role="status" aria-live="polite">
            {{ petBubble }}
          </div>
          <button
            type="button"
            class="pet-stage-btn"
            :aria-label="isRandomCompanion ? '轻点上阵动物互动' : `轻点${standbyAnimalMeta.name}互动`"
            @click="onPetTap"
          >
            <PetGraphic
              :animal-id="standbyAnimalId"
              :skin-id="standbySkinId"
              stage="standby"
              :size="136"
              :bouncing="petBouncing"
              :reduced-motion="reducedMotionPref"
            />
          </button>
          <button
            type="button"
            class="companion-pill"
            aria-haspopup="dialog"
            :aria-expanded="petOpen"
            @click="openPetPicker"
          >
            <span>{{ isRandomCompanion ? '随机出场' : standbyAnimalMeta.name }} · 换伙伴</span>
            <Icon name="right" :size="14" />
          </button>
        </div>

        <div class="standby-timing-group" data-decision-group data-tab-swipe-ignore>
          <div
            class="clock-drag-zone"
            data-tab-swipe-ignore
            tabindex="0"
            role="group"
            aria-label="滑动调整专注时长，可使用方向键微调"
            @touchstart.passive="onClockTouchStart"
            @touchmove="onClockTouchMove"
            @touchend="onClockTouchEnd"
            @touchcancel="onClockTouchEnd"
            @pointerdown="onClockPointerDown"
            @pointermove="onClockPointerMove"
            @pointerup="onClockPointerUp"
            @pointercancel="onClockPointerUp"
            @keydown="onClockKeyDown"
          >
            <div
              class="focus-clock number standby-clock"
              :class="{ 'long-clock': standbyMode === 'countdown' && standbyMinutes >= 60 }"
            >
              {{ standbyMode === 'stopwatch' ? '00:00' : timer(standbyMinutes * 60_000) }}
            </div>
            <p class="clock-hint">
              {{ standbyMode === 'stopwatch' ? '正计时 · 向上或向右滑动切倒计时' : '倒计时 · 滑动数字调时长' }}
            </p>
          </div>
          <div class="chip-row quick-minutes">
            <button
              v-for="mins in QUICK_MINUTES"
              :key="mins"
              type="button"
              class="chip quick-chip"
              :class="{ active: standbyMode === 'countdown' && standbyMinutes === mins }"
              @click="setQuickMinutes(mins)"
            >
              {{ mins }}
            </button>
            <button
              type="button"
              class="chip quick-chip"
              :class="{ active: standbyMode === 'stopwatch' }"
              @click="setStopwatchMode"
            >
              正计时
            </button>
          </div>
        </div>
      </div>

      <div class="standby-cta-wrap">
        <button
          type="button"
          class="primary wide standby-start"
          :disabled="busy || Boolean(app.lock.session)"
          @click="startStandbyFocus"
        >
          <Icon name="play" :size="17" />开始专注
        </button>
      </div>
    </template>

    <!-- Single <Sheet> container for all FocusView dialogs -->
    <Sheet
      :open="focusSheet !== null"
      :title="focusSheetTitle"
      :close-disabled="busy"
      @close="closeFocusSheet"
    >
      <div v-if="focusSheet === 'tasks'" class="stack">
        <button type="button" class="secondary wide" @click="goManageTasks">
          管理全部待办 ›
        </button>
        <div class="item-list selector-list">
          <div class="selector-row" :class="{ selected: !selectedItem }">
            <button
              type="button"
              class="selector-main"
              @click="chooseStandbyItem(null)"
            >
              <span class="selector-title">自由专注</span>
              <small>{{ defaultMinutes }} 分钟 · 倒计时</small>
            </button>
            <button
              type="button"
              class="secondary selector-start"
              aria-label="开始自由专注"
              :disabled="busy || Boolean(app.lock.session)"
              @click="quickStartItem(null)"
            >
              开始
            </button>
          </div>
          <template v-for="theme in app.themes" :key="theme.id">
            <div v-if="app.items.some((i) => i.themeId === theme.id)" class="selector-theme">
              <span class="theme-dot" :style="{ background: theme.color }" />
              <span>{{ theme.name }}</span>
            </div>
            <div
              v-for="item in app.items.filter((i) => i.themeId === theme.id)"
              :key="item.id"
              class="selector-row"
              :class="{ selected: selectedItem?.id === item.id }"
            >
              <button
                type="button"
                class="selector-main"
                @click="chooseStandbyItem(item)"
              >
                <span class="selector-title">{{ item.title }}</span>
                <small>{{ item.mode === 'stopwatch' ? '正计时' : `${item.minutes} 分钟` }}</small>
              </button>
              <button
                type="button"
                class="secondary selector-start"
                :aria-label="'开始' + item.title"
                :disabled="busy || Boolean(app.lock.session)"
                @click="quickStartItem(item)"
              >
                开始
              </button>
            </div>
          </template>
        </div>
      </div>

      <div v-else-if="focusSheet === 'whiteNoise'" class="stack">
        <div class="white-noise-grid" data-decision-group role="radiogroup" aria-label="白噪音曲目">
          <button
            v-for="track in WHITE_NOISE_TRACKS"
            :key="track.id"
            type="button"
            class="chip white-noise-chip"
            :class="{ active: whiteNoiseTrack === track.id }"
            role="radio"
            :aria-checked="whiteNoiseTrack === track.id"
            @click="selectWhiteNoise(track.id)"
          >
            {{ track.label }}
          </button>
        </div>
        <div class="card white-noise-volume-card" data-decision-group>
          <div class="white-noise-volume-head">
            <label for="white-noise-volume">音量</label>
            <span class="number white-noise-percent">{{ whiteNoisePercent }}%</span>
          </div>
          <input
            id="white-noise-volume"
            class="white-noise-slider"
            data-tab-swipe-ignore
            type="range"
            min="0"
            max="100"
            step="1"
            aria-label="白噪音音量"
            :value="whiteNoisePercent"
            @input="onWhiteNoiseVolumeInput"
            @change="onWhiteNoiseVolumeChange"
          />
        </div>
      </div>
      <div v-else-if="focusSheet === 'safety'" class="safety-sheet">
        <p class="notice" role="status">
          当前状态：{{ session ? (studyLocked ? '学霸模式保护中' : '普通专注中') : '未在专注中' }}
        </p>
        <div class="safety-list">
          <button
            v-for="entry in safetyRoutes"
            :key="entry.path"
            type="button"
            class="safety-row"
            @click="goSafety(entry.path)"
          >
            <span>{{ entry.label }}</span>
            <Icon name="right" :size="18" />
          </button>
        </div>
      </div>

      <div v-else-if="focusSheet === 'endConfirm'" class="stack">
        <p>已经投入的实际专注时长会保留。</p>
        <div class="form-footer">
          <button type="button" class="secondary" :disabled="busy" @click="closeFocusSheet">
            继续专注
          </button>
          <button type="button" class="primary" :disabled="busy" @click="confirmFinish">
            结束专注
          </button>
        </div>
      </div>

      <div v-else-if="focusSheet === 'startError' && startError" class="stack">
        <p class="notice" role="alert">{{ startError.message }}</p>
        <template v-if="startError.kind === 'recovery'">
          <button type="button" class="primary wide" :disabled="busy" @click="goRecoveryFromStartError">
            前往故障恢复
          </button>
          <button type="button" class="secondary wide" :disabled="busy" @click="closeFocusSheet">
            取消
          </button>
        </template>
        <template v-else-if="startError.kind === 'protection'">
          <button type="button" class="primary wide" :disabled="busy" @click="openStudyFromStartError">
            前往学霸模式处理
          </button>
          <button type="button" class="secondary wide" :disabled="busy" @click="clearUnreadyAndRetry">
            关闭未就绪保护并开始
          </button>
          <button type="button" class="text-button" :disabled="busy" @click="closeFocusSheet">
            取消
          </button>
        </template>
        <template v-else>
          <button type="button" class="primary wide" :disabled="busy" @click="closeFocusSheet">
            知道了
          </button>
        </template>
      </div>
    </Sheet>

    <PetPickerSheet :open="petOpen" @close="petOpen = false" />

    <StudyModeSheet
      :open="studyOpen"
      :initial-view="studyInitialView"
      @close="studyOpen = false"
    />
  </div>
</template>

<style scoped>
.focus-page {
  padding: calc(var(--page-block) + env(safe-area-inset-top))
    max(var(--page-inline), env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom))
    max(var(--page-inline), env(safe-area-inset-left));
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.focus-page.standby {
  min-height: calc(100dvh - var(--nav-height) - env(safe-area-inset-bottom));
  padding-bottom: 16px;
}
.focus-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}
.focus-header-title {
  flex: 1;
  min-width: 0;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-tools {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.white-noise-trigger {
  color: var(--muted-surface);
}
.white-noise-trigger.active {
  background: var(--ink);
  color: var(--white);
}
.task-pill {
  min-height: 48px;
  min-width: 0;
  flex: 0 1 auto;
  padding: 10px 12px;
  border-radius: 100px;
  background: var(--surface);
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.task-pill-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.study-capsule {
  min-height: 48px;
  padding: 10px 12px;
  border-radius: 100px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--muted-surface);
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  white-space: nowrap;
}
.study-capsule[data-tone='enabled'] {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--white);
}
.study-capsule[data-tone='warning'] {
  background: #fff1ef;
  border-color: #f8cbc3;
  color: #c13a25;
}
.lock-blocker-wrap {
  margin-top: 10px;
}
.ongoing {
  width: 100%;
  min-height: 54px;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
}
.ongoing small {
  display: block;
  margin-top: 2px;
}
.standby-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 2.2dvh, 22px);
  padding: 8px 0;
}
.standby-pet-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.pet-bubble {
  min-height: 28px;
  padding: 4px 12px;
  border-radius: 100px;
  background: var(--surface);
  color: var(--ink);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  opacity: 0;
  transition: opacity 160ms ease;
}
.pet-bubble.visible {
  opacity: 1;
}
.pet-stage-btn {
  min-width: 120px;
  min-height: 120px;
  padding: 4px;
  display: grid;
  place-items: center;
  border-radius: var(--radius);
}
.companion-pill {
  min-height: 48px;
  padding: 10px 16px;
  border-radius: 100px;
  background: var(--surface);
  color: var(--muted-surface);
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.standby-timing-group {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.clock-drag-zone {
  touch-action: none;
  user-select: none;
  text-align: center;
  padding: 4px 16px;
  border-radius: var(--radius);
  cursor: ns-resize;
}
.standby-clock {
  font-size: clamp(64px, 19vw, 96px);
  line-height: 1.1;
}
.clock-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}
.quick-minutes {
  justify-content: center;
}
.quick-chip {
  min-width: 50px;
  min-height: 48px;
  padding: 10px 12px;
}
.standby-cta-wrap {
  padding-top: 8px;
  display: flex;
  justify-content: center;
}
.standby-start {
  max-width: 300px;
}

.focus-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: clamp(12px, 3dvh, 32px) 0;
  text-align: center;
}
.focus-mode {
  font-size: 13px;
  color: var(--muted);
  margin-top: 6px;
}
.focus-clock {
  font-size: clamp(68px, 21vw, 108px);
  font-weight: 900;
  line-height: 1.15;
  letter-spacing: -0.065em;
  white-space: nowrap;
}
.focus-clock.long-clock {
  font-size: clamp(54px, 15vw, 80px);
}
.focus-name {
  font-size: 19px;
  margin-top: 8px;
  max-width: 100%;
  overflow-wrap: anywhere;
  font-weight: 600;
}
.focus-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
  margin-top: 6px;
}
.focus-bottom {
  text-align: center;
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
}
.focus-bottom > p {
  font-size: 13px;
  color: var(--muted);
}
.focus-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  margin: clamp(10px, 2.5dvh, 24px) 0;
}
.countdown-controls {
  gap: 14px;
  width: 100%;
  max-width: 340px;
  margin-inline: auto;
}
.giveup-track {
  position: relative;
  flex: 1;
  min-width: 180px;
  height: 54px;
  border-radius: 100px;
  background: var(--surface);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  touch-action: none;
  user-select: none;
}
.giveup-label {
  font-size: 13px;
  color: var(--muted-surface);
  pointer-events: none;
}
.giveup-thumb {
  position: absolute;
  right: 3px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--white);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  color: var(--ink);
}
.cancel-control {
  min-width: 108px;
  min-height: 54px;
}
.pause-control {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: white;
  flex-shrink: 0;
}
.end-control {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface);
}
.focus-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 20px 0;
  gap: 6px;
}
.focus-result h1 {
  font-size: 24px;
  margin-top: 10px;
}
.result-duration {
  font-size: 48px;
  margin-top: 14px;
  line-height: 1.25;
}
.result-pet-reward {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  margin-top: 4px;
}
.result-pet-penalty {
  font-size: 14px;
  font-weight: 600;
  color: #c13a25;
  margin-top: 4px;
}
.note-box {
  width: 100%;
  max-width: 340px;
  margin: 12px 0 14px;
  display: grid;
  gap: 10px;
}
.note-input-row {
  position: relative;
  display: flex;
  align-items: center;
}
.note-input-row input {
  padding-right: 64px;
}
.note-count {
  position: absolute;
  right: 12px;
  font-size: 12px;
  color: var(--muted-surface);
  pointer-events: none;
}
.note-chips {
  justify-content: center;
}
.focus-result .primary,
.result-stack-actions {
  width: 100%;
  max-width: 300px;
}
.result-stack-actions {
  display: grid;
  gap: 10px;
}
.focus-result .text-button {
  min-height: 48px;
}
.result-secondary-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 6px;
}
.selector-list {
  display: grid;
  gap: 8px;
}
.selector-theme {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  margin-top: 6px;
}
.theme-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.selector-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px 6px 14px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid transparent;
}
.selector-row.selected {
  border-color: var(--ink);
}
.selector-main {
  flex: 1;
  min-width: 0;
  min-height: 48px;
  text-align: left;
  display: grid;
  align-content: center;
  gap: 2px;
}
.selector-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.selector-row small {
  color: var(--muted-surface);
}
.selector-start {
  min-height: 48px;
  min-width: 64px;
  padding: 10px 16px;
  background: var(--white);
  border: 1px solid var(--line);
}
.safety-sheet {
  display: grid;
  gap: 14px;
}
.safety-list {
  display: grid;
  gap: 4px;
}
.safety-row {
  width: 100%;
  min-height: 48px;
  padding: 12px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  font-size: 14px;
  color: var(--ink);
  border-bottom: 1px solid var(--line);
}
.safety-row:last-child {
  border-bottom: 0;
}
.safety-row svg {
  color: var(--muted);
  flex-shrink: 0;
}
.notice {
  border-radius: var(--radius);
  color: var(--muted-surface);
}
.text-button {
  min-height: 48px;
}
.white-noise-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.white-noise-chip {
  width: 100%;
  min-height: 48px;
  font-size: 14px;
  font-weight: 500;
  color: var(--ink);
}
.white-noise-chip.active {
  color: var(--white);
}
.white-noise-volume-card {
  display: grid;
  gap: 6px;
  padding: 16px 18px 10px;
}
.white-noise-volume-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.white-noise-volume-head label {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.white-noise-percent {
  font-size: 15px;
  color: var(--muted-surface);
}
.white-noise-slider {
  width: 100%;
  min-height: 48px;
  height: 48px;
  margin: 0;
}
</style>
