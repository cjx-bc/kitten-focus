<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import type { CalendarEvent, Course, FocusItem, FocusRecord, Occurrence, Semester } from '../domain/model'
import { defaultPeriods, uid } from '../domain/model'
import { findEventConflict, occurrences, semesterWeek, validateEvent } from '../domain/calendar'
import {
  addDays,
  dateKey,
  duration,
  intervalBuckets,
  localDate,
  localInput,
  readableDate,
  weekday,
  weekdayName,
  weekStart,
  zoneDate,
  zoneTime,
} from '../domain/dates'
import {
  classifyStartError,
  getUnreadyProtectionIds,
  isCancelledStartError,
  type StartErrorKind,
} from '../domain/startRecovery'
import Icon from '../components/Icon.vue'
import Sheet from '../components/Sheet.vue'
import { waitForDialogClose } from '../components/sheetClose'
import StudyModeSheet from '../components/StudyModeSheet.vue'

type CalendarSheet =
  | 'menu'
  | 'event'
  | 'detail'
  | 'semester'
  | 'course'
  | 'adjust'
  | 'startError'
  | null

const app = useApp(),
  router = useRouter(),
  tab = ref<'schedule' | 'timetable'>('schedule'),
  view = ref<'plan' | 'actual'>('plan'),
  day = ref(dateKey()),
  monthOpen = ref(false)
const sheet = ref<CalendarSheet>(null),
  studyOpen = ref(false),
  error = ref(''),
  busy = ref(false),
  selected = ref<Occurrence | null>(null),
  source = ref<Occurrence | undefined>(),
  scope = ref<'once' | 'all'>('all'),
  eventConflict = ref<string | null>(null),
  detailDeleteStep = ref<'idle' | 'choose'>('idle'),
  eventBackToDetail = ref(false),
  courseBackToDetail = ref(false),
  semesterBackToMenu = ref(false),
  startError = ref<{ message: string; kind: StartErrorKind } | null>(null),
  pendingStartItem = ref<FocusItem | null>(null)

const eventForm = reactive<CalendarEvent>({
  id: '',
  title: '',
  start: '',
  end: '',
  allDay: false,
  note: '',
  repeat: 'none',
  weekdays: [],
  until: '',
  itemId: null,
  reminderMinutes: null,
})
const semesterForm = reactive<Semester>({
  id: '',
  name: '',
  startDate: '',
  weeks: 20,
  periods: defaultPeriods(),
})
const courseForm = reactive<Course>({
  id: '',
  semesterId: '',
  title: '',
  weekday: 1,
  firstPeriod: 1,
  lastPeriod: 2,
  firstWeek: 1,
  lastWeek: 20,
  parity: 'all',
  room: '',
  teacher: '',
  color: '#737378',
  reminderMinutes: null,
})
const adjust = reactive({ start: '', end: '' })

const currentSemester = computed(() =>
    app.data.semesters.find((s) => s.id === app.data.preferences.activeSemesterId),
  ),
  week = computed(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart(day.value), i)))
const currentWeek = computed(() =>
  currentSemester.value ? semesterWeek(currentSemester.value.startDate, day.value) : 0,
)
const dayItems = computed(() => occurrences(app.data, day.value, day.value)),
  weekCourses = computed(() =>
    occurrences(app.data, week.value[0]!, week.value[6]!).filter((o) => o.kind === 'course'),
  )
const actualRecords = computed(() =>
  app.data.records
    .filter((r) =>
      r.segments.some(
        (s) =>
          zoneDate(s.start, r.timeZone) <= day.value && zoneDate(s.end, r.timeZone) >= day.value,
      ),
    )
    .sort((a, b) => a.startedAt - b.startedAt),
)
const allDay = computed(() => dayItems.value.filter((o) => o.allDay)),
  timed = computed(() => dayItems.value.filter((o) => !o.allDay))
const monthTitle = computed(
  () => `${localDate(day.value).getFullYear()}年${localDate(day.value).getMonth() + 1}月`,
)
const monthDays = computed(() => {
  const d = localDate(day.value),
    first = dateKey(new Date(d.getFullYear(), d.getMonth(), 1)),
    start = weekStart(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
})
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const slotCount = computed(() => currentSemester.value?.periods.length || 10)
const scheduleHasEmptyPrimary = computed(
  () => tab.value === 'schedule' && view.value === 'plan' && dayItems.value.length === 0,
)
const timetableHasEmptyPrimary = computed(
  () => tab.value === 'timetable' && !currentSemester.value,
)
const selectedLinkedItem = computed(() =>
  selected.value?.itemId
    ? app.items.find((i) => i.id === selected.value!.itemId) ?? null
    : null,
)
const isSelectedWeeklyEvent = computed(() => {
  if (!selected.value || selected.value.kind !== 'event') return false
  return app.data.events.find((e) => e.id === selected.value!.sourceId)?.repeat === 'weekly'
})

const sheetTitle = computed(() => {
  switch (sheet.value) {
    case 'menu':
      return '日历视图与设置'
    case 'event':
      return source.value ? '编辑日程' : '添加日程'
    case 'detail':
      return selected.value?.kind === 'course' ? '课程详情' : '日程详情'
    case 'semester':
      return app.data.semesters.some((s) => s.id === semesterForm.id)
        ? '学期与上课时间'
        : '新建学期'
    case 'course':
      return app.data.courses.some((c) => c.id === courseForm.id) ? '编辑课程' : '添加课程'
    case 'adjust':
      return '仅本次调课'
    case 'startError':
      return '无法开始专注'
    default:
      return ''
  }
})

const sheetBackLabel = computed<string | undefined>(() => {
  if (sheet.value === 'event' && eventBackToDetail.value) return '日程详情'
  if (sheet.value === 'course' && courseBackToDetail.value) return '课程详情'
  if (sheet.value === 'adjust' && selected.value) {
    return selected.value.kind === 'course' ? '课程详情' : '日程详情'
  }
  if (sheet.value === 'semester' && semesterBackToMenu.value) return '日历视图与设置'
  return undefined
})

watch(
  () => [
    eventForm.start,
    eventForm.end,
    eventForm.allDay,
    eventForm.repeat,
    eventForm.weekdays.join(','),
    eventForm.until,
    scope.value,
  ],
  () => {
    eventConflict.value = null
  },
)

function clearError() {
  error.value = ''
}

function closeSheet(force = false) {
  if (busy.value && force !== true) return
  sheet.value = null
  clearError()
  eventConflict.value = null
  detailDeleteStep.value = 'idle'
  eventBackToDetail.value = false
  courseBackToDetail.value = false
  semesterBackToMenu.value = false
  startError.value = null
}

function handleSheetBack() {
  if (busy.value) return
  clearError()
  if (sheet.value === 'event' && eventBackToDetail.value) {
    eventConflict.value = null
    eventBackToDetail.value = false
    sheet.value = 'detail'
    return
  }
  if (sheet.value === 'course' && courseBackToDetail.value) {
    courseBackToDetail.value = false
    sheet.value = 'detail'
    return
  }
  if (sheet.value === 'adjust') {
    sheet.value = 'detail'
    return
  }
  if (sheet.value === 'semester' && semesterBackToMenu.value) {
    semesterBackToMenu.value = false
    sheet.value = 'menu'
  }
}

async function execute(fn: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await fn()
    closeSheet(true)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function openMenu() {
  clearError()
  sheet.value = 'menu'
}

function changeWeek(delta: number) {
  day.value = addDays(day.value, delta * 7)
}

function changeMonth(delta: number) {
  const d = localDate(day.value)
  day.value = dateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1))
}

