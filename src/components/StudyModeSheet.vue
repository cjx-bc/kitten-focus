<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { ProtectionStatus } from '../domain/model'
import { capabilityToggleDisabled, studyDisplay } from '../domain/protectionDisplay'
import { protectionDriver } from '../platform/bridge'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import StrictModeSetting from './StrictModeSetting.vue'
import AppWhitelistEditor from './AppWhitelistEditor.vue'
import DndSetting from './DndSetting.vue'
import EnhancedProtectionSettings from './EnhancedProtectionSettings.vue'
import NotificationSetting from './NotificationSetting.vue'
import InfoHint from './InfoHint.vue'
import { usePendingEnable } from './usePendingEnable'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const app = useApp()
const prefs = computed(() => app.data.preferences.protection ?? defaultProtection())
const status = ref<ProtectionStatus | null>(null)
const error = ref(''), busy = ref(false), permissionHelp = ref(false), editing = ref(false)
const readFailed = ref(false)
const readError = ref(''), enhancementsOpen = ref(false)
let revision = 0
let timer: ReturnType<typeof setInterval> | undefined
async function saveStudy(study: boolean) {
  busy.value = true
  try { await app.mutate(d => { d.preferences.protection = { ...defaultProtection(), ...d.preferences.protection, study } }) }
  finally { busy.value = false }
}
const enableGate = usePendingEnable(saveStudy, refresh)
const permissionReady = () => !!(status.value?.supported && status.value.authorized && status.value.connected)
function cancelEnable() { enableGate.cancel(); permissionHelp.value = false }
const display = computed(() => studyDisplay(prefs.value.study, app.focus.session?.protection?.study === true,
  app.focus.session?.protection?.applicationsWithdrawn === true, status.value, readFailed.value))
