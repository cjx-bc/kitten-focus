<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { NavigationProtectionStatus } from '../domain/model'
import { protectionDriver } from '../platform/bridge'
import AntiCloseSettings from './AntiCloseSettings.vue'
import RecentTasksSetting from './RecentTasksSetting.vue'
import LauncherSetting from './LauncherSetting.vue'
import LockMainEntrySetting from './LockMainEntrySetting.vue'

const app = useApp()
const option = 'navigationHomeRecents'
const selected = computed(() => app.data.preferences.protection?.enhancements.includes(option) ?? false)
const status = ref<NavigationProtectionStatus>(), busy = ref(false), error = ref(''), showPermission = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | undefined
const labels = { off: '未开启', authorization: '待授权', ready: '已就绪', armed: '待验证实际导航', protecting: '已观察到返回', failed: '保护失效', unsupported: '本机不支持', recovered: '本轮已撤销' }
async function refresh() {
  try { status.value = (await protectionDriver.status()).navigation }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
function visibility() { if (!document.hidden) void refresh() }
onMounted(() => {
  void refresh()
  refreshTimer = setInterval(() => { if (!document.hidden) void refresh() }, 2000)
  document.addEventListener('visibilitychange', visibility); window.addEventListener('focus', refresh); window.addEventListener('protection-recovered', refresh)
})
onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer)
  document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', refresh); window.removeEventListener('protection-recovered', refresh)
})
async function toggle(event: Event) {
  busy.value = true; error.value = ''
  try {
    const checked = (event.target as HTMLInputElement).checked
    await app.mutate(d => {
      const protection = { ...defaultProtection(), ...d.preferences.protection }
      protection.enhancements = protection.enhancements.filter(value => value !== option)
      if (checked) protection.enhancements.push(option)
      d.preferences.protection = protection
    })
    await refresh()
    if (checked && (!status.value?.authorized || !status.value.connected)) showPermission.value = true
    app.notify(app.focus.session ? '增强选项已保存，将用于下一轮' : '增强选项已保存')
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function authorize() {
  busy.value = true; error.value = ''
  try { await protectionDriver.openSettings() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false; await refresh() }
}
</script>
<template>
  <section class="enhancements" :aria-busy="busy" aria-labelledby="enhancements-title">
    <strong id="enhancements-title">提升强制性选项</strong>
    <label class="switch"><span>限制桌面与最近任务<small>本轮计时（含普通暂停）期间返回专注</small></span><input type="checkbox" :checked="selected" :disabled="busy" @change="toggle" /></label>
    <p class="muted">独立于学霸、严格模式。需要无障碍授权，只处理桌面与最近任务窗口，不屏蔽全部系统设置。电话、紧急拨号、输入法、授权和故障恢复保持可达。</p>
    <div role="status" class="navigation-status">
      <strong>{{ status ? labels[status.state] : '正在检查增强能力' }}</strong>
      <p>{{ status?.reason }}</p>
      <p v-if="status?.supported">系统授权：{{ status.authorized ? '已启用' : '未启用' }} · 服务：{{ status.connected ? '已连接' : '未连接' }}</p>
      <p v-if="status?.lastReturnedAt">最近返回：{{ new Date(status.lastReturnedAt).toLocaleTimeString() }} · {{ status.lastTarget === 'recents' ? '最近任务' : status.lastTarget === 'launcher' ? '桌面或最近任务窗口' : '桌面' }}</p>
    </div>
    <p class="muted">普通安装通过窗口事件返回专注，无法保证所有系统和厂商手势。启用或授权不会立即限制导航；结束、休息、重启或故障恢复撤销本轮限制。</p>
    <button v-if="status?.supported" class="secondary wide" :disabled="busy" @click="showPermission = !showPermission">查看权限用途</button>
    <div v-if="showPermission" class="permission-help">
      <p>允许小猫识别前台窗口所属应用并返回计时页。精确防关闭另需短暂读取系统设置中本应用标题和按钮；其他应用正文不读取。返回后重新检查授权及服务，实际执行结果另行显示。你可暂不开启或在系统设置撤销权限。</p>
      <button class="secondary wide" :disabled="busy" @click="authorize">前往无障碍设置</button>
    </div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <RecentTasksSetting />
    <LauncherSetting />
    <AntiCloseSettings />
    <LockMainEntrySetting />

  </section>
</template>
<style scoped>
.enhancements, .permission-help { display: grid; gap: 14px; }
.enhancements p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 5px; }
.navigation-status { background: var(--surface); padding: 16px; border-radius: 14px; }
.navigation-status p { margin-top: 5px; color: var(--muted); }
</style>
