import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defaultProtection, emptyData, type ActiveFocus, type CalendarEvent, type FocusRecord, type FocusSnapshot } from '../src/domain/model'
import { toggleMasterStudy, toggleProtectionModule } from '../src/domain/protectionModules'
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

function createMemoryStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', createMemoryStorage())
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
  vi.unstubAllGlobals()
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
    expect(app.strictConfirmation).toBeNull()
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
    await vi.waitFor(() => expect(app.strictConfirmation).toEqual({ title: '自由专注', minutes: 25 }))
    await app.mutate(d => {
      d.preferences.protection = toggleProtectionModule(d.preferences.protection ?? defaultProtection(), 'strict', false)
    })
    app.confirmStrictStart(true)
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

  it('manages strictConfirmation and strictAcknowledged across stopwatch, countdown confirmation, and mutate(!strict)', async () => {
    const { useApp } = await import('../src/stores/app')
    const data = emptyData()
    data.preferences.protection = toggleMasterStudy(
      toggleProtectionModule(defaultProtection(), 'strict', true),
      true,
    )
    mocks.load.mockResolvedValueOnce(data)

    const app = useApp()
    await app.init()
    expect(app.strictAcknowledged).toBe(false)

    // Stopwatch ignores strict confirmation and leaves strictAcknowledged untouched
    await app.start(null, 'stopwatch', 25)
    expect(app.strictConfirmation).toBeNull()
    expect(mocks.focusStart.mock.lastCall?.[1]).toBe(false)
    expect(app.strictAcknowledged).toBe(false)

    mocks.focusAction.mockResolvedValueOnce({ session: null, elapsedMs: 0 })
    await app.action('finish')

    // Cancelling strict countdown confirmation rejects without starting or persisting ack
    const cancelled = app.start(null, 'countdown', 25)
    await vi.waitFor(() => expect(app.strictConfirmation).toEqual({ title: '自由专注', minutes: 25 }))
    app.confirmStrictStart(false)
    await expect(cancelled).rejects.toThrow('已取消开始专注')
    expect(mocks.focusStart).toHaveBeenCalledTimes(1)
    expect(app.strictAcknowledged).toBe(false)
    expect(localStorage.getItem('xiaomao-strict-acknowledged')).toBeNull()

    // Confirming strict countdown sets strictAcknowledged and bypasses subsequent prompts
    const confirmed = app.start(null, 'countdown', 25)
    await vi.waitFor(() => expect(app.strictConfirmation).toEqual({ title: '自由专注', minutes: 25 }))
    app.confirmStrictStart(true)
    await confirmed
    expect(mocks.focusStart.mock.lastCall?.[1]).toBe(true)
    expect(app.strictAcknowledged).toBe(true)
    expect(localStorage.getItem('xiaomao-strict-acknowledged')).toBe('1')

    mocks.focusAction.mockResolvedValueOnce({ session: null, elapsedMs: 0 })
    await app.action('finish')

    await app.start(null, 'countdown', 25)
    expect(app.strictConfirmation).toBeNull()
    expect(mocks.focusStart.mock.lastCall?.[1]).toBe(true)

    // Turning off strict via mutate clears strictAcknowledged
    await app.mutate((d) => {
      d.preferences.protection = toggleProtectionModule(
        d.preferences.protection ?? defaultProtection(),
        'strict',
        false,
      )
    })
    expect(app.strictAcknowledged).toBe(false)
    expect(localStorage.getItem('xiaomao-strict-acknowledged')).toBeNull()
    app.dispose()
  })

  it('clears strictAcknowledged on legacy init() and restore(), requiring fresh confirmation', async () => {
    const { useApp } = await import('../src/stores/app')

    // Legacy init() without protection.modules clears stale localStorage acknowledgment
    localStorage.setItem('xiaomao-strict-acknowledged', '1')
    const legacyData = emptyData()
    const legacyProtection: any = { ...defaultProtection(), strict: true }
    delete legacyProtection.modules
    legacyData.preferences.protection = legacyProtection
    mocks.load.mockResolvedValueOnce(legacyData)

    const app = useApp()
    expect(app.strictAcknowledged).toBe(true)
    await app.init()
    expect(app.strictAcknowledged).toBe(false)
    expect(localStorage.getItem('xiaomao-strict-acknowledged')).toBeNull()

    const firstStart = app.start(null, 'countdown', 25)
    await vi.waitFor(() => expect(app.strictConfirmation).toEqual({ title: '自由专注', minutes: 25 }))
    app.confirmStrictStart(true)
    await firstStart
    expect(app.strictAcknowledged).toBe(true)
    expect(localStorage.getItem('xiaomao-strict-acknowledged')).toBe('1')

    mocks.focusAction.mockResolvedValueOnce({ session: null, elapsedMs: 0 })
    await app.action('finish')

    // restore() clears strictAcknowledged even when restored backup enables strict
    const restored = emptyData()
    restored.preferences.protection = toggleMasterStudy(
      toggleProtectionModule(defaultProtection(), 'strict', true),
      true,
    )
    await app.restore(restored)
    expect(app.strictAcknowledged).toBe(false)
    expect(localStorage.getItem('xiaomao-strict-acknowledged')).toBeNull()

    const afterRestore = app.start(null, 'countdown', 25)
    await vi.waitFor(() => expect(app.strictConfirmation).toEqual({ title: '自由专注', minutes: 25 }))
    app.confirmStrictStart(false)
    await expect(afterRestore).rejects.toThrow('已取消开始专注')
    app.dispose()
  })

  it('clearUnreadyProtections disables modules.apps.enabled and legacy study flag while keeping other modules', async () => {
    const { useApp } = await import('../src/stores/app')
    const data = emptyData()
    let protection = toggleProtectionModule(defaultProtection(), 'apps', true)
    protection = toggleProtectionModule(protection, 'strict', true)
    protection = toggleMasterStudy(protection, true)
    data.preferences.protection = protection
    mocks.load.mockResolvedValueOnce(data)

    const app = useApp()
    await app.init()
    expect(app.data.preferences.protection?.modules?.apps.enabled).toBe(true)
    expect(app.data.preferences.protection?.study).toBe(true)

    await app.clearUnreadyProtections(['applications'], true)
    expect(app.data.preferences.protection?.modules?.apps.enabled).toBe(false)
    expect(app.data.preferences.protection?.study).toBe(false)
    expect(app.data.preferences.protection?.modules?.strict.enabled).toBe(true)
    expect(app.toast).toBe('')

    await app.mutate((d) => {
      d.preferences.protection = toggleProtectionModule(
        d.preferences.protection ?? defaultProtection(),
        'apps',
        true,
      )
    })
    await app.clearUnreadyProtections(['applications'])
    expect(app.data.preferences.protection?.modules?.apps.enabled).toBe(false)
    expect(app.toast).toBe('已关闭未就绪的保护项，请重新点击开始专注')
    app.dispose()
  })

  it('initializes pet retroCutoffAt on legacy load, supports updateRecordNote (<=100 code points) and cancel/dismissResult', async () => {
    const { useApp } = await import('../src/stores/app')
    const legacy = emptyData()
    legacy.records.push(makeRecord('legacy-1'))
    mocks.load.mockResolvedValueOnce(legacy)

    const app = useApp()
    await app.init()
    expect(app.data.pet?.selectedAnimalId).toBe('black-cat')
    expect(typeof app.data.pet?.retroCutoffAt).toBe('number')
    expect(mocks.save).toHaveBeenCalled()

    app.lastResult = legacy.records[0]
    await expect(app.updateRecordNote('legacy-1', 'x'.repeat(101))).rejects.toThrow('100')
    await app.updateRecordNote('legacy-1', '刷题很顺利')
    expect(app.data.records[0]?.note).toBe('刷题很顺利')
    expect(app.lastResult?.note).toBe('刷题很顺利')

    app.dismissResult()
    expect(app.lastResult).toBeUndefined()

    mocks.focusAction.mockResolvedValueOnce({ session: null, elapsedMs: 0 })
    await app.action('cancel')
    expect(mocks.focusAction).toHaveBeenLastCalledWith('cancel')
    expect(app.lastResult).toBeUndefined()
    app.dispose()
  })

  it('initializes pet.retroCutoffAt when restoring a pre-v2 backup with historical early records (no retroactive penalty)', async () => {
    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    await app.init()

    const legacyBackup = emptyData()
    delete legacyBackup.pet
    const completed = makeRecord('hist-done')
    completed.durationMs = 25 * 60_000
    completed.targetMs = 25 * 60_000
    completed.startedAt = 1_000
    completed.endedAt = 1_501_000
    completed.segments = [{ start: 1_000, end: 1_501_000 }]
    const early1: FocusRecord = {
      ...makeRecord('hist-early-1'),
      startedAt: 2_000_000,
      endedAt: 2_300_000,
      durationMs: 300_000,
      segments: [{ start: 2_000_000, end: 2_300_000 }],
      status: 'early',
    }
    const early2: FocusRecord = {
      ...makeRecord('hist-early-2'),
      startedAt: 3_000_000,
      endedAt: 3_300_000,
      durationMs: 300_000,
      segments: [{ start: 3_000_000, end: 3_300_000 }],
      status: 'early',
    }
    legacyBackup.records.push(completed, early1, early2)

    await app.restore(legacyBackup)

    expect(app.data.pet?.selectedAnimalId).toBe('black-cat')
    expect(typeof app.data.pet?.retroCutoffAt).toBe('number')
    expect(app.petProjection.affection).toBe(5)
    expect(app.petProjection.affection).toBeGreaterThanOrEqual(0)
    expect(app.petProjection.recordEffects.get('hist-early-1')?.retroactive).toBe(true)
    expect(app.petProjection.recordEffects.get('hist-early-1')?.affectionDelta).toBe(0)
    expect(app.petProjection.recordEffects.get('hist-early-2')?.affectionDelta).toBe(0)
    app.dispose()
  })

  it('pauses white noise on noisy disconnect without wiping preferences.whiteNoise', async () => {
    const { useApp } = await import('../src/stores/app')
    const data = emptyData()
    data.preferences.whiteNoise = 'waves'
    mocks.load.mockResolvedValueOnce(data)

    const app = useApp()
    await app.init()

    await app.start(null, 'countdown', 25)
    app.pauseWhiteNoiseForNoisy()

    expect(app.whiteNoiseNoisyPaused).toBe(true)
    expect(app.data.preferences.whiteNoise).toBe('waves')

    app.clearWhiteNoiseNoisyPause()
    expect(app.whiteNoiseNoisyPaused).toBe(false)
    expect(app.data.preferences.whiteNoise).toBe('waves')
    app.dispose()
  })
})
