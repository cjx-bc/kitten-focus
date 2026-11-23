<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import { duration, timer } from '../domain/dates'
import { REST_DURATION_MS } from '../domain/rest'
import Icon from '../components/Icon.vue'
import Sheet from '../components/Sheet.vue'
import { waitForDialogClose } from '../components/sheetClose'
import StudyModeSheet from '../components/StudyModeSheet.vue'
import {
  classifyStartError,
  getUnreadyProtectionIds,
  isCancelledStartError,
  type StartErrorKind,
} from '../domain/startRecovery'

type RestSheet = 'confirmExit' | 'startError' | null

const app = useApp(),
  router = useRouter()
const busy = ref(false),
  sheet = ref<RestSheet>(null),
  leaving = ref(false),
  studyOpen = ref(false),
  startError = ref<{ message: string; kind: StartErrorKind } | null>(null)
const session = computed(() => app.rest.session)
const running = computed(() => session.value?.state === 'running')
const progress = computed(() => Math.max(0, Math.min(1, app.rest.remainingMs / REST_DURATION_MS)))
const sheetTitle = computed(() => {
  if (sheet.value === 'confirmExit') return '退出休息？'
  if (sheet.value === 'startError') return '无法开始专注'
  return ''
})

function closeSheet() {
  if (busy.value) return
  sheet.value = null
  startError.value = null
}

function requestExit() {
  if (busy.value) return
  if (running.value) sheet.value = 'confirmExit'
  else void exit()
}

