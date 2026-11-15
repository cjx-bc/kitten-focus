<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
withDefaults(defineProps<{ title: string; open?: boolean }>(), { open: true })
const emit = defineEmits<{ close: [] }>(),
  dialog = ref<HTMLDialogElement>()
watch(
  dialog,
  (element) => {
    if (!element) return
    document.documentElement.classList.add('sheet-open')
    element.showModal()
    element.focus({ preventScroll: true })
  },
  { flush: 'post' },
)
function releaseDialog(element?: Element) {
  if (element instanceof HTMLDialogElement) element.close()
  if (!document.querySelector('dialog[open]'))
    document.documentElement.classList.remove('sheet-open')
}
onBeforeUnmount(() => releaseDialog(dialog.value))
</script>
<template>
  <Transition name="sheet-motion" appear @after-leave="releaseDialog">
    <dialog
      v-if="open"
      ref="dialog"
      class="sheet"
      :aria-label="title"
      autofocus
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
  </Transition>
</template>
