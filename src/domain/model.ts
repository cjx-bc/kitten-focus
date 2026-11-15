export type Mode = 'countdown' | 'stopwatch'
export interface Theme {
  id: string
  name: string
  color: string
  order: number
  collapsed: boolean
  deleted?: boolean
}
export interface FocusItem {
  id: string
  themeId: string
  title: string
  note: string
  mode: Mode
  minutes: number
  order: number
  deleted?: boolean
}
export interface Segment {
  start: number
  end: number
}
export interface FocusRecord {
  id: string
  itemId: string | null
  themeId: string | null
  title: string
  themeName: string
  color: string
  mode: Mode
  targetMs: number
  startedAt: number
  endedAt: number
  timeZone: string
  durationMs: number
  pausedMs: number
  segments: Segment[]
  status: 'completed' | 'early' | 'interrupted'
}
export interface ActiveFocus {
  id: string
  itemId: string | null
  themeId: string | null
  title: string
  themeName: string
  color: string
  mode: Mode
  targetMs: number
  startedAt: number
  timeZone: string
  state: 'running' | 'paused'
  elapsedMs: number
  pausedMs: number
  anchorMono: number
  anchorEpoch: number
  bootId: number
  segments: Segment[]
}
export interface FocusSnapshot {
  session: ActiveFocus | null
  elapsedMs: number
  record?: FocusRecord
}
export interface RestSession {
  record: FocusRecord
  startedAt: number
  endsAt: number
  state: 'running' | 'completed'
}
export interface RestSnapshot {
  session: RestSession | null
  remainingMs: number
}
export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  note: string
  repeat: 'none' | 'weekly'
  weekdays: number[]
  until: string
  itemId: string | null
  reminderMinutes: number | null
}
export interface EventException {
  eventId: string
  date: string
  cancelled: boolean
  title?: string
  start?: string
  end?: string
}
export interface Period {
  index: number
  start: string
  end: string
}
export interface Semester {
  id: string
  name: string
  startDate: string
  weeks: number
  periods: Period[]
}
export interface Course {
  id: string
  semesterId: string
  title: string
  weekday: number
  firstPeriod: number
  lastPeriod: number
  firstWeek: number
  lastWeek: number
  parity: 'all' | 'odd' | 'even'
  room: string
  teacher: string
  color: string
  reminderMinutes: number | null
}
export interface CourseException {
  courseId: string
  date: string
  cancelled: boolean
  start?: string
  end?: string
}
export interface Preferences {
  defaultMinutes: number
  sound: boolean
  vibration: boolean
  activeSemesterId: string | null
}
export interface AppData {
  schemaVersion: 1
  themes: Theme[]
  items: FocusItem[]
  records: FocusRecord[]
  deletedRecordIds: string[]
  events: CalendarEvent[]
  eventExceptions: EventException[]
  semesters: Semester[]
  courses: Course[]
  courseExceptions: CourseException[]
  preferences: Preferences
}
export interface Occurrence {
  id: string
  sourceId: string
  sourceDate: string
  kind: 'event' | 'course'
  title: string
  start: string
  end: string
  allDay: boolean
  note: string
  color: string
  itemId: string | null
  reminderMinutes: number | null
}
export const uid = () => crypto.randomUUID()
export const defaultPeriods = (): Period[] =>
  [
    ['08:00', '08:45'],
    ['08:55', '09:40'],
    ['10:00', '10:45'],
    ['10:55', '11:40'],
    ['14:00', '14:45'],
    ['14:55', '15:40'],
    ['16:00', '16:45'],
    ['16:55', '17:40'],
    ['19:00', '19:45'],
    ['19:55', '20:40'],
  ].map(([start, end], i) => ({ index: i + 1, start: start!, end: end! }))
export function emptyData(): AppData {
  return {
    schemaVersion: 1,
    themes: [],
    items: [],
    records: [],
    deletedRecordIds: [],
    events: [],
    eventExceptions: [],
    semesters: [],
    courses: [],
    courseExceptions: [],
    preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null },
  }
}
