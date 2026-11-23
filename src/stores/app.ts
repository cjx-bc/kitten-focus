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
import { emptyData, uid, defaultProtection, THEME_COLORS } from '../domain/model'
import {
  migrateProtectionPreferences,
  resolveEffectiveProtection,
  syncLegacyFlatMutation,
  toggleProtectionModule,
} from '../domain/protectionModules'
import type { ProtectionCapabilityId } from '../domain/startRecovery'
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
import { waitForDialogClose } from '../components/sheetClose'

export const useApp = defineStore('app', () => {
  const data = shallowRef<AppData>(emptyData()),
    focus = shallowRef<FocusSnapshot>({ session: null, elapsedMs: 0 }),
    rest = shallowRef<RestSnapshot>({ session: null, remainingMs: 0 }),
    lock = shallowRef<LockSnapshot>({ session: null, remainingMs: 0, records: [] }),
    ready = ref(false),
    error = ref(''),
    toast = ref('')
  const lastResult = shallowRef<FocusSnapshot['record']>(undefined)
  const STRICT_ACK_KEY = 'xiaomao-strict-acknowledged'
  function readStrictAck(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem(STRICT_ACK_KEY) === '1'
    } catch {
      return false
    }
  }
  function writeStrictAck(value: boolean) {
    try {
      if (typeof localStorage === 'undefined') return
      if (value) localStorage.setItem(STRICT_ACK_KEY, '1')
      else localStorage.removeItem(STRICT_ACK_KEY)
    } catch {}
  }
  const strictAcknowledged = ref(readStrictAck())
  function acknowledgeStrict() {
    strictAcknowledged.value = true
    writeStrictAck(true)
  }
  function clearStrictAcknowledged() {
    strictAcknowledged.value = false
    writeStrictAck(false)
  }
  const strictConfirmation = ref<{ title: string; minutes: number } | null>(null)
  let resolveStrictConfirmation: ((accepted: boolean) => void) | undefined
  function confirmStrictStart(accepted: boolean) {
    strictConfirmation.value = null
    resolveStrictConfirmation?.(accepted)
    resolveStrictConfirmation = undefined
  }
  const sheetCloseSignal = ref(0)
  function requestCloseSheets() {
    sheetCloseSignal.value += 1
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ux-close-sheets'))
    }
  }
  async function clearUnreadyProtections(ids: ProtectionCapabilityId[], silent = false) {
    if (!ids.length) return
    const set = new Set<string>(ids)
    const removeKeys: string[] = []
    if (set.has('navigation')) removeKeys.push('navigationHomeRecents')
    if (set.has('antiClose')) removeKeys.push('preciseAntiClose')
    if (set.has('recentTasks')) removeKeys.push('recentTasksHidden')
    if (set.has('launcher')) removeKeys.push('launcherIconHidden')
    if (set.has('wallpaper')) removeKeys.push('wallpaperProtection')
    await mutate((d) => {
      let nextProtection = d.preferences.protection ?? defaultProtection()
      if (set.has('applications')) {
        nextProtection = toggleProtectionModule(nextProtection, 'apps', false)
      }
      nextProtection = syncLegacyFlatMutation(nextProtection, (p) => {
        if (set.has('applications')) p.study = false
        if (set.has('dnd')) p.dnd = false
        if (set.has('notifications')) p.interceptNotifications = false
        if (removeKeys.length) p.enhancements = p.enhancements.filter((k) => !removeKeys.includes(k))
      })
      d.preferences.protection = nextProtection
    })
    if (!silent) notify('已关闭未就绪的保护项，请重新点击开始专注')
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
      if (!resolveEffectiveProtection(snapshot.preferences.protection).strict) {
        clearStrictAcknowledged()
      }
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
      const loaded = await repository.load()
      const hadModules = Boolean(loaded.preferences.protection?.modules)
      if (loaded.preferences.protection) {
        loaded.preferences.protection = migrateProtectionPreferences(loaded.preferences.protection)
      }
      if (!hadModules || !resolveEffectiveProtection(loaded.preferences.protection).strict) {
        clearStrictAcknowledged()
      }
      data.value = loaded
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
        ? resolveEffectiveProtection(startingData.preferences.protection)
        : undefined
      if (protection?.strict && mode === 'countdown') {
        if (strictAcknowledged.value) {
          strictModeConfirmed = true
        } else {
          const accepted = await new Promise<boolean>((resolve) => {
            resolveStrictConfirmation = resolve
            strictConfirmation.value = {
              title: savedItem?.title || '自由专注',
              minutes,
            }
          })
          if (!accepted) throw new Error('已取消开始专注')
          await waitForDialogClose()
          strictModeConfirmed = true
        }
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
        if (protection?.strict && mode === 'countdown') acknowledgeStrict()
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
  function nextThemeOrder(d: AppData) {
    const live = d.themes.filter((t) => !t.deleted)
    return live.length ? Math.max(...live.map((t) => t.order)) + 1 : 0
  }
  function nextItemOrder(d: AppData, themeId: string) {
    const siblings = d.items.filter((t) => !t.deleted && t.themeId === themeId)
    return siblings.length ? Math.max(...siblings.map((t) => t.order)) + 1 : 0
  }
  function buildItemPayload(
    existing: FocusItem | undefined,
    incoming: FocusItem,
    title: string,
    themeId: string,
    order: number,
  ): FocusItem {
    const next: FocusItem = {
      ...(existing ?? {}),
      id: incoming.id,
      themeId,
      title,
      note: incoming.note,
      mode: incoming.mode,
      minutes: incoming.minutes,
      order,
    }
    if (incoming.whitelist?.source === 'custom') {
      next.whitelist = { source: 'custom', packages: [...incoming.whitelist.packages] }
    } else if (incoming.whitelist?.source === 'global') {
      next.whitelist = { source: 'global' }
    } else {
      delete next.whitelist
    }
    return next
  }
  function validateItemFields(item: FocusItem) {
    const title = item.title.trim()
    if (!title) throw new Error('请填写待办名称')
    if (!Number.isInteger(item.minutes) || item.minutes <= 0) throw new Error('请填写正整数分钟')
    return title
  }
  async function saveTheme(theme: Theme) {
    const name = theme.name.trim()
    if (!name) throw new Error('请填写主题名称')
    await mutate((d) => {
      const i = d.themes.findIndex((t) => t.id === theme.id)
      if (i < 0) {
        d.themes.push({
          ...theme,
          name,
          order: nextThemeOrder(d),
          collapsed: Boolean(theme.collapsed),
        })
      } else {
        // Preserve stored order/collapsed so stale form snapshots do not revert move() or toggle actions.
        d.themes[i] = { ...d.themes[i]!, name, color: theme.color }
      }
    })
  }
  async function toggleThemeCollapsed(id: string) {
    await mutate((d) => {
      const theme = d.themes.find((t) => t.id === id && !t.deleted)
      if (theme) theme.collapsed = !theme.collapsed
    })
  }
  async function saveItem(item: FocusItem) {
    const title = validateItemFields(item)
    await mutate((d) => {
      if (!d.themes.some((t) => t.id === item.themeId && !t.deleted))
        throw new Error('请选择有效的所属主题')
      const i = d.items.findIndex((t) => t.id === item.id)
      const existing = i >= 0 ? d.items[i] : undefined
      const order =
        existing && existing.themeId === item.themeId
          ? existing.order
          : nextItemOrder(d, item.themeId)
      const next = buildItemPayload(existing, item, title, item.themeId, order)
      if (i < 0) d.items.push(next)
      else d.items[i] = next
    })
  }
  async function saveItemWithNewTheme(
    themeInput: { name: string; color?: string },
    item: FocusItem,
  ) {
    const themeName = themeInput.name.trim()
    if (!themeName) throw new Error('请填写主题名称')
    const title = validateItemFields(item)
    await mutate((d) => {
      const liveCount = d.themes.filter((t) => !t.deleted).length
      const themeId = uid()
      const theme: Theme = {
        id: themeId,
        name: themeName,
        color: themeInput.color || THEME_COLORS[liveCount % THEME_COLORS.length]!,
        order: nextThemeOrder(d),
        collapsed: false,
      }
      d.themes.push(theme)
      const i = d.items.findIndex((t) => t.id === item.id)
      const existing = i >= 0 ? d.items[i] : undefined
      const next = buildItemPayload(existing, item, title, themeId, 0)
      if (i < 0) d.items.push(next)
      else d.items[i] = next
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
      const theme = d.themes.find((t) => t.id === id && !t.deleted)
      if (!theme) throw new Error('主题不存在')
      if (moveTo !== null) {
        if (moveTo === id || !d.themes.some((t) => t.id === moveTo && !t.deleted)) {
          throw new Error('目标主题不存在')
        }
      }
      theme.deleted = true
      let nextOrder = moveTo ? nextItemOrder(d, moveTo) : 0
      const children = d.items
        .filter((t) => t.themeId === id && !t.deleted)
        .sort((a, b) => a.order - b.order)
      for (const item of children) {
        if (moveTo) {
          item.themeId = moveTo
          item.order = nextOrder++
        } else {
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
      if (restored.preferences.protection) {
        restored.preferences.protection = migrateProtectionPreferences(restored.preferences.protection)
      }
      await dataOperation(async () => {
        await repository.replace(restored)
        clearStrictAcknowledged()
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
    strictAcknowledged,
    acknowledgeStrict,
    clearStrictAcknowledged,
    strictConfirmation,
    confirmStrictStart,
    sheetCloseSignal,
    requestCloseSheets,
    clearUnreadyProtections,
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
    toggleThemeCollapsed,
    saveItem,
    saveItemWithNewTheme,
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
