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
  controlDriver: { observe: mocks.controlObserve },
  protectionDriver: {
    status: mocks.protection,
    openSettings: vi.fn(),
    recentTasks: mocks.recent,
    launcher: mocks.launcher,
    wallpaper: mocks.wallpaper,
    prepareWallpaper: mocks.prepareWallpaper,
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
import StrictModeSetting from '../src/components/StrictModeSetting.vue'
import LockMainEntrySetting from '../src/components/LockMainEntrySetting.vue'
import WallpaperSetting from '../src/components/WallpaperSetting.vue'

async function mountSSR(component: Component, props = {}) {
  const vnode = h(component, props)
  const app = createSSRApp({ render: () => vnode })
  app.component('RouterLink', defineComponent({ props: { to: String }, setup: (p, ctx) => () => h('a', { href: p.to }, ctx.slots.default?.()) }))
  const html = await renderToString(app)
  return { state: (vnode.component as any).setupState, html }
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
    lastResult: undefined,
    start: vi.fn(async () => {}),
    startLock: vi.fn(async () => {}),
    finishLock: vi.fn(async () => {}),
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

    const formatted = state.pieOption.tooltip.formatter({ name: '<img src=x onerror=1>&"\'', value: 60000, percent: 100 })
    expect(formatted).toContain('&lt;img src=x onerror=1&gt;&amp;&quot;&#39;')
    expect(formatted).not.toContain('<img')
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

  it('CalendarView fixes changeScope allDay restoration, coursePosition overflow, and startFromEvent cancellation', async () => {
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
    expect(afterLast.color).toBe('#222')
    expect(afterLast.borderLeft).toBe('3px solid #ffee00')

    const spanningPastEnd = state.coursePosition({ ...occ, kind: 'course', start: '2026-11-17T19:00', end: '2026-11-17T23:00', color: '#ef4e36' })
    expect(spanningPastEnd.gridRow).toBe('10 / span 2')

    state.showDetail(occ)
    mocks.app.start.mockRejectedValueOnce(new Error('已取消开始专注'))
    await state.startFromEvent()
    expect(state.error).toBe('')
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

    await state.saveEvent()

    expect(mocks.app.saveEvent).toHaveBeenCalledWith(expect.objectContaining({
      start: '2026-11-18T09:00', repeat: 'none', until: '',
    }), source, scope)
  })

  it('CalendarView warns about clashes with the real weekly occurrence and lets the user save', async () => {
    mocks.app.data.events.push({
      id: 'existing', title: '实验', start: '2026-11-18T09:30', end: '2026-11-18T10:30',
      allDay: false, note: '', repeat: 'none', weekdays: [], until: '', itemId: null, reminderMinutes: null,
    })
    mocks.app.saveEvent = vi.fn(async () => {})
    const { state } = await mountSSR(CalendarView)
    state.day = '2026-11-16'
    state.newEvent()
    Object.assign(state.eventForm, { title: '复习', repeat: 'weekly', weekdays: [3] })

    const saving = state.saveEvent()

    expect(state.confirmation?.message).toContain('实验')
    expect(mocks.app.saveEvent).not.toHaveBeenCalled()
    state.resolveConfirmation(true)
    await saving
    expect(mocks.app.saveEvent).toHaveBeenCalledOnce()
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
    await state.saveEvent()
    expect(mocks.app.saveEvent).toHaveBeenCalledOnce()

    state.eventForm.start = '2026-11-24T09:00'
    state.eventForm.end = '2026-11-24T10:00'
    const saving = state.saveEvent()
    expect(state.confirmation?.message).toContain('复习')
    state.resolveConfirmation(false)
    await expect(saving).rejects.toThrow('可以调整时间')
    expect(mocks.app.saveEvent).toHaveBeenCalledOnce()
  })

  it('reverts checkbox checked state on error across SettingsView, StrictModeSetting, and LockMainEntrySetting', async () => {
    mocks.app.mutate.mockRejectedValueOnce(new Error('保存失败'))
    const settings = (await mountSSR(SettingsView)).state
    const soundTarget = { checked: false }
    await settings.preference('sound', { target: soundTarget })
    expect(soundTarget.checked).toBe(true)
    expect(mocks.app.notify).toHaveBeenCalledWith('保存失败')

    mocks.app.mutate.mockRejectedValueOnce(new Error('写入失败'))
    const strict = (await mountSSR(StrictModeSetting)).state
    const strictTarget = { checked: true }
    await strict.change({ target: strictTarget })
    expect(strictTarget.checked).toBe(false)
    expect(strict.error).toBe('写入失败')

    const lockMain = (await mountSSR(LockMainEntrySetting)).state
    const lockTarget = { checked: true }
    await lockMain.toggle({ target: lockTarget })
    expect(lockTarget.checked).toBe(false)
  })

  it('WallpaperSetting fails prepare cleanly when the native action fails and uses a distinct disable toast', async () => {
    const { state } = await mountSSR(WallpaperSetting)
    await state.refresh()
    state.showConsent()
    state.limitsAccepted = true
    state.originalMatches = true
    mocks.prepareWallpaper.mockRejectedValueOnce(new Error('壁纸原状态保存失败'))
    await state.prepare()
    expect(state.consentOpen).toBe(true)
    expect(state.error).toBe('壁纸原状态保存失败')
    expect(mocks.app.notify).not.toHaveBeenCalled()

    mocks.app.data.preferences.protection.enhancements = ['wallpaperProtection']
    mocks.wallpaper.mockResolvedValue({ supported: true, prepared: true, phase: 'baseline_ready', current: {} })
    await state.refresh()
    await state.toggle({ target: { checked: false } })
    expect(mocks.app.notify).toHaveBeenCalledWith('壁纸偏好已关闭，将用于下一轮')
  })

  it('LockView isolates background loadError from sheetError and clears sheetError on open/close', async () => {
    const { state } = await mountSSR(LockView)
    mocks.protection.mockRejectedValueOnce(new Error('网络超时'))
    await state.refresh()
    expect(state.loadError).toBe('网络超时')
    expect(state.sheetError).toBe('')

    state.edit()
    state.draft.name = ''
    await state.save()
    expect(state.sheetError).toBe('请填写锁机名称')
    expect(state.loadError).toBe('网络超时')
    state.closeDraft()
    expect(state.sheetError).toBe('')
  })
})
