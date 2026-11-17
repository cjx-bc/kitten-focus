import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { emptyData, type ActiveFocus, type FocusRecord, type FocusSnapshot } from '../src/domain/model'

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
