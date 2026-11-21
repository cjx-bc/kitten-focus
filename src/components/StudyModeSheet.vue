<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import { capabilityToggleDisabled, studyDisplay } from '../domain/protectionDisplay'
import { protectionDriver, requestNotifications } from '../platform/bridge'
import { dndDriver, type DndStatus } from '../platform/dnd'
import { notificationDriver, type NotificationStatus } from '../platform/notifications'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import AppWhitelistEditor from './AppWhitelistEditor.vue'
import { usePendingEnable } from './usePendingEnable'

type SheetView = 'home' | ProtectionModuleKey | 'permissions'

const props = withDefaults(defineProps<{ open: boolean; initialView?: SheetView }>(), {
  initialView: 'home',
})
const emit = defineEmits<{ close: [] }>()
const app = useApp()

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

const error = ref('')
const readFailed = ref(false)
const readError = ref('')
const busy = ref(false)
const permissionHelp = ref(false)
const guideOpen = ref(false)
const pendingOptionalGrant = ref<'dnd' | 'notificationListener' | null>(null)
const editing = ref(false)
const wallpaperConsentOpen = ref(false)
const limitsAccepted = ref(false)
const originalMatches = ref(false)

let revision = 0
let timer: ReturnType<typeof setInterval> | undefined

watch(
  () => [props.open, props.initialView] as const,
  ([open, initial]) => {
    view.value = open ? initial : 'home'
  },
)

const sheetTitle = computed(
  () =>
    ({
      home: '学霸模式',
      apps: '应用限制',
      strict: '严格模式',
      quiet: '免打扰',
      permissions: '授权与权限',
    })[view.value],
)

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
      purpose: '专注期间暂缓白名单外通知并在结束后请求释放，不保存正文。',
      supported: true,
      authorized: Boolean(notificationStatus.value.authorized),
      connected: Boolean(notificationStatus.value.connected),
      ready: false,
      statusText: notificationStatus.value.authorized ? '已授权 · 监听未连接' : '未授权 · 未生效',
      actionLabel: notificationStatus.value.authorized ? '重连通知监听' : '前往通知访问',
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
    statusText: !status.value?.authorized ? '未授权 · 必需' : '已授权 · 等待服务连接',
    actionLabel: '前往系统设置',
  },
  ...optionalMissingForGuide.value,
])

async function saveStudy(study: boolean) {
  busy.value = true
  try {
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
    if (study && (missingPermissions.value.length > 0 || optionalMissingForGuide.value.length > 0)) {
      guideOpen.value = true
    }
  } finally {
    busy.value = false
  }
}

const enableGate = usePendingEnable(saveStudy, refresh)
const permissionReady = () => !!(status.value?.supported && status.value.authorized && status.value.connected)
function cancelEnable() {
  enableGate.cancel()
  permissionHelp.value = false
}

const activeProtection = computed(() => app.focus?.session?.protection ?? app.lock?.session?.protection)
const display = computed(() =>
  studyDisplay(
    prefs.value.study,
    activeProtection.value?.study === true,
    activeProtection.value?.applicationsWithdrawn === true,
    status.value,
    readFailed.value,
  ),
)

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

const permissionMap = computed(() => {
  const map = new Map<StudyPermissionId, RequiredPermissionItem>()
  for (const item of requiredPermissions.value) map.set(item.id, item)
  return map
})

const masterSubtitle = computed(() => {
  if (!status.value) return readFailed.value ? '状态异常' : '检查中'
  if (!status.value.supported) return '仅 Android 可用'
  return '专注期间锁定专注页，限制分心'
})

