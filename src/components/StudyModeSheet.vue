<script lang="ts">
export type SheetView =
  | 'home'
  | 'apps'
  | 'whitelist'
  | 'strict'
  | 'wallpaperConsent'
  | 'quiet'
  | 'permissions'
  | 'permissionGuide'
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import {
  defaultProtection,
  type AppsSubKey,
  type LauncherStatus,
  type ProtectionModuleKey,
  type ProtectionStatus,
  type QuietSubKey,
  type RecentTasksStatus,
  type StrictSubKey,
  type WallpaperStatus,
} from '../domain/model'
import {
  getModuleSubItems,
  isModuleCustomized,
  migrateProtectionPreferences,
  moduleSummaryText,
  resetProtectionModuleDefault,
  setProtectionSubItem,
  toggleMasterStudy,
  toggleProtectionModule,
} from '../domain/protectionModules'
import {
  collectRequiredPermissions,
  type RequiredPermissionItem,
  type StudyPermissionId,
} from '../domain/studyPermissions'
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import {
  native,
  openBatteryOptimizationSettings,
  permissionStatus,
  protectionDriver,
  requestNotifications,
  type SystemPermissions,
} from '../platform/bridge'
import { dndDriver, type DndStatus } from '../platform/dnd'
import { notificationDriver, type NotificationStatus } from '../platform/notifications'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import AppWhitelistEditor from './AppWhitelistEditor.vue'
import { waitForDialogClose } from './sheetClose'

const props = withDefaults(defineProps<{ open: boolean; initialView?: SheetView }>(), {
  initialView: 'home',
})
const emit = defineEmits<{ close: [] }>()
const app = useApp()
const router = useRouter()

const view = ref<SheetView>(props.initialView)
const prefs = computed(() =>
  migrateProtectionPreferences(app.data.preferences.protection ?? defaultProtection()),
)
const modules = computed(() => prefs.value.modules!)
const masterEnabled = computed(() => Boolean(modules.value.master))
const appsSub = computed(() => getModuleSubItems('apps', modules.value.apps))
const strictSub = computed(() => getModuleSubItems('strict', modules.value.strict))
const quietSub = computed(() => getModuleSubItems('quiet', modules.value.quiet))

const status = ref<ProtectionStatus | null>(null)
const dndStatus = ref<DndStatus | null>(null)
const notificationStatus = ref<NotificationStatus | null>(null)
const recentTasksStatus = ref<RecentTasksStatus | null>(null)
const launcherStatus = ref<LauncherStatus | null>(null)
const wallpaperStatus = ref<WallpaperStatus | null>(null)
const systemPermissions = ref<SystemPermissions>({
  notifications: false,
  exactAlarms: false,
  batteryOptimizationIgnored: false,
  foregroundServiceActive: false,
})

const error = ref('')
const readError = ref('')
const busy = ref(false)
const pendingBatteryFeedback = ref(false)
const pendingOptionalGrant = ref<'dnd' | 'notificationListener' | null>(null)
const limitsAccepted = ref(false)
const originalMatches = ref(false)

let revision = 0
let timer: ReturnType<typeof setInterval> | undefined
let pollingActive = false

watch(
  () => [props.open, props.initialView] as const,
  ([open, initial], [wasOpen, prevInitial]) => {
    if (open && (!wasOpen || initial !== prevInitial)) {
      view.value = initial ?? 'home'
      error.value = ''
      readError.value = ''
      pendingOptionalGrant.value = null
      limitsAccepted.value = false
      originalMatches.value = false
    }
    if (open && !wasOpen) {
      startPolling()
    } else if (!open && wasOpen) {
      stopPolling()
    }
  },
)

const backLabel = computed<string | undefined>(() => {
  if (view.value === 'home') return undefined
  if (view.value === 'whitelist') return '应用限制'
  if (view.value === 'wallpaperConsent') return '严格模式'
  return '学霸模式'
})

function goBack() {
  error.value = ''
  if (view.value === 'whitelist') {
    view.value = 'apps'
  } else if (view.value === 'wallpaperConsent') {
    view.value = 'strict'
  } else {
    view.value = 'home'
  }
}

const permissionReady = () => !!(status.value?.supported && status.value.authorized && status.value.connected)

const requiredPermissions = computed(() =>
  collectRequiredPermissions(prefs.value, {
    protection: status.value,
    dnd: dndStatus.value,
    notification: notificationStatus.value,
    recentTasks: recentTasksStatus.value,
    launcher: launcherStatus.value,
    wallpaper: wallpaperStatus.value,
  }),
)

const missingPermissions = computed(() =>
  requiredPermissions.value.filter((item) => item.supported && !item.ready),
)

const strictMissingPermissions = computed(() =>
  missingPermissions.value.filter(
    (item) =>
      item.id === 'accessibility' ||
      item.id === 'controlNotification' ||
      item.id === 'wallpaperBaseline',
  ),
)

const quietMissingPermissions = computed(() =>
  missingPermissions.value.filter(
    (item) => item.id === 'dnd' || item.id === 'notificationListener',
  ),
)

const permissionMap = computed(() => {
  const map = new Map<StudyPermissionId, RequiredPermissionItem>()
  for (const item of requiredPermissions.value) map.set(item.id, item)
  return map
})

