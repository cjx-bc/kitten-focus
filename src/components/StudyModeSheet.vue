<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { ProtectionStatus } from '../domain/model'
import { protectionDriver } from '../platform/bridge'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'
import StrictModeSetting from './StrictModeSetting.vue'
import AppWhitelistEditor from './AppWhitelistEditor.vue'
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const app = useApp()
const prefs = computed(() => app.data.preferences.protection ?? defaultProtection())
const status = ref<ProtectionStatus | null>(null)
const error = ref(''), busy = ref(false), permissionHelp = ref(false), editing = ref(false)
const stateLabels = { off: '未开启', authorization: '待授权', ready: '已就绪', protecting: '保护中', failed: '保护失效', unsupported: '本机不支持' }
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
async function saveApps(packages: string[]) {
  busy.value = true; error.value = ''
  try {
    await app.mutate(d => { d.preferences.protection = { ...defaultProtection(), ...d.preferences.protection,
      globalWhitelist: packages } })
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
      <button class="menu-row" :disabled="busy || !status?.supported" @click="editing = true">
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
  <AppWhitelistEditor :open="editing" title="全局白名单" :packages="prefs.globalWhitelist"
    :saving="busy" :save-error="error" @close="editing = false" @confirm="saveApps" />
</template>
<style scoped>
.study-stack { display: grid; gap: 18px; }
.study-stack p { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
small { display: block; color: var(--muted); font-size: 12px; font-weight: 400; margin-top: 5px; }
.protection-state { background: var(--surface); padding: 16px; border-radius: 14px; }
.protection-state p { margin-top: 5px; color: var(--muted); }
.menu-row { display: flex; align-items: center; justify-content: space-between; text-align: left; min-height: 56px; }
</style>
