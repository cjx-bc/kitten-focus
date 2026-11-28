<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useApp } from '../stores/app'
import { statistics, yearlyHeatmap } from '../domain/statistics'
import {
  dateKey,
  localDate,
  addDays,
  weekday,
  periodRange,
  duration,
  readableDate,
  zoneDate,
  zoneTime,
} from '../domain/dates'
import type { FocusRecord } from '../domain/model'
import { fillRoundedRect, strokeRoundedRect } from '../domain/canvasShapes'
import Icon from '../components/Icon.vue'
import Sheet from '../components/Sheet.vue'
import Chart from '../components/Chart.vue'

const app = useApp(),
  period = ref('day'),
  anchor = ref(dateKey()),
  metric = ref<'duration' | 'count'>('duration'),
  group = ref<'theme' | 'item'>('theme'),
  recordsOpen = ref(false),
  recordView = ref<'list' | 'detail'>('list'),
  selected = ref<FocusRecord | null>(null),
  confirmDelete = ref(false)

const heatmapCanvas = ref<HTMLCanvasElement | null>(null)
const selectedHeatmapIdx = ref(364)
const heatmapDragging = ref(false)

const periods = [
  ['day', '日'],
  ['week', '周'],
  ['month', '月'],
  ['year', '年'],
  ['all', '累计'],
]

const HEATMAP_COLORS = ['#EAEAEA', '#D1D1D6', '#8E8E93', '#222222', '#EF4E36'] as const

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
      .filter((r) => {
        const s = statistics([r], ...range.value)
        return s.totalMs > 0 || s.count > 0
      })
      .sort((a, b) => b.startedAt - a.startedAt),
  ),
  longestMs = computed(() => records.value.reduce((max, r) => Math.max(max, r.durationMs), 0))

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
  const byCount = metric.value === 'count'
  if (period.value === 'day') {
    return {
      labels: Array.from({ length: 24 }, (_, i) => (i % 4 === 0 ? `${i}时` : '')),
      values: byCount ? stats.value.hourCounts : stats.value.hours.map((ms) => ms / 60000),
    }
  }
  if (period.value === 'year' || period.value === 'all') {
    const source = byCount ? stats.value.dailyCounts : stats.value.daily
    const rows = new Map<string, number>()
    for (const [day, val] of source) {
      const key = day.slice(0, 7)
      rows.set(key, (rows.get(key) || 0) + val)
    }
    if (period.value === 'year') {
      for (let m = 1; m <= 12; m++) {
        const key = `${safeAnchor.value.slice(0, 4)}-${String(m).padStart(2, '0')}`
        if (!rows.has(key)) rows.set(key, 0)
      }
    }
    const sorted = [...rows].sort(([a], [b]) => a.localeCompare(b))
    return {
      labels: sorted.map(([date]) =>
        period.value === 'year' ? `${Number(date.slice(5))}月` : date.slice(2),
      ),
      values: sorted.map(([, val]) => (byCount ? val : val / 60000)),
    }
  }
  const rows = new Map(byCount ? stats.value.dailyCounts : stats.value.daily),
    labels: string[] = [],
    values: number[] = []
  for (let day = range.value[0], guard = 0; day <= range.value[1] && guard < 400; day = addDays(day, 1), guard++) {
    labels.push(String(Number(day.slice(8))))
    const val = rows.get(day) || 0
    values.push(byCount ? val : val / 60000)
  }
  return { labels, values }
})

const trendStats = computed(() => {
  const values = trend.value.values
  const nonZero = values.filter((v) => v > 0)
  const mean = nonZero.length ? nonZero.reduce((sum, v) => sum + v, 0) / nonZero.length : 0
  const qualifiedCount = mean > 0 ? values.filter((v) => v >= mean).length : 0
  const peak = Math.max(0, ...values)
  return { values, mean, qualifiedCount, peak }
})

