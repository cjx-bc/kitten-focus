import { effectScope } from 'vue'
import { describe, expect, it } from 'vitest'
import { useConfirmation } from '../src/components/useConfirmation'

describe('confirmation lifecycle', () => {
  it('waits for an explicit choice, clears the request and can be reused', async () => {
    const scope = effectScope()
    const dialog = scope.run(useConfirmation)!
    const accepted = dialog.confirm('Keep the recorded time', { title: 'Finish focus', danger: false })
    expect(dialog.confirmation.value).toMatchObject({ title: 'Finish focus', danger: false })
    dialog.resolveConfirmation(true)
    await expect(accepted).resolves.toBe(true)
    expect(dialog.confirmation.value).toBeNull()
    const cancelled = dialog.confirm('Delete record')
    dialog.resolveConfirmation(false)
    await expect(cancelled).resolves.toBe(false)
    scope.stop()
  })

  it('keeps the first request when another action is triggered', async () => {
    const scope = effectScope()
    const dialog = scope.run(useConfirmation)!
    const first = dialog.confirm('First action')
    await expect(dialog.confirm('Second action')).resolves.toBe(false)
    expect(dialog.confirmation.value?.message).toBe('First action')
    dialog.resolveConfirmation(true)
    await expect(first).resolves.toBe(true)
    scope.stop()
  })

  it('cancels pending actions when the owning view is disposed', async () => {
    const scope = effectScope()
    const dialog = scope.run(useConfirmation)!
    const result = dialog.confirm('Delete record')
    scope.stop()
    await expect(result).resolves.toBe(false)
    expect(dialog.confirmation.value).toBeNull()
  })
})
