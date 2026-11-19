import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defaultProtection, emptyData, type ActiveFocus, type CalendarEvent, type FocusRecord, type FocusSnapshot } from '../src/domain/model'
import { occurrences } from '../src/domain/calendar'

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  replace: vi.fn(),
  syncReminders: vi.fn(),
  focusStart: vi.fn(),
  focusAction: vi.fn(),
  restRead: vi.fn(),
  restStart: vi.fn(),
  restExit: vi.fn(),
  lockStart: vi.fn(),
  lockRead: vi.fn(),
  lockFinish: vi.fn(),
  protectionApps: vi.fn(),
  protectionStatus: vi.fn(),
  permissionStatus: vi.fn(),
}))

vi.mock('../src/platform/bridge', () => ({
  repository: {
    load: (...args: unknown[]) => mocks.load(...args),
    save: (...args: unknown[]) => mocks.save(...args),
    replace: (...args: unknown[]) => mocks.replace(...args),
  },
  syncReminders: (...args: unknown[]) => mocks.syncReminders(...args),
  focusDriver: {
    start: (...args: unknown[]) => mocks.focusStart(...args),
    action: (...args: unknown[]) => mocks.focusAction(...args),
  },
  restDriver: {
    read: (...args: unknown[]) => mocks.restRead(...args),
    start: (...args: unknown[]) => mocks.restStart(...args),
    exit: (...args: unknown[]) => mocks.restExit(...args),
  },
  lockDriver: {
    start: (...args: unknown[]) => mocks.lockStart(...args),
    read: (...args: unknown[]) => mocks.lockRead(...args),
    finish: (...args: unknown[]) => mocks.lockFinish(...args),
  },
  protectionDriver: {
    apps: (...args: unknown[]) => mocks.protectionApps(...args),
    status: (...args: unknown[]) => mocks.protectionStatus(...args),
  },
  permissionStatus: (...args: unknown[]) => mocks.permissionStatus(...args),
}))

function makeRecord(id = 'f1'): FocusRecord {
  return {
    id,
    itemId: null,
    themeId: null,
    title: '自由专注',
    themeName: '自由专注',
    color: '#222222',
    mode: 'countdown',
    targetMs: 60000,
    startedAt: 1000,
    endedAt: 61000,
    timeZone: 'UTC',
    durationMs: 60000,
    pausedMs: 0,
    segments: [{ start: 1000, end: 61000 }],
    status: 'completed',
  }
}