const trendMeanLabel = computed(() => {
  const { mean } = trendStats.value
  if (mean <= 0) return ''
  return metric.value === 'count'
    ? `${mean.toFixed(1).replace(/\.0$/, '')} 次`
    : duration(Math.round(mean * 60000))
})

const trendStatusSummary = computed(() => {
  const { mean, qualifiedCount } = trendStats.value
  if (mean <= 0) return ''
  return `非零均值 ${trendMeanLabel.value} · ${qualifiedCount} 个时段达标`
})

const trendOption = computed(() => {
  const { values, mean, peak } = trendStats.value
  const isCount = metric.value === 'count'
  const showZeroRestingHeads = values.length <= 14

  const baseSeries = [
    {
      type: 'bar',
      data: values.map((value) => ({
        value,
        itemStyle: {
          color: mean > 0 && value >= mean ? '#222222' : '#D1D1D6',
          borderRadius: [5, 5, 0, 0],
        },
      })),
      barMaxWidth: 24,
      itemStyle: { color: '#222222', borderRadius: [5, 5, 0, 0] },
      ...(mean > 0
        ? {
            markLine: {
              symbol: ['none', 'none'],
              silent: true,
              lineStyle: { color: '#737378', type: 'dashed', width: 1.5 },
              label: {
                show: true,
                position: 'insideEndTop',
                formatter: `均值 ${trendMeanLabel.value}`,
                color: '#66666b',
                fontSize: 12,
              },
              data: [{ yAxis: mean }],
            },
          }
        : {}),
    },
    ...(mean > 0
      ? [
          {
            type: 'custom',
            silent: true,
            tooltip: { show: false },
            z: 6,
            data: values.map((v, i) => [i, v]),
            renderItem: (
              params: { dataIndex: number },
              api: {
                value: (idx: number) => number
                coord: (pt: [number, number]) => [number, number]
                size?: (val: [number, number]) => [number, number]
              },
            ) => {
              const val = Number(api.value(1))
              if (val <= 0 && !showZeroRestingHeads) return null
              const [x, y] = api.coord([params.dataIndex, val])
              const slotW = api.size ? api.size([1, 0])[0] : 24
              const r = Math.max(4.5, Math.min(8, slotW * 0.34))
              if (val >= mean) {
                // Perked dark animal head with #EF4E36 red comb
                const cy = y - r - 2
                return {
                  type: 'group',
                  children: [
                    // Red comb bumps
                    { type: 'circle', shape: { cx: x - r * 0.32, cy: cy - r * 0.88, r: r * 0.24 }, style: { fill: '#EF4E36' } },
                    { type: 'circle', shape: { cx: x, cy: cy - r * 1.04, r: r * 0.28 }, style: { fill: '#EF4E36' } },
                    { type: 'circle', shape: { cx: x + r * 0.32, cy: cy - r * 0.88, r: r * 0.24 }, style: { fill: '#EF4E36' } },
                    // Perked ears
                    {
                      type: 'polygon',
                      shape: {
                        points: [
                          [x - r * 0.82, cy - r * 0.15],
                          [x - r * 0.72, cy - r * 0.92],
                          [x - r * 0.22, cy - r * 0.62],
                        ],
                      },
                      style: { fill: '#222222' },
                    },
                    {
                      type: 'polygon',
                      shape: {
                        points: [
                          [x + r * 0.82, cy - r * 0.15],
                          [x + r * 0.72, cy - r * 0.92],
                          [x + r * 0.22, cy - r * 0.62],
                        ],
                      },
                      style: { fill: '#222222' },
                    },
                    // Dark head
                    { type: 'circle', shape: { cx: x, cy, r }, style: { fill: '#222222' } },
                    // White eye circles + dark pupils
                    { type: 'circle', shape: { cx: x - r * 0.34, cy: cy - r * 0.04, r: r * 0.25 }, style: { fill: '#FFFFFF' } },
                    { type: 'circle', shape: { cx: x + r * 0.34, cy: cy - r * 0.04, r: r * 0.25 }, style: { fill: '#FFFFFF' } },
                    { type: 'circle', shape: { cx: x - r * 0.3, cy: cy - r * 0.04, r: r * 0.12 }, style: { fill: '#222222' } },
                    { type: 'circle', shape: { cx: x + r * 0.3, cy: cy - r * 0.04, r: r * 0.12 }, style: { fill: '#222222' } },
                    // Tiny accent beak/nose
                    { type: 'circle', shape: { cx: x, cy: cy + r * 0.26, r: r * 0.14 }, style: { fill: '#EF4E36' } },
                  ],
                }
              }
              // Resting light-gray animal head
              const ry = r * 0.72
              const rx = r * 0.98
              const cy = y - ry - 1.5
              return {
                type: 'group',
                children: [
                  {
                    type: 'ellipse',
                    shape: { cx: x, cy, rx, ry },
                    style: { fill: '#D1D1D6', stroke: '#AEAEB2', lineWidth: 1 },
                  },
                  {
                    type: 'line',
                    shape: { x1: x - rx * 0.44, y1: cy, x2: x - rx * 0.14, y2: cy },
                    style: { stroke: '#737378', lineWidth: 1.4, lineCap: 'round' },
                  },
                  {
                    type: 'line',
                    shape: { x1: x + rx * 0.14, y1: cy, x2: x + rx * 0.44, y2: cy },
                    style: { stroke: '#737378', lineWidth: 1.4, lineCap: 'round' },
                  },
                ],
              }
            },
          },
        ]
      : []),
  ]

  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      textStyle: { fontSize: 12 },
      valueFormatter: (value: unknown) =>
        isCount ? `${Math.round(Number(value))} 次` : duration(Number(value) * 60000),
    },
    grid: { left: 44, right: 10, top: 40, bottom: 28 },
    xAxis: {
      type: 'category',
      data: trend.value.labels,
      axisLine: { lineStyle: { color: '#EAEAEA' } },
      axisTick: { show: false },
      axisLabel: { color: '#737378', fontSize: 12 },
    },
    yAxis: {
      type: 'value',
      name: isCount ? '次' : '分钟',
      min: 0,
      minInterval: 1,
      max: peak > 0 && peak < 1 ? 1 : undefined,
      nameTextStyle: { color: '#737378', fontSize: 12 },
      splitLine: { lineStyle: { color: '#EAEAEA', type: 'dashed' } },
      axisLabel: { color: '#737378', fontSize: 12 },
    },
    series: baseSeries,
  }
})

