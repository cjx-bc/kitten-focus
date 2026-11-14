import type { ActiveFocus, FocusRecord, FocusSnapshot } from './model'
export interface Clock {
  epoch: number
  mono: number
  boot: number
}
export function elapsed(session: ActiveFocus, clock: Clock) {
  const value =
    session.elapsedMs +
    (session.state === 'running' ? Math.max(0, clock.mono - session.anchorMono) : 0)
  return session.mode === 'countdown' ? Math.min(value, session.targetMs) : value
}
export function settle(
  session: ActiveFocus,
  clock: Clock,
  action: 'read' | 'pause' | 'resume' | 'finish' = 'read',
): FocusSnapshot {
  const s = structuredClone(session)
  if (s.bootId !== clock.boot) return complete(s, clock, 'interrupted', true)
  const value = elapsed(s, clock)
  if (s.mode === 'countdown' && value >= s.targetMs) return complete(s, clock, 'completed')
  if (action === 'finish') return complete(s, clock, s.mode === 'countdown' ? 'early' : 'completed')
  if (action === 'pause' && s.state === 'running') {
    closeSegment(s, clock)
    s.state = 'paused'
    s.anchorMono = clock.mono
  } else if (action === 'resume' && s.state === 'paused') {
    s.pausedMs += Math.max(0, clock.mono - s.anchorMono)
    s.state = 'running'
    s.anchorMono = clock.mono
    s.anchorEpoch = clock.epoch
  }
  return { session: s, elapsedMs: elapsed(s, clock) }
}
function closeSegment(s: ActiveFocus, clock: Clock) {
  const delta =
    s.mode === 'countdown'
      ? Math.min(Math.max(0, clock.mono - s.anchorMono), Math.max(0, s.targetMs - s.elapsedMs))
      : Math.max(0, clock.mono - s.anchorMono)
  if (delta > 0) s.segments.push({ start: s.anchorEpoch, end: s.anchorEpoch + delta })
  s.elapsedMs += delta
  s.anchorMono = clock.mono
  s.anchorEpoch = clock.epoch
}
function complete(
  s: ActiveFocus,
  clock: Clock,
  status: FocusRecord['status'],
  interrupted = false,
): FocusSnapshot {
  if (!interrupted && s.state === 'running') closeSegment(s, clock)
  if (!interrupted && s.state === 'paused') s.pausedMs += Math.max(0, clock.mono - s.anchorMono)
  const endedAt = interrupted
    ? s.segments.at(-1)?.end || s.startedAt
    : status === 'completed' && s.mode === 'countdown'
      ? s.segments.at(-1)?.end || clock.epoch
      : clock.epoch
  const record: FocusRecord = {
    id: s.id,
    itemId: s.itemId,
    themeId: s.themeId,
    title: s.title,
    themeName: s.themeName,
    color: s.color,
    mode: s.mode,
    targetMs: s.targetMs,
    startedAt: s.startedAt,
    endedAt,
    timeZone: s.timeZone,
    durationMs: s.elapsedMs,
    pausedMs: s.pausedMs,
    segments: s.segments,
    status,
  }
  return { session: null, elapsedMs: s.elapsedMs, ...(s.elapsedMs > 0 ? { record } : {}) }
}