const optionalMissingForGuide = computed<RequiredPermissionItem[]>(() => {
  const items: RequiredPermissionItem[] = []
  if (dndStatus.value?.supported && !dndStatus.value.permissionGranted) {
    items.push({
      id: 'dnd',
      title: '勿扰权限',
      level: 'optional',
      usedBy: ['免打扰 · 静音与振动'],
      purpose: '减少通知声音与振动干扰，保留来电、闹钟与媒体。',
      supported: true,
      authorized: false,
      connected: false,
      ready: false,
      statusText: '未授权 · 未生效',
      actionLabel: '前往勿扰设置',
    })
  }
  if (
    notificationStatus.value?.supported &&
    (!notificationStatus.value.authorized || !notificationStatus.value.connected)
  ) {
    items.push({
      id: 'notificationListener',
      title: '通知使用权',
      level: 'optional',
      usedBy: ['免打扰 · 拦截通知'],
      purpose: '专注期间先收起非白名单应用的普通通知并在结束后释放，不保存正文。',
      supported: true,
      authorized: Boolean(notificationStatus.value.authorized),
      connected: Boolean(notificationStatus.value.connected),
      ready: false,
      statusText: notificationStatus.value.authorized ? '已授权 · 等待连接' : '未授权 · 未生效',
      actionLabel: notificationStatus.value.authorized ? '重新连接监听' : '前往通知访问',
    })
  }
  return items
})

const onboardingPermissions = computed<RequiredPermissionItem[]>(() => [
  {
    id: 'accessibility',
    title: '无障碍服务',
    level: 'required',
    usedBy: ['应用限制 · 限制白名单外应用'],
    purpose: '在系统无障碍设置中开启“小猫专注”，用于识别并限制名单外应用，不读取应用正文。',
    supported: Boolean(status.value?.supported),
    authorized: Boolean(status.value?.authorized),
    connected: Boolean(status.value?.connected),
    ready: permissionReady(),
    statusText: permissionReady()
      ? '已就绪'
      : !status.value?.authorized
        ? '未授权 · 必需'
        : '已授权 · 等待服务连接',
    actionLabel: '前往系统设置',
  },
  ...optionalMissingForGuide.value,
])

const guidePermissions = computed(() =>
  missingPermissions.value.length > 0
    ? missingPermissions.value
    : onboardingPermissions.value.filter((item) => item.supported && !item.ready),
)

const sheetTitle = computed(() => {
  switch (view.value) {
    case 'home':
      return '学霸模式'
    case 'apps':
      return '应用限制'
    case 'whitelist':
      return '全局白名单'
    case 'strict':
      return '严格模式'
    case 'wallpaperConsent':
      return '壁纸辅助保护说明'
    case 'quiet':
      return '免打扰'
    case 'permissions':
      return '权限与使用帮助'
    case 'permissionGuide':
      return guidePermissions.value.length > 0
        ? `还差 ${guidePermissions.value.length} 项权限`
        : '权限与授权引导'
  }
})

const masterSubtitle = computed(() => {
  if (status.value && !status.value.supported) return '仅 Android 可用'
  return '专注期间锁定专注页，限制分心应用'
})

async function saveStudy(study: boolean) {
  const dndReady = Boolean(dndStatus.value?.supported && dndStatus.value.permissionGranted)
  const notifReady = Boolean(
    notificationStatus.value?.supported &&
      notificationStatus.value.authorized &&
      notificationStatus.value.connected,
  )
  const wasInitialized = Boolean(modules.value.initialized)
  await app.mutate((d) => {
    d.preferences.protection = toggleMasterStudy(
      d.preferences.protection ?? defaultProtection(),
      study,
      study && !wasInitialized
        ? {
            quietDefault: dndReady || notifReady,
            quietSubDefaults: { sound: dndReady, intercept: notifReady },
          }
        : undefined,
    )
  })
}

async function refresh() {
  const request = ++revision
  const [protRes, dndRes, notifRes, recentRes, launcherRes, wallpaperRes, sysRes] = await Promise.allSettled([
    protectionDriver.status(),
    dndDriver.read(),
    notificationDriver.read(),
    protectionDriver.recentTasks(),
    protectionDriver.launcher(),
    protectionDriver.wallpaper(),
    permissionStatus(),
  ])
  if (request !== revision) return
  if (dndRes.status === 'fulfilled') dndStatus.value = dndRes.value
  if (notifRes.status === 'fulfilled') notificationStatus.value = notifRes.value
  if (recentRes.status === 'fulfilled') recentTasksStatus.value = recentRes.value
  if (launcherRes.status === 'fulfilled') launcherStatus.value = launcherRes.value
  if (wallpaperRes.status === 'fulfilled') wallpaperStatus.value = wallpaperRes.value
  if (sysRes.status === 'fulfilled' && sysRes.value) {
    systemPermissions.value = {
      ...systemPermissions.value,
      ...sysRes.value,
    }
    if (pendingBatteryFeedback.value && sysRes.value.batteryOptimizationIgnored) {
      pendingBatteryFeedback.value = false
      app.notify('已允许后台运行')
    }
  }

  if (protRes.status === 'fulfilled') {
    status.value = protRes.value
    readError.value = ''
  } else {
    status.value = null
    readError.value =
      protRes.reason instanceof Error ? protRes.reason.message : String(protRes.reason)
  }

  // Auto-enable an optional quiet sub-item when returning from the guide after granting.
  if (pendingOptionalGrant.value === 'dnd' && dndStatus.value?.supported && dndStatus.value.permissionGranted) {
    pendingOptionalGrant.value = null
    await app.mutate((d) => {
      let next = toggleProtectionModule(d.preferences.protection ?? defaultProtection(), 'quiet', true)
      next = setProtectionSubItem(next, 'quiet', 'sound', true)
      d.preferences.protection = next
    })
  } else if (
    pendingOptionalGrant.value === 'notificationListener' &&
    notificationStatus.value?.supported &&
    notificationStatus.value.authorized &&
    notificationStatus.value.connected
  ) {
    pendingOptionalGrant.value = null
    await app.mutate((d) => {
      let next = toggleProtectionModule(d.preferences.protection ?? defaultProtection(), 'quiet', true)
      next = setProtectionSubItem(next, 'quiet', 'intercept', true)
      d.preferences.protection = next
    })
  }
}