async function refresh() {
  const request = ++revision
  const [protRes, dndRes, notifRes, recentRes, launcherRes, wallpaperRes] = await Promise.allSettled([
    protectionDriver.status(),
    dndDriver.read(),
    notificationDriver.read(),
    protectionDriver.recentTasks(),
    protectionDriver.launcher(),
    protectionDriver.wallpaper(),
  ])
  if (request !== revision) return
  if (dndRes.status === 'fulfilled') dndStatus.value = dndRes.value
  if (notifRes.status === 'fulfilled') notificationStatus.value = notifRes.value
  if (recentRes.status === 'fulfilled') recentTasksStatus.value = recentRes.value
  if (launcherRes.status === 'fulfilled') launcherStatus.value = launcherRes.value
  if (wallpaperRes.status === 'fulfilled') wallpaperStatus.value = wallpaperRes.value

  if (protRes.status === 'fulfilled') {
    const value = protRes.value
    status.value = value
    readFailed.value = false
    readError.value = ''
    if (await enableGate.observe(permissionReady(), value.authorized)) await refresh()
  } else {
    status.value = null
    readFailed.value = true
    readError.value =
      protRes.reason instanceof Error ? protRes.reason.message : String(protRes.reason)
  }

  // Auto-enable an optional quiet sub-item when returning from the P3 guide after granting.
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
  if (!document.hidden) void refresh()
}

onMounted(() => {
  void refresh()
  timer = setInterval(visibility, 2000)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('focus', refresh)
  window.addEventListener('protection-recovered', refresh)
})

onBeforeUnmount(() => {
  revision++
  clearInterval(timer)
  document.removeEventListener('visibilitychange', visibility)
  window.removeEventListener('focus', refresh)
  window.removeEventListener('protection-recovered', refresh)
})

