import { createSSRApp, defineComponent, h, reactive, type Component } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultPeriods, defaultProtection, type CalendarEvent, type Occurrence } from '../src/domain/model'
import { occurrences } from '../src/domain/calendar'

const mocks = vi.hoisted(() => ({
  app: null as any,
  router: { push: vi.fn(), replace: vi.fn() },
  protection: vi.fn(),
  dnd: vi.fn(),
  notification: vi.fn(),
  recent: vi.fn(),
  launcher: vi.fn(),
  wallpaper: vi.fn(),
  prepareWallpaper: vi.fn(),
  requestNotifications: vi.fn(),
  permissionStatus: vi.fn(),
  openAlarmSettings: vi.fn(),
  controlObserve: vi.fn(),
  updates: {
    state: { currentVersion: '0.2.5', phase: 'idle', received: 0, total: 0, canInstall: false },
    checking: false,
    hasUpdate: false,
    error: '',
    refresh: vi.fn(),
    check: vi.fn(),
  },
}))

vi.mock('/icons/github-mark.png', () => ({ default: '/icons/github-mark.png' }))
vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))
vi.mock('../src/stores/updates', () => ({ useUpdates: () => mocks.updates }))
vi.mock('vue-router', () => ({ useRouter: () => mocks.router, onBeforeRouteLeave: vi.fn() }))
vi.mock('../src/platform/bridge', () => ({
  native: false,
  requestNotifications: mocks.requestNotifications,
  permissionStatus: mocks.permissionStatus,
  openAlarmSettings: mocks.openAlarmSettings,
  exportFile: vi.fn(),
  importNativeFile: vi.fn(),
  syncFocusOverlayState: vi.fn(),
  onNativeOverlayEvent: vi.fn(async () => () => {}),
  keepAliveDriver: {
    guide: vi.fn(async () => ({
      brand: 'generic',
      brandLabel: '标准 Android',
      foregroundServiceActive: false,
      batteryOptimizationIgnored: false,
      hasAutoStartSurface: false,
      autoStartHint: '测试自启动提示',
      recentLockHint: '测试锁卡提示',
      hideRecentsConflict: false,
    })),
    openSettings: vi.fn(async () => true),
  },
  deviceAdminDriver: {
    status: vi.fn(async () => ({
      supported: true,
      active: false,
      preferenceEnabled: false,
      state: 'off',
      reason: '',
    })),
    requestActivation: vi.fn(async () => true),
    deactivate: vi.fn(async () => ({
      supported: true,
      active: false,
      preferenceEnabled: false,
      state: 'off',
      reason: '',
    })),
  },
  controlDriver: { observe: mocks.controlObserve },
  protectionDriver: {
    status: mocks.protection,
    openSettings: vi.fn(),
    recentTasks: mocks.recent,
    launcher: mocks.launcher,
    wallpaper: mocks.wallpaper,
    prepareWallpaper: mocks.prepareWallpaper,
    importWallpaperOriginal: vi.fn(),
    apps: vi.fn(async () => []),
  },
}))
vi.mock('../src/platform/dnd', () => ({ dndDriver: { read: mocks.dnd, openSettings: vi.fn(), restore: vi.fn() } }))
vi.mock('../src/platform/notifications', () => ({ notificationDriver: { read: mocks.notification, openSettings: vi.fn(), rebind: vi.fn() } }))

import StatisticsView from '../src/views/StatisticsView.vue'
import TasksView from '../src/views/TasksView.vue'
import FocusView from '../src/views/FocusView.vue'
import CalendarView from '../src/views/CalendarView.vue'
import SettingsView from '../src/views/SettingsView.vue'
import LockView from '../src/views/LockView.vue'
import StudyModeSheet from '../src/components/StudyModeSheet.vue'
import LockMainEntrySetting from '../src/components/LockMainEntrySetting.vue'

async function mountSSR(component: Component, props = {}, onCreated?: (state: any) => void) {
  let setupState: any
  const vnode = h(component, props)
  const app = createSSRApp({ render: () => vnode })
  app.component('RouterLink', defineComponent({ props: { to: String }, setup: (p, ctx) => () => h('a', { href: p.to }, ctx.slots.default?.()) }))
  if (onCreated) {
    app.mixin({
      created() {
        const internal = (this as any).$
        if (internal?.type === component) {
          setupState = internal.setupState
          onCreated(setupState)
        }
      },
    })
  }
  const html = await renderToString(app)
  return { state: setupState ?? (vnode.component as any).setupState, html }
}

