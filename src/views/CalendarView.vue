<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import { useConfirmation } from '../components/useConfirmation'
import { useApp } from '../stores/app'
import type { CalendarEvent, Semester, Course, Occurrence, FocusRecord } from '../domain/model'
import { uid, defaultPeriods } from '../domain/model'
import { findEventConflict, occurrences, semesterWeek, validateEvent } from '../domain/calendar'
import {
  dateKey,
  weekStart,
  addDays,
  localDate,
  readableDate,
  weekdayName,
  localInput,
  zoneTime,
  duration,
  weekday,
  zoneDate,
  intervalBuckets,
} from '../domain/dates'
import Icon from '../components/Icon.vue'
import Sheet from '../components/Sheet.vue'
const { confirmation, confirm, resolveConfirmation } = useConfirmation()
const app = useApp(),
  router = useRouter(),
  tab = ref<'schedule' | 'timetable'>('schedule'),
  view = ref<'plan' | 'actual'>('plan'),
  day = ref(dateKey()),
  monthOpen = ref(false)
const sheet = ref<'event' | 'detail' | 'semester' | 'course' | 'adjust' | null>(null),
  error = ref(''),
  busy = ref(false),
  selected = ref<Occurrence | null>(null),
  source = ref<Occurrence | undefined>(),
  scope = ref<'once' | 'all'>('all')
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
function clearError() {
  error.value = ''
}
async function execute(fn: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await fn()
    sheet.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
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
function newEvent() {
  source.value = undefined
  scope.value = 'all'
  const start = new Date(`${day.value}T09:00:00`)
  Object.assign(eventForm, {
    id: uid(),
    title: '',
    start: localInput(start),
    end: localInput(start.getTime() + 3600000),
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
function editEvent(o: Occurrence) {
  const event = app.data.events.find((e) => e.id === o.sourceId)
  if (!event) return
  source.value = o
  scope.value = event.repeat === 'weekly' ? 'once' : 'all'
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
async function saveEvent() {
  const payload = structuredClone({ ...eventForm, weekdays: [...eventForm.weekdays] })
  payload.title = payload.title.trim()
  if (scope.value === 'once') payload.repeat = 'none'
  if (payload.repeat === 'none') payload.until = ''
  if (payload.allDay) {
    payload.start = `${payload.start.slice(0, 10)}T00:00`
    payload.end = `${addDays(payload.end.slice(0, 10), 1)}T00:00`
  }
  validateEvent(payload)
  const conflict = findEventConflict(app.data, payload, scope.value === 'once' ? source.value?.id : undefined)
  if (conflict && !(await confirm(`与“${conflict.title}”时间重叠，仍然保存吗？`, {
    title: '时间有重叠', confirmLabel: '仍然保存', danger: false,
  }))) {
    throw new Error('可以调整时间后再保存，刚才填写的内容已保留')
  }
  await app.saveEvent(payload, source.value, scope.value)
}
function showDetail(o: Occurrence) {
  selected.value = o
  clearError()
  sheet.value = 'detail'
}
async function deleteSelected(which: 'once' | 'all') {
  const occurrence = selected.value
  if (!occurrence) return
  if (!(await confirm(which === 'all' ? '删除整组安排？' : '删除这一次安排？'))) return
  await execute(() => app.removeOccurrence(occurrence, which))
}
function openSemester(semester?: Semester) {
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
function openCourse(course?: Course) {
  if (!currentSemester.value) {
    openSemester()
    return
  }
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
async function selectSemester(event: Event) {
  const id = (event.target as HTMLSelectElement).value
  await app.mutate((d) => (d.preferences.activeSemesterId = id))
  const semester = app.data.semesters.find((s) => s.id === id)
  if (semester) day.value = semester.startDate
}
function openAdjust() {
  if (!selected.value) return
  adjust.start = selected.value.start
  adjust.end = selected.value.end
  clearError()
  sheet.value = 'adjust'
}
async function startFromEvent() {
  if (busy.value || !selected.value?.itemId) return
  const item = app.items.find((i) => i.id === selected.value!.itemId)
  if (!item) return
  busy.value = true
  error.value = ''
  try {
    await app.start(item)
    sheet.value = null
    await router.push('/focus')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message !== '已取消开始专注') error.value = message
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
    borderLeft: `3px solid ${o.color}`,
    color: '#222',
  }
}
</script>
<template>
  <div class="page calendar-page">
    <ConfirmationDialog :request="confirmation" @resolve="resolveConfirmation" />
    <header class="page-header">
      <h1>日历</h1>
      <div class="actions">
        <button class="icon-button" aria-label="回到今天" @click="day = dateKey()">
          <Icon name="calendar" /></button
        ><button
          class="icon-button soft"
          :aria-label="tab === 'timetable' ? '添加课程' : '添加日程'"
          @click="tab === 'timetable' ? openCourse() : newEvent()"
        >
          <Icon name="plus" />
        </button>
      </div>
    </header>
    <div class="segmented calendar-tabs">
      <button type="button" :class="{ active: tab === 'schedule' }" :aria-pressed="tab === 'schedule'" @click="tab = 'schedule'">日程</button
      ><button type="button" :class="{ active: tab === 'timetable' }" :aria-pressed="tab === 'timetable'" @click="tab = 'timetable'">课表</button>
    </div>
    <template v-if="tab === 'schedule'"
      ><div class="calendar-month">
        <button
          class="icon-button small"
          aria-label="上周或上月"
          @click="monthOpen ? changeMonth(-1) : changeWeek(-1)"
        >
          <Icon name="left" :size="18" /></button
        ><button class="row" :aria-expanded="monthOpen" @click="monthOpen = !monthOpen">
          {{ monthTitle }}<Icon name="down" :size="14" /></button
        ><button
          class="icon-button small"
          aria-label="下周或下月"
          @click="monthOpen ? changeMonth(1) : changeWeek(1)"
        >
          <Icon name="right" :size="18" />
        </button>
      </div>
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
          <span>{{ weekdayName(date) }}</span><strong class="number">{{
            Number(date.slice(8))
          }}</strong
          ><i :class="{ present: occurrences(app.data, date, date).length > 0 }" />
        </button>
      </div>
      <div v-if="monthOpen" class="month-grid">
        <span v-for="name in weekdays" :key="name">{{ name.slice(1) }}</span><button
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
      <div class="timeline-header">
        <h2>
          {{ readableDate(day) }} <span>{{ weekdayName(day) }}</span>
        </h2>
        <div class="mini-switch">
          <button type="button" :class="{ active: view === 'plan' }" :aria-pressed="view === 'plan'" @click="view = 'plan'">计划</button
          ><button type="button" :class="{ active: view === 'actual' }" :aria-pressed="view === 'actual'" @click="view = 'actual'">实际</button>
        </div>
      </div>
      <template v-if="view === 'plan'"
        ><div v-if="allDay.length" class="all-day-list">
          <button v-for="o in allDay" :key="o.id" @click="showDetail(o)">
            <span>全天</span>{{ o.title }}
          </button>
        </div>
        <div class="timeline">
          <div v-for="o in timed" :key="o.id" class="timeline-entry">
            <div class="timeline-dot" :style="{ borderColor: o.color }" />
            <div class="timeline-time">{{ timeLabel(o) }}</div>
            <button class="timeline-card" @click="showDetail(o)">
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
          <button class="primary" @click="newEvent"><Icon name="plus" :size="17" />添加日程</button>
        </div></template
      >
      <template v-else
        ><div class="timeline">
          <div v-for="record in actualRecords" :key="record.id" class="timeline-entry">
            <div class="timeline-dot" />
            <div class="timeline-time">
              {{ zoneTime(record.startedAt, record.timeZone) }} —
              {{ zoneTime(record.endedAt, record.timeZone)
              }}<small>{{ duration(actualDuration(record)) }}</small>
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
          <button class="secondary" @click="router.push('/tasks')">去专注</button>
        </div></template
      ></template
    >
    <template v-else
      ><div v-if="app.data.semesters.length" class="semester-toolbar">
        <select
          :value="app.data.preferences.activeSemesterId"
          aria-label="选择学期"
          @change="selectSemester"
        >
          <option v-for="semester in app.data.semesters" :key="semester.id" :value="semester.id">
            {{ semester.name }}
          </option></select
        ><button
          class="icon-button"
          aria-label="编辑学期和节次"
          @click="openSemester(currentSemester)"
        >
          <Icon name="settings" :size="20" /></button
        ><button class="icon-button" aria-label="新建学期" @click="openSemester()">
          <Icon name="plus" :size="20" />
        </button>
      </div>
      <template v-if="currentSemester"
        ><div class="course-week-nav">
          <button class="icon-button" aria-label="上一教学周" @click="changeWeek(-1)">
            <Icon name="left" :size="18" /></button
          ><span
            >{{
              currentWeek >= 1 && currentWeek <= currentSemester.weeks
                ? '第 ' + currentWeek + ' 周'
                : '学期范围外'
            }}<small>{{ readableDate(week[0]!) }} — {{ readableDate(week[6]!) }}</small></span
          ><button class="icon-button" aria-label="下一教学周" @click="changeWeek(1)">
            <Icon name="right" :size="18" />
          </button>
        </div>
        <div
          class="course-grid"
          :style="{ gridTemplateRows: '42px repeat(' + slotCount + ', 72px)' }"
        >
          <div class="course-grid-corner">节次</div>
          <div
            v-for="date in week"
            :key="date"
            class="course-day"
            :class="{ today: date === dateKey() }"
          >
            <span>{{ weekdayName(date).slice(1) }}</span><strong>{{
              Number(date.slice(8))
            }}</strong>
          </div>
          <template v-for="period in currentSemester.periods" :key="period.index"
            ><div
              class="period-label"
              :style="{ gridColumn: '1', gridRow: String(period.index + 1) }"
            >
              <strong>{{ period.index }}</strong><small>{{ period.start }}</small
              ><small>{{ period.end }}</small>
            </div>
            <div
              v-for="d in 7"
              :key="d"
              class="course-cell"
              :style="{ gridColumn: String(d + 1), gridRow: String(period.index + 1) }" /></template
          ><button
            v-for="o in weekCourses"
            :key="o.id"
            class="course-block"
            :style="coursePosition(o)"
            @click="showDetail(o)"
          >
            <strong>{{ o.title }}</strong><small>{{ o.note }}</small>
          </button>
        </div>
        <button class="add-course secondary wide" @click="openCourse()">
          <Icon name="plus" :size="17" />添加课程
        </button></template
      >
      <div v-else class="empty calendar-empty">
        <div class="empty-mark"><Icon name="book" :size="31" /></div>
        <h2>开始一个新的学期</h2>
        <p>设置学期和上课时间，课程就会按周排好。</p>
        <button class="primary" @click="openSemester()">设置学期</button>
      </div></template
    >
    <Sheet v-if="sheet === 'event'" :title="source ? '编辑日程' : '添加日程'" :close-disabled="busy" @close="!busy && (sheet = null)"
      ><form @submit.prevent="execute(saveEvent)">
        <label
          v-if="
            source && app.data.events.find((e) => e.id === source?.sourceId)?.repeat === 'weekly'
          "
          >修改范围<select v-model="scope" @change="changeScope">
            <option value="once">仅本次</option>
            <option value="all">整组日程</option>
          </select></label
        ><label
          >日程名称<input
            v-model="eventForm.title"
            required
            maxlength="120"
            placeholder="例如：复习英语"
            autofocus /></label
        ><label v-if="!source || scope === 'all'" class="switch"
          ><span>全天日程</span><input v-model="eventForm.allDay" type="checkbox"
        /></label>
        <div v-if="eventForm.allDay" class="two-cols">
          <label
            >开始日期<input
              :value="eventForm.start.slice(0, 10)"
              type="date"
              required
              @input="
                eventForm.start = ($event.target as HTMLInputElement).value + 'T00:00'
              " /></label
          ><label
            >最后一天<input
              :value="eventForm.end.slice(0, 10)"
              type="date"
              required
              @input="eventForm.end = ($event.target as HTMLInputElement).value + 'T23:59'"
          /></label>
        </div>
        <template v-else
          ><label>开始时间<input v-model="eventForm.start" type="datetime-local" required /></label
          ><label
            >结束时间<input
              v-model="eventForm.end"
              type="datetime-local"
              required /></label></template
        ><template v-if="!source || scope === 'all'"
          ><label
            >重复<select v-model="eventForm.repeat">
              <option value="none">不重复</option>
              <option value="weekly">每周重复</option>
            </select></label
          ><template v-if="eventForm.repeat === 'weekly'"
            ><fieldset>
              <legend>重复日期</legend>
              <div class="weekday-checks">
                <label v-for="(name, i) in weekdays" :key="name"
                  ><input v-model="eventForm.weekdays" type="checkbox" :value="i + 1" /><span>{{
                    name.slice(1)
                  }}</span></label
                >
              </div>
            </fieldset>
            <label>截止日期（选填）<input v-model="eventForm.until" type="date" /></label></template
          ><label
            >关联待办（选填）<select v-model="eventForm.itemId">
              <option :value="null">不关联</option>
              <option v-for="item in app.items" :key="item.id" :value="item.id">
                {{ app.themes.find((t) => t.id === item.themeId)?.name }} · {{ item.title }}
              </option>
            </select></label
          ><label
            >提醒<select v-model="eventForm.reminderMinutes">
              <option :value="null">不提醒</option>
              <option :value="0">开始时</option>
              <option :value="10">提前 10 分钟</option>
              <option :value="30">提前 30 分钟</option>
            </select></label
          ><label>备注（选填）<textarea v-model="eventForm.note" maxlength="1000" /></label
        ></template>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy">保存日程</button>
      </form></Sheet
    >
    <Sheet
      v-if="sheet === 'detail' && selected"
      :title="selected.kind === 'course' ? '课程详情' : '日程详情'"
      :close-disabled="busy"
      @close="!busy && (sheet = null)"
      ><div class="stack">
        <h2>{{ selected.title }}</h2>
        <p class="muted">
          {{
            selected.allDay
              ? '全天'
              : selected.start.replace('T', ' ') + ' — ' + selected.end.replace('T', ' ')
          }}
        </p>
        <p v-if="selected.note">{{ selected.note }}</p>
        <button v-if="selected.itemId" type="button" class="primary wide" :disabled="busy" @click="startFromEvent">
          <Icon name="play" :size="18" />开始关联待办的专注</button
        ><template v-if="selected.kind === 'event'"
          ><button type="button" class="secondary wide" :disabled="busy" @click="editEvent(selected)">编辑日程</button></template
        ><template v-else
          ><button type="button" class="secondary wide" :disabled="busy" @click="openAdjust">仅本次调课</button
          ><button
            type="button"
            class="secondary wide"
            :disabled="busy"
            @click="openCourse(app.data.courses.find((c) => c.id === selected?.sourceId))"
          >
            编辑整门课程
          </button></template
        >
        <div class="form-footer">
          <button type="button" class="text-button danger" :disabled="busy" @click="deleteSelected('once')">
            {{ selected.kind === 'course' ? '仅本次停课' : '删除本次' }}</button><button
            type="button"
            class="text-button danger"
            :disabled="busy"
            @click="deleteSelected('all')"
          >
            删除整组
          </button>
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      </div></Sheet
    >
    <Sheet
      v-if="sheet === 'semester'"
      :title="
        app.data.semesters.some((s) => s.id === semesterForm.id) ? '学期与上课时间' : '新建学期'
      "
      :close-disabled="busy"
      @close="!busy && (sheet = null)"
      ><form @submit.prevent="execute(saveSemester)">
        <label>学期名称<input v-model="semesterForm.name" required maxlength="80" /></label
        ><label
          >第一教学周的周一<input v-model="semesterForm.startDate" type="date" required /></label
        ><label
          >教学周数<input
            v-model.number="semesterForm.weeks"
            type="number"
            min="1"
            max="104"
            required
        /></label>
        <fieldset>
          <legend>每日节次时间</legend>
          <div class="period-editor">
            <div
              v-for="period in semesterForm.periods"
              :key="period.index"
              class="period-editor-row"
            >
              <span>{{ period.index }}</span><input
                v-model="period.start"
                type="time"
                :aria-label="'第' + period.index + '节开始时间'"
                required
              /><span>—</span
              ><input
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
              ＋ 添加节次</button
            ><button
              type="button"
              class="text-button"
              :disabled="semesterForm.periods.length <= 1"
              @click="semesterForm.periods.pop()"
            >
              移除末节
            </button>
          </div>
        </fieldset>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy">保存并设为当前学期</button>
      </form></Sheet
    >
    <Sheet
      v-if="sheet === 'course'"
      :title="app.data.courses.some((c) => c.id === courseForm.id) ? '编辑课程' : '添加课程'"
      :close-disabled="busy"
      @close="!busy && (sheet = null)"
      ><form @submit.prevent="execute(() => app.saveCourse({ ...courseForm }))">
        <label
          >课程名称<input
            v-model="courseForm.title"
            placeholder="例如：高等数学"
            maxlength="80"
            required
            autofocus /></label
        ><label
          >星期<select v-model.number="courseForm.weekday">
            <option v-for="(name, i) in weekdays" :key="name" :value="i + 1">{{ name }}</option>
          </select></label
        >
        <div class="two-cols">
          <label
            >开始节次<select v-model.number="courseForm.firstPeriod">
              <option v-for="p in currentSemester?.periods" :key="p.index" :value="p.index">
                第 {{ p.index }} 节
              </option>
            </select></label
          ><label
            >结束节次<select v-model.number="courseForm.lastPeriod">
              <option v-for="p in currentSemester?.periods" :key="p.index" :value="p.index">
                第 {{ p.index }} 节
              </option>
            </select></label
          >
        </div>
        <div class="two-cols">
          <label
            >开始周<input
              v-model.number="courseForm.firstWeek"
              type="number"
              min="1"
              required /></label
          ><label
            >结束周<input
              v-model.number="courseForm.lastWeek"
              type="number"
              min="1"
              :max="currentSemester?.weeks"
              required
          /></label>
        </div>
        <label
          >上课周次<select v-model="courseForm.parity">
            <option value="all">每周</option>
            <option value="odd">单周</option>
            <option value="even">双周</option>
          </select></label
        >
        <div class="two-cols">
          <label>教室（选填）<input v-model="courseForm.room" maxlength="80" /></label
          ><label>教师（选填）<input v-model="courseForm.teacher" maxlength="80" /></label>
        </div>
        <div class="row between">
          <label>课程颜色<input v-model="courseForm.color" type="color" /></label
          ><label
            >提醒<select v-model="courseForm.reminderMinutes">
              <option :value="null">不提醒</option>
              <option :value="10">提前 10 分钟</option>
              <option :value="0">上课时</option>
            </select></label
          >
        </div>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy">保存课程</button>
      </form></Sheet
    >
    <Sheet v-if="sheet === 'adjust' && selected" title="仅本次调课" :close-disabled="busy" @close="!busy && (sheet = null)"
      ><form @submit.prevent="execute(() => app.adjustCourse(selected!, adjust.start, adjust.end))">
        <p>{{ selected.title }} · 原安排 {{ selected.sourceDate }}</p>
        <label>新的开始时间<input v-model="adjust.start" type="datetime-local" required /></label
        ><label>新的结束时间<input v-model="adjust.end" type="datetime-local" required /></label>
        <p class="field-help">只修改这一次课程，其他周保持不变。</p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy">保存本次调课</button>
      </form></Sheet
    >
  </div>
</template>
<style scoped>
.calendar-tabs {
  margin-bottom: 12px;
}
.calendar-month {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  margin-bottom: 12px;
}
.calendar-month > .row {
  min-height: 44px;
  gap: 7px;
}
.week-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 5px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}
.week-strip button {
  padding: 11px 0 5px;
  min-height: 68px;
  border-radius: 17px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
}
.week-strip span {
  font-size: 10px;
  color: var(--muted);
}
.week-strip strong {
  font-size: 23px;
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
  background: var(--accent);
  color: white;
}
.week-strip button.selected span {
  color: white;
}
.week-strip button.selected i.present {
  background: white;
}
.week-strip button.today:not(.selected) {
  background: var(--surface);
}
.month-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin: 15px 0;
}
.month-grid > span {
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  padding: 8px 0;
}
.month-grid button {
  min-height: 42px;
  border-radius: 12px;
  font-size: 13px;
}
.month-grid .active {
  background: var(--ink);
  color: white;
}
.month-grid .outside {
  color: #737378;
}
.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 12px 0;
}
.timeline-header h2 {
  font-size: 17px;
}
.timeline-header h2 span {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  margin-left: 6px;
}
.mini-switch {
  display: flex;
  gap: 3px;
  background: var(--surface);
  border-radius: 100px;
  padding: 3px;
}
.mini-switch button {
  padding: 6px 14px;
  min-height: 44px;
  min-width: 44px;
  border-radius: 100px;
  font-size: 11px;
  color: var(--muted);
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
  border: 2px solid #737378;
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
  font-size: 11px;
  font-weight: 400;
}
.timeline-card {
  padding: 14px;
  background: var(--surface);
  border-radius: 17px;
  width: 100%;
  text-align: left;
}
.timeline-card h3 {
  font-size: 15px;
  font-weight: 600;
}
.timeline-card p {
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.linked-label {
  display: block;
  font-size: 10px;
  color: var(--muted);
  margin-top: 10px;
}
.all-day-list {
  display: grid;
  gap: 8px;
  margin-bottom: 24px;
}
.all-day-list button {
  padding: 12px 15px;
  border-radius: 12px;
  background: var(--surface);
  font-size: 13px;
  text-align: left;
}
.all-day-list span {
  font-size: 11px;
  color: var(--muted);
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
.semester-toolbar {
  display: flex;
  align-items: center;
  margin: 5px 0;
}
.semester-toolbar select {
  min-height: 44px;
  font-size: 13px;
}
.course-week-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 10px 0 17px;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
}
.course-week-nav small {
  display: block;
  font-size: 10px;
  font-weight: 400;
  margin-top: 6px;
}
.course-grid {
  display: grid;
  grid-template-columns: 30px repeat(7, minmax(0, 1fr));
  gap: 4px;
  font-size: 11px;
  margin-left: -10px;
  margin-right: -10px;
}
.course-grid-corner {
  display: grid;
  place-items: center;
  color: var(--muted);
  font-size: 9px;
}
.course-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 9px;
}
.course-day strong {
  font-size: 13px;
}
.course-day.today {
  color: var(--accent);
}
.period-label {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 4px;
  color: var(--muted);
}
.period-label strong {
  font-family: Nunito, sans-serif;
  font-size: 12px;
  color: var(--ink);
}
.period-label small {
  font-size: 7px;
}
.course-cell {
  background: #f8f8f8;
  border-radius: 7px;
}
.course-block {
  border-radius: 7px;
  padding: 8px 4px;
  overflow: hidden;
  text-align: left;
  z-index: 1;
  align-self: stretch;
  min-width: 0;
}
.course-block strong {
  font-size: 10px;
  display: block;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.course-block small {
  display: block;
  font-size: 8px;
  margin-top: 5px;
  line-height: 1.5;
  color: inherit;
  overflow-wrap: anywhere;
}
.add-course {
  margin-top: 24px;
}
.weekday-checks {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}
.weekday-checks label {
  position: relative;
  min-height: 44px;
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
  background: var(--surface);
  border-radius: 10px;
  min-height: 44px;
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
  grid-template-columns: 18px 1fr 12px 1fr;
  align-items: center;
  gap: 7px;
}
.period-editor-row > span {
  font-size: 12px;
  color: var(--muted);
}
.period-editor-row input {
  padding: 8px;
  font-size: 13px;
}
</style>
