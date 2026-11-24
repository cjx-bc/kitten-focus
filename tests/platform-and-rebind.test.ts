import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defaultProtection, emptyData, type AppData } from '../src/domain/model'
import { toggleMasterStudy, toggleProtectionModule } from '../src/domain/protectionModules'

function buildNotificationData(interceptNotifications: boolean): AppData {
  const data = emptyData()
  let protection = toggleMasterStudy(defaultProtection(), true)
  protection = toggleProtectionModule(protection, 'quiet', interceptNotifications)
  data.preferences.protection = protection
  return data
}

describe('CatFocus plugin registration singleton and notification listener auto-rebind', () => {
  beforeEach(() => {
    vi.resetModules()
    setActivePinia(createPinia())
  })

  it('registers the native CatFocus Capacitor plugin only once across all platform modules', async () => {
    const registerPlugin = vi.fn(() => ({}))
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => false },
      registerPlugin,
    }))

    await import('../src/platform/bridge')
    await import('../src/platform/dnd')
    await import('../src/platform/notifications')

    expect(registerPlugin).toHaveBeenCalledTimes(1)
    expect(registerPlugin).toHaveBeenCalledWith('CatFocus')
  })

  it('automatically rebinds an authorized disconnected notification listener before starting focus or lock', async () => {
    const readNotification = vi
      .fn()
      .mockResolvedValueOnce({ supported: true, authorized: true, connected: false })
      .mockResolvedValueOnce({ supported: true, authorized: true, connected: true })
    const rebind = vi.fn(async () => {})
    const startFocus = vi.fn(async (session) => ({ session, elapsedMs: 0 }))
    const startLock = vi.fn(async (configurationId: string) => ({
      session: {
        id: 'l1',
        configurationId,
        title: '测试锁机',
        mode: 'countdown' as const,
        state: 'running' as const,
        targetMs: 600000,
        startedAt: 1000,
        strictMode: false,
      },
      remainingMs: 600000,
      records: [],
    }))

    vi.doMock('../src/platform/notifications', () => ({
      notificationDriver: {
        read: readNotification,
        openSettings: vi.fn(async () => {}),
        rebind,
      },
    }))
    vi.doMock('../src/platform/bridge', () => ({
      repository: {
        load: vi.fn(async () => buildNotificationData(true)),
        save: vi.fn(async () => {}),
        replace: vi.fn(async () => {}),
      },
      syncReminders: vi.fn(async () => {}),
      focusDriver: {
        start: startFocus,
        action: vi.fn(async () => ({ session: null, elapsedMs: 0 })),
      },
      restDriver: {
        read: vi.fn(async () => ({ session: null, remainingMs: 0 })),
        start: vi.fn(async () => ({ session: null, remainingMs: 0 })),
        exit: vi.fn(async () => ({ session: null, remainingMs: 0 })),
      },
      lockDriver: {
        start: startLock,
        read: vi.fn(async () => ({ session: null, remainingMs: 0, records: [] })),
        finish: vi.fn(async () => ({ session: null, remainingMs: 0, records: [] })),
      },
      protectionDriver: {
        apps: vi.fn(async () => []),
        status: vi.fn(async () => ({})),
      },
      permissionStatus: vi.fn(async () => ({ notifications: true, exactAlarms: true })),
    }))

    const { useApp } = await import('../src/stores/app')
    const app = useApp()
    await app.init()

    await app.start(null, 'countdown', 25)
    expect(rebind).toHaveBeenCalledTimes(1)
    expect(startFocus).toHaveBeenCalledTimes(1)

    // Subsequent startLock sees already-connected listener and does not call rebind again.
    readNotification.mockReset()
    readNotification.mockResolvedValue({ supported: true, authorized: true, connected: true })
    await app.startLock('cfg-1')
    expect(rebind).toHaveBeenCalledTimes(1)
    expect(startLock).toHaveBeenCalledTimes(1)
    app.dispose()
  })
})