beforeEach(() => {
  vi.clearAllMocks()
  const capability = { supported: true, authorized: true, connected: true, active: false, state: 'off', reason: '', identity: {} }
  mocks.protection.mockResolvedValue({ ...capability, effectiveWhitelist: [], navigation: capability, antiClose: capability })
  mocks.dnd.mockResolvedValue({ supported: true, permissionGranted: true, requested: false, phase: 'off' })
  mocks.notification.mockResolvedValue({ supported: true, authorized: true, connected: true, requested: false, phase: 'off' })
  mocks.recent.mockResolvedValue({ supported: true, recoveryAvailable: true, phase: 'off' })
  mocks.launcher.mockResolvedValue({ supported: true, recoveryAvailable: true, phase: 'off' })
  mocks.wallpaper.mockResolvedValue({ supported: true, prepared: true, phase: 'baseline_ready', current: {} })
  mocks.permissionStatus.mockResolvedValue({ notifications: true, exactAlarms: true })
  mocks.controlObserve.mockResolvedValue({ mainEntry: { active: false, withdrawn: false } })
  mocks.app = reactive({
    data: {
      themes: [{ id: 't1', name: '阅读', color: '#ef4e36', order: 0, collapsed: false }],
      items: [{ id: 'i1', themeId: 't1', title: '看书', note: '', mode: 'countdown', minutes: 25, order: 0 }],
      records: [],
      events: [],
      eventExceptions: [],
      semesters: [{ id: 's1', name: '2026秋', startDate: '2026-09-07', weeks: 20, periods: defaultPeriods() }],
      courses: [],
      courseExceptions: [],
      lockConfigurations: [{ id: 'l1', name: '锁机', minutes: 25, strict: false, whitelist: { source: 'global' } }],
      preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: 's1', protection: defaultProtection() },
    },
    themes: [{ id: 't1', name: '阅读', color: '#ef4e36', order: 0, collapsed: false }],
    items: [{ id: 'i1', themeId: 't1', title: '看书', note: '', mode: 'countdown', minutes: 25, order: 0 }],
    focus: { session: null, elapsedMs: 0 },
    rest: { session: null, remainingMs: 0 },
    lock: { session: null, remainingMs: 0, records: [] },
    petProjection: {
      affection: 0,
      peakAffection: 0,
      currentStreakDays: 0,
      maxConsecutiveDays: 0,
      totalRaised: 0,
      raisedByAnimal: { 'black-cat': 0 },
      dailyGainToday: 0,
      dailyGains: {},
      recordEffects: new Map(),
      unlockedAnimals: ['black-cat'],
      unlockedSkins: { 'black-cat': ['default'] },
      weekFarmSlice: () => ({ weekStartDate: '2026-11-23', weekEndDate: '2026-11-29', weekTotalCount: 0, totalDurationMs: 0, instances: [] }),
      weeklyFourColorMatrix: () => [],
    },
    lastResult: undefined,
    start: vi.fn(async () => {}),
    dismissResult: vi.fn(),
    updateRecordNote: vi.fn(async () => {}),
    selectStandbyItem: vi.fn(async () => {}),
    selectAnimal: vi.fn(async () => {}),
    startLock: vi.fn(async () => {}),
    finishLock: vi.fn(async () => {}),
    deleteRecord: vi.fn(async (id: string) => {
      mocks.app.data.records = mocks.app.data.records.filter((r: any) => r.id !== id)
    }),
    acknowledgeStrict: vi.fn(),
    clearStrictAcknowledged: vi.fn(),
    notify: vi.fn(),
    mutate: vi.fn(async (change: any) => change(mocks.app.data)),
  })
})

