<script setup lang="ts">
import { onBeforeUnmount, onMounted, computed, watch, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App as CapacitorApp } from '@capacitor/app'
import { consumeFocusReturn, consumeLockReturn, consumeRecoveryReturn, resolveMainEntry, native } from './platform/bridge'
import { useApp } from './stores/app'
import Icon from './components/Icon.vue'
import Sheet from './components/Sheet.vue'
import RecoverySheet from './components/RecoverySheet.vue'
import { waitForDialogClose } from './components/sheetClose'
import { createTabSwipe } from './navigation/tabSwipe'
import { isStudyFocusSafePath, isStudySessionLocked } from './navigation/mainEntry'
import { useUpdates } from './stores/updates'
const app = useApp(),
  recoveryOpen = ref(false),
  toastEl = ref<HTMLElement | null>(null),
  updates = useUpdates(),
  route = useRoute(),
  router = useRouter(),
  full = computed(() => ['/focus', '/rest', '/lock', '/permissions', '/help', '/emergency', '/recovery'].includes(route.path))
function showToastPopover() {
  const el = toastEl.value
  if (!el || !app.toast) return
  try {
    if (el.matches?.(':popover-open')) el.hidePopover?.()
  } catch {}
  try {
    el.showPopover?.()
  } catch {}
}
watch([toastEl, () => app.toast], showToastPopover, { flush: 'post' })
watch(() => app.lock.session?.id, async id => {
  if (!id) return
  const destination = await resolveMainEntry(route.path)
  if (destination !== route.path) await router.replace(destination)
})
watch([() => app.ready, () => app.rest.session?.record.id], ([ready, id]) => {
  if (ready && id && route.path !== '/rest') void router.replace('/rest')
})
watch(
  [() => app.ready, () => app.focus.session?.id, () => isStudySessionLocked(app.focus.session), () => route.path],
  async ([ready, id, locked, path]) => {
    if (ready && id && locked && !isStudyFocusSafePath(path)) {
      await router.replace('/focus')
    }
  },
  { immediate: true },
)
const tabs = [
  { path: '/tasks', label: '待办', icon: 'tasks' },
  { path: '/calendar', label: '日历', icon: 'calendar' },
  { path: '/cat', label: '小猫', icon: 'cat' },
  { path: '/statistics', label: '统计', icon: 'statistics' },
  { path: '/settings', label: '我的', icon: 'user' },
]
const swipe = createTabSwipe({
  paths: tabs.map((tab) => tab.path),
  currentPath: () => route.path,
  isBlocked: () => !app.ready || isStudySessionLocked(app.focus.session),
  navigate: (path) => void router.replace(path),
})
let recoveryPreemptPromise: Promise<void> | null = null
async function openRecoveryPreempting() {
  if (recoveryOpen.value) return
  if (recoveryPreemptPromise) return recoveryPreemptPromise
  recoveryPreemptPromise = (async () => {
    if (app.strictConfirmation) app.confirmStrictStart(false)
    app.requestCloseSheets()
    await waitForDialogClose(220)
    recoveryOpen.value = true
  })().finally(() => {
    recoveryPreemptPromise = null
  })
  return recoveryPreemptPromise
}
const onOpenRecovery = () => {
  void openRecoveryPreempting()
}
const onRecoveryReturnRequest = async () => {
  if (await consumeRecoveryReturn()) await openRecoveryPreempting()
}
const onFocusReturnRequest = async () => {
  await consumeFocusReturn()
  void router.replace(app.lock.session ? '/lock' : '/focus')
}
const onLockReturnRequest = async () => {
  await consumeLockReturn()
  void router.replace('/lock')
}
onMounted(async () => {
  window.addEventListener('open-recovery', onOpenRecovery)
  window.addEventListener('recovery-return-request', onRecoveryReturnRequest)
  window.addEventListener('focus-return-request', onFocusReturnRequest)
  window.addEventListener('lock-return-request', onLockReturnRequest)
  await app.init()
  if (await consumeFocusReturn()) {
    if (app.lock.session) await router.replace('/lock')
    else if (app.focus.session) await router.replace('/focus')
  }
  if (await consumeLockReturn()) await router.replace('/lock')
  if (await consumeRecoveryReturn()) await openRecoveryPreempting()
  void updates.init()
  if (native) {
    await CapacitorApp.addListener('appStateChange', (state) => {
      if (state.isActive) {
        void app.tick()
        void updates.refresh().catch(() => {})
        void updates.check()
      }
    })
    await CapacitorApp.addListener('backButton', () => {
      const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]')
      if (dialogs.length)
        dialogs[dialogs.length - 1]!.dispatchEvent(
          new Event('cancel'),
        )
      else if (route.path === '/rest') document.dispatchEvent(new Event('rest-exit-request'))
      else if (isStudySessionLocked(app.focus.session)) {
        if (route.path === '/focus') app.notify('学霸模式进行中，结束后可返回')
        else void router.replace('/focus')
      } else if (route.path === '/focus') void router.replace('/tasks')
      else if (route.path !== '/tasks') void router.replace('/tasks')
      else void CapacitorApp.minimizeApp()
    })
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('open-recovery', onOpenRecovery)
  window.removeEventListener('recovery-return-request', onRecoveryReturnRequest)
  window.removeEventListener('focus-return-request', onFocusReturnRequest)
  window.removeEventListener('lock-return-request', onLockReturnRequest)
})
</script>
<template>
  <div class="app-shell" :class="{ fullscreen: full }">
    <div v-if="!app.ready && !app.error" class="boot">
      <span class="wordmark">小猫专注</span>
      <p>把时间留给认真生活的自己</p>
    </div>
    <template v-else
      ><div v-if="app.error" role="alert" class="error-banner">
        {{ app.error }}<button v-if="app.ready" @click="app.error = ''">关闭</button>
      </div>
      <main
        @touchstart.passive="swipe.start"
        @touchmove="swipe.move"
        @touchend="swipe.end"
        @touchcancel="swipe.reset"
      >
        <RouterView />
      </main>
      <nav v-if="!full" class="tabbar" aria-label="主导航">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.path"
          :to="tab.path"
          :aria-label="tab.path === '/settings' && updates.hasUpdate ? '我的，有新版本' : tab.label"
          :aria-current="route.path === tab.path ? 'page' : undefined"
          ><Icon :name="tab.icon" :size="25" /><span
            v-if="tab.path === '/settings' && updates.hasUpdate"
            class="nav-update-dot"
            aria-hidden="true"
        /></RouterLink></nav></template
    ><Sheet
      :open="!!app.strictConfirmation"
      title="开始严格倒计时"
      @close="app.confirmStrictStart(false)"
    >
      <div class="stack">
        <p>已开启严格倒计时：开始后不能暂停、取消或提前结束，是否开始？</p>
        <div class="form-footer">
          <button type="button" class="secondary" @click="app.confirmStrictStart(false)">取消</button>
          <button type="button" class="primary" @click="app.confirmStrictStart(true)">确认开始</button>
        </div>
      </div>
    </Sheet><RecoverySheet :open="recoveryOpen" @close="recoveryOpen = false" /><Transition name="toast"
      ><div v-if="app.toast" ref="toastEl" popover="manual" class="toast" role="status">{{ app.toast }}</div></Transition
    >
  </div>
</template>
<style scoped>
.toast[popover] {
  inset: auto auto 110px 50%;
  margin: 0;
  border: 0;
  padding: 12px 20px;
  width: max-content;
  max-width: min(85%, 430px);
  overflow: visible;
  color: white;
  background: #222f;
}
.toast[popover]::backdrop {
  display: none;
}
</style>