function selectDay(date: string) {
  day.value = date
  monthOpen.value = false
}

function defaultEventRange(selectedDay: string) {
  if (selectedDay === dateKey()) {
    const now = new Date()
    const nextSlot = Math.floor((now.getHours() * 60 + now.getMinutes()) / 30 + 1) * 30
    if (nextSlot >= 23 * 60) {
      return { start: `${selectedDay}T23:00`, end: `${selectedDay}T23:59` }
    }
    const startMs = new Date(`${selectedDay}T00:00:00`).getTime() + nextSlot * 60000
    return { start: localInput(startMs), end: localInput(startMs + 3600000) }
  }
  const start = new Date(`${selectedDay}T09:00:00`)
  return { start: localInput(start), end: localInput(start.getTime() + 3600000) }
}

function newEvent() {
  source.value = undefined
  scope.value = 'all'
  eventBackToDetail.value = false
  eventConflict.value = null
  const range = defaultEventRange(day.value)
  Object.assign(eventForm, {
    id: uid(),
    title: '',
    start: range.start,
    end: range.end,
    allDay: false,
    note: '',
    repeat: 'none',
    weekdays: [weekday(day.value)],
    until: '',
    itemId: null,
    reminderMinutes: null,
  })
  clearError()
  sheet.value = 'event'
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

function editEvent(o: Occurrence, fromDetail = false) {
  const event = app.data.events.find((e) => e.id === o.sourceId)
  if (!event) return
  source.value = o
  scope.value = event.repeat === 'weekly' ? 'once' : 'all'
  eventBackToDetail.value = fromDetail
  eventConflict.value = null
  Object.assign(eventForm, clone(event))
  if (eventForm.allDay) eventForm.end = addDays(eventForm.end.slice(0, 10), -1) + 'T23:59'
  if (scope.value === 'once') {
    eventForm.title = o.title
    eventForm.start = o.start
    eventForm.end = o.allDay ? addDays(o.end.slice(0, 10), -1) + 'T23:59' : o.end
  }
  clearError()
  sheet.value = 'event'
}

function changeScope() {
  if (!source.value) return
  const event = app.data.events.find((e) => e.id === source.value!.sourceId)
  if (scope.value === 'all' && event) Object.assign(eventForm, clone(event))
  else {
    eventForm.title = source.value.title
    eventForm.start = source.value.start
    eventForm.end = source.value.end
    eventForm.allDay = source.value.allDay
  }
  if (eventForm.allDay) eventForm.end = addDays(eventForm.end.slice(0, 10), -1) + 'T23:59'
}

async function saveEvent(allowConflict = false): Promise<boolean> {
  const payload = structuredClone({ ...eventForm, weekdays: [...eventForm.weekdays] })
  payload.title = payload.title.trim()
  if (scope.value === 'once') payload.repeat = 'none'
  if (payload.repeat === 'none') payload.until = ''
  if (payload.allDay) {
    payload.start = `${payload.start.slice(0, 10)}T00:00`
    payload.end = `${addDays(payload.end.slice(0, 10), 1)}T00:00`
  }
  validateEvent(payload)
  if (!allowConflict) {
    const conflict = findEventConflict(
      app.data,
      payload,
      scope.value === 'once' ? source.value?.id : undefined,
    )
    if (conflict) {
      eventConflict.value = conflict.title
      return false
    }
  }
  eventConflict.value = null
  await app.saveEvent(payload, source.value, scope.value)
  return true
}

async function submitEvent(allowConflict = false) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const saved = await saveEvent(allowConflict)
    if (saved) closeSheet(true)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function showDetail(o: Occurrence) {
  selected.value = o
  detailDeleteStep.value = 'idle'
  clearError()
  sheet.value = 'detail'
}

async function confirmDelete(which: 'once' | 'all') {
  const occurrence = selected.value
  if (!occurrence || busy.value) return
  await execute(() => app.removeOccurrence(occurrence, which))
}

function openSemester(semester?: Semester, fromMenu = false) {
  semesterBackToMenu.value = fromMenu
  Object.assign(
    semesterForm,
    semester
      ? clone(semester)
      : {
          id: uid(),
          name: `${new Date().getFullYear()} 学期`,
          startDate: weekStart(dateKey()),
          weeks: 20,
          periods: defaultPeriods(),
        },
  )
  clearError()
  sheet.value = 'semester'
}

async function saveSemester() {
  await app.saveSemester(clone(semesterForm))
  day.value = semesterForm.startDate
}

function openCourse(course?: Course, fromDetail = false) {
  if (!currentSemester.value) {
    openSemester(undefined, false)
    return
  }
  courseBackToDetail.value = fromDetail
  Object.assign(
    courseForm,
    course
      ? clone(course)
      : {
          id: uid(),
          semesterId: currentSemester.value.id,
          title: '',
          weekday: 1,
          firstPeriod: 1,
          lastPeriod: 2,
          firstWeek: 1,
          lastWeek: currentSemester.value.weeks,
          parity: 'all',
          room: '',
          teacher: '',
          color: '#737378',
          reminderMinutes: null,
        },
  )
  clearError()
  sheet.value = 'course'
}

async function selectSemesterById(id: string) {
  if (busy.value) return
  await app.mutate((d) => (d.preferences.activeSemesterId = id))
  const semester = app.data.semesters.find((s) => s.id === id)
  if (semester) day.value = semester.startDate
  closeSheet()
}

function openAdjust() {
  if (!selected.value) return
  adjust.start = selected.value.start
  adjust.end = selected.value.end
  clearError()
  sheet.value = 'adjust'
}

async function runStartItem(item: FocusItem) {
  busy.value = true
  error.value = ''
  startError.value = null
  try {
    await app.start(item)
    await router.push('/focus')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!isCancelledStartError(message)) {
      startError.value = { message, kind: classifyStartError(message) }
      sheet.value = 'startError'
    }
  } finally {
    busy.value = false
  }
}

