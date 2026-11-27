import { describe, expect, it } from 'vitest'
import type { FocusRecord, PetData } from '../src/domain/model'
import {
  ANIMAL_CATALOG,
  SKIN_CATALOG,
  getAnimalMeta,
  getAnimalUnlockStatus,
  getSkinUnlockStatus,
  projectPetDomain,
  resolveSessionPet,
} from '../src/domain/pet'

function makeRecord(overrides: Partial<FocusRecord> & { id: string }): FocusRecord {
  const startedAt = overrides.startedAt ?? Date.parse('2026-11-23T09:00:00+08:00')
  const durationMs = overrides.durationMs ?? 25 * 60_000
  const endedAt = overrides.endedAt ?? startedAt + durationMs
  return {
    itemId: null,
    themeId: null,
    title: '高数刷题',
    themeName: '高数',
    color: '#ef4e36',
    mode: 'countdown',
    targetMs: durationMs,
    startedAt,
    endedAt,
    timeZone: 'Asia/Shanghai',
    durationMs,
    pausedMs: 0,
    segments: [{ start: startedAt, end: endedAt }],
    status: 'completed',
    ...overrides,
  }
}

describe('pet domain projection', () => {
  it('exposes static catalog for all 12 animals and dual-hero skins', () => {
    expect(ANIMAL_CATALOG).toHaveLength(12)
    expect(ANIMAL_CATALOG.map((a) => [a.id, a.unlockType, a.unlockThreshold])).toEqual([
      ['black-cat', 'affection', 0],
      ['yellow-chick', 'affection', 15],
      ['white-goose', 'affection', 35],
      ['orange-cat', 'affection', 65],
      ['pixel-bird', 'affection', 110],
      ['patch-bear', 'affection', 170],
      ['green-parrot', 'affection', 245],
      ['flying-pig', 'affection', 340],
      ['balloon-dog', 'affection', 460],
      ['light-deer', 'affection', 600],
      ['angel-cat', 'streak', 7],
      ['black-dragon', 'raised', 50],
    ])
    expect(SKIN_CATALOG['black-cat'].map((s) => [s.id, s.unlockAt])).toEqual([
      ['default', 0],
      ['cow', 10],
      ['siamese', 30],
    ])
    expect(SKIN_CATALOG['yellow-chick'].map((s) => [s.id, s.unlockAt])).toEqual([
      ['default', 0],
      ['chestnut', 10],
      ['snow', 30],
    ])
  })

  it('computes affection (+1 per 5m, cap 36/session, cap 120/day), litter, and never lowers peakAffection', () => {
    const day1Base = Date.parse('2026-11-23T08:00:00+08:00')
    const records: FocusRecord[] = [
      // < 5 min completed -> 0 affection, 0 litter
      makeRecord({ id: 'short-4m', startedAt: day1Base - 600_000, durationMs: 4 * 60_000 }),
      // 25 min completed -> +5 affection, +1 litter
      makeRecord({ id: 'r1', startedAt: day1Base, durationMs: 25 * 60_000, animalId: 'black-cat' }),
      // 3 hours (180m) -> raw floor(180/5)=36 (cap 36), litter floor(180/25)=7 (cap 7)
      makeRecord({ id: 'r2', startedAt: day1Base + 3_600_000, durationMs: 180 * 60_000, animalId: 'black-cat' }),
      // 4 hours (240m) -> raw cap 36, litter cap 7
      makeRecord({ id: 'r3', startedAt: day1Base + 15_000_000, durationMs: 240 * 60_000, animalId: 'black-cat' }),
      // 4 hours (240m) -> raw cap 36
      makeRecord({ id: 'r4', startedAt: day1Base + 30_000_000, durationMs: 240 * 60_000, animalId: 'black-cat' }),
      // 2 hours (120m) -> raw 24, but daily total already 5 + 36 + 36 + 36 = 113, so capped to 7!
      makeRecord({ id: 'r5', startedAt: day1Base + 45_000_000, durationMs: 120 * 60_000, animalId: 'black-cat' }),
      // Early finish on day 2 -> -5 affection, peakAffection stays 120
      makeRecord({
        id: 'r6-early',
        startedAt: Date.parse('2026-11-24T09:00:00+08:00'),
        durationMs: 12 * 60_000,
        status: 'early',
        failReason: 'manual_giveup',
      }),
    ]

    const proj = projectPetDomain({
      records,
      timeZone: 'Asia/Shanghai',
      now: Date.parse('2026-11-24T10:00:00+08:00'),
    })

    expect(proj.recordEffects.get('short-4m')).toMatchObject({ affectionDelta: 0, litter: 0, validForPet: false })
    expect(proj.recordEffects.get('r1')).toMatchObject({ affectionDelta: 5, litter: 1, validForPet: true })
    expect(proj.recordEffects.get('r2')).toMatchObject({ affectionDelta: 36, litter: 7 })
    expect(proj.recordEffects.get('r5')).toMatchObject({ affectionDelta: 7, litter: 4 })
    expect(proj.recordEffects.get('r6-early')).toMatchObject({ affectionDelta: -5, litter: 0 })

    expect(proj.peakAffection).toBe(120)
    expect(proj.affection).toBe(115)
    expect(proj.dailyGains['2026-11-23']).toBe(120)
    expect(proj.dailyGainToday).toBe(0)
    // Unlocked animals stay unlocked at peakAffection=120: black-cat(0), yellow-chick(15), white-goose(35), orange-cat(65), pixel-bird(110)
    expect(proj.unlockedAnimals).toEqual(['black-cat', 'yellow-chick', 'white-goose', 'orange-cat', 'pixel-bird'])
    // Total raised = 1 + 7 + 7 + 7 + 4 = 26 black cats -> cow skin unlocked (>=10), siamese locked (<30)
    expect(proj.totalRaised).toBe(26)
    expect(proj.raisedByAnimal['black-cat']).toBe(26)
    expect(proj.unlockedSkins['black-cat']).toEqual(['default', 'cow'])
  })

  it('clamps affection at 0 on repeated early finishes and sorts unsorted records chronologically', () => {
    const t0 = Date.parse('2026-11-23T09:00:00+08:00')
    // Out-of-order input: early BEFORE completed chronologically
    const records: FocusRecord[] = [
      makeRecord({ id: 'b-completed', startedAt: t0 + 3_600_000, durationMs: 25 * 60_000, status: 'completed' }),
      makeRecord({ id: 'a-early', startedAt: t0, durationMs: 60_000, status: 'early' }),
    ]

    const proj = projectPetDomain({ records, timeZone: 'Asia/Shanghai', now: t0 + 7_200_000 })
    // Chronologically: a-early at 0 -> max(0, 0 - 5) = 0; then b-completed -> +5
    expect(proj.affection).toBe(5)
    expect(proj.peakAffection).toBe(5)
    expect(proj.recordEffects.get('a-early')?.affectionDelta).toBe(0)
    expect(proj.recordEffects.get('b-completed')?.affectionDelta).toBe(5)
  })

  it('hard-isolates manual records from affection, litter, raised count, and streaks', () => {
    const base = Date.parse('2026-11-20T10:00:00+08:00')
    const records: FocusRecord[] = [
      makeRecord({ id: 'm1', startedAt: base, durationMs: 120 * 60_000, source: 'manual', animalId: 'black-cat' }),
      makeRecord({ id: 'm2', startedAt: base + 86_400_000, durationMs: 60 * 60_000, source: 'manual', status: 'early' }),
    ]
    const proj = projectPetDomain({ records, timeZone: 'Asia/Shanghai', now: base + 86_400_000 })
    expect(proj.affection).toBe(0)
    expect(proj.peakAffection).toBe(0)
    expect(proj.totalRaised).toBe(0)
    expect(proj.currentStreakDays).toBe(0)
    expect(proj.maxConsecutiveDays).toBe(0)
    expect(proj.recordEffects.get('m1')).toMatchObject({ affectionDelta: 0, litter: 0, validForPet: false })
  })

  it('applies retroactive cutoff: grants positive history to black-cat and forgives historical early finishes', () => {
    const cutoff = Date.parse('2026-11-20T00:00:00+08:00')
    const records: FocusRecord[] = [
      // Before cutoff, missing animalId -> grants affection and black-cat litter
      makeRecord({ id: 'old-ok', startedAt: cutoff - 7_200_000, endedAt: cutoff - 5_400_000, durationMs: 30 * 60_000 }),
      // Before cutoff, early -> 0 penalty
      makeRecord({ id: 'old-early', startedAt: cutoff - 3_600_000, endedAt: cutoff - 1_800_000, durationMs: 10 * 60_000, status: 'early' }),
      // After cutoff, early -> -5 penalty
      makeRecord({ id: 'new-early', startedAt: cutoff + 3_600_000, endedAt: cutoff + 4_200_000, durationMs: 10 * 60_000, status: 'early' }),
    ]
    const pet: PetData = {
      version: 1,
      selectedAnimalId: 'black-cat',
      selectedSkins: {},
      lastSelectedItemId: null,
      retroCutoffAt: cutoff,
    }
    const proj = projectPetDomain({ records, pet, timeZone: 'Asia/Shanghai', now: cutoff + 7_200_000 })
    expect(proj.recordEffects.get('old-ok')).toMatchObject({ affectionDelta: 6, litter: 1, animalId: 'black-cat', skinId: 'default', retroactive: true })
    expect(proj.recordEffects.get('old-early')).toMatchObject({ affectionDelta: 0, litter: 0, retroactive: true })
    expect(proj.recordEffects.get('new-early')).toMatchObject({ affectionDelta: -5, litter: 0, retroactive: false })
    expect(proj.peakAffection).toBe(6)
    expect(proj.affection).toBe(1)
    expect(proj.raisedByAnimal['black-cat']).toBe(1)
  })

  it('unlocks angel-cat at 7-day streak and black-dragon at 50 raised animals, plus skin thresholds', () => {
    const records: FocusRecord[] = []
    // 7 consecutive days: Nov 17..23, each with 8 sessions * 25m (not hitting daily cap: 8*5=40) -> 56 raised!
    for (let day = 0; day < 7; day++) {
      const dayStart = Date.parse(`2026-11-${17 + day}T09:00:00+08:00`)
      for (let s = 0; s < 8; s++) {
        records.push(
          makeRecord({
            id: `d${day}-s${s}`,
            startedAt: dayStart + s * 2_000_000,
            durationMs: 25 * 60_000,
            animalId: s < 5 ? 'black-cat' : 'yellow-chick',
          }),
        )
      }
    }
    const proj = projectPetDomain({
      records,
      timeZone: 'Asia/Shanghai',
      now: Date.parse('2026-11-23T22:00:00+08:00'),
    })
    expect(proj.currentStreakDays).toBe(7)
    expect(proj.maxConsecutiveDays).toBe(7)
    expect(proj.totalRaised).toBe(56)
    expect(proj.raisedByAnimal['black-cat']).toBe(35)
    expect(proj.raisedByAnimal['yellow-chick']).toBe(21)
    expect(proj.unlockedAnimals).toContain('angel-cat')
    expect(proj.unlockedAnimals).toContain('black-dragon')
    expect(proj.unlockedSkins['black-cat']).toEqual(['default', 'cow', 'siamese'])
    expect(proj.unlockedSkins['yellow-chick']).toEqual(['default', 'chestnut'])
  })

  it('slices weekFarmSlice up to 36 evenly sampled instances while preserving exact weekTotalCount', () => {
    const records: FocusRecord[] = []
    // Monday 2026-11-23 -> 20 sessions of 50m (litter = 2 each => 40 total)
    const mon = Date.parse('2026-11-23T08:00:00+08:00')
    for (let i = 0; i < 20; i++) {
      records.push(
        makeRecord({
          id: `w-${i}`,
          startedAt: mon + i * 3_600_000,
          durationMs: 50 * 60_000,
          animalId: 'black-cat',
        }),
      )
    }
    // Outside week + manual inside week must be excluded
    records.push(makeRecord({ id: 'prev-week', startedAt: Date.parse('2026-11-22T20:00:00+08:00'), durationMs: 25 * 60_000 }))
    records.push(makeRecord({ id: 'manual-week', startedAt: mon + 1000, durationMs: 50 * 60_000, source: 'manual' }))

    const proj = projectPetDomain({ records, timeZone: 'Asia/Shanghai', now: mon })
    const slice = proj.weekFarmSlice('2026-11-23')
    expect(slice.weekTotalCount).toBe(40)
    expect(slice.instances).toHaveLength(36)
    expect(slice.instances[0]?.recordId).toBe('w-0')
  })

  it('builds weeklyFourColorMatrix across focus, pause, early, and manual segments', () => {
    const monFocusStart = Date.parse('2026-11-23T09:00:00+08:00')
    const tueEarlyStart = Date.parse('2026-11-24T14:00:00+08:00')
    const wedManualStart = Date.parse('2026-11-25T16:00:00+08:00')
    const records: FocusRecord[] = [
      // Focus 09:00-09:20, paused 09:20-09:50 (30m gap in hour 9), focus 09:50-10:00 (10m in hour 9)
      makeRecord({
        id: 'f1',
        startedAt: monFocusStart,
        endedAt: monFocusStart + 60 * 60_000,
        durationMs: 30 * 60_000,
        pausedMs: 30 * 60_000,
        segments: [
          { start: monFocusStart, end: monFocusStart + 20 * 60_000 },
          { start: monFocusStart + 50 * 60_000, end: monFocusStart + 60 * 60_000 },
        ],
        status: 'completed',
      }),
      makeRecord({
        id: 'e1',
        startedAt: tueEarlyStart,
        endedAt: tueEarlyStart + 15 * 60_000,
        durationMs: 15 * 60_000,
        segments: [{ start: tueEarlyStart, end: tueEarlyStart + 15 * 60_000 }],
        status: 'early',
      }),
      makeRecord({
        id: 'm1',
        startedAt: wedManualStart,
        endedAt: wedManualStart + 25 * 60_000,
        durationMs: 25 * 60_000,
        segments: [{ start: wedManualStart, end: wedManualStart + 25 * 60_000 }],
        source: 'manual',
        status: 'completed',
      }),
    ]

    const proj = projectPetDomain({ records, timeZone: 'Asia/Shanghai', now: wedManualStart })
    const matrix = proj.weeklyFourColorMatrix('2026-11-23')
    expect(matrix).toHaveLength(7)
    expect(matrix[0]).toHaveLength(24)
    expect(matrix[0]![9]).toMatchObject({ date: '2026-11-23', hour: 9, focusMs: 30 * 60_000, pauseMs: 30 * 60_000 })
    expect(matrix[1]![14]).toMatchObject({ date: '2026-11-24', hour: 14, state: 'early', earlyMs: 15 * 60_000 })
    expect(matrix[2]![16]).toMatchObject({ date: '2026-11-25', hour: 16, state: 'manual', manualMs: 25 * 60_000 })
    expect(matrix[3]![0]).toMatchObject({ date: '2026-11-26', hour: 0, state: 'empty' })
  })

  it('resolves session pet with fallback for locked animals/skins and deterministic rng for random mode', () => {
    const proj = projectPetDomain({
      records: [
        makeRecord({ id: 'r1', durationMs: 75 * 60_000 }), // +15 affection -> unlocks yellow-chick
      ],
      timeZone: 'Asia/Shanghai',
    })
    expect(
      resolveSessionPet(
        { version: 1, selectedAnimalId: 'black-dragon', selectedSkins: { 'black-cat': 'siamese' }, lastSelectedItemId: null, retroCutoffAt: null },
        proj,
      ),
    ).toEqual({ animalId: 'black-cat', skinId: 'default' })

    expect(
      resolveSessionPet(
        { version: 1, selectedAnimalId: 'random', selectedSkins: {}, lastSelectedItemId: null, retroCutoffAt: null },
        proj,
        () => 0.75,
      ),
    ).toEqual({ animalId: 'yellow-chick', skinId: 'default' })
  })

  it('unlocks all 10 affection tiers at exact thresholds, never re-locks on drop, and requires surpassing peakAffection to advance', () => {
    // Gain 35 affection on day 1 -> unlocks black-cat(0), yellow-chick(15), white-goose(35)
    // Then 2 early finishes -> affection drops to 25, peakAffection stays 35 -> white-goose stays unlocked
    // Then gain +15 -> affection 40, peakAffection 40 -> orange-cat(65) remains locked until affection reaches 65
    const base = Date.parse('2026-11-10T09:00:00+08:00')
    const partialRecords: FocusRecord[] = [
      makeRecord({ id: 'g1', startedAt: base, durationMs: 175 * 60_000 }), // +35 affection
      makeRecord({ id: 'e1', startedAt: base + 12_000_000, durationMs: 60_000, status: 'early' }), // -5 => 30
      makeRecord({ id: 'e2', startedAt: base + 13_000_000, durationMs: 60_000, status: 'early' }), // -5 => 25
      makeRecord({ id: 'g2', startedAt: base + 14_000_000, durationMs: 75 * 60_000 }), // +15 => 40 (peak 40)
    ]
    const midProj = projectPetDomain({ records: partialRecords, timeZone: 'Asia/Shanghai', now: base + 20_000_000 })
    expect(midProj.affection).toBe(40)
    expect(midProj.peakAffection).toBe(40)
    expect(midProj.unlockedAnimals).toEqual(['black-cat', 'yellow-chick', 'white-goose'])

    // Now push across 600 affection over 6 distinct days (5 * 120/day = 600) -> all 10 tiers unlocked
    const fullRecords: FocusRecord[] = []
    for (let d = 0; d < 6; d++) {
      const dayBase = Date.parse(`2026-11-${10 + d}T08:00:00+08:00`)
      // 4 sessions * 150m = 4 * 30 = 120/day (non-consecutive gap on day 5 to avoid streak=7)
      const offsetDay = d === 5 ? Date.parse('2026-11-20T08:00:00+08:00') : dayBase
      for (let s = 0; s < 4; s++) {
        fullRecords.push(makeRecord({ id: `f-${d}-${s}`, startedAt: offsetDay + s * 10_000_000, durationMs: 150 * 60_000 }))
      }
    }
    // Add early finishes after reaching 600 to drop current affection below 600
    fullRecords.push(
      makeRecord({ id: 'drop-1', startedAt: Date.parse('2026-11-21T09:00:00+08:00'), durationMs: 60_000, status: 'early' }),
      makeRecord({ id: 'drop-2', startedAt: Date.parse('2026-11-21T10:00:00+08:00'), durationMs: 60_000, status: 'early' }),
    )
    const highProj = projectPetDomain({ records: fullRecords, timeZone: 'Asia/Shanghai', now: Date.parse('2026-11-21T12:00:00+08:00') })
    expect(highProj.peakAffection).toBe(720)
    expect(highProj.affection).toBe(710)
    for (const tierAnimal of ANIMAL_CATALOG.filter((a) => a.unlockType === 'affection')) {
      expect(highProj.unlockedAnimals).toContain(tierAnimal.id)
    }
  })

  it('computes unlock progress text for tier, streak, raised milestones, and species skins while excluding manual records', () => {
    const records: FocusRecord[] = [
      // 4 consecutive days of timer focus for black-cat (1 litter/day = 4 raised)
      ...Array.from({ length: 4 }, (_, i) =>
        makeRecord({
          id: `t-${i}`,
          startedAt: Date.parse(`2026-11-${20 + i}T09:00:00+08:00`),
          durationMs: 25 * 60_000,
          animalId: 'black-cat',
        }),
      ),
      // 3 manual days + huge duration should NOT advance streak, totalRaised, or black-cat/yellow-chick skin counts
      ...Array.from({ length: 3 }, (_, i) =>
        makeRecord({
          id: `m-${i}`,
          startedAt: Date.parse(`2026-11-${24 + i}T09:00:00+08:00`),
          durationMs: 200 * 60_000,
          source: 'manual',
          animalId: 'black-cat',
        }),
      ),
    ]
    const proj = projectPetDomain({
      records,
      timeZone: 'Asia/Shanghai',
      now: Date.parse('2026-11-26T12:00:00+08:00'),
    })

    expect(proj.unlockedAnimals).toEqual(['black-cat', 'yellow-chick'])
    expect(proj.unlockedSkins['black-cat']).toEqual(['default'])
    expect(getAnimalUnlockStatus(getAnimalMeta('white-goose'), proj)).toEqual({
      unlocked: false,
      current: 20,
      target: 35,
      progressText: '好感需达到 35',
    })
    expect(getAnimalUnlockStatus(getAnimalMeta('angel-cat'), proj)).toEqual({
      unlocked: false,
      current: 4,
      target: 7,
      progressText: '连续专注 4/7 天',
    })
    expect(getAnimalUnlockStatus(getAnimalMeta('black-dragon'), proj)).toEqual({
      unlocked: false,
      current: 4,
      target: 50,
      progressText: '累计养出 4/50 只',
    })
    expect(getSkinUnlockStatus(SKIN_CATALOG['black-cat'][1]!, proj)).toEqual({
      unlocked: false,
      current: 4,
      target: 10,
      progressText: '累计养出 10 只解锁（4/10）',
    })
    expect(getSkinUnlockStatus(SKIN_CATALOG['yellow-chick'][2]!, proj)).toEqual({
      unlocked: false,
      current: 0,
      target: 30,
      progressText: '累计养出 30 只解锁（0/30）',
    })
  })

  it('draws random session pets strictly from unlocked pool with selected unlocked skin and preserves exact failTitles', () => {
    const records: FocusRecord[] = []
    const base = Date.parse('2026-11-23T08:00:00+08:00')
    for (let i = 0; i < 10; i++) {
      records.push(
        makeRecord({
          id: `bc-${i}`,
          startedAt: base + i * 2_000_000,
          durationMs: 25 * 60_000,
          animalId: 'black-cat',
        }),
      )
    }
    const proj = projectPetDomain({ records, timeZone: 'Asia/Shanghai', now: base + 30_000_000 })
    // 10 * 5 = 50 affection -> unlocked: black-cat, yellow-chick, white-goose; black-cat raised=10 -> cow unlocked
    expect(proj.unlockedAnimals).toEqual(['black-cat', 'yellow-chick', 'white-goose'])

    const pet: PetData = {
      version: 1,
      selectedAnimalId: 'random',
      selectedSkins: { 'black-cat': 'cow', 'yellow-chick': 'snow' },
      lastSelectedItemId: null,
      retroCutoffAt: null,
    }
    const sampled = new Set<string>()
    for (const r of [0, 0.34, 0.67, 0.99]) {
      const picked = resolveSessionPet(pet, proj, () => r)
      sampled.add(`${picked.animalId}:${picked.skinId}`)
      expect(proj.unlockedAnimals).toContain(picked.animalId)
    }
    expect(sampled).toEqual(new Set(['black-cat:cow', 'yellow-chick:default', 'white-goose:default']))
    expect(getAnimalMeta('balloon-dog').failTitle).toBe('完蛋！你的气球小狗漏气挂了')
    expect(getAnimalMeta('green-parrot').failTitle).toBe('完蛋！你的小鹦鹉挂了')
  })
})
