<script setup lang="ts">
import type { StartErrorKind } from '../domain/startRecovery'

defineProps<{
  error: { message: string; kind: StartErrorKind }
  busy?: boolean
  inlineError?: string
}>()

const emit = defineEmits<{
  recovery: []
  study: []
  clearRetry: []
  close: []
}>()
</script>

<template>
  <div class="stack">
    <p class="notice" role="alert">{{ error.message }}</p>
    <p v-if="inlineError" class="form-error" role="alert">{{ inlineError }}</p>
    <template v-if="error.kind === 'recovery'">
      <button type="button" class="primary wide" :disabled="busy" @click="emit('recovery')">
        前往故障恢复
      </button>
      <button type="button" class="secondary wide" :disabled="busy" @click="emit('close')">
        取消
      </button>
    </template>
    <template v-else-if="error.kind === 'protection'">
      <button type="button" class="primary wide" :disabled="busy" @click="emit('study')">
        前往学霸模式处理
      </button>
      <button type="button" class="secondary wide" :disabled="busy" @click="emit('clearRetry')">
        关闭未就绪保护并开始
      </button>
      <button type="button" class="text-button" :disabled="busy" @click="emit('close')">
        取消
      </button>
    </template>
    <template v-else>
      <button type="button" class="primary wide" :disabled="busy" @click="emit('close')">
        知道了
      </button>
    </template>
  </div>
</template>
