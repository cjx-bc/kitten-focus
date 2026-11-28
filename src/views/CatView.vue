<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import type { AnimalId, FocusRecord } from '../domain/model'
import {
  addDays,
  dateKey,
  duration,
  readableDate,
  weekStart,
  zoneDate,
  zoneTime,
} from '../domain/dates'
import {
  getAnimalMeta,
  getSkinMeta,
  type FarmInstance,
} from '../domain/pet'
import { formatWeekRangeLabel, renderWeeklyFarmCard } from '../domain/farmCard'
import { exportPngFile } from '../platform/exportPng'
import Icon from '../components/Icon.vue'
import PetGraphic from '../components/PetGraphic.vue'
import Sheet from '../components/Sheet.vue'

type FarmSheetView = 'menu' | 'export' | 'record' | null

const app = useApp()
const router = useRouter()

const thisWeekStart = computed(() => weekStart(dateKey()))
const currentWeekStart = ref(thisWeekStart.value)
const selectedInstanceId = ref<string | null>(null)
const bouncingInstanceId = ref<string | null>(null)
const sheetView = ref<FarmSheetView>(null)
const previewDataUrl = ref('')
const exportBusy = ref(false)
let bounceTimer: ReturnType<typeof setTimeout> | undefined

onBeforeUnmount(() => {
  clearTimeout(bounceTimer)
})

const reducedMotionPref = computed(() => app.data.preferences.animation === 'off')
const isCurrentWeek = computed(() => currentWeekStart.value === thisWeekStart.value)

const weekSlice = computed(() => app.petProjection.weekFarmSlice(currentWeekStart.value))
const weekRangeLabel = computed(() =>
  formatWeekRangeLabel(weekSlice.value.weekStartDate, weekSlice.value.weekEndDate),
)
const weekDurationLabel = computed(() =>
  weekSlice.value.totalDurationMs > 0 ? duration(weekSlice.value.totalDurationMs) : '0 分钟',
)

const recordsById = computed(() => {
  const map = new Map<string, FocusRecord>()
  for (const r of app.data.records) map.set(r.id, r)
  return map
})

const selectedInstance = computed<FarmInstance | null>(() => {
  if (!selectedInstanceId.value) return null
  return weekSlice.value.instances.find((inst) => inst.id === selectedInstanceId.value) ?? null
})

const selectedRecord = computed<FocusRecord | null>(() => {
  const inst = selectedInstance.value
  if (!inst) return null
  return recordsById.value.get(inst.recordId) ?? null
})

const selectedRecordTimeSpan = computed(() => {
  const rec = selectedRecord.value
  if (!rec) return ''
  const day = readableDate(zoneDate(rec.startedAt, rec.timeZone))
  const start = zoneTime(rec.startedAt, rec.timeZone)
  const end = zoneTime(rec.endedAt, rec.timeZone)
  return `${day} ${start}–${end}`
})

const sheetTitle = computed(() => {
  if (sheetView.value === 'export') return '导出打卡图'
  if (sheetView.value === 'record') return '专注记录详情'
  if (sheetView.value === 'menu') return '农场操作'
  return ''
})

function animalMeta(animalId: AnimalId) {
  return getAnimalMeta(animalId)
}

function skinMeta(animalId: AnimalId, skinId: string) {
  return getSkinMeta(animalId, skinId)
}

function stepWeek(deltaWeeks: number) {
  currentWeekStart.value = addDays(currentWeekStart.value, deltaWeeks * 7)
  selectedInstanceId.value = null
  bouncingInstanceId.value = null
  previewDataUrl.value = ''
}

function goThisWeek() {
  currentWeekStart.value = thisWeekStart.value
  selectedInstanceId.value = null
  bouncingInstanceId.value = null
  previewDataUrl.value = ''
}

function goFocus() {
  void router.push('/focus')
}

