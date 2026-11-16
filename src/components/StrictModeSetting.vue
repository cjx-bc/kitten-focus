<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import Icon from './Icon.vue'
import Sheet from './Sheet.vue'
const app = useApp(),
  open = ref(false),
  busy = ref(false),
  error = ref('')
const enabled = computed(() => app.data.preferences.protection?.strict === true)
async function change(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  busy.value = true
  error.value = ''
  try {
    await app.mutate((data) => {
      data.preferences.protection ??= defaultProtection()
      data.preferences.protection.strict = checked
    })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <button class="strict-setting" @click="open = true">
    <span class="row"><Icon name="clock" :size="20" />严格模式</span>
    <span class="row strict-value"
      >{{ enabled ? '已开启' : '未开启' }}<Icon name="right" :size="16"
    /></span>
  </button>
  <Sheet v-if="open" title="严格模式" @close="open = false">
    <div class="stack">
      <label class="switch"
        ><span>严格倒计时</span
        ><input type="checkbox" :checked="enabled" :disabled="busy" @change="change"
      /></label>
      <p class="field-help">倒计时开始后不可暂停或提前结束。正计时不受影响。</p>
      <p v-if="app.focus.session" class="field-help">当前专注规则已固定，修改只影响下一轮。</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary wide" @click="open = false">知道了</button>
    </div>
  </Sheet>
</template>
<style scoped>
.strict-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 50px;
  padding: 0;
  width: 100%;
  font-size: 14px;
  border-bottom: 1px solid #e9e9eb;
  text-align: left;
}
.strict-setting .row {
  gap: 12px;
}
.strict-value {
  font-size: 12px;
  color: var(--muted);
}
</style>
