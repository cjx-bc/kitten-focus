import { ANIMAL_IDS, type AnimalId, type FocusRecord, type PetData } from './model'
import { addDays, dateKey, dayDistance, intervalBuckets, zoneDate } from './dates'

export const AFFECTION_STEP_MS = 5 * 60_000
export const MAX_SESSION_AFFECTION = 36
export const MAX_DAILY_AFFECTION = 120
export const EARLY_PENALTY_AFFECTION = 5
export const LITTER_STEP_MS = 25 * 60_000
export const MAX_SESSION_LITTER = 7
export const MAX_FARM_INSTANCES = 36

export interface AnimalMeta {
  id: AnimalId
  name: string
  unlockType: 'affection' | 'streak' | 'raised'
  unlockThreshold: number
  failTitle: string
  stages: [string, string, string]
  defaultPalette: {
    body: string
    belly: string
    accent: string
  }
}

export interface SkinMeta {
  id: string
  animalId: AnimalId
  name: string
  unlockAt: number
  body: string
  belly: string
  accent: string
}

export const ANIMAL_CATALOG: readonly AnimalMeta[] = [
  {
    id: 'black-cat',
    name: '小黑猫',
    unlockType: 'affection',
    unlockThreshold: 0,
    failTitle: '完蛋！你的小黑猫挂了',
    stages: ['黑毛球', '短尾奶猫', '圆眼翘尾猫'],
    defaultPalette: { body: '#222222', belly: '#3a3a3f', accent: '#ef4e36' },
  },
  {
    id: 'yellow-chick',
    name: '小黄鸡',
    unlockType: 'affection',
    unlockThreshold: 15,
    failTitle: '完蛋！你的小黄鸡挂了',
    stages: ['裂缝蛋', '呆毛绒球', '红冠小鸡'],
    defaultPalette: { body: '#f2c94c', belly: '#fff3c4', accent: '#ef4e36' },
  },
  {
    id: 'white-goose',
    name: '大白鹅',
    unlockType: 'affection',
    unlockThreshold: 35,
    failTitle: '完蛋！你的大白鹅挂了',
    stages: ['白绒团', '短颈小鹅', '红围巾大白鹅'],
    defaultPalette: { body: '#ffffff', belly: '#f5f5f5', accent: '#ef4e36' },
  },
  {
    id: 'orange-cat',
    name: '小橘猫',
    unlockType: 'affection',
    unlockThreshold: 65,
    failTitle: '完蛋！你的小橘猫挂了',
    stages: ['橘纹球', '舔爪橘崽', '白肚圆胖橘猫'],
    defaultPalette: { body: '#e7a54a', belly: '#fff6e8', accent: '#ef4e36' },
  },
  {
    id: 'pixel-bird',
    name: '像素肥啾',
    unlockType: 'affection',
    unlockThreshold: 110,
    failTitle: '完蛋！你的像素肥啾挂了',
    stages: ['像素蛋', '像素雏鸟', '8-bit 复古紫肥啾'],
    defaultPalette: { body: '#a08bb0', belly: '#f5f5f5', accent: '#ef4e36' },
  },
  {
    id: 'patch-bear',
    name: '独眼小熊',
    unlockType: 'affection',
    unlockThreshold: 170,
    failTitle: '完蛋！你的独眼小熊挂了',
    stages: ['黑耳团', '坐姿熊崽', '红星眼罩酷黑熊'],
    defaultPalette: { body: '#222222', belly: '#85858b', accent: '#ef4e36' },
  },
  {
    id: 'green-parrot',
    name: '小太阳鹦鹉',
    unlockType: 'affection',
    unlockThreshold: 245,
    failTitle: '完蛋！你的小鹦鹉挂了',
    stages: ['绿羽团', '呆毛雏鸟', '红脸蛋小太阳鹦鹉'],
    defaultPalette: { body: '#7b9a80', belly: '#e7a54a', accent: '#ef4e36' },
  },
  {
    id: 'flying-pig',
    name: '飞天小猪',
    unlockType: 'affection',
    unlockThreshold: 340,
    failTitle: '完蛋！你的飞天小猪挂了',
    stages: ['黑猪鼻团', '短腿黑猪', '灰翅膀飞天猪'],
    defaultPalette: { body: '#222222', belly: '#85858b', accent: '#ef4e36' },
  },
  {
    id: 'balloon-dog',
    name: '气球小狗',
    unlockType: 'affection',
    unlockThreshold: 460,
    failTitle: '完蛋！你的气球小狗漏气挂了',
    stages: ['充气粉球', '双节气球', '粉黄扭扭气球狗'],
    defaultPalette: { body: '#ef4e36', belly: '#e7a54a', accent: '#ffffff' },
  },
  {
    id: 'light-deer',
    name: '彩灯小鹿',
    unlockType: 'affection',
    unlockThreshold: 600,
    failTitle: '完蛋！你的彩灯小鹿挂了',
    stages: ['红鼻鹿崽', '短角小鹿', '鹿角缠满彩灯鹿'],
    defaultPalette: { body: '#698caa', belly: '#f5f5f5', accent: '#ef4e36' },
  },
  {
    id: 'angel-cat',
    name: '天使黑猫',
    unlockType: 'streak',
    unlockThreshold: 7,
    failTitle: '完蛋！你的天使黑猫挂了',
    stages: ['闪电奶猫', '小芽翅猫', '紫翅彩虹光环黑猫'],
    defaultPalette: { body: '#222222', belly: '#a08bb0', accent: '#e7a54a' },
  },
  {
    id: 'black-dragon',
    name: '小黑龙',
    unlockType: 'raised',
    unlockThreshold: 50,
    failTitle: '完蛋！你的小黑龙挂了',
    stages: ['金元宝龙蛋', '红角幼龙', '东方祥云小黑龙'],
    defaultPalette: { body: '#222222', belly: '#e7a54a', accent: '#ef4e36' },
  },
] as const