async function startFromEvent() {
  if (busy.value || !selected.value?.itemId) return
  const item = app.items.find((i) => i.id === selected.value!.itemId)
  if (!item) return
  pendingStartItem.value = item
  busy.value = true
  error.value = ''
  startError.value = null
  sheet.value = null
  await waitForDialogClose()
  busy.value = false
  await runStartItem(item)
}

async function goRecoveryFromStartError() {
  if (busy.value) return
  sheet.value = null
  startError.value = null
  await waitForDialogClose()
  await router.push('/recovery')
}

async function openStudyFromStartError() {
  if (busy.value) return
  sheet.value = null
  startError.value = null
  await waitForDialogClose()
  studyOpen.value = true
}

async function clearUnreadyAndRetry() {
  if (busy.value) return
  const item = pendingStartItem.value
  if (!item) {
    closeSheet()
    return
  }
  busy.value = true
  try {
    const ids = await getUnreadyProtectionIds(app.data.preferences.protection)
    if (!ids.length) {
      sheet.value = null
      startError.value = null
      await waitForDialogClose()
      studyOpen.value = true
      return
    }
    await app.clearUnreadyProtections(ids, true)
    sheet.value = null
    startError.value = null
    await waitForDialogClose()
    busy.value = false
    await runStartItem(item)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!isCancelledStartError(message)) {
      startError.value = { message, kind: classifyStartError(message) }
      sheet.value = 'startError'
    }
  } finally {
    busy.value = false
  }
}

function actualDuration(r: FocusRecord) {
  return r.segments.reduce(
    (sum, s) =>
      sum +
      intervalBuckets(s.start, s.end, r.timeZone)
        .filter((b) => b.date === day.value)
        .reduce((value, b) => value + b.ms, 0),
    0,
  )
}

function timeLabel(o: Occurrence) {
  return `${o.start.slice(0, 10) === day.value ? o.start.slice(11, 16) : '前一天'} — ${o.end.slice(0, 10) === day.value ? o.end.slice(11, 16) : '次日 ' + o.end.slice(11, 16)}`
}

