<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { ProtectionApp, ProtectionStatus } from '../domain/model'
import { protectionDriver } from '../platform/bridge'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import StrictModeSetting from './StrictModeSetting.vue'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const app = useApp()
const prefs = computed(() => app.data.preferences.protection ?? defaultProtection())
const status = ref<ProtectionStatus | null>(null)
const error = ref(''), busy = ref(false), permissionHelp = ref(false), editing = ref(false)
const apps = ref<ProtectionApp[]>([]), selected = ref<string[]>([]), query = ref(''), showSystem = ref(false)
const stateLabels = { off: '未开启', authorization: '待授权', ready: '已就绪', protecting: '保护中', failed: '保护失效', unsupported: '本机不支持' }
const filtered = computed(() => apps.value.filter((row) =>
  (!row.system || showSystem.value || row.fixed || selected.value.includes(row.packageName)) &&
  `${row.name} ${row.packageName}`.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())))
const count = computed(() => new Set([...selected.value, ...apps.value.filter(a => a.fixed).map(a => a.packageName)]).size)
async function refresh() {
  try { status.value = await protectionDriver.status() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
function visibility() { if (!document.hidden) void refresh() }
onMounted(() => { void refresh(); document.addEventListener('visibilitychange', visibility); window.addEventListener('focus', refresh) })
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('focus', refresh) })
async function toggleStudy(event: Event) {
  busy.value = true; error.value = ''
  try {
    const checked = (event.target as HTMLInputElement).checked
    await app.mutate(d => { d.preferences.protection = { ...defaultProtection(), ...d.preferences.protection, study: checked } })
    await refresh()
    if (checked && (!status.value?.authorized || !status.value?.connected)) permissionHelp.value = true
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function openApps() {
  busy.value = true; error.value = ''
  try {
    apps.value = await protectionDriver.apps()
    selected.value = [...prefs.value.globalWhitelist]
    query.value = ''; showSystem.value = false; editing.value = true
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
function select(row: ProtectionApp, event: Event) {
  if (row.fixed) return
  selected.value = (event.target as HTMLInputElement).checked
    ? [...new Set([...selected.value, row.packageName])]
    : selected.value.filter(name => name !== row.packageName)
}
async function saveApps() {
  busy.value = true; error.value = ''
  try {
    await app.mutate(d => { d.preferences.protection = { ...defaultProtection(), ...d.preferences.protection,
      globalWhitelist: [...new Set([...selected.value, ...apps.value.filter(a => a.fixed).map(a => a.packageName)])] } })
    editing.value = false; app.notify(app.focus.session ? '白名单已保存，将用于下一轮专注' : '全局白名单已保存')
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function authorize() {
  busy.value = true
  try { await protectionDriver.openSettings(); permissionHelp.value = false }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false; await refresh() }
}
</script>
<template>
  <Sheet :open="props.open" title="学霸模式" @close="emit('close')">
    <div class="study-stack">
      <p class="notice">开始专注后，仅允许本轮白名单中的应用。普通暂停仍限制应用，结束专注或进入休息后解除。</p>
      <label class="switch"><span>学霸模式<small>限制其他应用使用</small></span><input type="checkbox" :checked="prefs.study" :disabled="busy" @change="toggleStudy" /></label>
      <StrictModeSetting />
      <div class="protection-state" role="status">
        <strong>{{ status ? stateLabels[status.state] : '正在检查能力' }}</strong>
        <p>{{ status?.reason }}</p>
        <p v-if="status?.supported">系统授权：{{ status.authorized ? '已启用' : '未启用' }} · 服务：{{ status.connected ? '已连接' : '未连接' }}</p>
      </div>
      <button v-if="status?.supported" class="secondary wide" :disabled="busy" @click="permissionHelp = true">查看用途与授权</button>
      <button class="menu-row" :disabled="busy || !status?.supported" @click="openApps">
        <span>全局白名单<small>{{ prefs.globalWhitelist.length }} 个已选包 · 小猫始终允许</small></span><Icon name="right" :size="18" />
      </button>
      <p class="muted">无需开启学霸模式也可提前编辑白名单。电话、输入法、紧急拨号及必要权限交互另作例外，不计入白名单。</p>
      <p v-if="app.focus.session" class="notice">本轮名单已固定。这里的修改仅用于下一轮；关闭偏好不会解除本轮限制。</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary wide" @click="emit('close')">完成</button>
    </div>
  </Sheet>
  <Sheet :open="permissionHelp" title="无障碍权限用途" @close="permissionHelp = false">
    <div class="study-stack">
      <p>小猫只在你开始学霸模式后，读取前台应用的包名来判断是否允许使用，并显示本机阻挡页。</p>
      <p>不读取窗口正文，不上传应用使用内容。授权不代表立即开始限制，返回后会重新检查服务连接。</p>
      <p>在系统“无障碍”中启用“小猫专注”。你随时可在同一位置关闭；关闭后本轮会显示保护失效，计时仍继续。</p>
      <p class="notice">系统授权页只在从小猫打开后的短时间内允许访问。普通权限不能保证防止系统强停，来电与紧急功能需按设备验证。</p>
      <button class="primary wide" :disabled="busy || !status?.supported" @click="authorize">前往系统设置</button>
      <button class="secondary wide" @click="permissionHelp = false">暂不开启</button>
    </div>
  </Sheet>
  <Sheet :open="editing" title="全局白名单" @close="editing = false">
    <form @submit.prevent="saveApps">
      <label>搜索应用<input v-model="query" type="search" placeholder="名称或包名" /></label>
      <label class="switch"><span>显示系统应用</span><input v-model="showSystem" type="checkbox" /></label>
      <p role="status">已选 {{ count }} 个应用 · 筛选保留已选项</p>
      <div class="app-choices">
        <label v-for="row in filtered" :key="row.packageName" class="app-choice">
          <img v-if="row.icon" :src="row.icon" alt="" width="36" height="36" /><span v-else class="app-icon"><Icon name="tasks" /></span>
          <span class="app-label">{{ row.name }}<small>{{ row.fixed ? '固定允许' : !row.installed ? '未安装 · 保留选择' : row.system ? '系统应用' : row.packageName }}</small></span>
          <input type="checkbox" :checked="row.fixed || selected.includes(row.packageName)" :disabled="row.fixed" @change="select(row, $event)" />
        </label>
        <p v-if="!filtered.length" class="notice">没有匹配的应用。已选名单仍保留。</p>
      </div>
      <p class="muted">电话、输入法、紧急拨号与必要系统交互自动放行。卸载后保留原包名，重新安装同包名后生效。</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button class="primary wide" :disabled="busy">确认白名单</button>
      <button type="button" class="secondary wide" :disabled="busy" @click="editing = false">取消</button>
    </form>
  </Sheet>
</template>
<style scoped>
.study-stack { display: grid; gap: 18px; }
.study-stack p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 5px; }
.protection-state { background: var(--surface); padding: 16px; border-radius: 14px; }
.protection-state p { margin-top: 5px; color: var(--muted); }
.menu-row { display: flex; align-items: center; justify-content: space-between; text-align: left; min-height: 56px; }
.app-choices { display: grid; gap: 4px; }
.app-choice { display: flex; align-items: center; gap: 12px; padding: 10px 4px; min-height: 60px; border-bottom: 1px solid var(--line); }
.app-choice img, .app-icon { flex: 0 0 36px; border-radius: 8px; }
.app-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.app-icon { display: grid; place-items: center; height: 36px; background: var(--surface); }
</style>
