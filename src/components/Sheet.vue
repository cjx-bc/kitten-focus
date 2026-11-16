<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
withDefaults(defineProps<{ title: string; open?: boolean; closeDisabled?: boolean }>(), { open: true, closeDisabled: false })
const emit = defineEmits<{ close: [] }>(),
  dialog = ref<HTMLDialogElement>()
const returnFocus = new WeakMap<Element, HTMLElement>()
watch(
  dialog,
  (element) => {
    if (!element) return
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
      returnFocus.set(element, document.activeElement)
    document.documentElement.classList.add('sheet-open')
    element.showModal()
    element.focus({ preventScroll: true })
  },
  { flush: 'post' },
)
function releaseDialog(element?: Element) {
  if (element instanceof HTMLDialogElement) element.close()
  const target = element && returnFocus.get(element)
  const remaining = document.querySelectorAll('dialog[open]')
  const top = remaining[remaining.length - 1]
  if (target?.isConnected && (!top || top.contains(target))) target.focus({ preventScroll: true })
  if (element) returnFocus.delete(element)
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
      tabindex="-1"
      :aria-label="title"
      autofocus
      @cancel.prevent="!closeDisabled && emit('close')"
      @click="
        (e) => {
          if (e.target === dialog && !closeDisabled) emit('close')
        }
      "
    >
      <section>
        <header class="sheet-header">
          <h2>{{ title }}</h2>
          <button type="button" class="icon-button" aria-label="关闭" :disabled="closeDisabled" @click="emit('close')">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <slot />
      </section>
    </dialog>
  </Transition>
</template>
