import { defineStore } from 'pinia'
import { ref, shallowRef, computed } from 'vue'
import type {
  AppData,
  FocusItem,
  Theme,
  ActiveFocus,
  FocusSnapshot,
  RestSnapshot,
  CalendarEvent,
  Semester,
  Course,
  Occurrence,
  LockSnapshot,
} from '../domain/model'
import { emptyData, uid, effectiveWhitelist } from '../domain/model'
import { focusDriver, restDriver, lockDriver, repository, syncReminders } from '../platform/bridge'
import { validateEvent } from '../domain/calendar'
import { dateKey, weekday } from '../domain/dates'

export const useApp = defineStore('app', () => {
  const data = shallowRef<AppData>(emptyData()),
    focus = shallowRef<FocusSnapshot>({ session: null, elapsedMs: 0 }),
    rest = shallowRef<RestSnapshot>({ session: null, remainingMs: 0 }),
    lock = shallowRef<LockSnapshot>({ session: null, remainingMs: 0, records: [] }),
    ready = ref(false),
    error = ref(''),
    toast = ref('')
  const lastResult = shallowRef<FocusSnapshot['record']>(undefined)
  const startConfirmation = shallowRef<{
    title: string
    mode: ActiveFocus['mode']
    minutes: number
    strict: boolean
    study: boolean
    whitelistCount: number
    whitelistSource: 'global' | 'custom'
  } | null>(null)
  let resolveStartConfirmation: ((accepted: boolean) => void) | undefined
  function confirmStart(accepted: boolean) {
    startConfirmation.value = null
    resolveStartConfirmation?.(accepted)
    resolveStartConfirmation = undefined
  }
  const themes = computed(() =>
    data.value.themes.filter((t) => !t.deleted).sort((a, b) => a.order - b.order),
  )
  const items = computed(() =>
    data.value.items.filter((t) => !t.deleted).sort((a, b) => a.order - b.order),
  )
  let dataLoaded = false,
    writeQueue: Promise<void> = Promise.resolve(),
    timerHandle: ReturnType<typeof setInterval> | undefined,
    toastHandle: ReturnType<typeof setTimeout>,
    ticking = false
  let sessionQueue: Promise<unknown> = Promise.resolve()
  function sessionOperation<T>(operation: () => Promise<T>): Promise<T> {
    const pending = sessionQueue.catch(() => {}).then(operation)
    sessionQueue = pending
    return pending
  }
  async function refreshRest() {
    const before = rest.value.session
    rest.value = await restDriver.read()
    if (rest.value.session) lastResult.value = rest.value.session.record
    if (before?.state === 'running' && rest.value.session?.state === 'completed')
      notify('休息结束，准备好再开始')
  }
  function notify(message: string) {
    toast.value = message
    clearTimeout(toastHandle)
    toastHandle = setTimeout(() => (toast.value = ''), 3500)
  }
  function persist() {
    const snapshot = structuredClone(data.value)
    writeQueue = writeQueue
      .catch(() => {})
      .then(() => repository.save(snapshot))
      .then(() => syncReminders())
      .catch((e) => {
        error.value = '保存失败，请重试：' + String(e)
        throw e
      })
    return writeQueue
  }
  async function mutate(update: (next: AppData) => void) {
    if (!dataLoaded) throw new Error('本地数据尚未安全加载，请先恢复升级副本')
    const next = structuredClone(data.value)
    update(next)
    data.value = JSON.parse(JSON.stringify(next)) as AppData
    await persist()
  }
  async function acceptSnapshot(snapshot: FocusSnapshot) {
    const had = focus.value.session
    focus.value = snapshot
    if (snapshot.record && !data.value.deletedRecordIds.includes(snapshot.record.id)) {
      if (!data.value.records.some((r) => r.id === snapshot.record!.id))
        await mutate((d) => d.records.push(snapshot.record!))
      if (had?.id === snapshot.record.id) {
        lastResult.value = snapshot.record
        if (data.value.preferences.vibration && 'vibrate' in navigator) navigator.vibrate(150)
      }
    }
  }
  async function tick() {
    if (ticking) return
    ticking = true
    try {
      await sessionOperation(async () => {
        await acceptSnapshot(await focusDriver.action('read'))
        await refreshRest()
        lock.value = await lockDriver.read()
      })
    } catch (e) {
      error.value = String(e)
    } finally {
      ticking = false
    }
  }
  async function init() {
    try {
      data.value = await repository.load()
      dataLoaded = true
      await tick()
      await syncReminders()
      ready.value = true
      timerHandle = setInterval(() => {
        void tick()
      }, 750)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void tick()
      })
    } catch (e) {
      error.value = '本地数据读取失败：' + String(e)
    }
  }
  async function start(
    item: FocusItem | null,
    mode = item?.mode || 'countdown',
    minutes = item?.minutes || data.value.preferences.defaultMinutes,
  ) {
    return sessionOperation(async () => {
      if (!dataLoaded) throw new Error('本地数据尚未安全加载，请先恢复升级副本')
      if (focus.value.session) throw new Error('已有一条未结束的专注，请先返回或结束它')
      if (lock.value.session) throw new Error('已有锁机正在进行，请先返回锁机处理')
      await refreshRest()
      if (rest.value.session?.state === 'running') throw new Error('请先退出休息，再开始新的专注')
      if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isInteger(minutes))
        throw new Error('请填写正整数分钟')
      await writeQueue
      let strictModeConfirmed = false
      const protection = data.value.preferences.protection
      if (protection?.strict || protection?.study) {
        const accepted = await new Promise<boolean>((resolve) => {
          resolveStartConfirmation = resolve
          startConfirmation.value = {
            title: item?.title || '自由专注',
            mode,
            minutes,
            strict: !!protection.strict,
            study: !!protection.study,
            whitelistCount: effectiveWhitelist(data.value, item?.id ?? null).whitelist.length,
            whitelistSource: effectiveWhitelist(data.value, item?.id ?? null).source,
          }
        })
        if (!accepted) throw new Error('已取消开始专注')
        strictModeConfirmed = true
      }
      const theme = data.value.themes.find((t) => t.id === item?.themeId),
        now = Date.now()
      const session: ActiveFocus = {
        id: uid(),
        itemId: item?.id || null,
        themeId: theme?.id || null,
        title: item?.title || '自由专注',
        themeName: theme?.name || '自由专注',
        color: theme?.color || '#222222',
        mode,
        targetMs: minutes * 60000,
        startedAt: now,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        state: 'running',
        elapsedMs: 0,
        pausedMs: 0,
        anchorMono: now,
        anchorEpoch: now,
        bootId: 0,
        segments: [],
      }
      lastResult.value = undefined
      await acceptSnapshot(await focusDriver.start(session, strictModeConfirmed))
      rest.value = { session: null, remainingMs: 0 }
    })
  }
  async function action(action: 'pause' | 'resume' | 'finish') {
    return sessionOperation(async () => {
      await acceptSnapshot(await focusDriver.action(action))
      await refreshRest()
    })
  }
  async function startRest() {
    return sessionOperation(async () => {
      if (lock.value.session) throw new Error('请先结束当前锁机')
      if (focus.value.session) throw new Error('请先结束当前专注')
      if (!lastResult.value) throw new Error('没有可用于休息的专注记录')
      rest.value = await restDriver.start(lastResult.value)
    })
  }
  async function exitRest() {
    return sessionOperation(async () => {
      rest.value = await restDriver.exit()
    })
  }
  async function startLock(configurationId: string, strictLockConfirmed = false) {
    return sessionOperation(async () => {
      await writeQueue
      lock.value = await lockDriver.start(configurationId, strictLockConfirmed)
    })
  }
  async function finishLock(confirmed: boolean) {
    return sessionOperation(async () => { lock.value = await lockDriver.finish(confirmed) })
  }
  async function saveTheme(theme: Theme) {
    if (!theme.name.trim()) throw new Error('请填写主题名称')
    await mutate((d) => {
      const i = d.themes.findIndex((t) => t.id === theme.id)
      if (i < 0) d.themes.push(theme)
      else d.themes[i] = theme
    })
  }
  async function saveItem(item: FocusItem) {
    if (!item.title.trim()) throw new Error('请填写待办名称')
    if (!Number.isInteger(item.minutes) || item.minutes <= 0) throw new Error('请填写正整数分钟')
    await mutate((d) => {
      const i = d.items.findIndex((t) => t.id === item.id)
      if (i < 0) d.items.push(item)
      else d.items[i] = item
    })
  }
  async function removeItem(id: string) {
    await mutate((d) => {
      const item = d.items.find((t) => t.id === id)
      if (item) item.deleted = true
      d.events.forEach((e) => {
        if (e.itemId === id) e.itemId = null
      })
    })
  }
  async function removeTheme(id: string, moveTo: string | null) {
    await mutate((d) => {
      const theme = d.themes.find((t) => t.id === id)
      if (theme) theme.deleted = true
      for (const item of d.items.filter((t) => t.themeId === id && !t.deleted)) {
        if (moveTo) item.themeId = moveTo
        else {
          item.deleted = true
          d.events.forEach((e) => {
            if (e.itemId === item.id) e.itemId = null
          })
        }
      }
    })
  }
  async function move(kind: 'theme' | 'item', id: string, direction: number) {
    await mutate((d) => {
      const rows =
        kind === 'theme'
          ? d.themes.filter((t) => !t.deleted)
          : d.items.filter(
              (t) => !t.deleted && t.themeId === d.items.find((i) => i.id === id)?.themeId,
            )
      rows.sort((a, b) => a.order - b.order)
      const i = rows.findIndex((t) => t.id === id),
        other = rows[i + direction]
      if (other && rows[i]) {
        rows.forEach((r, n) => (r.order = n))
        const value = rows[i]!.order
        rows[i]!.order = other.order
        other.order = value
      }
    })
  }
  async function saveEvent(
    event: CalendarEvent,
    source?: Occurrence,
    scope: 'once' | 'all' = 'all',
  ) {
    validateEvent(event)
    await mutate((d) => {
      if (source && scope === 'once') {
        d.eventExceptions = d.eventExceptions.filter(
          (e) => !(e.eventId === source.sourceId && e.date === source.sourceDate),
        )
        d.eventExceptions.push({
          eventId: source.sourceId,
          date: source.sourceDate,
          cancelled: false,
          title: event.title,
          start: event.start,
          end: event.end,
        })
      } else {
        const i = d.events.findIndex((e) => e.id === event.id)
        if (i < 0) d.events.push(event)
        else d.events[i] = event
      }
    })
  }
  async function removeOccurrence(o: Occurrence, scope: 'once' | 'all') {
    await mutate((d) => {
      if (o.kind === 'event') {
        if (scope === 'all') {
          d.events = d.events.filter((e) => e.id !== o.sourceId)
          d.eventExceptions = d.eventExceptions.filter((e) => e.eventId !== o.sourceId)
        } else {
          d.eventExceptions = d.eventExceptions.filter(
            (e) => !(e.eventId === o.sourceId && e.date === o.sourceDate),
          )
          d.eventExceptions.push({ eventId: o.sourceId, date: o.sourceDate, cancelled: true })
        }
      } else {
        if (scope === 'all') {
          d.courses = d.courses.filter((c) => c.id !== o.sourceId)
          d.courseExceptions = d.courseExceptions.filter((c) => c.courseId !== o.sourceId)
        } else {
          d.courseExceptions = d.courseExceptions.filter(
            (c) => !(c.courseId === o.sourceId && c.date === o.sourceDate),
          )
          d.courseExceptions.push({ courseId: o.sourceId, date: o.sourceDate, cancelled: true })
        }
      }
    })
  }
  async function saveSemester(semester: Semester) {
    if (!semester.name.trim()) throw new Error('请填写学期名称')
    if (weekday(semester.startDate) !== 1) throw new Error('第一周需要从周一开始')
    if (!Number.isInteger(semester.weeks) || semester.weeks < 1 || semester.weeks > 104)
      throw new Error('教学周数需要在 1–104 之间')
    if (!semester.periods.length || semester.periods.some((p) => p.end <= p.start))
      throw new Error('每节课的结束时间需要晚于开始时间')
    if (
      data.value.courses.some(
        (c) =>
          c.semesterId === semester.id &&
          (c.lastWeek > semester.weeks || c.lastPeriod > semester.periods.length),
      )
    )
      throw new Error('已有课程超出新的周数或节次，请先调整课程')
    await mutate((d) => {
      const i = d.semesters.findIndex((s) => s.id === semester.id)
      if (i < 0) d.semesters.push(semester)
      else d.semesters[i] = semester
      d.preferences.activeSemesterId = semester.id
    })
  }
  async function saveCourse(course: Course) {
    const semester = data.value.semesters.find((s) => s.id === course.semesterId)
    if (!course.title.trim() || !semester) throw new Error('请填写课程并选择学期')
    if (
      course.firstWeek < 1 ||
      course.lastWeek > semester.weeks ||
      course.lastWeek < course.firstWeek ||
      course.firstPeriod < 1 ||
      course.lastPeriod > semester.periods.length ||
      course.lastPeriod < course.firstPeriod
    )
      throw new Error('请检查课程周次与节次范围')
    await mutate((d) => {
      const i = d.courses.findIndex((c) => c.id === course.id)
      if (i < 0) d.courses.push(course)
      else d.courses[i] = course
    })
  }
  async function adjustCourse(o: Occurrence, start: string, end: string) {
    if (end <= start) throw new Error('结束时间需要晚于开始时间')
    await mutate((d) => {
      d.courseExceptions = d.courseExceptions.filter(
        (c) => !(c.courseId === o.sourceId && c.date === o.sourceDate),
      )
      d.courseExceptions.push({
        courseId: o.sourceId,
        date: o.sourceDate,
        cancelled: false,
        start,
        end,
      })
    })
  }
  async function deleteRecord(id: string) {
    await mutate((d) => {
      d.records = d.records.filter((r) => r.id !== id)
      if (!d.deletedRecordIds.includes(id)) d.deletedRecordIds.push(id)
    })
  }
  async function restore(next: AppData) {
    if (lock.value.session) throw new Error('请先结束当前锁机再恢复数据')
    if (focus.value.session) throw new Error('请先结束当前专注再恢复数据')
    const restored = JSON.parse(JSON.stringify(next)) as AppData
    await writeQueue
    await repository.replace(restored)
    data.value = restored
    await syncReminders()
    lastResult.value = undefined
    rest.value = { session: null, remainingMs: 0 }
    notify('备份已恢复')
  }
  function itemRecordsToday(id: string) {
    return data.value.records.filter((r) => r.itemId === id && dateKey(r.startedAt) === dateKey())
  }
  function dispose() {
    clearInterval(timerHandle)
  }
  return {
    data,
    focus,
    rest,
    lock,
    startLock,
    finishLock,
    ready,
    error,
    toast,
    lastResult,
    startConfirmation,
    confirmStart,
    themes,
    items,
    init,
    tick,
    start,
    action,
    startRest,
    exitRest,
    mutate,
    notify,
    saveTheme,
    saveItem,
    removeItem,
    removeTheme,
    move,
    saveEvent,
    removeOccurrence,
    saveSemester,
    saveCourse,
    adjustCourse,
    deleteRecord,
    restore,
    itemRecordsToday,
    dispose,
  }
})
