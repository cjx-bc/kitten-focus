<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useApp } from '../stores/app'
import { statistics } from '../domain/statistics'
import {
  dateKey,
  localDate,
  addDays,
  periodRange,
  duration,
  readableDate,
  zoneDate,
  zoneTime,
} from '../domain/dates'
import type { FocusRecord } from '../domain/model'
import Icon from '../components/Icon.vue'
import Sheet from '../components/Sheet.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import { useConfirmation } from '../components/useConfirmation'
import Chart from '../components/Chart.vue'
const { confirmation, confirm, resolveConfirmation } = useConfirmation()
const app = useApp(),
  period = ref('day'),
  anchor = ref(dateKey()),
  group = ref<'theme' | 'item'>('theme'),
  showRecords = ref(false),
  selected = ref<FocusRecord | null>(null)
const periods = [
  ['day', '日'],
  ['week', '周'],
  ['month', '月'],
  ['year', '年'],
  ['all', '累计'],
]
function isValidDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = localDate(value)
  return !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value
}
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}
const safeAnchor = computed(() => (isValidDateKey(anchor.value) ? anchor.value : dateKey()))
watch(anchor, (value) => {
  if (!isValidDateKey(value)) anchor.value = dateKey()
})
const range = computed(() => periodRange(period.value, safeAnchor.value)),
  stats = computed(() => statistics(app.data.records, ...range.value, group.value)),
  records = computed(() =>
    app.data.records
      .filter((r) => statistics([r], ...range.value).totalMs > 0)
      .sort((a, b) => b.startedAt - a.startedAt),
  )
const periodTitle = computed(() =>
  period.value === 'all'
    ? '全部专注'
    : period.value === 'day'
      ? readableDate(safeAnchor.value)
      : period.value === 'month'
        ? `${localDate(safeAnchor.value).getFullYear()}年${localDate(safeAnchor.value).getMonth() + 1}月`
        : period.value === 'year'
          ? `${safeAnchor.value.slice(0, 4)}年`
          : `${readableDate(range.value[0])} — ${readableDate(range.value[1])}`,
)
function changeDate(direction: number) {
  const d = localDate(safeAnchor.value)
  if (period.value === 'month') d.setMonth(d.getMonth() + direction, 1)
  else if (period.value === 'year') d.setFullYear(d.getFullYear() + direction)
  else d.setDate(d.getDate() + direction * (period.value === 'week' ? 7 : 1))
  anchor.value = dateKey(d)
}
const trend = computed(() => {
  if (period.value === 'day')
    return {
      labels: Array.from({ length: 24 }, (_, i) => (i % 4 === 0 ? `${i}时` : '')),
      values: stats.value.hours.map((ms) => ms / 60000),
    }
  if (period.value === 'year' || period.value === 'all') {
    const rows = new Map<string, number>()
    for (const [day, ms] of stats.value.daily) {
      const key = day.slice(0, 7)
      rows.set(key, (rows.get(key) || 0) + ms)
    }
    if (period.value === 'year')
      for (let m = 1; m <= 12; m++) {
        const key = `${safeAnchor.value.slice(0, 4)}-${String(m).padStart(2, '0')}`
        if (!rows.has(key)) rows.set(key, 0)
      }
    const sorted = [...rows].sort(([a], [b]) => a.localeCompare(b))
    return {
      labels: sorted.map(([date]) =>
        period.value === 'year' ? `${Number(date.slice(5))}月` : date.slice(2),
      ),
      values: sorted.map(([, ms]) => ms / 60000),
    }
  }
  const rows = new Map(stats.value.daily),
    labels: string[] = [],
    values: number[] = []
  for (let day = range.value[0], guard = 0; day <= range.value[1] && guard < 400; day = addDays(day, 1), guard++) {
    labels.push(String(Number(day.slice(8))))
    values.push((rows.get(day) || 0) / 60000)
  }
  return { labels, values }
})
const trendOption = computed(() => ({
  animation: false,
  tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => duration(Number(value) * 60000) },
  grid: { left: 40, right: 8, top: 20, bottom: 26 },
  xAxis: {
    type: 'category',
    data: trend.value.labels,
    axisLine: { lineStyle: { color: '#e5e5e5' } },
    axisTick: { show: false },
    axisLabel: { color: '#8e8e93', fontSize: 10 },
  },
  yAxis: {
    type: 'value',
    name: '分钟',
    nameTextStyle: { color: '#8e8e93', fontSize: 10 },
    splitLine: { lineStyle: { color: '#ededed', type: 'dashed' } },
    axisLabel: { color: '#8e8e93', fontSize: 10 },
  },
  series: [
    {
      type: 'bar',
      data: trend.value.values,
      barMaxWidth: 24,
      itemStyle: { color: '#222', borderRadius: [5, 5, 0, 0] },
    },
  ],
}))
const pieOption = computed(() => ({
  animation: false,
  tooltip: {
    trigger: 'item',
    formatter: (p: unknown) => {
      const row = p as { name: string; value: number; percent: number }
      return `${escapeHtml(String(row.name ?? ''))}<br/>${duration(row.value)} · ${row.percent}%`
    },
  },
  series: [
    {
      type: 'pie',
      radius: ['57%', '78%'],
      center: ['50%', '50%'],
      label: { show: false },
      itemStyle: { borderColor: '#fff', borderWidth: 4, borderRadius: 5 },
      data: stats.value.categories.map((c) => ({
        name: c.name,
        value: c.ms,
        itemStyle: { color: c.color },
      })),
    },
  ],
}))
const hourOption = computed(() => ({
  ...trendOption.value,
  xAxis: {
    ...trendOption.value.xAxis,
    data: Array.from({ length: 24 }, (_, i) => (i % 4 === 0 ? `${i}时` : '')),
  },
  series: [
    {
      type: 'bar',
      data: stats.value.hours.map((v) => v / 60000),
      barMaxWidth: 12,
      itemStyle: { color: '#77777c', borderRadius: [4, 4, 0, 0] },
    },
  ],
}))
const stateName = (r: FocusRecord) =>
  r.status === 'completed' ? '正常结束' : r.status === 'early' ? '提前结束' : '中断'