function tapAnimal(inst: FarmInstance) {
  selectedInstanceId.value = inst.id
  bouncingInstanceId.value = null
  clearTimeout(bounceTimer)
  const trigger = () => {
    bouncingInstanceId.value = inst.id
    bounceTimer = setTimeout(() => {
      if (bouncingInstanceId.value === inst.id) bouncingInstanceId.value = null
    }, 320)
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(trigger)
  else trigger()
}

function strollStyle(index: number) {
  const offsetY = (index % 3) * 5 - 4
  if (reducedMotionPref.value) {
    return { '--stagger-y': `${offsetY}px` }
  }
  const durationSec = 3.2 + (index % 4) * 0.45
  const delaySec = -((index * 0.65) % durationSec)
  return {
    '--stagger-y': `${offsetY}px`,
    '--stroll-duration': `${durationSec.toFixed(2)}s`,
    '--stroll-delay': `${delaySec.toFixed(2)}s`,
  }
}

function openMenu() {
  sheetView.value = 'menu'
}

function openRecordSheet() {
  if (!selectedRecord.value) return
  sheetView.value = 'record'
}

function closeSheet() {
  if (exportBusy.value) return
  sheetView.value = null
}

function handleSheetBack() {
  if (exportBusy.value) return
  if (sheetView.value === 'export') {
    sheetView.value = 'menu'
  }
}

function buildCheckinDataUrl(): string {
  const canvas = document.createElement('canvas')
  return renderWeeklyFarmCard(canvas, weekSlice.value)
}

function openExportPreview() {
  try {
    previewDataUrl.value = buildCheckinDataUrl()
    sheetView.value = 'export'
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}

async function saveCheckinPng() {
  if (exportBusy.value) return
  exportBusy.value = true
  try {
    const dataUrl = previewDataUrl.value || buildCheckinDataUrl()
    previewDataUrl.value = dataUrl
    const fileName = `小猫专注-一周农场-${weekSlice.value.weekStartDate}.png`
    await exportPngFile(dataUrl, fileName)
    sheetView.value = null
    app.notify('本周农场打卡图已保存')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('取消')) {
      app.notify(msg)
    }
  } finally {
    exportBusy.value = false
  }
}
</script>

<template>
  <div class="page farm-page" :class="{ 'reduced-motion': reducedMotionPref }">
    <header class="farm-head">
      <div class="farm-nav-group" data-decision-group>
        <div class="farm-stepper">
          <button
            type="button"
            class="icon-button farm-step-btn"
            aria-label="上一周"
            @click="stepWeek(-1)"
          >
            <Icon name="left" :size="20" />
          </button>
          <h1 class="farm-title">一周农场</h1>
          <button
            type="button"
            class="icon-button farm-step-btn"
            aria-label="下一周"
            @click="stepWeek(1)"
          >
            <Icon name="right" :size="20" />
          </button>
        </div>
        <div class="farm-subbar">
          <span class="farm-range">{{ weekRangeLabel }}</span>
          <button
            v-if="!isCurrentWeek"
            type="button"
            class="chip farm-today-btn"
            @click="goThisWeek"
          >
            回到本周
          </button>
        </div>
      </div>

      <div class="farm-head-actions">
        <div
          class="cottage-badge"
          role="status"
          :aria-label="`本周养成 ${weekSlice.weekTotalCount} 只小动物`"
        >
          <Icon name="home" :size="16" />
          <span class="cottage-count number">{{ weekSlice.weekTotalCount }}</span>
        </div>
        <button
          type="button"
          class="icon-button farm-more-btn"
          aria-label="农场操作"
          aria-haspopup="dialog"
          :aria-expanded="sheetView !== null"
          @click="openMenu"
        >
          <Icon name="more" :size="20" />
        </button>
      </div>
    </header>

    <!-- Empty state -->
    <section v-if="weekSlice.weekTotalCount === 0" class="farm-empty-card" data-ux-card>
      <div class="farm-empty-pet">
        <PetGraphic
          animal-id="black-cat"
          stage="standby"
          :size="96"
          :reduced-motion="reducedMotionPref"
        />
      </div>
      <h2 class="farm-empty-title">本周还没有养大的小动物</h2>
      <p class="farm-empty-copy">
        完成一次至少 5 分钟的有效计时专注，养大的伙伴就会来到这周的草坡散步。
      </p>
      <button type="button" class="primary" @click="goFocus">去专注</button>
    </section>

    <!-- Populated meadow -->
    <template v-else>
      <section class="farm-meadow" data-decision-group data-ux-card aria-label="一周农场草坡">
        <svg
          class="farm-meadow-horizon"
          viewBox="0 0 360 44"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0 32 Q180 6 360 32" fill="none" stroke="#E5E5E7" stroke-width="1.5" />
        </svg>

        <div class="farm-grid">
          <button
            v-for="(inst, idx) in weekSlice.instances"
            :key="inst.id"
            type="button"
            class="farm-animal-btn"
            :class="{ selected: selectedInstanceId === inst.id }"
            :style="strollStyle(idx)"
            :aria-label="`${animalMeta(inst.animalId).name}，${inst.title}`"
            :aria-pressed="selectedInstanceId === inst.id"
            @click="tapAnimal(inst)"
          >
            <span class="farm-pet-wrap" :class="{ strolling: !reducedMotionPref }">
              <PetGraphic
                :animal-id="inst.animalId"
                :skin-id="inst.skinId"
                :stage="3"
                :size="44"
                :bouncing="bouncingInstanceId === inst.id"
                :reduced-motion="reducedMotionPref"
              />
            </span>
          </button>
        </div>

        <p v-if="weekSlice.weekTotalCount > weekSlice.instances.length" class="farm-sample-note">
          本周共养大 <span class="number">{{ weekSlice.weekTotalCount }}</span> 只，草坡展示
          <span class="number">{{ weekSlice.instances.length }}</span> 只代表伙伴
        </p>
      </section>

      <!-- Bottom source record detail bar when an animal is selected -->
      <section
        v-if="selectedInstance && selectedRecord"
        class="farm-record-bar"
        data-ux-card
        aria-live="polite"
      >
        <div class="farm-record-info">
          <div class="farm-record-head">
            <span class="farm-record-animal">{{ animalMeta(selectedInstance.animalId).name }}</span>
            <span aria-hidden="true">·</span>
            <span class="farm-record-title">{{ selectedRecord.title }}</span>
          </div>
          <p class="farm-record-meta">
            {{ selectedRecordTimeSpan }} · 实际专注 {{ duration(selectedRecord.durationMs) }}
          </p>
          <p v-if="selectedRecord.note" class="farm-record-note">
            复盘小结：{{ selectedRecord.note }}
          </p>
        </div>
        <button
          type="button"
          class="secondary farm-record-action"
          @click="openRecordSheet"
        >
          <span>查看记录</span>
          <Icon name="right" :size="16" />
        </button>
      </section>
    </template>

    <!-- Single <Sheet> container -->
    <Sheet
      :open="sheetView !== null"
      :title="sheetTitle"
      :back-label="sheetView === 'export' ? '农场操作' : undefined"
      :close-disabled="exportBusy"
      @back="handleSheetBack"
      @close="closeSheet"
    >
      <div v-if="sheetView === 'menu'" class="stack">
        <div class="notice farm-summary-card">
          <p class="farm-summary-range">{{ weekRangeLabel }}</p>
          <p class="farm-summary-stats">
            本周养成 <strong class="number">{{ weekSlice.weekTotalCount }}</strong> 只 · 累计专注
            <strong class="number">{{ weekDurationLabel }}</strong>
          </p>
        </div>
        <button type="button" class="secondary wide" :disabled="exportBusy" @click="openExportPreview">
          导出预览
        </button>
        <button type="button" class="primary wide" :disabled="exportBusy" @click="saveCheckinPng">
          保存本周农场打卡图
        </button>
      </div>

      <div v-else-if="sheetView === 'export'" class="stack">
        <div class="farm-preview-frame" data-ux-card>
          <img
            v-if="previewDataUrl"
            :src="previewDataUrl"
            alt="本周农场打卡图预览"
            class="farm-export-preview"
          />
        </div>
        <button type="button" class="primary wide" :disabled="exportBusy" @click="saveCheckinPng">
          保存本周农场打卡图
        </button>
      </div>

      <div v-else-if="sheetView === 'record' && selectedInstance && selectedRecord" class="stack">
        <div class="farm-detail-hero">
          <PetGraphic
            :animal-id="selectedInstance.animalId"
            :skin-id="selectedInstance.skinId"
            :stage="3"
            :size="72"
            :reduced-motion="reducedMotionPref"
          />
          <div class="farm-detail-copy">
            <h3>{{ selectedRecord.title }}</h3>
            <p class="farm-detail-sub">
              {{ animalMeta(selectedInstance.animalId).name }} ·
              {{ skinMeta(selectedInstance.animalId, selectedInstance.skinId).name }}
            </p>
          </div>
        </div>

        <dl class="farm-detail-list" data-ux-card>
          <div class="farm-detail-row">
            <dt>状态</dt>
            <dd>正常结束</dd>
          </div>
          <div class="farm-detail-row">
            <dt>专注时段</dt>
            <dd>{{ selectedRecordTimeSpan }}</dd>
          </div>
          <div class="farm-detail-row">
            <dt>实际专注时长</dt>
            <dd class="number">{{ duration(selectedRecord.durationMs) }}</dd>
          </div>
          <div v-if="selectedRecord.pausedMs > 0" class="farm-detail-row">
            <dt>暂停时长</dt>
            <dd class="number">{{ duration(selectedRecord.pausedMs) }}</dd>
          </div>
          <div class="farm-detail-row">
            <dt>所属主题</dt>
            <dd>{{ selectedRecord.themeName || '自由专注' }}</dd>
          </div>
          <div class="farm-detail-row">
            <dt>复盘小结</dt>
            <dd>{{ selectedRecord.note || '未填写复盘小结' }}</dd>
          </div>
        </dl>

        <button type="button" class="secondary wide" @click="closeSheet">关闭</button>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.farm-page {
  display: grid;
  gap: 16px;
  align-content: start;
}

.farm-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.farm-nav-group {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 4px;
}

.farm-stepper {
  display: flex;
  align-items: center;
  gap: 2px;
}

.farm-step-btn,
.farm-more-btn {
  width: 48px;
  height: 48px;
  color: var(--ink);
}

.farm-title {
  font-size: clamp(18px, 5vw, 22px);
  font-weight: 750;
  letter-spacing: -0.02em;
  white-space: nowrap;
  color: var(--ink);
}

.farm-subbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-left: 12px;
}

