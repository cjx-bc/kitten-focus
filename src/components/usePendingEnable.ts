import { onBeforeUnmount, onMounted, ref } from 'vue'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { native } from '../platform/bridge'

/** No preference is written while permission consent is pending. */
export function createPendingEnable(save: (enabled: boolean) => Promise<void>) {
  const pending = ref(false)
  let launched = false, away = false, returned = false, applying = false
  function cancel() { pending.value = false; launched = away = returned = false }
  async function request(enabled: boolean, ready: boolean) {
    cancel()
    if (enabled && !ready) { pending.value = true; return true }
    await save(enabled)
    return false
  }
  function launch() { if (pending.value) launched = true }
  function leave() { if (pending.value && launched) away = true }
  function resume() {
    if (!pending.value || !launched || !away) return false
    returned = true
    return true
  }
  async function observe(ready: boolean, granted: boolean) {
    if (!pending.value || !launched || applying) return false
    if (!ready) { if (returned && !granted) cancel(); return false }
    applying = true
    cancel()
    try { await save(true); return true } finally { applying = false }
  }
  return { pending, request, launch, leave, resume, observe, cancel }
}

export function usePendingEnable(save: (enabled: boolean) => Promise<void>, refresh: () => Promise<unknown>) {
  const gate = createPendingEnable(save)
  let listener: PluginListenerHandle | undefined, disposed = false
  const leave = () => gate.leave()
  const resume = () => { if (gate.resume()) void refresh() }
  const visibility = () => document.hidden ? leave() : resume()
  onMounted(async () => {
    window.addEventListener('blur', leave)
    window.addEventListener('focus', resume)
    document.addEventListener('visibilitychange', visibility)
    if (native) {
      const handle = await App.addListener('appStateChange', ({ isActive }) => isActive ? resume() : leave())
      if (disposed) void handle.remove(); else listener = handle
    }
  })
  onBeforeUnmount(() => {
    disposed = true; gate.cancel(); void listener?.remove()
    window.removeEventListener('blur', leave)
    window.removeEventListener('focus', resume)
    document.removeEventListener('visibilitychange', visibility)
  })
  return gate
}
