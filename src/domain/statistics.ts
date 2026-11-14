import type { FocusRecord } from './model'
import { intervalBuckets, zoneDate } from './dates'
export function statistics(
  records: FocusRecord[],
  from: string,
  to: string,
  group: 'theme' | 'item' = 'theme',
) {
  const inRange = (date: string) => date >= from && date <= to
  const daily = new Map<string, number>(),
    hours = Array<number>(24).fill(0),
    categories = new Map<string, { id: string; name: string; color: string; ms: number }>()
  let totalMs = 0,
    count = 0,
    startedTotalMs = 0
  for (const record of records) {
    if (inRange(zoneDate(record.startedAt, record.timeZone))) {
      count++
      startedTotalMs += record.durationMs
    }
    let recordMs = 0
    for (const segment of record.segments)
      for (const bucket of intervalBuckets(segment.start, segment.end, record.timeZone)) {
        if (!inRange(bucket.date)) continue
        totalMs += bucket.ms
        recordMs += bucket.ms
        hours[bucket.hour]! += bucket.ms
        daily.set(bucket.date, (daily.get(bucket.date) || 0) + bucket.ms)
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
export function itemToday(records: FocusRecord[], itemId: string, today: string) {
  return statistics(
    records.filter((r) => r.itemId === itemId),
    today,
    today,
  )
}
