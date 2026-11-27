import type { FocusItem, FocusRecord, Theme } from './model'
import { uid } from './model'
import { dateKey, localDate } from './dates'

export interface ManualBackfillInput {
  id?: string
  itemId: string | null
  date: string
  startTime: string
  endTime: string
  note?: string
  items: readonly FocusItem[]
  themes: readonly Theme[]
  timeZone?: string
  now?: number
}

const TIME_RE = /^(\d{2}):(\d{2})$/

function parseTimeMinutes(value: string): number {
  const m = TIME_RE.exec(value.trim())
  if (!m) throw new Error('请选择有效的开始与结束时间')
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('请选择有效的开始与结束时间')
  }
  return hours * 60 + minutes
}

function assertValidDate(date: string): string {
  const trimmed = date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('请选择有效的补录日期')
  }
  const parsed = localDate(trimmed)
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== trimmed) {
    throw new Error('请选择有效的补录日期')
  }
  return trimmed
}

function resolveTimeZone(explicit?: string): string {
  if (explicit) return explicit
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Validates and constructs a manual backfill FocusRecord isolated from pet rewards.
 */
export function buildManualFocusRecord(input: ManualBackfillInput): FocusRecord {
  const date = assertValidDate(input.date)
  parseTimeMinutes(input.startTime)
  parseTimeMinutes(input.endTime)

  const startedAt = new Date(`${date}T${input.startTime.trim()}:00`).getTime()
  const endedAt = new Date(`${date}T${input.endTime.trim()}:00`).getTime()
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
    throw new Error('补录时间格式无效')
  }
  const durationMs = endedAt - startedAt
  if (durationMs <= 0) {
    throw new Error('结束时间必须晚于开始时间')
  }

  const now = input.now ?? Date.now()
  if (endedAt > now) {
    throw new Error('补录结束时间不能晚于当前时刻')
  }

  const trimmedNote = (input.note ?? '').trim()
  if ([...trimmedNote].length > 100) {
    throw new Error('复盘小结最多 100 字')
  }

  let item: FocusItem | undefined
  if (input.itemId) {
    item = input.items.find((candidate) => candidate.id === input.itemId && !candidate.deleted)
    if (!item) {
      throw new Error('所选待办不存在或已删除')
    }
  }
  const theme = item ? input.themes.find((t) => t.id === item.themeId && !t.deleted) : undefined

  return {
    id: input.id ?? uid(),
    itemId: item?.id ?? null,
    themeId: theme?.id ?? null,
    title: item?.title || '自由专注',
    themeName: theme?.name || '自由专注',
    color: theme?.color || '#222222',
    mode: item?.mode ?? 'countdown',
    targetMs: durationMs,
    startedAt,
    endedAt,
    timeZone: resolveTimeZone(input.timeZone),
    durationMs,
    pausedMs: 0,
    segments: [{ start: startedAt, end: endedAt }],
    status: 'completed',
    source: 'manual',
    ...(trimmedNote ? { note: trimmedNote } : {}),
  }
}
