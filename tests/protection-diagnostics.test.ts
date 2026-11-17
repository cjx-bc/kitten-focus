import { beforeEach, expect, it, vi } from 'vitest'
import { defaultProtection } from '../src/domain/model'
import type { ProtectionPreferences } from '../src/domain/model'

// CatFocus is the agreed OS boundary: real diagnostics aggregate native observations.
const device = vi.hoisted(() => ({ values: {} as Record<string, unknown> }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
  registerPlugin: () => new Proxy({}, { get: (_target, method: string) => async () => {
    const value = device.values[method]
    if (value instanceof Error) throw value
    return structuredClone(value)
  } }),
}))
beforeEach(() => {
  device.values = {
    protectionStatus: { supported: true, authorized: true, connected: true, active: false, state: 'off', reason: '未开启' },
    observeControl: { owner: null, focus: { session: null }, rest: { session: null }, needsReconcile: false, mainEntry: { requested: false, active: false, withdrawn: false } },
    getDndStatus: { supported: true, permissionGranted: true, requested: false, phase: 'off', verified: false, ruleActive: null, recoveryPending: false, error: '' },
    getNotificationStatus: { supported: true, authorized: true, connected: true, requested: false, active: false, phase: 'off', pendingCount: 0, snoozedCount: 0, restoredCount: 0, absentCount: 0, releaseFailedCount: 0, error: '', reason: '' },
    getRecentTasksStatus: { supported: true, requested: false, active: false, verified: false, phase: 'off', recoveryPending: false, error: '' },
    getLauncherStatus: { supported: true, requested: false, active: false, verified: false, phase: 'off', recoveryPending: false, recoveryAvailable: true, error: '' },
    getWallpaperStatus: { supported: true, requested: false, active: false, verified: false, selected: false, phase: 'off', recoveryPending: false, error: '' },
    previewRecovery: { supported: true, revision: '1', pending: false, steps: [] },
  }
})

it('reports pending adapter recovery from the existing shared recovery journal', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  device.values.previewRecovery = { supported: true, revision: '2', pending: true, steps: [{ capability: 'applicationRestriction', status: 'failed', reason: '本轮撤销失败', retryable: true }] }
  const result = await readProtectionDiagnostics(defaultProtection())
  expect(result.capabilities.find(row => row.id === 'applications')).toMatchObject({ state: 'failed', recoveryPending: true, reason: expect.stringContaining('本轮撤销失败') })
})

it('shows all capability rows for valid legacy protection with absent newer fields', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  const legacy = { study: true, globalWhitelist: ['legacy.reader'] } as ProtectionPreferences
  const result = await readProtectionDiagnostics(legacy)
  expect(result.capabilities).toHaveLength(10)
  expect(result.capabilities.find(row => row.id === 'applications')).toMatchObject({ selected: true })
  expect(result.capabilities.find(row => row.id === 'navigation')).toMatchObject({ selected: false })
  expect(result.capabilities.find(row => row.id === 'dnd')).toMatchObject({ selected: false })
  expect(legacy).toEqual({ study: true, globalWhitelist: ['legacy.reader'] })
})

it('keeps authorized idle protection off and reports native wallpaper support without claiming selection', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  const result = await readProtectionDiagnostics(defaultProtection())
  expect(result.state).toBe('off')
  expect(result.capabilities.find(row => row.id === 'applications')).toMatchObject({ state: 'off', authorized: true, connected: true, requested: false, active: false })
  expect(result.capabilities.find(row => row.id === 'wallpaper')).toMatchObject({ supported: true, verified: false, active: false })
})

it('separates a configured permission gate from a disconnected active round', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  device.values.protectionStatus = { supported: true, authorized: true, connected: false, active: false, state: 'authorization', reason: '等待服务连接' }
  const preferences = { ...defaultProtection(), study: true }
  expect((await readProtectionDiagnostics(preferences)).state).toBe('authorization')
  device.values.observeControl = { owner: 'lock', lock: { session: { protection: { study: true } } }, mainEntry: {}, needsReconcile: false }
  expect((await readProtectionDiagnostics(preferences)).capabilities.find(row => row.id === 'applications')).toMatchObject({ state: 'failed', requested: true, connected: false, active: false })
})

it('does not turn an unverified sound rule or pending navigation request into protection success', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  Object.assign(device.values.getDndStatus as object, { requested: true, phase: 'requested' })
  Object.assign(device.values.protectionStatus as object, { navigation: { supported: true, authorized: true, connected: true, requested: true, active: false, state: 'armed', lastReturnedAt: null, reason: '等待实际导航' } })
  const result = await readProtectionDiagnostics({ ...defaultProtection(), dnd: true, enhancements: ['navigationHomeRecents'] })
  expect(result.capabilities.find(row => row.id === 'dnd')).toMatchObject({ state: 'ready', verified: false, active: false })
  expect(result.capabilities.find(row => row.id === 'navigation')).toMatchObject({ state: 'ready', verified: false, active: false })
  expect(result.state).toBe('ready')
})