export const SKIN_CATALOG: Record<AnimalId, readonly SkinMeta[]> = Object.fromEntries(
  ANIMAL_CATALOG.map((animal) => {
    const base: SkinMeta = {
      id: 'default',
      animalId: animal.id,
      name: animal.id === 'black-cat' ? '煤球纯黑' : animal.id === 'yellow-chick' ? '嫩芽黄' : '默认配色',
      unlockAt: 0,
      ...animal.defaultPalette,
    }
    if (animal.id === 'black-cat') {
      return [
        animal.id,
        [
          base,
          { id: 'cow', animalId: 'black-cat', name: '奶牛黑白斑', unlockAt: 10, body: '#ffffff', belly: '#222222', accent: '#ef4e36' },
          { id: 'siamese', animalId: 'black-cat', name: '暹罗重点色', unlockAt: 30, body: '#e7d8c3', belly: '#4a3c31', accent: '#698caa' },
        ],
      ]
    }
    if (animal.id === 'yellow-chick') {
      return [
        animal.id,
        [
          base,
          { id: 'chestnut', animalId: 'yellow-chick', name: '栗子棕', unlockAt: 10, body: '#9c6b43', belly: '#e6c9a8', accent: '#ef4e36' },
          { id: 'snow', animalId: 'yellow-chick', name: '雪团白', unlockAt: 30, body: '#ffffff', belly: '#f5f5f5', accent: '#e7a54a' },
        ],
      ]
    }
    return [animal.id, [base]]
  }),
) as unknown as Record<AnimalId, readonly SkinMeta[]>

export function getAnimalMeta(id: AnimalId): AnimalMeta {
  return ANIMAL_CATALOG.find((a) => a.id === id) ?? ANIMAL_CATALOG[0]!
}

export function getSkinMeta(animalId: AnimalId, skinId = 'default'): SkinMeta {
  const list = SKIN_CATALOG[animalId] ?? SKIN_CATALOG['black-cat']
  return list.find((s) => s.id === skinId) ?? list[0]!
}

export interface PetProjectionInput {
  records: readonly FocusRecord[]
  pet?: PetData | null
  retroCutoffAt?: number | null
  timeZone?: string
  now?: number
}

export interface RecordPetEffect {
  recordId: string
  animalId: AnimalId
  skinId: string
  affectionDelta: number
  litter: number
  validForPet: boolean
  retroactive: boolean
  dayKey: string
}

export interface FarmInstance {
  id: string
  recordId: string
  animalId: AnimalId
  skinId: string
  title: string
  startedAt: number
  durationMs: number
  indexInRecord: number
}

