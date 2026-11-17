<script setup lang="ts">
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import InfoHint from './InfoHint.vue'
import Sheet from './Sheet.vue'
import { usePendingEnable } from './usePendingEnable'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { RecentTasksStatus } from '../domain/model'
import { protectionDriver, requestNotifications } from '../platform/bridge'
const app = useApp(), option = 'recentTasksHidden'
const selected = computed(() => app.data.preferences.protection?.enhancements?.includes(option) ?? false)
const status = ref<RecentTasksStatus>(), busy = ref(false), error = ref('')
const permissionOpen = ref(false)
let readRevision = 0
const enableGate = usePendingEnable(saveSelected, refresh)
const permissionReady = () => !!(status.value?.supported && status.value.recoveryAvailable)
function cancelEnable() { enableGate.cancel(); permissionOpen.value = false }
const labels = { off: '未开启', ready: '等待执行', active: '本轮任务卡已隐藏', failed: '保护失效', restoration_failed: '恢复失败，可重试', withdrawn: '本轮已撤销', restored: '原任务卡状态已恢复', unsupported: '本机不支持' }
let timer: ReturnType<typeof setInterval> | undefined
async function refresh() {
  const revision = ++readRevision
  try {
    const value = await protectionDriver.recentTasks()
    if (revision !== readRevision) return
    status.value = value
    if (await enableGate.observe(permissionReady(), value.recoveryAvailable)) await refresh()
  } catch (e) { if (revision === readRevision) { status.value = undefined; error.value = e instanceof Error ? e.message : String(e) } }
}
function visible() { if (!document.hidden) void refresh() }
onMounted(() => {
  void refresh(); timer = setInterval(visible, 2000)
  document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible); window.addEventListener('protection-recovered', visible)
})
onBeforeUnmount(() => {
  readRevision++
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); window.removeEventListener('protection-recovered', visible)
})
async function saveSelected(checked: boolean) {
  const wasBusy = busy.value
  busy.value = true
  try {
    await app.mutate(data => {
      const protection = { ...defaultProtection(), ...data.preferences.protection }
      protection.enhancements = (protection.enhancements ?? []).filter(value => value !== option)
      if (checked) protection.enhancements.push(option)
      data.preferences.protection = protection
    })
    app.notify('增强选项已保存，将在下一轮开始时生效')
  } finally { if (!wasBusy) busy.value = false }
}
async function toggle(event: Event) {
  const target = event.target as HTMLInputElement, checked = target.checked
  target.checked = selected.value
  if (busy.value || (checked && !status.value?.supported)) return
  busy.value = true; error.value = ''
  try { permissionOpen.value = await enableGate.request(checked, permissionReady()); if (!permissionOpen.value) await refresh() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function authorize() {
  if (busy.value) return
  busy.value = true; error.value = ''
  enableGate.launch()
  try {
    await requestNotifications(); permissionOpen.value = false; await refresh()
    if (!permissionReady()) enableGate.cancel()
  } catch (e) { cancelEnable(); error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
function recover() { window.dispatchEvent(new Event('open-recovery')) }
</script>
<template>
  <div class="recent-tasks-setting" :aria-busy="busy">
    <div class="help-row"><label class="switch"><span>隐藏自身最近任务卡</span><input type="checkbox" :checked="selected" :disabled="capabilityToggleDisabled(selected, status?.supported, busy)" @change="toggle" /></label>
      <InfoHint label="隐藏最近任务卡说明">
<p>仅在本轮保护期间隐藏小猫卡片</p>
<p>无需额外系统身份，仅修改小猫自己的主任务。开始前保存原状态；结束、休息或重启中断后恢复。隐藏任务卡不代表无法被系统强停。</p>
    <p>需保留小猫控制通知，其中“帮助与故障恢复”可重新进入应用。未确认通知入口可达时不会隐藏；拒绝通知后可暂不开启本选项。</p>
    <div class="recent-tasks-status" role="status">
      <strong>{{ status ? labels[status.phase] : '正在检查任务卡状态' }}</strong>
      <p v-if="status?.supported">下一轮偏好：{{ selected ? '已开启' : '未开启' }} · 本轮请求：{{ status.requested ? '已选择' : '未选择' }}</p>
      <p v-if="status?.supported && selected && !status.requested">{{ status.recoveryAvailable ? '通知入口可用，下一轮开始时再检查并执行' : '待开启通知，暂不具备可达恢复入口' }}</p>
      <p v-if="status?.error">{{ status.error }}</p>
    </div>
      </InfoHint>
    </div>
    <p class="field-help" role="status">{{ status ? labels[status.phase] : '正在检查' }}</p>
    <p v-if="status?.supported && status.error" class="form-error" role="alert">{{ status.error }}</p>
    <button v-if="status?.supported && selected && !status.recoveryAvailable" class="secondary wide" :disabled="busy" @click="authorize">开启控制通知</button>
    <button v-if="status?.recoveryPending || status?.requested" class="secondary wide" :disabled="busy" @click="recover">查看本轮恢复项目</button>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
  <Sheet :open="permissionOpen" title="开启控制通知" :close-disabled="busy" @close="cancelEnable"><div class="stack"><p>隐藏后需要从小猫控制通知返回应用，请允许通知。</p><button class="primary" :disabled="busy" @click="authorize">允许通知</button><button class="secondary" :disabled="busy" @click="cancelEnable">暂不开启</button></div></Sheet>
</template>
<style scoped>
.recent-tasks-setting { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 18px; }
p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; margin-top: 5px; }
.recent-tasks-status { background: var(--surface); padding: 16px; border-radius: 14px; }
.recent-tasks-status p { margin-top: 5px; color: var(--muted); }
</style>
