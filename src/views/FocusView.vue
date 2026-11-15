<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import { timer, duration } from '../domain/dates'
import Icon from '../components/Icon.vue'
import DndSetting from '../components/DndSetting.vue'
const app = useApp(),
  router = useRouter(),
  busy = ref(false)
const session = computed(() => app.focus.session),
  strict = computed(() => session.value?.mode === 'countdown' && session.value.strictMode === true),
  result = computed(() => app.lastResult),
  display = computed(() =>
    session.value?.mode === 'countdown'
      ? Math.max(0, session.value.targetMs - app.focus.elapsedMs)
      : app.focus.elapsedMs,
  )
async function toggle() {
  busy.value = true
  try {
    await app.action(session.value?.state === 'paused' ? 'resume' : 'pause')
  } catch (e) {
    app.notify(String(e))
  } finally {
    busy.value = false
  }
}
async function finish() {
  if (!confirm('结束本次专注？已经投入的时间会保留。')) return
  busy.value = true
  try {
    await app.action('finish')
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}
async function again() {
  const previous = result.value
  if (!previous) return
  const item = app.items.find((i) => i.id === previous.itemId) || null
  try {
    await app.start(item, previous.mode, previous.targetMs / 60000)
  } catch (e) {
    app.notify(String(e))
  }
}
async function rest() {
  if (busy.value) return
  busy.value = true
  try {
    await app.startRest()
    await router.replace('/rest')
  } catch (error) {
    app.notify(error instanceof Error ? error.message : String(error))
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="focus-page">
    <header class="focus-header">
      <button class="icon-button" aria-label="返回待办，保持计时" @click="router.replace('/tasks')">
        <Icon name="back" /></button
      ><span>{{ session?.themeName || '小猫专注' }}</span
      ><span class="focus-header-space" />
    </header>
    <template v-if="session"
      ><div class="focus-center">
        <div class="focus-mode">
          {{ session.mode === 'countdown' ? '倒计时专注' : '正计时专注' }}
        </div>
        <div class="focus-clock number" :class="{ 'long-clock': display >= 3600000 }">
          {{ timer(display) }}
        </div>
        <div class="focus-name">{{ session.title }}</div>
        <p class="focus-status">
          <span v-if="session.state === 'running'" class="status-dot" />{{
            session.state === 'paused' ? '已暂停' : '专注进行中'
          }}
        </p>
      </div>
      <div class="focus-bottom">
        <p>{{ strict ? '严格倒计时 · 不能暂停或提前结束' : '只做眼前这一件事。' }}</p>
        <div v-if="!strict" class="focus-controls">
          <button
            class="pause-control"
            :aria-label="session.state === 'paused' ? '继续专注' : '暂停专注'"
            :disabled="busy"
            @click="toggle"
          >
            <Icon :name="session.state === 'paused' ? 'play' : 'pause'" :size="32" /></button
          ><button class="end-control" aria-label="结束专注" :disabled="busy" @click="finish">
            <Icon name="stop" :size="24" />
          </button>
        </div>
        <small>返回或锁屏，计时仍会继续</small>
      </div></template
    ><template v-else-if="result"
      ><div class="focus-result">
        <div class="result-check"><Icon name="check" :size="32" /></div>
        <h1>
          {{
            result.status === 'completed'
              ? '本次专注已完成'
              : result.status === 'early'
                ? '本次专注已结束'
                : '专注已中断'
          }}
        </h1>
        <p class="muted">{{ result.title }}</p>
        <div class="result-duration number">{{ duration(result.durationMs) }}</div>
        <p class="muted">实际专注时间</p>
        <div class="result-meta">
          <span>暂停 {{ duration(result.pausedMs) }}</span
          ><span>{{ result.mode === 'countdown' ? '倒计时' : '正计时' }}</span>
        </div>
        <button
          v-if="result.status === 'early'"
          class="primary wide"
          :disabled="busy"
          @click="rest"
        >
          <Icon name="clock" :size="18" />休息 5 分钟
        </button>
        <button v-else class="primary wide" @click="again">
          <Icon name="refresh" :size="18" />再次开始</button
        ><button class="text-button" @click="router.replace('/tasks')">返回待办</button>
      </div></template
    >
    <div v-else class="empty">
      <Icon name="clock" :size="40" />
      <h2>准备好就开始吧</h2>
      <p>从待办选择一件事，或开始自由专注。</p>
      <button class="primary" @click="router.replace('/tasks')">回到待办</button>
    </div>
    <DndSetting runtime-only />
  </div>
</template>
<style scoped>
.focus-page {
  padding: calc(18px + env(safe-area-inset-top)) 24px 30px;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.focus-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: var(--muted);
  font-size: 13px;
}
.focus-header-space {
  width: 48px;
}
.focus-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px 0 30px;
  text-align: center;
}
.focus-mode {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 20px;
}
.focus-clock {
  font-size: clamp(72px, 22vw, 112px);
  font-weight: 900;
  line-height: 1.2;
  letter-spacing: -0.065em;
  white-space: nowrap;
}
.focus-clock.long-clock {
  font-size: clamp(58px, 16vw, 83px);
}
.focus-name {
  font-size: 19px;
  margin-top: 32px;
  max-width: 100%;
  overflow-wrap: anywhere;
  font-weight: 600;
}
.focus-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
  margin-top: 12px;
}
.focus-bottom {
  text-align: center;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}
.focus-bottom > p {
  font-size: 13px;
  color: #919196;
}
.focus-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  margin: 28px 0;
}
.pause-control {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: white;
}
.end-control {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--surface);
}
.focus-bottom small {
  font-size: 11px;
}
.focus-result {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 35px 0;
}
.result-check {
  width: 76px;
  height: 76px;
  background: var(--surface);
  border-radius: 50%;
  display: grid;
  place-items: center;
  margin-bottom: 28px;
}
.focus-result h1 {
  font-size: 25px;
  margin-bottom: 14px;
}
.result-duration {
  font-size: 56px;
  margin-top: 40px;
  line-height: 1.4;
}
.result-meta {
  display: flex;
  justify-content: center;
  gap: 20px;
  color: var(--muted);
  font-size: 13px;
  margin: 24px 0 52px;
}
.focus-result .primary {
  max-width: 300px;
}
.focus-result .text-button {
  margin-top: 15px;
}
</style>
