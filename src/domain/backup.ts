import type { AppData } from './model'
import { validateEvent } from './calendar'
export interface Backup {
  app: 'xiaomao-focus'
  version: 1
  createdAt: string
  data: AppData
}
export function makeBackup(data: AppData): string {
  return JSON.stringify(
    { app: 'xiaomao-focus', version: 1, createdAt: new Date().toISOString(), data },
    null,
    2,
  )
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
  return structuredClone(value)
}
