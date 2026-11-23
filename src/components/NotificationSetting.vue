<script setup lang="ts">
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import { syncLegacyFlatMutation } from '../domain/protectionModules'
import { notificationDriver, type NotificationStatus } from '../platform/notifications'
import Sheet from './Sheet.vue'
import InfoHint from './InfoHint.vue'
import RecoverySheet from './RecoverySheet.vue'
import { usePendingEnable } from './usePendingEnable'

const props = withDefaults(defineProps<{ runtimeOnly?: boolean; compact?: boolean }>(), { runtimeOnly: false, compact: false })
const app = useApp(), status = ref<NotificationStatus>(), busy = ref(false), error = ref('')
const permissionOpen = ref(false), recoveryOpen = ref(false)
let interval: ReturnType<typeof setInterval> | undefined
const enabled = computed(() => app.data.preferences.protection?.interceptNotifications === true)
let readRevision = 0
async function saveEnabled(interceptNotifications: boolean) {
  busy.value = true
  try {
    await app.mutate((data) => {
      data.preferences.protection = syncLegacyFlatMutation(
        data.preferences.protection ?? defaultProtection(),
        (flat) => {
          flat.interceptNotifications = interceptNotifications
        },
      )
    })
  } finally {
    busy.value = false
  }
}
const enableGate = usePendingEnable(saveEnabled, refresh)
const permissionReady = () => !!(status.value?.supported && status.value.authorized && status.value.connected)
function cancelEnable() { enableGate.cancel(); permissionOpen.value = false }
const phaseText = computed(() => {
  const value = status.value
  if (value?.supported && !value.requested && !value.recoveryPending && ['off', 'released', 'withdrawn'].includes(value.phase || '')) {
    return !enabled.value ? '本轮未开启' : !value.authorized ? '通知访问未授权' : !value.connected ? '监听未连接，保护失效' : '已设置，等待下一轮'
  }
  return ({
    unsupported: '本机不支持通知暂缓', off: '本轮未开启', ready: '正在监听，尚无受控通知',
    holding: '系统已核实暂缓原通知', requested: '已请求暂缓，尚待系统核实', permission_required: '通知访问未授权', disconnected: '监听未连接，保护失效',
    failed: '通知处理失败，请检查并重试',
    release_pending: '等待系统释放并核实原通知', released: '本轮已无待释放通知', withdrawn: '本轮已停止新拦截',
  } as Record<string, string>)[value?.phase || ''] || '正在检查'
})
async function refresh() {
  const revision = ++readRevision
  try {
    const value = await notificationDriver.read()
    if (revision !== readRevision) return
    status.value = value
    if (await enableGate.observe(permissionReady(), value.authorized)) await refresh()
  } catch (failure) { if (revision === readRevision) { status.value = undefined; error.value = failure instanceof Error ? failure.message : String(failure) } }
}
async function toggle(event: Event) {
  const target = event.target as HTMLInputElement, checked = target.checked
  target.checked = enabled.value
  if (busy.value || (checked && !status.value?.supported)) return
  busy.value = true; error.value = ''
  try {
    permissionOpen.value = await enableGate.request(checked, permissionReady())
    if (!permissionOpen.value) await refresh()
  } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  finally { busy.value = false }
}
async function authorize() {
  if (busy.value) return
  busy.value = true; error.value = ''
  enableGate.launch()
  try { await notificationDriver.openSettings(); permissionOpen.value = false }
  catch (failure) { cancelEnable(); error.value = failure instanceof Error ? failure.message : String(failure) }
  finally { busy.value = false; await refresh() }
}
async function reconnect() {
  busy.value = true; error.value = ''
  try { await notificationDriver.rebind(); await refresh() }
  catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  finally { busy.value = false }
}
function visibility() { if (!document.hidden) void refresh() }
onMounted(() => {
  void refresh(); interval = setInterval(visibility, 2000)
  window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visibility)
  window.addEventListener('protection-recovered', refresh)
})
onBeforeUnmount(() => {
  readRevision++
  clearInterval(interval); window.removeEventListener('focus', refresh)
  document.removeEventListener('visibilitychange', visibility); window.removeEventListener('protection-recovered', refresh)
})
</script>

