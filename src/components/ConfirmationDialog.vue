<script setup lang="ts">
import Sheet from './Sheet.vue'
import type { ConfirmationRequest } from './useConfirmation'
defineProps<{ request: ConfirmationRequest | null }>()
const emit = defineEmits<{ resolve: [accepted: boolean] }>()
</script>
<template>
  <Sheet :open="!!request" :title="request?.title || ''" @close="emit('resolve', false)">
    <div v-if="request" class="stack">
      <p class="confirmation-message">{{ request.message }}</p>
      <div class="form-footer">
        <button type="button" class="secondary" @click="emit('resolve', false)">{{ request.cancelLabel }}</button>
        <button type="button" :class="request.danger ? 'danger-button' : 'primary'" @click="emit('resolve', true)">{{ request.confirmLabel }}</button>
      </div>
    </div>
  </Sheet>
</template>
<style scoped>
.confirmation-message { font-size: 14px; color: var(--muted); line-height: 1.7; overflow-wrap: anywhere; }
.form-footer button { min-height: 48px; }
</style>
