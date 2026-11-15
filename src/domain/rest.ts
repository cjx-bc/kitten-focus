import type { FocusRecord, RestSession, RestSnapshot } from './model'

export const REST_DURATION_MS = 5 * 60 * 1000

export function makeRest(record: FocusRecord, startedAt = record.endedAt): RestSession {
  if (record.durationMs <= 0 || record.status === 'interrupted')
    throw new Error('本次专注不能开始休息')
  return {
    record: structuredClone(record),
    startedAt,
    endsAt: startedAt + REST_DURATION_MS,
    state: 'running',
  }
}

export function readRest(session: RestSession | null, now: number): RestSnapshot {
  if (!session) return { session: null, remainingMs: 0 }
  const remainingMs =
    session.state === 'completed'
      ? 0
      : Math.max(0, Math.min(REST_DURATION_MS, session.endsAt - now))
  return {
    session: { ...session, state: remainingMs === 0 ? 'completed' : 'running' },
    remainingMs,
  }
}
