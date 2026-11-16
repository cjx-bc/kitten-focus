import type { AppData } from './model'
import { defaultProtection } from './model'
import { validateEvent } from './calendar'
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
function pick<T extends object>(value: T, keys: string[]): T {
  return Object.fromEntries(
    keys.filter((key) => key in value).map((key) => [key, (value as Record<string, unknown>)[key]]),
  ) as T
}
function businessData(data: AppData): AppData {
  const result = pick(data, ['schemaVersion', 'deletedRecordIds'])
  const fields = {
    themes: 'id name color order collapsed deleted',
    items: 'id themeId title note mode minutes order deleted',
    records:
      'id itemId themeId title themeName color mode targetMs startedAt endedAt timeZone durationMs pausedMs status',
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
  ])
  if (data.preferences.protection !== undefined)
    result.preferences.protection = {
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
      (protection.enhancements !== undefined && !validStrings(protection.enhancements)))
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
    typeof data.preferences.vibration !== 'boolean'
  )
    throw new Error('备份设置损坏')
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
      !['completed', 'early', 'interrupted'].includes(record.status)
    )
      throw new Error('专注记录损坏')
    if (
      record.segments.some(
        (s) => !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end < s.start,
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
        (p) => !/^\d{2}:\d{2}$/.test(p.start) || !/^\d{2}:\d{2}$/.test(p.end) || p.end <= p.start,
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