function showRecord(record: FocusRecord) {
  selected.value = record
  showRecords.value = false
}
async function remove(record: FocusRecord) {
  if (!(await confirm('删除这条专注记录？对应统计也会更新。'))) return
  await app.deleteRecord(record.id)
  selected.value = null
  app.notify('记录已删除')
}
</script>
<template>
  <div class="page stats-page">
    <ConfirmationDialog :request="confirmation" @resolve="resolveConfirmation" />
    <header class="page-header">
      <h1>统计</h1>
      <button class="icon-button" aria-label="查看专注记录" @click="showRecords = true">
        <Icon name="clock" />
      </button>
    </header>
    <div class="segmented period-tabs">
      <button
        v-for="[key, label] in periods"
        :key="key"
        type="button"
        :class="{ active: period === key }"
        :aria-pressed="period === key"
        @click="period = key!"
      >
        {{ label }}
      </button>
    </div>
    <div class="period-selector">
      <button
        class="icon-button"
        aria-label="上一个统计周期"
        :disabled="period === 'all'"
        @click="changeDate(-1)"
      >
        <Icon name="left" :size="19" /></button
      ><label
        ><span>{{ periodTitle }}</span
        ><input
          v-model="anchor"
          type="date"
          aria-label="选择统计日期"
          :disabled="period === 'all'" /></label
      ><button
        class="icon-button"
        aria-label="下一个统计周期"
        :disabled="period === 'all'"
        @click="changeDate(1)"
      >
        <Icon name="right" :size="19" />
      </button>
    </div>
    <section class="stats-overview card">
      <h2>
        {{
          period === 'all'
            ? '累计'
            : period === 'day'
              ? '今日'
              : period === 'week'
                ? '本周'
                : period === 'month'
                  ? '本月'
                  : '本年'
        }}概览
      </h2>
      <div class="overview-grid">
        <div class="main-metric">
          <span>专注时长</span><strong class="number">{{ duration(stats.totalMs) }}</strong>
        </div>
        <div>
          <span>专注天数</span><strong class="number">{{ stats.days }}<small>天</small></strong>
        </div>
        <div>
          <span>专注次数</span><strong class="number">{{ stats.count }}<small>次</small></strong>
        </div>
        <div>
          <span>平均每次时长</span
          ><strong class="number">{{
            stats.averageMs === null ? '—' : duration(stats.averageMs)
          }}</strong>
        </div>
      </div>
    </section>
    <section class="stats-card">
      <div class="row between">
        <h2>专注趋势</h2>
        <span class="muted chart-caption">{{ periodTitle }}</span>
      </div>
      <Chart :option="trendOption" label="专注时长趋势柱状图" :height="205" />
      <p v-if="!stats.totalMs" class="chart-empty">完成一次专注，看看时间留下的痕迹。</p>
    </section>
    <section class="stats-card">
      <div class="row between">
        <h2>专注分布</h2>
        <div class="mini-distribution">
          <button type="button" :class="{ active: group === 'theme' }" :aria-pressed="group === 'theme'" @click="group = 'theme'">主题</button
          ><button type="button" :class="{ active: group === 'item' }" :aria-pressed="group === 'item'" @click="group = 'item'">待办</button>
        </div>
      </div>
      <div v-if="stats.totalMs" class="pie-area">
        <Chart :option="pieOption" label="各主题专注时长占比" :height="200" />
        <div class="pie-center">
          <span class="number">{{ stats.categories.length }}</span><small>个专注方向</small>
        </div>
      </div>
      <div v-else class="no-distribution">
        <span class="empty-ring" /><span>还没有专注记录</span>
      </div>
      <div class="legend-list">
        <div v-for="row in stats.categories" :key="row.id" class="legend-row">
          <span class="row"><i :style="{ background: row.color }" />{{ row.name }}</span
          ><span
            ><strong>{{ duration(row.ms) }}</strong
            ><small>{{ ((row.ms / stats.totalMs) * 100).toFixed(1) }}%</small></span
          >
        </div>
      </div>
    </section>
    <section class="stats-card">
      <h2>时段分布</h2>
      <Chart :option="hourOption" label="一天24小时中的实际专注时长分布" :height="190" />
    </section>
    <button class="secondary wide" @click="showRecords = true">
      <Icon name="clock" :size="18" />查看专注记录
    </button>
    <Sheet :open="showRecords" title="专注记录" @close="showRecords = false"
      ><template v-if="showRecords"><div v-if="!records.length" class="empty">
        <Icon name="clock" :size="32" />
        <p>这个时间范围还没有专注记录。</p>
      </div>
      <div class="record-list">
        <button
          v-for="record in records"
          :key="record.id"
          class="record"
          @click="showRecord(record)"
        >
          <div>
            <h3>{{ record.title }}</h3>
            <p>{{ zoneDate(record.startedAt, record.timeZone) }} · {{ record.themeName }}</p>
          </div>
          <span class="number">{{ duration(record.durationMs) }}</span>
        </button>
      </div></template></Sheet
    >
    <Sheet :open="!!selected" title="专注详情" @close="selected = null"
      ><div v-if="selected" class="stack">
        <h2>{{ selected.title }}</h2>
        <p class="muted">{{ selected.themeName }} · {{ stateName(selected) }}</p>
        <div class="card result-summary">
          <strong class="number">{{ duration(selected.durationMs) }}</strong><small>实际专注</small>
        </div>
        <p>
          {{ zoneDate(selected.startedAt, selected.timeZone) }}<br />{{
            zoneTime(selected.startedAt, selected.timeZone)
          }}
          — {{ zoneTime(selected.endedAt, selected.timeZone) }}
        </p>
        <p class="muted">
          暂停 {{ duration(selected.pausedMs) }} ·
          {{ selected.mode === 'countdown' ? '倒计时' : '正计时' }}
        </p>
        <button class="text-button danger" @click="remove(selected)">删除记录</button>
      </div></Sheet
    >
  </div>
