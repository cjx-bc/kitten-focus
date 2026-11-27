import type { FocusRecord, RestSession, RestSnapshot } from './model'

export const REST_DURATION_MS = 5 * 60 * 1000
export const REST_MINUTE_OPTIONS = [5, 10, 15, 20] as const

export function resolveRestDurationMs(restMinutes?: number): number {
  if (typeof restMinutes === 'number' && Number.isInteger(restMinutes) && restMinutes >= 1 && restMinutes <= 60) {
    return restMinutes * 60_000
  }
  return REST_DURATION_MS
}

export function makeRest(
  record: FocusRecord,
  startedAt = record.endedAt,
  durationMs = REST_DURATION_MS,
): RestSession {
  if (record.durationMs <= 0 || record.status === 'interrupted')
    throw new Error('本次专注不能开始休息')
  const safeDuration = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : REST_DURATION_MS
  return {
    durationMs: safeDuration,
    record: structuredClone(record),
    startedAt,
    endsAt: startedAt + safeDuration,
    state: 'running',
  }
}

export function readRest(session: RestSession | null, now: number): RestSnapshot {
  if (!session) return { session: null, remainingMs: 0 }
  const totalMs = session.durationMs && session.durationMs > 0 ? session.durationMs : REST_DURATION_MS
  const remainingMs =
    session.state === 'completed'
      ? 0
      : Math.max(0, Math.min(totalMs, session.endsAt - now))
  return {
    session: { ...session, state: remainingMs === 0 ? 'completed' : 'running' },
    remainingMs,
  }
}
