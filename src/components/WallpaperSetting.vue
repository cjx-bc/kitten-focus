<script setup lang="ts">
import { capabilityToggleDisabled } from '../domain/protectionDisplay'
import InfoHint from './InfoHint.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useApp } from '../stores/app'
import { defaultProtection } from '../domain/model'
import type { WallpaperStatus } from '../domain/model'
import { protectionDriver } from '../platform/bridge'
import Sheet from './Sheet.vue'
const app = useApp(), option = 'wallpaperProtection'
const selected = computed(() => app.data.preferences.protection?.enhancements?.includes(option) ?? false)
const status = ref<WallpaperStatus>(), busy = ref(false), error = ref(''), consentOpen = ref(false)
const limitsAccepted = ref(false), originalMatches = ref(false)
const labels: Record<string, string> = { off: '未开启', baseline_ready: '原状态已保存，等待下一轮', requested: '已请求，等待系统确认',
  picker_preview: '正在预览，尚未选择',
  active: '本轮主屏壁纸已选择', declined: '系统未选择，本轮已撤销', recovery_pending: '原状态恢复待确认',
  restoration_failed: '恢复失败，可重试', failed: '状态检查失败', restored: '原壁纸已恢复，请核对显示',
  user_choice_preserved: '已保留后续选择', unsupported: '本机不支持' }
let timer: ReturnType<typeof setInterval> | undefined
async function refresh() { try { status.value = await protectionDriver.wallpaper() } catch (e) { status.value = undefined; error.value = String(e) } }
function visible() { if (!document.hidden) void refresh() }
onMounted(() => {
  void refresh(); timer = setInterval(visible, 2000)
  document.addEventListener('visibilitychange', visible); window.addEventListener('focus', visible); window.addEventListener('protection-recovered', visible)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible); window.removeEventListener('protection-recovered', visible)
})
async function perform(action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await action(); await refresh() } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
  finally { busy.value = false }
}
async function toggle(event: Event) {
  const checked = (event.target as HTMLInputElement).checked
  if (checked && !status.value?.supported) return
  await perform(async () => {
    await app.mutate(data => {
      const protection = { ...defaultProtection(), ...data.preferences.protection }
      protection.enhancements = (protection.enhancements ?? []).filter(key => key !== option)
      if (checked) protection.enhancements.push(option)
      data.preferences.protection = protection
    })
    app.notify('壁纸偏好已保存，将用于下一轮；还需保存可恢复原状态及系统确认')
  })
}
function showConsent() { limitsAccepted.value = false; originalMatches.value = false; consentOpen.value = true }
async function prepare() {
  await perform(async () => {
    await protectionDriver.prepareWallpaper(limitsAccepted.value, originalMatches.value)
    consentOpen.value = false; app.notify('本轮原状态已保存；开始后仍需 Android 确认')
  })
}
function recover() { window.dispatchEvent(new Event('open-recovery')) }
</script>
<template>
  <div class="wallpaper-setting" :aria-busy="busy">
    <div class="help-row"><label class="switch"><span>壁纸辅助保护</span><input type="checkbox" :checked="selected" :disabled="capabilityToggleDisabled(selected, status?.supported, busy)" @change="toggle" /></label>
      <InfoHint label="壁纸辅助说明">
