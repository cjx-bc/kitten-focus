export const pad = (value: number) => String(value).padStart(2, '0')
export function dateKey(value: Date | number = new Date()): string {
  const d = new Date(value)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const localDate = (key: string) => new Date(`${key}T12:00:00`)
export function addDays(key: string, days: number) {
  const d = localDate(key)
  d.setDate(d.getDate() + days)
  return dateKey(d)
}
export function dayDistance(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)
}
export function weekday(key: string) {
  return localDate(key).getDay() || 7
}
export function weekStart(key: string) {
  return addDays(key, 1 - weekday(key))
}
export function localInput(value: number | Date = Date.now()) {
  const d = new Date(value)
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function localTime(ms: number) {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function readableDate(key: string) {
  const d = localDate(key)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
export const weekdayName = (key: string) =>
  ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][weekday(key) - 1]!
export function duration(ms: number, compact = false) {
  const seconds = Math.floor(Math.max(0, ms) / 1000),
    minutes = Math.floor(seconds / 60),
    hours = Math.floor(minutes / 60)
  if (hours)
    return `${hours}${compact ? 'h' : '小时'}${minutes % 60 ? `${minutes % 60}${compact ? 'm' : '分'}` : ''}`
  if (minutes) return `${minutes}${compact ? 'm' : '分钟'}`
  return `${seconds}${compact ? 's' : '秒'}`
}
export function timer(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return s >= 3600
    ? `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
    : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}
export function zoneDate(ms: number, zone: string) {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(ms)
  } catch {
    return dateKey(ms)
  }
}
export function zoneHour(ms: number, zone: string) {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(ms),
    )
  } catch {
    return new Date(ms).getHours()
  }
}
export function zoneTime(ms: number, zone: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(ms)
  } catch {
    return localTime(ms)
  }
}
export function intervalBuckets(
  start: number,
  end: number,
  zone: string,
): { date: string; hour: number; ms: number }[] {
  const grouped = new Map<string, { date: string; hour: number; ms: number }>()
  for (let cursor = start; cursor < end;) {
    const boundary = Math.min(end, (Math.floor(cursor / 60000) + 1) * 60000)
    const date = zoneDate(cursor, zone),
      hour = zoneHour(cursor, zone),
      key = `${date}/${hour}`
    const row = grouped.get(key) || { date, hour, ms: 0 }
    row.ms += boundary - cursor
    grouped.set(key, row)
    cursor = boundary
  }
  return [...grouped.values()]
}
export function periodRange(kind: string, anchor: string): [string, string] {
  if (kind !== 'day' && kind !== 'week' && kind !== 'month' && kind !== 'year')
    return ['0000-01-01', '9999-12-31']
  const safeAnchor =
    /^\d{4}-\d{2}-\d{2}$/.test(anchor) && Number.isFinite(localDate(anchor).getTime())
      ? anchor
      : dateKey()
  if (kind === 'day') return [safeAnchor, safeAnchor]
  if (kind === 'week') {
    const start = weekStart(safeAnchor)
    return [start, addDays(start, 6)]
  }
  const d = localDate(safeAnchor)
  if (kind === 'month')
    return [`${safeAnchor.slice(0, 7)}-01`, dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0))]
  return [`${d.getFullYear()}-01-01`, `${d.getFullYear()}-12-31`]
}