function coursePosition(o: Occurrence) {
  const periods = currentSemester.value?.periods || [],
    first = periods.findIndex((p) => o.start.slice(11, 16) <= p.end),
    last = periods.findIndex((p) => o.end.slice(11, 16) <= p.end)
  const column = weekday(o.start.slice(0, 10)),
    row = first < 0 ? Math.max(0, periods.length - 1) : first,
    end = last < 0 ? Math.max(row + 1, periods.length) : last + 1
  return {
    gridColumn: String(column + 1),
    gridRow: `${row + 2} / span ${Math.max(1, end - row)}`,
    background: o.color + '16',
    border: `1px solid ${o.color}33`,
    color: '#222',
  }
}
</script>
<template>
  <div class="page calendar-page">
    <header v-if="tab === 'schedule'" class="page-header">
      <h1>日历</h1>
      <div class="actions">
        <button
          type="button"
          class="today-jump"
          :class="{ highlight: day !== dateKey() }"
          aria-label="回到今天"
          @click="day = dateKey()"
        >
          今天
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label="日历视图与设置"
          aria-haspopup="dialog"
          :aria-expanded="sheet === 'menu'"
          @click="openMenu"
        >
          <Icon name="more" />
        </button>
      </div>
    </header>
    <header v-else class="page-header timetable-header">
      <button type="button" class="detail-back timetable-back" @click="tab = 'schedule'">
        <Icon name="left" :size="16" /><span>日程</span>
      </button>
      <div v-if="currentSemester" class="week-stepper">
        <button type="button" class="icon-button" aria-label="上一教学周" @click="changeWeek(-1)">
          <Icon name="left" :size="18" />
        </button>
        <span class="week-stepper-label">
          {{
            currentWeek >= 1 && currentWeek <= currentSemester.weeks
              ? '第 ' + currentWeek + ' 周'
              : '学期范围外'
          }}
        </span>
        <button type="button" class="icon-button" aria-label="下一教学周" @click="changeWeek(1)">
          <Icon name="right" :size="18" />
        </button>
      </div>
      <h1 v-else class="timetable-empty-title">课表</h1>
      <div class="actions">
        <button
          type="button"
          class="icon-button"
          :class="timetableHasEmptyPrimary ? 'soft' : 'primary'"
          aria-label="添加课程"
          @click="openCourse()"
        >
          <Icon name="plus" />
        </button>
        <button
          type="button"
          class="icon-button"
          aria-label="日历视图与设置"
          aria-haspopup="dialog"
          :aria-expanded="sheet === 'menu'"
          @click="openMenu"
        >
          <Icon name="more" />
        </button>
      </div>
    </header>

    <template v-if="tab === 'schedule'">
      <div class="week-strip">
        <button
          v-for="date in week"
          :key="date"
          type="button"
          :class="{ selected: date === day, today: date === dateKey() }"
          :aria-pressed="date === day"
          :aria-current="date === dateKey() ? 'date' : undefined"
          @click="day = date"
        >
          <span>{{ weekdayName(date) }}</span>
          <strong class="number">{{ Number(date.slice(8)) }}</strong>
          <i :class="{ present: occurrences(app.data, date, date).length > 0 }" />
        </button>
      </div>

      <template v-if="monthOpen">
        <div class="calendar-month">
          <div class="month-nav">
            <button type="button" class="icon-button" aria-label="上一月" @click="changeMonth(-1)">
              <Icon name="left" :size="18" />
            </button>
            <span class="month-title">{{ monthTitle }}</span>
            <button type="button" class="icon-button" aria-label="下一月" @click="changeMonth(1)">
              <Icon name="right" :size="18" />
            </button>
          </div>
          <button type="button" class="text-button month-collapse" @click="monthOpen = false">
            收起
          </button>
        </div>
        <div class="month-grid">
          <span v-for="name in weekdays" :key="name">{{ name.slice(1) }}</span>
          <button
            v-for="date in monthDays"
            :key="date"
            type="button"
            :class="{ active: date === day, outside: date.slice(0, 7) !== day.slice(0, 7) }"
            :aria-pressed="date === day"
            :aria-current="date === dateKey() ? 'date' : undefined"
            @click="selectDay(date)"
          >
            {{ Number(date.slice(8)) }}
          </button>
        </div>
      </template>

      <div class="timeline-header">
        <h2>
          {{ readableDate(day) }} <span>{{ weekdayName(day) }}</span>
        </h2>
        <div class="timeline-controls">
          <button
            type="button"
            class="icon-button"
            :class="scheduleHasEmptyPrimary ? 'soft' : 'primary'"
            aria-label="添加日程"
            @click="newEvent()"
          >
            <Icon name="plus" />
          </button>
          <div class="mini-switch">
            <button
              type="button"
              :class="{ active: view === 'plan' }"
              :aria-pressed="view === 'plan'"
              @click="view = 'plan'"
            >
              计划
            </button>
            <button
              type="button"
              :class="{ active: view === 'actual' }"
              :aria-pressed="view === 'actual'"
              @click="view = 'actual'"
            >
              实际
            </button>
          </div>
        </div>
      </div>

      <template v-if="view === 'plan'">
        <div v-if="allDay.length" class="all-day-list">
          <button v-for="o in allDay" :key="o.id" type="button" @click="showDetail(o)">
            <span>全天</span>{{ o.title }}
          </button>
        </div>
        <div class="timeline">
          <div v-for="o in timed" :key="o.id" class="timeline-entry">
            <div class="timeline-dot" :style="{ borderColor: o.color }" />
            <div class="timeline-time">{{ timeLabel(o) }}</div>
            <button type="button" class="timeline-card" @click="showDetail(o)">
              <div class="row between">
                <h3>{{ o.title }}</h3>
                <Icon v-if="o.kind === 'course'" name="book" :size="16" />
              </div>
              <p v-if="o.note">{{ o.note }}</p>
              <span v-if="o.itemId" class="linked-label">已关联专注待办</span>
            </button>
          </div>
        </div>
        <div v-if="!dayItems.length" class="empty calendar-empty">
          <div class="empty-mark"><Icon name="calendar" :size="31" /></div>
          <h2>今天，留一点时间给自己</h2>
          <p>安排一段学习，也安排一段休息。</p>
          <button type="button" class="primary" @click="newEvent">
            <Icon name="plus" :size="17" />添加日程
          </button>
        </div>
      </template>

      <template v-else>
        <div class="timeline">
          <div v-for="record in actualRecords" :key="record.id" class="timeline-entry">
            <div class="timeline-dot" />
            <div class="timeline-time">
              {{ zoneTime(record.startedAt, record.timeZone) }} —
              {{ zoneTime(record.endedAt, record.timeZone) }}
              <small>{{ duration(actualDuration(record)) }}</small>
            </div>
            <div class="timeline-card actual-card">
              <h3>{{ record.title }}</h3>
              <p>
                {{ record.themeName }} ·
                {{
                  record.status === 'completed'
                    ? '正常结束'
                    : record.status === 'early'
                      ? '提前结束'
                      : '中断'
                }}
              </p>
            </div>
          </div>
        </div>
        <div v-if="!actualRecords.length" class="empty calendar-empty">
          <div class="empty-mark"><Icon name="clock" :size="31" /></div>
          <h2>今天还没有专注记录</h2>
          <p>计划是起点，行动会留下时间。</p>
          <button type="button" class="secondary" @click="router.push('/tasks')">去专注</button>
        </div>
      </template>
    </template>

    <template v-else>
      <template v-if="currentSemester">
        <p class="timetable-range">
          {{ currentSemester.name }} · {{ readableDate(week[0]!) }} — {{ readableDate(week[6]!) }}
        </p>
        <div class="course-grid-scroll">
          <div
            class="course-grid"
            :style="{ gridTemplateRows: '48px repeat(' + slotCount + ', 76px)' }"
          >
            <div class="course-grid-corner">节次</div>
            <div
              v-for="date in week"
              :key="date"
              class="course-day"
              :class="{ today: date === dateKey() }"
            >
              <span>{{ weekdayName(date).slice(1) }}</span>
              <strong>{{ Number(date.slice(8)) }}</strong>
            </div>
            <template v-for="period in currentSemester.periods" :key="period.index">
              <div
                class="period-label"
                :style="{ gridColumn: '1', gridRow: String(period.index + 1) }"
              >
                <strong>{{ period.index }}</strong>
                <small>{{ period.start }}</small>
                <small>{{ period.end }}</small>
              </div>
              <div
                v-for="d in 7"
                :key="d"
                class="course-cell"
                :style="{ gridColumn: String(d + 1), gridRow: String(period.index + 1) }"
              />
            </template>
            <button
              v-for="o in weekCourses"
              :key="o.id"
              type="button"
              class="course-block"
              :style="coursePosition(o)"
              @click="showDetail(o)"
            >
              <strong>{{ o.title }}</strong>
              <small v-if="o.note">{{ o.note }}</small>
            </button>
          </div>
        </div>
        <button type="button" class="add-course secondary wide" @click="openCourse()">
          <Icon name="plus" :size="17" />添加课程
        </button>
      </template>
      <div v-else class="empty calendar-empty">
        <div class="empty-mark"><Icon name="book" :size="31" /></div>
        <h2>开始一个新的学期</h2>
        <p>设置学期和上课时间，课程就会按周排好。</p>
        <button type="button" class="primary" @click="openSemester()">设置学期</button>
      </div>
    </template>

    <Sheet
      :open="sheet !== null"
      :title="sheetTitle"
      :back-label="sheetBackLabel"
      :close-disabled="busy"
      @back="handleSheetBack"
      @close="closeSheet()"
    >
      <div v-if="sheet === 'menu'" class="stack">
        <div class="menu-list">
          <button
            type="button"
            class="menu-row"
            @click="
              tab = tab === 'schedule' ? 'timetable' : 'schedule';
              closeSheet()
            "
          >
            <span>{{ tab === 'schedule' ? '切换到课表视图' : '切换到日程视图' }}</span>
            <Icon name="right" :size="18" class="menu-chevron" />
          </button>
          <button
            v-if="tab === 'schedule'"
            type="button"
            class="menu-row"
            @click="
              monthOpen = !monthOpen;
              closeSheet()
            "
          >
            <span>{{ monthOpen ? `收起月历（${monthTitle}）` : `展开月历（${monthTitle}）` }}</span>
            <Icon name="right" :size="18" class="menu-chevron" />
          </button>
          <button type="button" class="menu-row" @click="openSemester(currentSemester, true)">
            <span>{{
              tab === 'timetable' && currentSemester ? '编辑学期与每日节次' : '学期与每日节次设置'
            }}</span>
            <Icon name="right" :size="18" class="menu-chevron" />
          </button>
          <button
            v-if="tab === 'timetable'"
            type="button"
            class="menu-row"
            @click="openSemester(undefined, true)"
          >
            <span>新建学期</span>
            <Icon name="right" :size="18" class="menu-chevron" />
          </button>
        </div>
        <div v-if="app.data.semesters.length > 1" class="menu-section">
          <p class="menu-section-title">切换当前学期</p>
          <div class="menu-list">
            <button
              v-for="semester in app.data.semesters"
              :key="semester.id"
              type="button"
              class="menu-row"
              :aria-pressed="semester.id === app.data.preferences.activeSemesterId"
              @click="selectSemesterById(semester.id)"
            >
              <span>{{ semester.name }}</span>
              <span
                v-if="semester.id === app.data.preferences.activeSemesterId"
                class="menu-active-tag"
              >
                当前
              </span>
            </button>
          </div>
        </div>
      </div>

      <form v-else-if="sheet === 'event'" @submit.prevent="submitEvent(false)">
        <label
          v-if="
            source && app.data.events.find((e) => e.id === source?.sourceId)?.repeat === 'weekly'
          "
        >
          修改范围
          <select v-model="scope" @change="changeScope">
            <option value="once">仅本次</option>
            <option value="all">整组日程</option>
          </select>
        </label>
        <label>
          日程名称
          <input
            v-model="eventForm.title"
            required
            maxlength="120"
            placeholder="例如：复习英语"
            autofocus
          />
        </label>
        <label v-if="!source || scope === 'all'" class="switch">
          <span>全天日程</span>
          <input v-model="eventForm.allDay" type="checkbox" />
        </label>
        <div v-if="eventForm.allDay" class="two-cols event-dates-grid">
          <label>
            开始日期
            <input
              :value="eventForm.start.slice(0, 10)"
              type="date"
              required
              @input="eventForm.start = ($event.target as HTMLInputElement).value + 'T00:00'"
            />
          </label>
          <label>
            最后一天
            <input
              :value="eventForm.end.slice(0, 10)"
              type="date"
              required
              @input="eventForm.end = ($event.target as HTMLInputElement).value + 'T23:59'"
            />
          </label>
        </div>
        <div v-else class="event-time-stack">
          <label>
            开始时间
            <input v-model="eventForm.start" type="datetime-local" required />
          </label>
          <label>
            结束时间
            <input v-model="eventForm.end" type="datetime-local" required />
          </label>
        </div>
        <template v-if="!source || scope === 'all'">
          <div class="two-cols">
            <label>
              重复
              <select v-model="eventForm.repeat">
                <option value="none">不重复</option>
                <option value="weekly">每周重复</option>
              </select>
            </label>
            <label>
              关联待办（选填）
              <select v-model="eventForm.itemId">
                <option :value="null">不关联</option>
                <option v-for="item in app.items" :key="item.id" :value="item.id">
                  {{ app.themes.find((t) => t.id === item.themeId)?.name }} · {{ item.title }}
                </option>
              </select>
            </label>
          </div>
          <fieldset v-if="eventForm.repeat === 'weekly'">
            <legend>重复日期</legend>
            <div class="weekday-checks">
              <label v-for="(name, i) in weekdays" :key="name">
                <input v-model="eventForm.weekdays" type="checkbox" :value="i + 1" />
                <span>{{ name.slice(1) }}</span>
              </label>
            </div>
          </fieldset>
          <details class="more-details">
            <summary>更多选项（提醒 · 备注 · 截止）</summary>
            <div class="details-body">
              <label v-if="eventForm.repeat === 'weekly'">
                截止日期（选填）
                <input v-model="eventForm.until" type="date" />
              </label>
              <label>
                提醒
                <select v-model="eventForm.reminderMinutes">
                  <option :value="null">不提醒</option>
                  <option :value="0">开始时</option>
                  <option :value="10">提前 10 分钟</option>
                  <option :value="30">提前 30 分钟</option>
                </select>
              </label>
              <label>
                备注（选填）
                <textarea v-model="eventForm.note" maxlength="1000" />
              </label>
            </div>
          </details>
        </template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div v-if="eventConflict" class="conflict-banner" role="alert">
          <p>与《{{ eventConflict }}》时间重叠</p>
          <div class="conflict-actions">
            <button type="button" class="secondary" :disabled="busy" @click="eventConflict = null">
              调整时间
            </button>
            <button type="button" class="primary" :disabled="busy" @click="submitEvent(true)">
              仍然保存
            </button>
          </div>
        </div>
        <button v-else class="primary wide" :disabled="busy">保存日程</button>
      </form>

      <div v-else-if="sheet === 'detail' && selected" class="stack">
        <h2>{{ selected.title }}</h2>
        <p class="detail-meta">
          {{
            selected.allDay
              ? '全天'
              : selected.start.replace('T', ' ') + ' — ' + selected.end.replace('T', ' ')
          }}<template v-if="selectedLinkedItem"> · 关联待办：{{ selectedLinkedItem.title }}</template>
        </p>
        <p v-if="selected.note">{{ selected.note }}</p>
        <button
          v-if="selected.itemId"
          type="button"
          class="primary wide"
          :disabled="busy"
          @click="startFromEvent"
        >
          <Icon name="play" :size="18" />开始关联待办的专注
        </button>
        <button
          v-if="selected.kind === 'event'"
          type="button"
          class="secondary wide"
          :disabled="busy"
          @click="editEvent(selected, true)"
        >
          编辑日程
        </button>
        <template v-else>
          <button type="button" class="secondary wide" :disabled="busy" @click="openAdjust">
            仅本次调课
          </button>
          <button
            type="button"
            class="secondary wide"
            :disabled="busy"
            @click="openCourse(app.data.courses.find((c) => c.id === selected?.sourceId), true)"
          >
            编辑整门课程
          </button>
        </template>
        <div class="detail-danger-zone">
          <button
            v-if="detailDeleteStep === 'idle'"
            type="button"
            class="text-button danger"
            :disabled="busy"
            @click="detailDeleteStep = 'choose'"
          >
            {{ selected.kind === 'course' ? '停课 / 删除' : '删除日程' }}
          </button>
          <div v-else class="inline-confirm-box">
            <p class="inline-confirm-hint">
              {{
                selected.kind === 'course'
                  ? '选择停课或删除范围：'
                  : isSelectedWeeklyEvent
                    ? '这是一组重复日程，请选择删除范围：'
                    : '确认删除这条日程吗？'
              }}
            </p>
            <div class="inline-confirm-actions">
              <template v-if="selected.kind === 'course'">
                <button
                  type="button"
                  class="text-button danger"
                  :disabled="busy"
                  @click="confirmDelete('once')"
                >
                  仅本次停课
                </button>
                <button
                  type="button"
                  class="text-button danger"
                  :disabled="busy"
                  @click="confirmDelete('all')"
                >
                  删除整组
                </button>
              </template>
              <template v-else-if="isSelectedWeeklyEvent">
                <button
                  type="button"
                  class="text-button danger"
                  :disabled="busy"
                  @click="confirmDelete('once')"
                >
                  删除本次
                </button>
                <button
                  type="button"
                  class="text-button danger"
                  :disabled="busy"
                  @click="confirmDelete('all')"
                >
                  删除整组
                </button>
              </template>
              <template v-else>
                <button
                  type="button"
                  class="text-button danger"
                  :disabled="busy"
                  @click="confirmDelete('all')"
                >
                  确认删除
                </button>
              </template>
              <button
                type="button"
                class="text-button"
                :disabled="busy"
                @click="detailDeleteStep = 'idle'"
              >
                取消
              </button>
            </div>
          </div>
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </div>

      <form v-else-if="sheet === 'semester'" @submit.prevent="execute(saveSemester)">
        <label>
          学期名称
          <input v-model="semesterForm.name" required maxlength="80" />
        </label>
        <label>
          第一教学周的周一
          <input v-model="semesterForm.startDate" type="date" required />
        </label>
        <label>
          教学周数
          <input v-model.number="semesterForm.weeks" type="number" min="1" max="104" required />
        </label>
        <details class="more-details">
          <summary>每日节次时间（共 {{ semesterForm.periods.length }} 节，点此展开）</summary>
          <div class="details-body">
            <div class="period-editor">
              <div
                v-for="period in semesterForm.periods"
                :key="period.index"
                class="period-editor-row"
              >
                <span>{{ period.index }}</span>
                <input
                  v-model="period.start"
                  type="time"
                  :aria-label="'第' + period.index + '节开始时间'"
                  required
                />
                <span>—</span>
                <input
                  v-model="period.end"
                  type="time"
                  :aria-label="'第' + period.index + '节结束时间'"
                  required
                />
              </div>
            </div>
            <div class="row">
              <button
                type="button"
                class="text-button"
                @click="
                  semesterForm.periods.push({
                    index: semesterForm.periods.length + 1,
                    start: '20:50',
                    end: '21:35',
                  })
                "
              >
                ＋ 添加节次
              </button>
              <button
                type="button"
                class="text-button"
                :disabled="semesterForm.periods.length <= 1"
                @click="semesterForm.periods.pop()"
              >
                移除末节
              </button>
            </div>
          </div>
        </details>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy">保存并设为当前学期</button>
      </form>

      <form
        v-else-if="sheet === 'course'"
        @submit.prevent="execute(() => app.saveCourse({ ...courseForm }))"
      >
        <label>
          课程名称
          <input
            v-model="courseForm.title"
            placeholder="例如：高等数学"
            maxlength="80"
            required
            autofocus
          />
        </label>
        <label>
          星期
          <select v-model.number="courseForm.weekday">
            <option v-for="(name, i) in weekdays" :key="name" :value="i + 1">{{ name }}</option>
          </select>
        </label>
        <div class="two-cols">
          <label>
            开始节次
            <select v-model.number="courseForm.firstPeriod">
              <option v-for="p in currentSemester?.periods" :key="p.index" :value="p.index">
                第 {{ p.index }} 节
              </option>
            </select>
          </label>
          <label>
            结束节次
            <select v-model.number="courseForm.lastPeriod">
              <option v-for="p in currentSemester?.periods" :key="p.index" :value="p.index">
                第 {{ p.index }} 节
              </option>
            </select>
          </label>
        </div>
        <div class="two-cols">
          <label>
            开始周
            <input v-model.number="courseForm.firstWeek" type="number" min="1" required />
          </label>
          <label>
            结束周
            <input
              v-model.number="courseForm.lastWeek"
              type="number"
              min="1"
              :max="currentSemester?.weeks"
              required
            />
          </label>
        </div>
        <details class="more-details">
          <summary>更多课程信息（单双周 · 教室 · 颜色 · 提醒）</summary>
          <div class="details-body">
            <label>
              上课周次
              <select v-model="courseForm.parity">
                <option value="all">每周</option>
                <option value="odd">单周</option>
                <option value="even">双周</option>
              </select>
            </label>
            <div class="two-cols">
              <label>教室（选填）<input v-model="courseForm.room" maxlength="80" /></label>
              <label>教师（选填）<input v-model="courseForm.teacher" maxlength="80" /></label>
            </div>
            <div class="row between">
              <label class="color-label">
                课程颜色
                <input v-model="courseForm.color" type="color" class="course-color-input" />
              </label>
              <label>
                提醒
                <select v-model="courseForm.reminderMinutes">
                  <option :value="null">不提醒</option>
                  <option :value="10">提前 10 分钟</option>
                  <option :value="0">上课时</option>
                </select>
              </label>
            </div>
          </div>
        </details>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy">保存课程</button>
      </form>

      <form
        v-else-if="sheet === 'adjust' && selected"
        @submit.prevent="execute(() => app.adjustCourse(selected!, adjust.start, adjust.end))"
      >
        <p>{{ selected.title }} · 原安排 {{ selected.sourceDate }}</p>
        <label>
          新的开始时间
          <input v-model="adjust.start" type="datetime-local" required />
        </label>
        <label>
          新的结束时间
          <input v-model="adjust.end" type="datetime-local" required />
        </label>
        <p class="field-help">只修改这一次课程，其他周保持不变。</p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy">确认本次调课</button>
      </form>

      <div v-else-if="sheet === 'startError' && startError" class="stack">
        <p class="notice" role="alert">{{ startError.message }}</p>
        <template v-if="startError.kind === 'recovery'">
          <button
            type="button"
            class="primary wide"
            :disabled="busy"
            @click="goRecoveryFromStartError"
          >
            前往故障恢复
          </button>
          <button type="button" class="secondary wide" :disabled="busy" @click="closeSheet()">
            取消
          </button>
        </template>
        <template v-else-if="startError.kind === 'protection'">
          <button
            type="button"
            class="primary wide"
            :disabled="busy"
            @click="openStudyFromStartError"
          >
            前往学霸模式处理
          </button>
          <button
            type="button"
            class="secondary wide"
            :disabled="busy"
            @click="clearUnreadyAndRetry"
          >
            关闭未就绪保护并开始
          </button>
          <button type="button" class="text-button" :disabled="busy" @click="closeSheet()">
            取消
          </button>
        </template>
        <template v-else>
          <button type="button" class="primary wide" :disabled="busy" @click="closeSheet()">
            知道了
          </button>
        </template>
      </div>
    </Sheet>

    <StudyModeSheet
      :open="studyOpen"
      initial-view="permissions"
      @close="studyOpen = false"
    />
  </div>
