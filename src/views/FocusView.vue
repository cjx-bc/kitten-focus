<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import { timer, duration } from '../domain/dates'
import { isStudySessionLocked } from '../navigation/mainEntry'
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

type FocusSheet = 'safety' | 'endConfirm' | 'startError' | null

const app = useApp(),
  router = useRouter(),
  busy = ref(false),
  focusSheet = ref<FocusSheet>(null),
  studyOpen = ref(false),
  pendingFinishSessionId = ref<string | null>(null),
  startError = ref<{ message: string; kind: StartErrorKind } | null>(null)

const session = computed(() => app.focus.session),
  studyLocked = computed(() => isStudySessionLocked(session.value)),
  strict = computed(() => session.value?.mode === 'countdown' && session.value.strictMode === true),
  result = computed(() => app.lastResult),
  canRest = computed(() => Boolean(result.value && result.value.status !== 'interrupted' && result.value.durationMs > 0)),
  display = computed(() =>
    session.value?.mode === 'countdown'
      ? Math.max(0, session.value.targetMs - app.focus.elapsedMs)
      : app.focus.elapsedMs,
  )

const focusSheetTitle = computed(() => {
  if (focusSheet.value === 'safety') return '专注辅助与安全出口'
  if (focusSheet.value === 'endConfirm') return '结束本次专注？'
  if (focusSheet.value === 'startError') return '无法开始专注'
  return ''
})

const safetyRoutes = [
  { path: '/emergency', label: '紧急与必要交互（拨号/急救/输入法）' },
  { path: '/recovery', label: '故障恢复（撤销本轮保护，保留计时）' },
  { path: '/permissions', label: '权限与保护状态' },
  { path: '/help', label: '使用帮助' },
] as const

function closeFocusSheet() {
  if (busy.value) return
  focusSheet.value = null
  pendingFinishSessionId.value = null
  startError.value = null
}

function onBackClick() {
  if (studyLocked.value) {
    app.notify('学霸模式进行中，结束后可返回')
    return
  }
  void router.replace('/tasks')
}

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

function finish() {
  const sessionId = session.value?.id
  if (!sessionId || strict.value || busy.value) return
  pendingFinishSessionId.value = sessionId
  focusSheet.value = 'endConfirm'
}

async function confirmFinish() {
  const sessionId = pendingFinishSessionId.value
  if (!sessionId || session.value?.id !== sessionId || strict.value || busy.value) {
    focusSheet.value = null
    pendingFinishSessionId.value = null
    return
  }
  busy.value = true
  try {
    await app.action('finish')
    focusSheet.value = null
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
    focusSheet.value = null
  } finally {
    busy.value = false
    pendingFinishSessionId.value = null
  }
}

async function goSafety(path: string) {
  if (busy.value) return
  focusSheet.value = null
  await waitForDialogClose()
  await router.push(path)
}

async function again() {
  const previous = result.value
  if (!previous || busy.value) return
  busy.value = true
  const item = app.items.find((i) => i.id === previous.itemId) || null
  try {
    await app.start(item, previous.mode, previous.targetMs / 60000)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!isCancelledStartError(message)) {
      startError.value = { message, kind: classifyStartError(message) }
      focusSheet.value = 'startError'
    }
  } finally {
    busy.value = false
  }
}

async function goRecoveryFromStartError() {
  if (busy.value) return
  focusSheet.value = null
  startError.value = null
  await waitForDialogClose()
  await router.push('/recovery')
}

