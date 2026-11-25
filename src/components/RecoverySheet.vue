<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DeviceAdminStatus, RecoverySnapshot } from '../domain/model'
import { deviceAdminDriver, native, protectionDriver, recoveryDriver } from '../platform/bridge'
import Sheet from './Sheet.vue'

const props = withDefaults(defineProps<{ open: boolean; inline?: boolean }>(), { inline: false })
const emit = defineEmits<{ close: [] }>()
const snapshot = ref<RecoverySnapshot | null>(null), busy = ref(false), error = ref(''), confirmed = ref(false)
const deviceAdminStatus = ref<DeviceAdminStatus | null>(null)
const manualWallpaperChecked = ref(false)
let previewRevision = 0
const labels = { active: '可恢复', restored: '已恢复', failed: '未恢复，可重试', limited: '受系统限制' }

async function loadPreview() {
  const revision = ++previewRevision
  snapshot.value = null; error.value = ''; confirmed.value = false; busy.value = true
  manualWallpaperChecked.value = false
  try {
    const value = await recoveryDriver.preview()
    if (revision === previewRevision) snapshot.value = value
    if (native && deviceAdminDriver?.status) {
      const admin = await deviceAdminDriver.status().catch(() => null)
      if (revision === previewRevision) deviceAdminStatus.value = admin
    }
  } catch (e) {
    if (revision === previewRevision) error.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (revision === previewRevision) busy.value = false
  }
}

