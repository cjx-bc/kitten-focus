<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import { native, protectionDriver, requestNotifications } from '../platform/bridge'
import { dndDriver } from '../platform/dnd'
import { notificationDriver } from '../platform/notifications'
import { readProtectionDiagnostics, protectionStateLabels, type CapabilityDiagnostic, type ProtectionDiagnostics } from '../platform/protectionDiagnostics'
import Sheet from './Sheet.vue'
const app = useApp(), result = ref<ProtectionDiagnostics>(), busy = ref(false), error = ref(''), checkedAt = ref('')
const permission = ref<CapabilityDiagnostic['settings']>()
let interval: ReturnType<typeof setInterval> | undefined, listener: PluginListenerHandle | undefined, disposed = false
async function refresh() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { result.value = await readProtectionDiagnostics(app.data.preferences.protection ?? defaultProtection()); checkedAt.value = new Date().toLocaleTimeString() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
function visible() { if (!document.hidden) void refresh() }
async function authorize() {
  const target = permission.value; permission.value = undefined
  try {
    if (target === 'accessibility') await protectionDriver.openSettings()
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
    <div class="diagnostics-heading"><h2 id="diagnostics-title">当前保护状态</h2><button class="secondary" :disabled="busy" @click="refresh">{{ busy ? '正在检查…' : '重新检查' }}</button></div>
    <p role="status">{{ result ? protectionStateLabels[result.state] : '正在读取本机状态' }}</p>
    <small v-if="checkedAt">检查于 {{ checkedAt }}</small>
    <p class="field-help">未开启：未选择或本轮已撤销；待授权：下一轮所需授权或连接未就绪；已就绪：等待本轮或实际效果核实；保护中：对应执行器或系统状态已确认；保护失效：执行、读取或恢复出现问题。逐项查看原因，单项失效不代表计时停止。</p>
    <p v-if="!native" class="notice">浏览器只预览界面与计时，不能执行 Android 应用、通知或系统入口保护。</p>
    <p class="field-help">下一轮偏好和本轮请求分别显示。运行中修改偏好不会改变本轮快照；重新检查只读取状态，不会开启保护或自动恢复。</p>
    <details v-for="row in result?.capabilities" :key="row.id" class="capability" :data-capability="row.id">
      <summary><span>{{ row.title }}<small v-if="!row.supported" class="support-note">本环境未支持或尚未接入</small></span><span class="capability-state">{{ protectionStateLabels[row.state] }}</span></summary>
      <div class="capability-body">
        <p>{{ row.reason || '当前未返回额外原因。' }}</p>
        <dl>
          <div><dt>下一轮偏好</dt><dd>{{ row.selected ? '已开启' : '未开启' }}</dd></div>
          <div><dt>支持范围</dt><dd>{{ row.supported ? '已提供本项接口，效果见下方' : '本环境尚不支持或未接入' }}</dd></div>
          <div v-if="row.authorized !== null"><dt>{{ row.id === 'launcher' ? '备用通知入口' : '系统授权' }}</dt><dd>{{ row.authorized ? '已就绪' : '未就绪' }}</dd></div>
          <div v-if="row.connected !== null"><dt>服务连接</dt><dd>{{ row.connected ? '已连接' : '未连接' }}</dd></div>
          <div><dt>本轮请求</dt><dd>{{ row.requested === null ? '未核实' : row.requested ? '已选择' : '未选择' }}</dd></div>
          <div><dt>当前执行</dt><dd>{{ row.active === null ? '未核实' : row.active ? '执行中' : '未执行' }}</dd></div>
          <div><dt>独立效果核验</dt><dd>{{ row.verified === null ? '无独立核验结果' : row.verified ? '已有系统观察结果' : '尚未核实实际效果' }}</dd></div>
          <div><dt>恢复责任</dt><dd>{{ row.recoveryPending === null ? '未核实，请重新检查' : row.recoveryPending ? '仍有待恢复项目' : '未报告待恢复项目' }}</dd></div>
        </dl>
        <p class="field-help">{{ row.effect }}</p>
        <p v-if="['recovered', 'withdrawn', 'restored', 'released'].includes(row.phase)" class="notice">本轮已停止新保护；主动撤销的能力不会因重连再次启用。剩余恢复项目仍需处理。</p>
        <button v-if="native && row.supported && row.settings" class="secondary wide" @click="permission = row.settings">查看用途与系统授权</button>
        <RouterLink v-if="row.recoveryPending" class="secondary wide" to="/recovery">查看恢复清单与重试</RouterLink>
      </div>
    </details>
    <p v-if="result" class="field-help">{{ result.identity }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}。当前结果可能已过期，请重新检查。</p>
    <Sheet :open="!!permission" title="权限用途与选择" @close="permission = undefined">
      <div class="permission-copy">
        <template v-if="permission === 'accessibility'"><p>用于识别并限制名单外应用，不读取其他应用正文。</p><p>精确防关闭仅识别系统页面中小猫自己的入口，不保存或上传内容。</p></template>
        <template v-else-if="permission === 'notifications'"><p>专注期间暂缓名单外通知，结束后请求恢复。不保存通知正文。</p><p>电话、闹钟与紧急通知保留。</p></template>
        <template v-else-if="permission === 'dnd'"><p>减少通知声音和振动，保留来电、闹钟与媒体。</p><p>其他勿扰设置不变。</p></template>
        <template v-else><p>隐藏图标后，可从小猫控制通知重新进入应用。</p><p>结束后恢复图标；桌面刷新可能有延迟。</p></template>
        <button class="primary wide" @click="authorize">前往系统授权</button><button class="secondary wide" @click="permission = undefined">暂不授权</button>
      </div>
    </Sheet>
  </section>
</template>
<style scoped>
.diagnostics, .capability-body, .permission-copy { display: grid; gap: 16px; }
.diagnostics-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.diagnostics-heading h2 { font-size: 19px; } .diagnostics-heading button { flex-shrink: 0; min-height: 48px; }
.capability { border-radius: 16px; background: var(--surface); padding: 0 16px; min-width: 0; }
summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 60px; cursor: pointer; font-size: 14px; }
summary::after { content: '+'; color: var(--muted); } details[open] summary::after { content: '−'; }
summary:focus-visible { outline: 2px solid var(--focus); outline-offset: 4px; border-radius: 8px; }
.capability-state { margin-left: auto; flex-shrink: 0; font-size: 12px; color: var(--muted); }
.support-note { display: block; font-size: 12px; font-weight: 400; margin-top: 4px; }
.capability-body { padding-bottom: 18px; } p { font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
dl { margin: 0; display: grid; gap: 9px; font-size: 12px; } dl div { display: flex; justify-content: space-between; gap: 14px; }
dt { color: var(--muted); flex-shrink: 0; } dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
</style>
