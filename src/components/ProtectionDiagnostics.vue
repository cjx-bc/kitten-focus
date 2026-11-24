<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import {
  native,
  openBatteryOptimizationSettings,
  permissionStatus,
  protectionDriver,
  requestNotifications,
  type SystemPermissions,
} from '../platform/bridge'
import { dndDriver } from '../platform/dnd'
import { notificationDriver } from '../platform/notifications'
import { readProtectionDiagnostics, protectionStateLabels, type CapabilityDiagnostic, type ProtectionDiagnostics } from '../platform/protectionDiagnostics'
import Sheet from './Sheet.vue'
const app = useApp(), result = ref<ProtectionDiagnostics>(), busy = ref(false), rebindBusy = ref(false), error = ref(''), checkedAt = ref('')
const sysPerm = ref<SystemPermissions>({
  notifications: false,
  exactAlarms: false,
  batteryOptimizationIgnored: false,
  foregroundServiceActive: false,
})
const permission = ref<CapabilityDiagnostic['settings']>()
let interval: ReturnType<typeof setInterval> | undefined, listener: PluginListenerHandle | undefined, disposed = false
async function refresh() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {
    const [diagRes, permRes] = await Promise.allSettled([
      readProtectionDiagnostics(app.data.preferences.protection ?? defaultProtection()),
      permissionStatus(),
    ])
    if (diagRes.status === 'fulfilled') {
      result.value = diagRes.value
    } else {
      throw diagRes.reason
    }
    if (permRes.status === 'fulfilled' && permRes.value) {
      sysPerm.value = { ...sysPerm.value, ...permRes.value }
    }
    checkedAt.value = new Date().toLocaleTimeString()
  }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function rebindNotifications() {
  if (busy.value || rebindBusy.value) return
  rebindBusy.value = true
  error.value = ''
  try {
    await notificationDriver.rebind()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    return
  } finally {
    rebindBusy.value = false
  }
  await refresh()
}
async function openBattery() {
  error.value = ''
  try {
    await openBatteryOptimizationSettings()
    await refresh()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}
function visible() { if (!document.hidden) void refresh() }
async function authorize() {
  const target = permission.value; permission.value = undefined
  try {
    if (target === 'usageStats') await protectionDriver.openSettings('usageStats')
    else if (target === 'overlay') await protectionDriver.openSettings('overlay')
    else if (target === 'accessibility') await protectionDriver.openSettings('accessibility')
    else if (target === 'notifications') await notificationDriver.openSettings()
    else if (target === 'dnd') await dndDriver.openSettings()
    else if (target === 'controlNotification') await requestNotifications()
    await refresh()
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
onMounted(async () => {
  void refresh(); interval = setInterval(visible, 3000)
  window.addEventListener('focus', visible); window.addEventListener('protection-recovered', visible); document.addEventListener('visibilitychange', visible)
  if (native) {
    const handle = await App.addListener('appStateChange', ({ isActive }) => { if (isActive) void refresh() })
    if (disposed) void handle.remove(); else listener = handle
  }
})
onBeforeUnmount(() => {
  disposed = true; clearInterval(interval); void listener?.remove()
  window.removeEventListener('focus', visible); window.removeEventListener('protection-recovered', visible); document.removeEventListener('visibilitychange', visible)
})
</script>
<template>
  <section class="diagnostics" aria-labelledby="diagnostics-title">
    <div class="diagnostics-heading"><h2 id="diagnostics-title">当前保护状态</h2><button type="button" class="secondary" :disabled="busy" @click="refresh">{{ busy ? '正在检查…' : '重新检查' }}</button></div>
    <p role="status">{{ result ? protectionStateLabels[result.state] : '正在读取本机状态' }}</p>
    <small v-if="checkedAt" class="checked-at">检查于 {{ checkedAt }}</small>
    <p v-if="!native" class="notice">浏览器只预览界面与计时，不能执行 Android 应用、通知或系统入口保护。</p>
    <details class="status-legend" data-ux-card>
      <summary><span>状态含义与检查说明</span></summary>
      <div class="legend-body">
        <ul class="legend-list">
          <li><strong>未开启</strong>：未选择该能力，或本轮已主动撤销</li>
          <li><strong>待授权</strong>：下一轮所需的系统权限或服务连接未就绪</li>
          <li><strong>已就绪</strong>：权限已就绪，等待本轮开始或实际效果核实</li>
          <li><strong>保护中</strong>：对应执行器或系统状态已确认运行</li>
          <li><strong>保护失效</strong>：执行、读取或恢复遇到问题（单项失效不中断计时）</li>
        </ul>
        <p class="surface-help">下一轮偏好和本轮请求分开显示。运行中改偏好不改变本轮快照；重新检查只读状态，不自动开启保护或恢复。</p>
      </div>
    </details>
    <details v-for="row in result?.capabilities" :key="row.id" class="capability" :data-capability="row.id">
      <summary><span>{{ row.title }}<small v-if="!row.supported" class="support-note">本环境未支持或尚未接入</small></span><span class="capability-state">{{ protectionStateLabels[row.state] }}</span></summary>
      <div class="capability-body">
        <p>{{ row.reason || '当前未返回额外原因。' }}</p>
        <dl>
          <div><dt>下一轮偏好</dt><dd>{{ row.selected ? '已开启' : '未开启' }}</dd></div>
          <div><dt>支持范围</dt><dd>{{ row.supported ? '已提供本项接口，效果见下方' : '本环境尚不支持或未接入' }}</dd></div>
          <div v-if="row.authorized !== null"><dt>{{ row.id === 'launcher' || row.id === 'recentTasks' ? '备用通知入口' : '系统授权' }}</dt><dd>{{ row.authorized ? '已就绪' : '未就绪' }}</dd></div>
          <div v-if="row.connected !== null"><dt>服务连接</dt><dd>{{ row.connected ? '已连接' : '未连接' }}</dd></div>
          <div><dt>本轮请求</dt><dd>{{ row.requested === null ? '未核实' : row.requested ? '已选择' : '未选择' }}</dd></div>
          <div><dt>当前执行</dt><dd>{{ row.active === null ? '未核实' : row.active ? '执行中' : '未执行' }}</dd></div>
          <div><dt>独立效果核验</dt><dd>{{ row.verified === null ? '无独立核验结果' : row.verified ? '已有系统观察结果' : '尚未核实实际效果' }}</dd></div>
          <div><dt>恢复责任</dt><dd>{{ row.recoveryPending === null ? '未核实，请重新检查' : row.recoveryPending ? '仍有待恢复项目' : '未报告待恢复项目' }}</dd></div>
        </dl>
        <p class="surface-help">{{ row.effect }}</p>
        <p v-if="row.requested && ['recovered', 'withdrawn', 'restored', 'released'].includes(row.phase)" class="notice">本轮已停止新保护；主动撤销的能力不会因重连再次启用。剩余恢复项目仍需处理。</p>
        <button
          v-if="row.id === 'notifications' && row.supported && row.authorized && row.connected === false"
          type="button"
          class="secondary wide"
          :disabled="busy || rebindBusy"
          @click="rebindNotifications"
        >{{ rebindBusy ? '正在重连通知监听…' : '重连通知监听' }}</button>
        <button v-if="native && row.supported && row.settings" type="button" class="secondary wide" @click="permission = row.settings">查看用途与系统授权</button>
        <RouterLink v-if="row.recoveryPending" class="secondary wide" to="/recovery">查看恢复清单与重试</RouterLink>
      </div>
    </details>
    <details class="capability" data-capability="backgroundKeepAlive">
      <summary>
        <span>后台运行与电池优化<small v-if="!native" class="support-note">仅 Android 本机可用</small></span>
        <span class="capability-state">{{
          !native ? '不支持' : sysPerm.batteryOptimizationIgnored ? '已放行' : '未放行'
        }}</span>
      </summary>
      <div class="capability-body">
        <p>专注或锁机进行中启动前台保活服务并复用专注通知，结束即停。电池优化放行用于减少锁屏后后台与提醒被系统暂停。</p>
        <dl>
          <div>
            <dt>电池优化白名单</dt>
            <dd>{{ !native ? '仅 Android 本机' : sysPerm.batteryOptimizationIgnored ? '已放行' : '受省电限制' }}</dd>
          </div>
          <div>
            <dt>专注保活服务</dt>
            <dd>{{ !native ? '仅 Android 本机' : sysPerm.foregroundServiceActive ? '运行中（复用专注通知）' : '待专注或锁机启动' }}</dd>
          </div>
        </dl>
        <p class="surface-help">可降低后台被系统回收概率，但不承诺免疫用户主动强停或激进厂商后台策略。</p>
        <button v-if="native" type="button" class="secondary wide" :disabled="busy" @click="openBattery">
          前往系统电池优化设置
        </button>
      </div>
    </details>
    <p v-if="result" class="field-help">{{ result.identity }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}。当前结果可能已过期，请重新检查。</p>
    <Sheet :open="!!permission" title="权限用途与选择" @close="permission = undefined">
      <div class="permission-copy">
        <template v-if="permission === 'usageStats'"><p>用于识别当前打开了哪个应用，仅对比本轮白名单，不读取应用正文。</p><p>该授权为系统持久化权限，退出应用或重启手机不会撤回。</p></template>
        <template v-else-if="permission === 'overlay'"><p>用于在打开名单外应用时立即覆盖显示专注阻挡页，提供返回会话和临时放行入口。</p><p>该授权为系统持久化权限，退出应用或重启手机不会撤回。</p></template>
        <template v-else-if="permission === 'accessibility'"><p>用于高阶增强「限制桌面与最近任务」和「精确防关闭」，以及协同加速应用限制，不保存或上传任何内容。</p><p>日常应用限制由「使用情况访问 + 悬浮窗」完成，不依赖无障碍。</p></template>
        <template v-else-if="permission === 'notifications'"><p>专注期间暂缓名单外通知，结束后请求恢复。不保存通知正文。</p><p>电话、闹钟与紧急通知保留。</p></template>
        <template v-else-if="permission === 'dnd'"><p>减少通知声音和振动，保留来电、闹钟与媒体。</p><p>其他勿扰设置不变。</p></template>
        <template v-else><p>隐藏桌面图标或最近任务卡后，需要从小猫控制通知重新进入应用和故障恢复。</p><p>结束后恢复原状态；系统显示刷新可能有延迟。</p></template>
        <button type="button" class="primary wide" @click="authorize">前往系统授权</button><button type="button" class="secondary wide" @click="permission = undefined">暂不授权</button>
      </div>
    </Sheet>
  </section>
</template>
<style scoped>
.diagnostics, .capability-body, .permission-copy { display: grid; gap: 16px; }
.diagnostics-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.diagnostics-heading h2 { font-size: 19px; }
.diagnostics-heading button { flex-shrink: 0; min-height: 48px; min-width: 48px; }
.checked-at { font-size: 12px; color: var(--muted); }
.capability, .status-legend { border-radius: var(--radius); background: var(--surface); padding: 0 16px; min-width: 0; }
.status-legend summary { min-height: 48px; font-size: 13px; color: var(--muted-surface); }
.legend-body { padding-bottom: 16px; display: grid; gap: 10px; }
.legend-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: 12px; color: var(--muted-surface); line-height: 1.6; }
.legend-list strong { color: var(--ink); font-weight: 600; }
summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 60px; cursor: pointer; font-size: 14px; }
summary::after { content: '+'; color: var(--muted-surface); }
details[open] summary::after { content: '−'; }
summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; border-radius: 8px; }
.capability-state { margin-left: auto; flex-shrink: 0; font-size: 12px; color: var(--muted-surface); }
.support-note { display: block; font-size: 12px; font-weight: 400; color: var(--muted-surface); margin-top: 4px; }
.capability-body { padding-bottom: 18px; }
.capability-body button, .capability-body a { min-height: 48px; min-width: 48px; }
.surface-help { font-size: 13px; line-height: 1.7; color: var(--muted-surface); }
.permission-copy button { min-height: 48px; min-width: 48px; }
p { font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
dl { margin: 0; display: grid; gap: 9px; font-size: 12px; }
dl div { display: flex; justify-content: space-between; gap: 14px; }
dt { color: var(--muted-surface); flex-shrink: 0; }
dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
</style>
