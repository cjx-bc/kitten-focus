<script setup lang="ts">
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import InfoHint from './InfoHint.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { AntiCloseStatus } from '../domain/model'
import { protectionDriver } from '../platform/bridge'
import Sheet from './Sheet.vue'
import { usePendingEnable } from './usePendingEnable'
const app = useApp(), option = 'preciseAntiClose'
const selected = computed(() => app.data.preferences.protection?.enhancements.includes(option) ?? false)
const status = ref<AntiCloseStatus>(), busy = ref(false), error = ref(''), showHelp = ref(false)
const labels = { off: '未开启', authorization: '待授权', ready: '已就绪', armed: '待验证本机入口', protecting: '已观察到返回', failed: '保护失效', unsupported: '本机不支持', recovered: '本轮已撤销' }
let timer: ReturnType<typeof setInterval> | undefined
let readRevision = 0
const enableGate = usePendingEnable(saveSelected, refresh)
const permissionReady = () => !!(status.value?.supported && status.value.authorized && status.value.connected)
function cancelEnable() { enableGate.cancel(); showHelp.value = false }
async function refresh() {
  const revision = ++readRevision
  try {
    const value = (await protectionDriver.status()).antiClose
    if (revision !== readRevision) return
    status.value = value
    if (await enableGate.observe(permissionReady(), !!value?.authorized)) await refresh()
  } catch (e) { if (revision === readRevision) { status.value = undefined; error.value = e instanceof Error ? e.message : String(e) } }
}
function visible() { if (!document.hidden) void refresh() }
onMounted(() => { void refresh(); timer = setInterval(visible, 2000); document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible); window.addEventListener('protection-recovered', visible) })
onBeforeUnmount(() => { readRevision++; if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); window.removeEventListener('protection-recovered', visible) })
async function saveSelected(checked: boolean) {
  const wasBusy = busy.value
  busy.value = true
  try {
    await app.mutate(data => {
      const protection = { ...defaultProtection(), ...data.preferences.protection }
      protection.enhancements = protection.enhancements.filter(value => value !== option)
      if (checked) protection.enhancements.push(option)
      data.preferences.protection = protection
    })
    app.notify(app.focus.session ? '增强选项已保存，将用于下一轮' : '增强选项已保存')
  } finally { if (!wasBusy) busy.value = false }
}
async function toggle(event: Event) {
  const target = event.target as HTMLInputElement, checked = target.checked
  target.checked = selected.value
  if (busy.value || (checked && !status.value?.supported)) return
  busy.value = true; error.value = ''
  try { showHelp.value = await enableGate.request(checked, permissionReady()); if (!showHelp.value) await refresh() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function authorize() {
  if (busy.value) return
  busy.value = true; error.value = ''
  enableGate.launch()
  try { await protectionDriver.openSettings(); showHelp.value = false } catch (e) { cancelEnable(); error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false; await refresh() }
}
</script>
<template>
  <section class="anti-close-settings" :aria-busy="busy" aria-label="精确防关闭">
    <div class="help-row"><label class="switch"><span>精确防关闭</span><input type="checkbox" :checked="selected" :disabled="capabilityToggleDisabled(selected, status?.supported, busy)" @change="toggle" /></label>
      <InfoHint label="精确防关闭说明">
<p>提高从本应用强退、撤权与卸载入口绕开的成本</p>
<p class="muted">仅在本轮专注或锁机期间识别小猫自己的相关入口。其他应用设置、普通设置、电话、授权、帮助和故障恢复继续可用。结束、休息、重启或主动恢复后解除。</p>
    <div class="anti-close-status" role="status">
      <strong>{{ status ? labels[status.state] : '正在检查增强能力' }}</strong><p>{{ status?.reason }}</p>
      <p v-if="status?.supported">无障碍：{{ status.authorized ? '已授权' : '未授权' }} · 服务：{{ status.connected ? '已连接' : '未连接' }}</p>
      <p v-if="status?.identity.unknown">设备管理身份检查失败</p>
      <p v-else-if="status?.supported">本应用身份：普通管理员{{ status.identity.ordinaryAdmin ? '已激活' : '未激活' }} · 设备所有者{{ status.identity.deviceOwner ? '是' : '否' }} · 资料所有者{{ status.identity.profileOwner ? '是' : '否' }}</p>
      <p>{{ status?.policyReason }}</p><p v-if="status?.lastReturnedAt">最近观察到返回：{{ new Date(status.lastReturnedAt).toLocaleTimeString() }}</p>
    </div>
    <button class="secondary wide" :disabled="busy" @click="showHelp = true">查看精确防关闭用途与限制</button>
      </InfoHint>
    </div>
    <p class="field-help" role="status">{{ status ? labels[status.state] : '正在检查' }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
  <Sheet :open="showHelp" title="精确防关闭授权" :close-disabled="busy" @close="cancelEnable"><div class="stack"><p>仅识别系统页面中小猫自己的关闭与卸载入口，不保存或上传内容。普通权限不保证防强停或防卸载。</p><button class="primary" :disabled="busy || !status?.supported" @click="authorize">前往系统设置</button><button class="secondary" :disabled="busy" @click="cancelEnable">暂不开启</button></div></Sheet>
</template>
<style scoped>
.anti-close-settings { display: grid; gap: 8px; }
.anti-close-settings { border-top: 1px solid var(--line); padding-top: 18px; }
p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 5px; }
.anti-close-status { background: var(--surface); padding: 16px; border-radius: 14px; }
.anti-close-status p { margin-top: 5px; color: var(--muted); }
</style>
