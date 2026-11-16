<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import { dndDriver, type DndStatus } from '../platform/dnd'
import { native } from '../platform/bridge'
import Sheet from './Sheet.vue'

const props = withDefaults(defineProps<{ runtimeOnly?: boolean }>(), { runtimeOnly: false })
const app = useApp(), status = ref<DndStatus>(), busy = ref(false), error = ref('')
const panel = ref<'permission' | 'restore' | null>(null), gateReady = ref(false)
let interval: ReturnType<typeof setInterval> | undefined
let gateTimer: ReturnType<typeof setTimeout> | undefined
let listener: PluginListenerHandle | undefined
const enabled = computed(() => Boolean(app.data.preferences.protection?.dnd))
const phaseText = computed(() => {
  const phase = status.value?.phase
  return ({
    off: '本轮未启用', ready: '已设置，等待下一轮', unsupported: '此环境不支持独立声音规则',
    permission_required: '未获勿扰授权，计时可继续', requested: '已请求声音保护，系统尚未核实激活',
    active: '小猫声音规则正在生效', user_disabled: '系统规则已关闭，本轮不会自动重开',
    inactive: '系统规则尚未激活或已停止，本轮不会自动重开',
    user_modified: '规则已有后续修改，已保留系统选择', missing: '小猫规则已移除，本轮不会自动重建',
    withdrawn: '本轮声音辅助已主动撤销', restored: '小猫声音规则已撤销',
    restoration_failed: '声音规则恢复未完成，可重试', error: '声音辅助执行异常，计时可继续',
  } as Record<string, string>)[phase || ''] || '正在检查声音辅助'
})
async function refresh() {
  try { status.value = await dndDriver.read() }
  catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
}
async function toggle(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  busy.value = true; error.value = ''
  try {
    await app.mutate(data => {
      data.preferences.protection = { ...defaultProtection(), ...data.preferences.protection, dnd: checked }
    })
    if (checked && status.value?.supported && !status.value.permissionGranted) show('permission')
  } catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  finally { busy.value = false }
}
function show(value: 'permission' | 'restore') {
  panel.value = value; gateReady.value = false
  clearTimeout(gateTimer)
  gateTimer = setTimeout(() => { gateReady.value = true }, 650)
}
async function authorize() {
  if (!gateReady.value || busy.value) return
  busy.value = true; error.value = ''
  try { await dndDriver.openSettings(); panel.value = null }
  catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  finally { busy.value = false; await refresh() }
}
async function restore() {
  if (!gateReady.value || busy.value) return
  busy.value = true; error.value = ''
  try { status.value = await dndDriver.restore(); panel.value = null }
  catch (failure) { error.value = failure instanceof Error ? failure.message : String(failure) }
  finally { busy.value = false }
}
function visibility() { if (!document.hidden) void refresh() }
onMounted(async () => {
  await refresh()
  interval = setInterval(() => { if (!document.hidden) void refresh() }, 2000)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('protection-recovered', refresh)
  if (native) listener = await App.addListener('appStateChange', ({ isActive }) => { if (isActive) void refresh() })
})
onBeforeUnmount(() => {
  clearInterval(interval); clearTimeout(gateTimer)
  document.removeEventListener('visibilitychange', visibility)
  window.removeEventListener('protection-recovered', refresh)
  void listener?.remove()
})
</script>

<template>
  <section v-if="!props.runtimeOnly || status?.requested || status?.recoveryPending" class="dnd-setting stack" aria-label="声音免打扰辅助" :aria-busy="busy">
    <template v-if="!props.runtimeOnly">
      <label class="switch">
        <span>声音免打扰辅助</span>
        <input type="checkbox" :checked="enabled" :disabled="busy" @change="toggle" />
      </label>
      <p class="field-help">减少通知声音和振动，保留来电、闹钟与媒体。通知仍可显示；这项辅助与应用限制、通知拦截分别选择。</p>
      <p v-if="app.focus.session" class="field-help">开关修改用于下一轮；本轮按开始时的选择执行。</p>
      <p v-if="!status?.supported" class="field-help">需要 Android 10 或更新系统；浏览器预览不执行系统声音规则。</p>
    </template>
    <div class="dnd-status" role="status">
      <strong>声音辅助：{{ phaseText }}</strong>
      <p v-if="status?.supported" class="field-help">勿扰授权：{{ status.permissionGranted ? '已授权' : '未授权' }}；本轮选择：{{ status.requested ? '开启' : '关闭' }}。</p>
      <p v-if="status?.phase === 'active'" class="field-help">其他系统或应用的勿扰规则仍可能施加更严格限制。</p>
      <p v-if="status?.error || error" class="field-help dnd-error">{{ error || status?.error }}</p>
    </div>
    <div class="dnd-actions">
      <button v-if="status?.supported" class="secondary" :disabled="busy" @click="show('permission')">{{ status.permissionGranted ? '系统勿扰设置' : '检查勿扰授权' }}</button>
      <button v-if="status?.requested || status?.recoveryPending" class="secondary" :disabled="busy" @click="show('restore')">{{ status.recoveryPending ? '重试撤销声音规则' : '撤销本轮声音辅助' }}</button>
    </div>
  </section>
  <Sheet v-if="panel === 'permission'" title="声音辅助与勿扰授权" @close="panel = null">
    <div class="stack">
      <p>小猫只在本轮选择开启时创建独立声音规则。来电、闹钟和媒体默认放行，通知仍保留供稍后查看。</p>
      <p class="field-help">授权状态与规则编号只在本机处理。结束、休息或主动撤销会移除小猫自身规则。可随时在系统勿扰设置中关闭；拒绝授权也能继续计时。</p>
      <button class="primary" :disabled="!gateReady || busy" @click="authorize">前往系统设置</button>
      <button class="secondary" @click="panel = null">暂不授权</button>
    </div>
  </Sheet>
  <Sheet v-if="panel === 'restore'" title="撤销声音辅助" @close="panel = null">
    <div class="stack">
      <p>仅撤销小猫在本轮施加的声音规则，计时继续。本轮不会自动重新开启声音辅助。</p>
      <p class="field-help">用户或其他应用的勿扰选择会保留。若规则已有后续修改或系统未确认移除，会显示具体原因并保留重试入口。</p>
      <button class="primary" :disabled="!gateReady || busy" @click="restore">确认撤销</button>
      <button class="secondary" @click="panel = null">取消</button>
    </div>
  </Sheet>
</template>

<style scoped>
.dnd-setting { gap: 10px; text-align: left; }
.dnd-status { padding: 12px 0; }
.dnd-status strong { font-size: 13px; font-weight: 500; }
.dnd-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.dnd-actions button { min-height: 48px; flex: 1 1 140px; font-size: 13px; }
.dnd-error { color: #c13a25; }
</style>