.farm-range {
  font-size: 13px;
  color: var(--muted);
}

.farm-today-btn {
  min-height: 48px;
  min-width: 48px;
  padding: 8px 14px;
  font-size: 13px;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
}

.farm-head-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.cottage-badge {
  min-height: 36px;
  padding: 6px 10px;
  border-radius: 100px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
}

.cottage-count {
  font-size: 15px;
  line-height: 1;
}

.farm-empty-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 36px 24px;
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 14px;
}

.farm-empty-pet {
  padding: 4px 0;
}

.farm-empty-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
}

.farm-empty-copy {
  font-size: 13px;
  color: var(--muted-surface);
  max-width: 260px;
  line-height: 1.6;
}

.farm-meadow {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 20px 10px 16px;
  display: grid;
  gap: 12px;
  overflow: hidden;
}

.farm-meadow-horizon {
  position: absolute;
  top: 6px;
  left: 0;
  width: 100%;
  height: 36px;
  pointer-events: none;
}

.farm-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(5, minmax(48px, 1fr));
  gap: 6px 4px;
  align-items: end;
}

@media (min-width: 400px) {
  .farm-grid {
    grid-template-columns: repeat(6, minmax(48px, 1fr));
  }
}

.farm-animal-btn {
  min-width: 48px;
  min-height: 52px;
  width: 100%;
  padding: 4px 2px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  transform: translateY(var(--stagger-y, 0px));
}

