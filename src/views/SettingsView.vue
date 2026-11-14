<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useApp } from '../stores/app'
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
import Sheet from '../components/Sheet.vue'
const app = useApp(),
  sheet = ref<'duration' | 'restore' | 'about' | null>(null),
  minutes = ref(25),
  importInput = ref<HTMLInputElement>(),
  backup = ref<Backup | null>(null),
  error = ref(''),
  busy = ref(false),
  permissions = ref({ notifications: false, exactAlarms: false })
onMounted(async () => {
  try {
    permissions.value = await permissionStatus()
  } catch {}
})
async function preference(key: 'sound' | 'vibration', event: Event) {
  const value = (event.target as HTMLInputElement).checked
  await app.mutate((d) => (d.preferences[key] = value))
}
function editMinutes() {
  minutes.value = app.data.preferences.defaultMinutes
  error.value = ''
  sheet.value = 'duration'
}
async function saveMinutes() {
  if (!Number.isInteger(minutes.value) || minutes.value < 1) {
    error.value = '请输入正整数分钟'
    return
  }
  await app.mutate((d) => (d.preferences.defaultMinutes = minutes.value))
  sheet.value = null
  app.notify('默认时长已保存')
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
  try {
    backup.value = readBackup(text)
    error.value = ''
    sheet.value = 'restore'
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}
async function chooseImport() {
  if (app.focus.session) {
    app.notify('请先结束当前专注，再恢复备份')
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
    permissions.value = await permissionStatus()
    app.notify(
      permissions.value.notifications ? '系统通知已开启' : '通知未开启，其他功能仍可正常使用',
    )
  } catch (e) {
    app.notify(String(e))
  }
}
</script>
<template>
  <div class="page settings-page">
    <header class="page-header"><h1>我的</h1></header>
    <div class="profile">
      <div class="profile-icon"><Icon name="cat" :size="33" /></div>
      <div>
        <h2>小猫专注</h2>
        <p>专注当下，慢慢积累。</p>
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
    <template v-if="native"
      ><h3 class="settings-section-label">系统提醒</h3>
      <div class="settings-group">
        <button class="settings-row" @click="enableNotifications">
          <span class="row"><Icon name="bell" :size="20" />通知权限</span
          ><span class="row settings-value"
            >{{ permissions.notifications ? '已开启' : '去开启' }}<Icon name="right" :size="16"
          /></span></button
        ><button class="settings-row" @click="openAlarmSettings">
          <span class="row"><Icon name="clock" :size="20" />准时提醒</span
          ><span class="row settings-value"
            >{{ permissions.exactAlarms ? '已允许' : '系统设置' }}<Icon name="right" :size="16"
          /></span>
        </button>
      </div>
      <p class="settings-footnote">
        日程和课程的提醒可以单独设置。关闭系统提醒不影响专注记录。
      </p></template
    >
    <h3 class="settings-section-label">本地数据</h3>
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
    <p class="settings-footnote">数据保存在这台设备上。定期导出一份备份，换设备时也能带走。</p>
    <h3 class="settings-section-label">关于</h3>
    <div class="settings-group">
      <button class="settings-row" @click="sheet = 'about'">
        <span class="row"><Icon name="info" :size="20" />关于小猫专注</span
        ><span class="row settings-value">0.1.0<Icon name="right" :size="16" /></span>
      </button>
    </div>
    <p class="version-note">小猫专注 · 把时间留给自己</p>
    <Sheet v-if="sheet === 'duration'" title="默认专注时长" @close="sheet = null"
      ><form @submit.prevent="saveMinutes">
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
        <p class="field-help">新建待办和自由专注时使用，已经保存的待办不受影响。</p>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button class="primary wide">保存设置</button>
      </form></Sheet
    >
    <Sheet v-if="sheet === 'restore' && backup" title="恢复本地备份" @close="sheet = null"
      ><div class="stack">
        <p>将用这份备份整体替换当前数据。</p>
        <div class="card backup-summary">
          <p>备份时间：{{ new Date(backup.createdAt).toLocaleString('zh-CN') }}</p>
          <p>
            {{ backup.data.themes.filter((t) => !t.deleted).length }} 个主题 ·
            {{ backup.data.items.filter((i) => !i.deleted).length }} 个待办
          </p>
          <p>{{ backup.data.records.length }} 条专注 · {{ backup.data.events.length }} 个日程</p>
        </div>
        <p class="notice">当前设备中未包含在备份里的内容会被替换。建议先导出当前数据，再继续。</p>
        <button class="secondary wide" @click="exportBackup">先导出当前数据</button>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button class="primary wide" :disabled="busy" @click="restore">确认恢复此备份</button>
      </div></Sheet
    >
    <Sheet v-if="sheet === 'about'" title="关于小猫专注" @close="sheet = null"
      ><div class="about">
        <Icon name="cat" :size="47" />
        <h2>小猫专注</h2>
        <p>安排时间，选择一件事，认真投入。<br />让每一段专注都有记录。</p>
        <small>版本 0.1.0 · 本地使用，无需登录</small>
        <div class="divider" />
        <p class="field-help">
          数字字体 Nunito 使用 SIL Open Font License；界面图标使用 Lucide。字体许可随源码提供。
        </p>
      </div></Sheet
    >
  </div>
</template>
<style scoped>
.profile {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 13px 0 25px;
}
.profile-icon {
  width: 70px;
  height: 70px;
  border-radius: 24px;
  background: var(--surface);
  display: grid;
  place-items: center;
}
.profile h2 {
  font-size: 22px;
}
.profile p {
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
}
.settings-section-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  margin: 24px 0 12px 4px;
}
.settings-group {
  background: var(--surface);
  border-radius: 20px;
  padding: 0 17px;
}
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 63px;
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
.settings-footnote {
  font-size: 11px;
  color: var(--muted);
  margin: 11px 5px 0;
  line-height: 1.8;
}
.version-note {
  font-size: 11px;
  color: #929297;
  text-align: center;
  margin-top: 40px;
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
  text-align: center;
  padding: 15px 0 5px;
}
.about > svg {
  margin: 0 auto 18px;
}
.about h2 {
  margin-bottom: 15px;
}
.about > p {
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 20px;
}
.about .divider {
  margin: 28px 0;
}
</style>
