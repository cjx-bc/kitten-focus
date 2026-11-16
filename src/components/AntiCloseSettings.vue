<script setup lang="ts">
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import InfoHint from './InfoHint.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { AntiCloseStatus } from '../domain/model'
import { protectionDriver } from '../platform/bridge'
const app = useApp(), option = 'preciseAntiClose'
const selected = computed(() => app.data.preferences.protection?.enhancements.includes(option) ?? false)
const status = ref<AntiCloseStatus>(), busy = ref(false), error = ref(''), showHelp = ref(false)
const labels = { off: '未开启', authorization: '待授权', ready: '已就绪', armed: '待验证本机入口', protecting: '已观察到返回', failed: '保护失效', unsupported: '本机不支持', recovered: '本轮已撤销' }
let timer: ReturnType<typeof setInterval> | undefined
async function refresh() { try { status.value = (await protectionDriver.status()).antiClose } catch (e) { status.value = undefined; error.value = e instanceof Error ? e.message : String(e) } }
function visible() { if (!document.hidden) void refresh() }
onMounted(() => { void refresh(); timer = setInterval(visible, 2000); document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible); window.addEventListener('protection-recovered', visible) })
onBeforeUnmount(() => { if (timer) clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); window.removeEventListener('protection-recovered', visible) })
async function toggle(event: Event) {
  busy.value = true; error.value = ''
  try {
    const checked = (event.target as HTMLInputElement).checked
    if (checked && !status.value?.supported) return
    await app.mutate(data => {
      const protection = { ...defaultProtection(), ...data.preferences.protection }
      protection.enhancements = protection.enhancements.filter(value => value !== option)
      if (checked) protection.enhancements.push(option)
      data.preferences.protection = protection
    })
    await refresh(); if (checked) showHelp.value = true
    app.notify(app.focus.session ? '增强选项已保存，将用于下一轮' : '增强选项已保存')
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function authorize() {
  busy.value = true
  try { await protectionDriver.openSettings() } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
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
    <button class="secondary wide" :disabled="busy" @click="showHelp = !showHelp">查看精确防关闭用途与限制</button>
    <div v-if="showHelp" class="permission-help">
      <p>开启本轮保护后，只在系统设置与已知系统安装器的特定页面，短暂读取有上限的应用标题、包名及按钮文字，以确认目标是小猫自己。不读取其他应用正文，不存储、上传或记录这些节点内容。其他语言和厂商页面可能无法识别。</p>
      <p>普通无障碍只能尝试返回专注，服务失联后无法拦截；普通管理员不等于设备所有者，不能据此宣称防卸载。此功能不申请管理员、不配置所有者，也不保证永久无法关闭。需要解除时可从帮助、控制通知或故障恢复撤销本轮保护；本轮不会因重连再次开启。</p>
      <p>从此按钮进入的必要授权窗口有五分钟放行，方便撤回或修复权限。</p>
      <button class="secondary wide" :disabled="busy || !status?.supported" @click="authorize">前往无障碍设置</button>
    </div>
      </InfoHint>
    </div>
    <p class="field-help" role="status">{{ status ? labels[status.state] : '正在检查' }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.anti-close-settings, .permission-help { display: grid; gap: 8px; }
.anti-close-settings { border-top: 1px solid var(--line); padding-top: 18px; }
p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 5px; }
.anti-close-status { background: var(--surface); padding: 16px; border-radius: 14px; }
.anti-close-status p { margin-top: 5px; color: var(--muted); }
</style>
