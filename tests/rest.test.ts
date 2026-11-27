import { describe, expect, it } from 'vitest'
import { makeRest, readRest, resolveRestDurationMs, REST_DURATION_MS } from '../src/domain/rest'
import { settle } from '../src/domain/focus'
import { statistics } from '../src/domain/statistics'
import { projectPetDomain } from '../src/domain/pet'
import type { ActiveFocus, FocusRecord } from '../src/domain/model'

function record(minutes: number, mode: FocusRecord['mode'] = 'countdown'): FocusRecord {
  const startedAt = Date.parse('2026-11-15T08:00:00Z')
  return {
    id: 'rest-source',
    itemId: 'item',
    themeId: 'theme',
    title: '背单词',
    themeName: '英语',
    color: '#222',
    mode,
    targetMs: minutes * 60000,
    startedAt,
    endedAt: startedAt + minutes * 60000,
    timeZone: 'UTC',
    durationMs: minutes * 60000,
    pausedMs: 0,
    segments: [{ start: startedAt, end: startedAt + minutes * 60000 }],
    status: 'completed',
  }
}

describe('five-minute rest after focus', () => {
  it.each([1, 18, 25, 45, 60])('always rests five minutes after %i minutes of focus', (minutes) => {
    const source = record(minutes)
    const rest = makeRest(source)
    expect(rest.endsAt - rest.startedAt).toBe(REST_DURATION_MS)
    expect(readRest(rest, rest.startedAt).remainingMs).toBe(300000)
  })

  it('supports a normally ended stopwatch without changing its recorded duration', () => {
    const source = record(12, 'stopwatch')
    const before = structuredClone(source)
    const rest = makeRest(source)
    expect(rest.record.mode).toBe('stopwatch')
    expect(rest.endsAt - rest.startedAt).toBe(300000)
    expect(source).toEqual(before)
  })

  it('uses the actual countdown completion time when waking from the background', () => {
    const source = record(25)
    const active: ActiveFocus = {
      ...source,
      id: source.id,
      state: 'running',
      elapsedMs: 0,
      anchorMono: 0,
      anchorEpoch: source.startedAt,
      bootId: 1,
      segments: [],
    }
    const result = settle(active, { epoch: source.endedAt + 120000, mono: 27 * 60000, boot: 1 })
    const rest = makeRest(result.record!)
    expect(readRest(rest, source.endedAt + 120000).remainingMs).toBe(180000)
    const late = readRest(rest, source.endedAt + 900000)
    expect(late.session?.state).toBe('completed')
    expect(late.remainingMs).toBe(0)
    expect(readRest(late.session, source.endedAt).remainingMs).toBe(0)
  })

  it('starts a manually chosen rest at the current time after an early finish', () => {
    const source = { ...record(3), status: 'early' as const }
    const chosenAt = source.endedAt + 60000
    expect(makeRest(source, chosenAt).endsAt).toBe(chosenAt + 300000)
    expect(() => makeRest({ ...source, durationMs: 0 })).toThrow()
    expect(() => makeRest({ ...source, status: 'interrupted' })).toThrow()
  })

  it('does not add rest to focus statistics and leaves the record intact after exit', () => {
    const source = record(25)
    const before = statistics([source], '2026-11-15', '2026-11-15')
    const rest = makeRest(source)
    const finished = readRest(rest, rest.endsAt)
    expect(finished.session?.state).toBe('completed')
    expect(readRest(null, rest.endsAt)).toEqual({ session: null, remainingMs: 0 })
    expect(statistics([source], '2026-11-15', '2026-11-15')).toEqual(before)
    expect(source.durationMs).toBe(25 * 60000)
  })
})

describe('custom rest duration (5 / 10 / 15 / 20 min)', () => {
  it.each([5, 10, 15, 20])('resolves %i minutes and reads remaining time without capping at 5 minutes', (minutes) => {
    const durationMs = resolveRestDurationMs(minutes)
    expect(durationMs).toBe(minutes * 60000)
    const source = record(25)
    const rest = makeRest(source, source.endedAt, durationMs)
    expect(rest.durationMs).toBe(minutes * 60000)
    expect(rest.endsAt - rest.startedAt).toBe(minutes * 60000)
    expect(readRest(rest, source.endedAt + 60000).remainingMs).toBe((minutes - 1) * 60000)
    const done = readRest(rest, source.endedAt + minutes * 60000)
    expect(done.session?.state).toBe('completed')
    expect(done.remainingMs).toBe(0)
  })

  it('falls back to 5 minutes for missing or out-of-range restMinutes', () => {
    expect(resolveRestDurationMs(undefined)).toBe(300000)
    expect(resolveRestDurationMs(0)).toBe(300000)
    expect(resolveRestDurationMs(-5)).toBe(300000)
    expect(resolveRestDurationMs(61)).toBe(300000)
    expect(resolveRestDurationMs(7.5)).toBe(300000)
  })

  it('never adds custom rest duration to focus count, focus duration, or pet affection', () => {
    const source = record(25)
    const beforeStats = statistics([source], '2026-11-15', '2026-11-15')
    const beforePet = projectPetDomain({ records: [source], timeZone: 'UTC', now: source.endedAt })
    const rest = makeRest(source, source.endedAt, resolveRestDurationMs(20))
    const mid = readRest(rest, source.endedAt + 10 * 60000)
    expect(mid.remainingMs).toBe(10 * 60000)
    const done = readRest(rest, source.endedAt + 20 * 60000)
    expect(done.session?.state).toBe('completed')
    expect(statistics([source], '2026-11-15', '2026-11-15')).toEqual(beforeStats)
    const afterPet = projectPetDomain({ records: [source], timeZone: 'UTC', now: rest.endsAt })
    expect(afterPet.affection).toBe(beforePet.affection)
    expect(afterPet.totalRaised).toBe(beforePet.totalRaised)
  })
})