<p>默认关闭；下一轮经过 Android 确认后生效</p>
<p>选择小猫动态壁纸，让系统关联同一进程的壁纸服务，重连时协调已有专注或锁机会话。普通暂停保留；结束、休息及重启中断恢复原状态。不能保证防强停、厂商保活或所有版本效果。</p>
    <div class="wallpaper-status" role="status">
      <strong>{{ status ? labels[status.phase] ?? status.phase : '正在检查壁纸状态' }}</strong>
      <p>下一轮偏好：{{ selected ? '已开启' : '未开启' }} · 本轮请求：{{ status?.requested ? '已选择' : '未选择' }}</p>
      <p v-if="status?.supported">主屏实际选择：{{ status.selected ? '小猫动态壁纸' : '其他壁纸' }} · {{ status.pickerOpen ? '系统选择器进行中，预览不等于生效' : '以系统组件和标识核实状态' }}</p>
      <p v-if="status?.supported && !status.requested">当前原壁纸：{{ status.current.component ? '动态组件' : '静态图像' }} · 主屏原图：{{ status.homeSourceAvailable ? '已私有保存' : '未提供' }} · 锁屏原图：{{ status.lockSourceAvailable ? '已私有保存' : '未另行提供' }}</p>
      <p v-if="status?.error">{{ status.error }}</p>
    </div>
    <p>静态原图由你通过 Android 文件选择器提供并私有复制（每张至多 20 MB、6400 万像素），不是读取系统原图。原图和运行态不进入业务备份。原动态组件恢复需要再次系统确认；私有设置与裁剪无法保证。没有可恢复基线时拒绝启用。</p>
      </InfoHint>
    </div>
    <p class="field-help" role="status">{{ status ? labels[status.phase] ?? status.phase : '正在检查' }}</p>
    <p v-if="status?.supported && status.error" class="form-error" role="alert">{{ status.error }}</p>
    <button v-if="status?.supported && selected && !status.requested && !status.recoveryPending" class="secondary wide" :disabled="busy" @click="perform(() => protectionDriver.importWallpaperOriginal(false))">提供当前主屏原图</button>
    <button v-if="status?.supported && selected && !status.requested && !status.recoveryPending" class="secondary wide" :disabled="busy" @click="perform(() => protectionDriver.importWallpaperOriginal(true))">提供独立锁屏原图（如有）</button>
    <button v-if="status?.supported && selected && !status.requested && !status.recoveryPending" class="secondary wide" :disabled="busy" @click="showConsent">保存原状态与查看影响</button>
    <button v-if="['requested', 'picker_preview'].includes(status?.phase ?? '') && status?.requested" class="secondary wide" :disabled="busy" @click="perform(() => protectionDriver.wallpaperPicker())">打开 Android 壁纸确认</button>
    <button v-if="status?.recoveryPending || status?.requested" class="secondary wide" :disabled="busy" @click="recover">查看壁纸恢复责任</button>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <Sheet :open="consentOpen" title="保存本轮原壁纸" @close="consentOpen = false">
      <div class="wallpaper-consent">
        <p>保存原壁纸后，下轮开始时由你在系统中确认更换。</p>
        <p>恢复动态壁纸需要再次确认；裁剪和个性设置可能无法还原。</p>
        <p>请提供与当前主屏、锁屏对应的原图，恢复后核对显示。</p>
        <label><input v-model="originalMatches" type="checkbox" /> 原图与当前壁纸一致，已保留必要设置</label>
        <label><input v-model="limitsAccepted" type="checkbox" /> 了解恢复限制，且此功能不保证防强停</label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy || !originalMatches || !limitsAccepted" @click="prepare">确认保存原状态</button>
        <button class="secondary wide" :disabled="busy" @click="consentOpen = false">取消，保持现状</button>
      </div>
    </Sheet>
  </div>
</template>
<style scoped>
.wallpaper-setting { display: grid; gap: 8px; border-top: 1px solid var(--line); padding-top: 18px; }
.wallpaper-consent { display: grid; gap: 18px; }
p, .wallpaper-consent label { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.wallpaper-consent label { display: flex; align-items: flex-start; gap: 12px; min-height: 48px; }
.wallpaper-consent input { flex: 0 0 auto; margin-top: 4px; }
small { display: block; color: var(--muted); font-size: 12px; margin-top: 5px; }
.wallpaper-status { background: var(--surface); padding: 16px; border-radius: 14px; }
.wallpaper-status p { margin-top: 5px; color: var(--muted); }
</style>
