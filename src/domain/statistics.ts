import type { FocusRecord } from './model'
import { addDays, dateKey, intervalBuckets, localDate, zoneDate, zoneHour } from './dates'

const DAY_MS = 86_400_000

function rangeEpochBounds(from: string, to: string): [number, number] {
  const parsedMin = from === '0000-01-01' ? -Infinity : Date.parse(`${from}T00:00:00Z`) - DAY_MS
  const parsedMax = to === '9999-12-31' ? Infinity : Date.parse(`${to}T23:59:59.999Z`) + DAY_MS
  return [
    Number.isFinite(parsedMin) ? parsedMin : -Infinity,
    Number.isFinite(parsedMax) ? parsedMax : Infinity,
  ]
}

export interface TodayItemSummary {
  count: number
  totalMs: number
}

export interface TodaySummary {
  totalMs: number
  count: number
  items: Map<string, TodayItemSummary>
}

export interface StatisticsCategory {
  id: string
  name: string
  color: string
  ms: number
  count: number
}

export interface HeatmapDay {
  date: string
  ms: number
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface YearlyHeatmap {
  from: string
  to: string
  days: HeatmapDay[]
  maxMs: number
  maxCount: number
}

export function statistics(
  records: FocusRecord[],
  from: string,
  to: string,
  group: 'theme' | 'item' = 'theme',
) {
  const [minEpoch, maxEpoch] = rangeEpochBounds(from, to)
  const inRange = (date: string) => date >= from && date <= to
  const daily = new Map<string, number>(),
    dailyCounts = new Map<string, number>(),
    hours = Array<number>(24).fill(0),
    hourCounts = Array<number>(24).fill(0),
    categories = new Map<string, StatisticsCategory>()
  let totalMs = 0,
    count = 0,
    earlyCount = 0,
    startedTotalMs = 0
  for (const record of records) {
    const startDate =
      record.startedAt >= minEpoch && record.startedAt <= maxEpoch
        ? zoneDate(record.startedAt, record.timeZone)
        : ''
    const startedInRange = Boolean(startDate && inRange(startDate))
    if (startedInRange) {
      count++
      if (record.status === 'early') earlyCount++
      startedTotalMs += record.durationMs
      dailyCounts.set(startDate, (dailyCounts.get(startDate) || 0) + 1)
      const startHour = zoneHour(record.startedAt, record.timeZone)
      if (startHour >= 0 && startHour < 24) {
        hourCounts[startHour] = (hourCounts[startHour] ?? 0) + 1
      }
    }
    let recordMs = 0
    for (const segment of record.segments) {
      if (segment.end <= minEpoch || segment.start > maxEpoch) continue
      for (const bucket of intervalBuckets(segment.start, segment.end, record.timeZone)) {
        if (!inRange(bucket.date)) continue
        totalMs += bucket.ms
        recordMs += bucket.ms
        hours[bucket.hour]! += bucket.ms
        daily.set(bucket.date, (daily.get(bucket.date) || 0) + bucket.ms)
      }
    }
    if (recordMs > 0 || startedInRange) {
      const id = (group === 'theme' ? record.themeId : record.itemId) || 'free',
        row = categories.get(id) || {
          id,
          name: group === 'theme' ? record.themeName || '自由专注' : record.title,
          color: record.color,
          ms: 0,
          count: 0,
        }
      row.ms += recordMs
      if (startedInRange) row.count += 1
      categories.set(id, row)
    }
  }
  return {
    totalMs,
    count,
    earlyCount,
    averageMs: count ? startedTotalMs / count : null,
    days: daily.size,
    daily: [...daily].sort(([a], [b]) => a.localeCompare(b)),
    dailyCounts: [...dailyCounts].sort(([a], [b]) => a.localeCompare(b)),
    hours,
    hourCounts,
    categories: [...categories.values()].sort((a, b) => b.ms - a.ms || b.count - a.count),
  }
}

function normalizeAnchorDate(anchorDate: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
    const parsed = localDate(anchorDate)
    if (Number.isFinite(parsed.getTime()) && dateKey(parsed) === anchorDate) {
      return anchorDate
    }
  }
  return dateKey()
}

function intensityLevel(value: number, maxValue: number, hasActivity: boolean): 0 | 1 | 2 | 3 | 4 {
  if (!hasActivity) return 0
  if (maxValue <= 0 || value <= 0) return 1
  const ratio = value / maxValue
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

/** Build a 365-day heatmap ending on anchorDate using the same timezone rules as statistics(). */
export function yearlyHeatmap(
  records: FocusRecord[],
  anchorDate: string,
  metric: 'duration' | 'count' = 'duration',
): YearlyHeatmap {
  const to = normalizeAnchorDate(anchorDate)
  const from = addDays(to, -364)
  const summary = statistics(records, from, to)
  const msByDate = new Map(summary.daily)
  const countByDate = new Map(summary.dailyCounts)

  let maxMs = 0
  let maxCount = 0
  for (const ms of msByDate.values()) if (ms > maxMs) maxMs = ms
  for (const cnt of countByDate.values()) if (cnt > maxCount) maxCount = cnt

  const days: HeatmapDay[] = []
  for (let i = 0, day = from; i < 365; i++, day = addDays(day, 1)) {
    const ms = msByDate.get(day) || 0
    const count = countByDate.get(day) || 0
    const active = ms > 0 || count > 0
    const level =
      metric === 'count'
        ? intensityLevel(count, maxCount, active)
        : intensityLevel(ms, maxMs, active)
    days.push({ date: day, ms, count, level })
  }

  return { from, to, days, maxMs, maxCount }
}

export function todaySummary(records: FocusRecord[], today: string): TodaySummary {
  const [minEpoch, maxEpoch] = rangeEpochBounds(today, today)
  const items = new Map<string, TodayItemSummary>()
  let totalMs = 0,
    count = 0
  const itemRow = (itemId: string) => {
    let row = items.get(itemId)
    if (!row) {
      row = { count: 0, totalMs: 0 }
      items.set(itemId, row)
    }
    return row
  }
  for (const record of records) {
    if (
      record.startedAt >= minEpoch &&
      record.startedAt <= maxEpoch &&
      zoneDate(record.startedAt, record.timeZone) === today
    ) {
      count++
      if (record.itemId) itemRow(record.itemId).count++
    }
    let recordMs = 0
    for (const segment of record.segments) {
      if (segment.end <= minEpoch || segment.start > maxEpoch) continue
      if (
        segment.end > segment.start &&
        segment.end - segment.start <= DAY_MS &&
        zoneDate(segment.start, record.timeZone) === today &&
        zoneDate(segment.end - 1, record.timeZone) === today
      ) {
        recordMs += segment.end - segment.start
        continue
      }
      for (const bucket of intervalBuckets(segment.start, segment.end, record.timeZone)) {
        if (bucket.date === today) recordMs += bucket.ms
      }
    }
    if (recordMs > 0) {
      totalMs += recordMs
      if (record.itemId) itemRow(record.itemId).totalMs += recordMs
    }
  }
  return { totalMs, count, items }
}

export function itemToday(records: FocusRecord[], itemId: string, today: string) {
  return statistics(
    records.filter((r) => r.itemId === itemId),
    today,
    today,
  )
}
