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
it('reports navigation restriction as unavailable in browsers without pretending it executed', async () => {
  const result = await protectionDriver.status()
  expect(result).toMatchObject({ navigation: { supported: false, authorized: false, connected: false, active: false, state: 'unsupported' } })
})
