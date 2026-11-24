<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core'
import { BarChart, PieChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
use([
  BarChart,
  PieChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CanvasRenderer,
])
const props = defineProps<{ option: EChartsCoreOption; label: string; height?: number }>(),
  element = ref<HTMLElement>()
let chart: ECharts | undefined, observer: ResizeObserver | undefined
onMounted(() => {
  const el = element.value!
  let lastWidth = el.clientWidth
  let lastHeight = el.clientHeight
  const devicePixelRatio =
    typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
      ? Math.min(Math.max(window.devicePixelRatio, 1), 2)
      : 1
  chart = init(el, undefined, { devicePixelRatio })
  chart.setOption(props.option)
  observer = new ResizeObserver(() => {
    if (el.clientWidth === lastWidth && el.clientHeight === lastHeight) return
    lastWidth = el.clientWidth
    lastHeight = el.clientHeight
    chart?.resize()
  })
  observer.observe(el)
})
watch(
  () => props.option,
  (value) => chart?.setOption(value, true),
  { deep: true },
)
onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
})
</script>
<template>
  <div
    ref="element"
    class="chart"
    :style="{ height: `clamp(160px, 26dvh, ${height || 210}px)` }"
    role="img"
    :aria-label="label"
  />
</template>
