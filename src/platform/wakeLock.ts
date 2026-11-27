interface WakeLockSentinelLike {
  released?: boolean
  release(): Promise<void>
  addEventListener?(type: string, listener: () => void): void
}

export interface WebWakeLockController {
  sync(shouldKeepAwake: boolean): Promise<void>
  dispose(): Promise<void>
}

export function createWebWakeLockController(): WebWakeLockController {
  let sentinel: WakeLockSentinelLike | null = null
  let desired = false
  let pending: Promise<void> = Promise.resolve()

  async function acquire() {
    if (!desired || sentinel) return
    if (typeof document !== 'undefined' && document.hidden) return
    const nav =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & {
            wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> }
          })
        : undefined
    if (!nav?.wakeLock?.request) return
    try {
      const next = await nav.wakeLock.request('screen')
      if (!desired) {
        await next.release().catch(() => {})
        return
      }
      sentinel = next
      next.addEventListener?.('release', () => {
        if (sentinel === next) sentinel = null
      })
    } catch {
      // Headless browsers, battery saver, or unsupported contexts may reject WakeLock silently.
    }
  }

  async function release() {
    const active = sentinel
    sentinel = null
    if (!active) return
    try {
      await active.release()
    } catch {}
  }

  function onVisibilityChange() {
    if (typeof document !== 'undefined' && !document.hidden && desired) {
      pending = pending.then(() => acquire())
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  return {
    sync(shouldKeepAwake: boolean) {
      desired = shouldKeepAwake
      pending = pending.then(() => (desired ? acquire() : release()))
      return pending
    },
    dispose() {
      desired = false
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange)
      }
      pending = pending.then(() => release())
      return pending
    },
  }
}