function recovery() {
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
    permissionHelp.value = await enableGate.request(checked, permissionReady())
    if (!permissionHelp.value) await refresh()
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
    if (app.focus?.session || app.lock?.session) {
      app.notify(
        app.lock?.session && !app.focus?.session
          ? '设置已保存，将用于下一轮锁机'
          : '设置已保存，将用于下一轮专注',
      )
    }
    if (checked && missingPermissions.value.length > 0) {
      guideOpen.value = true
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
    if (app.focus?.session || app.lock?.session) {
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
    wallpaperConsentOpen.value = true
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
    editing.value = false
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

async function authorize() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  enableGate.launch()
  try {
    await protectionDriver.openSettings()
    permissionHelp.value = false
  } catch (e) {
    cancelEnable()
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
    await refresh()
  }
}

async function authorizePermission(id: StudyPermissionId, fromGuide = false) {
  if (busy.value) return
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
    } else if (id === 'wallpaperBaseline') {
      limitsAccepted.value = false
      originalMatches.value = false
      wallpaperConsentOpen.value = true
    }
    await refresh()
  } catch (e) {
    if (fromGuide) pendingOptionalGrant.value = null
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function prepareWallpaperBaseline() {
  if (busy.value || !limitsAccepted.value || !originalMatches.value) return
  busy.value = true
  error.value = ''
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
    wallpaperConsentOpen.value = false
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
  <Sheet :open="props.open" :title="sheetTitle" @close="emit('close')">
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
        <div v-if="masterEnabled || activeProtection?.study" class="master-status">
          <span role="status" class="status-pill">{{ display.text }}</span>
          <button
            v-if="missingPermissions.length > 0"
            type="button"
            class="status-action warn"
            @click="view = 'permissions'"
          >
            <Icon name="warning" :size="14" />还差 {{ missingPermissions.length }} 项授权 · 去处理
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

      <button type="button" class="menu-row permissions-entry" @click="view = 'permissions'">
        <span class="row"><Icon name="key" :size="18" />授权与权限</span>
        <span class="row entry-meta">
          {{
            !status?.supported
              ? '查看说明'
              : missingPermissions.length > 0
                ? `${missingPermissions.length} 项待处理`
                : '已就绪'
          }}
          <Icon name="right" :size="16" />
        </span>
      </button>

      <p v-if="app.focus?.session || app.lock?.session" class="session-note">
        {{ app.lock?.session && !app.focus?.session ? '修改用于下一轮锁机' : '修改用于下一轮专注' }}
      </p>

      <div class="help-links">
        <RouterLink to="/permissions" @click="emit('close')">权限与状态</RouterLink>
        <RouterLink to="/help" @click="emit('close')">使用帮助</RouterLink>
        <button type="button" @click="recovery">故障恢复</button>
      </div>

      <p v-if="error || readError" class="form-error" role="alert">{{ error || readError }}</p>
      <button type="button" class="primary wide" @click="emit('close')">完成</button>
    </div>

    <!-- 应用限制详情 -->
    <div v-else-if="view === 'apps'" class="study-stack">
      <div class="detail-topbar">
        <button type="button" class="detail-back" @click="view = 'home'">
          <Icon name="left" :size="16" />返回学霸模式
        </button>
        <label class="switch switch-compact" aria-label="应用限制开关">
          <input
            type="checkbox"
            :checked="modules.apps.enabled"
            :disabled="capabilityToggleDisabled(modules.apps.enabled, status?.supported, busy)"
            @change="toggleModule('apps', $event)"
          />
        </label>
      </div>
      <p class="detail-desc">开始专注后，仅允许本轮白名单中的应用与必要系统交互。</p>

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
        <button
          v-if="subItemMissingPerm('accessibility')"
          type="button"
          class="inline-perm-alert"
          @click="authorizePermission('accessibility')"
        >
          待授权 · 未生效（点击授权无障碍）
        </button>
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
        @click="editing = true"
      >
        <span>
          允许使用的应用（白名单）
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
        恢复默认
      </button>
    </div>

    <!-- 严格模式详情 -->
    <div v-else-if="view === 'strict'" class="study-stack">
      <div class="detail-topbar">
        <button type="button" class="detail-back" @click="view = 'home'">
          <Icon name="left" :size="16" />返回学霸模式
        </button>
        <label class="switch switch-compact" aria-label="严格模式开关">
          <input
            type="checkbox"
            :checked="modules.strict.enabled"
            :disabled="busy"
            @change="toggleModule('strict', $event)"
          />
        </label>
      </div>
      <p class="detail-desc">开始后更难中途放弃。</p>

      <p class="group-label">计时约束</p>
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

      <p class="group-label">防退出</p>
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
        <button
          v-if="subItemMissingPerm('accessibility')"
          type="button"
          class="inline-perm-alert"
          @click="authorizePermission('accessibility')"
        >
          待授权 · 未生效（点击授权无障碍）
        </button>
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
        <button
          v-if="subItemMissingPerm('accessibility')"
          type="button"
          class="inline-perm-alert"
          @click="authorizePermission('accessibility')"
        >
          待授权 · 未生效（点击授权无障碍）
        </button>
      </div>

      <p class="group-label">进阶 · 可能影响日常使用</p>
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
        <button
          v-if="subItemMissingPerm('controlNotification')"
          type="button"
          class="inline-perm-alert"
          @click="authorizePermission('controlNotification')"
        >
          待授权 · 未生效（点击开启控制通知）
        </button>
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
        <button
          v-if="subItemMissingPerm('controlNotification')"
          type="button"
          class="inline-perm-alert"
          @click="authorizePermission('controlNotification')"
        >
          待授权 · 未生效（点击开启控制通知）
        </button>
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
        <button
          v-if="subItemMissingPerm('wallpaperBaseline')"
          type="button"
          class="inline-perm-alert"
          @click="authorizePermission('wallpaperBaseline')"
        >
          待准备原壁纸状态（点击处理）
        </button>
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button
        type="button"
        class="secondary wide"
        :disabled="busy || !isModuleCustomized('strict', modules.strict)"
        @click="resetModule('strict')"
      >
        恢复默认
      </button>
    </div>

    <!-- 免打扰详情 -->
    <div v-else-if="view === 'quiet'" class="study-stack">
      <div class="detail-topbar">
        <button type="button" class="detail-back" @click="view = 'home'">
          <Icon name="left" :size="16" />返回学霸模式
        </button>
        <label class="switch switch-compact" aria-label="免打扰开关">
          <input
            type="checkbox"
            :checked="modules.quiet.enabled"
            :disabled="capabilityToggleDisabled(modules.quiet.enabled, status?.supported, busy)"
            @change="toggleModule('quiet', $event)"
          />
        </label>
      </div>
      <p class="detail-desc">减少专注期间的声音、振动与通知打扰。</p>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            静音与振动
            <small>减少通知声音与振动，保留来电、闹钟与媒体</small>
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
        <button
          v-if="subItemMissingPerm('dnd')"
          type="button"
          class="inline-perm-alert"
          @click="authorizePermission('dnd')"
        >
          待授权 · 未生效（点击前往勿扰设置）
        </button>
      </div>

      <div class="sub-item-row">
        <label class="switch">
          <span>
            拦截通知，结束后释放
            <small>暂缓非白名单应用的普通通知，不保存正文</small>
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
        <button
          v-if="subItemMissingPerm('notificationListener')"
          type="button"
          class="inline-perm-alert"
          @click="authorizePermission('notificationListener')"
        >
          {{
            notificationStatus?.authorized && !notificationStatus?.connected
              ? '监听未连接 · 点击重连'
              : '待授权 · 未生效（点击授权通知访问）'
          }}
        </button>
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
        恢复默认
      </button>
    </div>

    <!-- 授权与权限中心 -->
    <div v-else class="study-stack">
      <div class="detail-topbar">
        <button type="button" class="detail-back" @click="view = 'home'">
          <Icon name="left" :size="16" />返回学霸模式
        </button>
      </div>
      <p class="detail-desc">仅列出当前已开启功能所需要的系统授权。</p>

      <p v-if="status && !status.supported" class="notice">
        本机不支持系统应用与通知控制（仅 Android 本机版本可用）。
      </p>
      <p v-else-if="requiredPermissions.length === 0" class="notice">
        当前没有需要授权的已开启项目。打开学霸模式或相关模块后，这里会显示所需授权。
      </p>
      <div v-else class="perm-list">
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
      </div>

      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button type="button" class="primary wide" @click="view = 'home'">返回</button>
    </div>
  </Sheet>

  <!-- 开启总开关时的统一权限引导清单 -->
  <Sheet
    :open="permissionHelp"
    :title="`还需 ${onboardingPermissions.length} 项授权`"
    :close-disabled="busy"
    @close="cancelEnable"
  >
    <div class="study-stack">
      <p class="detail-desc">开启学霸模式前需先授权必需的无障碍服务；可选免打扰权限可按需授权。</p>
      <div v-for="perm in onboardingPermissions" :key="perm.id" class="perm-card">
        <div class="perm-head">
          <span class="row">
            <strong>{{ perm.title }}</strong>
            <span class="perm-badge" :class="perm.level">{{ perm.level === 'required' ? '必需' : '可选' }}</span>
          </span>
          <span class="perm-state">{{ perm.statusText }}</span>
        </div>
        <p class="field-help">{{ perm.purpose }}</p>
        <button
          v-if="perm.id === 'accessibility'"
          type="button"
          class="primary wide"
          :disabled="busy || !status?.supported"
          @click="authorize"
        >
          前往系统设置
        </button>
        <button
          v-else
          type="button"
          class="secondary wide"
          :disabled="busy"
          @click="authorizePermission(perm.id, true)"
        >
          {{ perm.actionLabel }}
        </button>
      </div>
      <button type="button" class="secondary wide" :disabled="busy" @click="cancelEnable">
        暂不开启
      </button>
    </div>
  </Sheet>

  <!-- P3 开启后逐项可选授权引导清单 -->
  <Sheet
    :open="guideOpen"
    :title="`可补充 ${(missingPermissions.length ? missingPermissions : optionalMissingForGuide).length} 项授权`"
    :close-disabled="busy"
    @close="guideOpen = false"
  >
    <div class="study-stack">
      <p class="detail-desc">
        已保存当前就绪的保护，可直接开始专注。如需同时启用以下能力，请前往授权；暂不授权不会影响开始专注。
      </p>
      <div
        v-for="perm in missingPermissions.length ? missingPermissions : optionalMissingForGuide"
        :key="perm.id"
        class="perm-card"
      >
        <div class="perm-head">
          <span class="row">
            <strong>{{ perm.title }}</strong>
            <span class="perm-badge" :class="perm.level">{{ perm.level === 'required' ? '必需' : '可选' }}</span>
          </span>
          <span class="perm-state">{{ perm.statusText }}</span>
        </div>
        <p class="perm-used">用于：{{ perm.usedBy.join('、') }}</p>
        <button
          type="button"
          class="secondary wide"
          :disabled="busy"
          @click="authorizePermission(perm.id, true)"
        >
          {{ perm.actionLabel }}
        </button>
      </div>
      <button type="button" class="primary wide" @click="guideOpen = false">稍后处理</button>
    </div>
  </Sheet>

  <!-- 壁纸辅助保护原状态准备弹窗 -->
  <Sheet
    :open="wallpaperConsentOpen"
    title="保存本轮原壁纸"
    :close-disabled="busy"
    @close="wallpaperConsentOpen = false"
  >
    <div class="wallpaper-consent">
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
        @click="wallpaperConsentOpen = false"
      >
        取消
      </button>
    </div>
  </Sheet>

  <AppWhitelistEditor
    :open="editing"
    title="全局白名单"
    :packages="prefs.globalWhitelist"
    :saving="busy"
    :save-error="error"
    @close="editing = false"
    @confirm="saveApps"
  />
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
  border-radius: 16px;
  padding: 6px 14px 10px;
  display: grid;
  gap: 8px;
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
.status-pill {
  color: var(--muted);
  font-weight: 600;
}
.status-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  min-height: 32px;
}
.status-action.warn {
  color: #b44318;
}
.status-action.ok {
  color: #2f7a4d;
}
.modules-list {
  display: grid;
  gap: 2px;
  transition: opacity 150ms ease;
}
.modules-dimmed {
  opacity: 0.62;
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
  min-height: 44px;
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
.permissions-entry {
  border-bottom: 1px solid var(--line);
}
.entry-meta {
  font-size: 12px;
  color: var(--muted);
  gap: 4px;
}
.help-links {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0 12px;
  color: var(--muted);
  font-size: 12px;
}
.help-links > * {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}
.session-note {
  color: var(--muted);
}
.detail-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.detail-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 40px;
  font-size: 13px;
  color: var(--muted);
}
.detail-desc {
  color: var(--muted);
}
.group-label {
  font-size: 12px;
  font-weight: 650;
  color: var(--muted);
  margin-top: 6px;
}
.sub-item-row {
  border-bottom: 1px solid var(--line);
  padding-bottom: 6px;
}
.inline-perm-alert {
  font-size: 12px;
  color: #b44318;
  min-height: 36px;
  text-align: left;
  padding: 2px 0;
}
.perm-list {
  display: grid;
  gap: 10px;
}
.perm-card {
  background: var(--surface);
  border-radius: 14px;
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
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--white);
  color: var(--muted);
}
.perm-badge.required {
  color: #b44318;
}
.perm-state {
  font-size: 12px;
  color: #b44318;
}
.perm-state.ok {
  color: #2f7a4d;
}
.perm-used {
  color: var(--ink);
  font-size: 12px;
}
.wallpaper-consent {
  display: grid;
  gap: 14px;
}
.wallpaper-consent label {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 44px;
  cursor: pointer;
}
.wallpaper-consent input {
  flex: 0 0 auto;
  margin-top: 3px;
}
</style>
