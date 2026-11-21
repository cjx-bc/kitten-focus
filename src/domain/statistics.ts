import type { FocusRecord } from './model'
import { intervalBuckets, zoneDate } from './dates'

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

export function statistics(
  records: FocusRecord[],
  from: string,
  to: string,
  group: 'theme' | 'item' = 'theme',
) {
  const [minEpoch, maxEpoch] = rangeEpochBounds(from, to)
  const inRange = (date: string) => date >= from && date <= to
  const daily = new Map<string, number>(),
    hours = Array<number>(24).fill(0),
    categories = new Map<string, { id: string; name: string; color: string; ms: number }>()
  let totalMs = 0,
    count = 0,
    startedTotalMs = 0
  for (const record of records) {
    if (
      record.startedAt >= minEpoch &&
      record.startedAt <= maxEpoch &&
      inRange(zoneDate(record.startedAt, record.timeZone))
    ) {
      count++
      startedTotalMs += record.durationMs
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
    if (recordMs) {
      const id = (group === 'theme' ? record.themeId : record.itemId) || 'free',
        row = categories.get(id) || {
          id,
          name: group === 'theme' ? record.themeName || '自由专注' : record.title,
          color: record.color,
          ms: 0,
        }
      row.ms += recordMs
      categories.set(id, row)
    }
  }
  return {
    totalMs,
    count,
    averageMs: count ? startedTotalMs / count : null,
    days: daily.size,
    daily: [...daily].sort(([a], [b]) => a.localeCompare(b)),
    hours,
    categories: [...categories.values()].sort((a, b) => b.ms - a.ms),
  }
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
