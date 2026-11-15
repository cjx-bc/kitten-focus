import { describe, expect, it } from 'vitest'
import { makeBackup, readBackup } from '../src/domain/backup'
import { defaultProtection, emptyData } from '../src/domain/model'

describe('public business backup', () => {
  it('reads original schema one with safe protection defaults', () => {
    const result = readBackup(
      JSON.stringify({
        app: 'xiaomao-focus',
        version: 1,
        createdAt: '2026-11-15T00:00:00Z',
        data: emptyData(),
      }),
    ).data
    expect(result.preferences.protection ?? defaultProtection()).toEqual(defaultProtection())
    expect(result.lockConfigurations ?? []).toEqual([])
  })
  it('exports reusable choices but excludes unknown runtime and authorization at every level', () => {
    const data = emptyData()
    data.preferences.protection = {
      ...defaultProtection(),
      strict: true,
      globalWhitelist: ['org.example.reader'],
      enhancements: ['navigationHomeRecents', 'preciseAntiClose'],
    }
    data.lockConfigurations = [
      { id: 'global', name: '全局', minutes: 5, strict: true, whitelist: { source: 'global' } },
      { id: 'empty', name: '空名单', minutes: 15, whitelist: { source: 'custom', packages: [] } },
      {
        id: 'custom',
        name: '独立',
        minutes: 30,
        whitelist: { source: 'custom', packages: ['org.example.reader'] },
      },
    ]
    const injected = JSON.parse(JSON.stringify(data))
    injected.active = { id: 'must-not-run', temporaryAccess: { target: 'org.secret' } }
    injected.notifications = { body: 'private-message' }
    injected.preferences.authorized = true
    injected.preferences.protection.authorized = true
    injected.lockConfigurations[0].active = true
    const exported = makeBackup(injected)
    expect(exported).not.toMatch(/must-not-run|private-message|authorized|temporaryAccess/)
    const restored = readBackup(exported).data
    expect(restored.preferences.protection).toEqual(data.preferences.protection)
    expect(restored.lockConfigurations).toEqual(data.lockConfigurations)
    // Imported text is equally untrusted, even if no export was involved.
    expect(
      readBackup(
        JSON.stringify({
          app: 'xiaomao-focus',
          version: 1,
          createdAt: '2026-11-15T00:00:00Z',
          data: injected,
        }),
      ).data,
    ).toEqual(restored)
  })
  it.each([
    { protection: { ...defaultProtection(), strict: 'true' } },
    { protection: { ...defaultProtection(), globalWhitelist: [17] } },
    { protection: { ...defaultProtection(), enhancements: [true] } },
    { locks: [{ id: 'x', name: '锁机', minutes: 0, whitelist: { source: 'global' } }] },
    { locks: [{ id: 'x', name: '锁机', minutes: 5, whitelist: { source: 'custom' } }] },
    {
      locks: [
        { id: 'x', name: '锁机', minutes: 5, strict: 'yes', whitelist: { source: 'global' } },
      ],
    },
  ])('rejects damaged reusable protection configuration', ({ protection, locks }) => {
    const data = emptyData() as any
    if (protection) data.preferences.protection = protection
    if (locks) data.lockConfigurations = locks
    expect(() =>
      readBackup(
        JSON.stringify({
          app: 'xiaomao-focus',
          version: 1,
          createdAt: '2026-11-15T00:00:00Z',
          data,
        }),
      ),
    ).toThrow()
  })
})
