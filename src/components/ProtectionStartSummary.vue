<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ProtectionPreferences } from '../domain/model'
import { native } from '../platform/bridge'
import { readProtectionDiagnostics, type CapabilityDiagnostic } from '../platform/protectionDiagnostics'
const props = defineProps<{ preferences: ProtectionPreferences; lock?: boolean }>()
defineEmits<{ settings: [] }>()
const rows = ref<CapabilityDiagnostic[]>([]), error = ref(''), busy = ref(false)
let revision = 0
async function refresh() {
  const request = ++revision
  busy.value = true; error.value = ''
  try {
    const result = await readProtectionDiagnostics(props.preferences)
    if (request === revision) rows.value = result.capabilities.filter(row => row.selected)
  } catch (e) { if (request === revision) error.value = String(e) }
  finally { if (request === revision) busy.value = false }
}
function availability(row: CapabilityDiagnostic) {
  if (row.id === 'strict') return '倒计时生效；正计时不适用'
  if (row.id === 'mainEntry' && !props.lock) return '仅独立锁机生效'
  if (!native || !row.supported) return '本环境不支持，请先在设置中明确关闭'
  if (row.authorized === false) return '尚未授权，请先授权或在设置中明确关闭'
  if (row.connected === false) return '服务未连接，请先重新检查或在设置中明确关闭'
  if (row.recoveryPending) return '存在待恢复责任，请先查看故障恢复'
  if (row.state === 'failed') return '能力检查失败，请先查看权限与保护状态'
  return '开始时将再次检查；实际执行结果在本轮中显示'
}
watch(() => props.preferences, refresh, { immediate: true, deep: true })
onMounted(() => window.addEventListener('focus', refresh))
onBeforeUnmount(() => { revision++; window.removeEventListener('focus', refresh) })
</script>
<template>
  <section class="start-capabilities" aria-label="本轮所选保护与缺失能力" :aria-busy="busy">
    <strong>本轮所选保护</strong>
    <p v-if="busy" role="status">正在检查所选能力…</p>
    <div v-for="row in rows" :key="row.id" class="start-capability" :data-capability="row.id">
      <strong>{{ row.title }}</strong><p>{{ availability(row) }}</p><p class="field-help">{{ row.reason }}</p>
    </div>
    <p v-if="error" role="alert" class="form-error">{{ error }}。请重新检查后开始。</p>
    <p class="field-help">缺失的已选能力会阻止开始。可先完成授权，或返回设置明确关闭该选项后重试；设置只影响下一轮。</p>
    <RouterLink to="/permissions" @click="$emit('settings')">查看权限与保护状态</RouterLink>
  </section>
</template>
<style scoped>
.start-capabilities { display: grid; gap: 12px; }
.start-capability { border-top: 1px solid var(--line); padding-top: 12px; }
p { line-height: 1.7; overflow-wrap: anywhere; }
a { display: flex; align-items: center; min-height: 48px; }
</style>
