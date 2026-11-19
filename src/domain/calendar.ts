import type { AppData, CalendarEvent, Course, CourseException, EventException, Occurrence } from './model'
import { addDays, dateKey, dayDistance, localDate, weekday } from './dates'
const overlaps = (start: string, end: string, from: string, to: string) =>
  start < `${addDays(to, 1)}T00:00` && end > `${from}T00:00`
function eventOccurrence(event: CalendarEvent, date: string): Occurrence {
  const days = dayDistance(event.start.slice(0, 10), date)
  return {
    id: `${event.id}/${date}`,
    sourceId: event.id,
    sourceDate: date,
    kind: 'event',
    title: event.title,
    start: `${date}${event.start.slice(10)}`,
    end: `${addDays(event.end.slice(0, 10), days)}${event.end.slice(10)}`,
    allDay: event.allDay,
    note: event.note,
    color: '#737378',
    itemId: event.itemId,
    reminderMinutes: event.reminderMinutes,
  }
}
export function courseOccurrence(data: AppData, course: Course, date: string): Occurrence | null {
  const semester = data.semesters.find((s) => s.id === course.semesterId)
  if (!semester) return null
  const diff = dayDistance(semester.startDate, date),
    week = Math.floor(diff / 7) + 1
  if (
    diff < 0 ||
    weekday(date) !== course.weekday ||
    week > semester.weeks ||
    week < course.firstWeek ||
    week > course.lastWeek
  )
    return null
  if ((course.parity === 'odd' && week % 2 === 0) || (course.parity === 'even' && week % 2 !== 0))
    return null
  const first = semester.periods.find((p) => p.index === course.firstPeriod),
    last = semester.periods.find((p) => p.index === course.lastPeriod)
  if (!first || !last) return null
  return {
    id: `${course.id}/${date}`,
    sourceId: course.id,
    sourceDate: date,
    kind: 'course',
    title: course.title,
    start: `${date}T${first.start}`,
    end: `${date}T${last.end}`,
    allDay: false,
    note: [course.room, course.teacher].filter(Boolean).join(' · '),
    color: course.color,
    itemId: null,
    reminderMinutes: course.reminderMinutes,
  }
}
function eventOccurrences(
  event: CalendarEvent,
  exceptions: EventException[],
  from: string,
  to: string,
): Occurrence[] {
  const first = event.start.slice(0, 10),
    span = dayDistance(first, event.end.slice(0, 10))
  const candidates = new Set<string>()
  if (event.repeat === 'none') candidates.add(first)
  else {
    const earliest = addDays(from, -span)
    const latest = event.until && event.until < to ? event.until : to
    for (let day = earliest > first ? earliest : first; day <= latest; day = addDays(day, 1))
      if (event.weekdays.includes(weekday(day))) candidates.add(day)
  }
  for (const exception of exceptions)
    if (exception.start && overlaps(exception.start, exception.end || exception.start, from, to))
      candidates.add(exception.date)
  const result: Occurrence[] = []
  for (const day of candidates) {
    const occurrence = eventOccurrence(event, day)
    const exception = exceptions.find((x) => x.date === day)
    if (exception?.cancelled) continue
    if (exception?.start) occurrence.start = exception.start
    if (exception?.end) occurrence.end = exception.end
    if (exception?.title) occurrence.title = exception.title
    if (overlaps(occurrence.start, occurrence.end, from, to)) result.push(occurrence)
  }
  return result
}

function courseOccurrences(
  data: AppData,
  course: Course,
  exceptions: CourseException[],
  from: string,
  to: string,
): Occurrence[] {
  const candidates = new Set<string>()
  for (let day = from; day <= to; day = addDays(day, 1)) candidates.add(day)
  for (const exception of exceptions)
    if (exception.start && overlaps(exception.start, exception.end || exception.start, from, to))
      candidates.add(exception.date)
  const result: Occurrence[] = []
  for (const day of candidates) {
    const occurrence = courseOccurrence(data, course, day)
    if (!occurrence) continue
    const exception = exceptions.find((x) => x.date === day)
    if (exception?.cancelled) continue
    if (exception?.start) occurrence.start = exception.start
    if (exception?.end) occurrence.end = exception.end
    if (overlaps(occurrence.start, occurrence.end, from, to)) result.push(occurrence)
  }
  return result
}

export function occurrences(data: AppData, from: string, to: string): Occurrence[] {
  const result = new Map<string, Occurrence>()
  for (const event of data.events) {
    const exceptions = data.eventExceptions.filter((x) => x.eventId === event.id)
    for (const item of eventOccurrences(event, exceptions, from, to)) result.set(item.id, item)
  }
  for (const course of data.courses.filter((c) => c.semesterId === data.preferences.activeSemesterId)) {
    const exceptions = data.courseExceptions.filter((x) => x.courseId === course.id)
    for (const item of courseOccurrences(data, course, exceptions, from, to)) result.set(item.id, item)
  }
  return [...result.values()].sort((a, b) => a.start.localeCompare(b.start))
}