describe('UI audit fixes', () => {
  it('StatisticsView handles cleared/invalid anchor safely, escapes tooltip HTML, and sets aria-pressed', async () => {
    const { state, html } = await mountSSR(StatisticsView)
    expect(html).toContain('aria-pressed="true"')
    state.period = 'week'
    state.anchor = ''
    expect(state.range[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(state.trend.labels.length).toBe(7)
    expect(state.periodTitle).not.toContain('NaN')

    state.anchor = '2026-02-30'
    expect(state.range[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(state.periodTitle).not.toContain('NaN')

    const formatted = state.pieOption.tooltip.formatter({ name: '<img src=x onerror=1>&"\'', value: 60000, percent: 100 })
    expect(formatted).toContain('&lt;img src=x onerror=1&gt;&amp;&quot;&#39;')
    expect(formatted).not.toContain('<img')
  })

  it('StatisticsView manages records list, detail, and inline delete inside a single Sheet', async () => {
    const now = Date.now()
    const record = {
      id: 'rec-1',
      itemId: 'i1',
      themeId: 't1',
      title: '英语听力',
      themeName: '阅读',
      color: '#ef4e36',
      mode: 'countdown' as const,
      targetMs: 1500000,
      startedAt: now - 1500000,
      endedAt: now,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      durationMs: 1500000,
      pausedMs: 0,
      segments: [{ start: now - 1500000, end: now }],
      status: 'completed' as const,
    }
    mocks.app.data.records.push(record)

    const { state, html } = await mountSSR(StatisticsView)
    expect((html.match(/<dialog/g) ?? []).length).toBeLessThanOrEqual(1)

    state.openRecords()
    expect(state.recordsOpen).toBe(true)
    expect(state.recordView).toBe('list')
    expect(state.selected).toBeNull()
    expect(state.confirmDelete).toBe(false)
    expect(state.records.map((r: any) => r.id)).toEqual(['rec-1'])

    state.showRecord(record)
    expect(state.recordsOpen).toBe(true)
    expect(state.recordView).toBe('detail')
    expect(state.selected?.id).toBe('rec-1')
    expect(state.confirmDelete).toBe(false)

    state.confirmDelete = true
    state.backToList()
    expect(state.recordsOpen).toBe(true)
    expect(state.recordView).toBe('list')
    expect(state.selected).toBeNull()
    expect(state.confirmDelete).toBe(false)

    state.showRecord(record)
    state.confirmDelete = true
    await state.confirmRemove(record)
    expect(mocks.app.deleteRecord).toHaveBeenCalledWith('rec-1')
    expect(state.confirmDelete).toBe(false)
    expect(state.selected).toBeNull()
    expect(state.recordView).toBe('list')
    expect(state.recordsOpen).toBe(true)
    expect(state.records).toEqual([])
    expect(mocks.app.notify).toHaveBeenCalledWith('记录已删除')

    state.closeRecords()
    expect(state.recordsOpen).toBe(false)
    expect(state.confirmDelete).toBe(false)
  })

  it('TasksView guards begin() against double tap and ignores StrictStartConfirmation cancel in free sheet', async () => {
    const { state } = await mountSSR(TasksView)
    let resolveStart!: () => void
    mocks.app.start.mockImplementationOnce(() => new Promise<void>((r) => { resolveStart = r }))
    const first = state.begin(mocks.app.items[0])
    const second = state.begin(mocks.app.items[0])
    expect(mocks.app.start).toHaveBeenCalledTimes(1)
    resolveStart()
    await Promise.all([first, second])

    state.openFree()
    mocks.app.start.mockRejectedValueOnce(new Error('已取消开始专注'))
    await state.startFree()
    expect(state.formError).toBe('')
  })

  it('TasksView syncToday updates today when date changes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-17T23:59:50'))
    const { state } = await mountSSR(TasksView)
    expect(state.today).toBe('2026-11-17')
    vi.setSystemTime(new Date('2026-11-18T00:00:05'))
    state.syncToday()
    expect(state.today).toBe('2026-11-18')
    vi.useRealTimers()
  })

  it('TasksView displays cross-midnight duration on day 2 without hiding it behind count === 0', async () => {
    vi.useFakeTimers()
    const start = new Date(2026, 10, 14, 23, 50, 0).getTime()
    const end = new Date(2026, 10, 15, 0, 15, 0).getTime()
    mocks.app.data.records.push({
      id: 'cross-1',
      itemId: 'i1',
      themeId: 't1',
      title: '看书',
      themeName: '阅读',
      color: '#ef4e36',
      mode: 'countdown',
      targetMs: 1500000,
      startedAt: start,
      endedAt: end,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      durationMs: 1500000,
      pausedMs: 0,
      segments: [{ start, end }],
      status: 'completed',
    })

    vi.setSystemTime(new Date(2026, 10, 14, 23, 59, 0))
    const day1 = await mountSSR(TasksView)
    expect(day1.html).toContain('今日 1 次，10分钟')

    vi.setSystemTime(new Date(2026, 10, 15, 0, 20, 0))
    const day2 = await mountSSR(TasksView)
    expect(day2.html).toContain('今日 15分钟')
    expect(day2.html).not.toContain('0 次')
    vi.useRealTimers()
  })

  it('FocusView guards again() against concurrent taps', async () => {
    mocks.app.lastResult = { id: 'r1', itemId: 'i1', title: '看书', themeName: '阅读', mode: 'countdown', targetMs: 1500000, durationMs: 1500000, pausedMs: 0, status: 'completed', startedAt: 1, endedAt: 2, timeZone: 'UTC', segments: [] }
    const { state } = await mountSSR(FocusView)
    let resolveStart!: () => void
    mocks.app.start.mockImplementationOnce(() => new Promise<void>((r) => { resolveStart = r }))
    const p1 = state.again()
    const p2 = state.again()
    expect(mocks.app.start).toHaveBeenCalledTimes(1)
    resolveStart()
    await Promise.all([p1, p2])
  })

  it('CalendarView fixes changeScope allDay restoration, coursePosition soft border, and startFromEvent cancellation', async () => {
    mocks.app.data.events.push({
      id: 'e1', title: '全天复习', start: '2026-11-17T00:00', end: '2026-11-18T00:00',
      allDay: true, note: '', repeat: 'weekly', weekdays: [2], until: '', itemId: 'i1', reminderMinutes: null,
    })
    const occ: Occurrence = {
      id: 'e1/2026-11-17', sourceId: 'e1', sourceDate: '2026-11-17', kind: 'event',
      title: '全天复习', start: '2026-11-17T00:00', end: '2026-11-18T00:00',
      allDay: true, note: '', color: '#737378', itemId: 'i1', reminderMinutes: null,
    }
    const { state } = await mountSSR(CalendarView)
    state.editEvent(occ)
    expect(state.scope).toBe('once')
    state.scope = 'all'
    state.changeScope()
    state.eventForm.allDay = false
    state.scope = 'once'
    state.changeScope()
    expect(state.eventForm.allDay).toBe(true)
    expect(state.eventForm.end).toBe('2026-11-17T23:59')

    const periods = mocks.app.data.semesters[0].periods
    const afterLast = state.coursePosition({ ...occ, kind: 'course', start: '2026-11-17T22:00', end: '2026-11-17T23:00', color: '#ffee00' })
    expect(afterLast.gridRow).toBe(`${periods.length - 1 + 2} / span 1`)
    expect(afterLast.background).toBe('#ffee0016')
    expect(afterLast.border).toBe('1px solid #ffee0033')
    expect((afterLast as Record<string, unknown>).borderLeft).toBeUndefined()
    expect(afterLast.color).toBe('#222')

    const spanningPastEnd = state.coursePosition({ ...occ, kind: 'course', start: '2026-11-17T19:00', end: '2026-11-17T23:00', color: '#ef4e36' })
    expect(spanningPastEnd.gridRow).toBe('10 / span 2')

    state.showDetail(occ)
    mocks.app.start.mockRejectedValueOnce(new Error('已取消开始专注'))
    await state.startFromEvent()
    expect(state.error).toBe('')
    expect(state.startError).toBeNull()
  })

  it.each(['once', 'all'] as const)('CalendarView can move a standalone edit past the series cutoff (%s)', async (scope) => {
    const event: CalendarEvent = {
      id: 'e1', title: '复习', start: '2026-11-17T09:00', end: '2026-11-17T10:00',
      allDay: false, note: '', repeat: 'weekly', weekdays: [2], until: '2026-11-17', itemId: null, reminderMinutes: null,
    }
    mocks.app.data.events.push(event)
    mocks.app.saveEvent = vi.fn(async () => {})
    const source = occurrences(mocks.app.data, '2026-11-17', '2026-11-17')[0]!
    const { state } = await mountSSR(CalendarView)
    state.editEvent(source)
    if (scope === 'all') {
      state.scope = scope
      state.changeScope()
      state.eventForm.repeat = 'none'
    }
    state.eventForm.start = '2026-11-18T09:00'
    state.eventForm.end = '2026-11-18T10:00'

    await expect(state.saveEvent()).resolves.toBe(true)

    expect(mocks.app.saveEvent).toHaveBeenCalledWith(expect.objectContaining({
      start: '2026-11-18T09:00', repeat: 'none', until: '',
    }), source, scope)
  })

  it('CalendarView warns about clashes with the real weekly occurrence via inline banner and lets the user save', async () => {
    mocks.app.data.events.push({
      id: 'existing', title: '实验', start: '2026-11-18T09:30', end: '2026-11-18T10:30',
      allDay: false, note: '', repeat: 'none', weekdays: [], until: '', itemId: null, reminderMinutes: null,
    })
    mocks.app.saveEvent = vi.fn(async () => {})
    const { state } = await mountSSR(CalendarView)
    state.day = '2026-11-16'
    state.newEvent()
    Object.assign(state.eventForm, { title: '复习', repeat: 'weekly', weekdays: [3] })

    await state.submitEvent(false)

    expect(state.eventConflict).toBe('实验')
    expect(state.sheet).toBe('event')
    expect(mocks.app.saveEvent).not.toHaveBeenCalled()

    await state.submitEvent(true)
    expect(mocks.app.saveEvent).toHaveBeenCalledOnce()
    expect(state.eventConflict).toBeNull()
  })

  it('CalendarView excludes only the selected occurrence from a standalone edit conflict check', async () => {
    mocks.app.data.events.push({
      id: 'e1', title: '复习', start: '2026-11-17T09:00', end: '2026-11-17T10:00',
      allDay: false, note: '', repeat: 'weekly', weekdays: [2], until: '', itemId: null, reminderMinutes: null,
    })
    mocks.app.saveEvent = vi.fn(async () => {})
    const source = occurrences(mocks.app.data, '2026-11-17', '2026-11-17')[0]!
    const { state } = await mountSSR(CalendarView)
    state.editEvent(source)
    await expect(state.saveEvent()).resolves.toBe(true)
    expect(mocks.app.saveEvent).toHaveBeenCalledOnce()
    expect(state.eventConflict).toBeNull()

    state.eventForm.start = '2026-11-24T09:00'
    state.eventForm.end = '2026-11-24T10:00'
    await state.submitEvent(false)
    expect(state.eventConflict).toBe('复习')
    expect(state.sheet).toBe('event')
    expect(mocks.app.saveEvent).toHaveBeenCalledOnce()

    state.eventConflict = null
    expect(state.eventConflict).toBeNull()
    expect(mocks.app.saveEvent).toHaveBeenCalledOnce()
  })

  it('SettingsView renders 轻看护 toggle in 专注保护 with <= 4 rows, default true, and exemption help text', async () => {
    const { state, html } = await mountSSR(SettingsView)
    expect(html).toContain('轻看护')
    expect(html).toContain('熄屏锁屏与通话不受影响')
    const protectSection = html.split('专注保护')[1]?.split('数据与支持')[0] ?? ''
    const protectRows = protectSection.match(/class="settings-row(?=["\s])/g) ?? []
    expect(protectRows.length).toBeLessThanOrEqual(4)
    expect(protectRows.length).toBeGreaterThanOrEqual(3)

    const leaveFailTarget = { checked: false }
    await state.preference('leaveAppFail', { target: leaveFailTarget })
    expect(mocks.app.data.preferences.leaveAppFail).toBe(false)

    mocks.app.mutate.mockRejectedValueOnce(new Error('保存失败'))
    const revertTarget = { checked: true }
    await state.preference('leaveAppFail', { target: revertTarget })
    expect(revertTarget.checked).toBe(false)
    expect(mocks.app.notify).toHaveBeenCalledWith('保存失败')
  })

  it('reverts checkbox checked state on error across SettingsView, StudyModeSheet, and LockMainEntrySetting', async () => {
    mocks.app.mutate.mockRejectedValueOnce(new Error('保存失败'))
    const settings = (await mountSSR(SettingsView)).state
    const soundTarget = { checked: false }
    await settings.preference('sound', { target: soundTarget })
    expect(soundTarget.checked).toBe(true)
    expect(mocks.app.notify).toHaveBeenCalledWith('保存失败')

    const study = (await mountSSR(StudyModeSheet, { open: true })).state
    await study.refresh()

    mocks.app.mutate.mockRejectedValueOnce(new Error('写入失败'))
    const masterTarget = { checked: true }
    await study.toggleStudy({ target: masterTarget })
    expect(masterTarget.checked).toBe(false)
    expect(study.error).toBe('写入失败')

    mocks.app.mutate.mockRejectedValueOnce(new Error('严格模式写入失败'))
    const strictTarget = { checked: true }
    await study.toggleModule('strict', { target: strictTarget })
    expect(strictTarget.checked).toBe(false)
    expect(study.error).toBe('严格模式写入失败')

    mocks.app.mutate.mockRejectedValueOnce(new Error('不可暂停写入失败'))
    const initialNoPauseEnd = study.strictSub.noPauseEnd
    const noPauseTarget = { checked: !initialNoPauseEnd }
    await study.toggleSubItem('strict', 'noPauseEnd', { target: noPauseTarget })
    expect(noPauseTarget.checked).toBe(initialNoPauseEnd)
    expect(study.error).toBe('不可暂停写入失败')

    const lockMain = (await mountSSR(LockMainEntrySetting)).state
    const lockTarget = { checked: true }
    await lockMain.toggle({ target: lockTarget })
    expect(lockTarget.checked).toBe(false)

    mocks.app.data.preferences.protection.enhancements = ['lockMainInterfaceRestricted']
    mocks.app.mutate.mockRejectedValueOnce(new Error('锁机入口写入失败'))
    const disableLockTarget = { checked: false }
    await lockMain.toggle({ target: disableLockTarget })
    expect(disableLockTarget.checked).toBe(true)
    expect(lockMain.error).toBe('锁机入口写入失败')
  })

  it('StudyModeSheet wallpaper protection fails prepare cleanly when native action fails and uses a distinct disable toast', async () => {
    mocks.wallpaper.mockResolvedValue({ supported: true, prepared: false, phase: 'idle', current: {} })
    const { state } = await mountSSR(StudyModeSheet, { open: true, initialView: 'strict' })
    await state.refresh()

    const enableTarget = { checked: true }
    await state.toggleSubItem('strict', 'wallpaper', { target: enableTarget })
    expect(enableTarget.checked).toBe(false)
    expect(state.view).toBe('wallpaperConsent')
    expect(state.limitsAccepted).toBe(false)
    expect(state.originalMatches).toBe(false)

    state.limitsAccepted = true
    state.originalMatches = true
    mocks.prepareWallpaper.mockRejectedValueOnce(new Error('壁纸原状态保存失败'))
    await state.prepareWallpaperBaseline()
    expect(state.view).toBe('wallpaperConsent')
    expect(state.error).toBe('壁纸原状态保存失败')
    expect(mocks.app.notify).not.toHaveBeenCalled()

    mocks.app.data.preferences.protection = { ...defaultProtection(), enhancements: ['wallpaperProtection'] }
    mocks.wallpaper.mockResolvedValue({ supported: true, prepared: true, phase: 'baseline_ready', current: {} })
    await state.refresh()
    expect(state.strictSub.wallpaper).toBe(true)
    await state.toggleSubItem('strict', 'wallpaper', { target: { checked: false } })
    expect(state.strictSub.wallpaper).toBe(false)
    expect(mocks.app.notify).toHaveBeenCalledWith('壁纸偏好已关闭，将用于下一轮')
  })

  it('LockView isolates background loadError from sheetError and clears sheetError on open/close', async () => {
    const { state } = await mountSSR(LockView)
    mocks.protection.mockRejectedValueOnce(new Error('网络超时'))
    await state.refresh()
    expect(state.loadError).toBe('网络超时')
    expect(state.sheetError).toBe('')

    state.sheetError = '残留错误'
    state.edit()
    expect(state.sheetError).toBe('')
    state.draft.name = ''
    await state.save()
    expect(state.sheetError).toBe('请填写锁机名称')
    expect(state.loadError).toBe('网络超时')
    state.closeDraft()
    expect(state.sheetError).toBe('')
    expect(state.loadError).toBe('网络超时')
  })

  it('TasksView studyCapsule and StudyModeSheet reflect off, active, and pending-authorization states', async () => {
    const tasks = await mountSSR(TasksView)
    await tasks.state.refreshProtection()
    expect(tasks.state.studyCapsule.text).toBe('学霸模式 · 关')
    expect(tasks.state.studyCapsule.masterOn).toBe(false)
    expect(tasks.html).toContain('学霸模式 · 关')

    mocks.app.data.preferences.protection = {
      ...defaultProtection(),
      study: true,
      modules: {
        initialized: true,
        master: true,
        apps: { enabled: true, customized: false, items: { restrict: true, temporaryAccess: true } },
        strict: { enabled: false, customized: false, items: { noPauseEnd: false, navigation: false, antiClose: false, hideRecents: false, hideLauncher: false, wallpaper: false } },
        quiet: { enabled: false, customized: false, items: { sound: false, intercept: false, whitelistPass: true } },
      },
    }
    mocks.protection.mockResolvedValue({
      supported: true, authorized: true, connected: true, active: false, state: 'ready',
      engine: 'usage_overlay', usageStatsGranted: true, overlayGranted: true,
      accessibilityAuthorized: false, accessibilityConnected: false,
      reason: '', effectiveWhitelist: [],
    })
    await tasks.state.refreshProtection()
    expect(tasks.state.studyCapsule.text).toBe('学霸模式 · 开')
    expect(tasks.state.studyCapsule.masterOn).toBe(true)

    const readySheet = await mountSSR(StudyModeSheet, { open: true })
    await readySheet.state.refresh()
    expect(readySheet.state.masterEnabled).toBe(true)
    expect(readySheet.state.missingPermissions).toEqual([])

    mocks.protection.mockResolvedValue({
      supported: true, authorized: false, connected: false, active: false, state: 'authorization',
      engine: 'none', usageStatsGranted: false, overlayGranted: false,
      accessibilityAuthorized: false, accessibilityConnected: false,
      reason: '需要开启使用情况访问与悬浮窗权限', effectiveWhitelist: [],
    })
    await tasks.state.refreshProtection()
    expect(tasks.state.studyCapsule.text).toBe('学霸模式 · 待授权')
    expect(tasks.state.studyCapsule.tone).toBe('warning')

    await readySheet.state.refresh()
    expect(readySheet.state.missingPermissions.map((p: any) => p.id)).toEqual(['usageStats', 'overlay'])

    mocks.app.lock.session = {
      id: 'lock-1',
      configurationId: 'l1',
      title: '锁机',
      targetMs: 60000,
      startedAt: 1,
      strictMode: false,
      protection: { study: true, source: 'global', whitelist: [] },
    }
    const lockSheet = await mountSSR(StudyModeSheet, { open: true })
    expect(lockSheet.html).toContain('修改用于下一轮锁机')
  })

  it('FocusView avoids duplicate free-focus header title and distinguishes completed vs early/interrupted result icons and actions', async () => {
    mocks.app.focus.session = {
      id: 'f-free', itemId: null, themeId: null, title: '自由专注', themeName: '自由专注', color: '#222222',
      mode: 'countdown', targetMs: 1500000, startedAt: 1, timeZone: 'UTC', state: 'running',
      elapsedMs: 0, pausedMs: 0, anchorMono: 1, anchorEpoch: 1, bootId: 0, segments: [],
    }
    const freeRunning = await mountSSR(FocusView)
    expect(freeRunning.html).toContain('>小猫专注<')
    expect(freeRunning.html.match(/自由专注/g)?.length ?? 0).toBe(1)

    mocks.app.focus.session = null
    mocks.app.lastResult = {
      id: 'r-early', itemId: 'i1', themeId: 't1', title: '看书', themeName: '阅读', color: '#ef4e36',
      mode: 'countdown', targetMs: 1500000, durationMs: 300000, pausedMs: 0, status: 'early',
      startedAt: 1, endedAt: 300001, timeZone: 'UTC', segments: [],
    }
    const earlyResult = await mountSSR(FocusView)
    expect(earlyResult.html).toContain('完蛋！你的小黑猫挂了')
    expect(earlyResult.html).toContain('好感 -5')
    expect(earlyResult.html).toContain('返回首页')
    expect(earlyResult.html).toContain('重新开始')
    expect(earlyResult.html).not.toContain('休息 5 分钟')

    mocks.app.lastResult = { ...mocks.app.lastResult, id: 'r-done', durationMs: 1500000, status: 'completed' }
    const completedResult = await mountSSR(FocusView)
    expect(completedResult.html).toContain('本次专注正常结束')
    expect(completedResult.html).toContain('休息 5 分钟')
    expect(completedResult.html).toContain('再次开始')
    expect(completedResult.html).toContain('返回首页')

    mocks.app.lastResult = { ...mocks.app.lastResult, id: 'r-int', durationMs: 60000, status: 'interrupted' }
    const interruptedResult = await mountSSR(FocusView)
    expect(interruptedResult.html).toContain('专注已中断')
    expect(interruptedResult.html).not.toContain('休息 5 分钟')
    expect(interruptedResult.html).toContain('重新开始')
    expect(interruptedResult.html).toContain('返回首页')
  })

  it('CalendarView defaults new today events to next half-hour, stacks datetime inputs, and uses 今天 jump button', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 10, 23, 1, 18, 0))
      const cal = await mountSSR(CalendarView)
      expect(cal.html).toMatch(/>\s*今天\s*</)
      expect(cal.html).not.toMatch(/>\s*今\s*</)
      cal.state.day = '2026-11-23'
      cal.state.newEvent()
      expect(cal.state.eventForm.start).toBe('2026-11-23T01:30')
      expect(cal.state.eventForm.end).toBe('2026-11-23T02:30')

      vi.setSystemTime(new Date(2026, 10, 23, 23, 10, 0))
      cal.state.newEvent()
      expect(cal.state.eventForm.start).toBe('2026-11-23T23:00')
      expect(cal.state.eventForm.end).toBe('2026-11-23T23:59')

      cal.state.day = '2026-11-24'
      cal.state.newEvent()
      expect(cal.state.eventForm.start).toBe('2026-11-24T09:00')
      expect(cal.state.eventForm.end).toBe('2026-11-24T10:00')

      const eventSheet = await mountSSR(CalendarView, {}, (s) => {
        s.day = '2026-11-23'
        s.newEvent()
      })
      expect(eventSheet.html).toContain('class="event-time-stack"')
      expect(eventSheet.html).not.toContain('class="two-cols"><label> 开始时间')
    } finally {
      vi.useRealTimers()
    }
  })

  it('StatisticsView shows 最长单次 in day view, keeps integer yAxis ticks, and LockView avoids duplicate header +', async () => {
    const start = new Date(2026, 10, 23, 1, 0, 0).getTime()
    const end = start + 15000
    mocks.app.data.records.push({
      id: 'short-today',
      itemId: 'i1',
      themeId: 't1',
      title: '看书',
      themeName: '阅读',
      color: '#ef4e36',
      mode: 'stopwatch',
      targetMs: 1500000,
      startedAt: start,
      endedAt: end,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      durationMs: 15000,
      pausedMs: 0,
      segments: [{ start, end }],
      status: 'completed',
    })
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 10, 23, 1, 18, 0))
      const dayStats = await mountSSR(StatisticsView)
      expect(dayStats.html).toContain('最长单次')
      expect(dayStats.html).not.toContain('专注天数')
      expect(dayStats.state.trendOption.yAxis.minInterval).toBe(1)
      expect(dayStats.state.trendOption.yAxis.max).toBe(1)
      expect(dayStats.state.hourOption.yAxis.minInterval).toBe(1)
      expect(dayStats.state.hourOption.yAxis.max).toBe(1)

      const weekStats = await mountSSR(StatisticsView, {}, (s) => {
        s.period = 'week'
      })
      expect(weekStats.html).toContain('专注天数')
      expect(weekStats.html).not.toContain('最长单次')
    } finally {
      vi.useRealTimers()
    }

    const lockRender = await mountSSR(LockView)
    expect(lockRender.html).not.toContain('aria-label="新建锁机配置"')
    expect(lockRender.html).toContain('lock-advanced-summary')
    expect(lockRender.html).toContain('lucide-chevron-down')
  })
})
