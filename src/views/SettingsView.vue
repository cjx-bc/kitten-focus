<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { App as CapacitorApp } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useApp } from '../stores/app'
import StudyModeSheet from '../components/StudyModeSheet.vue'
import { migrateProtectionPreferences } from '../domain/protectionModules'
import { makeBackup, readBackup, type Backup } from '../domain/backup'
import { dateKey } from '../domain/dates'
import { REST_MINUTE_OPTIONS, resolveRestDurationMs } from '../domain/rest'
import {
  native,
  exportFile,
  importNativeFile,
  permissionStatus,
  requestNotifications,
  openAlarmSettings,
  openBatteryOptimizationSettings,
  type SystemPermissions,
} from '../platform/bridge'
import Icon from '../components/Icon.vue'
import AppMark from '../components/AppMark.vue'
import Sheet from '../components/Sheet.vue'
import { waitForDialogClose } from '../components/sheetClose'
import UpdateSettings from '../components/UpdateSettings.vue'
import { useUpdates } from '../stores/updates'

type SettingsSheet = 'duration' | 'restTiming' | 'sound' | 'backup' | 'about'

const app = useApp(),
  updates = useUpdates(),
  sheet = ref<SettingsSheet | null>(null),
  aboutView = ref<'about' | 'backups'>('about'),
  updateBusy = ref(false),
  studyOpen = ref(false),
  studyInitialView = ref<'home' | 'apps' | 'strict' | 'quiet' | 'permissions'>('home'),
  minutes = ref(25),
  restForm = ref({ restMinutes: 5, autoRest: false, pomodoroLoop: false }),
  importInput = ref<HTMLInputElement>(),
  backup = ref<Backup | null>(null),
  error = ref(''),
  busy = ref(false),
  pendingBatteryFeedback = ref(false),
  permissions = ref<SystemPermissions>({
    notifications: false,
    exactAlarms: false,
    batteryOptimizationIgnored: false,
    foregroundServiceActive: false,
  })
let appStateListener: PluginListenerHandle | undefined
let disposed = false

const studySummary = computed(() => {
  const migrated = migrateProtectionPreferences(app.data.preferences.protection)
  return migrated.modules?.master ? '已开启' : '未开启'
})

const updateSummary = computed(() => {
  const state = updates.state
  if (!native) return state.currentVersion
  if (updates.checking) return '正在检查'
  if (state.phase === 'downloading') {
    const pct = state.total ? Math.min(100, Math.floor((state.received / state.total) * 100)) : 0
    return `下载中 ${pct}%`
  }
  if (state.phase === 'ready') return '待安装'
  if (updates.hasUpdate && state.release) return `发现 ${state.release.versionName}`
  return state.currentVersion
})

const restMinutesLabel = computed(() =>
  Math.round(resolveRestDurationMs(app.data.preferences.restMinutes) / 60_000),
)
const restSummary = computed(() => `${restMinutesLabel.value} 分钟`)

const sheetBusy = computed(() => busy.value || updateBusy.value)
const sheetTitle = computed(() => {
  if (sheet.value === 'duration') return '默认专注时长'
  if (sheet.value === 'restTiming') return '计时与休息'
  if (sheet.value === 'sound') return '提醒与声音'
  if (sheet.value === 'backup') return backup.value ? '恢复本地备份' : '本地备份与恢复'
  if (sheet.value === 'about') return aboutView.value === 'backups' ? '升级恢复副本' : '检查更新与关于'
  return ''
})
const sheetBackLabel = computed(() => {
  if (sheet.value === 'backup' && backup.value) return '本地备份与恢复'
  if (sheet.value === 'about' && aboutView.value === 'backups') return '检查更新与关于'
  return undefined
})

async function openSheet(target: SettingsSheet) {
  if (studyOpen.value) {
    studyOpen.value = false
    await waitForDialogClose()
  }
  error.value = ''
  if (target === 'duration') minutes.value = app.data.preferences.defaultMinutes
  if (target === 'restTiming') {
    restForm.value = {
      restMinutes: restMinutesLabel.value,
      autoRest: app.data.preferences.autoRest === true,
      pomodoroLoop: app.data.preferences.pomodoroLoop === true,
    }
  }
  if (target === 'backup') backup.value = null
  if (target === 'about') {
    aboutView.value = 'about'
    updateBusy.value = false
  }
  sheet.value = target
}