async function openStudyFromStartError() {
  if (busy.value) return
  focusSheet.value = null
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
      focusSheet.value = null
      startError.value = null
      await waitForDialogClose()
      studyOpen.value = true
      return
    }
    await app.clearUnreadyProtections(ids, true)
    focusSheet.value = null
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
      <button
        type="button"
        class="icon-button"
        :aria-label="studyLocked ? '学霸模式进行中，专注页已锁定' : '返回待办，保持计时'"
        @click="onBackClick"
      >
        <Icon :name="studyLocked ? 'lock' : 'back'" /></button
      ><span class="focus-header-title">{{
        session?.themeId && session?.themeName ? session.themeName : '小猫专注'
      }}</span
      ><button
        type="button"
        class="icon-button"
        aria-label="专注辅助与安全出口"
        aria-haspopup="dialog"
        :aria-expanded="focusSheet === 'safety'"
        @click="focusSheet = 'safety'"
      >
        <Icon name="more" />
      </button>
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
        <p v-if="strict">严格倒计时 · 不能暂停或提前结束</p>
        <div v-if="!strict" class="focus-controls">
          <button
            type="button"
            class="pause-control"
            data-ux-role="primary-cta"
            :aria-label="session.state === 'paused' ? '继续专注' : '暂停专注'"
            :disabled="busy"
            @click="toggle"
          >
            <Icon :name="session.state === 'paused' ? 'play' : 'pause'" :size="32" /></button
          ><button
            type="button"
            class="end-control"
            aria-label="结束专注"
            :disabled="busy"
            @click="finish"
          >
            <Icon name="stop" :size="24" />
          </button>
        </div>
      </div></template
    ><template v-else-if="result"
      ><div class="focus-result">
        <div class="result-check" :data-status="result.status">
          <Icon :name="result.status === 'completed' ? 'check' : 'clock'" :size="32" />
        </div>
        <h1>
          {{
            result.status === 'completed'
              ? '本次专注正常结束'
              : result.status === 'early'
                ? '提前结束'
                : '专注已中断'
          }}
        </h1>
        <p class="muted">{{ result.title }}</p>
        <div class="result-duration number">{{ duration(result.durationMs) }}</div>
        <p class="muted">实际专注时长</p>
        <div class="result-meta">
          <span>暂停 {{ duration(result.pausedMs) }}</span
          ><span>{{ result.mode === 'countdown' ? '倒计时' : '正计时' }}</span>
        </div>
        <template v-if="canRest">
          <button type="button" class="primary wide" :disabled="busy" @click="rest">
            <Icon name="clock" :size="18" />休息 5 分钟
          </button>
          <div class="result-secondary-actions">
            <button type="button" class="text-button" :disabled="busy" @click="again">
              {{ result.status === 'completed' ? '再次开始' : '再来一轮' }}
            </button>
            <button type="button" class="text-button" @click="router.replace('/tasks')">返回待办</button>
          </div>
        </template>
        <template v-else>
          <button type="button" class="primary wide" :disabled="busy" @click="again">
            <Icon name="refresh" :size="18" />再次开始
          </button>
          <button type="button" class="text-button" @click="router.replace('/tasks')">返回待办</button>
        </template>
      </div></template
    >
    <div v-else class="empty">
      <Icon name="clock" :size="40" />
      <h2>准备好就开始吧</h2>
      <p>从待办选择一件事，或开始自由专注。</p>
      <button type="button" class="primary" @click="router.replace('/tasks')">回到待办</button>
    </div>
    <Sheet
      :open="focusSheet !== null"
      :title="focusSheetTitle"
      :close-disabled="busy"
      @close="closeFocusSheet"
    >
      <div v-if="focusSheet === 'safety'" class="safety-sheet">
        <p class="notice" role="status">
          当前状态：{{ session ? (studyLocked ? '学霸模式保护中' : '普通专注中') : '未在专注中' }}
        </p>
        <div class="safety-list">
          <button
            v-for="entry in safetyRoutes"
            :key="entry.path"
            type="button"
            class="safety-row"
            @click="goSafety(entry.path)"
          >
            <span>{{ entry.label }}</span>
            <Icon name="right" :size="18" />
          </button>
        </div>
      </div>
      <div v-else-if="focusSheet === 'endConfirm'" class="stack">
        <p>已经投入的实际专注时长会保留。</p>
        <div class="form-footer">
          <button type="button" class="secondary" :disabled="busy" @click="closeFocusSheet">
            继续专注
          </button>
          <button type="button" class="primary" :disabled="busy" @click="confirmFinish">
            结束专注
          </button>
        </div>
      </div>
      <div v-else-if="focusSheet === 'startError' && startError" class="stack">
        <p class="notice" role="alert">{{ startError.message }}</p>
        <template v-if="startError.kind === 'recovery'">
          <button type="button" class="primary wide" :disabled="busy" @click="goRecoveryFromStartError">
            前往故障恢复
          </button>
          <button type="button" class="secondary wide" :disabled="busy" @click="closeFocusSheet">
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
          <button type="button" class="text-button" :disabled="busy" @click="closeFocusSheet">
            取消
          </button>
        </template>
        <template v-else>
          <button type="button" class="primary wide" :disabled="busy" @click="closeFocusSheet">
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
.focus-page {
  padding: calc(var(--page-block) + env(safe-area-inset-top))
    max(var(--page-inline), env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom))
    max(var(--page-inline), env(safe-area-inset-left));
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}
.focus-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}
.focus-header-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.focus-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 5dvh, 50px) 0 clamp(12px, 3dvh, 30px);
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
  margin-top: clamp(16px, 3dvh, 32px);
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
  padding-bottom: calc(8px + env(safe-area-inset-bottom));
}
.focus-bottom > p {
  font-size: 13px;
  color: var(--muted);
}
.focus-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  margin: clamp(12px, 3dvh, 28px) 0;
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
  min-height: 48px;
  margin-top: 15px;
}
.result-secondary-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 15px;
}
.focus-result .result-secondary-actions .text-button {
  margin-top: 0;
}
.safety-sheet {
  display: grid;
  gap: 14px;
}
.safety-list {
  display: grid;
  gap: 4px;
}
.safety-row {
  width: 100%;
  min-height: 48px;
  padding: 12px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  font-size: 14px;
  color: var(--ink);
  border-bottom: 1px solid var(--line);
}
.safety-row:last-child {
  border-bottom: 0;
}
.safety-row svg {
  color: var(--muted);
  flex-shrink: 0;
}
.notice {
  border-radius: var(--radius);
  color: var(--muted-surface);
}
.text-button {
  min-height: 48px;
}
</style>
