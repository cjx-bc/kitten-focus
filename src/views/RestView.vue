<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import { duration, timer } from '../domain/dates'
import { REST_DURATION_MS } from '../domain/rest'
import Icon from '../components/Icon.vue'
import Sheet from '../components/Sheet.vue'

const app = useApp(),
  router = useRouter()
const busy = ref(false),
  confirmExit = ref(false),
  leaving = ref(false)
const session = computed(() => app.rest.session)
const running = computed(() => session.value?.state === 'running')
const progress = computed(() => Math.max(0, Math.min(1, app.rest.remainingMs / REST_DURATION_MS)))

function requestExit() {
  if (busy.value) return
  if (running.value) confirmExit.value = true
  else void exit()
}
async function exit() {
  if (busy.value) return
  busy.value = true
  try {
    await app.exitRest()
    confirmExit.value = false
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
    app.notify(error instanceof Error ? error.message : String(error))
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
    confirmExit.value = true
    return false
  }
  await app.exitRest()
  return true
})
</script>

<template>
  <div v-if="session" class="rest-page">
    <header class="rest-header">
      <button class="icon-button" aria-label="退出休息" :disabled="busy" @click="requestExit">
        <Icon name="back" />
      </button>
      <h1>{{ running ? '休息一下' : '休息结束' }}</h1>
      <span class="header-space" aria-hidden="true" />
    </header>
    <div class="rest-center">
      <p class="rest-caption">
        {{ session.record.status === 'completed' ? '刚刚完成' : '刚刚专注' }}「{{
          session.record.title
        }}」
      </p>
      <p class="rest-summary">专注 {{ duration(session.record.durationMs) }}</p>
      <div class="rest-dial">
        <svg viewBox="0 0 280 280" aria-hidden="true">
          <circle class="dial-track" cx="140" cy="140" r="130" />
          <circle
            class="dial-progress"
            cx="140"
            cy="140"
            r="130"
            pathLength="1"
            :stroke-dasharray="`${progress} 1`"
          />
        </svg>
        <div class="rest-clock number" role="timer" aria-label="休息剩余时间" aria-live="off">
          {{ timer(app.rest.remainingMs) }}
        </div>
        <span class="dial-label">{{ running ? '给自己五分钟' : '休息已完成' }}</span>
      </div>
      <p class="rest-message" role="status">
        {{ running ? '放松一下，慢慢来。' : '休息结束，准备好再开始。' }}
      </p>
    </div>
    <div class="rest-actions">
      <template v-if="running">
        <button class="secondary wide" :disabled="busy" @click="requestExit">退出休息</button>
        <small>锁屏或切到后台，休息计时仍会继续</small>
      </template>
      <template v-else>
        <button class="primary wide" :disabled="busy" @click="again">
          <Icon name="play" :size="17" />再次专注
        </button>
        <button class="text-button" :disabled="busy" @click="exit">返回待办</button>
      </template>
    </div>
    <Sheet :open="confirmExit" title="退出本次休息？" @close="confirmExit = false">
      <div class="exit-confirmation">
        <p class="muted">退出后将停止休息倒计时并返回待办。刚刚的专注记录会保留。</p>
        <button class="primary wide" :disabled="busy" @click="exit">确认退出</button>
        <button class="text-button" :disabled="busy" @click="confirmExit = false">继续休息</button>
      </div>
    </Sheet>
  </div>
</template>

<style scoped>
.rest-page {
  min-height: 100dvh;
  padding: calc(18px + env(safe-area-inset-top)) 24px calc(30px + env(safe-area-inset-bottom));
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
  align-items: center;
  justify-content: center;
  padding: 36px 0;
  text-align: center;
}
.rest-caption {
  font-size: 16px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.rest-summary {
  font-size: 13px;
  color: var(--muted);
  margin-top: 8px;
}
.rest-dial {
  position: relative;
  width: min(280px, 100%);
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: 32px 0;
}
.rest-dial svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}
.rest-dial circle {
  fill: none;
  stroke-width: 1.5;
}
.dial-track {
  stroke: var(--line);
}
.dial-progress {
  stroke: var(--ink);
  stroke-linecap: round;
}
.rest-clock {
  font-size: clamp(64px, 19vw, 88px);
  line-height: 1.2;
  font-weight: 850;
}
.dial-label {
  font-size: 12px;
  color: var(--muted);
  margin-top: 12px;
}
.rest-message {
  font-size: 14px;
  color: var(--muted);
}
.rest-actions {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding-bottom: 20px;
}
.rest-actions .wide {
  max-width: 300px;
}
.rest-actions small {
  font-size: 11px;
  text-align: center;
}
.exit-confirmation {
  display: grid;
  gap: 16px;
}
@media (max-height: 500px) and (min-width: 600px) {
  .rest-center {
    padding: 12px 0;
  }
  .rest-dial {
    width: 150px;
    margin: 14px 0;
  }
  .rest-clock {
    font-size: 48px;
  }
  .rest-actions {
    padding-bottom: 0;
  }
}
</style>
