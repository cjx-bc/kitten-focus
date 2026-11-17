import { describe, expect, it, vi } from 'vitest'
import { createPendingEnable } from '../src/components/usePendingEnable'

describe('pending permission enable', () => {
  it('does not infer consent from a status refresh before launching settings', async () => {
    const save = vi.fn(async () => {})
    const gate = createPendingEnable(save)
    expect(await gate.request(true, false)).toBe(true)
    await gate.observe(true, true)
    expect(save).not.toHaveBeenCalled()
    gate.cancel()
    expect(gate.pending.value).toBe(false)
  })
  it('does not mistake focus changes before leaving settings for a rejection', async () => {
    const save = vi.fn(async () => {})
    const gate = createPendingEnable(save)
    await gate.request(true, false)
    gate.launch(); gate.resume()
    await gate.observe(false, false)
    expect(gate.pending.value).toBe(true)
    gate.leave(); gate.resume()
    await gate.observe(false, false)
    expect(gate.pending.value).toBe(false)
    await gate.observe(true, true)
    expect(save).not.toHaveBeenCalled()
  })
  it('waits for the service after permission is granted and saves once under concurrent refreshes', async () => {
    let finish!: () => void
    const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const gate = createPendingEnable(save)
    await gate.request(true, false)
    gate.launch(); gate.leave(); gate.resume()
    await gate.observe(false, true)
    expect(gate.pending.value).toBe(true)
    const first = gate.observe(true, true)
    await gate.observe(true, true)
    expect(save).toHaveBeenCalledTimes(1)
    finish()
    await first
  })
  it('switching off cancels an outstanding enable so later grant results cannot reactivate it', async () => {
    const save = vi.fn(async () => {})
    const gate = createPendingEnable(save)
    await gate.request(true, false)
    gate.launch()
    await gate.request(false, false)
    gate.leave(); gate.resume(); await gate.observe(true, true)
    expect(save.mock.calls).toEqual([[false]])
  })
})