export interface WeekFarmSlice {
  weekStartDate: string
  weekEndDate: string
  weekTotalCount: number
  totalDurationMs: number
  instances: FarmInstance[]
}

export type FourColorState = 'empty' | 'focus' | 'pause' | 'early' | 'manual'

export interface WeeklyFourColorCell {
  date: string
  hour: number
  state: FourColorState
  focusMs: number
  pauseMs: number
  earlyMs: number
  manualMs: number
}

export interface PetProjection {
  affection: number
  peakAffection: number
  currentStreakDays: number
  maxConsecutiveDays: number
  totalRaised: number
  raisedByAnimal: Record<AnimalId, number>
  dailyGainToday: number
  dailyGains: Record<string, number>
  recordEffects: Map<string, RecordPetEffect>
  unlockedAnimals: AnimalId[]
  unlockedSkins: Record<AnimalId, string[]>
  weekFarmSlice: (weekStartDate: string) => WeekFarmSlice
  weeklyFourColorMatrix: (weekStartDate: string) => WeeklyFourColorCell[][]
}

function emptyRaisedMap(): Record<AnimalId, number> {
  return Object.fromEntries(ANIMAL_IDS.map((id) => [id, 0])) as Record<AnimalId, number>
}

function resolveDefaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function computeStreaks(daySet: Set<string>, todayKey: string): { currentStreakDays: number; maxConsecutiveDays: number } {
  if (daySet.size === 0) return { currentStreakDays: 0, maxConsecutiveDays: 0 }
  const sortedDays = [...daySet].sort()
  let maxConsecutiveDays = 1
  let run = 1
  for (let i = 1; i < sortedDays.length; i++) {
    if (dayDistance(sortedDays[i - 1]!, sortedDays[i]!) === 1) {
      run += 1
      if (run > maxConsecutiveDays) maxConsecutiveDays = run
    } else {
      run = 1
    }
  }
  const yesterdayKey = addDays(todayKey, -1)
  let cursor = daySet.has(todayKey) ? todayKey : daySet.has(yesterdayKey) ? yesterdayKey : null
  let currentStreakDays = 0
  while (cursor && daySet.has(cursor)) {
    currentStreakDays += 1
    cursor = addDays(cursor, -1)
  }
  return { currentStreakDays, maxConsecutiveDays }
}

function sampleEvenly<T>(items: readonly T[], limit: number): T[] {
  if (items.length <= limit) return [...items]
  const out: T[] = []
  for (let i = 0; i < limit; i++) {
    out.push(items[Math.floor((i * items.length) / limit)]!)
  }
  return out
}

function resolveCellState(cell: WeeklyFourColorCell): FourColorState {
  const candidates: Array<[FourColorState, number]> = [
    ['early', cell.earlyMs],
    ['focus', cell.focusMs],
    ['pause', cell.pauseMs],
    ['manual', cell.manualMs],
  ]
  let bestState: FourColorState = 'empty'
  let bestMs = 0
  for (const [state, ms] of candidates) {
    if (ms > bestMs) {
      bestMs = ms
      bestState = state
    }
  }
  return bestState
}

