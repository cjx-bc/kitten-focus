<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    title: string
    open?: boolean
    closeDisabled?: boolean
    backLabel?: string
    ignoreGlobalClose?: boolean
  }>(),
  { open: true, closeDisabled: false, ignoreGlobalClose: false },
)
const emit = defineEmits<{ close: []; back: []; closed: [] }>(),
  dialog = ref<HTMLDialogElement>()
const returnFocus = new WeakMap<Element, HTMLElement>()
watch(
  dialog,
  (element) => {
    if (!element) return
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
      returnFocus.set(element, document.activeElement)
    const existing = [...document.querySelectorAll('dialog[open]')].filter((d) => d !== element)
    if (existing.length > 0 && (import.meta.env.DEV || import.meta.env.MODE === 'test')) {
      console.error('[ux-spec] Nested <dialog> detected', existing)
    }
    document.documentElement.classList.add('sheet-open')
    element.showModal()
    const auto = element.querySelector<HTMLElement>('[autofocus]')
    if (auto) {
      if (document.activeElement !== auto) auto.focus({ preventScroll: true })
    } else if (!element.contains(document.activeElement)) {
      element.focus({ preventScroll: true })
    }
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
  if (element) emit('closed')
}
function onGlobalCloseSheets() {
  if (!props.ignoreGlobalClose && props.open) emit('close')
}
onMounted(() => {
  window.addEventListener('ux-close-sheets', onGlobalCloseSheets)
})
onBeforeUnmount(() => {
  window.removeEventListener('ux-close-sheets', onGlobalCloseSheets)
  releaseDialog(dialog.value)
})
</script>
<template>
  <Transition name="sheet-motion" appear @after-leave="releaseDialog">
    <dialog
      v-if="open"
      ref="dialog"
      class="sheet"
      tabindex="-1"
      :aria-label="title"
      @cancel.prevent="!closeDisabled && emit('close')"
      @click="
        (e) => {
          if (e.target === dialog && !closeDisabled) emit('close')
        }
      "
    >
      <section>
        <header class="sheet-header">
          <div class="sheet-header-left">
            <button
              v-if="backLabel"
              type="button"
              class="detail-back"
              :disabled="closeDisabled"
              :aria-label="'返回' + backLabel"
              @click="emit('back')"
            >
              <Icon name="left" :size="16" /><span>{{ backLabel }}</span>
            </button>
            <h2>{{ title }}</h2>
          </div>
          <button type="button" class="icon-button" aria-label="关闭" :disabled="closeDisabled" @click="emit('close')">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <slot />
      </section>
    </dialog>
  </Transition>
</template>
