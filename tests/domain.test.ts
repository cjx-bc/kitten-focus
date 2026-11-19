import { describe, it, expect } from 'vitest'
import { settle } from '../src/domain/focus'
import { statistics } from '../src/domain/statistics'
import { findEventConflict, occurrences, validateEvent } from '../src/domain/calendar'
import { periodRange } from '../src/domain/dates'
import { makeBackup, readBackup } from '../src/domain/backup'
import { emptyData, defaultPeriods, type ActiveFocus, type CalendarEvent, type FocusRecord } from '../src/domain/model'

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
  it('interrupts with checkpointed time when monotonic clock moves backward', () => {
    const result = settle(
      session({ elapsedMs: 15000, segments: [{ start: 0, end: 15000 }], anchorMono: 20000 }),
      { epoch: 50000, mono: 10000, boot: 1 },
    )
    expect(result.session).toBeNull()
    expect(result.record?.status).toBe('interrupted')
    expect(result.record?.durationMs).toBe(15000)
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
  it('finds a far-future overlap with a moved occurrence and skips cancelled occurrences', () => {
    const data = emptyData()
    const proposed = {
      id: 'a', title: '复习', start: '2026-11-09T09:00', end: '2026-11-09T10:00',
      allDay: false, note: '', repeat: 'weekly' as const, weekdays: [1], until: '',
      itemId: null, reminderMinutes: null,
    }
    data.events.push({ ...proposed, id: 'b', weekdays: [3], until: '2026-11-11' })
    const edit = {
      eventId: 'b', date: '2026-11-11', cancelled: false,
      start: '2050-11-07T09:30', end: '2050-11-07T10:30',
    }
    data.eventExceptions.push(edit)
    expect(findEventConflict(data, proposed)?.start).toBe(edit.start)
    edit.cancelled = true
    expect(findEventConflict(data, proposed)).toBeUndefined()
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
  it('checks both teaching weeks after a cross-day weekly series has started', () => {
    const data = emptyData()
    data.semesters.push({
      id: 's', name: '秋季', startDate: '2026-11-02', weeks: 13, periods: defaultPeriods(),
    })
    data.preferences.activeSemesterId = 's'
    data.courses.push({
      id: 'c', semesterId: 's', title: '数学', weekday: 1, firstPeriod: 1, lastPeriod: 2,
      firstWeek: 7, lastWeek: 13, parity: 'odd', room: '', teacher: '', color: '#222',
      reminderMinutes: null,
    })
    const proposed = {
      id: 'a', title: '复习', start: '2026-12-13T15:00', end: '2027-01-08T16:00',
      allDay: false, note: '', repeat: 'weekly' as const, weekdays: [3, 6], until: '2026-12-25',
      itemId: null, reminderMinutes: null,
    }
    expect(findEventConflict(data, proposed)?.start).toBe('2026-12-28T08:00')
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
  it('rejects a malformed independent whitelist before replacing saved data', () => {
    const data = emptyData()
    data.themes.push({ id: 'theme', name: '学习', color: '#222', order: 0, collapsed: false })
    data.items.push({ id: 'item', themeId: 'theme', title: '阅读', note: '', mode: 'countdown', minutes: 25, order: 0 })
    const backup = JSON.parse(makeBackup(data))
    backup.data.items[0].whitelist = { source: 'custom', packages: 'same-name-is-not-a-package-list' }
    expect(() => readBackup(JSON.stringify(backup))).toThrow('待办白名单损坏')
  })
  it('preserves empty and uninstalled independent lists while accepting legacy items without a list', () => {
    const data = emptyData()
    data.themes.push({ id: 'theme', name: '学习', color: '#222', order: 0, collapsed: false })
    const base = { themeId: 'theme', title: '阅读', note: '', mode: 'countdown' as const, minutes: 25, order: 0 }
    data.items.push({ ...base, id: 'empty', whitelist: { source: 'custom', packages: [] } },
      { ...base, id: 'missing', whitelist: { source: 'custom', packages: ['missing.reader.tool'] } },
      { ...base, id: 'legacy' })
    expect(readBackup(makeBackup(data)).data.items).toEqual(data.items)
  })
  it('rejects inconsistent focus totals', () => {
    const data = emptyData()
    const value = record('2026-11-14T10:00:00Z', '2026-11-14T10:01:00Z')
    value.durationMs = 500
    data.records.push(value)
    expect(() => readBackup(makeBackup(data))).toThrow()
  })
  it('rejects null or non-object entries in record segments and semester periods cleanly', () => {
    const data = emptyData()
    data.records.push(record('2026-11-14T10:00:00Z', '2026-11-14T10:01:00Z'))
    const segBackup = JSON.parse(makeBackup(data))
    segBackup.data.records[0].segments = [null]
    expect(() => readBackup(JSON.stringify(segBackup))).toThrow('专注时间段损坏')

    const semData = emptyData()
    semData.semesters.push({
      id: 's1',
      name: '秋季',
      startDate: '2026-11-02',
      weeks: 20,
      periods: defaultPeriods(),
    })
    const semBackup = JSON.parse(makeBackup(semData))
    semBackup.data.semesters[0].periods = [null]
    expect(() => readBackup(JSON.stringify(semBackup))).toThrow('课表时间设置损坏')
  })
  it('validates calendar event until dates and guards empty periodRange anchors', () => {
    const base: CalendarEvent = {
      id: 'e1',
      title: '测试日程',
      start: '2026-11-09T20:00',
      end: '2026-11-09T21:00',
      allDay: false,
      note: '',
      repeat: 'weekly',
      weekdays: [1],
      until: '2026-02-30',
      itemId: null,
      reminderMinutes: null,
    }
    expect(() => validateEvent(base)).toThrow('重复截止日期不正确')
    expect(() => validateEvent({ ...base, until: 'not-a-date' })).toThrow('重复截止日期不正确')
    expect(() => validateEvent({ ...base, until: '' })).not.toThrow()
    expect(() => validateEvent({ ...base, until: '2026-11-30' })).not.toThrow()
    const [from, to] = periodRange('week', '')
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