export function projectPetDomain(input: PetProjectionInput): PetProjection {
  const timeZone = input.timeZone ?? resolveDefaultTimeZone()
  const now = input.now ?? Date.now()
  const todayKey = zoneDate(now, timeZone)
  const retroCutoffAt = input.retroCutoffAt !== undefined ? input.retroCutoffAt : (input.pet?.retroCutoffAt ?? null)

  const sortedRecords = [...input.records].sort((a, b) => {
    if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt
    if (a.endedAt !== b.endedAt) return a.endedAt - b.endedAt
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  let affection = 0
  let peakAffection = 0
  let totalRaised = 0
  const raisedByAnimal = emptyRaisedMap()
  const dailyGains: Record<string, number> = {}
  const recordEffects = new Map<string, RecordPetEffect>()
  const activeDayKeys = new Set<string>()
  const validRecordsChronological: Array<{ record: FocusRecord; effect: RecordPetEffect }> = []

  for (const record of sortedRecords) {
    const recordZone = record.timeZone || timeZone
    const dayKey = zoneDate(record.startedAt, recordZone)
    const retroactive = retroCutoffAt !== null && record.endedAt <= retroCutoffAt
    const animalId: AnimalId = retroactive ? 'black-cat' : (record.animalId ?? 'black-cat')
    const skinId = retroactive ? 'default' : (record.skinId ?? 'default')

    if (record.source === 'manual' || record.status === 'interrupted') {
      recordEffects.set(record.id, {
        recordId: record.id,
        animalId,
        skinId,
        affectionDelta: 0,
        litter: 0,
        validForPet: false,
        retroactive,
        dayKey,
      })
      continue
    }

    if (record.status === 'completed' && record.durationMs >= AFFECTION_STEP_MS) {
      const rawGain = Math.min(MAX_SESSION_AFFECTION, Math.floor(record.durationMs / AFFECTION_STEP_MS))
      const usedToday = dailyGains[dayKey] ?? 0
      const allowedToday = Math.max(0, MAX_DAILY_AFFECTION - usedToday)
      const gain = Math.min(rawGain, allowedToday)
      dailyGains[dayKey] = usedToday + gain
      affection += gain
      if (affection > peakAffection) peakAffection = affection

      const litter = Math.min(MAX_SESSION_LITTER, Math.max(1, Math.floor(record.durationMs / LITTER_STEP_MS)))
      totalRaised += litter
      raisedByAnimal[animalId] = (raisedByAnimal[animalId] ?? 0) + litter
      activeDayKeys.add(dayKey)

      const effect: RecordPetEffect = {
        recordId: record.id,
        animalId,
        skinId,
        affectionDelta: gain,
        litter,
        validForPet: true,
        retroactive,
        dayKey,
      }
      recordEffects.set(record.id, effect)
      validRecordsChronological.push({ record, effect })
      continue
    }

    if (record.status === 'early') {
      if (retroactive) {
        recordEffects.set(record.id, {
          recordId: record.id,
          animalId,
          skinId,
          affectionDelta: 0,
          litter: 0,
          validForPet: false,
          retroactive: true,
          dayKey,
        })
      } else {
        const prev = affection
        affection = Math.max(0, affection - EARLY_PENALTY_AFFECTION)
        recordEffects.set(record.id, {
          recordId: record.id,
          animalId,
          skinId,
          affectionDelta: affection - prev,
          litter: 0,
          validForPet: true,
          retroactive: false,
          dayKey,
        })
      }
      continue
    }

    recordEffects.set(record.id, {
      recordId: record.id,
      animalId,
      skinId,
      affectionDelta: 0,
      litter: 0,
      validForPet: false,
      retroactive,
      dayKey,
    })
  }

  const { currentStreakDays, maxConsecutiveDays } = computeStreaks(activeDayKeys, todayKey)

  const unlockedAnimals: AnimalId[] = ANIMAL_CATALOG.filter((animal) => {
    if (animal.unlockType === 'affection') return peakAffection >= animal.unlockThreshold
    if (animal.unlockType === 'streak') return maxConsecutiveDays >= animal.unlockThreshold
    return totalRaised >= animal.unlockThreshold
  }).map((animal) => animal.id)

  const unlockedSkins = Object.fromEntries(
    ANIMAL_IDS.map((animalId) => {
      const raised = raisedByAnimal[animalId] ?? 0
      const skins = SKIN_CATALOG[animalId].filter((s) => raised >= s.unlockAt).map((s) => s.id)
      return [animalId, skins.length ? skins : ['default']]
    }),
  ) as Record<AnimalId, string[]>

  function weekFarmSlice(weekStartDate: string): WeekFarmSlice {
    const safeStart = /^\d{4}-\d{2}-\d{2}$/.test(weekStartDate) ? weekStartDate : dateKey(now)
    const weekEndDate = addDays(safeStart, 6)
    const allInstances: FarmInstance[] = []
    let totalDurationMs = 0
    for (const { record, effect } of validRecordsChronological) {
      if (effect.dayKey < safeStart || effect.dayKey > weekEndDate) continue
      totalDurationMs += record.durationMs
      for (let i = 0; i < effect.litter; i++) {
        allInstances.push({
          id: `${record.id}#${i}`,
          recordId: record.id,
          animalId: effect.animalId,
          skinId: effect.skinId,
          title: record.title,
          startedAt: record.startedAt,
          durationMs: record.durationMs,
          indexInRecord: i,
        })
      }
    }
    return {
      weekStartDate: safeStart,
      weekEndDate,
      weekTotalCount: allInstances.length,
      totalDurationMs,
      instances: sampleEvenly(allInstances, MAX_FARM_INSTANCES),
    }
  }

  function weeklyFourColorMatrix(weekStartDate: string): WeeklyFourColorCell[][] {
    const safeStart = /^\d{4}-\d{2}-\d{2}$/.test(weekStartDate) ? weekStartDate : dateKey(now)
    const dates = Array.from({ length: 7 }, (_, i) => addDays(safeStart, i))
    const dateIndex = new Map(dates.map((d, idx) => [d, idx]))
    const matrix: WeeklyFourColorCell[][] = dates.map((date) =>
      Array.from({ length: 24 }, (_, hour) => ({
        date,
        hour,
        state: 'empty' as FourColorState,
        focusMs: 0,
        pauseMs: 0,
        earlyMs: 0,
        manualMs: 0,
      })),
    )

    for (const record of sortedRecords) {
      const zone = record.timeZone || timeZone
      const segs = [...record.segments].sort((a, b) => a.start - b.start)
      const kind: 'manual' | 'early' | 'focus' =
        record.source === 'manual' ? 'manual' : record.status === 'early' ? 'early' : 'focus'

      for (const seg of segs) {
        for (const bucket of intervalBuckets(seg.start, seg.end, zone)) {
          const dayIdx = dateIndex.get(bucket.date)
          if (dayIdx === undefined) continue
          const cell = matrix[dayIdx]![bucket.hour]!
          if (kind === 'manual') cell.manualMs += bucket.ms
          else if (kind === 'early') cell.earlyMs += bucket.ms
          else cell.focusMs += bucket.ms
        }
      }

      if (record.source !== 'manual' && record.pausedMs > 0) {
        const gaps: Array<[number, number]> = []
        if (segs.length === 0) {
          if (record.endedAt > record.startedAt) gaps.push([record.startedAt, record.endedAt])
        } else {
          if (segs[0]!.start > record.startedAt) gaps.push([record.startedAt, segs[0]!.start])
          for (let i = 0; i < segs.length - 1; i++) {
            if (segs[i + 1]!.start > segs[i]!.end) gaps.push([segs[i]!.end, segs[i + 1]!.start])
          }
          if (record.status !== 'interrupted' && record.endedAt > segs[segs.length - 1]!.end) {
            gaps.push([segs[segs.length - 1]!.end, record.endedAt])
          }
        }
        for (const [gapStart, gapEnd] of gaps) {
          for (const bucket of intervalBuckets(gapStart, gapEnd, zone)) {
            const dayIdx = dateIndex.get(bucket.date)
            if (dayIdx === undefined) continue
            matrix[dayIdx]![bucket.hour]!.pauseMs += bucket.ms
          }
        }
      }
    }

    for (const row of matrix) {
      for (const cell of row) {
        cell.state = resolveCellState(cell)
      }
    }
    return matrix
  }

  return {
    affection,
    peakAffection,
    currentStreakDays,
    maxConsecutiveDays,
    totalRaised,
    raisedByAnimal,
    dailyGainToday: dailyGains[todayKey] ?? 0,
    dailyGains,
    recordEffects,
    unlockedAnimals,
    unlockedSkins,
    weekFarmSlice,
    weeklyFourColorMatrix,
  }
}

export function resolveSessionPet(
  pet: PetData | undefined | null,
  projection: PetProjection,
  rng: () => number = Math.random,
): { animalId: AnimalId; skinId: string } {
  const unlocked = projection.unlockedAnimals.length ? projection.unlockedAnimals : (['black-cat'] as AnimalId[])
  let animalId: AnimalId = 'black-cat'
  if (pet?.selectedAnimalId === 'random') {
    const raw = rng()
    const index = Math.min(unlocked.length - 1, Math.max(0, Math.floor(raw * unlocked.length)))
    animalId = unlocked[index] ?? 'black-cat'
  } else if (pet?.selectedAnimalId && unlocked.includes(pet.selectedAnimalId)) {
    animalId = pet.selectedAnimalId
  }

  const allowedSkins = projection.unlockedSkins[animalId] ?? ['default']
  const preferredSkin = pet?.selectedSkins?.[animalId]
  const skinId = preferredSkin && allowedSkins.includes(preferredSkin) ? preferredSkin : 'default'
  return { animalId, skinId }
}