const activeCategories = computed(() => {
  const byCount = metric.value === 'count'
  return stats.value.categories
    .filter((c) => (byCount ? c.count > 0 : c.ms > 0))
    .slice()
    .sort((a, b) => (byCount ? b.count - a.count || b.ms - a.ms : b.ms - a.ms || b.count - a.count))
})

const distributionTotal = computed(() =>
  metric.value === 'count' ? stats.value.count : stats.value.totalMs,
)

const pieOption = computed(() => {
  const byCount = metric.value === 'count'
  return {
    animation: false,
    tooltip: {
      trigger: 'item',
      textStyle: { fontSize: 12 },
      formatter: (p: unknown) => {
        const row = p as { name: string; value: number; percent: number }
        const formatted = byCount ? `${Math.round(row.value)} 次` : duration(row.value)
        return `${escapeHtml(String(row.name ?? ''))}<br/>${formatted} · ${row.percent}%`
      },
    },
    series: [
      {
        type: 'pie',
        radius: ['57%', '78%'],
        center: ['50%', '50%'],
        label: { show: false },
        itemStyle: { borderColor: '#F5F5F5', borderWidth: 4, borderRadius: 5 },
        data: activeCategories.value.map((c) => ({
          name: c.name,
          value: byCount ? c.count : c.ms,
          itemStyle: { color: c.color },
        })),
      },
    ],
  }
})

