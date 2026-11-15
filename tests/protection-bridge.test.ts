import { expect, it } from 'vitest'
import { protectionDriver } from '../src/platform/bridge'

it('reports browser application protection as unavailable instead of claiming permission or execution', async () => {
  expect(await protectionDriver.status()).toMatchObject({
    supported: false,
    authorized: false,
    connected: false,
    active: false,
    state: 'unsupported',
  })
  await expect(protectionDriver.apps()).resolves.toEqual([])
})
