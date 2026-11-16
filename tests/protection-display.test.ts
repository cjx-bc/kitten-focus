import { describe, expect, it } from 'vitest'
import { capabilityToggleDisabled, studyDisplay } from '../src/domain/protectionDisplay'
import type { ProtectionStatus } from '../src/domain/model'

const ready: ProtectionStatus = {
  supported: true, authorized: true, connected: true, active: false,
  preferenceEnabled: true, state: 'ready', reason: '', effectiveWhitelist: [],
}
describe('protection UI states', () => {
  it.each([false, undefined])('blocks enabling unavailable capabilities (%s), but allows clearing them', (supported) => {
    expect(capabilityToggleDisabled(false, supported, false)).toBe(true)
    expect(capabilityToggleDisabled(true, supported, false)).toBe(false)
  })
  it('blocks changes while saving', () => {
    expect(capabilityToggleDisabled(true, true, true)).toBe(true)
    expect(capabilityToggleDisabled(false, true, false)).toBe(false)
  })
  it('separates selection, actual effect and unrelated application restrictions', () => {
    expect(studyDisplay(false, false, false, { ...ready, active: true, state: 'protecting' }).text).toBe('未开启')
    expect(studyDisplay(true, false, false, ready).text).toBe('已开启')
    expect(studyDisplay(false, true, false, { ...ready, active: true, state: 'protecting' }).text).toBe('保护中')
    expect(studyDisplay(true, true, false, ready).text).toBe('待生效')
    expect(studyDisplay(true, true, true, ready).text).toBe('已撤销')
    expect(studyDisplay(true, true, false, { ...ready, state: 'recovered' }).text).toBe('已撤销')
  })
  it('does not turn unknown, failed or unsupported reads into a successful state', () => {
    expect(studyDisplay(true, false, false, null).text).toBe('检查中')
    expect(studyDisplay(true, false, false, ready, true).text).toBe('状态异常')
    expect(studyDisplay(true, false, false, { ...ready, supported: false }).text).toBe('不支持')
    expect(studyDisplay(true, false, false, { ...ready, authorized: false }).text).toBe('待授权')
    expect(studyDisplay(true, false, false, { ...ready, connected: false }).text).toBe('待连接')
    expect(studyDisplay(true, true, false, { ...ready, connected: false }).text).toBe('已失效')
  })
})
