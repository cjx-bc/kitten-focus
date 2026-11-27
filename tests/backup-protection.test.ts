import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { makeBackup, readBackup } from '../src/domain/backup'
import { defaultProtection, emptyData } from '../src/domain/model'

describe('public business backup', () => {
  it('round trips independent enhancement choices, explicit empty and legacy inheritance', () => {
    const data = emptyData()
    data.lockConfigurations = [
      { id: 'legacy', name: 'Legacy', minutes: 1, whitelist: { source: 'global' } },
      { id: 'empty', name: 'Empty', minutes: 1, whitelist: { source: 'global' }, enhancements: [] },
      { id: 'independent', name: 'Independent', minutes: 1, whitelist: { source: 'global' }, enhancements: ['lockMainInterfaceRestricted'] },
    ]
    const restored = readBackup(makeBackup(data)).data
    expect(restored.lockConfigurations).toEqual(data.lockConfigurations)
    expect(restored.lockConfigurations![0]).not.toHaveProperty('enhancements')
    const damaged = JSON.parse(makeBackup(data))
    damaged.data.lockConfigurations[1].enhancements = [true]
    expect(() => readBackup(JSON.stringify(damaged))).toThrow()
  })
  it('restores the reactive parsed backup shown by the real confirmation sheet', () => {
    const data = emptyData()
    data.preferences.protection = {
      ...defaultProtection(), globalWhitelist: ['org.example.reader'], enhancements: ['recentTasksHidden'],
    }
    data.lockConfigurations = [{ id: 'reading', name: '阅读', minutes: 5, whitelist: { source: 'custom', packages: [] } }]
    const preview = reactive(readBackup(makeBackup(data)))
    const restored = readBackup(makeBackup(preview.data)).data
    expect(restored).toEqual(data)
  })
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

const legacyRecord = {
  id: 'focus-1', itemId: null, themeId: null, title: '自由专注', themeName: '自由专注',
  color: '#ef4e36', mode: 'countdown', targetMs: 25_000, startedAt: 10_000, endedAt: 20_000,
  timeZone: 'UTC', durationMs: 10_000, pausedMs: 0,
  segments: [{ start: 10_000, end: 20_000 }], status: 'early',
}
const companionRecord = {
  ...legacyRecord, animalId: 'yellow-chick', skinId: '🐥'.repeat(40), note: '专'.repeat(99) + '🐥',
  source: 'timer', failReason: 'manual_giveup',
}
const companionPreferences = {
  restMinutes: 60, autoRest: true, pomodoroLoop: false, keepScreenOn: true, leaveAppFail: false,
  whiteNoise: 'rain', whiteNoiseVolume: 0.4, animation: 'system',
}
const companionPet = {
  version: 1, selectedAnimalId: 'random', selectedSkins: { 'yellow-chick': '🐥'.repeat(40) },
  lastSelectedItemId: null, retroCutoffAt: null,
}
const backupEnvelope = (data: unknown) => ({
  app: 'xiaomao-focus', version: 1, createdAt: '2026-11-15T00:00:00Z', data,
})
const legacyData = () => ({ ...emptyData(), records: [legacyRecord] })

describe('schema-one companion business backup', () => {
  it('round trips new record, preferences and pet fields', () => {
    const legacy = legacyData()
    const data = {
      ...legacy,
      records: [companionRecord, { ...companionRecord, id: 'focus-2', source: 'manual', note: '', failReason: 'left_app' }],
      preferences: { ...legacy.preferences, ...companionPreferences },
      pet: companionPet,
    }
    const parsed = readBackup(JSON.stringify(backupEnvelope(data)))
    expect(parsed.data).toEqual(data)
    expect(JSON.parse(makeBackup(parsed.data)).data).toEqual(data)
    expect(readBackup(makeBackup(parsed.data)).data).toEqual(data)
  })

  it('round trips legacy data without introducing optional fields', () => {
    const data = legacyData()
    const imported = readBackup(JSON.stringify(backupEnvelope(data))).data
    expect(imported).toEqual(data)
    expect(readBackup(makeBackup(imported)).data).toEqual(data)
  })

  it('exports and imports only portable fields while preserving explicit nullable values', () => {
    const legacy = legacyData()
    const data = {
      ...legacy, records: [companionRecord], preferences: { ...legacy.preferences, ...companionPreferences },
      pet: companionPet,
    }
    const injected = {
      ...data, active: { animalId: 'black-cat' }, rest: { durationMs: 60_000 }, notifications: ['private'],
      authorized: true, temporaryAccess: {},
      preferences: { ...data.preferences, authorized: true },
      records: [{
        ...companionRecord, active: true, temporaryAccess: {},
        segments: [{ ...legacyRecord.segments[0], runtime: true }],
      }],
      pet: { ...companionPet, secret: true },
    }
    expect(readBackup(JSON.stringify(backupEnvelope(injected))).data).toEqual(data)
    const parsed = readBackup(JSON.stringify(backupEnvelope(data))).data
    const exportInput = {
      ...parsed, active: injected.active, rest: injected.rest, notifications: injected.notifications,
      authorized: true, temporaryAccess: {}, preferences: { ...parsed.preferences, authorized: true },
      records: parsed.records.map((record) => ({
        ...record, failReason: undefined, active: true, temporaryAccess: {},
        segments: record.segments.map((segment) => ({ ...segment, runtime: true })),
      })),
      pet: { ...parsed.pet!, secret: true, selectedSkins: { ...companionPet.selectedSkins, secret: 'x', 'black-cat': ' ' } },
    }
    const { failReason, ...recordWithoutReason } = companionRecord
    expect(JSON.parse(makeBackup(exportInput)).data).toEqual({ ...data, records: [recordWithoutReason] })
  })

  it.each([
    ['animalId', ['unlisted', null, 1]],
    ['skinId', ['', '\u00a0', '🐥'.repeat(41), false, null]],
    ['note', ['🐥'.repeat(101), 42, null]],
    ['source', ['other', true, null]],
    ['failReason', ['other', true, null]],
  ])('rejects malformed record field %s', (field, values) => {
    for (const value of values) {
      const data = { ...legacyData(), records: [{ ...legacyRecord, [field]: value }] }
      expect(() => readBackup(JSON.stringify(backupEnvelope(data)))).toThrow('专注记录损坏')
    }
  })

  it.each([
    ['restMinutes', [0, 61, 5.5, '5', true, null, NaN]],
    ['autoRest', [0, 'true', null]],
    ['pomodoroLoop', [0, 'true', null]],
    ['keepScreenOn', [0, 'true', null]],
    ['leaveAppFail', [0, 'true', null]],
    ['whiteNoise', ['thunder', 0, null]],
    ['whiteNoiseVolume', [-0.1, 1.1, '0.4', true, null, Infinity, NaN]],
    ['animation', ['auto', true, null]],
  ])('rejects malformed preference %s', (field, values) => {
    for (const value of values) {
      const legacy = legacyData()
      const data = { ...legacy, preferences: { ...legacy.preferences, [field]: value } }
      expect(() => readBackup(JSON.stringify(backupEnvelope(data)))).toThrow('备份设置损坏')
    }
  })

  it('rejects malformed pet payloads', () => {
    const invalid = [
      null, [], true, 'pet', {},
      { ...companionPet, version: '1' }, { ...companionPet, version: 1.5 },
      { ...companionPet, selectedAnimalId: null }, { ...companionPet, selectedAnimalId: 'unlisted' },
      { ...companionPet, selectedSkins: [] }, { ...companionPet, selectedSkins: null },
      { ...companionPet, selectedSkins: { unlisted: 'coat' } },
      { ...companionPet, selectedSkins: { 'black-cat': '🐥'.repeat(41) } },
      { ...companionPet, selectedSkins: { 'black-cat': '\u00a0' } },
      { ...companionPet, selectedSkins: { 'black-cat': 3 } },
      { ...companionPet, lastSelectedItemId: ' ' }, { ...companionPet, lastSelectedItemId: false },
      { ...companionPet, lastSelectedItemId: undefined }, { ...companionPet, retroCutoffAt: undefined },
      { ...companionPet, retroCutoffAt: -1 }, { ...companionPet, retroCutoffAt: true },
      { ...companionPet, retroCutoffAt: '1' },
    ]
    for (const pet of invalid) {
      expect(() => readBackup(JSON.stringify(backupEnvelope({ ...legacyData(), pet })))).toThrow('伙伴设置损坏')
    }
  })

  it('validates finite numeric values before cleaning the parsed data', () => {
    const text = JSON.stringify(backupEnvelope({
      ...legacyData(),
      preferences: { ...emptyData().preferences, whiteNoiseVolume: 0.4 },
      pet: { ...companionPet, lastSelectedItemId: 'task-1', retroCutoffAt: 100 },
    }))
    expect(() => readBackup(text.replace('"whiteNoiseVolume":0.4', '"whiteNoiseVolume":1e400'))).toThrow('备份设置损坏')
    expect(() => readBackup(text.replace('"retroCutoffAt":100', '"retroCutoffAt":1e400'))).toThrow('伙伴设置损坏')
    expect(readBackup(text).data.pet).toEqual({ ...companionPet, lastSelectedItemId: 'task-1', retroCutoffAt: 100 })
  })
})
