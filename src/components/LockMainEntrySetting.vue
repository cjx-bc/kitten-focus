<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
const app = useApp(), option = 'lockMainInterfaceRestricted', busy = ref(false), error = ref('')
const selected = computed(() => app.data.preferences.protection?.enhancements?.includes(option) ?? false)
async function toggle(event: Event) {
  busy.value = true; error.value = ''
  try {
    const checked = (event.target as HTMLInputElement).checked
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
    <label class="switch"><span>锁机时限制主界面入口<small>普通启动和业务导航只进入锁机控制页</small></span><input type="checkbox" :checked="selected" :disabled="busy" @change="toggle" /></label>
    <p class="muted">仅用于独立锁机；专注和休息不受影响。权限、帮助、紧急和故障恢复保持可达。恢复后本轮普通入口开放，严格锁机仍继续到期；再次开启需等下一轮。</p>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
  </div>
</template>
<style scoped>
.lock-main-entry-setting { display: grid; gap: 14px; border-top: 1px solid var(--line); padding-top: 18px; }
p { font-size: 13px; line-height: 1.7; } small { display: block; color: var(--muted); font-size: 12px; margin-top: 5px; }
</style>
