export type Mode = 'countdown' | 'stopwatch'
export const ANIMAL_IDS = [
  'black-cat', 'yellow-chick', 'white-goose', 'orange-cat', 'pixel-bird', 'patch-bear',
  'green-parrot', 'flying-pig', 'balloon-dog', 'light-deer', 'angel-cat', 'black-dragon',
] as const
export type AnimalId = (typeof ANIMAL_IDS)[number]
export const WHITE_NOISE_IDS = ['off', 'rain', 'birds', 'stream', 'fire', 'waves'] as const
export type WhiteNoiseId = (typeof WHITE_NOISE_IDS)[number]
export type PetSkinMap = Partial<Record<AnimalId, string>>
export interface PetData {
  version: 1
  selectedAnimalId: AnimalId | 'random'
  selectedSkins?: PetSkinMap
  lastSelectedItemId: string | null
  retroCutoffAt: number | null
}
export const defaultPetData = (): PetData => ({
  version: 1, selectedAnimalId: 'black-cat', selectedSkins: {},
  lastSelectedItemId: null, retroCutoffAt: null,
})
export const THEME_COLORS = ['#ef4e36', '#e7a54a', '#7b9a80', '#698caa', '#a08bb0', '#85858b'] as const
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
  animalId?: AnimalId
  skinId?: string
  note?: string
  source?: 'timer' | 'manual'
  failReason?: 'manual_giveup' | 'left_app'
}
export type AppsSubKey = 'restrict' | 'temporaryAccess'
export type StrictSubKey =
  | 'noPauseEnd'
  | 'navigation'
  | 'antiClose'
  | 'hideRecents'
  | 'hideLauncher'
  | 'wallpaper'
  | 'strictSettings'
  | 'deviceAdmin'
  | 'rebootResume'
export type QuietSubKey = 'sound' | 'intercept' | 'whitelistPass'
export type ProtectionModuleKey = 'apps' | 'strict' | 'quiet'
export type ProtectionEnhancementKey =
  | 'navigationHomeRecents'
  | 'preciseAntiClose'
  | 'recentTasksHidden'
  | 'launcherIconHidden'
  | 'wallpaperProtection'
  | 'lockMainInterfaceRestricted'
  | 'strictSettingsGuard'
  | 'deviceAdminAntiUninstall'
  | 'rebootResumeLock'

export interface KeepAliveGuide {
  brand: 'oppo' | 'xiaomi' | 'vivo' | 'huawei' | 'samsung' | 'generic'
  brandLabel: string
  foregroundServiceActive: boolean
  batteryOptimizationIgnored: boolean
  hasAutoStartSurface: boolean
  autoStartHint: string
  recentLockHint: string
  hideRecentsConflict: boolean
}

export interface DeviceAdminStatus {
  supported: boolean
  active: boolean
  preferenceEnabled: boolean
  state: 'active' | 'authorization' | 'off' | 'unsupported'
  reason: string
}

export interface ModulePref<K extends string = string> {
  enabled: boolean
  custom?: Partial<Record<K, boolean>>
}

export interface ProtectionModules {
  master?: boolean
  initialized?: boolean
  focusLock?: boolean
  apps: ModulePref<AppsSubKey>
  strict: ModulePref<StrictSubKey>
  quiet: ModulePref<QuietSubKey>
}