<template>
  <section v-if="!props.runtimeOnly || status?.requested || status?.recoveryPending || !!error" class="notification-setting stack" :class="{ compact: props.compact }" aria-label="通知拦截" :aria-busy="busy">
    <div v-if="!props.runtimeOnly" class="help-row">
      <label class="switch"><span>通知拦截<small v-if="props.compact" class="compact-status" role="status">{{ !status ? (error ? '状态异常' : '检查中') : status.supported ? phaseText : '仅 Android 可用' }}</small></span><input type="checkbox" :checked="enabled" :disabled="capabilityToggleDisabled(enabled, status?.supported, busy)" @change="toggle" /></label>
      <InfoHint v-if="props.compact" label="通知拦截说明">
        <p>暂缓名单外的普通通知，保留电话、闹钟与紧急通知。</p>
        <p>结束后请求恢复通知，结果由系统确认。修改用于下一轮。</p>
        <p>{{ phaseText }}</p>
        <p v-if="status?.supported">授权：{{ status.authorized ? '已授权' : '未授权' }} · 监听：{{ status.connected ? '已连接' : '未连接' }} · 实际处理：{{ status.active ? '执行中' : '未执行' }}。</p>
      </InfoHint>
    </div>
    <template v-if="!props.runtimeOnly && !props.compact">
      <p class="field-help">按本轮有效白名单暂缓其他应用的普通通知；电话、闹钟、紧急与小猫控制通知保留。与学霸模式、严格模式和声音辅助分别选择。</p>
      <p class="field-help">专注、暂停和锁机期间按本轮名单暂缓通知。普通会话采用最长 60 秒的滚动租期；结束、休息或故障恢复会请求立即释放原通知，实际结果等待 Android 核实。修改开关用于下一轮。</p>
    </template>
    <div v-if="!props.compact || status?.requested || status?.recoveryPending || error || status?.error" role="status">
      <strong>{{ props.compact ? (status?.supported ? phaseText : '本机不支持') : '通知拦截：' + phaseText }}</strong>
      <p v-if="status?.supported && !props.compact" class="field-help">通知访问：{{ status.authorized ? '已授权' : '未授权' }}；监听：{{ status.connected ? '已连接' : '未连接' }}；实际处理：{{ status.active ? '本轮监听中' : '未执行新拦截' }}。</p>
      <p v-if="status && (status.pendingCount || status.restoredCount || status.absentCount)" class="field-help">待核实 {{ status.pendingCount }} 条 · 已观察原通知恢复 {{ status.restoredCount }} 条 · 已撤回或当前不存在 {{ status.absentCount }} 条。不存在不等于已恢复。</p>
      <p v-if="status?.snoozedCount" class="field-help">系统最近已核实暂缓 {{ status.snoozedCount }} 条；断连期间状态等待重连核实。</p>
      <p v-if="status?.releaseRequestedCount || status?.releaseFailedCount" class="field-help">已请求释放 {{ status?.releaseRequestedCount || 0 }} 条 · 释放失败 {{ status?.releaseFailedCount || 0 }} 条；失败与尚待系统核实的责任可在故障恢复重试。</p>
      <p v-if="status?.presentCount" class="field-help">另有 {{ status.presentCount }} 条原通知当前仍在正常显示；未观察到暂缓，不计为已验证恢复。</p>
      <p v-if="status?.recoveryPending" class="field-help">原通知仍有待核实的恢复责任。释放请求不等于已经恢复；断连或撤权时，有限租期到期后仍需重连核实。可进入故障恢复重试。</p>
      <p v-if="error || status?.error" class="field-help notification-error">{{ error || status?.error }}</p>
    </div>
    <div class="notification-actions">
      <button v-if="status?.supported && !props.runtimeOnly" class="secondary" :disabled="busy" @click="permissionOpen = true">{{ status.authorized ? '通知访问设置' : '检查通知访问' }}</button>
      <button v-if="status?.authorized && !status?.connected" class="secondary" :disabled="busy" @click="reconnect">重连通知监听</button>
      <button v-if="status?.requested || status?.recoveryPending" class="secondary" :disabled="busy" @click="recoveryOpen = true">通知故障恢复</button>
    </div>
  </section>
  <Sheet v-if="permissionOpen" title="通知拦截与通知访问" :close-disabled="busy" @close="cancelEnable">
    <div class="stack">
      <p>允许小猫在专注期间暂缓名单外应用的通知，结束后恢复。</p>
      <p class="field-help">不保存通知正文。电话、闹钟和紧急通知保留。</p>
      <button class="primary" :disabled="busy" @click="authorize">前往系统通知访问</button>
      <button class="secondary" :disabled="busy" @click="cancelEnable">暂不授权</button>
    </div>
  </Sheet>
  <RecoverySheet :open="recoveryOpen" @close="recoveryOpen = false" />
</template>

<style scoped>
.notification-setting { gap: 10px; text-align: left; }
.notification-setting.compact { gap: 0; }
.compact-status { display: block; color: var(--muted-surface); font-size: 12px; font-weight: 400; margin-top: 4px; }
.notification-actions:empty { display: none; }
.notification-setting strong { font-size: 13px; font-weight: 500; }
.notification-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.notification-actions button { min-height: 48px; flex: 1 1 140px; font-size: 13px; }
.notification-error { color: var(--danger, #c13a25); }
</style>