</template>
<style scoped>
.calendar-page :deep(.icon-button),
.calendar-page .icon-button,
.calendar-page .text-button {
  min-width: 48px;
  min-height: 48px;
}
.calendar-page .icon-button.primary {
  background: var(--accent);
  color: white;
}
.today-jump {
  min-width: 48px;
  min-height: 48px;
  padding: 0 14px;
  border-radius: 100px;
  background: var(--surface);
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.today-jump.highlight {
  color: var(--ink);
}
.event-time-stack {
  display: grid;
  gap: 14px;
}
.timetable-header {
  gap: 2px;
}
.timetable-header .actions {
  gap: 2px;
  flex-shrink: 0;
}
.timetable-back {
  min-width: 48px;
  min-height: 48px;
  padding: 0 4px 0 0;
  gap: 2px;
  flex-shrink: 0;
  font-size: 14px;
}
.timetable-empty-title {
  font-size: 18px;
  font-weight: 600;
}
.week-stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  flex: 1;
}
.week-stepper-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  min-width: 0;
}
.timetable-range {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 12px;
  text-align: center;
}
.calendar-month {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  margin: 12px 0 8px;
}
.month-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}
.month-title {
  font-size: 14px;
  font-weight: 600;
  min-width: 84px;
  text-align: center;
}
.month-collapse {
  font-size: 13px;
  padding: 0 12px;
}
.week-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(48px, 1fr));
  gap: 0;
  margin-inline: calc(var(--page-inline) * -1);
  padding-inline: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}
