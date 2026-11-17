<script setup lang="ts">
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import InfoHint from './InfoHint.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { NavigationProtectionStatus } from '../domain/model'
import { protectionDriver } from '../platform/bridge'
import AntiCloseSettings from './AntiCloseSettings.vue'
import RecentTasksSetting from './RecentTasksSetting.vue'
import LauncherSetting from './LauncherSetting.vue'
import LockMainEntrySetting from './LockMainEntrySetting.vue'
import WallpaperSetting from './WallpaperSetting.vue'
import Sheet from './Sheet.vue'
import { usePendingEnable } from './usePendingEnable'

const app = useApp()
const option = 'navigationHomeRecents'
const selected = computed(() => app.data.preferences.protection?.enhancements.includes(option) ?? false)
const status = ref<NavigationProtectionStatus>(), busy = ref(false), error = ref(''), showPermission = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | undefined
let readRevision = 0
const enableGate = usePendingEnable(saveSelected, refresh)
const permissionReady = () => !!(status.value?.supported && status.value.authorized && status.value.connected)
function cancelEnable() { enableGate.cancel(); showPermission.value = false }
const labels = { off: '未开启', authorization: '待授权', ready: '已就绪', armed: '待验证实际导航', protecting: '已观察到返回', failed: '保护失效', unsupported: '本机不支持', recovered: '本轮已撤销' }
async function refresh() {
  const revision = ++readRevision
  try {
    const value = (await protectionDriver.status()).navigation
    if (revision !== readRevision) return
    status.value = value
    if (await enableGate.observe(permissionReady(), !!value?.authorized)) await refresh()
  } catch (e) { if (revision === readRevision) { status.value = undefined; error.value = e instanceof Error ? e.message : String(e) } }
}
function visibility() { if (!document.hidden) void refresh() }
onMounted(() => {
  void refresh()
  refreshTimer = setInterval(() => { if (!document.hidden) void refresh() }, 2000)
  document.addEventListener('visibilitychange', visibility); window.addEventListener('focus', refresh); window.addEventListener('protection-recovered', refresh)
})
onBeforeUnmount(() => {
  readRevision++
  if (refreshTimer) clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', refresh); window.removeEventListener('protection-recovered', refresh)
})
async function saveSelected(checked: boolean) {
  const wasBusy = busy.value
  busy.value = true
  try {
    await app.mutate(d => {
      const protection = { ...defaultProtection(), ...d.preferences.protection }
      protection.enhancements = protection.enhancements.filter(value => value !== option)
      if (checked) protection.enhancements.push(option)
      d.preferences.protection = protection
    })
    app.notify(app.focus.session ? '增强选项已保存，将用于下一轮' : '增强选项已保存')
  } finally { if (!wasBusy) busy.value = false }
}
async function toggle(event: Event) {
  const target = event.target as HTMLInputElement, checked = target.checked
  target.checked = selected.value
  if (busy.value || (checked && !status.value?.supported)) return
  busy.value = true; error.value = ''
  try { showPermission.value = await enableGate.request(checked, permissionReady()); if (!showPermission.value) await refresh() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function authorize() {
  if (busy.value) return
  busy.value = true; error.value = ''
  enableGate.launch()
  try { await protectionDriver.openSettings(); showPermission.value = false }
  catch (e) { cancelEnable(); error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false; await refresh() }
}
</script>
<template>
  <section class="enhancements" :aria-busy="busy" aria-labelledby="enhancements-title">
    <strong id="enhancements-title" class="sr-only">更多保护选项</strong>
    <div class="help-row"><label class="switch"><span>限制桌面与最近任务</span><input type="checkbox" :checked="selected" :disabled="capabilityToggleDisabled(selected, status?.supported, busy)" @change="toggle" /></label>
      <InfoHint label="限制桌面与最近任务说明">
<p>本轮计时（含普通暂停）期间返回专注</p>
<p class="muted">独立于学霸、严格模式。需要无障碍授权，只处理桌面与最近任务窗口，不屏蔽全部系统设置。电话、紧急拨号、输入法、授权和故障恢复保持可达。</p>
    <div role="status" class="navigation-status">
      <strong>{{ status ? labels[status.state] : '正在检查增强能力' }}</strong>
      <p>{{ status?.reason }}</p>
      <p v-if="status?.supported">系统授权：{{ status.authorized ? '已启用' : '未启用' }} · 服务：{{ status.connected ? '已连接' : '未连接' }}</p>
      <p v-if="status?.lastReturnedAt">最近返回：{{ new Date(status.lastReturnedAt).toLocaleTimeString() }} · {{ status.lastTarget === 'recents' ? '最近任务' : status.lastTarget === 'launcher' ? '桌面或最近任务窗口' : '桌面' }}</p>
    </div>
    <p class="muted">普通安装通过窗口事件返回专注，无法保证所有系统和厂商手势。启用或授权不会立即限制导航；结束、休息、重启或故障恢复撤销本轮限制。</p>
    <button v-if="status?.supported" class="secondary wide" :disabled="busy" @click="showPermission = true">查看权限用途</button>
      </InfoHint>
    </div>
    <p class="field-help" role="status">{{ status ? labels[status.state] : '正在检查' }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <RecentTasksSetting />
    <LauncherSetting />
    <WallpaperSetting />
    <AntiCloseSettings />
    <LockMainEntrySetting />

  </section>
  <Sheet :open="showPermission" title="无障碍权限用途" :close-disabled="busy" @close="cancelEnable"><div class="stack"><p>识别桌面与最近任务窗口，用于返回专注页。不读取其他应用正文。</p><button class="primary" :disabled="busy" @click="authorize">前往系统设置</button><button class="secondary" :disabled="busy" @click="cancelEnable">暂不开启</button></div></Sheet>
</template>
<style scoped>
.enhancements { display: grid; gap: 8px; }
.enhancements p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 5px; }
.navigation-status { background: var(--surface); padding: 16px; border-radius: 14px; }
.navigation-status p { margin-top: 5px; color: var(--muted); }
</style>
