<script setup lang="ts">
import { ref } from 'vue'
import Sheet from './Sheet.vue'
defineProps<{ label: string }>()
const open = ref(false)
</script>
<template>
  <span class="info-hint">
    <button type="button" class="hint-trigger" :aria-label="label" aria-haspopup="dialog"
      :aria-expanded="open" @click="open = true"><span aria-hidden="true">!</span></button>
    <Sheet :open="open" :title="label" class="hint-dialog" @close="open = false">
      <div class="hint-copy"><slot /></div>
      <button class="secondary wide hint-close" @click="open = false">知道了</button>
    </Sheet>
  </span>
</template>
<style scoped>
.info-hint { display: inline-flex; flex-shrink: 0; }
.hint-trigger { width: 44px; height: 44px; display: grid; place-items: center; color: var(--muted); border-radius: 50%; }
.hint-trigger > span { width: 17px; height: 17px; border: 1.5px solid currentColor; border-radius: 50%; display: grid; place-items: center; font: 600 12px/1 sans-serif; }
.hint-trigger:active { background: var(--surface); }
.hint-copy { display: grid; gap: 14px; font-size: 14px; line-height: 1.8; overflow-wrap: anywhere; }
.hint-close { margin-top: 20px; }
</style>