export function findEventConflict(
  data: AppData,
  proposed: CalendarEvent,
  replacingOccurrenceId?: string,
): Occurrence | undefined {
  const startsOn = proposed.start.slice(0, 10)
  if (proposed.repeat === 'none') {
    return occurrences(data, startsOn, proposed.end.slice(0, 10)).find((item) => {
      const replaced = item.kind === 'event' && item.sourceId === proposed.id &&
        (replacingOccurrenceId === undefined || item.id === replacingOccurrenceId)
      return !replaced && item.start < proposed.end && item.end > proposed.start
    })
  }

  const edits = data.eventExceptions.filter((x) => x.eventId === proposed.id)
  function find(
    otherStartsOn: string,
    otherEdits: Array<EventException | CourseException>,
    cycle: number,
    read: (from: string, to: string) => Occurrence[],
  ) {
    // Check the warm-up week and one complete cycle after each schedule begins.
    // Also check where individual edits move a start or disrupt the regular pattern.
    const windows = new Set([startsOn, otherStartsOn])
    for (const edit of [...edits, ...otherEdits]) {
      windows.add(addDays(edit.date, 1))
      if (edit.start) windows.add(edit.start.slice(0, 10))
    }
    for (const from of windows) {
      const to = addDays(from, cycle + 6)
      const candidates = eventOccurrences(proposed, edits, from, to)
      if (!candidates.length) continue
      const conflict = read(from, to).find((item) =>
        candidates.some((o) => item.start < o.end && item.end > o.start),
      )
      if (conflict) return conflict
    }
  }

  for (const event of data.events) {
    if (event.id === proposed.id) continue
    const exceptions = data.eventExceptions.filter((x) => x.eventId === event.id)
    const conflict = find(event.start.slice(0, 10), exceptions, 7, (from, to) =>
      eventOccurrences(event, exceptions, from, to),
    )
    if (conflict) return conflict
  }
  const semester = data.semesters.find((s) => s.id === data.preferences.activeSemesterId)
  if (!semester) return
  for (const course of data.courses.filter((c) => c.semesterId === semester.id)) {
    const exceptions = data.courseExceptions.filter((x) => x.courseId === course.id)
    const first = dateFromWeek(semester.startDate, course.firstWeek, course.weekday)
    const conflict = find(first, exceptions, course.parity === 'all' ? 7 : 14, (from, to) =>
      courseOccurrences(data, course, exceptions, from, to),
    )
    if (conflict) return conflict
  }
}
export function semesterWeek(start: string, date: string) {
  return Math.floor(dayDistance(start, date) / 7) + 1
}
export function dateFromWeek(start: string, week: number, day: number) {
  return addDays(start, (week - 1) * 7 + day - 1)
}
export function shiftEventToDate(event: CalendarEvent, date: string) {
  const days = dayDistance(event.start.slice(0, 10), date)
  return {
    ...event,
    start: `${date}${event.start.slice(10)}`,
    end: `${addDays(event.end.slice(0, 10), days)}${event.end.slice(10)}`,
  }
}
export function validateEvent(event: CalendarEvent) {
  if (typeof event.title !== 'string' || !event.title.trim()) throw new Error('请填写日程名称')
  if (
    !['none', 'weekly'].includes(event.repeat) ||
    !Array.isArray(event.weekdays) ||
    event.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 7) ||
    typeof event.allDay !== 'boolean' ||
    typeof event.note !== 'string' ||
    typeof event.until !== 'string'
  )
    throw new Error('日程设置不完整')
  if (typeof event.start !== 'string' || typeof event.end !== 'string')
    throw new Error('日程时间格式不正确')
  if (
    !Number.isFinite(new Date(event.start).getTime()) ||
    !Number.isFinite(new Date(event.end).getTime()) ||
    event.end <= event.start
  )
    throw new Error('结束时间需要晚于开始时间')
  if (event.repeat !== 'weekly') return
  if (!event.weekdays.length) throw new Error('请选择重复的星期')
  if (
    event.until &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(event.until) ||
      !Number.isFinite(localDate(event.until).getTime()) ||
      dateKey(localDate(event.until)) !== event.until)
  )
    throw new Error('重复截止日期不正确')
  if (event.until && localDate(event.until) < localDate(event.start.slice(0, 10)))
    throw new Error('重复截止日期不能早于开始日期')
}