function visibility() {
  if (props.open && !document.hidden) void refresh()
}

function onFocusRefresh() {
  if (props.open) void refresh()
}

function startPolling() {
  if (pollingActive) return
  pollingActive = true
  void refresh()
  timer = setInterval(visibility, 2000)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('focus', onFocusRefresh)
  window.addEventListener('protection-recovered', onFocusRefresh)
}

function stopPolling() {
  revision++
  if (!pollingActive) return
  pollingActive = false
  clearInterval(timer)
  timer = undefined
  document.removeEventListener('visibilitychange', visibility)
  window.removeEventListener('focus', onFocusRefresh)
  window.removeEventListener('protection-recovered', onFocusRefresh)
}

onMounted(() => {
  if (props.open) startPolling()
})

onBeforeUnmount(() => {
  stopPolling()
})

async function openRoute(path: '/permissions' | '/help' | '/help#help-keepalive') {
  if (busy.value) return
  emit('close')
  await waitForDialogClose()
  await router?.push(path)
}

async function openBatteryKeepAlive() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  pendingBatteryFeedback.value = !systemPermissions.value.batteryOptimizationIgnored
  try {
    await openBatteryOptimizationSettings()
    await refresh()
  } catch (e) {
    pendingBatteryFeedback.value = false
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function openRecovery() {
  if (busy.value) return
  emit('close')
  await waitForDialogClose()
  window.dispatchEvent(new Event('open-recovery'))
}

async function toggleStudy(event: Event) {
  const target = event.target as HTMLInputElement
  const checked = target.checked
  target.checked = masterEnabled.value
  if (busy.value || (checked && !status.value?.supported)) return
  busy.value = true
  error.value = ''
  try {
    await saveStudy(checked)
    if (!checked) {
      app.clearStrictAcknowledged?.()
      emit('close')
      return
    }
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function toggleModule(moduleKey: ProtectionModuleKey, event: Event) {
  const target = event.target as HTMLInputElement
  const checked = target.checked
  const current = modules.value[moduleKey].enabled
  target.checked = current
  if (busy.value) return
  if (moduleKey !== 'strict' && checked && !status.value?.supported) return
  busy.value = true
  error.value = ''
  try {
    await app.mutate((d) => {
      d.preferences.protection = toggleProtectionModule(
        d.preferences.protection ?? defaultProtection(),
        moduleKey,
        checked,
      )
    })
    if (moduleKey === 'strict') {
      if (checked && strictSub.value.noPauseEnd) {
        app.acknowledgeStrict?.()
        app.notify('开启后倒计时不可中途暂停或提前结束，正计时不受影响')
      } else {
        app.clearStrictAcknowledged?.()
        if (app.focus?.session || app.lock?.session) {
          app.notify(
            app.lock?.session && !app.focus?.session
              ? '设置已保存，将用于下一轮锁机'
              : '设置已保存，将用于下一轮专注',
          )
        }
      }
    } else if (app.focus?.session || app.lock?.session) {
      app.notify(
        app.lock?.session && !app.focus?.session
          ? '设置已保存，将用于下一轮锁机'
          : '设置已保存，将用于下一轮专注',
      )
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function setSubItem(moduleKey: ProtectionModuleKey, subKey: string, checked: boolean) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await app.mutate((d) => {
      d.preferences.protection = setProtectionSubItem(
        d.preferences.protection ?? defaultProtection(),
        moduleKey,
        subKey,
        checked,
      )
    })
    if (moduleKey === 'strict' && subKey === 'noPauseEnd') {
      if (checked) {
        app.acknowledgeStrict?.()
        app.notify('开启后倒计时不可中途暂停或提前结束，正计时不受影响')
      } else {
        app.clearStrictAcknowledged?.()
      }
    } else if (moduleKey === 'strict' && subKey === 'wallpaper' && !checked) {
      app.notify('壁纸偏好已关闭，将用于下一轮')
    } else if (app.focus?.session || app.lock?.session) {
      app.notify('设置已保存，将用于下一轮')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function toggleSubItem(moduleKey: ProtectionModuleKey, subKey: string, event: Event) {
  const target = event.target as HTMLInputElement
  const checked = target.checked
  const current =
    moduleKey === 'apps'
      ? appsSub.value[subKey as AppsSubKey]
      : moduleKey === 'strict'
        ? strictSub.value[subKey as StrictSubKey]
        : quietSub.value[subKey as QuietSubKey]
  target.checked = current
  if (busy.value) return
  const needsAndroid = !(moduleKey === 'strict' && subKey === 'noPauseEnd')
  if (needsAndroid && checked && !status.value?.supported) return

  if (moduleKey === 'strict' && subKey === 'wallpaper' && checked && !wallpaperStatus.value?.prepared) {
    limitsAccepted.value = false
    originalMatches.value = false
    error.value = ''
    view.value = 'wallpaperConsent'
    return
  }
  await setSubItem(moduleKey, subKey, checked)
}

async function resetModule(moduleKey: ProtectionModuleKey) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await app.mutate((d) => {
      d.preferences.protection = resetProtectionModuleDefault(
        d.preferences.protection ?? defaultProtection(),
        moduleKey,
      )
    })
    if (moduleKey === 'strict') {
      if (modules.value.strict.enabled) app.acknowledgeStrict?.()
      else app.clearStrictAcknowledged?.()
    }
    app.notify('已恢复推荐默认')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function saveApps(packages: string[]) {
  busy.value = true
  error.value = ''
  try {
    await app.mutate((d) => {
      const migrated = migrateProtectionPreferences(d.preferences.protection ?? defaultProtection())
      d.preferences.protection = { ...migrated, globalWhitelist: packages }
    })
    view.value = 'apps'
    app.notify(
      app.focus?.session
        ? '白名单已保存，将用于下一轮专注'
        : app.lock?.session
          ? '白名单已保存，将用于下一轮锁机'
          : '全局白名单已保存',
    )
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function authorizePermission(id: StudyPermissionId, fromGuide = false) {
  if (busy.value) return
  if (id === 'wallpaperBaseline') {
    limitsAccepted.value = false
    originalMatches.value = false
    error.value = ''
    view.value = 'wallpaperConsent'
    return
  }
  busy.value = true
  error.value = ''
  try {
    if (id === 'accessibility') {
      await protectionDriver.openSettings()
    } else if (id === 'dnd') {
      if (fromGuide) pendingOptionalGrant.value = 'dnd'
      await dndDriver.openSettings()
    } else if (id === 'notificationListener') {
      if (fromGuide) pendingOptionalGrant.value = 'notificationListener'
      const n = notificationStatus.value
      if (n?.authorized && !n?.connected && notificationDriver.rebind) {
        await notificationDriver.rebind()
      } else {
        await notificationDriver.openSettings()
      }
    } else if (id === 'controlNotification') {
      await requestNotifications()
    }
    await refresh()
  } catch (e) {
    if (fromGuide) pendingOptionalGrant.value = null
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function handleMissingPermissions(items: RequiredPermissionItem[]) {
  if (items.length === 1) {
    await authorizePermission(items[0]!.id)
  } else if (items.length > 1) {
    error.value = ''
    view.value = 'permissionGuide'
  }
}

async function prepareWallpaperBaseline() {
  if (busy.value || !limitsAccepted.value || !originalMatches.value) return
  busy.value = true
  error.value = ''
  revision++
  try {
    const result = await protectionDriver.prepareWallpaper(
      limitsAccepted.value,
      originalMatches.value,
    )
    wallpaperStatus.value = result
    if (!result.prepared) throw new Error(result.error || '原状态未保存')
    await app.mutate((d) => {
      d.preferences.protection = setProtectionSubItem(
        d.preferences.protection ?? defaultProtection(),
        'strict',
        'wallpaper',
        true,
      )
    })
    view.value = 'strict'
    app.notify('原壁纸状态已保存；开始后需在系统选择器确认')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function importWallpaperOriginal(lockSource: boolean) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  revision++
  try {
    wallpaperStatus.value = await protectionDriver.importWallpaperOriginal(lockSource)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function subItemMissingPerm(id: StudyPermissionId): RequiredPermissionItem | undefined {
  const item = permissionMap.value.get(id)
  if (!item || !item.supported || item.ready) return undefined
  return item
}
</script>

<template>
  <Sheet
    :open="props.open"
    :title="sheetTitle"
    :back-label="backLabel"
    :close-disabled="busy"
    @back="goBack"
    @close="emit('close')"
  >
    <!-- 主页 -->
    <div v-if="view === 'home'" class="study-stack">
      <div class="master-card">
        <label class="switch">
          <span>
            学霸模式
            <small>{{ masterSubtitle }}</small>
          </span>
          <input
            type="checkbox"
            :checked="masterEnabled"
            :disabled="capabilityToggleDisabled(masterEnabled, status?.supported, busy)"
            @change="toggleStudy"
          />
        </label>
        <div v-if="masterEnabled && (missingPermissions.length > 0 || status?.supported)" class="master-status">
          <button
            v-if="missingPermissions.length > 0"
            type="button"
            class="status-action warn"
            @click="view = 'permissionGuide'"
          >
            <Icon name="warning" :size="14" />还差 {{ missingPermissions.length }} 项权限 · 去处理
            <Icon name="right" :size="14" />
          </button>
          <span v-else-if="status?.supported" class="status-action ok">已就绪</span>
        </div>
      </div>

      <div class="modules-list" :class="{ 'modules-dimmed': !masterEnabled }">
        <div class="module-row">
          <button type="button" class="module-nav" @click="view = 'apps'">
            <Icon name="shield" :size="19" />
            <span class="module-text">
              <strong>应用限制</strong>
              <small>{{ moduleSummaryText('apps', prefs) }}</small>
            </span>
            <Icon name="right" :size="16" />
          </button>
          <label class="switch switch-compact" aria-label="开启应用限制">
            <input
              type="checkbox"
              :checked="modules.apps.enabled"
              :disabled="capabilityToggleDisabled(modules.apps.enabled, status?.supported, busy)"
              @change="toggleModule('apps', $event)"
            />
          </label>
        </div>

        <div class="module-row">
          <button type="button" class="module-nav" @click="view = 'strict'">
            <Icon name="clock" :size="19" />
            <span class="module-text">
              <strong>严格模式</strong>
              <small>{{ moduleSummaryText('strict', prefs) }}</small>
            </span>
            <Icon name="right" :size="16" />
          </button>
          <label class="switch switch-compact" aria-label="开启严格模式">
            <input
              type="checkbox"
              :checked="modules.strict.enabled"
              :disabled="busy"
              @change="toggleModule('strict', $event)"
            />
          </label>
        </div>

        <div class="module-row">
          <button type="button" class="module-nav" @click="view = 'quiet'">
            <Icon name="bellOff" :size="19" />
            <span class="module-text">
              <strong>免打扰</strong>
              <small>{{ moduleSummaryText('quiet', prefs) }}</small>
            </span>
            <Icon name="right" :size="16" />
          </button>
          <label class="switch switch-compact" aria-label="开启免打扰">
            <input
              type="checkbox"
              :checked="modules.quiet.enabled"
              :disabled="capabilityToggleDisabled(modules.quiet.enabled, status?.supported, busy)"
              @change="toggleModule('quiet', $event)"
            />
          </label>
        </div>
      </div>

      <p v-if="app.focus?.session || app.lock?.session" class="session-note">
        {{ app.lock?.session && !app.focus?.session ? '修改用于下一轮锁机' : '修改用于下一轮专注' }}
      </p>

      <p v-if="error || readError" class="form-error" role="alert">{{ error || readError }}</p>
      <button type="button" class="primary wide" @click="emit('close')">完成</button>
      <button type="button" class="text-button study-help-entry" @click="view = 'permissions'">
        权限与使用帮助 <Icon name="right" :size="14" />
      </button>
    </div>

    <!-- 应用限制详情 -->
    <div v-else-if="view === 'apps'" class="study-stack">
      <div class="detail-module-row">
        <label class="switch">
          <span>
            开启应用限制
            <small>开始专注后，仅允许本轮白名单中的应用与必要系统交互。</small>
          </span>
          <input
            type="checkbox"
            :checked="modules.apps.enabled"
            :disabled="capabilityToggleDisabled(modules.apps.enabled, status?.supported, busy)"
            @change="toggleModule('apps', $event)"
          />
        </label>
      </div>

      <button
        v-if="subItemMissingPerm('accessibility')"
        type="button"
        class="top-perm-banner"
        :disabled="busy"
        @click="authorizePermission('accessibility')"
      >
        <Icon name="warning" :size="16" />
        <span>还差无障碍权限 · 去授权</span>
        <Icon name="right" :size="16" />
      </button>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            限制白名单外应用
            <small>暂停期间仍限制名单外应用</small>
          </span>
          <input
            type="checkbox"
            :checked="appsSub.restrict"
            :disabled="capabilityToggleDisabled(appsSub.restrict, status?.supported, busy)"
            @change="toggleSubItem('apps', 'restrict', $event)"
          />
        </label>
      </div>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            允许临时放行（每轮 3 次）
            <small>严格倒计时期间不可临时放行</small>
          </span>
          <input
            type="checkbox"
            :checked="appsSub.temporaryAccess"
            :disabled="capabilityToggleDisabled(appsSub.temporaryAccess, status?.supported, busy)"
            @change="toggleSubItem('apps', 'temporaryAccess', $event)"
          />
        </label>
      </div>

      <button
        type="button"
        class="menu-row"
        :disabled="busy || !status?.supported"
        @click="view = 'whitelist'"
      >
        <span>
          白名单应用
          <small>{{ prefs.globalWhitelist.length }} 个已选 · 小猫与电话/输入法始终允许</small>
        </span>
        <Icon name="right" :size="18" />
      </button>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button
        type="button"
        class="secondary wide"
        :disabled="busy || !isModuleCustomized('apps', modules.apps)"
        @click="resetModule('apps')"
      >
        恢复推荐默认
      </button>
    </div>

    <!-- 全局白名单内联页 -->
    <AppWhitelistEditor
      v-else-if="view === 'whitelist'"
      inline
      :open="view === 'whitelist'"
      title="全局白名单"
      :packages="prefs.globalWhitelist"
      :saving="busy"
      :save-error="error"
      @close="view = 'apps'"
      @confirm="saveApps"
    />

    <!-- 严格模式详情 -->
    <div v-else-if="view === 'strict'" class="study-stack">
      <div class="detail-module-row">
        <label class="switch">
          <span>
            开启严格模式
            <small>开启后倒计时不可暂停，切出桌面会拉回。</small>
          </span>
          <input
            type="checkbox"
            :checked="modules.strict.enabled"
            :disabled="busy"
            @change="toggleModule('strict', $event)"
          />
        </label>
      </div>

      <button
        v-if="strictMissingPermissions.length > 0"
        type="button"
        class="top-perm-banner"
        :disabled="busy"
        @click="handleMissingPermissions(strictMissingPermissions)"
      >
        <Icon name="warning" :size="16" />
        <span>
          {{
            strictMissingPermissions.length === 1
              ? `还差${strictMissingPermissions[0]!.title} · 去授权`
              : `还差 ${strictMissingPermissions.length} 项权限 · 去处理`
          }}
        </span>
        <Icon name="right" :size="16" />
      </button>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            倒计时不可暂停、不可提前结束
            <small>正计时不受影响</small>
          </span>
          <input
            type="checkbox"
            :checked="strictSub.noPauseEnd"
            :disabled="busy"
            @change="toggleSubItem('strict', 'noPauseEnd', $event)"
          />
        </label>
      </div>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            限制桌面与最近任务
            <small>需无障碍 · 切出桌面或任务切换时返回专注</small>
          </span>
          <input
            type="checkbox"
            :checked="strictSub.navigation"
            :disabled="capabilityToggleDisabled(strictSub.navigation, status?.supported, busy)"
            @change="toggleSubItem('strict', 'navigation', $event)"
          />
        </label>
      </div>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            精确防关闭
            <small>需无障碍 · 仅拦截小猫自身的强退、撤权与卸载入口</small>
          </span>
          <input
            type="checkbox"
            :checked="strictSub.antiClose"
            :disabled="capabilityToggleDisabled(strictSub.antiClose, status?.supported, busy)"
            @change="toggleSubItem('strict', 'antiClose', $event)"
          />
        </label>
      </div>

      <details class="advanced-disclosure">
        <summary>
          <span>进阶防绕过（可能影响日常使用）</span>
          <Icon name="down" :size="16" />
        </summary>
        <div class="disclosure-body">
          <div class="sub-item-row">
            <label class="switch">
              <span>
                隐藏最近任务卡片
                <small>仅隐藏小猫自己的卡片，结束后恢复</small>
              </span>
              <input
                type="checkbox"
                :checked="strictSub.hideRecents"
                :disabled="capabilityToggleDisabled(strictSub.hideRecents, status?.supported, busy)"
                @change="toggleSubItem('strict', 'hideRecents', $event)"
              />
            </label>
          </div>

          <div class="sub-item-row">
            <label class="switch">
              <span>
                隐藏桌面图标
                <small>仅停用小猫普通桌面入口，保留通知返回</small>
              </span>
              <input
                type="checkbox"
                :checked="strictSub.hideLauncher"
                :disabled="capabilityToggleDisabled(strictSub.hideLauncher, status?.supported, busy)"
                @change="toggleSubItem('strict', 'hideLauncher', $event)"
              />
            </label>
          </div>

          <div class="sub-item-row">
            <label class="switch">
              <span>
                壁纸辅助保护
                <small>需先保存原壁纸并在系统确认</small>
              </span>
              <input
                type="checkbox"
                :checked="strictSub.wallpaper"
                :disabled="
                  capabilityToggleDisabled(
                    strictSub.wallpaper,
                    wallpaperStatus?.supported ?? status?.supported,
                    busy,
                  )
                "
                @change="toggleSubItem('strict', 'wallpaper', $event)"
              />
            </label>
          </div>
        </div>
      </details>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button
        type="button"
        class="secondary wide"
        :disabled="busy || !isModuleCustomized('strict', modules.strict)"
        @click="resetModule('strict')"
      >
        恢复推荐默认
      </button>
    </div>

    <!-- 壁纸辅助保护知情确认 -->
    <div v-else-if="view === 'wallpaperConsent'" class="wallpaper-consent">
      <p>保存原壁纸后，下轮开始时由你在系统中确认更换。</p>
      <p>恢复动态壁纸需要再次确认；裁剪和个性设置可能无法还原。</p>
      <button
        type="button"
        class="secondary wide"
        :disabled="busy"
        @click="importWallpaperOriginal(false)"
      >
        提供当前主屏原图
      </button>
      <button
        type="button"
        class="secondary wide"
        :disabled="busy"
        @click="importWallpaperOriginal(true)"
      >
        提供独立锁屏原图（如有）
      </button>
      <label><input v-model="originalMatches" type="checkbox" /> 原图与当前壁纸一致，已保留必要设置</label>
      <label><input v-model="limitsAccepted" type="checkbox" /> 了解恢复限制，且此功能不保证防强停</label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button
        type="button"
        class="primary wide"
        :disabled="busy || !originalMatches || !limitsAccepted"
        @click="prepareWallpaperBaseline"
      >
        确认保存原状态
      </button>
      <button
        type="button"
        class="secondary wide"
        :disabled="busy"
        @click="view = 'strict'"
      >
        取消
      </button>
    </div>

    <!-- 免打扰详情 -->
    <div v-else-if="view === 'quiet'" class="study-stack">
      <div class="detail-module-row">
        <label class="switch">
          <span>
            开启免打扰
            <small>减少专注期间的声音、振动与通知打扰。</small>
          </span>
          <input
            type="checkbox"
            :checked="modules.quiet.enabled"
            :disabled="capabilityToggleDisabled(modules.quiet.enabled, status?.supported, busy)"
            @change="toggleModule('quiet', $event)"
          />
        </label>
      </div>

      <button
        v-if="quietMissingPermissions.length > 0"
        type="button"
        class="top-perm-banner"
        :disabled="busy"
        @click="handleMissingPermissions(quietMissingPermissions)"
      >
        <Icon name="warning" :size="16" />
        <span>
          {{
            quietMissingPermissions.length === 1
              ? `还差${quietMissingPermissions[0]!.title} · 去处理`
              : `还差 ${quietMissingPermissions.length} 项权限 · 去处理`
          }}
        </span>
        <Icon name="right" :size="16" />
      </button>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            静音与振动（保留来电与闹钟）
            <small>减少通知声音与振动干扰</small>
          </span>
          <input
            type="checkbox"
            :checked="quietSub.sound"
            :disabled="
              capabilityToggleDisabled(
                quietSub.sound,
                dndStatus?.supported ?? status?.supported,
                busy,
              )
            "
            @change="toggleSubItem('quiet', 'sound', $event)"
          />
        </label>
      </div>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            拦截通知，结束后释放（不保存正文）
            <small>专注期间先收起非白名单应用的普通通知</small>
          </span>
          <input
            type="checkbox"
            :checked="quietSub.intercept"
            :disabled="
              capabilityToggleDisabled(
                quietSub.intercept,
                notificationStatus?.supported ?? status?.supported,
                busy,
              )
            "
            @change="toggleSubItem('quiet', 'intercept', $event)"
          />
        </label>
      </div>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            白名单应用通知照常显示
            <small>与当前生效白名单保持一致</small>
          </span>
          <input
            type="checkbox"
            :checked="quietSub.whitelistPass"
            :disabled="capabilityToggleDisabled(quietSub.whitelistPass, status?.supported, busy)"
            @change="toggleSubItem('quiet', 'whitelistPass', $event)"
          />
        </label>
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button
        type="button"
        class="secondary wide"
        :disabled="busy || !isModuleCustomized('quiet', modules.quiet)"
        @click="resetModule('quiet')"
      >
        恢复推荐默认
      </button>
    </div>

    <!-- 权限与使用帮助 -->
    <div v-else-if="view === 'permissions'" class="study-stack">
      <p class="detail-desc">仅列出当前已开启功能所需要的系统授权。</p>

      <p v-if="status && !status.supported" class="notice">
        本机不支持系统应用与通知控制（仅 Android 本机版本可用）。
      </p>
      <p v-else-if="requiredPermissions.length === 0" class="notice">
        当前没有需要授权的已开启项目。打开学霸模式或相关模块后，这里会显示所需授权。
      </p>
      <div v-if="requiredPermissions.length > 0 || status?.supported || native" class="perm-list">
        <article v-for="perm in requiredPermissions" :key="perm.id" class="perm-card">
          <div class="perm-head">
            <span class="row">
              <strong>{{ perm.title }}</strong>
              <span class="perm-badge" :class="perm.level">{{
                perm.level === 'required' ? '必需' : '可选'
              }}</span>
            </span>
            <span class="perm-state" :class="{ ok: perm.ready }">{{ perm.statusText }}</span>
          </div>
          <p class="perm-used">用于：{{ perm.usedBy.join('、') }}</p>
          <p class="field-help">{{ perm.purpose }}</p>
          <button
            v-if="perm.supported"
            type="button"
            class="secondary wide"
            :disabled="busy"
            @click="authorizePermission(perm.id)"
          >
            {{ perm.ready ? '查看系统设置' : perm.actionLabel }}
          </button>
        </article>

        <article v-if="status?.supported || native" class="perm-card perm-card-optional">
          <div class="perm-head">
            <span class="row">
              <strong>后台运行不限制</strong>
              <span class="perm-badge">建议</span>
            </span>
            <span
              class="perm-state"
              :class="systemPermissions.batteryOptimizationIgnored ? 'ok' : 'calm'"
            >
              {{ systemPermissions.batteryOptimizationIgnored ? '已放行' : '未放行 · 可选' }}
            </span>
          </div>
          <p class="field-help">
            减少长时间专注或锁屏时被系统省电清理。不开启也能正常计时。
          </p>
          <button
            type="button"
            class="secondary wide"
            :disabled="busy"
            @click="openBatteryKeepAlive"
          >
            {{
              systemPermissions.batteryOptimizationIgnored ? '查看系统电池设置' : '一键允许后台运行'
            }}
          </button>
          <button
            type="button"
            class="text-button perm-guide-link"
            :disabled="busy"
            @click="openRoute('/help#help-keepalive')"
          >
            查看各品牌防清理设置 <Icon name="right" :size="14" />
          </button>
        </article>
      </div>

      <div class="perm-nav-links">
        <button type="button" class="menu-row" :disabled="busy" @click="openRoute('/permissions')">
          <span>完整权限诊断</span>
          <Icon name="right" :size="16" />
        </button>
        <button type="button" class="menu-row" :disabled="busy" @click="openRoute('/help')">
          <span>使用帮助</span>
          <Icon name="right" :size="16" />
        </button>
        <button type="button" class="menu-row" :disabled="busy" @click="openRecovery">
          <span>故障恢复</span>
          <Icon name="right" :size="16" />
        </button>
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button type="button" class="primary wide" @click="view = 'home'">完成</button>
    </div>

    <!-- 统一权限引导清单 -->
    <div v-else class="study-stack">
      <p v-if="!status?.supported" class="notice">
        学霸模式的应用限制、免打扰与系统防退出仅支持 Android 本机版本。
      </p>
      <template v-else>
        <p class="detail-desc">
          已保存当前设置。完成以下授权后，学霸模式即可在专注期间正常生效。
        </p>

        <p v-if="guidePermissions.length === 0" class="notice">
          当前所需权限已全部就绪。
        </p>
        <div v-else class="perm-list">
          <article v-for="perm in guidePermissions" :key="perm.id" class="perm-card">
            <div class="perm-head">
              <span class="row">
                <strong>{{ perm.title }}</strong>
                <span class="perm-badge" :class="perm.level">{{
                  perm.level === 'required' ? '必需' : '可选'
                }}</span>
              </span>
              <span class="perm-state" :class="{ ok: perm.ready }">{{ perm.statusText }}</span>
            </div>
            <p class="perm-used">用于：{{ perm.usedBy.join('、') }}</p>
            <p class="field-help">{{ perm.purpose }}</p>
            <button
              type="button"
              class="secondary wide"
              :disabled="busy"
              @click="authorizePermission(perm.id, true)"
            >
              {{ perm.actionLabel }}
            </button>
          </article>
        </div>
      </template>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button type="button" class="primary wide" @click="view = 'home'">完成</button>
    </div>
  </Sheet>
</template>

<style scoped>
.study-stack {
  display: grid;
  gap: 10px;
}
.study-stack p {
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
  margin-top: 4px;
}
.master-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 6px 14px 10px;
  display: grid;
  gap: 8px;
}
.master-card small,
.detail-module-row small,
.sub-item-row small,
.perm-card small,
.perm-card .field-help {
  color: var(--muted-surface);
}
.master-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 6px;
  border-top: 1px solid var(--line);
  font-size: 12px;
}
.status-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  min-height: 48px;
}
.status-action.warn {
  color: #c13a25;
}
.status-action.ok {
  color: var(--ink);
}
.modules-list {
  display: grid;
  gap: 2px;
  transition: color 150ms ease;
}
.modules-dimmed .module-nav {
  color: var(--muted);
}
.module-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  border-bottom: 1px solid var(--line);
}
.module-nav {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  min-height: 54px;
  padding: 6px 0;
}
.module-text {
  flex: 1;
  min-width: 0;
}
.module-text strong {
  display: block;
  font-size: 14px;
}
.switch-compact {
  flex: 0 0 auto;
  min-width: 48px;
  min-height: 48px;
  justify-content: center;
  gap: 0;
}
.menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  min-height: 54px;
  width: 100%;
}
.study-help-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  justify-self: center;
  min-height: 48px;
  min-width: 48px;
  padding: 8px 16px;
  font-size: 13px;
}
.session-note {
  color: var(--muted);
}
.detail-module-row {
  border-bottom: 1px solid var(--line);
  padding-bottom: 8px;
}
.detail-desc {
  color: var(--muted);
}
.top-perm-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: #fff1ef;
  color: #c13a25;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}
.top-perm-banner span {
  flex: 1;
  min-width: 0;
}
.sub-item-row {
  border-bottom: 1px solid var(--line);
  padding-bottom: 6px;
}
.advanced-disclosure {
  margin-top: 4px;
}
.advanced-disclosure summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 48px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  list-style: none;
}
.advanced-disclosure summary::-webkit-details-marker {
  display: none;
}
.disclosure-body {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}
.perm-list {
  display: grid;
  gap: 10px;
}
.perm-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 12px 14px;
  display: grid;
  gap: 8px;
}
.perm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.perm-badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--white);
  color: var(--muted-surface);
}
.perm-badge.required {
  color: #c13a25;
}
.perm-state {
  font-size: 12px;
  color: #c13a25;
}
.perm-state.ok {
  color: var(--ink);
}
.perm-state.calm {
  color: var(--muted-surface);
}
.perm-guide-link {
  justify-self: start;
  padding-inline: 0;
  gap: 4px;
  font-size: 13px;
}
.perm-used {
  color: var(--ink);
  font-size: 12px;
}
.perm-nav-links {
  display: grid;
  border-top: 1px solid var(--line);
}
.perm-nav-links .menu-row {
  min-height: 48px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}
.wallpaper-consent {
  display: grid;
  gap: 14px;
}
.wallpaper-consent p {
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.wallpaper-consent label {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 48px;
  padding: 8px 0;
  cursor: pointer;
}
.wallpaper-consent input {
  flex: 0 0 auto;
  margin-top: 2px;
}
</style>