function closeSheet() {
  if (sheetBusy.value) return
  sheet.value = null
  backup.value = null
  error.value = ''
  aboutView.value = 'about'
  updateBusy.value = false
}

function handleSheetBack() {
  if (sheetBusy.value) return
  if (sheet.value === 'backup' && backup.value) {
    backup.value = null
    error.value = ''
  } else if (sheet.value === 'about' && aboutView.value === 'backups') {
    aboutView.value = 'about'
  }
}

async function openStudy(view: 'home' | 'apps' | 'strict' | 'quiet' | 'permissions' = 'home') {
  if (sheet.value) {
    sheet.value = null
    backup.value = null
    error.value = ''
    aboutView.value = 'about'
    updateBusy.value = false
    await waitForDialogClose()
  }
  studyInitialView.value = view
  studyOpen.value = true
}

async function refreshPermissions() {
  try {
    const next = await permissionStatus()
    permissions.value = {
      ...permissions.value,
      ...next,
    }
    if (pendingBatteryFeedback.value && next.batteryOptimizationIgnored) {
      pendingBatteryFeedback.value = false
      app.notify('已允许后台运行')
    }
  } catch {}
}
function onVisible() {
  if (!document.hidden) void refreshPermissions()
}
onMounted(() => {
  void refreshPermissions()
  window.addEventListener('focus', onVisible)
  document.addEventListener('visibilitychange', onVisible)
  if (native) {
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refreshPermissions()
    }).then((handle) => {
      if (disposed) void handle.remove()
      else appStateListener = handle
    })
  }
})
onBeforeUnmount(() => {
  disposed = true
  void appStateListener?.remove()
  window.removeEventListener('focus', onVisible)
  document.removeEventListener('visibilitychange', onVisible)
})

async function preference(
  key: 'sound' | 'vibration' | 'keepScreenOn' | 'leaveAppFail',
  event: Event,
) {
  const target = event.target as HTMLInputElement
  const value = target.checked
  try {
    await app.mutate((d) => (d.preferences[key] = value))
  } catch (e) {
    target.checked =
      key === 'keepScreenOn' || key === 'leaveAppFail'
        ? app.data.preferences[key] !== false
        : Boolean(app.data.preferences[key])
    app.notify(e instanceof Error ? e.message : String(e))
  }
}