export interface ProtectionPreferences {
  study: boolean
  strict: boolean
  interceptNotifications: boolean
  dnd: boolean
  globalWhitelist: string[]
  enhancements: string[]
  modules?: ProtectionModules
}
export const defaultProtection = (): ProtectionPreferences => ({
  study: false, strict: false, interceptNotifications: false, dnd: false,
  globalWhitelist: [], enhancements: [],
})
export interface ProtectionSnapshot {
  applicationsWithdrawn?: boolean
  navigationWithdrawn?: boolean
  antiCloseWithdrawn?: boolean
  temporaryAccessAllowed?: boolean
  studyLocked?: boolean
  enhancements?: string[]
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
export interface NavigationProtectionStatus {
  supported: boolean
  authorized: boolean
  connected: boolean
  active: boolean
  preferenceEnabled: boolean
  requested: boolean
  state: 'off' | 'authorization' | 'ready' | 'armed' | 'protecting' | 'failed' | 'unsupported' | 'recovered'
  reason: string
  lastReturnedAt: number | null
  lastTarget: 'home' | 'recents' | 'launcher' | null
}
export type AppRestrictionEngine = 'accessibility' | 'usage_overlay' | 'none'
export interface ProtectionStatus {
  antiClose?: AntiCloseStatus
  navigation?: NavigationProtectionStatus
  supported: boolean
  authorized: boolean
  connected: boolean
  active: boolean
  preferenceEnabled: boolean
  state: 'off' | 'authorization' | 'ready' | 'protecting' | 'failed' | 'unsupported' | 'recovered'
  reason: string
  effectiveWhitelist: string[]
  engine?: AppRestrictionEngine
  usageStatsGranted?: boolean
  overlayGranted?: boolean
  accessibilityAuthorized?: boolean
  accessibilityConnected?: boolean
}
export interface AntiCloseStatus extends Omit<NavigationProtectionStatus, 'lastTarget'> {
  lastTarget: string | null
  identity: { accessibility?: boolean; ordinaryAdmin?: boolean; deviceOwner?: boolean; profileOwner?: boolean; unknown?: boolean }
  systemUninstallBlocked: boolean
  policyReason: string
  supportScope: string
}
export interface RecentTasksStatus {
  supported: boolean
  requested: boolean
  preferenceEnabled: boolean
  recoveryAvailable: boolean
  phase: 'off' | 'ready' | 'active' | 'failed' | 'restoration_failed' | 'withdrawn' | 'restored' | 'unsupported'
  active: boolean
  verified: boolean
  recoveryPending: boolean
  error: string
}
export interface LauncherStatus extends RecentTasksStatus {
  recoveryReachable: boolean
  componentState: number
  launcherResolved: boolean
  launcherCacheVerified: false
}
export interface WallpaperStatus {
  supported: boolean
  requested: boolean
  preferenceEnabled: boolean
  phase: string
  selected: boolean
  lockSelected: boolean
  active: boolean
  verified: boolean
  prepared: boolean
  pickerOpen: boolean
  preview?: boolean
  recoveryPending: boolean
  withdrawn: boolean
  current: { homeId?: number; lockId?: number; component?: string; lockComponent?: string }
  error: string
  homeSourceAvailable?: boolean
  lockSourceAvailable?: boolean
  manualConfirmationRequired?: boolean
  lastAssociation?: { pid?: number; processToken?: string; sessionId?: string; focusElapsedMs?: number; bootCount?: number }
  forceStopImmune: false
  cropVerified: false
  providerSettingsVerified: false
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
  animalId?: AnimalId
  skinId?: string
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
  durationMs?: number
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
  mainEntry?: { requested: boolean; active: boolean; withdrawn: boolean }
  recentTasks?: RecentTasksStatus
  launcher?: LauncherStatus
  wallpaper?: WallpaperStatus
  owner: 'focus' | 'rest' | 'lock' | null
  focus: FocusSnapshot
  rest: RestSnapshot
  lock?: LockSnapshot
  needsReconcile: boolean
}
export interface LockConfiguration {
  id: string
  name: string
  minutes: number
  strict?: boolean
  /** Missing keeps legacy global inheritance; an empty array is independent. */
  enhancements?: string[]
  whitelist: WhitelistConfiguration
}
export interface LockSession {
  originalEnhancedProtectionSettings?: string[]
  id: string
  configurationId: string
  title: string
  targetMs: number
  startedAt: number
  strictMode: boolean
  protection: ProtectionSnapshot
}
export interface LockRecord {
  id: string
  configurationId: string
  title: string
  targetMs: number
  startedAt: number
  endedAt: number
  durationMs: number
  status: 'completed' | 'early' | 'interrupted'
}
export interface LockSnapshot {
  session: LockSession | null
  remainingMs: number
  records: LockRecord[]
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
  restMinutes?: number
  autoRest?: boolean
  pomodoroLoop?: boolean
  keepScreenOn?: boolean
  leaveAppFail?: boolean
  whiteNoise?: WhiteNoiseId
  whiteNoiseVolume?: number
  animation?: 'system' | 'on' | 'off'
}
export interface AppData {
  schemaVersion: 1
  pet?: PetData
  lockConfigurations?: LockConfiguration[]
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