async function returnedFromSystem() {
  if (!props.open || document.hidden || busy.value) return
  const revision = ++previewRevision
  try {
    const value = await recoveryDriver.preview()
    if (revision === previewRevision && props.open) snapshot.value = value
    if (native && deviceAdminDriver?.status) {
      const admin = await deviceAdminDriver.status().catch(() => null)
      if (revision === previewRevision && props.open) deviceAdminStatus.value = admin
    }
  } catch (e) {
    if (revision === previewRevision && props.open) error.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(() => { window.addEventListener('focus', returnedFromSystem); document.addEventListener('visibilitychange', returnedFromSystem) })
onBeforeUnmount(() => { previewRevision++; window.removeEventListener('focus', returnedFromSystem); document.removeEventListener('visibilitychange', returnedFromSystem) })

watch(() => props.open, (open) => {
  if (!open) {
    previewRevision++
    busy.value = false
    return
  }
  void loadPreview()
}, { immediate: true })

async function restore() {
  if (busy.value || !snapshot.value) return
  busy.value = true; error.value = ''
  try {
    snapshot.value = await recoveryDriver.confirm(snapshot.value.revision)
    confirmed.value = true
    window.dispatchEvent(new Event('protection-recovered'))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    // A new round/duty requires a fresh preview and an explicit confirmation.
    try { snapshot.value = await recoveryDriver.preview() } catch { /* Keep the original actionable error. */ }
  } finally { busy.value = false }
}

function close() { if (!busy.value) emit('close') }

async function restoreWallpaper() {
  busy.value = true; error.value = ''
  try { await protectionDriver.wallpaperPicker(true); snapshot.value = await recoveryDriver.preview() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}

async function manualWallpaperRecovery() {
  busy.value = true; error.value = ''
  try { await protectionDriver.confirmWallpaperManualRecovery(manualWallpaperChecked.value); snapshot.value = await recoveryDriver.preview() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}

async function openWallpaperSettings() {
  error.value = ''
  try { await protectionDriver.openWallpaperSettings() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
async function disableDeviceAdmin() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { deviceAdminStatus.value = await deviceAdminDriver.deactivate() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
</script>
<template>
  <Sheet v-if="!inline" :open="open" title="保护帮助与故障恢复" :close-disabled="busy" @close="close">
    <div class="recovery-stack" :aria-busy="busy">
      <p class="notice">撤销下列本轮保护，计时与记录保留。严格计时仍会继续到期。</p>
      <p v-if="busy" role="status">{{ confirmed ? '正在重试恢复…' : '正在检查或执行恢复…' }}</p>
      <p v-if="snapshot && !snapshot.supported" class="notice">此环境无需恢复系统保护。</p>
      <div v-for="step in snapshot?.steps" :key="`${step.sessionId}:${step.capability}`" class="recovery-step">
        <strong>{{ step.title }} · {{ labels[step.status] }}</strong>
        <p>{{ step.reason }}</p>
        <small v-if="step.retryable && step.status !== 'active'">尚未恢复，可重试。</small>
        <template v-if="step.capability === 'wallpaperProtection' && step.retryable">
          <button type="button" class="secondary wide" :disabled="busy" @click="restoreWallpaper">恢复原壁纸 / 确认系统步骤</button>
          <button type="button" class="secondary wide" :disabled="busy" @click="openWallpaperSettings">前往系统壁纸设置手动修复</button>
          <label class="manual-wallpaper"><input v-model="manualWallpaperChecked" type="checkbox" /> 我已在系统中恢复或选择了新的主屏与锁屏，并核对显示</label>
          <button type="button" class="secondary wide" :disabled="busy || !manualWallpaperChecked" @click="manualWallpaperRecovery">确认已手动核对壁纸恢复</button>
        </template>
      </div>
      <div v-if="deviceAdminStatus?.active" class="recovery-step">
        <strong>防卸载保护（设备管理器） · 已激活</strong>
        <p>如需卸载或撤回防卸载增强，可在此一键停用，不影响计时与记录。</p>
        <button type="button" class="secondary wide" :disabled="busy" @click="disableDeviceAdmin">一键停用防卸载保护</button>
      </div>
      <p v-if="snapshot?.supported && !snapshot.steps.length" role="status">没有已登记的恢复项目，计时保持原状。</p>
      <p v-if="confirmed && !snapshot?.pending" role="status">本次恢复已完成。计时与配置保留。</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button v-if="snapshot?.supported && snapshot.pending" type="button" class="primary wide" :disabled="busy" @click="restore">{{ confirmed ? '重试未恢复项目' : '确认撤销以上本轮保护' }}</button>
      <button type="button" class="secondary wide" :disabled="busy" @click="close">{{ confirmed ? '完成' : '取消，保持现状' }}</button>
    </div>
  </Sheet>
  <div v-else-if="open" class="recovery-stack" :aria-busy="busy">
    <p class="notice">撤销下列本轮保护，计时与记录保留。严格计时仍会继续到期。</p>
    <p v-if="busy" role="status">{{ confirmed ? '正在重试恢复…' : '正在检查或执行恢复…' }}</p>
    <p v-if="snapshot && !snapshot.supported" class="notice">此环境无需恢复系统保护。</p>
    <div v-for="step in snapshot?.steps" :key="`${step.sessionId}:${step.capability}`" class="recovery-step">
      <strong>{{ step.title }} · {{ labels[step.status] }}</strong>
      <p>{{ step.reason }}</p>
      <small v-if="step.retryable && step.status !== 'active'">尚未恢复，可重试。</small>
      <template v-if="step.capability === 'wallpaperProtection' && step.retryable">
        <button type="button" class="secondary wide" :disabled="busy" @click="restoreWallpaper">恢复原壁纸 / 确认系统步骤</button>
        <button type="button" class="secondary wide" :disabled="busy" @click="openWallpaperSettings">前往系统壁纸设置手动修复</button>
        <label class="manual-wallpaper"><input v-model="manualWallpaperChecked" type="checkbox" /> 我已在系统中恢复或选择了新的主屏与锁屏，并核对显示</label>
        <button type="button" class="secondary wide" :disabled="busy || !manualWallpaperChecked" @click="manualWallpaperRecovery">确认已手动核对壁纸恢复</button>
      </template>
    </div>
    <div v-if="deviceAdminStatus?.active" class="recovery-step">
      <strong>防卸载保护（设备管理器） · 已激活</strong>
      <p>如需卸载或撤回防卸载增强，可在此一键停用，不影响计时与记录。</p>
      <button type="button" class="secondary wide" :disabled="busy" @click="disableDeviceAdmin">一键停用防卸载保护</button>
    </div>
    <p v-if="snapshot?.supported && !snapshot.steps.length" role="status">没有已登记的恢复项目，计时保持原状。</p>
    <p v-if="confirmed && !snapshot?.pending" role="status">本次恢复已完成。计时与配置保留。</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <button v-if="snapshot?.supported && snapshot.pending" type="button" class="primary wide" :disabled="busy" @click="restore">{{ confirmed ? '重试未恢复项目' : '确认撤销以上本轮保护' }}</button>
    <button type="button" class="secondary wide" :disabled="busy" @click="loadPreview">{{ busy ? '正在检查…' : '重新检查恢复项' }}</button>
  </div>
</template>
<style scoped>
.recovery-stack { display: grid; gap: 18px; }
.recovery-stack p, .recovery-stack small { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.recovery-stack button { min-height: 48px; min-width: 48px; }
.recovery-step { background: var(--surface); padding: 16px; border-radius: var(--radius); }
.recovery-step p { margin-top: 8px; }
.recovery-step small { display: block; margin-top: 8px; color: var(--muted-surface); }
.recovery-step button, .manual-wallpaper { margin-top: 12px; }
.manual-wallpaper { display: flex; gap: 12px; align-items: flex-start; min-height: 48px; padding: 8px 0; font-size: 13px; line-height: 1.7; }
.manual-wallpaper input { flex-shrink: 0; }
</style>