it('keeps a failed module visible while other actual protection results remain readable', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  device.values.getDndStatus = new Error('系统拒绝读取')
  Object.assign(device.values.getRecentTasksStatus as object, { requested: true, phase: 'active', active: true, verified: true })
  const result = await readProtectionDiagnostics(defaultProtection())
  expect(result.state).toBe('failed')
  expect(result.capabilities.find(row => row.id === 'dnd')).toMatchObject({ state: 'failed', reason: expect.stringContaining('系统拒绝读取') })
  expect(result.capabilities.find(row => row.id === 'dnd')).toMatchObject({ requested: null, active: null, recoveryPending: null })
  expect(result.capabilities.find(row => row.id === 'recentTasks')).toMatchObject({ state: 'protecting', verified: true })
})

it('keeps withdrawn protections off and unresolved notification release visible as recovery work', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  Object.assign(device.values.protectionStatus as object, { navigation: { supported: true, authorized: true, connected: true, requested: true, active: false, state: 'recovered', reason: '本轮已撤销', lastReturnedAt: 1 } })
  Object.assign(device.values.getNotificationStatus as object, { requested: true, phase: 'withdrawn', recoveryPending: true, pendingCount: 1, absentCount: 2 })
  const result = await readProtectionDiagnostics({ ...defaultProtection(), interceptNotifications: true, enhancements: ['navigationHomeRecents'] })
  expect(result.capabilities.find(row => row.id === 'navigation')).toMatchObject({ state: 'off', active: false })
  expect(result.capabilities.find(row => row.id === 'notifications')).toMatchObject({ state: 'failed', recoveryPending: true, effect: expect.stringContaining('不存在不等于已恢复') })
})
it('keeps wallpaper preview unverified and restoration responsibility visible until an observed later choice resolves it', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  const preferences = { ...defaultProtection(), enhancements: ['wallpaperProtection'] }
  Object.assign(device.values.getWallpaperStatus as object, { requested: true, phase: 'picker_preview', selected: false })
  const row = async () => (await readProtectionDiagnostics(preferences)).capabilities.find(value => value.id === 'wallpaper')
  expect(await row()).toMatchObject({ state: 'ready', verified: false, active: false })
  Object.assign(device.values.getWallpaperStatus as object, { phase: 'recovery_pending', selected: true, recoveryPending: true })
  expect(await row()).toMatchObject({ state: 'failed', recoveryPending: true, active: false })
  Object.assign(device.values.getWallpaperStatus as object, { phase: 'user_choice_preserved', selected: false, recoveryPending: false })
  expect(await row()).toMatchObject({ state: 'off', recoveryPending: false, active: false })
})

it('gates mainEntry failure on mainEntry.requested rather than unrelated focus needsReconcile', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  const preferences = { ...defaultProtection(), enhancements: ['lockMainInterfaceRestricted'] }
  device.values.observeControl = {
    owner: 'focus',
    focus: { session: { id: 'f1', mode: 'countdown', strictMode: false } },
    rest: { session: null },
    needsReconcile: true,
    mainEntry: { requested: false, active: false, withdrawn: false },
  }
  const idleMain = await readProtectionDiagnostics(preferences)
  expect(idleMain.capabilities.find(row => row.id === 'mainEntry')).toMatchObject({ state: 'ready', phase: 'off' })

  device.values.observeControl = {
    owner: 'lock',
    lock: { session: { id: 'l1' } },
    focus: { session: null },
    rest: { session: null },
    needsReconcile: true,
    mainEntry: { requested: true, active: false, withdrawn: false },
  }
  const failedMain = await readProtectionDiagnostics(preferences)
  expect(failedMain.capabilities.find(row => row.id === 'mainEntry')).toMatchObject({ state: 'failed', phase: 'failed' })
})

it('does not report applications as off when controlDriver.observe rejects', async () => {
  const { readProtectionDiagnostics } = await import('../src/platform/protectionDiagnostics')
  device.values.observeControl = new Error('控制通道异常')
  const authorizedResult = await readProtectionDiagnostics(defaultProtection())
  expect(authorizedResult.capabilities.find(row => row.id === 'applications')).toMatchObject({
    requested: null,
    state: 'failed',
  })

  device.values.protectionStatus = { supported: true, authorized: false, connected: false, active: false, state: 'authorization', reason: '未授权' }
  const unauthorizedResult = await readProtectionDiagnostics(defaultProtection())
  expect(unauthorizedResult.capabilities.find(row => row.id === 'applications')).toMatchObject({
    requested: null,
    state: 'authorization',
  })
})