.farm-animal-btn.selected {
  background: var(--white);
  box-shadow: inset 0 0 0 1.5px var(--ink);
}

.farm-pet-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.farm-pet-wrap.strolling {
  animation: farm-stroll var(--stroll-duration, 3.6s) ease-in-out var(--stroll-delay, 0s) infinite;
}

@keyframes farm-stroll {
  0%,
  100% {
    transform: translate(0px, 0px);
  }
  25% {
    transform: translate(3px, -2px);
  }
  50% {
    transform: translate(0px, 0px);
  }
  75% {
    transform: translate(-3px, -2px);
  }
}

.farm-sample-note {
  text-align: center;
  font-size: 12px;
  color: var(--muted-surface);
  padding: 2px 8px 0;
}

.farm-record-bar {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.farm-record-info {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 4px;
}

.farm-record-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 650;
  color: var(--ink);
  min-width: 0;
}

.farm-record-animal {
  flex-shrink: 0;
}

.farm-record-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.farm-record-meta {
  font-size: 12px;
  color: var(--muted-surface);
}

.farm-record-note {
  font-size: 13px;
  color: var(--ink);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.farm-record-action {
  flex-shrink: 0;
  min-height: 48px;
  min-width: 48px;
  padding: 10px 14px;
  font-size: 13px;
}

.farm-summary-card {
  display: grid;
  gap: 4px;
}

.farm-summary-range {
  font-size: 13px;
  color: var(--muted-surface);
}

.farm-summary-stats {
  font-size: 15px;
  color: var(--ink);
}

.farm-preview-frame {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px;
  display: grid;
  place-items: center;
}

.farm-export-preview {
  display: block;
  width: 100%;
  max-height: 52dvh;
  object-fit: contain;
  border-radius: 12px;
  background: var(--white);
}

.farm-detail-hero {
  display: flex;
  align-items: center;
  gap: 14px;
}

.farm-detail-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.farm-detail-copy h3 {
  font-size: 17px;
  color: var(--ink);
  overflow-wrap: anywhere;
}

.farm-detail-sub {
  font-size: 13px;
  color: var(--muted);
}

.farm-detail-list {
  margin: 0;
  background: var(--surface);
  border-radius: var(--radius);
  padding: 6px 16px;
  display: grid;
}

.farm-detail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}

.farm-detail-row:last-child {
  border-bottom: 0;
}

.farm-detail-row dt {
  color: var(--muted-surface);
  flex-shrink: 0;
}

.farm-detail-row dd {
  margin: 0;
  color: var(--ink);
  text-align: right;
  overflow-wrap: anywhere;
}

.reduced-motion .farm-pet-wrap.strolling {
  animation: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .farm-pet-wrap.strolling {
    animation: none !important;
  }
}
</style>
