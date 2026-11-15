<script setup lang="ts">
import { ref, watch } from 'vue'
import type { RecoverySnapshot } from '../domain/model'
import { recoveryDriver } from '../platform/bridge'
import Sheet from './Sheet.vue'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const snapshot = ref<RecoverySnapshot | null>(null), busy = ref(false), error = ref(''), confirmed = ref(false)
const labels = { active: '待撤销', restored: '已恢复', failed: '恢复失败', limited: '系统受限' }
watch(() => props.open, async open => {
  if (!open) return
  snapshot.value = null; error.value = ''; confirmed.value = false; busy.value = true
  try { snapshot.value = await recoveryDriver.preview() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
})
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
</script>
<template>
  <Sheet :open="open" title="保护帮助与故障恢复" @close="close">
    <div class="recovery-stack" :aria-busy="busy">
      <p>保护异常时，可以撤销本轮已施加的限制。下面列出实际登记的恢复项目；取消或关闭此页不会操作。</p>
      <p class="notice">专注或锁机计时继续，严格倒计时和严格锁机仍不能暂停、取消或提前结束。保存的白名单、保护偏好和记录保留。本轮主动撤销的能力不会因服务重连再次开启；下一轮重新按偏好检查。</p>
      <p v-if="busy" role="status">{{ confirmed ? '正在重试恢复…' : '正在检查或执行恢复…' }}</p>
      <p v-if="snapshot && !snapshot.supported" class="notice">Android 本机版本提供系统保护与故障恢复。浏览器版本没有施加系统限制。</p>
      <div v-for="step in snapshot?.steps" :key="`${step.sessionId}:${step.capability}`" class="recovery-step">
        <strong>{{ step.title }} · {{ labels[step.status] }}</strong>
        <p>{{ step.reason }}</p>
        <small v-if="step.retryable && step.status !== 'active'">恢复责任仍保留，可以重试。存在冲突的新保护会被阻止。</small>
      </div>
      <p v-if="snapshot?.supported && !snapshot.steps.length" role="status">没有已登记的恢复项目，计时保持原状。</p>
      <p v-if="confirmed && !snapshot?.pending" role="status">本次恢复已完成。计时与配置保留。</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button v-if="snapshot?.supported && snapshot.pending" class="primary wide" :disabled="busy" @click="restore">{{ confirmed ? '重试未恢复项目' : '确认撤销以上本轮保护' }}</button>
      <button class="secondary wide" :disabled="busy" @click="close">{{ confirmed ? '完成' : '取消，保持现状' }}</button>
    </div>
  </Sheet>
</template>
<style scoped>
.recovery-stack { display: grid; gap: 18px; }
.recovery-stack p, .recovery-stack small { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.recovery-step { background: var(--surface); padding: 16px; border-radius: 14px; }
.recovery-step p { margin-top: 8px; }
.recovery-step small { display: block; margin-top: 8px; color: var(--muted); }
</style>