.week-strip button {
  padding: 8px 0 4px;
  min-width: 48px;
  min-height: 68px;
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.week-strip span {
  font-size: 12px;
  color: var(--muted);
}
.week-strip strong {
  font-size: 22px;
  line-height: 1;
}
.week-strip i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: transparent;
}
.week-strip i.present {
  background: var(--muted);
}
.week-strip button.selected {
  background: var(--ink);
  color: white;
}
.week-strip button.selected span {
  color: white;
}
.week-strip button.selected i.present {
  background: white;
}
.week-strip button.selected.today i.present {
  background: var(--accent);
}
.week-strip button.today:not(.selected) {
  background: var(--surface);
}
.week-strip button.today:not(.selected) span,
.week-strip button.today:not(.selected) strong {
  color: #c13a25;
}
@media (max-width: 350px) {
  .week-strip,
  .month-grid {
    grid-template-columns: repeat(7, minmax(0, 1fr));
    padding-inline: 4px;
  }
  .week-strip button,
  .month-grid button {
    min-width: 0;
  }
  .event-dates-grid {
    grid-template-columns: 1fr;
  }
}
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(48px, 1fr));
  gap: 0;
  margin: 8px calc(var(--page-inline) * -1) 16px;
  padding-inline: 10px;
}
.month-grid > span {
  text-align: center;
  font-size: 12px;
  color: var(--muted);
  padding: 8px 0;
}
.month-grid button {
  min-width: 48px;
  min-height: 48px;
  border: 2px solid transparent;
  background-clip: padding-box;
  border-radius: 14px;
  font-size: 13px;
}
.month-grid .active {
  background: var(--ink);
  color: white;
}
.month-grid .outside {
  color: var(--muted);
}
.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0;
}
.timeline-header h2 {
  font-size: 17px;
}
.timeline-header h2 span {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  margin-left: 4px;
}
.timeline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mini-switch {
  display: flex;
  gap: 3px;
  background: var(--surface);
  border-radius: 100px;
  padding: 3px;
}
.mini-switch button {
  padding: 6px 12px;
  min-height: 48px;
  min-width: 48px;
  border-radius: 100px;
  font-size: 12px;
  color: var(--muted-surface);
}
.mini-switch .active {
  background: white;
  color: var(--ink);
}
.timeline {
  padding-left: 13px;
}
.timeline-entry {
  position: relative;
  padding: 0 0 16px 24px;
  border-left: 1px dashed #d7d7db;
}
.timeline-entry:last-child {
  border-color: transparent;
}
.timeline-dot {
  position: absolute;
  left: -6px;
  top: 4px;
  width: 11px;
  height: 11px;
  border: 2px solid var(--muted);
  background: white;
  border-radius: 50%;
}
.timeline-time {
  font-family: Nunito, sans-serif;
  font-size: 17px;
  font-weight: 750;
  letter-spacing: 0.2px;
  margin-bottom: 12px;
}
.timeline-time small {
  float: right;
  font-family: inherit;
  font-size: 12px;
  font-weight: 400;
}
.timeline-card {
  padding: 14px;
  min-height: 48px;
  background: var(--surface);
  border-radius: var(--radius);
  width: 100%;
  text-align: left;
}
.timeline-card h3 {
  font-size: 15px;
  font-weight: 600;
}
.timeline-card p {
  font-size: 12px;
  color: var(--muted-surface);
  margin-top: 8px;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.linked-label {
  display: block;
  font-size: 12px;
  color: var(--muted-surface);
  margin-top: 10px;
}
.all-day-list {
  display: grid;
  gap: 8px;
  margin-bottom: 24px;
}
.all-day-list button {
  padding: 12px 15px;
  min-height: 48px;
  border-radius: var(--radius);
  background: var(--surface);
  font-size: 13px;
  text-align: left;
}
.all-day-list span {
  font-size: 12px;
  color: var(--muted-surface);
  margin-right: 14px;
}
.calendar-empty {
  padding-top: 12px;
  padding-bottom: 12px;
  gap: 12px;
}
.calendar-empty .empty-mark {
  width: 56px;
  height: 56px;
}
.calendar-empty h2 {
  font-size: 18px;
}
.course-grid-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.course-grid {
  display: grid;
  grid-template-columns: 44px repeat(7, minmax(64px, 1fr));
  gap: 4px;
  min-width: 520px;
  font-size: 12px;
}
.course-grid-corner {
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 12px;
}
.course-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
}
.course-day strong {
  font-size: 14px;
}
.course-day.today {
  color: #c13a25;
}
.period-label {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px;
  color: var(--muted);
}
.period-label strong {
  font-family: Nunito, sans-serif;
  font-size: 13px;
  color: var(--ink);
}
.period-label small {
  font-size: 12px;
  line-height: 1.2;
}
.course-cell {
  background: var(--surface);
  border-radius: 12px;
}
.course-block {
  border-radius: 12px;
  padding: 8px 6px;
  overflow: hidden;
  text-align: left;
  z-index: 1;
  align-self: stretch;
  min-width: 48px;
  min-height: 48px;
}
.course-block strong {
  font-size: 12px;
  display: block;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.course-block small {
  display: block;
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.35;
  color: inherit;
  overflow-wrap: anywhere;
}
.add-course {
  margin-top: 24px;
}
.menu-list {
  background: var(--surface);
  border-radius: var(--radius);
  overflow: hidden;
}
.menu-row {
  width: 100%;
  min-height: 48px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  font-size: 15px;
  color: var(--ink);
}
.menu-row + .menu-row {
  border-top: 1px solid var(--line);
}
.menu-chevron {
  color: var(--muted-surface);
  flex-shrink: 0;
}
.menu-section {
  display: grid;
  gap: 8px;
}
.menu-section-title {
  font-size: 13px;
  color: var(--muted);
  padding: 0 4px;
}
.menu-active-tag {
  font-size: 12px;
  color: var(--muted-surface);
}
.detail-meta {
  font-size: 14px;
  color: var(--muted);
}
.detail-danger-zone {
  padding-top: 8px;
  border-top: 1px solid var(--line);
  display: grid;
  justify-items: start;
}
.inline-confirm-box {
  width: 100%;
  padding: 12px 14px;
  background: var(--surface);
  border-radius: var(--radius);
  display: grid;
  gap: 8px;
}
.inline-confirm-hint {
  font-size: 13px;
  color: var(--muted-surface);
}
.inline-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.conflict-banner {
  padding: 12px 14px;
  background: var(--surface);
  border-radius: var(--radius);
  display: grid;
  gap: 10px;
}
.conflict-banner p {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.conflict-actions {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}
.conflict-actions button {
  min-height: 48px;
}
.more-details {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 0 14px;
}
.more-details summary {
  min-height: 48px;
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-surface);
  cursor: pointer;
}
.details-body {
  display: grid;
  gap: 12px;
  padding-bottom: 14px;
}
.color-label {
  gap: 8px;
}
.course-color-input {
  width: 48px;
  height: 48px;
  padding: 4px;
}
.weekday-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.weekday-checks label {
  position: relative;
  display: inline-flex;
  min-width: 48px;
  min-height: 48px;
  cursor: pointer;
  user-select: none;
}
.weekday-checks label:active span {
  opacity: 0.7;
}
.weekday-checks input {
  position: absolute;
  opacity: 0;
  inset: 0;
  width: 100%;
  height: 100%;
}
.weekday-checks span {
  display: grid;
  place-items: center;
  width: 100%;
  min-width: 48px;
  min-height: 48px;
  padding: 0 10px;
  background: var(--surface);
  border-radius: 12px;
  font-size: 13px;
  color: var(--muted-surface);
}
.weekday-checks input:checked + span {
  background: var(--ink);
  color: white;
}
.weekday-checks input:focus-visible + span {
  outline: 2px solid var(--focus);
}
.period-editor {
  display: grid;
  gap: 8px;
}
.period-editor-row {
  display: grid;
  grid-template-columns: 22px 1fr 14px 1fr;
  align-items: center;
  gap: 7px;
}
.period-editor-row > span {
  font-size: 12px;
  color: var(--muted-surface);
  text-align: center;
}
.period-editor-row input {
  padding: 8px;
  min-height: 48px;
  font-size: 13px;
}
</style>
