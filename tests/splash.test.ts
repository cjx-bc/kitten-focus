import { afterEach, describe, expect, it, vi } from 'vitest'
import { notifyNativeSplashReady, resetSplashReadyForTests } from '../src/platform/splash'

describe('native splash bridge helper', () => {
  afterEach(() => {
    resetSplashReadyForTests()
    delete (globalThis as { window?: unknown }).window
  })

  it('calls window.KittenSplash.notifyReady() at most once', () => {
    const notifyReady = vi.fn()
    ;(globalThis as { window?: { KittenSplash?: { notifyReady?: () => void } } }).window = {
      KittenSplash: { notifyReady },
    }

    notifyNativeSplashReady()
    notifyNativeSplashReady()

    expect(notifyReady).toHaveBeenCalledTimes(1)
  })

  it('is a safe no-op when KittenSplash is absent or throws', () => {
    ;(globalThis as { window?: { KittenSplash?: { notifyReady?: () => void } } }).window = {}
    expect(() => notifyNativeSplashReady()).not.toThrow()

    resetSplashReadyForTests()
    ;(globalThis as { window?: { KittenSplash?: { notifyReady?: () => void } } }).window = {
      KittenSplash: {
        notifyReady() {
          throw new Error('bridge unavailable')
        },
      },
    }
    expect(() => notifyNativeSplashReady()).not.toThrow()
  })
})
