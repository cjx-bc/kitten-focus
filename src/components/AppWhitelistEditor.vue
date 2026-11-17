<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ProtectionApp } from '../domain/model'
import { protectionDriver } from '../platform/bridge'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
const props = withDefaults(defineProps<{
  open: boolean; title: string; packages: string[]; saving?: boolean; saveError?: string
}>(), { saving: false, saveError: '' })
const emit = defineEmits<{ close: []; confirm: [packages: string[]] }>()
const apps = ref<ProtectionApp[]>([]), selected = ref<string[]>([]), query = ref(''), showSystem = ref(false)
const loading = ref(false), error = ref('')
let loadVersion = 0
watch(() => props.open, async (open) => {
  const version = ++loadVersion
  if (!open) return
  apps.value = []; selected.value = [...props.packages]; query.value = ''; showSystem.value = false
  loading.value = true; error.value = ''
  try {
    const available = await protectionDriver.apps()
    if (version !== loadVersion) return
    const rows = new Map(available.map((row) => [row.packageName, row]))
    for (const name of selected.value) if (!rows.has(name)) rows.set(name, {
      packageName: name, name, icon: null, system: false, installed: false, fixed: false,
    })
    apps.value = [...rows.values()]
  } catch (e) { if (version === loadVersion) error.value = e instanceof Error ? e.message : String(e) }
  finally { if (version === loadVersion) loading.value = false }
}, { immediate: true })
const filtered = computed(() => apps.value.filter((row) =>
  (!row.system || showSystem.value || row.fixed || selected.value.includes(row.packageName)) &&
  `${row.name} ${row.packageName}`.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))
const count = computed(() => {
  const fixed = new Set(apps.value.filter(row => row.fixed).map(row => row.packageName))
  return new Set(selected.value.filter(name => !fixed.has(name))).size
})
function select(row: ProtectionApp, event: Event) {
  if (row.fixed || loading.value || props.saving) return
  selected.value = (event.target as HTMLInputElement).checked
    ? [...new Set([...selected.value, row.packageName])]
    : selected.value.filter(name => name !== row.packageName)
}
function confirm() {
  if (loading.value || props.saving || error.value) return
  const fixed = new Set(apps.value.filter(row => row.fixed).map(row => row.packageName))
  emit('confirm', [...new Set(selected.value)].filter(name => !fixed.has(name)))
}
</script>
<template>
  <Sheet :open="open" :title="title" :close-disabled="saving" @close="!saving && emit('close')">
    <form @submit.prevent="confirm">
      <label>搜索应用<input v-model="query" type="search" placeholder="名称或包名" @keydown.enter.prevent /></label>
      <label class="switch"><span>显示系统应用</span><input v-model="showSystem" type="checkbox" /></label>
      <p role="status">{{ loading ? '正在读取应用' : `已选 ${count} 个应用` }}</p>
      <div class="app-choices">
        <label v-for="row in filtered" :key="row.packageName" class="app-choice">
          <img v-if="row.icon" :src="row.icon" alt="" width="36" height="36" /><span v-else class="app-icon"><Icon name="tasks" /></span>
          <span class="app-label">{{ row.name }}<small>{{ row.fixed ? `固定允许 · ${row.packageName}` : !row.installed ? `未安装 · 保留选择 · ${row.packageName}` : row.system ? `系统应用 · ${row.packageName}` : row.packageName }}</small></span>
          <input type="checkbox" :checked="row.fixed || selected.includes(row.packageName)" :disabled="row.fixed || saving || loading" @change="select(row, $event)" />
        </label>
        <p v-if="!loading && !filtered.length" class="notice">没有匹配的应用。已选名单仍保留。</p>
      </div>
      <p class="muted">小猫始终允许。电话、输入法、紧急拨号与必要系统交互自动放行。卸载后保留原包名，重新安装同包名后生效。</p>
      <p v-if="error || saveError" class="form-error" role="alert">{{ error || saveError }}</p>
      <button class="primary wide" :disabled="loading || saving || !!error">{{ saving ? '正在保存' : '确认白名单' }}</button>
      <button type="button" class="secondary wide" :disabled="saving" @click="emit('close')">取消</button>
    </form>
  </Sheet>
</template>
<style scoped>
form > p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 5px; }
.app-choices { display: grid; gap: 4px; }
.app-choice { display: flex; align-items: center; gap: 12px; padding: 10px 4px; min-height: 60px; border-bottom: 1px solid var(--line); }
.app-choice img, .app-icon { flex: 0 0 36px; border-radius: 8px; }
.app-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.app-icon { display: grid; place-items: center; height: 36px; background: var(--surface); }
</style>