function editMinutes() {
  minutes.value = app.data.preferences.defaultMinutes
  void openSheet('duration')
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

async function saveRestTiming() {
  if (busy.value) return
  const mins = restForm.value.restMinutes
  if (!Number.isInteger(mins) || mins < 1 || mins > 60) {
    error.value = '请选择有效的休息时长'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await app.mutate((d) => {
      d.preferences.restMinutes = mins
      d.preferences.autoRest = restForm.value.autoRest
      d.preferences.pomodoroLoop = restForm.value.pomodoroLoop
    })
    sheet.value = null
    app.notify('计时与休息设置已保存')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function exportBackup() {
  try {
    const payload = makeBackup(app.data)
    if (native) {
      sheet.value = null
      await waitForDialogClose()
    }
    await exportFile(payload, `小猫专注备份-${dateKey()}.json`)
    app.notify('备份已导出')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!msg.includes('取消')) {
      app.notify(msg)
    }
  }
}

function previewImport(text: string) {
  backup.value = null
  error.value = ''
  try {
    backup.value = readBackup(text)
    error.value = ''
    if (!studyOpen.value) sheet.value = 'backup'
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  }
}

async function chooseImport() {
  if (app.focus.session || app.lock.session) {
    const message = '请先结束当前专注或锁机，再恢复备份'
    error.value = message
    app.notify(message)
    return
  }
  if (native) {
    try {
      sheet.value = null
      await waitForDialogClose()
      previewImport((await importNativeFile()).text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.includes('取消')) {
        app.notify(msg)
      }
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
  if (app.focus.session || app.lock.session) {
    const message = '请先结束当前专注或锁机，再恢复备份'
    error.value = message
    app.notify(message)
    return
  }
  busy.value = true
  try {
    await app.restore(backup.value.data)
    app.clearStrictAcknowledged?.()
    permissions.value = await permissionStatus().catch(() => permissions.value)
    sheet.value = null
    backup.value = null
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

async function openBatteryOptimization() {
  pendingBatteryFeedback.value = !permissions.value.batteryOptimizationIgnored
  try {
    await openBatteryOptimizationSettings()
    await refreshPermissions()
  } catch (e) {
    pendingBatteryFeedback.value = false
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
      <button type="button" class="settings-row" @click="editMinutes">
        <span class="row"><Icon name="clock" :size="20" />默认专注时长</span>
        <span class="row settings-value">
          {{ app.data.preferences.defaultMinutes }} 分钟<Icon name="right" :size="16" />
        </span>
      </button>
      <button type="button" class="settings-row" @click="openSheet('restTiming')">
        <span class="row"><Icon name="timer" :size="20" />计时与休息</span>
        <span class="row settings-value">
          {{ restSummary }}<Icon name="right" :size="16" />
        </span>
      </button>
      <label class="settings-row switch">
        <span class="row"><Icon name="sun" :size="20" />屏幕常亮</span>
        <input
          type="checkbox"
          :checked="app.data.preferences.keepScreenOn !== false"
          @change="preference('keepScreenOn', $event)"
        />
      </label>
      <button type="button" class="settings-row" @click="openSheet('sound')">
        <span class="row"><Icon name="bell" :size="20" />提醒与声音</span>
        <Icon name="right" :size="16" />
      </button>
    </div>

    <h3 class="settings-section-label">专注保护</h3>
    <div class="settings-group">
      <button type="button" class="settings-row" @click="openStudy('home')">
        <span class="row">
          <Icon name="shield" :size="20" />
          <span class="settings-row-copy">
            <span>学霸模式</span>
            <small>伴随专注计时生效，计入统计</small>
          </span>
        </span>
        <span class="row settings-value">
          {{ studySummary }}<Icon name="right" :size="16" />
        </span>
      </button>
      <RouterLink class="settings-row" to="/lock">
        <span class="row">
          <Icon name="lock" :size="20" />
          <span class="settings-row-copy">
            <span>独立锁机</span>
            <small>不绑待办、不计统计，单纯锁机</small>
          </span>
        </span>
        <span class="row settings-value">
          {{ app.lock.session ? '进行中' : '配置与记录' }}<Icon name="right" :size="16" />
        </span>
      </RouterLink>
      <label class="settings-row switch">
        <span class="row settings-row-lead">
          <Icon name="cat" :size="20" />
          <span class="settings-row-copy">
            <span>轻看护</span>
            <small>熄屏锁屏与通话不受影响</small>
          </span>
        </span>
        <input
          type="checkbox"
          :checked="app.data.preferences.leaveAppFail !== false"
          @change="preference('leaveAppFail', $event)"
        />
      </label>
    </div>

    <h3 class="settings-section-label">数据与支持</h3>
    <div class="settings-group">
      <button type="button" class="settings-row" @click="openSheet('backup')">
        <span class="row"><Icon name="download" :size="20" />本地备份与恢复</span>
        <Icon name="right" :size="16" />
      </button>
      <RouterLink class="settings-row" to="/permissions">
        <span class="row"><Icon name="info" :size="20" />高级保护与诊断</span>
        <Icon name="right" :size="16" />
      </RouterLink>
      <button type="button" class="settings-row" @click="openSheet('about')">
        <span class="row"><Icon name="refresh" :size="20" />检查更新与关于</span>
        <span class="row settings-value">
          <span v-if="native && updates.hasUpdate" class="update-dot" aria-label="有新版本" />
          {{ updateSummary }}<Icon name="right" :size="16" />
        </span>
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

    <StudyModeSheet
      :open="studyOpen"
      :initial-view="studyInitialView"
      @close="studyOpen = false"
    />

    <Sheet
      :open="sheet !== null"
      :title="sheetTitle"
      :back-label="sheetBackLabel"
      :close-disabled="sheetBusy"
      @close="closeSheet"
      @back="handleSheetBack"
    >
      <form v-if="sheet === 'duration'" @submit.prevent="saveMinutes">
        <label>
          时长（分钟）
          <input v-model.number="minutes" type="number" min="1" step="1" required autofocus />
        </label>
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
        <button type="submit" class="primary wide" :disabled="busy">保存设置</button>
      </form>

      <form v-else-if="sheet === 'restTiming'" class="stack" @submit.prevent="saveRestTiming">
        <fieldset>
          <legend>休息时长（分钟）</legend>
          <div class="chip-row" data-decision-group>
            <button
              v-for="m in REST_MINUTE_OPTIONS"
              :key="m"
              type="button"
              class="chip"
              :class="{ active: restForm.restMinutes === m }"
              @click="restForm.restMinutes = m"
            >
              {{ m }} 分钟
            </button>
          </div>
        </fieldset>
        <div class="settings-group">
          <label class="settings-row switch">
            <span class="row">
              <span class="settings-row-copy">
                <span>自动进入休息</span>
                <small>专注正常结束后自动开始休息</small>
              </span>
            </span>
            <input v-model="restForm.autoRest" type="checkbox" />
          </label>
          <label class="settings-row switch">
            <span class="row">
              <span class="settings-row-copy">
                <span>番茄循环</span>
                <small>休息自然到期后自动开启下一轮专注</small>
              </span>
            </span>
            <input v-model="restForm.pomodoroLoop" type="checkbox" />
          </label>
        </div>
        <p v-if="!restForm.autoRest" class="field-help">
          未开启「自动进入休息」时，专注结束后需手动点击休息；开启「番茄循环」将在休息自然到期时自动进入下一轮，主动退出休息不会触发。
        </p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button type="submit" class="primary wide" :disabled="busy">保存设置</button>
      </form>

      <div v-else-if="sheet === 'sound'" class="notification-preferences">
        <div class="settings-group" data-decision-group>
          <label class="settings-row switch">
            <span class="row"><Icon name="sound" :size="20" />结束提示音</span>
            <input
              type="checkbox"
              :checked="app.data.preferences.sound"
              @change="preference('sound', $event)"
            />
          </label>
          <label class="settings-row switch">
            <span class="row"><Icon name="vibration" :size="20" />结束振动</span>
            <input
              type="checkbox"
              :checked="app.data.preferences.vibration"
              @change="preference('vibration', $event)"
            />
          </label>
        </div>
        <button type="button" class="secondary wide" @click="openStudy('quiet')">
          前往学霸模式 · 免打扰设置
        </button>
        <p class="field-help">专注免打扰在「学霸模式→免打扰」。</p>
        <template v-if="native">
          <h3 class="settings-section-label">系统提醒与后台</h3>
          <div class="settings-group" data-decision-group>
            <button type="button" class="settings-row" @click="enableNotifications">
              <span class="row"><Icon name="bell" :size="20" />通知权限</span>
              <span class="row settings-value">
                {{ permissions.notifications ? '已开启' : '去开启' }}<Icon name="right" :size="16" />
              </span>
            </button>
            <button type="button" class="settings-row" @click="openAlarms">
              <span class="row"><Icon name="clock" :size="20" />准时提醒</span>
              <span class="row settings-value">
                {{ permissions.exactAlarms ? '已允许' : '去设置' }}<Icon name="right" :size="16" />
              </span>
            </button>
            <button type="button" class="settings-row" @click="openBatteryOptimization">
              <span class="row settings-row-lead">
                <Icon name="battery" :size="20" />
                <span class="settings-row-copy">
                  <span>后台运行不限制</span>
                  <small>减少锁屏后专注保护与提醒被系统暂停</small>
                </span>
              </span>
              <span
                class="row"
                :class="permissions.batteryOptimizationIgnored ? 'settings-value-ok' : 'settings-value'"
              >
                <Icon v-if="permissions.batteryOptimizationIgnored" name="check" :size="14" />
                {{ permissions.batteryOptimizationIgnored ? '已放行' : '去放行' }}
                <Icon v-if="!permissions.batteryOptimizationIgnored" name="right" :size="16" />
              </span>
            </button>
          </div>
          <p class="field-help">
            日程和课程的提醒可以单独设置；不放行后台优化也可正常计时。
          </p>
        </template>
        <button type="button" class="primary wide" @click="closeSheet">完成</button>
      </div>

      <div v-else-if="sheet === 'backup'" class="stack">
        <template v-if="backup">
          <div class="card backup-summary">
            <p>备份时间：{{ new Date(backup.createdAt).toLocaleString('zh-CN') }}</p>
            <p>
              {{ backup.data.themes.filter((t) => !t.deleted).length }} 个主题 ·
              {{ backup.data.items.filter((i) => !i.deleted).length }} 个待办
            </p>
            <p>{{ backup.data.records.length }} 条专注 · {{ backup.data.events.length }} 个日程</p>
            <p>
              {{ backup.data.lockConfigurations?.length ?? 0 }} 个锁机配置 · 全局白名单
              {{ backup.data.preferences.protection?.globalWhitelist.length ?? 0 }} 个应用
            </p>
            <p>
              严格模式：{{ backup.data.preferences.protection?.strict ? '开启' : '关闭' }} · 增强保护
              {{ backup.data.preferences.protection?.enhancements.length ?? 0 }} 项
            </p>
          </div>
          <p class="notice">
            当前待办、专注记录、日程与偏好将被备份替换（独立锁机历史将保留在当前设备）。建议先导出当前数据。
          </p>
          <button type="button" class="secondary wide" :disabled="busy" @click="exportBackup">
            先导出当前数据
          </button>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button type="button" class="primary wide" :disabled="busy" @click="restore">
            确认恢复此备份
          </button>
        </template>
        <template v-else>
          <p class="field-help">数据保存在这台设备上。定期导出一份备份，换设备时也能带走。</p>
          <p class="field-help">
            恢复备份会替换当前待办、专注记录、日程与偏好（独立锁机历史不受影响），请先结束专注或锁机。
          </p>
          <p v-if="error" class="form-error" role="alert">{{ error }}</p>
          <button type="button" class="primary wide" :disabled="busy" @click="exportBackup">
            导出备份
          </button>
          <button type="button" class="secondary wide" :disabled="busy" @click="chooseImport">
            从备份恢复
          </button>
        </template>
      </div>

      <div v-else-if="sheet === 'about'" class="about">
        <template v-if="aboutView === 'about'">
          <div class="about-identity">
            <span class="about-mark"><AppMark :size="48" /></span>
            <div>
              <h2>小猫专注</h2>
              <span class="about-version">当前版本 {{ updates.state.currentVersion }}</span>
            </div>
            <span class="about-badge">本地优先</span>
          </div>
          <p class="about-description">
            面向日常学习的专注工具，连接待办、日程课表与专注统计。免登录，数据保存在当前设备。
          </p>
        </template>

        <UpdateSettings v-model:view="aboutView" @busy-change="updateBusy = $event">
          <nav class="about-destinations" aria-label="项目与官方网站">
            <a
              href="https://github.com/cjx-bc/kitten-focus"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span class="destination-icon">
                <img src="/icons/github-mark.png" alt="" width="28" height="28" />
              </span>
              <span class="destination-copy">
                <strong>GitHub 项目</strong>
                <small>cjx-bc/kitten-focus</small>
              </span>
              <Icon name="external" :size="15" />
            </a>
            <a href="https://focus.linma.asia/" target="_blank" rel="noopener noreferrer">
              <span class="destination-icon"><Icon name="globe" :size="21" /></span>
              <span class="destination-copy">
                <strong>官方网站</strong>
                <small>focus.linma.asia</small>
              </span>
              <Icon name="external" :size="15" />
            </a>
          </nav>

          <details class="about-details">
            <summary><span>最近更新与开源许可</span><Icon name="down" :size="15" /></summary>
            <div class="about-details-body">
              <section class="about-release" aria-labelledby="latest-release-title">
                <div class="about-section-heading">
                  <h3 id="latest-release-title">最近更新</h3>
                  <time datetime="2026-11-28">2026.11.28</time>
                </div>
                <p class="release-name">v0.3.1 <span>稳定性修复、导出加固与 Android 16 实机优化</span></p>
                <ul class="release-changes">
                  <li>修复日历四色分布图与一周农场 PNG 导出在原生 SAF 选择器下触发 `TransactionTooLargeException` 闪退，并将导入/导出写入改为临时文件与后台线程；修复设置备份导出前未收起弹窗的问题。</li>
                  <li>修复白噪音失焦循环抢焦点、Android 16 开机续锁 `mediaPlayback` 前台服务崩溃、状态通知前 10 秒延迟展示、原生专注覆盖层白噪音面板裁剪与字体字重异常，并优化 `FocusControl` 锁竞争与主线程响应。</li>
                  <li>对齐手动补录统计口径（仅计入时间轴与时长，不计入专注次数与好感），修复 10 秒内通知「结束」撤回、轻看护异常退出竞态、跨天时间轴及 365 热力图闰年边界，并保留原有数据兼容。</li>
                </ul>
                <a
                  class="about-link"
                  href="https://github.com/cjx-bc/kitten-focus/releases/tag/v0.3.1"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  完整更新说明<Icon name="right" :size="15" />
                </a>
              </section>
              <div class="about-license-block">
                <h3>开源许可</h3>
                <p class="about-license">
                  数字字体 Nunito · SIL Open Font License 1.1<br />
                  Lucide 图标 · ISC License<br />
                  许可文件随项目源码提供。
                </p>
              </div>
            </div>
          </details>
        </UpdateSettings>
      </div>
    </Sheet>
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
  border-radius: var(--radius);
  padding: 0 17px;
}
.notification-preferences {
  display: grid;
  gap: 16px;
}
.notification-preferences .settings-section-label {
  margin: 4px 0 0 4px;
}
.settings-row {
  padding: 10px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 50px;
  min-width: 48px;
  width: 100%;
  font-size: 14px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}
.settings-row-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.settings-row-copy small {
  font-size: 12px;
  color: var(--muted-surface);
  line-height: 1.4;
  font-weight: 400;
}
.settings-row:last-child {
  border-bottom: 0;
}
.settings-row .row {
  gap: 12px;
}
.settings-row-lead {
  flex: 1;
  min-width: 0;
}
.settings-value {
  font-size: 12px;
  color: var(--muted-surface);
  white-space: nowrap;
  flex-shrink: 0;
}
.settings-value-ok {
  font-size: 12px;
  color: var(--ink);
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
  gap: 4px !important;
}
.settings-row > svg {
  color: var(--muted-surface);
}
.update-dot {
  height: 6px;
  width: 6px;
  background: var(--accent);
  border-radius: 50%;
}
.chip-row .chip {
  min-height: 48px;
  min-width: 48px;
  font-size: 13px;
}
.file-input {
  display: none;
}
.backup-summary {
  border-radius: var(--radius);
  font-size: 13px;
  display: grid;
  gap: 8px;
}
.about {
  text-align: left;
  display: grid;
  gap: 18px;
}
.about-identity {
  display: flex;
  align-items: center;
  gap: 12px;
}
.about-mark {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius);
  flex-shrink: 0;
}
.about h2 {
  font-size: 20px;
}
.about-version {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}
.about-badge {
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted-surface);
  font-size: 12px;
  flex-shrink: 0;
}
.about-description {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.8;
}
.about-destinations {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.about-destinations a {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 64px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.destination-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}
.destination-icon img {
  mix-blend-mode: multiply;
}
.destination-copy {
  min-width: 0;
}
.destination-copy strong {
  display: block;
  font-size: 13px;
  font-weight: 600;
}
.destination-copy small {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
  overflow-wrap: anywhere;
}
.about-destinations a > svg {
  margin-left: auto;
  color: var(--muted);
}
.about-details {
  border-bottom: 1px solid var(--line);
}
.about-details > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  font-size: 13px;
  cursor: pointer;
  list-style: none;
}
.about-details > summary::-webkit-details-marker {
  display: none;
}
.about-details > summary > svg {
  margin-left: auto;
  color: var(--muted);
}
.about-details-body {
  display: grid;
  gap: 14px;
  padding: 4px 0 14px;
}
.about-release {
  padding: 16px;
  border-radius: var(--radius);
  background: var(--surface);
}
.about-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.about-section-heading h3 {
  font-size: 14px;
}
.about-section-heading time {
  font-size: 12px;
  color: var(--muted-surface);
}
.release-name {
  font-size: 14px;
  font-weight: 650;
  margin-top: 12px;
}
.release-name span {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted-surface);
}
.release-changes {
  padding-left: 17px;
  margin: 12px 0 0;
  display: grid;
  gap: 8px;
  font-size: 13px;
  line-height: 1.7;
}
.release-changes li::marker {
  color: var(--muted-surface);
}
.about-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 48px;
  min-width: 48px;
  font-size: 12px;
  color: var(--muted-surface);
}
.about-release .about-link {
  margin-top: 6px;
}
.about-license-block h3 {
  font-size: 13px;
  margin-bottom: 6px;
}
.about-license {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.7;
}
@media (max-width: 480px) {
  .about-destinations {
    grid-template-columns: 1fr;
  }
}
</style>
