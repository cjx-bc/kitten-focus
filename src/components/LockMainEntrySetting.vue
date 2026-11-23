<script setup lang="ts">
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import { computed, ref } from 'vue'
import { native } from '../platform/bridge'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
const app = useApp(), option = 'lockMainInterfaceRestricted', busy = ref(false), error = ref('')
const selected = computed(() => app.data.preferences.protection?.enhancements?.includes(option) ?? false)
async function toggle(event: Event) {
  const target = event.target as HTMLInputElement
  const checked = target.checked
  if (busy.value || (checked && !native)) {
    target.checked = selected.value
    return
  }
  busy.value = true; error.value = ''
  try {
    await app.mutate(data => {
      const protection = { ...defaultProtection(), ...data.preferences.protection }
      protection.enhancements = (protection.enhancements ?? []).filter(value => value !== option)
      if (checked) protection.enhancements.push(option)
      data.preferences.protection = protection
    })
    app.notify('增强选项已保存，仅用于下一轮锁机')
  } catch (e) {
    target.checked = selected.value
    error.value = e instanceof Error ? e.message : String(e)
  } finally { busy.value = false }
}
</script>
<template>
  <div class="lock-main-entry-setting">
    <label class="switch">
      <span>锁机时限制返回主页</span>
      <input
        type="checkbox"
        :checked="selected"
        :disabled="capabilityToggleDisabled(selected, native, busy)"
        @change="toggle"
      />
    </label>
    <p class="field-help">
      开启后，独立锁机期间普通启动和业务导航仅进入锁机控制页（专注与休息不受影响）；权限、帮助、紧急与故障恢复保持可达。恢复后本轮普通入口开放，严格锁机仍继续到期，再次开启需等下一轮。
    </p>
    <p v-if="!native" class="field-help">仅 Android 可用</p>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.lock-main-entry-setting { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 18px; }
.switch { min-height: 48px; }
.field-help { font-size: 13px; line-height: 1.7; color: var(--muted-surface); }
</style>