</template>
<style scoped>
.mini-distribution {
  display: flex;
  gap: 6px;
  font-size: 11px;
}
.mini-distribution button {
  min-height: 44px;
  min-width: 44px;
  padding: 0 8px;
  color: var(--muted);
}
.mini-distribution .active {
  color: var(--ink);
  font-weight: 700;
}
.period-tabs {
  margin-bottom: 12px;
}
.period-selector {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.period-selector > label {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  min-height: 45px;
  border-radius: 12px;
  text-align: center;
  flex: 1;
  user-select: none;
  transition: opacity 120ms ease;
}
.period-selector > label:active {
  opacity: 0.65;
}
.period-selector > label:has(input:focus-visible) {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.period-selector input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.stats-overview {
  padding: 16px;
  background: #f7f7f7;
  margin-bottom: 16px;
}
.stats-overview h2,
.stats-card h2 {
  font-size: 18px;
}
.overview-grid {
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 16px 14px;
  margin-top: 16px;
}
.overview-grid > div > span {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
.overview-grid strong {
  display: block;
  font-size: 28px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.overview-grid .main-metric strong {
  font-size: 31px;
}
.overview-grid strong small {
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0;
  margin-left: 4px;
}
.stats-card {
  padding: 16px 0;
  border-top: 1px solid var(--line);
}
.chart-caption {
  font-size: 11px;
}
.chart-empty {
  font-size: 12px;
  text-align: center;
  color: var(--muted);
  margin-top: 8px;
}
.pie-area {
  position: relative;
}
.pie-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}
.pie-center .number {
  font-size: 32px;
}
.pie-center small {
  font-size: 10px;
}
.legend-list {
  display: grid;
  gap: 16px;
  margin-top: 10px;
}
.legend-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  gap: 12px;
}
.legend-row i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.legend-row .row {
  gap: 8px;
}
.legend-row > span:last-child {
  display: flex;
  gap: 12px;
}
.legend-row strong {
  font-weight: 500;
}
.legend-row small {
  min-width: 42px;
  text-align: right;
}
.no-distribution {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  padding: 32px 0;
  color: var(--muted);
  font-size: 12px;
}
.empty-ring {
  width: 112px;
  height: 112px;
  border: 18px solid #f1f1f1;
  border-radius: 50%;
}
.result-summary {
  text-align: center;
  display: grid;
  gap: 6px;
}
.result-summary strong {
  font-size: 38px;
}
</style>