function makeSession(id = 'f1'): ActiveFocus {
  return {
    id,
    itemId: null,
    themeId: null,
    title: '自由专注',
    themeName: '自由专注',
    color: '#222222',
    mode: 'countdown',
    targetMs: 60000,
    startedAt: 1000,
    timeZone: 'UTC',
    state: 'running',
    elapsedMs: 0,
    pausedMs: 0,
    anchorMono: 1000,
    anchorEpoch: 1000,
    bootId: 0,
    segments: [],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  vi.useFakeTimers()
  mocks.load.mockResolvedValue(emptyData())
  mocks.save.mockResolvedValue(undefined)
  mocks.replace.mockResolvedValue(undefined)
  mocks.syncReminders.mockResolvedValue(undefined)
  mocks.focusAction.mockResolvedValue({ session: null, elapsedMs: 0 } satisfies FocusSnapshot)
  mocks.focusStart.mockImplementation(async (session: ActiveFocus) => ({ session, elapsedMs: 0 }))
  mocks.restRead.mockResolvedValue({ session: null, remainingMs: 0 })
  mocks.lockRead.mockResolvedValue({ session: null, remainingMs: 0, records: [] })
  mocks.lockStart.mockResolvedValue({
    session: { id: 'lock1', configurationId: 'c1', name: '锁机', targetMs: 60000, startedAt: 1000, strictMode: false, protection: { study: false, source: 'global', whitelist: [] } },
    remainingMs: 60000,
    records: [],
  })
  mocks.protectionApps.mockResolvedValue([])
  mocks.protectionStatus.mockResolvedValue({ supported: false })
  mocks.permissionStatus.mockResolvedValue({ notifications: false, exactAlarms: false })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('app store resilience fixes', () => {
  it('never publishes protection or lock settings from a failed write', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    const data = emptyData()
    data.lockConfigurations = [{ id: 'c1', name: '阅读', minutes: 5, strict: false, whitelist: { source: 'global' } }]
    mocks.load.mockResolvedValueOnce(data)
    await app.init()

    mocks.save.mockRejectedValueOnce(new Error('磁盘繁忙'))
    const failed = app.mutate(d => {
      d.preferences.protection = { ...defaultProtection(), strict: true }
      d.lockConfigurations![0]!.minutes = 45
    })
    const subsequent = app.mutate(d => { d.preferences.defaultMinutes = 30 })
    await expect(failed).rejects.toThrow('磁盘繁忙')
    expect(app.data.preferences.protection?.strict).not.toBe(true)
    expect(app.data.lockConfigurations?.[0]?.minutes).toBe(5)
    await subsequent
    expect(mocks.save.mock.lastCall?.[0].lockConfigurations[0].minutes).toBe(5)
    expect(mocks.save.mock.lastCall?.[0].preferences.protection?.strict).not.toBe(true)
    await app.start(null, 'countdown', 25)
    expect(app.startConfirmation).toBeNull()
    expect(mocks.focusStart.mock.lastCall?.[1]).toBe(false)
    app.dispose()
  })

  it('keeps a committed change when reminder synchronization fails', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    await app.init()
    mocks.syncReminders.mockRejectedValueOnce(new Error('提醒服务暂不可用'))
    await expect(app.mutate(d => { d.preferences.defaultMinutes = 30 })).resolves.toBeUndefined()
    expect(app.data.preferences.defaultMinutes).toBe(30)
    expect(app.error).toBe('')
    expect(app.toast).toContain('提醒同步')
    await app.startLock('c1')
    expect(app.lock.session).not.toBeNull()
    app.dispose()
  })

  it('requires new confirmation when saved protection changes before start', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    const data = emptyData()
    data.preferences.protection = { ...defaultProtection(), strict: true }
    mocks.load.mockResolvedValueOnce(data)
    await app.init()
    const pending = app.start(null, 'countdown', 25)
    await vi.waitFor(() => expect(app.startConfirmation?.strict).toBe(true))
    await app.mutate(d => { d.preferences.protection!.strict = false })
    app.confirmStart(true)
    await expect(pending).rejects.toThrow('配置已变化')
    expect(mocks.focusStart).not.toHaveBeenCalled()

    const confirmationData = app.data
    const save = app.mutate(d => { d.preferences.protection!.globalWhitelist = ['reader.example'] })
    const lock = app.startLock('c1', false, confirmationData)
    const rejected = expect(lock).rejects.toThrow('锁机配置已变化')
    await save
    await rejected
    expect(mocks.lockStart).not.toHaveBeenCalled()
    app.dispose()
  })

  it('keeps a moved occurrence after the cutoff and clears old exceptions when converting the series', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    const data = emptyData()
    const series: CalendarEvent = {
      id: 'e1', title: '复习', start: '2026-11-17T09:00', end: '2026-11-17T10:00',
      allDay: false, note: '', repeat: 'weekly', weekdays: [2], until: '2026-11-17',
      itemId: null, reminderMinutes: null,
    }
    data.events.push(series)
    mocks.load.mockResolvedValueOnce(data)
    await app.init()
    const source = occurrences(app.data, '2026-11-17', '2026-11-17')[0]!
    const moved = { ...series, start: '2026-11-18T09:00', end: '2026-11-18T10:00' }

    await app.saveEvent(moved, source, 'once')
    expect(app.data.events).toEqual([series])
    expect(occurrences(app.data, '2026-11-18', '2026-11-18')).toHaveLength(1)
    await app.saveEvent({ ...moved, repeat: 'none' }, source, 'all')
    expect(app.data.events[0]?.until).toBe('')
    expect(app.data.eventExceptions).toEqual([])
    expect(occurrences(app.data, '2026-11-18', '2026-11-18')).toHaveLength(1)
    app.dispose()
  })

  it('does not poison start, startLock, or restore after a transient save failure', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    await app.init()

    mocks.save.mockRejectedValueOnce(new Error('磁盘繁忙'))
    await expect(
      app.saveTheme({ id: 't1', name: '阅读', color: '#222222', order: 0, collapsed: false }),
    ).rejects.toThrow('磁盘繁忙')

    await expect(app.start(null, 'countdown', 25)).resolves.toBeUndefined()
    expect(app.focus.session).not.toBeNull()

    mocks.focusAction.mockResolvedValueOnce({ session: null, elapsedMs: 0 })
    await app.action('finish')

    await expect(app.startLock('c1')).resolves.toBeUndefined()
    expect(app.lock.session).not.toBeNull()

    app.lock = { session: null, remainingMs: 0, records: [] }
    mocks.save.mockRejectedValueOnce(new Error('临时写入失败'))
    await expect(
      app.saveTheme({ id: 't2', name: '写作', color: '#333333', order: 1, collapsed: false }),
    ).rejects.toThrow('临时写入失败')
    await expect(app.restore(emptyData())).resolves.toBeUndefined()
    app.dispose()
  })

  it('keeps init ready and polling active when syncReminders rejects', async () => {
    const { useApp } = await import('../src/stores/app')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mocks.syncReminders.mockRejectedValueOnce(new Error('通知服务不可用'))
    const app = useApp()

    await app.init()

    expect(app.ready).toBe(true)
    expect(app.error).toBe('')
    expect(app.toast).toContain('提醒同步')

    const callsBefore = mocks.focusAction.mock.calls.length
    await vi.advanceTimersByTimeAsync(800)
    expect(mocks.focusAction.mock.calls.length).toBeGreaterThan(callsBefore)

    warn.mockRestore()
    app.dispose()
  })

  it('recovers ready, error, and polling when restore runs after a failed init', async () => {
    const { useApp } = await import('../src/stores/app')
    mocks.load.mockRejectedValueOnce(new Error('损坏的数据库'))
    const app = useApp()

    await app.init()
    expect(app.ready).toBe(false)
    expect(app.error).toContain('本地数据读取失败')

    await app.restore(emptyData())
    expect(app.ready).toBe(true)
    expect(app.error).toBe('')

    const callsBefore = mocks.focusAction.mock.calls.length
    await vi.advanceTimersByTimeAsync(800)
    expect(mocks.focusAction.mock.calls.length).toBeGreaterThan(callsBefore)
    app.dispose()
  })

  it('preserves lastResult when focusDriver.start throws and records finished result before persist errors', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    await app.init()

    const previous = makeRecord('prev')
    app.lastResult = previous
    mocks.focusStart.mockRejectedValueOnce(new Error('需要 Android 本机'))
    await expect(app.start(null, 'countdown', 25)).rejects.toThrow('需要 Android 本机')
    expect(app.lastResult).toEqual(previous)

    const active = makeSession('cur')
    mocks.focusStart.mockResolvedValueOnce({ session: active, elapsedMs: 0 })
    await app.start(null, 'countdown', 25)
    expect(app.lastResult).toBeUndefined()

    const finishedRecord = makeRecord('cur')
    mocks.focusAction.mockResolvedValueOnce({
      session: null,
      elapsedMs: 60000,
      record: finishedRecord,
    })
    mocks.save.mockRejectedValueOnce(new Error('保存超时'))

    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    await expect(app.action('finish')).rejects.toThrow('保存超时')
    expect(app.lastResult).toEqual(finishedRecord)
    expect(vibrate).toHaveBeenCalledWith(150)

    vi.unstubAllGlobals()
    app.dispose()
  })
})
