import { expect, it } from 'vitest'
import { recoveryDriver } from '../src/platform/bridge'

it('does not pretend that browser recovery restored Android controls', async () => {
  expect(await recoveryDriver.preview()).toEqual({ supported: false, revision: '', steps: [], pending: false })
  await expect(recoveryDriver.confirm('')).rejects.toThrow('Android')
})
