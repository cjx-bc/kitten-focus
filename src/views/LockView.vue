<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import { timer, duration } from '../domain/dates'
import { uid, defaultProtection, type LockConfiguration, type ProtectionStatus, type ControlSnapshot } from '../domain/model'
import { protectionDriver, controlDriver } from '../platform/bridge'
import Sheet from '../components/Sheet.vue'
import Icon from '../components/Icon.vue'
import AppWhitelistEditor from '../components/AppWhitelistEditor.vue'
import NotificationSetting from '../components/NotificationSetting.vue'
import ProtectionStartSummary from '../components/ProtectionStartSummary.vue'
const app = useApp(), router = useRouter()
const draft = ref<LockConfiguration | null>(null), whitelistOpen = ref(false)
const starting = ref<LockConfiguration | null>(null), ending = ref(false), busy = ref(false), error = ref('')
const status = ref<ProtectionStatus | null>(null)
const mainEntry = ref<ControlSnapshot['mainEntry']>()
const configurations = computed(() => app.data.lockConfigurations ?? [])
const session = computed(() => app.lock.session)
const result = computed(() => app.lock.records[0])
const selectedPackages = computed(() => draft.value?.whitelist.source === 'custom' ? draft.value.whitelist.packages : [])
const startCount = computed(() => starting.value?.whitelist.source === 'custom' ? starting.value.whitelist.packages.length : app.data.preferences.protection?.globalWhitelist.length ?? 0)
const startPreferences = computed(() => ({ ...defaultProtection(), ...app.data.preferences.protection,
  study: true, strict: starting.value?.strict === true,
  enhancements: [...(starting.value?.enhancements ?? app.data.preferences.protection?.enhancements ?? [])] }))
