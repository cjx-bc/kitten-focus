<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { ProtectionPreferences } from '../domain/model'
import { native } from '../platform/bridge'
import { readProtectionDiagnostics, type CapabilityDiagnostic } from '../platform/protectionDiagnostics'
const props = defineProps<{ preferences: ProtectionPreferences; lock?: boolean }>()
const emit = defineEmits<{ settings: []; unready: [ids: string[]] }>()
const rows = ref<CapabilityDiagnostic[]>([]), error = ref(''), busy = ref(false)
let revision = 0
function isUnready(row: CapabilityDiagnostic) {
  if (row.id === 'strict') return false
  if (row.id === 'mainEntry' && !props.lock) return false
  return !native || !row.supported || row.authorized === false || row.connected === false || !!row.recoveryPending || row.state === 'failed'
}
async function refresh() {
  const request = ++revision
  busy.value = true; error.value = ''
  try {
    const result = await readProtectionDiagnostics(props.preferences)
    if (request === revision) {
      rows.value = result.capabilities.filter(row => row.selected)
      emit('unready', rows.value.filter(isUnready).map(row => row.id))
    }
  } catch (e) { if (request === revision) { error.value = String(e); emit('unready', []) } }
  finally { if (request === revision) busy.value = false }
}
function availability(row: CapabilityDiagnostic) {
  if (row.id === 'strict') return '倒计时生效；正计时不适用'
  if (row.id === 'mainEntry' && !props.lock) return '仅独立锁机生效'
  if (!native || !row.supported) return '本机不支持，未生效（需关闭此项）'
  if (row.authorized === false) return '待授权 · 未生效（需授权或关闭此项）'
  if (row.connected === false) return '服务未连接 · 未生效'
  if (row.recoveryPending) return '需先完成故障恢复'
  if (row.state === 'failed') return '检查失败 · 未生效'
  return '已就绪 · 开始时检查'
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
      <strong>{{ row.title }}</strong><p>{{ availability(row) }}</p>
    </div>
    <p v-if="error" role="alert" class="form-error">{{ error }}。请重新检查后开始。</p>
    <RouterLink to="/permissions" @click="$emit('settings')">查看权限与保护状态</RouterLink>
  </section>
</template>
<style scoped>
.start-capabilities { display: grid; gap: 12px; }
.start-capability { border-top: 1px solid var(--line); padding-top: 12px; }
p { line-height: 1.7; overflow-wrap: anywhere; }
a { display: flex; align-items: center; min-height: 48px; }
</style>
