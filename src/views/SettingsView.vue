<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useApp } from '../stores/app'
import StudyModeSheet from '../components/StudyModeSheet.vue'
import { migrateProtectionPreferences } from '../domain/protectionModules'
import { makeBackup, readBackup, type Backup } from '../domain/backup'
import { dateKey } from '../domain/dates'
import {
  native,
  exportFile,
  importNativeFile,
  permissionStatus,
  requestNotifications,
  openAlarmSettings,
} from '../platform/bridge'
import Icon from '../components/Icon.vue'
import AppMark from '../components/AppMark.vue'
import Sheet from '../components/Sheet.vue'
import InfoHint from '../components/InfoHint.vue'
import UpdateSettings from '../components/UpdateSettings.vue'
import { useUpdates } from '../stores/updates'
const app = useApp(),
  updates = useUpdates(),
  sheet = ref<'duration' | 'restore' | 'about' | 'sound' | null>(null),
  studyOpen = ref(false),
  studyInitialView = ref<'home' | 'apps' | 'strict' | 'quiet' | 'permissions'>('home'),
  minutes = ref(25),
  importInput = ref<HTMLInputElement>(),
  backup = ref<Backup | null>(null),
  error = ref(''),
  busy = ref(false),
  permissions = ref({ notifications: false, exactAlarms: false })
