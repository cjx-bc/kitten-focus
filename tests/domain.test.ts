import { describe, it, expect } from 'vitest'
import { settle } from '../src/domain/focus'
import { statistics } from '../src/domain/statistics'
import { occurrences } from '../src/domain/calendar'
import { makeBackup, readBackup } from '../src/domain/backup'
import { emptyData, defaultPeriods, type ActiveFocus, type FocusRecord } from '../src/domain/model'

function session(overrides: Partial<ActiveFocus> = {}): ActiveFocus {
  return {
    id: 'focus-1',
    itemId: null,
    themeId: null,
    title: '自由专注',
    themeName: '自由专注',
    color: '#222',
    mode: 'countdown',
    targetMs: 60000,
    startedAt: 0,
    timeZone: 'UTC',
    state: 'running',
    elapsedMs: 0,
    pausedMs: 0,
    anchorMono: 0,
    anchorEpoch: 0,
    bootId: 1,
    segments: [],
    ...overrides,
  }
}
describe('focus state and recovery', () => {
  it('caps a delayed countdown completion at the target and exact segment end', () => {
    const result = settle(session(), { epoch: 90000, mono: 90000, boot: 1 })
    expect(result.session).toBeNull()
    expect(result.record?.durationMs).toBe(60000)
    expect(result.record?.endedAt).toBe(60000)
  })
  it('excludes paused time and resumes with the remaining countdown', () => {
    const paused = settle(session(), { epoch: 20000, mono: 20000, boot: 1 }, 'pause').session!
    const resumed = settle(paused, { epoch: 50000, mono: 50000, boot: 1 }, 'resume').session!
    const result = settle(resumed, { epoch: 100000, mono: 100000, boot: 1 })
    expect(result.record?.durationMs).toBe(60000)
    expect(result.record?.pausedMs).toBe(30000)
    expect(result.record?.endedAt).toBe(90000)
    expect(result.record?.segments).toEqual([
      { start: 0, end: 20000 },
      { start: 50000, end: 90000 },
    ])
  })
  it('uses monotonic elapsed time even if the wall clock moves', () => {
    const result = settle(
      session({ mode: 'stopwatch' }),
      { epoch: 9999999, mono: 30000, boot: 1 },
      'finish',
    )
    expect(result.record?.durationMs).toBe(30000)
    expect(result.record?.status).toBe('completed')
  })
  it('keeps only checkpointed time after reboot', () => {
    const result = settle(
      session({ elapsedMs: 12000, segments: [{ start: 0, end: 12000 }], anchorMono: 12000 }),
      { epoch: 500000, mono: 200, boot: 2 },
    )
    expect(result.record?.status).toBe('interrupted')
    expect(result.record?.durationMs).toBe(12000)
  })
  it('distinguishes an early countdown from a normal stopwatch and drops zero-length sessions', () => {
    expect(settle(session(), { epoch: 5000, mono: 5000, boot: 1 }, 'finish').record?.status).toBe(
      'early',
    )
    expect(settle(session(), { epoch: 0, mono: 0, boot: 1 }, 'finish').record).toBeUndefined()
  })
})
function record(start: string, end: string, zone = 'UTC'): FocusRecord {
  const startedAt = Date.parse(start),
    endedAt = Date.parse(end)
  return {
    id: 'r1',
    itemId: null,
    themeId: null,
    title: '自由专注',
    themeName: '自由专注',
    color: '#222',
    mode: 'stopwatch',
    targetMs: 0,
    startedAt,
    endedAt,
    timeZone: zone,
    durationMs: endedAt - startedAt,
    pausedMs: 0,
    segments: [{ start: startedAt, end: endedAt }],
    status: 'completed',
  }
}
describe('statistics across dates and time zones', () => {
  it('splits midnight duration while assigning count and full-session average to the start date', () => {
    const value = record('2026-11-14T23:50:00Z', '2026-11-15T00:20:00Z')
    const first = statistics([value], '2026-11-14', '2026-11-14'),
      second = statistics([value], '2026-11-15', '2026-11-15')
    expect(first.totalMs).toBe(600000)
    expect(first.count).toBe(1)
    expect(first.averageMs).toBe(1800000)
    expect(second.totalMs).toBe(1200000)
    expect(second.count).toBe(0)
    expect(second.averageMs).toBeNull()
  })
  it('retains short durations and excludes gaps between active segments', () => {
    const value = record('2026-11-14T10:00:00Z', '2026-11-14T10:03:00Z')
    value.durationMs = 30000
    value.pausedMs = 150000
    value.segments = [
      { start: value.startedAt, end: value.startedAt + 10000 },
      { start: value.endedAt - 20000, end: value.endedAt },
    ]
    expect(statistics([value], '2026-11-14', '2026-11-14').totalMs).toBe(30000)
  })
  it('uses the recorded time zone rather than the viewers current zone', () => {
    const value = record('2026-11-15T04:50:00Z', '2026-11-15T05:20:00Z', 'America/New_York')
    expect(statistics([value], '2026-11-14', '2026-11-14').totalMs).toBe(600000)
  })
})
describe('calendar recurrence and exceptions', () => {
  it('handles weekly recurrence and one-off cancellation', () => {
    const data = emptyData()
    data.events.push({
      id: 'e',
      title: '复习',
      start: '2026-11-09T20:00',
      end: '2026-11-09T21:00',
      allDay: false,
      note: '',
      repeat: 'weekly',
      weekdays: [1],
      until: '',
      itemId: null,
      reminderMinutes: null,
    })
    data.eventExceptions.push({ eventId: 'e', date: '2026-11-16', cancelled: true })
    expect(occurrences(data, '2026-11-09', '2026-11-23').map((o) => o.sourceDate)).toEqual([
      '2026-11-09',
      '2026-11-23',
    ])
  })
  it('finds occurrences moved from outside the viewed week', () => {
    const data = emptyData()
    data.events.push({
      id: 'e',
      title: '复习',
      start: '2026-11-09T20:00',
      end: '2026-11-09T21:00',
      allDay: false,
      note: '',
      repeat: 'weekly',
      weekdays: [1],
      until: '',
      itemId: null,
      reminderMinutes: null,
    })
    data.eventExceptions.push({
      eventId: 'e',
      date: '2026-11-09',
      cancelled: false,
      start: '2026-11-18T20:00',
      end: '2026-11-18T21:00',
    })
    expect(occurrences(data, '2026-11-18', '2026-11-18')[0]?.sourceDate).toBe('2026-11-09')
  })
  it('uses teaching-week parity and only cancels a selected course occurrence', () => {
    const data = emptyData()
    data.semesters.push({
      id: 's',
      name: '秋季',
      startDate: '2026-11-02',
      weeks: 20,
      periods: defaultPeriods(),
    })
    data.preferences.activeSemesterId = 's'
    data.courses.push({
      id: 'c',
      semesterId: 's',
      title: '数学',
      weekday: 1,
      firstPeriod: 1,
      lastPeriod: 2,
      firstWeek: 1,
      lastWeek: 20,
      parity: 'odd',
      room: '',
      teacher: '',
      color: '#222',
      reminderMinutes: null,
    })
    data.courseExceptions.push({ courseId: 'c', date: '2026-11-16', cancelled: true })
    expect(occurrences(data, '2026-11-02', '2026-11-30').map((o) => o.sourceDate)).toEqual([
      '2026-11-02',
      '2026-11-30',
    ])
  })
})
describe('backup validation', () => {
  it('round-trips saved data', () =>
    expect(readBackup(makeBackup(emptyData())).data).toEqual(emptyData()))
  it('rejects malformed and unsupported backups before replacing data', () => {
    expect(() => readBackup('{broken')).toThrow()
    const backup = JSON.parse(makeBackup(emptyData()))
    backup.version = 2
    expect(() => readBackup(JSON.stringify(backup))).toThrow()
  })
  it('rejects inconsistent focus totals', () => {
    const data = emptyData()
    const value = record('2026-11-14T10:00:00Z', '2026-11-14T10:01:00Z')
    value.durationMs = 500
    data.records.push(value)
    expect(() => readBackup(makeBackup(data))).toThrow()
  })
})
