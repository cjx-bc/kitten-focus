<script setup lang="ts">
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import InfoHint from './InfoHint.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { LauncherStatus } from '../domain/model'
import { protectionDriver, requestNotifications } from '../platform/bridge'
const app = useApp(), option = 'launcherIconHidden'
const selected = computed(() => app.data.preferences.protection?.enhancements?.includes(option) ?? false)
const status = ref<LauncherStatus>(), busy = ref(false), error = ref('')
const labels = { off: '未开启', ready: '等待执行', active: '本轮启动入口已停用', failed: '保护失效', restoration_failed: '恢复失败，可重试', withdrawn: '本轮已撤销', restored: '原启动入口状态已恢复', unsupported: '本机不支持' }
let timer: ReturnType<typeof setInterval> | undefined
async function refresh() {
  try { status.value = await protectionDriver.launcher() }
  catch (e) { status.value = undefined; error.value = e instanceof Error ? e.message : String(e) }
}
function visible() { if (!document.hidden) void refresh() }
onMounted(() => {
  void refresh(); timer = setInterval(visible, 2000)
  document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible); window.addEventListener('protection-recovered', visible)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); window.removeEventListener('protection-recovered', visible)
})
async function toggle(event: Event) {
  busy.value = true; error.value = ''
  try {
    const checked = (event.target as HTMLInputElement).checked
    if (checked && !status.value?.supported) return
    await app.mutate(data => {
      const protection = { ...defaultProtection(), ...data.preferences.protection }
      protection.enhancements = (protection.enhancements ?? []).filter(value => value !== option)
      if (checked) protection.enhancements.push(option)
      data.preferences.protection = protection
    })
    await refresh(); app.notify('增强选项已保存，将在下一轮开始时生效')
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function authorize() {
  busy.value = true; error.value = ''
  try { await requestNotifications(); await refresh() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
function recover() { window.dispatchEvent(new Event('open-recovery')) }
</script>
<template>
  <div class="launcher-setting" :aria-busy="busy">
    <div class="help-row"><label class="switch"><span>隐藏桌面图标</span><input type="checkbox" :checked="selected" :disabled="capabilityToggleDisabled(selected, status?.supported, busy)" @change="toggle" /></label>
      <InfoHint label="隐藏桌面图标说明">
<p>默认关闭；仅用于下一轮专注或锁机</p>
<p>仅停用小猫自己的普通桌面入口，不影响控制页和恢复页。开始前保存原状态；结束、休息、重启中断或升级后恢复。此功能不能禁止卸载或系统强停。</p>
    <p>隐藏前会实际检查小猫控制通知和“帮助与故障恢复”入口。图标隐藏后，从该通知返回控制页；在恢复页确认撤销即可恢复本轮更改。下一轮不再隐藏时，请关闭此开关。</p>
    <div class="launcher-status" role="status">
      <strong>{{ status ? labels[status.phase] : '正在检查启动入口状态' }}</strong>
      <p v-if="status?.supported">下一轮偏好：{{ selected ? '已开启' : '未开启' }} · 本轮请求：{{ status.requested ? '已选择' : '未选择' }}</p>
      <p v-if="status?.supported && selected && !status.requested">{{ status.recoveryAvailable ? '通知入口可用，下一轮开始时再检查并执行' : '待开启通知，暂不具备可达恢复入口' }}</p>
      <p v-if="status?.error">{{ status.error }}</p>
    </div>
    <p v-if="status?.supported" class="muted">状态仅验证系统组件和启动器查询结果；桌面图标可能因启动器缓存延迟更新，请等待刷新。原本已停用的入口保持原状态。</p>
      </InfoHint>
    </div>
    <p class="field-help" role="status">{{ status ? labels[status.phase] : '正在检查' }}</p>
    <p v-if="status?.supported && status.error" class="form-error" role="alert">{{ status.error }}</p>
    <button v-if="status?.supported && selected && !status.recoveryAvailable" class="secondary wide" :disabled="busy" @click="authorize">开启控制通知</button>
    <button v-if="status?.recoveryPending || status?.requested" class="secondary wide" :disabled="busy" @click="recover">查看本轮恢复项目</button>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>
<style scoped>
.launcher-setting { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 18px; }
p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; margin-top: 5px; }
.launcher-status { background: var(--surface); padding: 16px; border-radius: 14px; }
.launcher-status p { margin-top: 5px; color: var(--muted); }
</style>
