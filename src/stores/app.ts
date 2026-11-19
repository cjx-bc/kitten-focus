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
  ProtectionPreferences,
} from '../domain/model'
import { emptyData, uid, effectiveWhitelist, defaultProtection } from '../domain/model'
import {
  focusDriver,
  restDriver,
  lockDriver,
  repository,
  syncReminders,
  protectionDriver,
  permissionStatus,
} from '../platform/bridge'
import { makeBackup, readBackup } from '../domain/backup'
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
    protections: ProtectionPreferences
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
    visibilityBound = false,
    toastHandle: ReturnType<typeof setTimeout>,
    ticking = false
  function onVisibilityChange() {
    if (!document.hidden) void tick()
  }
  function startTicking() {
    if (!timerHandle) {
      timerHandle = setInterval(() => {
        void tick()
      }, 750)
    }
    if (!visibilityBound && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = true
    }
  }
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
  function dataOperation<T>(operation: () => Promise<T>): Promise<T> {
    const pending = writeQueue.then(operation)
    writeQueue = pending.then(() => {}, () => {})
    return pending
  }
  async function mutate(update: (next: AppData) => void) {
    if (!dataLoaded) throw new Error('本地数据尚未安全加载，请先恢复升级副本')
    await dataOperation(async () => {
      const next = structuredClone(data.value)
      update(next)
      const snapshot = JSON.parse(JSON.stringify(next)) as AppData
      try {
        await repository.save(snapshot)
      } catch (e) {
        error.value = '保存失败，请重试：' + String(e)
        throw e
      }
      data.value = snapshot
      if (error.value.startsWith('保存失败，请重试：')) error.value = ''
      await syncReminders().catch(() => {
        notify('数据已保存，提醒同步未完成')
      })
    })
  }
  async function acceptSnapshot(snapshot: FocusSnapshot) {
    const had = focus.value.session
    focus.value = snapshot
    const record = snapshot.record
    if (record && !data.value.deletedRecordIds.includes(record.id)) {
      if (had?.id === record.id) {
        lastResult.value = record
        if (
          data.value.preferences.vibration &&
          typeof navigator !== 'undefined' &&
          'vibrate' in navigator
        )
          navigator.vibrate(150)
      }
      if (!data.value.records.some((r) => r.id === record.id))
        await mutate((d) => {
          if (!d.deletedRecordIds.includes(record.id) && !d.records.some((r) => r.id === record.id))
            d.records.push(record)
        })
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
      await Promise.allSettled([
        protectionDriver.apps(),
        protectionDriver.status(),
        permissionStatus(),
      ])
      await tick()
      ready.value = true
      startTicking()
      await syncReminders().catch((e) => {
        console.warn('syncReminders failed during init', e)
        notify('提醒同步未完成，请稍后在设置中重试')
      })
    } catch (e) {
      error.value = '本地数据读取失败：' + String(e)
    }
  }
  async function start(
    item: FocusItem | null,
    requestedMode?: ActiveFocus['mode'],
    requestedMinutes?: number,
  ) {
    return sessionOperation(async () => {
      if (!dataLoaded) throw new Error('本地数据尚未安全加载，请先恢复升级副本')
      if (focus.value.session) throw new Error('已有一条未结束的专注，请先返回或结束它')
      if (lock.value.session) throw new Error('已有锁机正在进行，请先返回锁机处理')
      await refreshRest()
      if (rest.value.session?.state === 'running') throw new Error('请先退出休息，再开始新的专注')
      await writeQueue
      const startingData = data.value
      const savedItem = item && startingData.items.find((candidate) => candidate.id === item.id && !candidate.deleted)
      if (item && !savedItem) throw new Error('该待办已删除或尚未保存')
      const mode = requestedMode ?? savedItem?.mode ?? 'countdown'
      const minutes = requestedMinutes ?? savedItem?.minutes ?? startingData.preferences.defaultMinutes
      if (!Number.isFinite(minutes) || minutes <= 0 || !Number.isInteger(minutes))
        throw new Error('请填写正整数分钟')
      let strictModeConfirmed = false
      const protection = startingData.preferences.protection
      if (protection?.strict || protection?.study || protection?.interceptNotifications || protection?.dnd || protection?.enhancements?.length) {
        const whitelist = effectiveWhitelist(startingData, savedItem?.id ?? null)
        const accepted = await new Promise<boolean>((resolve) => {
          resolveStartConfirmation = resolve
          startConfirmation.value = {
            title: savedItem?.title || '自由专注',
            mode,
            minutes,
            strict: !!protection.strict,
            study: !!protection.study,
            protections: JSON.parse(JSON.stringify({ ...defaultProtection(), ...protection })),
            whitelistCount: whitelist.whitelist.length,
            whitelistSource: whitelist.source,
          }
        })
        if (!accepted) throw new Error('已取消开始专注')
        strictModeConfirmed = true
      }
      const theme = startingData.themes.find((t) => t.id === savedItem?.themeId),
        now = Date.now()
      const session: ActiveFocus = {
        id: uid(),
        itemId: savedItem?.id || null,
        themeId: theme?.id || null,
        title: savedItem?.title || '自由专注',
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
      const snapshot = await dataOperation(async () => {
        if (data.value !== startingData) throw new Error('专注配置已变化，请重新开始')
        return focusDriver.start(session, strictModeConfirmed)
      })
      lastResult.value = undefined
      await acceptSnapshot(snapshot)
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
  async function startLock(configurationId: string, strictLockConfirmed = false, confirmedData?: AppData) {
    return sessionOperation(async () => {
      if (!dataLoaded) throw new Error('本地数据尚未安全加载，请先恢复升级副本')
      lock.value = await dataOperation(async () => {
        if (confirmedData && confirmedData !== data.value) throw new Error('锁机配置已变化，请重新确认')
        return lockDriver.start(configurationId, strictLockConfirmed)
      })
    })
  }
  async function finishLock(confirmed: boolean) {
    return sessionOperation(async () => {
      lock.value = await lockDriver.finish(confirmed)
    })
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
    const singleOccurrence = source && scope === 'once'
    const payload: CalendarEvent = singleOccurrence || event.repeat === 'none'
      ? { ...event, repeat: 'none', until: '' }
      : event
    validateEvent(payload)
    await mutate((d) => {
      if (singleOccurrence) {
        d.eventExceptions = d.eventExceptions.filter(
          (e) => !(e.eventId === source.sourceId && e.date === source.sourceDate),
        )
        d.eventExceptions.push({
          eventId: source.sourceId,
          date: source.sourceDate,
          cancelled: false,
          title: payload.title,
          start: payload.start,
          end: payload.end,
        })
      } else {
        if (payload.repeat === 'none') {
          d.eventExceptions = d.eventExceptions.filter((e) => e.eventId !== payload.id)
        }
        const i = d.events.findIndex((e) => e.id === payload.id)
        if (i < 0) d.events.push(payload)
        else d.events[i] = payload
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
    return sessionOperation(async () => {
      if (lock.value.session) throw new Error('请先结束当前锁机再恢复数据')
      if (focus.value.session) throw new Error('请先结束当前专注再恢复数据')
      const restored = readBackup(makeBackup(next)).data
      await dataOperation(async () => {
        await repository.replace(restored)
        data.value = restored
        dataLoaded = true
      })
      error.value = ''
      ready.value = true
      startTicking()
      const checks = await Promise.allSettled([
        syncReminders(),
        protectionDriver.apps(),
        protectionDriver.status(),
        permissionStatus(),
      ])
      lastResult.value = undefined
      rest.value = { session: null, remainingMs: 0 }
      notify(
        checks.some((check) => check.status === 'rejected')
          ? '备份已恢复；提醒、应用或权限检查未完成，请进入设置重试'
          : '备份已恢复，已重新检查本机应用与权限',
      )
    })
  }
  function itemRecordsToday(id: string) {
    return data.value.records.filter((r) => r.itemId === id && dateKey(r.startedAt) === dateKey())
  }
  function dispose() {
    clearInterval(timerHandle)
    timerHandle = undefined
    if (visibilityBound && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = false
    }
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
