<script setup lang="ts">
import { onBeforeUnmount, onMounted, computed, watch, ref, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App as CapacitorApp } from '@capacitor/app'
import { consumeFocusReturn, consumeLockReturn, consumeRecoveryReturn, resolveMainEntry, native, onNativeOverlayEvent, syncFocusOverlayState } from './platform/bridge'
import { notifyNativeSplashReady } from './platform/splash'
import { useApp } from './stores/app'
import Icon from './components/Icon.vue'
import Sheet from './components/Sheet.vue'
import RecoverySheet from './components/RecoverySheet.vue'
import UpdateSettings from './components/UpdateSettings.vue'
import { waitForDialogClose } from './components/sheetClose'
import { createTabSwipe } from './navigation/tabSwipe'
import { isStudyFocusSafePath, isStudySessionLocked } from './navigation/mainEntry'
import { shouldAutoPromptUpdate, readDismissedUpdateCode, saveDismissedUpdateCode } from './domain/updatePrompt'
import { useUpdates } from './stores/updates'
const app = useApp(),
  recoveryOpen = ref(false),
  updatePromptOpen = ref(false),
  promptedReleaseCode = ref<number | null>(null),
  dismissedReleaseCode = ref<number | null>(readDismissedUpdateCode()),
  updatePromptBusy = ref(false),
  toastEl = ref<HTMLElement | null>(null),
  updates = useUpdates(),
  route = useRoute(),
  router = useRouter(),
  full = computed(
    () =>
      ['/rest', '/lock', '/permissions', '/help', '/emergency', '/recovery', '/tasks'].includes(route.path) ||
      (route.path === '/focus' && Boolean(app.focus.session || app.lastResult)),
  )
