import { onScopeDispose, ref } from 'vue'

export interface ConfirmationRequest {
  title: string
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
}

export function useConfirmation() {
  const confirmation = ref<ConfirmationRequest | null>(null)
  let pending: ((accepted: boolean) => void) | undefined

  function confirm(message: string, options: Partial<Omit<ConfirmationRequest, 'message'>> = {}) {
    if (pending) return Promise.resolve(false)
    confirmation.value = {
      title: '确认删除？', message, confirmLabel: '删除', cancelLabel: '取消', danger: true,
      ...options,
    }
    return new Promise<boolean>((resolve) => { pending = resolve })
  }

  function resolveConfirmation(accepted: boolean) {
    const resolve = pending
    pending = undefined
    confirmation.value = null
    resolve?.(accepted)
  }

  onScopeDispose(() => resolveConfirmation(false))
  return { confirmation, confirm, resolveConfirmation }
}