const enhancementOptions = [
  { key: 'navigationHomeRecents', title: '限制桌面与最近任务' },
  { key: 'recentTasksHidden', title: '隐藏小猫最近任务卡片' },
  { key: 'lockMainInterfaceRestricted', title: '锁机时限制主界面入口' },
  { key: 'wallpaperProtection', title: '壁纸辅助保护' },
  { key: 'preciseAntiClose', title: '精确防关闭' },
  { key: 'launcherIconHidden', title: '隐藏桌面图标' },
]
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
  error.value = ''
  draft.value = configuration ? JSON.parse(JSON.stringify(configuration)) as LockConfiguration : { id: uid(), name: '', minutes: 25, strict: false, whitelist: { source: 'global' } }
}
async function save() {
  if (!draft.value) return
  const configuration = JSON.parse(JSON.stringify(draft.value)) as LockConfiguration
  if (!configuration.name.trim()) { error.value = '请填写锁机名称'; return }
  if (!Number.isSafeInteger(configuration.minutes) || configuration.minutes < 1 || configuration.minutes > 1440) { error.value = '时长需要是 1–1440 之间的整数分钟'; return }
  busy.value = true
  try {
    await app.mutate(d => {
      const rows = d.lockConfigurations ??= []
      const index = rows.findIndex(row => row.id === configuration.id)
      if (index < 0) rows.push(configuration); else rows[index] = configuration
    })
    draft.value = null
  } catch (e) { error.value = String(e) } finally { busy.value = false }
}
async function refresh() { try { status.value = await protectionDriver.status(); mainEntry.value = (await controlDriver.observe()).mainEntry } catch (e) { error.value = String(e) } }
async function prepare(configuration: LockConfiguration) { error.value = ''; starting.value = configuration; await refresh() }
async function start() {
  if (!starting.value) return
  busy.value = true
  try { await app.startLock(starting.value.id, starting.value.strict === true); starting.value = null; await refresh() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function finish() {
  busy.value = true
  try { await app.finishLock(true); ending.value = false; await refresh() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
function recovery() { window.dispatchEvent(new Event('open-recovery')) }
async function settings() { await protectionDriver.openSettings(); await refresh() }
let statusTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => { void refresh(); statusTimer = setInterval(() => void refresh(), 2000) })
onUnmounted(() => clearInterval(statusTimer))
</script>
<template>
  <div class="page lock-page">
    <header class="page-header"><button class="icon-button" aria-label="返回我的" @click="router.replace('/settings')"><Icon name="back" /></button><h1>独立锁机</h1><button v-if="!session" class="icon-button" aria-label="新建锁机配置" @click="edit()"><Icon name="plus" /></button></header>
    <template v-if="session">
      <div class="lock-center"><p class="muted">{{ session.strictMode ? '严格锁机进行中' : '普通锁机进行中' }}</p><div class="focus-clock number" :class="{ 'long-clock': app.lock.remainingMs >= 3600000 }">{{ timer(app.lock.remainingMs) }}</div><h2>{{ session.title }}</h2><p role="status">{{ status?.reason || '正在检查保护状态' }}</p><p class="muted">本轮名单已固定 · {{ session.protection.source === 'custom' ? '独立白名单' : '跟随全局' }} · 允许 {{ session.protection.whitelist.length }} 个应用</p></div>
      <p role="status">主界面入口：{{ mainEntry?.withdrawn ? '本轮已恢复普通入口' : mainEntry?.active ? '本轮只进入锁机控制' : '本轮未限制' }}</p>
      <p v-if="session.strictMode" class="notice">严格锁机不能暂停、取消或提前解除；到期自动结束。帮助与故障恢复仍可进入，恢复后本轮严格计时继续。</p><button v-else class="secondary wide" @click="ending = true; error = ''">提前解除</button>
    </template>
    <template v-else>
      <p class="muted">不创建待办，也能把手机留给必要的事。锁机不会计入专注统计，结束后不会自动休息。</p>
      <div v-if="app.focus.session || app.rest.session?.state === 'running'" class="notice"><p>已有{{ app.focus.session ? '专注' : '休息' }}正在进行。处理完成后可开始锁机。</p><button class="secondary wide" @click="router.replace(app.focus.session ? '/focus' : '/rest')">返回当前{{ app.focus.session ? '专注' : '休息' }}</button></div>
      <article v-if="result" class="lock-result"><h2>{{ result.status === 'completed' ? '本轮锁机已到期' : result.status === 'early' ? '本轮锁机已解除' : '设备重启，锁机已中断' }}</h2><p>{{ result.title }} · {{ duration(result.durationMs) }}</p><p class="muted">记录仅保留在锁机历史。设备重启后不会自动重新锁机。</p></article>
      <div class="settings-group">
        <div v-for="configuration in configurations" :key="configuration.id" class="lock-configuration"><div><strong>{{ configuration.name }}</strong><p class="muted">{{ configuration.minutes }} 分钟 · {{ configuration.strict ? '严格锁机' : '普通锁机' }} · {{ configuration.whitelist.source === 'global' ? '跟随全局白名单' : `独立白名单 · ${configuration.whitelist.packages.length} 个应用` }}</p></div><div class="row"><button class="secondary" @click="edit(configuration)">编辑</button><button class="primary" :disabled="!!app.focus.session || app.rest.session?.state === 'running'" @click="prepare(configuration)">开始</button></div></div>
      </div>
      <button class="secondary wide" @click="edit()">新建锁机配置</button>
      <details v-if="app.lock.records.length"><summary>锁机历史（{{ app.lock.records.length }}）</summary><p v-for="record in app.lock.records" :key="record.id">{{ record.title }} · {{ record.status === 'completed' ? '到期' : record.status === 'early' ? '提前解除' : '重启中断' }} · {{ duration(record.durationMs) }}<small>{{ new Date(record.startedAt).toLocaleString() }}</small></p></details>
    </template>
    <NotificationSetting runtime-only />
    <div class="lock-help"><button class="text-button" @click="refresh">重新检查保护</button><button class="text-button" @click="recovery">帮助与故障恢复</button></div>
    <div class="lock-help"><RouterLink to="/permissions">权限与保护状态</RouterLink><RouterLink to="/help">离线保护帮助</RouterLink><RouterLink to="/emergency">紧急与必要交互</RouterLink><RouterLink to="/recovery">故障恢复入口</RouterLink></div>
    <p v-if="error && !draft && !starting && !ending" role="alert" class="form-error">{{ error }}</p>
    <Sheet :open="!!draft" title="锁机配置" @close="!busy && (draft = null)"><form v-if="draft" @submit.prevent="save"><label>锁机名称<input v-model.trim="draft.name" maxlength="80" required /></label><label>锁机时长（分钟）<input v-model.number="draft.minutes" type="number" min="1" max="1440" required /></label><label class="switch"><span>使用独立白名单</span><input type="checkbox" :checked="draft.whitelist.source === 'custom'" @change="draft.whitelist = ($event.target as HTMLInputElement).checked ? { source: 'custom', packages: [...(app.data.preferences.protection?.globalWhitelist ?? [])] } : { source: 'global' }" /></label><template v-if="draft.whitelist.source === 'custom'"><button type="button" class="secondary wide" @click="whitelistOpen = true">编辑独立白名单 · {{ draft.whitelist.packages.length }} 个应用</button><p class="muted">独立名单替代全局名单；空名单也会保留，仅允许小猫和必要系统交互。</p></template><p v-else class="muted">每次开始使用最新全局名单。运行中修改配置只影响下一轮。</p><label class="switch"><span>严格锁机</span><input v-model="draft.strict" type="checkbox" /></label><p class="muted">严格锁机开始后不能暂停、取消或提前解除，到期自动结束。普通锁机可以确认后提前解除。帮助和故障恢复始终可进入。</p><label class="switch"><span>使用独立增强选项</span><input type="checkbox" :checked="draft.enhancements !== undefined" @change="independentEnhancements" /></label><template v-if="draft.enhancements !== undefined"><label v-for="option in enhancementOptions" :key="option.key" class="switch"><span>{{ option.title }}</span><input type="checkbox" :checked="draft.enhancements.includes(option.key)" @change="toggleEnhancement(option.key, $event)" /></label><p class="muted">独立增强替代全局增强，全部关闭也会保留。运行中修改配置只影响下一轮。</p></template><p v-else class="muted">增强选项跟随全局设置，每次开始重新固定本轮选择。</p><RouterLink class="secondary wide" to="/help">查看增强影响、权限与恢复方法</RouterLink><p v-if="error" role="alert" class="form-error">{{ error }}</p><button class="primary wide" :disabled="busy">保存配置</button></form></Sheet>
    <AppWhitelistEditor :open="whitelistOpen" title="锁机独立白名单" :packages="selectedPackages" @close="whitelistOpen = false" @confirm="draft && (draft.whitelist = { source: 'custom', packages: $event }); whitelistOpen = false" />
    <Sheet :open="!!starting" :title="starting?.strict ? '开始严格锁机' : '开始普通锁机'" @close="!busy && (starting = null)"><p>{{ starting?.name }} · {{ starting?.minutes }} 分钟</p><p>将限制使用名单外的应用；电话、紧急拨号、输入法和必要系统交互仍可使用。</p><p>{{ starting?.whitelist.source === 'custom' ? '独立白名单' : '跟随全局白名单' }} · {{ startCount }} 个自选应用。本轮开始后名单固定。</p><p role="status">{{ status?.authorized && status?.connected ? '无障碍服务已连接，可开始锁机' : status?.reason }}</p><ProtectionStartSummary v-if="starting" :preferences="startPreferences" lock @settings="starting = null" /><p v-if="starting?.strict" class="notice">严格锁机开始后不能暂停、取消或提前解除，到期自动结束。返回、锁屏或重新打开应用仍继续同一轮计时。故障恢复可以撤销系统保护，但不会结束本轮严格锁机。</p><p v-else>普通锁机可以确认后提前解除。帮助和故障恢复始终可进入。</p><p v-if="error" class="form-error" role="alert">{{ error }}</p><button class="primary wide" :disabled="busy || !status?.authorized || !status?.connected" @click="start">确认开始锁机</button><button v-if="status?.supported && (!status.authorized || !status.connected)" class="secondary wide" @click="settings">前往无障碍授权</button><button class="secondary wide" :disabled="busy" @click="starting = null">暂不开始</button></Sheet>
    <Sheet :open="ending" title="提前解除本轮锁机？" @close="!busy && (ending = false)"><p>确认后将撤销本轮应用限制，保存独立锁机记录，不会开始休息。</p><p v-if="error" class="form-error" role="alert">{{ error }}</p><button class="primary wide" :disabled="busy" @click="finish">确认解除</button><button class="secondary wide" :disabled="busy" @click="ending = false">继续锁机</button></Sheet>
  </div>
</template>
<style scoped>
.lock-page { padding-bottom: 36px; } .page-header { gap: 12px; } .page-header h1 { flex: 1; }
.lock-center { text-align: center; padding: 48px 0; } .lock-center p { line-height: 1.7; }
.focus-clock { font-size: clamp(72px, 22vw, 112px); font-weight: 900; line-height: 1.2; letter-spacing: -0.065em; white-space: nowrap; }
.focus-clock.long-clock { font-size: clamp(58px, 16vw, 83px); }
.lock-configuration { display: grid; gap: 12px; padding: 20px; border-bottom: 1px solid var(--line); }
.lock-configuration .row { justify-content: flex-end; } .lock-result { padding: 24px 0; }
.lock-help { display: flex; justify-content: center; gap: 16px; flex-wrap: wrap; margin-top: 24px; }
p { line-height: 1.7; overflow-wrap: anywhere; } small { display: block; color: var(--muted); }
details { margin-top: 28px; } summary { min-height: 48px; padding-top: 12px; }
</style>
