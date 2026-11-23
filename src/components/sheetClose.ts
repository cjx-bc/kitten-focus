import { nextTick } from 'vue'

export async function waitForDialogClose(timeoutMs = 180): Promise<void> {
  if (typeof document === 'undefined') return
  await nextTick()
  const hasOpenDialog = () => document.querySelectorAll('dialog[open]').length > 0
  if (!hasOpenDialog()) return
  if (timeoutMs <= 0) return

  await new Promise<void>((resolve) => {
    let settled = false
    let observer: MutationObserver | undefined
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      observer?.disconnect()
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    if (typeof MutationObserver !== 'undefined' && document.body) {
      observer = new MutationObserver(() => {
        if (!hasOpenDialog()) finish()
      })
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ['open'],
        childList: true,
        subtree: true,
      })
    }
  })
}