const hourOption = computed(() => {
  const isCount = metric.value === 'count'
  const values = isCount ? stats.value.hourCounts : stats.value.hours.map((v) => v / 60000)
  const peak = Math.max(0, ...values)
  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      textStyle: { fontSize: 12 },
      valueFormatter: (value: unknown) =>
        isCount ? `${Math.round(Number(value))} 次` : duration(Number(value) * 60000),
    },
    grid: { left: 44, right: 10, top: 24, bottom: 28 },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => (i % 4 === 0 ? `${i}时` : '')),
      axisLine: { lineStyle: { color: '#EAEAEA' } },
      axisTick: { show: false },
      axisLabel: { color: '#737378', fontSize: 12 },
    },
    yAxis: {
      type: 'value',
      name: isCount ? '次' : '分钟',
      min: 0,
      minInterval: 1,
      max: peak > 0 && peak < 1 ? 1 : undefined,
      nameTextStyle: { color: '#737378', fontSize: 12 },
      splitLine: { lineStyle: { color: '#EAEAEA', type: 'dashed' } },
      axisLabel: { color: '#737378', fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        data: values.map((value) => ({
          value,
          itemStyle: {
            color: peak > 0 && value === peak ? '#EF4E36' : '#737378',
            borderRadius: [4, 4, 0, 0],
          },
        })),
        barMaxWidth: 12,
        itemStyle: { color: '#737378', borderRadius: [4, 4, 0, 0] },
      },
    ],
  }
})

// 365-day single-canvas heatmap (Year view)
const heatmapAnchor = computed(() => {
  const today = dateKey()
  return safeAnchor.value.slice(0, 4) === today.slice(0, 4)
    ? safeAnchor.value
    : `${safeAnchor.value.slice(0, 4)}-12-31`
})

const heatmap = computed(() => yearlyHeatmap(app.data.records, heatmapAnchor.value, metric.value))

watch(heatmapAnchor, () => {
  selectedHeatmapIdx.value = Math.max(0, heatmap.value.days.length - 1)
})

const selectedHeatmapDay = computed(
  () => heatmap.value.days[selectedHeatmapIdx.value] ?? heatmap.value.days[heatmap.value.days.length - 1]!,
)

const heatmapReadoutText = computed(() => {
  const d = selectedHeatmapDay.value
  return `${readableDate(d.date)} · ${d.count} 次 · ${duration(d.ms)}`
})

function heatmapLayout(cssWidth: number, cssHeight: number) {
  const leadingEmpty = weekday(heatmap.value.from) - 1
  const totalCols = Math.ceil((leadingEmpty + heatmap.value.days.length) / 7)
  const padX = 4
  const padY = 6
  const colPitch = Math.max(4, (cssWidth - padX * 2) / totalCols)
  const rowPitch = Math.max(6, (cssHeight - padY * 2) / 7)
  const cellW = Math.max(2.5, colPitch - 1.5)
  const cellH = Math.max(4, Math.min(11, rowPitch - 2))
  const offsetY = (cssHeight - rowPitch * 7) / 2
  return { leadingEmpty, totalCols, padX, colPitch, rowPitch, cellW, cellH, offsetY }
}

