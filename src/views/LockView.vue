<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import { timer, duration } from '../domain/dates'
import { uid, type AppData, type LockConfiguration, type ProtectionStatus } from '../domain/model'
import { isAccessibilityReady, isAppRestrictionReady } from '../domain/studyPermissions'
import { classifyStartError } from '../domain/startRecovery'
import { protectionDriver, type ProtectionSettingsTarget } from '../platform/bridge'
import Sheet from '../components/Sheet.vue'
import { waitForDialogClose } from '../components/sheetClose'
import Icon from '../components/Icon.vue'
import AppWhitelistEditor from '../components/AppWhitelistEditor.vue'
import LockMainEntrySetting from '../components/LockMainEntrySetting.vue'

const app = useApp(), router = useRouter()
const draft = ref<LockConfiguration | null>(null)
const draftView = ref<'form' | 'whitelist' | 'enhancements'>('form')
const starting = ref<LockConfiguration | null>(null), ending = ref(false), busy = ref(false), loadError = ref(''), sheetError = ref('')
const advancedOpen = ref(false)
const status = ref<ProtectionStatus | null>(null)
let readRevision = 0
let confirmedData: AppData | undefined

const configurations = computed(() => app.data.lockConfigurations ?? [])
const session = computed(() => app.lock.session)
const result = computed(() => app.lock.records[0])
const sheet = computed<'draft' | 'starting' | 'ending' | null>(() =>
  draft.value ? 'draft' : starting.value ? 'starting' : ending.value ? 'ending' : null,
)
const selectedPackages = computed(() => draft.value?.whitelist.source === 'custom' ? draft.value.whitelist.packages : [])
const startCount = computed(() => starting.value?.whitelist.source === 'custom'
  ? starting.value.whitelist.packages.length
  : confirmedData?.preferences.protection?.globalWhitelist?.length ?? 0)
const startErrorKind = computed(() => (sheetError.value ? classifyStartError(sheetError.value) : 'other'))
const sheetTitle = computed(() => {
  if (sheet.value === 'draft') {
    if (draftView.value === 'whitelist') return '锁机独立白名单'
    if (draftView.value === 'enhancements') return '独立增强选项'
    return '锁机配置'
  }
  if (sheet.value === 'starting') return starting.value?.strict ? '开始严格锁机' : '开始普通锁机'
  if (sheet.value === 'ending') return '提前解除本轮锁机？'
  return ''
})
const sheetBackLabel = computed(() => (sheet.value === 'draft' && draftView.value !== 'form' ? '锁机配置' : undefined))

const enhancementOptions = [
  { key: 'navigationHomeRecents', title: '限制桌面与最近任务' },
  { key: 'recentTasksHidden', title: '隐藏小猫最近任务卡片' },
  { key: 'lockMainInterfaceRestricted', title: '锁机时限制返回主页' },
  { key: 'wallpaperProtection', title: '壁纸辅助保护' },
  { key: 'preciseAntiClose', title: '精确防关闭' },
  { key: 'launcherIconHidden', title: '隐藏桌面图标' },
]

function toggleWhitelistSource(event: Event) {
  if (!draft.value) return
  draft.value.whitelist = (event.target as HTMLInputElement).checked
    ? { source: 'custom', packages: [...(app.data.preferences.protection?.globalWhitelist ?? [])] }
    : { source: 'global' }
}

function confirmWhitelist(packages: string[]) {
  if (draft.value) draft.value.whitelist = { source: 'custom', packages }
  draftView.value = 'form'
}

function independentEnhancements(event: Event) {
  if (!draft.value) return
  draft.value.enhancements = (event.target as HTMLInputElement).checked
    ? [...(app.data.preferences.protection?.enhancements ?? [])] : undefined
}

function toggleEnhancement(key: string, event: Event) {
  if (!draft.value || draft.value.enhancements === undefined) return
  draft.value.enhancements = draft.value.enhancements.filter(value => value !== key)
  if ((event.target as HTMLInputElement).checked) draft.value.enhancements.push(key)
}

function edit(configuration?: LockConfiguration) {
  sheetError.value = ''
  starting.value = null
  ending.value = false
  draftView.value = 'form'
  draft.value = configuration ? JSON.parse(JSON.stringify(configuration)) as LockConfiguration : { id: uid(), name: '', minutes: 25, strict: false, whitelist: { source: 'global' } }
}

