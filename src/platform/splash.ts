declare global {
  interface Window {
    KittenSplash?: {
      notifyReady?: () => void
    }
  }
}

let notified = false

/** Signals the native Android splash coordinator once the first view has rendered. */
export function notifyNativeSplashReady() {
  if (notified || typeof window === 'undefined') return
  notified = true
  try {
    window.KittenSplash?.notifyReady?.()
  } catch {
    // Web previews or older hosts do not expose the native splash bridge.
  }
}

export function resetSplashReadyForTests() {
  notified = false
}
