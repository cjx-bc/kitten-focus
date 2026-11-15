import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { native } from '../platform/bridge'
import { initialUpdateState, updatesDriver } from '../platform/updates'

export const useUpdates = defineStore('updates', () => {
  const state = ref(initialUpdateState()),
    checking = ref(false),
    error = ref('')
  const hasUpdate = computed(() => !!state.value.release)
  let initialized = false,
    polling = false
  async function refresh() {
    if (polling) return
    polling = true
    try {
      state.value = await updatesDriver.status()
    } finally {
      polling = false
    }
  }
  async function check(force = false) {
    if (checking.value || !native) return
    checking.value = true
    error.value = ''
    try {
      state.value = await updatesDriver.check(force)
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      await refresh().catch(() => {})
    } finally {
      checking.value = false
    }
  }
  async function init() {
    if (initialized || !native) return
    initialized = true
    await refresh().catch(() => {})
    void check()
    window.setInterval(() => {
      if (!document.hidden && !checking.value) void refresh().catch(() => {})
    }, 1200)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        void refresh().catch(() => {})
        void check()
      }
    })
  }
  return { state, checking, hasUpdate, error, init, refresh, check }
})