function drawHeatmap() {
  const canvas = heatmapCanvas.value
  if (!canvas) return
  const cssWidth = canvas.clientWidth
  const cssHeight = canvas.clientHeight
  if (cssWidth <= 0 || cssHeight <= 0) return
  const dpr =
    typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
      ? Math.min(Math.max(window.devicePixelRatio, 1), 2)
      : 1
  const targetW = Math.round(cssWidth * dpr)
  const targetH = Math.round(cssHeight * dpr)
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, cssWidth, cssHeight)

  const { leadingEmpty, padX, colPitch, rowPitch, cellW, cellH, offsetY } = heatmapLayout(
    cssWidth,
    cssHeight,
  )
  const days = heatmap.value.days
  const selectedIdx = selectedHeatmapIdx.value

  for (let i = 0; i < days.length; i++) {
    const slot = i + leadingEmpty
    const col = Math.floor(slot / 7)
    const row = slot % 7
    const x = padX + col * colPitch + (colPitch - cellW) / 2
    const y = offsetY + row * rowPitch + (rowPitch - cellH) / 2
    const day = days[i]!
    ctx.fillStyle = HEATMAP_COLORS[day.level]
    fillRoundedRect(ctx, x, y, cellW, cellH, 2)
    if (i === selectedIdx) {
      ctx.strokeStyle = day.level >= 3 ? '#FFFFFF' : '#222222'
      ctx.lineWidth = 1.5
      strokeRoundedRect(ctx, x - 0.5, y - 0.5, cellW + 1, cellH + 1, 2.5)
      if (day.level >= 3) {
        ctx.strokeStyle = '#222222'
        ctx.lineWidth = 1
        strokeRoundedRect(ctx, x - 1.5, y - 1.5, cellW + 3, cellH + 3, 3)
      }
    }
  }
  ctx.restore()
}

function selectHeatmapAtClient(clientX: number, clientY: number) {
  const canvas = heatmapCanvas.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  const x = clientX - rect.left
  const y = clientY - rect.top
  const { leadingEmpty, totalCols, padX, colPitch, rowPitch, offsetY } = heatmapLayout(
    rect.width,
    rect.height,
  )
  const col = Math.max(0, Math.min(totalCols - 1, Math.floor((x - padX) / colPitch)))
  const row = Math.max(0, Math.min(6, Math.floor((y - offsetY) / rowPitch)))
  const maxIdx = heatmap.value.days.length - 1
  const idx = Math.max(0, Math.min(maxIdx, col * 7 + row - leadingEmpty))
  selectedHeatmapIdx.value = idx
}

function onHeatmapPointerDown(event: PointerEvent) {
  heatmapDragging.value = true
  try {
    heatmapCanvas.value?.setPointerCapture?.(event.pointerId)
  } catch {
    // Ignore capture errors in synthetic event environments
  }
  selectHeatmapAtClient(event.clientX, event.clientY)
}

function onHeatmapPointerMove(event: PointerEvent) {
  if (!heatmapDragging.value) return
  selectHeatmapAtClient(event.clientX, event.clientY)
}

function onHeatmapPointerEnd(event: PointerEvent) {
  if (!heatmapDragging.value) return
  heatmapDragging.value = false
  try {
    if (heatmapCanvas.value?.hasPointerCapture?.(event.pointerId)) {
      heatmapCanvas.value.releasePointerCapture(event.pointerId)
    }
  } catch {
    // Ignore release errors
  }
}

function onHeatmapKeyDown(event: KeyboardEvent) {
  const maxIdx = heatmap.value.days.length - 1
  let next = selectedHeatmapIdx.value
  if (event.key === 'ArrowLeft') next = Math.max(0, next - 1)
  else if (event.key === 'ArrowRight') next = Math.min(maxIdx, next + 1)
  else if (event.key === 'ArrowUp') next = Math.max(0, next - 7)
  else if (event.key === 'ArrowDown') next = Math.min(maxIdx, next + 7)
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = maxIdx
  else return
  event.preventDefault()
  selectedHeatmapIdx.value = next
}

watch(heatmapCanvas, (el, _prev, onCleanup) => {
  if (!el) return
  let observer: ResizeObserver | undefined
  void nextTick(() => drawHeatmap())
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => drawHeatmap())
    observer.observe(el)
  }
  onCleanup(() => {
    observer?.disconnect()
  })
})

watch([heatmap, selectedHeatmapIdx], () => {
  void nextTick(() => drawHeatmap())
})

const stateName = (r: FocusRecord) =>
  r.status === 'completed' ? '正常结束' : r.status === 'early' ? '提前结束' : '中断'

