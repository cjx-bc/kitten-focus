import { expect, it } from 'vitest'
import { lockDriver } from '../src/platform/bridge'

it('refuses to start independent application control on an unsupported browser', async () => {
  await expect(lockDriver.start('reading')).rejects.toThrow('Android')
  expect(await lockDriver.read()).toEqual({ session: null, remainingMs: 0, records: [] })
})