async function refresh() {
  const request = ++revision
  try {
    const value = await protectionDriver.status()
    if (request === revision) {
      status.value = value; readFailed.value = false; readError.value = ''
      if (await enableGate.observe(permissionReady(), value.authorized)) await refresh()
    }
  } catch (e) {
    if (request === revision) { status.value = null; readFailed.value = true; readError.value = e instanceof Error ? e.message : String(e) }
  }
}
function visibility() { if (!document.hidden) void refresh() }
onMounted(() => { void refresh(); timer = setInterval(visibility, 2000); document.addEventListener('visibilitychange', visibility); window.addEventListener('focus', refresh); window.addEventListener('protection-recovered', refresh) })
onBeforeUnmount(() => { revision++; clearInterval(timer); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', refresh); window.removeEventListener('protection-recovered', refresh) })
function recovery() { window.dispatchEvent(new Event('open-recovery')) }
async function toggleStudy(event: Event) {
  const target = event.target as HTMLInputElement, checked = target.checked
  target.checked = prefs.value.study
  if (busy.value || (checked && !status.value?.supported)) return
  busy.value = true; error.value = ''
  try {
    permissionHelp.value = await enableGate.request(checked, permissionReady())
    if (!permissionHelp.value) await refresh()
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function saveApps(packages: string[]) {
  busy.value = true; error.value = ''
  try {
    await app.mutate(d => { d.preferences.protection = { ...defaultProtection(), ...d.preferences.protection,
      globalWhitelist: packages } })
    editing.value = false; app.notify(app.focus.session ? '白名单已保存，将用于下一轮专注' : '全局白名单已保存')
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function authorize() {
  if (busy.value) return
  busy.value = true; error.value = ''
  enableGate.launch()
  try { await protectionDriver.openSettings(); permissionHelp.value = false }
  catch (e) { cancelEnable(); error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false; await refresh() }
}
</script>
<template>
  <Sheet :open="props.open" title="学霸模式" @close="emit('close')">
    <div class="study-stack">
      <div class="help-row">
        <label class="switch"><span>学霸模式<small v-if="status?.supported === false">仅 Android 可用</small><small v-else-if="!status">{{ readFailed ? '状态异常' : '检查中' }}</small></span><input type="checkbox" :checked="prefs.study" :disabled="capabilityToggleDisabled(prefs.study, status?.supported, busy)" @change="toggleStudy" /></label>
        <InfoHint label="学霸模式说明"><p>开始专注后，仅允许本轮白名单中的应用。普通暂停仍限制应用，结束专注或进入休息后解除。</p><p>限制应用使用，不影响基础计时。系统授权与实际保护效果分别检查。</p></InfoHint>
      </div>
      <StrictModeSetting />
      <DndSetting compact />
      <NotificationSetting compact />
      <div class="help-row whitelist-row"><button class="menu-row" :disabled="busy || !status?.supported" @click="editing = true">
        <span>允许使用的应用<small>{{ prefs.globalWhitelist.length }} 个已选</small></span><Icon name="right" :size="18" />
      </button>
      <InfoHint label="白名单说明"><p>无需开启学霸模式也可提前编辑全局白名单，小猫始终允许。电话、输入法、紧急拨号及必要权限交互另作例外，不计入白名单。</p><p>本轮名单在开始时固定。修改仅用于下一轮；关闭偏好不会解除本轮限制。</p></InfoHint></div>
      <details class="more-protection" @toggle="enhancementsOpen = ($event.target as HTMLDetailsElement).open"><summary>更多保护<span>6 项可选</span><Icon name="down" :size="16" /></summary><EnhancedProtectionSettings v-if="enhancementsOpen" /></details>
      <div v-if="prefs.study || app.focus.session?.protection?.study" class="protection-state">
        <strong role="status">{{ display.text }}</strong>
        <InfoHint label="当前保护状态">
        <p>{{ status?.reason }}</p>
        <p v-if="status?.supported">系统授权：{{ status.authorized ? '已启用' : '未启用' }} · 服务：{{ status.connected ? '已连接' : '未连接' }}</p>
        </InfoHint>
      </div>
      <button v-if="prefs.study && status?.supported && (!status.authorized || !status.connected)" class="secondary wide" :disabled="busy" @click="permissionHelp = true">{{ status.authorized ? '检查连接' : '去授权' }}</button>
      <p v-if="app.focus.session" class="session-note">修改用于下一轮专注<InfoHint label="本轮设置说明"><p>本轮名单与保护设置已固定。这里的修改仅用于下一轮；关闭偏好不会解除本轮限制。</p></InfoHint></p>
      <div class="help-links"><RouterLink to="/permissions" @click="emit('close')">权限与状态</RouterLink><RouterLink to="/help" @click="emit('close')">使用帮助</RouterLink><button @click="recovery">故障恢复</button></div>
      <p v-if="error || readError" class="form-error" role="alert">{{ error || readError }}</p>
      <button class="primary wide" @click="emit('close')">完成</button>
    </div>
  </Sheet>
  <Sheet :open="permissionHelp" title="无障碍权限用途" :close-disabled="busy" @close="cancelEnable">
    <div class="study-stack">
      <p>在系统无障碍设置中开启“小猫专注”，用于识别并限制名单外应用。</p>
      <p class="field-help">不读取其他应用正文。精确防关闭仅识别系统页面中小猫自己的入口，不保存或上传内容。</p>
      <button class="primary wide" :disabled="busy || !status?.supported" @click="authorize">前往系统设置</button>
      <button class="secondary wide" :disabled="busy" @click="cancelEnable">暂不开启</button>
    </div>
  </Sheet>
  <AppWhitelistEditor :open="editing" title="全局白名单" :packages="prefs.globalWhitelist"
    :saving="busy" :save-error="error" @close="editing = false" @confirm="saveApps" />
</template>
<style scoped>
.study-stack { display: grid; gap: 4px; }
.study-stack p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 5px; }
.protection-state { display: flex; align-items: center; justify-content: space-between; background: var(--surface); padding: 0 12px; border-radius: 14px; font-size: 12px; color: var(--muted); }
.protection-state p { margin-top: 5px; color: var(--muted); }
.menu-row { display: flex; align-items: center; justify-content: space-between; text-align: left; min-height: 56px; }
.whitelist-row > .menu-row { flex: 1; }
.more-protection { border-block: 1px solid var(--line); }
.more-protection > summary { display: flex; align-items: center; gap: 8px; min-height: 52px; cursor: pointer; font-size: 14px; list-style: none; }
.more-protection > summary::-webkit-details-marker { display: none; }
.more-protection > summary span { margin-left: auto; color: var(--muted); font-size: 12px; }
.help-links { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0 12px; color: var(--muted); font-size: 12px; }
.help-links > * { display: inline-flex; align-items: center; min-height: 44px; }
.session-note { display: flex; align-items: center; justify-content: space-between; color: var(--muted); }
</style>