watch(
  [
    () => app.ready,
    () => route.path,
    () => app.focus.session?.id,
    () => app.focus.session?.protection?.study,
    () => app.lock.session?.id,
  ],
  () => {
    if (native && app.ready) void syncFocusOverlayState(route.path)
  },
)
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
  { path: '/focus', label: '专注', icon: 'timer' },
  { path: '/calendar', label: '时间轴', icon: 'calendar' },
  { path: '/cat', label: '农场', icon: 'cat' },
  { path: '/statistics', label: '统计', icon: 'statistics' },
  { path: '/settings', label: '我的', icon: 'user' },
]
const swipe = createTabSwipe({
  paths: tabs.map((tab) => tab.path),
  currentPath: () => route.path,
  isBlocked: () => !app.ready || isStudySessionLocked(app.focus.session),
  navigate: (path) => void router.replace(path),
})
function maybeOpenUpdatePrompt() {
  const releaseCode = updates.state?.release?.versionCode ?? null
  if (
    shouldAutoPromptUpdate({
      native,
      ready: app.ready,
      releaseCode,
      promptedCode: promptedReleaseCode.value,
      dismissedCode: dismissedReleaseCode.value,
      hasActiveSession: Boolean(app.focus.session || app.rest.session || app.lock.session),
      isFullscreenRoute: full.value,
      hasOpenDialog:
        typeof document !== 'undefined' && document.querySelectorAll('dialog[open]').length > 0,
      recoveryOpen: recoveryOpen.value,
      strictConfirmationOpen: Boolean(app.strictConfirmation),
    })
  ) {
    promptedReleaseCode.value = releaseCode
    updatePromptOpen.value = true
  }
}
function dismissUpdatePrompt(persistForVersion: boolean) {
  updatePromptOpen.value = false
  const releaseCode = updates.state?.release?.versionCode ?? null
  if (persistForVersion && releaseCode !== null && releaseCode > 0) {
    dismissedReleaseCode.value = releaseCode
    saveDismissedUpdateCode(releaseCode)
  }
}
watch(
  [() => updates.startupChecked, () => updates.state?.release?.versionCode, () => app.ready, full],
  ([checked]) => {
    if (checked) maybeOpenUpdatePrompt()
  },
  { flush: 'post' },
)
watch(
  [() => Boolean(app.focus.session || app.rest.session || app.lock.session), full],
  ([active, isFull]) => {
    if (active || isFull) updatePromptOpen.value = false
  },
)
watch(
  () => app.sheetCloseSignal,
  () => {
    updatePromptOpen.value = false
  },
)
let recoveryPreemptPromise: Promise<void> | null = null
async function openRecoveryPreempting() {
  if (recoveryOpen.value) return
  if (recoveryPreemptPromise) return recoveryPreemptPromise
  recoveryPreemptPromise = (async () => {
    updatePromptOpen.value = false
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
function scheduleSplashReady() {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(() => notifyNativeSplashReady()))
  } else {
    notifyNativeSplashReady()
  }
}
const onCloseSheets = () => {
  updatePromptOpen.value = false
}
let stopOverlayEvents: (() => void) | undefined
onMounted(async () => {
  window.addEventListener('open-recovery', onOpenRecovery)
  window.addEventListener('recovery-return-request', onRecoveryReturnRequest)
  window.addEventListener('focus-return-request', onFocusReturnRequest)
  window.addEventListener('lock-return-request', onLockReturnRequest)
  window.addEventListener('ux-close-sheets', onCloseSheets)
  try {
    await app.init()
    if (await consumeFocusReturn()) {
      if (app.lock.session) await router.replace('/lock')
      else if (app.focus.session) await router.replace('/focus')
    }
    if (await consumeLockReturn()) await router.replace('/lock')
    if (await consumeRecoveryReturn()) await openRecoveryPreempting()
    void updates.init()
    if (native) {
      void syncFocusOverlayState(route.path)
      stopOverlayEvents = await onNativeOverlayEvent({
        onNavigate: (path) => {
          void router.push(path)
        },
        onSessionChanged: () => {
          void app.tick()
        },
        onWhiteNoisePaused: () => {
          if (app.data.preferences.whiteNoise && app.data.preferences.whiteNoise !== 'off') {
            void app
              .mutate((d) => {
                d.preferences.whiteNoise = 'off'
              })
              .catch(() => {})
          }
          app.notify('音频输出已断开，白噪音已自动暂停')
        },
      })
      await CapacitorApp.addListener('appStateChange', (state) => {
        if (state.isActive) {
          void syncFocusOverlayState(route.path)
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
        } else if (route.path === '/focus') {
          if (app.focus.session) {
            app.notify('专注进行中，请在页面内暂停、取消或结束')
          } else if (app.lastResult) {
            app.dismissResult()
          } else {
            void CapacitorApp.minimizeApp()
          }
        } else {
          void router.replace('/focus')
        }
      })
    }
  } finally {
    await router.isReady().catch(() => {})
    await nextTick()
    scheduleSplashReady()
  }
})
onBeforeUnmount(() => {
  stopOverlayEvents?.()
  window.removeEventListener('open-recovery', onOpenRecovery)
  window.removeEventListener('recovery-return-request', onRecoveryReturnRequest)
  window.removeEventListener('focus-return-request', onFocusReturnRequest)
  window.removeEventListener('lock-return-request', onLockReturnRequest)
  window.removeEventListener('ux-close-sheets', onCloseSheets)
})
</script>
<template>
  <div class="app-shell" :class="{ fullscreen: full }">
    <div v-if="!app.ready && !app.error" class="boot" :class="{ 'boot-native': native }">
      <template v-if="!native">
        <span class="wordmark">小猫专注</span>
        <p>专注此刻，陪小猫一起长大</p>
      </template>
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
    </Sheet><Sheet
      :open="updatePromptOpen"
      :title="updates.state?.phase === 'ready' ? '更新已就绪' : '发现新版本'"
      :close-disabled="updatePromptBusy"
      @close="dismissUpdatePrompt(updates.state?.phase !== 'downloading')"
    >
      <UpdateSettings
        view="about"
        compact
        @busy-change="updatePromptBusy = $event"
        @dismiss="dismissUpdatePrompt(true)"
        @hide="dismissUpdatePrompt(false)"
      />
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
