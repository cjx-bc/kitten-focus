<script setup lang="ts">
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import InfoHint from './InfoHint.vue'
import { computed, ref } from 'vue'
import { native } from '../platform/bridge'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
const app = useApp(), option = 'lockMainInterfaceRestricted', busy = ref(false), error = ref('')
const selected = computed(() => app.data.preferences.protection?.enhancements?.includes(option) ?? false)
async function toggle(event: Event) {
  busy.value = true; error.value = ''
  try {
    const checked = (event.target as HTMLInputElement).checked
    if (checked && !native) return
    await app.mutate(data => {
      const protection = { ...defaultProtection(), ...data.preferences.protection }
      protection.enhancements = (protection.enhancements ?? []).filter(value => value !== option)
      if (checked) protection.enhancements.push(option)
      data.preferences.protection = protection
    })
    app.notify('增强选项已保存，仅用于下一轮锁机')
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
</script>
<template>
  <div class="lock-main-entry-setting">
    <div class="help-row"><label class="switch"><span>锁机时限制主界面入口</span><input type="checkbox" :checked="selected" :disabled="capabilityToggleDisabled(selected, native, busy)" @change="toggle" /></label>
      <InfoHint label="锁机入口限制说明">
<p>普通启动和业务导航只进入锁机控制页</p>
<p class="muted">仅用于独立锁机；专注和休息不受影响。权限、帮助、紧急和故障恢复保持可达。恢复后本轮普通入口开放，严格锁机仍继续到期；再次开启需等下一轮。</p>
      </InfoHint>
    </div>
    <p v-if="!native" class="field-help">仅 Android 可用</p>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.lock-main-entry-setting { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 18px; }
p { font-size: 13px; line-height: 1.7; } small { display: block; color: var(--muted); font-size: 12px; margin-top: 5px; }
</style>
