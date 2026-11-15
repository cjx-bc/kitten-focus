<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>(),
  dialog = ref<HTMLDialogElement>()
onMounted(() => {
  document.documentElement.classList.add('sheet-open')
  dialog.value?.showModal()
})
onBeforeUnmount(() => {
  dialog.value?.close()
  if (!document.querySelector('dialog[open]'))
    document.documentElement.classList.remove('sheet-open')
})
</script>
<template>
  <dialog
    ref="dialog"
    class="sheet"
    @cancel.prevent="emit('close')"
    @click="
      (e) => {
        if (e.target === dialog) emit('close')
      }
    "
  >
    <section>
      <header class="sheet-header">
        <h2>{{ title }}</h2>
        <button type="button" class="icon-button" aria-label="关闭" @click="emit('close')">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <slot />
    </section>
  </dialog>
</template>
