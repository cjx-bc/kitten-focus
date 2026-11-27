import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebWakeLockController } from '../src/platform/wakeLock'

describe('createWebWakeLockController', () => {
  const originalNavigator = globalThis.navigator
  const originalDocument = globalThis.document

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true })
    Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true })
  })

  it('requests screen wake lock when running and releases on pause/stop or dispose', async () => {
    const release = vi.fn(async () => {})
    const addEventListener = vi.fn()
    const request = vi.fn(async () => ({ released: false, release, addEventListener }))
    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request } },
      configurable: true,
    })

    const controller = createWebWakeLockController()
    await controller.sync(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('screen')

    // Calling sync(true) again while held should not duplicate requests
    await controller.sync(true)
    expect(request).toHaveBeenCalledTimes(1)

    // Paused / exited / keepScreenOn=false -> releases lock
    await controller.sync(false)
    expect(release).toHaveBeenCalledTimes(1)

    // Re-acquires on resume
    await controller.sync(true)
    expect(request).toHaveBeenCalledTimes(2)

    await controller.dispose()
    expect(release).toHaveBeenCalledTimes(2)
  })

  it('gracefully no-ops when navigator.wakeLock is unavailable or rejects', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    })
    const controller = createWebWakeLockController()
    await expect(controller.sync(true)).resolves.toBeUndefined()
    await expect(controller.sync(false)).resolves.toBeUndefined()

    Object.defineProperty(globalThis, 'navigator', {
      value: { wakeLock: { request: vi.fn(async () => { throw new Error('NotAllowedError') }) } },
      configurable: true,
    })
    await expect(controller.sync(true)).resolves.toBeUndefined()
    await controller.dispose()
  })
})