async function save() {
  if (!draft.value) return
  const configuration = JSON.parse(JSON.stringify(draft.value)) as LockConfiguration
  if (!configuration.name.trim()) { sheetError.value = '请填写锁机名称'; return }
  if (!Number.isSafeInteger(configuration.minutes) || configuration.minutes < 1 || configuration.minutes > 1440) { sheetError.value = '时长需要是 1–1440 之间的整数分钟'; return }
  busy.value = true
  sheetError.value = ''
  try {
    await app.mutate(d => {
      const rows = d.lockConfigurations ??= []
      const index = rows.findIndex(row => row.id === configuration.id)
      if (index < 0) rows.push(configuration); else rows[index] = configuration
    })
    draft.value = null
    draftView.value = 'form'
    sheetError.value = ''
  } catch (e) { sheetError.value = e instanceof Error ? e.message : String(e) } finally { busy.value = false }
}

async function refresh() {
  const revision = ++readRevision
  try {
    const nextStatus = await protectionDriver.status()
    if (revision !== readRevision) return
    status.value = nextStatus
    loadError.value = ''
  } catch (e) {
    if (revision === readRevision) {
      status.value = null
      loadError.value = e instanceof Error ? e.message : String(e)
    }
  }
}

async function prepare(configuration: LockConfiguration) {
  if (!status.value?.supported || busy.value) return
  sheetError.value = ''
  draft.value = null
  ending.value = false
  confirmedData = app.data
  await refresh()
  if (!status.value?.supported) {
    confirmedData = undefined
    return
  }
  if (configuration.strict || !status.value.authorized || !status.value.connected) {
    starting.value = configuration
    return
  }
  busy.value = true
  try {
    await app.startLock(configuration.id, false, confirmedData)
    confirmedData = undefined
    await refresh()
  } catch (e) {
    starting.value = configuration
    sheetError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function start() {
  if (!starting.value || busy.value || !status.value?.supported) return
  busy.value = true
  sheetError.value = ''
  try {
    await app.startLock(starting.value.id, starting.value.strict === true, confirmedData)
    starting.value = null
    confirmedData = undefined
    sheetError.value = ''
    await refresh()
  } catch (e) {
    sheetError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function finish() {
  busy.value = true
  sheetError.value = ''
  try {
    await app.finishLock(true)
    ending.value = false
    sheetError.value = ''
    await refresh()
  } catch (e) {
    sheetError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function closeDraft() {
  if (!busy.value) {
    draft.value = null
    draftView.value = 'form'
    sheetError.value = ''
  }
}

function closeStarting() {
  if (!busy.value) {
    starting.value = null
    confirmedData = undefined
    sheetError.value = ''
  }
}

function closeEnding() {
  if (!busy.value) {
    ending.value = false
    sheetError.value = ''
  }
}

function closeActiveSheet() {
  if (sheet.value === 'draft') closeDraft()
  else if (sheet.value === 'starting') closeStarting()
  else if (sheet.value === 'ending') closeEnding()
}

async function navigateFromStarting(path: '/recovery' | '/permissions') {
  closeStarting()
  await waitForDialogClose()
  await router.push(path)
}

const lockAppsReady = computed(() => isAppRestrictionReady(status.value))
const lockNeedsAccessibility = computed(() => {
  const target = starting.value
  if (!target) return false
  const list = target.enhancements ?? app.data.preferences.protection?.enhancements ?? []
  return list.includes('navigationHomeRecents') || list.includes('preciseAntiClose')
})
const lockA11yReady = computed(() => isAccessibilityReady(status.value))
const missingLockTarget = computed<ProtectionSettingsTarget | null>(() => {
  if (!status.value?.supported) return null
  if (!lockAppsReady.value) return !status.value.usageStatsGranted ? 'usageStats' : 'overlay'
  if (lockNeedsAccessibility.value && !lockA11yReady.value) return 'accessibility'
  return null
})

async function settings(target?: ProtectionSettingsTarget) {
  if (busy.value) return
  busy.value = true
  sheetError.value = ''
  try { await protectionDriver.openSettings(target); await refresh() }
  catch (e) { sheetError.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}

function visible() { if (!document.hidden) void refresh() }
let statusTimer: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  void refresh()
  statusTimer = setInterval(visible, 2000)
  document.addEventListener('visibilitychange', visible)
  window.addEventListener('focus', visible)
})

onUnmounted(() => {
  readRevision++
  clearInterval(statusTimer)
  document.removeEventListener('visibilitychange', visible)
  window.removeEventListener('focus', visible)
})
</script>
<template>
  <div class="page lock-page">
    <header class="page-header">
      <button type="button" class="icon-button" aria-label="返回我的" @click="router.replace('/settings')"><Icon name="back" /></button>
      <h1>独立锁机</h1>
      <span class="header-space" aria-hidden="true" />
    </header>

    <template v-if="session">
      <div class="lock-center">
        <p class="muted">{{ session.strictMode ? '严格锁机进行中' : '普通锁机进行中' }}</p>
        <div class="focus-clock number" :class="{ 'long-clock': app.lock.remainingMs >= 3600000 }">{{ timer(app.lock.remainingMs) }}</div>
        <h2>{{ session.title }}</h2>
        <p class="muted">仅允许白名单内 {{ session.protection.whitelist.length }} 个应用</p>
      </div>
      <p v-if="session.strictMode" class="notice">严格锁机进行中，到期自动结束，无法提前解除。</p>
      <button v-else type="button" class="secondary wide" @click="ending = true; sheetError = ''">提前解除锁机</button>
    </template>

    <template v-else>
      <p class="muted">独立于待办专注，单纯把手机留给必要的事。不计入专注统计，结束后不自动休息。</p>
      <div v-if="app.focus.session || app.rest.session?.state === 'running'" class="notice">
        <p>已有{{ app.focus.session ? '专注' : '休息' }}正在进行。处理完成后可开始锁机。</p>
        <button type="button" class="secondary wide" @click="router.replace(app.focus.session ? '/focus' : '/rest')">返回当前{{ app.focus.session ? '专注' : '休息' }}</button>
      </div>
      <article v-if="result" class="lock-result">
        <h2>{{ result.status === 'completed' ? '本轮锁机已到期' : result.status === 'early' ? '本轮锁机已解除' : '设备重启，锁机已中断' }}</h2>
        <p>{{ result.title }} · {{ duration(result.durationMs) }}</p>
        <p class="result-note">记录仅保留在锁机历史。设备重启后不会自动重新锁机。</p>
      </article>
      <div v-if="configurations.length" class="settings-group">
        <div v-for="configuration in configurations" :key="configuration.id" class="lock-configuration">
          <div>
            <strong>{{ configuration.name }}</strong>
            <p class="surface-muted">{{ configuration.minutes }} 分钟 · {{ configuration.strict ? '严格锁机' : '普通锁机' }} · {{ configuration.whitelist.source === 'global' ? '跟随全局白名单' : `独立白名单 · ${configuration.whitelist.packages.length} 个应用` }}</p>
          </div>
          <div class="row">
            <button type="button" class="secondary" @click="edit(configuration)">编辑</button>
            <button type="button" class="secondary" :disabled="busy || !status?.supported || !!app.focus.session || app.rest.session?.state === 'running'" @click="prepare(configuration)">开始</button>
          </div>
        </div>
      </div>
      <button type="button" class="primary wide" @click="edit()">新建锁机配置</button>
      <details
        class="lock-advanced"
        :open="advancedOpen"
        @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary class="lock-advanced-summary">
          <span>锁机高级设置与历史{{ app.lock.records.length ? `（${app.lock.records.length}）` : '' }}</span>
          <Icon name="down" :size="16" :class="{ open: advancedOpen }" />
        </summary>
        <div class="lock-advanced-body">
          <LockMainEntrySetting />
          <div v-if="app.lock.records.length" class="lock-history">
            <h3 class="history-title">锁机历史</h3>
            <div class="settings-group">
              <div v-for="record in app.lock.records" :key="record.id" class="lock-history-row">
                <p>{{ record.title }} · {{ record.status === 'completed' ? '到期' : record.status === 'early' ? '提前解除' : '重启中断' }} · {{ duration(record.durationMs) }}</p>
                <small>{{ new Date(record.startedAt).toLocaleString() }}</small>
              </div>
            </div>
          </div>
          <p v-else class="muted history-empty">暂无锁机历史记录。</p>
        </div>
      </details>
    </template>

    <div class="lock-help">
      <RouterLink class="text-link" to="/help">遇到问题？帮助与恢复</RouterLink>
    </div>

    <p v-if="loadError" role="alert" class="form-error">{{ loadError }}</p>

    <Sheet
      :open="sheet !== null"
      :title="sheetTitle"
      :back-label="sheetBackLabel"
      :close-disabled="busy"
      @back="draftView = 'form'"
      @close="closeActiveSheet"
    >
      <template v-if="sheet === 'draft' && draft">
        <form v-if="draftView === 'form'" class="draft-form" @submit.prevent="save">
          <label>锁机名称<input v-model.trim="draft.name" maxlength="80" required /></label>
          <label>锁机时长（分钟）<input v-model.number="draft.minutes" type="number" min="1" max="1440" required /></label>
          <div class="draft-group">
            <label class="switch"><span>严格锁机</span><input v-model="draft.strict" type="checkbox" /></label>
            <p class="field-help">开启后无法提前解除。</p>
          </div>
          <div class="draft-group">
            <label class="switch"><span>使用独立白名单</span><input type="checkbox" :checked="draft.whitelist.source === 'custom'" @change="toggleWhitelistSource" /></label>
            <button
              v-if="draft.whitelist.source === 'custom'"
              type="button"
              class="nav-row"
              :disabled="busy || !status?.supported"
              @click="draftView = 'whitelist'"
            >
              <span>编辑独立白名单</span>
              <span class="nav-row-meta">{{ draft.whitelist.packages.length }} 个应用 ›</span>
            </button>
            <p v-else class="field-help">开始时使用学霸模式全局白名单。</p>
            <p v-if="draft.whitelist.source === 'custom' && !status?.supported" class="field-help">当前环境不支持读取本机应用列表。</p>
          </div>
          <button type="button" class="nav-row" :disabled="busy" @click="draftView = 'enhancements'">
            <span>独立增强选项</span>
            <span class="nav-row-meta">{{ draft.enhancements !== undefined ? `已自定义 ${draft.enhancements.length} 项 ›` : '跟随全局 ›' }}</span>
          </button>
          <p v-if="sheetError" role="alert" class="form-error">{{ sheetError }}</p>
          <button type="submit" class="primary wide" :disabled="busy">保存配置</button>
        </form>

        <AppWhitelistEditor
          v-else-if="draftView === 'whitelist'"
          inline
          :open="sheet === 'draft' && draftView === 'whitelist'"
          title="锁机独立白名单"
          :packages="selectedPackages"
          @close="draftView = 'form'"
          @confirm="confirmWhitelist"
        />

        <div v-else-if="draftView === 'enhancements'" class="stack">
          <label class="switch"><span>使用独立增强选项</span><input type="checkbox" :checked="draft.enhancements !== undefined" @change="independentEnhancements" /></label>
          <template v-if="draft.enhancements !== undefined">
            <label v-for="option in enhancementOptions" :key="option.key" class="switch">
              <span>{{ option.title }}</span>
              <input type="checkbox" :checked="draft.enhancements.includes(option.key)" @change="toggleEnhancement(option.key, $event)" />
            </label>
            <p class="field-help">独立增强选项替代全局增强设置。</p>
          </template>
          <p v-else class="field-help">当前跟随学霸模式全局增强设置。</p>
          <button type="button" class="primary wide" @click="draftView = 'form'">完成选择</button>
        </div>
      </template>

      <div v-else-if="sheet === 'starting' && starting" class="stack">
        <template v-if="missingLockTarget === 'usageStats'">
          <p>
            {{ starting.strict
              ? `需先开启「使用情况访问权限」与「悬浮窗权限」后才能开始严格锁机「${starting.name}」（${starting.minutes} 分钟），开启后无法提前解除；这两项权限退出应用或重启都不会掉权。`
              : `需先开启「使用情况访问权限」与「悬浮窗权限」后才能开始锁机「${starting.name}」（${starting.minutes} 分钟）；这两项权限退出应用或重启都不会掉权。` }}
          </p>
          <p v-if="sheetError" class="form-error" role="alert">{{ sheetError }}</p>
          <button type="button" class="primary wide" :disabled="busy" @click="settings('usageStats')">前往使用情况访问</button>
          <button type="button" class="secondary wide" :disabled="busy" @click="closeStarting">暂不开始</button>
        </template>
        <template v-else-if="missingLockTarget === 'overlay'">
          <p>
            还差「悬浮窗权限」即可开始锁机「{{ starting.name }}」（{{ starting.minutes }} 分钟）；开启后退出应用或重启都不会掉权。
          </p>
          <p v-if="sheetError" class="form-error" role="alert">{{ sheetError }}</p>
          <button type="button" class="primary wide" :disabled="busy" @click="settings('overlay')">前往悬浮窗设置</button>
          <button type="button" class="secondary wide" :disabled="busy" @click="closeStarting">暂不开始</button>
        </template>
        <template v-else-if="missingLockTarget === 'accessibility'">
          <p>
            该锁机配置启用了「限制桌面与最近任务 / 精确防关闭」，需先开启无障碍权限后才能开始「{{ starting.name }}」（{{ starting.minutes }} 分钟）。
          </p>
          <p v-if="sheetError" class="form-error" role="alert">{{ sheetError }}</p>
          <button type="button" class="primary wide" :disabled="busy" @click="settings('accessibility')">前往无障碍授权</button>
          <button type="button" class="secondary wide" :disabled="busy" @click="closeStarting">暂不开始</button>
        </template>
        <template v-else>
          <p v-if="starting.strict">
            已开启严格锁机：「{{ starting.name }}」（{{ starting.minutes }} 分钟）开始后不能暂停、取消或提前解除，是否开始？
          </p>
          <p v-else>
            准备开始「{{ starting.name }}」（{{ starting.minutes }} 分钟），仅允许白名单内 {{ startCount }} 个应用。
          </p>
          <p v-if="sheetError" class="form-error" role="alert">{{ sheetError }}</p>
          <button
            v-if="startErrorKind === 'recovery'"
            type="button"
            class="primary wide"
            :disabled="busy"
            @click="navigateFromStarting('/recovery')"
          >前往故障恢复</button>
          <button
            v-else-if="startErrorKind === 'protection'"
            type="button"
            class="primary wide"
            :disabled="busy"
            @click="navigateFromStarting('/permissions')"
          >前往权限与保护</button>
          <button
            v-else
            type="button"
            class="primary wide"
            :disabled="busy || !status?.supported"
            @click="start"
          >确认开始锁机</button>
          <button type="button" class="secondary wide" :disabled="busy" @click="closeStarting">取消</button>
        </template>
      </div>

      <div v-else-if="sheet === 'ending'" class="stack">
        <p>解除后本轮锁机立即结束，锁机记录保留。</p>
        <p v-if="sheetError" class="form-error" role="alert">{{ sheetError }}</p>
        <div class="ending-actions">
          <button type="button" class="secondary wide" :disabled="busy" @click="closeEnding">继续</button>
          <button type="button" class="primary wide" :disabled="busy" @click="finish">确认解除</button>
        </div>
      </div>
    </Sheet>
  </div>
</template>
<style scoped>
.lock-page { display: grid; gap: 18px; padding-bottom: 36px; }
.page-header { gap: 12px; margin-bottom: 0; }
.page-header h1 { flex: 1; }
.header-space { width: 48px; flex-shrink: 0; }
.lock-center { text-align: center; padding: 48px 0 32px; display: grid; gap: 10px; }
.lock-center p { line-height: 1.7; }
.focus-clock { font-size: clamp(72px, 22vw, 112px); font-weight: 900; line-height: 1.2; letter-spacing: -0.065em; white-space: nowrap; }
.focus-clock.long-clock { font-size: clamp(58px, 16vw, 83px); }
.settings-group { background: var(--surface); border-radius: var(--radius); overflow: hidden; }
.lock-configuration { display: grid; gap: 12px; padding: 20px; border-bottom: 1px solid var(--line); }
.lock-configuration:last-child { border-bottom: none; }
.lock-configuration .row { justify-content: flex-end; gap: 10px; }
.lock-configuration button { min-height: 48px; min-width: 48px; }
.surface-muted { color: var(--muted-surface); font-size: 13px; margin-top: 4px; }
.lock-result { background: var(--surface); border-radius: var(--radius); padding: 20px; display: grid; gap: 6px; }
.lock-result h2 { font-size: 17px; }
.result-note { color: var(--muted-surface); font-size: 13px; }
.lock-advanced { margin-top: 8px; }
.lock-advanced summary { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; font-size: 15px; font-weight: 600; list-style: none; }
.lock-advanced summary::-webkit-details-marker { display: none; }
.lock-advanced-summary svg { color: var(--muted); transform: rotate(-90deg); transition: transform 180ms cubic-bezier(0.2, 0, 0, 1); }
.lock-advanced-summary svg.open { transform: rotate(0deg); }
.lock-advanced-body { display: grid; gap: 16px; padding-top: 8px; }
.lock-history { display: grid; gap: 10px; }
.history-title { font-size: 15px; }
.lock-history-row { padding: 14px 18px; border-bottom: 1px solid var(--line); }
.lock-history-row:last-child { border-bottom: none; }
.lock-history-row small { display: block; color: var(--muted-surface); font-size: 12px; margin-top: 4px; }
.history-empty { font-size: 13px; }
.lock-help { display: flex; justify-content: center; margin-top: 8px; }
.text-link { min-height: 48px; min-width: 48px; display: inline-flex; align-items: center; justify-content: center; padding: 0 12px; font-size: 14px; color: var(--muted); }
.draft-form, .draft-group { display: grid; gap: 14px; }
.nav-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 48px; padding: 14px 16px; background: var(--surface); border-radius: var(--radius); font-size: 15px; text-align: left; }
.nav-row-meta { color: var(--muted-surface); font-size: 13px; flex-shrink: 0; }
.field-help { font-size: 13px; line-height: 1.7; color: var(--muted); }
.ending-actions { display: grid; gap: 12px; }
p { line-height: 1.7; overflow-wrap: anywhere; font-size: 14px; }
</style>