const studySummary = computed(() => {
  const migrated = migrateProtectionPreferences(app.data.preferences.protection)
  return migrated.modules?.master ? '已开启' : '未开启'
})
function openStudy(view: 'home' | 'apps' | 'strict' | 'quiet' | 'permissions' = 'home') {
  sheet.value = null
  studyInitialView.value = view
  studyOpen.value = true
}
function recovery() { window.dispatchEvent(new Event('open-recovery')) }
async function refreshPermissions() {
  try {
    permissions.value = await permissionStatus()
  } catch {}
}
function onVisible() {
  if (!document.hidden) void refreshPermissions()
}
onMounted(() => {
  void refreshPermissions()
  window.addEventListener('focus', onVisible)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  window.removeEventListener('focus', onVisible)
  document.removeEventListener('visibilitychange', onVisible)
})
async function preference(key: 'sound' | 'vibration', event: Event) {
  const target = event.target as HTMLInputElement
  const value = target.checked
  try {
    await app.mutate((d) => (d.preferences[key] = value))
  } catch (e) {
    target.checked = app.data.preferences[key]
    app.notify(e instanceof Error ? e.message : String(e))
  }
}
function editMinutes() {
  minutes.value = app.data.preferences.defaultMinutes
  error.value = ''
  sheet.value = 'duration'
}
async function saveMinutes() {
  if (busy.value) return
  if (!Number.isInteger(minutes.value) || minutes.value < 1) {
    error.value = '请输入正整数分钟'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await app.mutate((d) => (d.preferences.defaultMinutes = minutes.value))
    sheet.value = null
    app.notify('默认时长已保存')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
async function exportBackup() {
  try {
    await exportFile(makeBackup(app.data), `小猫专注备份-${dateKey()}.json`)
    app.notify('备份已导出')
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}
function previewImport(text: string) {
  backup.value = null
  error.value = ''
  try {
    backup.value = readBackup(text)
    error.value = ''
    sheet.value = 'restore'
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}
async function chooseImport() {
  if (app.focus.session || app.lock.session) {
    app.notify('请先结束当前专注或锁机，再恢复备份')
    return
  }
  if (native) {
    try {
      previewImport((await importNativeFile()).text)
    } catch (e) {
      app.notify(e instanceof Error ? e.message : String(e))
    }
  } else importInput.value?.click()
}
async function fileChanged(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    if (file.size > 20 * 1024 * 1024) {
      app.notify('备份文件过大，请检查文件')
      return
    }
    previewImport(await file.text())
  }
  ;(event.target as HTMLInputElement).value = ''
}
async function restore() {
  if (!backup.value) return
  busy.value = true
  try {
    await app.restore(backup.value.data)
    permissions.value = await permissionStatus().catch(() => permissions.value)
    sheet.value = null
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
async function enableNotifications() {
  try {
    await requestNotifications()
    await refreshPermissions()
    app.notify(
      permissions.value.notifications ? '系统通知已开启' : '通知未开启，其他功能仍可正常使用',
    )
  } catch (e) {
    app.notify(String(e))
  }
}
async function openAlarms() {
  try {
    await openAlarmSettings()
    await refreshPermissions()
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}
</script>
<template>
  <div class="page settings-page">
    <header class="page-header"><h1>我的</h1></header>
    <div class="profile">
      <div class="profile-icon"><AppMark :size="48" /></div>
      <div>
        <h2>小猫专注</h2>
        <p>版本 {{ updates.state.currentVersion }}</p>
      </div>
    </div>
    <h3 class="settings-section-label">专注设置</h3>
    <div class="settings-group">
      <button class="settings-row" @click="editMinutes">
        <span class="row"><Icon name="clock" :size="20" />默认专注时长</span
        ><span class="row settings-value"
          >{{ app.data.preferences.defaultMinutes }} 分钟<Icon name="right" :size="16"
        /></span></button
      ><label class="settings-row switch"
        ><span class="row"><Icon name="sound" :size="20" />结束提示音</span
        ><input
          type="checkbox"
          :checked="app.data.preferences.sound"
          @change="preference('sound', $event)" /></label
      ><label class="settings-row switch"
        ><span class="row"><Icon name="vibration" :size="20" />结束振动</span
        ><input
          type="checkbox"
          :checked="app.data.preferences.vibration"
          @change="preference('vibration', $event)"
      /></label>
    </div>
    <h3 class="settings-section-label">专注保护</h3>
    <div class="settings-group">
      <button class="settings-row" @click="openStudy('home')"><span class="row"><Icon name="shield" :size="20" />学霸模式</span><span class="row settings-value">{{ studySummary }}<Icon name="right" :size="16" /></span></button>
      <RouterLink class="settings-row" to="/lock"><span class="row"><Icon name="clock" :size="20" />独立锁机</span><span class="row settings-value">{{ app.lock.session ? '进行中' : '配置与记录' }}<Icon name="right" :size="16" /></span></RouterLink>
      <button class="settings-row" @click="sheet = 'sound'"><span class="row"><Icon name="bell" :size="20" />声音与通知</span><Icon name="right" :size="16" /></button>
      <RouterLink class="settings-row" to="/permissions"><span class="row"><Icon name="info" :size="20" />权限与保护状态</span><Icon name="right" :size="16" /></RouterLink>
    </div>
    <StudyModeSheet v-if="studyOpen" :open="studyOpen" :initial-view="studyInitialView" @close="studyOpen = false" />
    <Sheet :open="sheet === 'sound'" title="声音与通知" @close="sheet = null">
      <div class="notification-preferences">
        <button type="button" class="secondary wide" @click="openStudy('quiet')">前往学霸模式 · 免打扰设置</button>
        <p class="field-help">专注期间的声音免打扰与通知拦截已统一归入「学霸模式 → 免打扰」。</p>
    <template v-if="native"
      ><h3 class="settings-section-label">系统提醒</h3>
      <div class="settings-group">
        <button class="settings-row" @click="enableNotifications">
          <span class="row"><Icon name="bell" :size="20" />通知权限</span
          ><span class="row settings-value"
            >{{ permissions.notifications ? '已开启' : '去开启' }}<Icon name="right" :size="16"
          /></span></button
        ><button class="settings-row" @click="openAlarms">
          <span class="row"><Icon name="clock" :size="20" />准时提醒</span
          ><span class="row settings-value"
            >{{ permissions.exactAlarms ? '已允许' : '系统设置' }}<Icon name="right" :size="16"
          /></span>
        </button>
      </div>
      <InfoHint label="系统提醒说明"><p>
        日程和课程的提醒可以单独设置。关闭系统提醒不影响专注记录。
      </p></InfoHint></template
    >
        <button class="primary wide" @click="sheet = null">完成</button>
      </div>
    </Sheet>
    <div class="settings-section-heading"><h3 class="settings-section-label">本地数据</h3><InfoHint label="本地数据与备份"><p>数据保存在这台设备上。定期导出一份备份，换设备时也能带走。</p><p>恢复备份会替换当前数据，请先结束专注或锁机。</p></InfoHint></div>
    <div class="settings-group">
      <button class="settings-row" @click="exportBackup">
        <span class="row"><Icon name="download" :size="20" />导出备份</span
        ><Icon name="right" :size="16" /></button
      ><button class="settings-row" @click="chooseImport">
        <span class="row"><Icon name="upload" :size="20" />从备份恢复</span
        ><Icon name="right" :size="16" />
      </button>
    </div>
    <input
      ref="importInput"
      class="file-input"
      type="file"
      accept="application/json,.json"
      aria-label="选择小猫专注备份"
      @change="fileChanged"
    />
    <h3 class="settings-section-label">关于</h3>
    <div class="settings-group">
      <UpdateSettings />
      <button class="settings-row" @click="sheet = 'about'">
        <span class="row"><Icon name="info" :size="20" />关于小猫专注</span
        ><span class="row settings-value"
          >{{ updates.state.currentVersion }}<Icon name="right" :size="16"
        /></span>
      </button>
    </div>
    <div class="settings-help-links"><RouterLink to="/help">使用帮助</RouterLink><button @click="recovery">故障恢复</button></div>
    <Sheet :open="sheet === 'duration'" title="默认专注时长" :close-disabled="busy" @close="!busy && (sheet = null)"
      ><form v-if="sheet === 'duration'" @submit.prevent="saveMinutes">
        <label
          >时长（分钟）<input
            v-model.number="minutes"
            type="number"
            min="1"
            step="1"
            required
            autofocus
        /></label>
        <div class="chip-row">
          <button
            v-for="m in [25, 45, 60]"
            :key="m"
            type="button"
            class="chip"
            :class="{ active: minutes === m }"
            @click="minutes = m"
          >
            {{ m }} 分钟
          </button>
        </div>
        <p class="field-help">用于新建待办和自由专注。</p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy">保存设置</button>
      </form></Sheet
    >
    <Sheet :open="sheet === 'restore' && !!backup" title="恢复本地备份" :close-disabled="busy" @close="!busy && (sheet = null)"
      ><div v-if="backup" class="stack">
        <div class="card backup-summary">
          <p>备份时间：{{ new Date(backup.createdAt).toLocaleString('zh-CN') }}</p>
          <p>
            {{ backup.data.themes.filter((t) => !t.deleted).length }} 个主题 ·
            {{ backup.data.items.filter((i) => !i.deleted).length }} 个待办
          </p>
          <p>{{ backup.data.records.length }} 条专注 · {{ backup.data.events.length }} 个日程</p>
          <p>{{ backup.data.lockConfigurations?.length ?? 0 }} 个锁机配置 · 全局白名单 {{ backup.data.preferences.protection?.globalWhitelist.length ?? 0 }} 个应用</p>
          <p>严格模式：{{ backup.data.preferences.protection?.strict ? '开启' : '关闭' }} · 增强保护 {{ backup.data.preferences.protection?.enhancements.length ?? 0 }} 项</p>
        </div>
        <p class="notice">当前数据将被备份替换。建议先导出当前数据。</p>
        <button class="secondary wide" :disabled="busy" @click="exportBackup">先导出当前数据</button>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="primary wide" :disabled="busy" @click="restore">确认恢复此备份</button>
      </div></Sheet
    >
    <Sheet :open="sheet === 'about'" title="关于小猫专注" @close="sheet = null"
      ><div v-if="sheet === 'about'" class="about">
        <div class="about-identity"><span class="about-mark"><Icon name="clock" :size="26" /></span><div><h2>小猫专注</h2><span class="about-version">当前版本 {{ updates.state.currentVersion }}</span></div><span class="about-badge">内测版</span></div>
        <p class="about-description">面向日常学习的专注工具，连接待办、日程课表与专注统计。免登录，数据保存在当前设备。</p>
        <nav class="about-destinations" aria-label="项目与官方网站">
          <a href="https://github.com/cjx-bc/kitten-focus" target="_blank" rel="noopener noreferrer"><span class="destination-icon"><img src="/icons/github-mark.png" alt="" width="28" height="28" /></span><span class="destination-copy"><strong>GitHub 项目</strong><small>cjx-bc/kitten-focus</small></span><Icon name="external" :size="15" /></a>
          <a href="https://focus.linma.asia/" target="_blank" rel="noopener noreferrer"><span class="destination-icon"><Icon name="globe" :size="21" /></span><span class="destination-copy"><strong>官方网站</strong><small>focus.linma.asia</small></span><Icon name="external" :size="15" /></a>
        </nav>
        <section class="about-release" aria-labelledby="latest-release-title">
          <div class="about-section-heading"><h3 id="latest-release-title">最近更新</h3><time datetime="2026-11-21">2026.11.21</time></div>
          <p class="release-name">v0.2.9 <span>学霸模式改版与新图标</span></p>
          <ul class="release-changes">
            <li>重构学霸模式为总开关、应用限制、严格模式、免打扰与授权中心，支持默认配置与自定义记忆。</li>
            <li>开启学霸模式专注时锁定专注页，保留使用帮助、紧急交互与故障恢复出口。</li>
            <li>更新全新小猫应用图标，优化待办弹窗交互、输入法临时浮层识别与备份兼容。</li>
          </ul>
          <a class="about-link" href="https://github.com/cjx-bc/kitten-focus/releases/tag/v0.2.9" target="_blank" rel="noopener noreferrer">完整更新说明<Icon name="right" :size="15" /></a>
        </section>
        <details class="about-details">
          <summary><span>开源许可</span><Icon name="down" :size="15" /></summary>
          <p class="about-license">数字字体 Nunito · SIL Open Font License 1.1<br />Lucide 图标 · ISC License<br />许可文件随项目源码提供。</p>
        </details>
      </div></Sheet
    >
  </div>
</template>
<style scoped>
.profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 0 4px;
}
.profile-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}
.profile h2 {
  font-size: 20px;
}
.profile p {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.settings-section-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  margin: 16px 0 8px 4px;
}
.settings-group {
  background: var(--surface);
  border-radius: 20px;
  padding: 0 17px;
}
.notification-preferences { display: grid; gap: 16px; }
.notification-preferences > section + section { border-top: 1px solid var(--line); padding-top: 12px; }
.settings-section-heading { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.settings-section-heading .settings-section-label { margin-block: 0; }
.settings-help-links { display: flex; justify-content: center; gap: 24px; margin-top: 12px; color: var(--muted); font-size: 12px; }
.settings-help-links > * { display: inline-flex; min-height: 44px; align-items: center; }
.settings-row {
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 50px;
  width: 100%;
  font-size: 14px;
  border-bottom: 1px solid #e9e9eb;
  text-align: left;
}
.settings-row:last-child {
  border-bottom: 0;
}
.settings-row .row {
  gap: 12px;
}
.settings-value {
  font-size: 12px;
  color: var(--muted);
}
.settings-row > svg {
  color: var(--muted);
}
.file-input {
  display: none;
}
.backup-summary {
  font-size: 13px;
  display: grid;
  gap: 8px;
}
.about {
  text-align: left;
  display: grid;
  gap: 18px;
}
.about-identity { display: flex; align-items: center; gap: 12px; }
.about-mark { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 16px; background: var(--surface); flex-shrink: 0; }
.about h2 { font-size: 20px; }
.about-version { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
.about-badge { margin-left: auto; padding: 4px 8px; border-radius: 6px; background: var(--surface); color: var(--muted); font-size: 11px; flex-shrink: 0; }
.about-description { font-size: 13px; color: var(--muted); line-height: 1.8; }
.about-destinations { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.about-destinations a { display: flex; align-items: center; gap: 8px; min-height: 72px; padding: 10px; border: 1px solid var(--line); border-radius: 14px; }
.destination-icon { display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; }
.destination-icon img { mix-blend-mode: multiply; }
.destination-copy { min-width: 0; }
.destination-copy strong { display: block; font-size: 13px; font-weight: 600; }
.destination-copy small { display: block; font-size: 12px; margin-top: 4px; overflow-wrap: anywhere; }
.about-destinations a > svg { margin-left: auto; color: var(--muted); }
.about-release { padding: 16px; border-radius: 16px; background: var(--surface); }
.about-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.about-section-heading h3 { font-size: 14px; }
.about-section-heading time { font-size: 11px; color: var(--muted); }
.release-name { font-size: 14px; font-weight: 650; margin-top: 12px; }
.release-name span { margin-left: 6px; font-size: 12px; font-weight: 400; color: var(--muted); }
.release-changes { padding-left: 17px; margin: 12px 0 0; display: grid; gap: 8px; font-size: 13px; line-height: 1.7; }
.release-changes li::marker { color: #a0a0a5; }
.about-link { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; font-size: 12px; color: var(--muted); }
.about-release .about-link { margin-top: 6px; }
.about-details { border-bottom: 1px solid var(--line); padding-bottom: 6px; }
.about-details > summary { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: 13px; cursor: pointer; list-style: none; }
.about-details > summary::-webkit-details-marker { display: none; }
.about-details > summary > svg { margin-left: auto; color: var(--muted); }
.about-details .release-changes { margin-top: 4px; margin-bottom: 12px; }
.about-license { font-size: 12px; color: var(--muted); margin: 4px 0 12px; }
@media (max-width: 480px) {
  .about-destinations { grid-template-columns: 1fr; }
  .about-destinations a { min-height: 64px; padding-inline: 12px; }
}
</style>