function openRecords() {
  recordView.value = 'list'
  selected.value = null
  confirmDelete.value = false
  recordsOpen.value = true
}
function closeRecords() {
  recordsOpen.value = false
  confirmDelete.value = false
}
function showRecord(record: FocusRecord) {
  selected.value = record
  confirmDelete.value = false
  recordView.value = 'detail'
}
function backToList() {
  confirmDelete.value = false
  recordView.value = 'list'
  selected.value = null
}
async function confirmRemove(record: FocusRecord) {
  await app.deleteRecord(record.id)
  confirmDelete.value = false
  selected.value = null
  recordView.value = 'list'
  app.notify('记录已删除')
}
</script>
<template>
  <div class="page stats-page">
    <header class="page-header">
      <h1>统计</h1>
      <button type="button" class="icon-button" aria-label="查看专注记录" @click="openRecords">
        <Icon name="history" />
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
    <div class="period-selector" data-decision-group>
      <button
        type="button"
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
        type="button"
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
        <div v-if="period === 'day'">
          <span>最长单次</span><strong class="number">{{ longestMs > 0 ? duration(longestMs) : '—' }}</strong>
        </div>
        <div v-else>
          <span>专注天数</span><strong class="number">{{ stats.days }}<small>天</small></strong>
        </div>
        <div>
          <span>专注次数</span><strong class="number">{{ stats.count }}<small>次</small></strong>
        </div>
        <div>
          <span>提前结束次数</span><strong class="number">{{ stats.earlyCount }}<small>次</small></strong>
        </div>
        <div>
          <span>平均每次时长</span
          ><strong class="number">{{
            stats.averageMs === null ? '—' : duration(stats.averageMs)
          }}</strong>
        </div>
      </div>
    </section>
    <div class="segmented metric-tabs" role="group" aria-label="统计单位">
      <button
        type="button"
        :class="{ active: metric === 'duration' }"
        :aria-pressed="metric === 'duration'"
        @click="metric = 'duration'"
      >
        按时长
      </button>
      <button
        type="button"
        :class="{ active: metric === 'count' }"
        :aria-pressed="metric === 'count'"
        @click="metric = 'count'"
      >
        按次数
      </button>
    </div>
    <section class="stats-card" data-ux-card>
      <div class="row between">
        <h2>{{ metric === 'count' ? '专注次数趋势' : '专注时长趋势' }}</h2>
        <span class="chart-caption">{{ periodTitle }}</span>
      </div>
      <Chart
        :option="trendOption"
        :label="`${metric === 'count' ? '专注次数' : '专注时长'}趋势柱状图${trendStatusSummary ? `，${trendStatusSummary}` : ''}`"
        :height="215"
      />
      <p v-if="trendStatusSummary" class="trend-summary">{{ trendStatusSummary }}</p>
      <p v-else class="chart-empty">完成一次专注，看看时间留下的痕迹。</p>
    </section>
    <section v-if="period === 'year'" class="stats-card heatmap-card" data-ux-card>
      <div class="row between">
        <h2>365天热力图</h2>
        <span class="chart-caption">{{ heatmap.from.slice(5) }} ~ {{ heatmap.to.slice(5) }}</span>
      </div>
      <div class="heatmap-stage" data-tab-swipe-ignore>
        <canvas
          ref="heatmapCanvas"
          class="heatmap-canvas"
          data-tab-swipe-ignore
          tabindex="0"
          role="slider"
          aria-label="365天专注热力图，按住滑动或使用方向键选择日期"
          :aria-valuemin="0"
          :aria-valuemax="heatmap.days.length - 1"
          :aria-valuenow="selectedHeatmapIdx"
          :aria-valuetext="heatmapReadoutText"
          @pointerdown="onHeatmapPointerDown"
          @pointermove="onHeatmapPointerMove"
          @pointerup="onHeatmapPointerEnd"
          @pointercancel="onHeatmapPointerEnd"
          @keydown="onHeatmapKeyDown"
        />
      </div>
      <div
        class="heatmap-footer"
        role="status"
        aria-live="polite"
        :data-heatmap-date="selectedHeatmapDay.date"
        :data-heatmap-count="selectedHeatmapDay.count"
        :data-heatmap-ms="selectedHeatmapDay.ms"
      >
        <span class="heatmap-readout">
          <strong>{{ readableDate(selectedHeatmapDay.date) }}</strong>
          · <span class="number">{{ selectedHeatmapDay.count }}</span> 次 ·
          <span class="number">{{ duration(selectedHeatmapDay.ms) }}</span>
        </span>
        <span class="heatmap-scale" aria-hidden="true">
          <span>少</span>
          <i v-for="c in HEATMAP_COLORS" :key="c" :style="{ background: c }" />
          <span>多</span>
        </span>
      </div>
    </section>
    <section class="stats-card" data-ux-card>
      <div class="row between">
        <h2>{{ metric === 'count' ? '次数分布' : '专注分布' }}</h2>
        <div class="mini-distribution">
          <button
            type="button"
            :class="{ active: group === 'theme' }"
            :aria-pressed="group === 'theme'"
            @click="group = 'theme'"
          >
            主题</button
          ><button
            type="button"
            :class="{ active: group === 'item' }"
            :aria-pressed="group === 'item'"
            @click="group = 'item'"
          >
            待办
          </button>
        </div>
      </div>
      <div v-if="distributionTotal > 0" class="pie-area">
        <Chart
          :option="pieOption"
          :label="`${group === 'theme' ? '各主题' : '各待办'}${metric === 'count' ? '专注次数' : '专注时长'}占比`"
          :height="200"
        />
        <div class="pie-center">
          <span class="number">{{ activeCategories.length }}</span><small>个专注方向</small>
        </div>
      </div>
      <div v-else class="no-distribution">
        <span class="empty-ring" /><span>还没有专注记录</span>
      </div>
      <div v-if="activeCategories.length" class="legend-list">
        <div v-for="row in activeCategories" :key="row.id" class="legend-row">
          <span class="row"><i :style="{ background: row.color }" />{{ row.name }}</span
          ><span
            ><strong>{{ metric === 'count' ? `${row.count} 次` : duration(row.ms) }}</strong
            ><small>{{
              distributionTotal > 0
                ? `${(((metric === 'count' ? row.count : row.ms) / distributionTotal) * 100).toFixed(1)}%`
                : '0.0%'
            }}</small></span
          >
        </div>
      </div>
    </section>
    <section class="stats-card" data-ux-card>
      <h2>时段分布</h2>
      <Chart
        :option="hourOption"
        :label="`一天24小时中的${metric === 'count' ? '专注次数' : '实际专注时长'}分布`"
        :height="190"
      />
    </section>
    <Sheet
      :open="recordsOpen"
      :title="recordView === 'detail' && selected ? '专注详情' : '专注记录'"
      :back-label="recordView === 'detail' && selected ? '专注记录' : undefined"
      @back="backToList"
      @close="closeRecords"
    >
      <div v-if="recordView === 'detail' && selected" class="stack">
        <h2>{{ selected.title }}</h2>
        <p class="muted">{{ selected.themeName }} · {{ stateName(selected) }}</p>
        <div class="card result-summary">
          <strong class="number">{{ duration(selected.durationMs) }}</strong
          ><small>实际专注时长</small>
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
        <div v-if="confirmDelete" class="inline-confirm">
          <p>删除这条专注记录？对应统计也会更新。</p>
          <div class="inline-confirm-actions">
            <button type="button" class="secondary" @click="confirmDelete = false">取消</button>
            <button type="button" class="danger-button" @click="confirmRemove(selected)">
              确认删除
            </button>
          </div>
        </div>
        <button v-else type="button" class="text-button danger" @click="confirmDelete = true">
          删除记录
        </button>
      </div>
      <template v-else>
        <div v-if="!records.length" class="empty">
          <Icon name="clock" :size="32" />
          <p>这个时间范围还没有专注记录。</p>
        </div>
        <div v-else class="record-list">
          <button
            v-for="record in records"
            :key="record.id"
            type="button"
            class="record"
            @click="showRecord(record)"
          >
            <div>
              <h3>{{ record.title }}</h3>
              <p>{{ zoneDate(record.startedAt, record.timeZone) }} · {{ record.themeName }}</p>
            </div>
            <span class="number">{{ duration(record.durationMs) }}</span>
          </button>
        </div>
      </template>
    </Sheet>
  </div>
