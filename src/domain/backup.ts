import type { AppData, ModulePref, PetData, PetSkinMap, ProtectionModuleKey, ProtectionModules } from './model'
import { ANIMAL_IDS, WHITE_NOISE_IDS, defaultProtection } from './model'
import {
  APPS_SUB_KEYS,
  QUIET_SUB_KEYS,
  STRICT_SUB_KEYS,
} from './protectionModules'
import { validateEvent } from './calendar'

const PET_FIELDS = ['version', 'selectedAnimalId', 'lastSelectedItemId', 'retroCutoffAt'] as const
const BOOLEAN_PREFERENCES = ['autoRest', 'pomodoroLoop', 'keepScreenOn', 'leaveAppFail'] as const

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isChoice = (value: unknown, choices: readonly string[]) =>
  typeof value === 'string' && choices.includes(value)

const nonBlankString = (value: unknown) => typeof value === 'string' && value.trim().length > 0
const validSkin = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && [...value].length <= 40

const finiteInRange = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

function validPet(pet: unknown): boolean {
  if (!isObject(pet) ||
    pet.version !== 1 ||
    (pet.selectedAnimalId !== 'random' && !isChoice(pet.selectedAnimalId, ANIMAL_IDS)) ||
    (pet.lastSelectedItemId !== null && !nonBlankString(pet.lastSelectedItemId)) ||
    (pet.retroCutoffAt !== null && !finiteInRange(pet.retroCutoffAt, 0, Infinity))
  ) return false
  return pet.selectedSkins === undefined || (
    isObject(pet.selectedSkins) &&
    Object.entries(pet.selectedSkins).every(([animal, skin]) =>
      isChoice(animal, ANIMAL_IDS) && validSkin(skin),
    )
  )
}

function cleanPet(pet: PetData): PetData {
  const result = pick(pet, PET_FIELDS)
  if (isObject(pet.selectedSkins)) {
    const skins: PetSkinMap = {}
    for (const animal of ANIMAL_IDS) {
      const skin = pet.selectedSkins[animal]
      if (validSkin(skin)) skins[animal] = skin
    }
    result.selectedSkins = skins
  }
  return result
}

const MODULE_ALLOWED_KEYS: Record<ProtectionModuleKey, readonly string[]> = {
  apps: APPS_SUB_KEYS,
  strict: STRICT_SUB_KEYS,
  quiet: QUIET_SUB_KEYS,
}

function cleanBackupModules(raw: ProtectionModules): ProtectionModules {
  const cleanModule = <K extends string>(
    key: ProtectionModuleKey,
    mod: ModulePref<K>,
  ): ModulePref<K> => {
    const out: ModulePref<K> = { enabled: mod.enabled }
    if (mod.custom) {
      const custom: Partial<Record<K, boolean>> = {}
      let hasAny = false
      for (const subKey of MODULE_ALLOWED_KEYS[key]) {
        const val = mod.custom[subKey as K]
        if (typeof val === 'boolean') {
          custom[subKey as K] = val
          hasAny = true
        }
      }
      if (hasAny) out.custom = custom
    }
    return out
  }
  const result: ProtectionModules = {
    apps: cleanModule('apps', raw.apps),
    strict: cleanModule('strict', raw.strict),
    quiet: cleanModule('quiet', raw.quiet),
  }
  if (typeof raw.master === 'boolean') result.master = raw.master
  if (typeof raw.initialized === 'boolean') result.initialized = raw.initialized
  if (typeof raw.focusLock === 'boolean') result.focusLock = raw.focusLock
  return result
}

