import { expect, it } from 'vitest'
import { temporaryAccessDriver } from '../src/platform/bridge'

it('refuses browser temporary access without claiming an Android app was opened', async () => {
  await expect(temporaryAccessDriver.grant({ sessionId: 'round', targetPackage: 'example.app', durationMinutes: 1, requestId: 'request' })).rejects.toThrow('Android')
})