</template>
<style scoped>
.stats-page .icon-button {
  min-width: 48px;
  min-height: 48px;
}
.stats-page .text-button {
  min-width: 48px;
  min-height: 48px;
}
.mini-distribution {
  display: flex;
  gap: 6px;
  font-size: 13px;
}
.mini-distribution button {
  min-height: 48px;
  min-width: 48px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--muted-surface);
}
.mini-distribution .active {
  color: var(--ink);
  font-weight: 700;
}
.period-tabs {
  margin-bottom: 12px;
}
.period-tabs button,
.metric-tabs button {
  min-height: 48px;
}
.metric-tabs {
  margin-bottom: 16px;
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
  min-height: 48px;
  border-radius: var(--radius);
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
  padding: 20px;
  background: var(--surface);
  border-radius: var(--radius);
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
  color: var(--muted-surface);
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
  color: var(--muted-surface);
}
.stats-card {
  padding: 20px;
  background: var(--surface);
  border-radius: var(--radius);
  margin-bottom: 16px;
}
.stats-card:last-of-type {
  margin-bottom: 0;
}
.chart-caption {
  font-size: 12px;
  color: var(--muted-surface);
}
.trend-summary,
.chart-empty {
  font-size: 12px;
  text-align: center;
  color: var(--muted-surface);
  margin-top: 8px;
}
.heatmap-stage {
  margin-top: 12px;
  background: var(--white);
  border-radius: var(--radius);
  padding: 10px 8px;
}
.heatmap-canvas {
  display: block;
  width: 100%;
  height: 108px;
  min-height: 48px;
  touch-action: none;
  cursor: crosshair;
  outline: none;
}
.heatmap-canvas:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
  border-radius: 8px;
}
.heatmap-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--muted-surface);
}
.heatmap-readout {
  font-size: 12px;
  color: var(--ink);
}
.heatmap-readout .number {
  font-weight: 800;
}
.heatmap-scale {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted-surface);
}
.heatmap-scale i {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
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
  font-size: 12px;
  color: var(--muted-surface);
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
  font-size: 12px;
  color: var(--muted-surface);
}
.no-distribution {
  display: flex;
  flex-direction: column;
  gap: 20px;
  align-items: center;
  padding: 32px 0;
  color: var(--muted-surface);
  font-size: 12px;
}
.empty-ring {
  width: 112px;
  height: 112px;
  border: 18px solid var(--line);
  border-radius: 50%;
}
.record {
  min-height: 48px;
  border-radius: var(--radius);
}
.record > div {
  min-width: 0;
  flex: 1;
}
.record h3 {
  overflow-wrap: anywhere;
}
.record p {
  font-size: 12px;
  color: var(--muted-surface);
  overflow-wrap: anywhere;
}
.record .number {
  flex-shrink: 0;
}
.result-summary {
  text-align: center;
  display: grid;
  gap: 6px;
  background: var(--surface);
  border-radius: var(--radius);
}
.result-summary strong {
  font-size: 38px;
}
.result-summary small {
  font-size: 12px;
  color: var(--muted-surface);
}
.inline-confirm {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: var(--radius);
  background: #fff1ef;
}
.inline-confirm p {
  font-size: 14px;
  color: var(--ink);
}
.inline-confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.inline-confirm-actions button {
  min-height: 48px;
}
.danger-button {
  min-height: 48px;
  border-radius: 999px;
  background: #c13a25;
  color: #ffffff;
  font-weight: 600;
  padding: 0 16px;
}
</style>