async function exit() {
  if (busy.value) return
  busy.value = true
  try {
    await app.exitRest()
    sheet.value = null
    leaving.value = true
    await router.replace('/tasks')
  } catch (error) {
    app.notify(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}

async function again() {
  const previous = session.value?.record
  if (!previous || running.value || busy.value) return
  busy.value = true
  leaving.value = true
  try {
    const item = app.items.find((item) => item.id === previous.itemId) || null
    await app.start(item, previous.mode, previous.targetMs / 60000)
    await router.replace('/focus')
  } catch (error) {
    leaving.value = false
    const message = error instanceof Error ? error.message : String(error)
    if (!isCancelledStartError(message)) {
      startError.value = { message, kind: classifyStartError(message) }
      sheet.value = 'startError'
    }
  } finally {
    busy.value = false
  }
}

async function goRecoveryFromStartError() {
  if (busy.value) return
  busy.value = true
  try {
    await app.exitRest()
    sheet.value = null
    startError.value = null
    leaving.value = true
    await waitForDialogClose()
    await router.push('/recovery')
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
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
    await again()
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

watch(
  () => app.rest.session,
  (value) => {
    if (!value && !busy.value && !leaving.value) void router.replace('/tasks')
  },
)
onMounted(() => {
  document.addEventListener('rest-exit-request', requestExit)
  if (!session.value) void router.replace('/tasks')
})
onBeforeUnmount(() => document.removeEventListener('rest-exit-request', requestExit))
onBeforeRouteLeave(async () => {
  if (leaving.value) return true
  if (running.value) {
    sheet.value = 'confirmExit'
    return false
  }
  await app.exitRest()
  return true
})
</script>

<template>
  <div v-if="session" class="rest-page">
    <header class="rest-header">
      <button type="button" class="icon-button" aria-label="退出休息" :disabled="busy" @click="requestExit">
        <Icon name="back" />
      </button>
      <h1>{{ running ? '休息一下' : '休息结束' }}</h1>
      <span class="header-space" aria-hidden="true" />
    </header>
    <div class="rest-center">
      <div class="rest-stage" data-ux-card>
        <div class="stage-heading"><span class="rest-phase" role="status"><i :class="{ breathing: running }" aria-hidden="true" />{{ running ? '休息中' : '休息完成' }}</span><span>5 分钟</span></div>
        <div class="rest-clock number" role="timer" aria-label="休息剩余时间" aria-live="off">
          {{ timer(app.rest.remainingMs) }}
        </div>
        <div class="rest-meter" aria-hidden="true"><span v-for="step in 5" :key="step"><i :style="{ transform: `scaleX(${Math.min(1, Math.max(0, (1 - progress) * 5 - (step - 1)))})` }" /></span></div>
      </div>
      <div class="rest-receipt"><div><span class="receipt-label">本次专注</span><p class="rest-caption">{{ session.record.title }}</p></div><span class="receipt-duration number">{{ duration(session.record.durationMs) }}</span></div>
    </div>
    <div class="rest-actions">
      <template v-if="running">
        <button type="button" class="secondary wide" :disabled="busy" @click="requestExit">退出休息</button>
      </template>
      <template v-else>
        <button type="button" class="primary wide" :disabled="busy" @click="again">
          <Icon name="play" :size="17" />再次专注
        </button>
        <button type="button" class="text-button" :disabled="busy" @click="exit">返回待办</button>
      </template>
    </div>
    <Sheet :open="sheet !== null" :title="sheetTitle" :close-disabled="busy" @close="closeSheet">
      <div v-if="sheet === 'confirmExit'" class="form-footer">
        <button type="button" class="secondary" :disabled="busy" @click="closeSheet">继续休息</button>
        <button type="button" class="primary" :disabled="busy" @click="exit">退出休息</button>
      </div>
      <div v-else-if="sheet === 'startError' && startError" class="stack">
        <p class="notice" role="alert">{{ startError.message }}</p>
        <template v-if="startError.kind === 'recovery'">
          <button type="button" class="primary wide" :disabled="busy" @click="goRecoveryFromStartError">
            前往故障恢复
          </button>
          <button type="button" class="secondary wide" :disabled="busy" @click="closeSheet">
            取消
          </button>
        </template>
        <template v-else-if="startError.kind === 'protection'">
          <button type="button" class="primary wide" :disabled="busy" @click="openStudyFromStartError">
            前往学霸模式处理
          </button>
          <button type="button" class="secondary wide" :disabled="busy" @click="clearUnreadyAndRetry">
            关闭未就绪保护并开始
          </button>
          <button type="button" class="text-button" :disabled="busy" @click="closeSheet">
            取消
          </button>
        </template>
        <template v-else>
          <button type="button" class="primary wide" :disabled="busy" @click="closeSheet">
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
.rest-page {
  min-height: 100dvh;
  padding: calc(var(--page-block) + env(safe-area-inset-top))
    max(var(--page-inline), env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom))
    max(var(--page-inline), env(safe-area-inset-left));
  display: flex;
  flex-direction: column;
}
.rest-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--muted);
  font-size: 13px;
}
.header-space {
  width: 48px;
}
.rest-header h1 {
  font-size: 13px;
  line-height: 20px;
  font-weight: 500;
  letter-spacing: 0;
}
.rest-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  padding: clamp(16px, 4dvh, 40px) 0;
}
.rest-caption {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.rest-stage {
  container-type: inline-size;
  padding: clamp(22px, 5vw, 32px);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.stage-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 12px; color: var(--muted-surface); }
.rest-phase { display: flex; align-items: center; gap: 8px; color: var(--ink); }
.rest-phase > i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted-surface); }
.rest-phase > i.breathing { background: var(--accent); }
.breathing { animation: rest-breathe 3s ease-in-out infinite; }
@keyframes rest-breathe { 50% { opacity: .3; } }
.rest-meter { display: flex; gap: 6px; }
.rest-meter > span { flex: 1; height: 4px; background: var(--line); border-radius: 4px; overflow: hidden; }
.rest-meter i { display: block; width: 100%; height: 100%; background: var(--ink); transform-origin: left; border-radius: inherit; }
.rest-receipt { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 22px 4px 0; }
.rest-receipt > div { min-width: 0; }
.receipt-label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 5px; }
.receipt-duration { font-size: 16px; color: var(--muted); text-align: right; max-width: 45%; overflow-wrap: anywhere; }
.rest-clock {
  padding-block: clamp(24px, 5dvh, 44px);
  text-align: center;
  font-size: clamp(56px, 17vw, 88px);
  font-size: clamp(48px, 26cqi, 88px);
  line-height: 1;
  font-weight: 750;
  letter-spacing: -0.055em;
  white-space: nowrap;
}
.rest-actions {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding-bottom: 8px;
}
.rest-actions .wide {
  max-width: 240px;
}
.rest-actions .secondary {
  background: var(--white);
  border: 1px solid var(--line);
}
.rest-actions .text-button,
.text-button {
  min-height: 48px;
}
.form-footer button {
  min-height: 48px;
}
.notice {
  border-radius: var(--radius);
  color: var(--muted-surface);
}
@media (max-height: 500px) and (min-width: 600px) {
  .rest-center {
    padding: 12px 0;
  }
  .rest-stage { padding: 18px 24px; border-radius: var(--radius); }
  .rest-clock { font-size: 60px; padding-block: 16px; }
  .rest-receipt { padding-top: 12px; }
  .rest-actions {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    padding-bottom: 0;
  }
}
</style>