function validateBackupModules(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const record = raw as Record<string, unknown>
  for (const flag of ['master', 'initialized', 'focusLock']) {
    if (record[flag] !== undefined && typeof record[flag] !== 'boolean') return false
  }
  for (const moduleKey of ['apps', 'strict', 'quiet'] as const) {
    const mod = record[moduleKey]
    if (!mod || typeof mod !== 'object' || Array.isArray(mod)) return false
    const modObj = mod as Record<string, unknown>
    if (typeof modObj.enabled !== 'boolean') return false
    if (modObj.custom !== undefined) {
      if (!modObj.custom || typeof modObj.custom !== 'object' || Array.isArray(modObj.custom))
        return false
      const allowed = MODULE_ALLOWED_KEYS[moduleKey]
      for (const [k, v] of Object.entries(modObj.custom as Record<string, unknown>)) {
        if (!allowed.includes(k) || typeof v !== 'boolean') return false
      }
    }
  }
  return true
}
export interface Backup {
  app: 'xiaomao-focus'
  version: 1
  createdAt: string
  data: AppData
}
export function makeBackup(data: AppData): string {
  return JSON.stringify(
    {
      app: 'xiaomao-focus',
      version: 1,
      createdAt: new Date().toISOString(),
      data: businessData(data),
    },
    null,
    2,
  )
}
// A positive field list prevents new adapter journals or untrusted imported runtime
// fields becoming portable business state. Adapter original-state journals stay native.
function pick<T extends object>(value: T, keys: readonly string[]): T {
  const source = value as Record<string, unknown>
  return Object.fromEntries(
    keys.filter((key) => Object.hasOwn(source, key) && source[key] !== undefined)
      .map((key) => [key, source[key]]),
  ) as T
}
function businessData(data: AppData): AppData {
  const result = pick(data, ['schemaVersion', 'deletedRecordIds'])
  const fields = {
    themes: 'id name color order collapsed deleted',
    items: 'id themeId title note mode minutes order deleted',
    records:
      'id itemId themeId title themeName color mode targetMs startedAt endedAt timeZone durationMs pausedMs status animalId skinId note source failReason',
    events: 'id title start end allDay note repeat weekdays until itemId reminderMinutes',
    eventExceptions: 'eventId date cancelled title start end',
    semesters: 'id name startDate weeks',
    courses:
      'id semesterId title weekday firstPeriod lastPeriod firstWeek lastWeek parity room teacher color reminderMinutes',
    courseExceptions: 'courseId date cancelled start end',
    lockConfigurations: 'id name minutes strict enhancements',
  } as const
  const whitelist = (value: NonNullable<AppData['items'][number]['whitelist']>) =>
    value.source === 'global'
      ? { source: 'global' as const }
      : { source: 'custom' as const, packages: [...value.packages] }
  for (const [key, allowed] of Object.entries(fields))
    (result as unknown as Record<string, unknown>)[key] = (
      (data as unknown as Record<string, object[]>)[key] ?? []
    ).map((row) => pick(row, allowed.split(' ')))
  result.items.forEach((row, i) => {
    if (data.items[i]?.whitelist) row.whitelist = whitelist(data.items[i]!.whitelist!)
  })
  result.records.forEach((row, i) => {
    row.segments = data.records[i]!.segments.map((s) => pick(s, ['start', 'end']))
  })
  result.semesters.forEach((row, i) => {
    row.periods = data.semesters[i]!.periods.map((p) => pick(p, ['index', 'start', 'end']))
  })
  if (data.lockConfigurations === undefined) delete result.lockConfigurations
  result.lockConfigurations?.forEach((row, i) => {
    row.whitelist = whitelist(data.lockConfigurations![i]!.whitelist)
  })
  result.preferences = pick(data.preferences, [
    'defaultMinutes',
    'sound',
    'vibration',
    'activeSemesterId',
    'restMinutes',
    ...BOOLEAN_PREFERENCES,
    'whiteNoise',
    'whiteNoiseVolume',
    'animation',
  ])
  if (data.preferences.protection !== undefined) {
    const protection = {
      ...defaultProtection(),
      ...pick(data.preferences.protection, [
        'study',
        'strict',
        'interceptNotifications',
        'dnd',
        'globalWhitelist',
        'enhancements',
      ]),
    }
    if (data.preferences.protection.modules !== undefined) {
      protection.modules = cleanBackupModules(data.preferences.protection.modules)
    }
    result.preferences.protection = protection
  }
  if (data.pet != null) result.pet = cleanPet(data.pet)
  // The confirmation Sheet may pass Vue proxies. The portable contract is JSON;
  // detach that representation without retaining reactive arrays or OS runtime.
  return JSON.parse(JSON.stringify(result)) as AppData
}
export function readBackup(text: string): Backup {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('备份文件不是有效的 JSON')
  }
  if (!raw || typeof raw !== 'object') throw new Error('备份文件格式不正确')
  const value = raw as Backup
  if (value.app !== 'xiaomao-focus' || value.version !== 1 || value.data?.schemaVersion !== 1)
    throw new Error('这不是兼容的小猫专注备份')
  if (!Number.isFinite(Date.parse(value.createdAt))) throw new Error('备份日期不正确')
  const data = value.data
  const validStrings = (value: unknown) =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string' && !!entry.trim())
  const validWhitelist = (value: unknown) => {
    if (!value || typeof value !== 'object') return false
    const list = value as { source?: unknown; packages?: unknown }
    return list.source === 'global' || (list.source === 'custom' && validStrings(list.packages))
  }
  const protection = data.preferences?.protection
  if (
    protection !== undefined &&
    (!protection ||
      typeof protection !== 'object' ||
      Array.isArray(protection) ||
      ['study', 'strict', 'interceptNotifications', 'dnd'].some((key) => {
        const entry = (protection as unknown as Record<string, unknown>)[key]
        return entry !== undefined && typeof entry !== 'boolean'
      }) ||
      (protection.globalWhitelist !== undefined && !validStrings(protection.globalWhitelist)) ||
      (protection.enhancements !== undefined && !validStrings(protection.enhancements)) ||
      (protection.modules !== undefined && !validateBackupModules(protection.modules)))
  )
    throw new Error('保护设置损坏')
  if (data.lockConfigurations !== undefined) {
    if (!Array.isArray(data.lockConfigurations)) throw new Error('锁机配置损坏')
    const ids = new Set<string>()
    for (const lock of data.lockConfigurations) {
      if (
        !lock ||
        typeof lock.id !== 'string' ||
        !lock.id ||
        ids.has(lock.id) ||
        typeof lock.name !== 'string' ||
        !lock.name.trim() ||
        !Number.isInteger(lock.minutes) ||
        lock.minutes < 1 ||
        (lock.strict !== undefined && typeof lock.strict !== 'boolean') ||
        (lock.enhancements !== undefined && !validStrings(lock.enhancements)) ||
        !validWhitelist(lock.whitelist)
      )
        throw new Error('锁机配置损坏')
      ids.add(lock.id)
    }
  }
  for (const key of [
    'themes',
    'items',
    'records',
    'deletedRecordIds',
    'events',
    'eventExceptions',
    'semesters',
    'courses',
    'courseExceptions',
  ] as const)
    if (!Array.isArray(data[key])) throw new Error('备份缺少必要的数据')
  if (
    !data.preferences ||
    !Number.isFinite(data.preferences.defaultMinutes) ||
    data.preferences.defaultMinutes <= 0 ||
    typeof data.preferences.sound !== 'boolean' ||
    typeof data.preferences.vibration !== 'boolean' ||
    (data.preferences.restMinutes !== undefined &&
      (!Number.isInteger(data.preferences.restMinutes) || !finiteInRange(data.preferences.restMinutes, 1, 60))) ||
    BOOLEAN_PREFERENCES.some((key) => data.preferences[key] !== undefined && typeof data.preferences[key] !== 'boolean') ||
    (data.preferences.whiteNoise !== undefined && !isChoice(data.preferences.whiteNoise, WHITE_NOISE_IDS)) ||
    (data.preferences.whiteNoiseVolume !== undefined && !finiteInRange(data.preferences.whiteNoiseVolume, 0, 1)) ||
    (data.preferences.animation !== undefined && !isChoice(data.preferences.animation, ['system', 'on', 'off']))
  )
    throw new Error('备份设置损坏')
  if (data.pet !== undefined && !validPet(data.pet)) throw new Error('伙伴设置损坏')
  for (const group of [
    data.themes,
    data.items,
    data.records,
    data.events,
    data.semesters,
    data.courses,
  ]) {
    const ids = new Set<string>()
    for (const row of group) {
      if (!row || typeof row.id !== 'string' || !row.id || ids.has(row.id))
        throw new Error('备份包含无效或重复的数据标识')
      ids.add(row.id)
    }
  }
  for (const theme of data.themes)
    if (
      typeof theme.name !== 'string' ||
      typeof theme.color !== 'string' ||
      !Number.isFinite(theme.order)
    )
      throw new Error('主题数据损坏')
  for (const item of data.items)
    if (
      typeof item.title !== 'string' ||
      !data.themes.some((t) => t.id === item.themeId) ||
      !['countdown', 'stopwatch'].includes(item.mode) ||
      !Number.isFinite(item.minutes) ||
      item.minutes <= 0
    )
      throw new Error('待办数据损坏')
  for (const event of data.events) validateEvent(event)
  for (const item of data.items) {
    const list = item.whitelist
    if (
      list !== undefined &&
      (!list ||
        typeof list !== 'object' ||
        !['global', 'custom'].includes(list.source) ||
        (list.source === 'custom' &&
          (!Array.isArray(list.packages) ||
            list.packages.some((name) => typeof name !== 'string' || !name.trim()))))
    )
      throw new Error('待办白名单损坏')
  }
  if (data.deletedRecordIds.some((id) => typeof id !== 'string'))
    throw new Error('删除记录索引损坏')
  for (const record of data.records) {
    if (
      !Number.isFinite(record.durationMs) ||
      record.durationMs < 0 ||
      !Number.isFinite(new Date(record.startedAt).getTime()) ||
      !Number.isFinite(new Date(record.endedAt).getTime()) ||
      !Array.isArray(record.segments) ||
      typeof record.timeZone !== 'string' ||
      typeof record.title !== 'string' ||
      typeof record.themeName !== 'string' ||
      typeof record.color !== 'string' ||
      !['completed', 'early', 'interrupted'].includes(record.status) ||
      (record.animalId !== undefined && !isChoice(record.animalId, ANIMAL_IDS)) ||
      (record.skinId !== undefined && !validSkin(record.skinId)) ||
      (record.note !== undefined && (typeof record.note !== 'string' || [...record.note].length > 100)) ||
      (record.source !== undefined && !isChoice(record.source, ['timer', 'manual'])) ||
      (record.failReason !== undefined && !isChoice(record.failReason, ['manual_giveup', 'left_app']))
    )
      throw new Error('专注记录损坏')
    if (
      record.segments.some(
        (s) =>
          !s ||
          typeof s !== 'object' ||
          Array.isArray(s) ||
          !Number.isFinite(s.start) ||
          !Number.isFinite(s.end) ||
          s.end < s.start,
      )
    )
      throw new Error('专注时间段损坏')
    if (
      Math.abs(record.segments.reduce((sum, s) => sum + s.end - s.start, 0) - record.durationMs) > 5
    )
      throw new Error('专注记录时长不一致')
  }
  for (const semester of data.semesters)
    if (
      !Number.isInteger(semester.weeks) ||
      semester.weeks < 1 ||
      !Array.isArray(semester.periods) ||
      semester.periods.some(
        (p) =>
          !p ||
          typeof p !== 'object' ||
          Array.isArray(p) ||
          typeof p.start !== 'string' ||
          typeof p.end !== 'string' ||
          !/^\d{2}:\d{2}$/.test(p.start) ||
          !/^\d{2}:\d{2}$/.test(p.end) ||
          p.end <= p.start,
      )
    )
      throw new Error('课表时间设置损坏')
  for (const course of data.courses)
    if (
      !data.semesters.some((s) => s.id === course.semesterId) ||
      typeof course.title !== 'string' ||
      !['all', 'odd', 'even'].includes(course.parity) ||
      !Number.isInteger(course.weekday) ||
      course.weekday < 1 ||
      course.weekday > 7 ||
      course.firstWeek > course.lastWeek ||
      course.firstPeriod > course.lastPeriod
    )
      throw new Error('课程数据损坏')
  for (const exception of data.eventExceptions)
    if (
      !exception ||
      typeof exception.eventId !== 'string' ||
      typeof exception.date !== 'string' ||
      typeof exception.cancelled !== 'boolean' ||
      (exception.start !== undefined &&
        (!Number.isFinite(Date.parse(exception.start)) ||
          !exception.end ||
          exception.end <= exception.start))
    )
      throw new Error('日程例外数据损坏')
  for (const exception of data.courseExceptions)
    if (
      !exception ||
      typeof exception.courseId !== 'string' ||
      typeof exception.date !== 'string' ||
      typeof exception.cancelled !== 'boolean' ||
      (exception.start !== undefined &&
        (!Number.isFinite(Date.parse(exception.start)) ||
          !exception.end ||
          exception.end <= exception.start))
    )
      throw new Error('课程例外数据损坏')
  return {
    app: value.app,
    version: value.version,
    createdAt: value.createdAt,
    data: businessData(data),
  }
}
