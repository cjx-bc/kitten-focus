export type Mode = 'countdown' | 'stopwatch'
export type WhitelistConfiguration = { source: 'global' } | { source: 'custom'; packages: string[] }
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
  whitelist?: WhitelistConfiguration
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
export interface ProtectionPreferences {
  study: boolean
  strict: boolean
  interceptNotifications: boolean
  dnd: boolean
  globalWhitelist: string[]
  enhancements: string[]
}
export const defaultProtection = (): ProtectionPreferences => ({
  study: false, strict: false, interceptNotifications: false, dnd: false,
  globalWhitelist: [], enhancements: [],
})
export interface ProtectionSnapshot {
  applicationsWithdrawn?: boolean
  study: boolean
  source: 'global' | 'custom'
  whitelist: string[]
}
export function effectiveWhitelist(data: AppData, itemId: string | null): Pick<ProtectionSnapshot, 'source' | 'whitelist'> {
  const item = data.items.find((row) => row.id === itemId && !row.deleted)
  const custom = item?.whitelist?.source === 'custom' ? item.whitelist : undefined
  return { source: custom ? 'custom' : 'global',
    whitelist: [...new Set(custom ? custom.packages : data.preferences.protection?.globalWhitelist ?? [])] }
}
export interface ProtectionStatus {
  supported: boolean
  authorized: boolean
  connected: boolean
  active: boolean
  preferenceEnabled: boolean
  state: 'off' | 'authorization' | 'ready' | 'protecting' | 'failed' | 'unsupported' | 'recovered'
  reason: string
  effectiveWhitelist: string[]
}
export interface RecoveryStep {
  sessionId: string
  capability: string
  title: string
  status: 'active' | 'restored' | 'failed' | 'limited'
  reason: string
  retryable: boolean
}
export interface RecoverySnapshot {
  supported: boolean
  revision: string
  steps: RecoveryStep[]
  pending: boolean
}
export interface ProtectionApp {
  packageName: string
  name: string
  icon: string | null
  system: boolean
  installed: boolean
  fixed: boolean
}
export interface TemporaryAccessState {
  used: number
  remainingUses: number
  targetPackage: string | null
  targetLabel: string | null
  remainingMs: number
  expiresAt: number | null
}
export interface TemporaryAccessRequest {
  sessionId: string
  targetPackage: string
  durationMinutes: 1 | 3 | 5
  requestId: string
  replaceConfirmed?: boolean
}
export interface TemporaryAccessResult {
  status: 'granted' | 'denied' | 'confirmation-required' | 'failed'
  reason: string
  replayed: boolean
  state: TemporaryAccessState
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
  protection?: ProtectionSnapshot
  temporaryAccess?: TemporaryAccessState
  strictMode?: boolean
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
export interface ControlSnapshot {
  owner: 'focus' | 'rest' | null
  focus: FocusSnapshot
  rest: RestSnapshot
  needsReconcile: boolean
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
  protection?: ProtectionPreferences
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
