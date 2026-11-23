<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { useUpdates } from '../stores/updates'
import { native, exportFile } from '../platform/bridge'
import { updatesDriver, type UpgradeBackup } from '../platform/updates'
import Icon from './Icon.vue'

const props = withDefaults(
  defineProps<{
    view?: 'about' | 'backups'
  }>(),
  { view: 'about' },
)
const emit = defineEmits<{
  'update:view': [view: 'about' | 'backups']
  'busy-change': [busy: boolean]
}>()

const app = useApp(),
  updates = useUpdates(),
  busy = ref(false),
  loadingBackups = ref(false),
  hasChecked = ref(false),
  error = ref(''),
  meteredConfirm = ref(false),
  backups = ref<UpgradeBackup[]>([]),
  restoreTarget = ref<UpgradeBackup | null>(null)

const state = computed(() => updates.state),
  release = computed(() =>
    state.value.phase === 'ready' || state.value.phase === 'downloading'
      ? state.value.downloadRelease || state.value.release
      : state.value.release,
  ),
  progress = computed(() =>
    state.value.total
      ? Math.min(100, Math.floor((state.value.received / state.value.total) * 100))
      : 0,
  )

watch(busy, (value) => emit('busy-change', value))
watch(
  () => props.view,
  (next) => {
    if (next === 'about') {
      restoreTarget.value = null
      error.value = ''
    }
  },
)

const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`
const date = (timestamp: number) => new Date(timestamp).toLocaleString('zh-CN', { hour12: false })

async function execute(action: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function loadBackups(silent = false) {
  if (!native) return
  if (silent) {
    try {
      backups.value = (await updatesDriver.backups()).backups
    } catch {}
    return
  }
  loadingBackups.value = true
  error.value = ''
  try {
    backups.value = (await updatesDriver.backups()).backups
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loadingBackups.value = false
  }
}

onMounted(() => {
  if (!native) return
  void updates.refresh().catch(() => {})
  void loadBackups(true)
})

async function checkUpdate() {
  error.value = ''
  meteredConfirm.value = false
  hasChecked.value = true
  await updates.refresh().catch(() => {})
  if (!['downloading', 'ready'].includes(state.value.phase)) await updates.check(true)
}

async function download(confirmed = false) {
  if (app.focus.session) {
    error.value = '请先结束当前专注，再下载更新。'
    return
  }
  await execute(async () => {
    await updates.refresh()
    if (state.value.metered && !confirmed) {
      meteredConfirm.value = true
      return
    }
    updates.state = await updatesDriver.download(confirmed)
    meteredConfirm.value = false
  })
}

async function install() {
  await execute(async () => {
    if (app.focus.session) throw new Error('请先结束当前专注，再安装更新。')
    await updates.refresh()
    if (!state.value.canInstall) await updatesDriver.installPermission()
    else await updatesDriver.install()
  })
}

async function cancelDownload() {
  await execute(async () => {
    updates.state = await updatesDriver.cancel()
  })
}

function openBackups() {
  restoreTarget.value = null
  error.value = ''
  emit('update:view', 'backups')
  void loadBackups(false)
}

async function exportRecovery(backup: UpgradeBackup) {
  await execute(async () => {
    const result = await updatesDriver.exportBackup(backup.id)
    await exportFile(result.text, `小猫专注升级恢复-${backup.createdAt}.json`)
    app.notify('恢复副本已导出')
  })
}

async function restoreRecovery() {
  if (!restoreTarget.value) return
  await execute(async () => {
    if (app.focus.session || app.lock.session) throw new Error('请先结束当前专注或锁机，再恢复副本。')
    await updatesDriver.restoreBackup(restoreTarget.value!.id)
    // Clear persisted strict acknowledgment so restored strict mode re-prompts cleanly.
    try {
      localStorage.removeItem('xiaomao-strict-acknowledged')
    } catch {}
    app.clearStrictAcknowledged?.()
    location.reload()
  })
}
</script>

<template>
  <template v-if="view === 'about'">
    <div v-if="native" class="stack update-content">
      <p v-if="updates.checking" role="status">正在检查新版本…</p>
      <template v-else-if="release">
        <div class="update-version">
          <h3>{{ release.versionName }}</h3>
          <span>{{ size(release.size) }}</span>
        </div>
        <p class="update-notes">{{ release.notes || '优化使用体验。' }}</p>
        <div v-if="state.phase === 'downloading'" class="stack" role="status">
          <div class="row between">
            <span>正在下载</span><span class="number">{{ progress }}%</span>
          </div>
          <progress :value="state.received" :max="state.total || 1" aria-label="更新下载进度" />
          <p class="field-help">{{ state.message || '切到后台后也会继续下载。' }}</p>
          <button type="button" class="secondary wide" :disabled="busy" @click="cancelDownload">
            取消下载
          </button>
        </div>
        <template v-else-if="state.phase === 'ready'">
          <p class="field-help">安装包已校验。安装前会自动保存本地恢复副本。</p>
          <p v-if="!state.canInstall" class="notice">
            首次更新需要允许“小猫专注”安装应用。开启后返回这里，点击安装。
          </p>
          <button
            type="button"
            class="primary wide"
            :disabled="busy || !!app.focus.session"
            @click="install"
          >
            {{ state.canInstall ? '安装更新' : '允许安装更新' }}
          </button>
        </template>
        <template v-else>
          <p v-if="state.phase === 'failed'" class="form-error" role="alert">{{ state.message }}</p>
          <div v-if="meteredConfirm" class="metered-confirm stack">
            <p>将使用手机流量下载 {{ size(release.size) }}，继续吗？</p>
            <button type="button" class="primary wide" :disabled="busy" @click="download(true)">
              使用流量下载
            </button>
            <button
              type="button"
              class="secondary wide"
              :disabled="busy"
              @click="meteredConfirm = false"
            >
              暂不下载
            </button>
          </div>
          <template v-else>
            <button
              type="button"
              class="primary wide"
              :disabled="busy || !!app.focus.session"
              @click="download()"
            >
              {{ state.phase === 'failed' ? '重新下载' : '下载更新' }}
            </button>
            <button type="button" class="text-button update-recheck" :disabled="busy" @click="checkUpdate">
              重新检查
            </button>
          </template>
        </template>
        <p v-if="app.focus.session" class="notice">当前还有未结束的专注，结束后即可更新。</p>
      </template>
      <template v-else>
        <p v-if="hasChecked && !updates.error && !state.checkError" class="field-help">
          已经是最新版本。
        </p>
        <button
          type="button"
          class="primary wide"
          :disabled="busy || updates.checking"
          @click="checkUpdate"
        >
          {{ updates.checking ? '正在检查…' : '检查更新' }}
        </button>
      </template>
      <p v-if="updates.error || state.checkError" class="form-error" role="alert">
        {{ updates.error || state.checkError }}
      </p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </div>

    <slot />

    <div v-if="native" class="settings-group">
      <button type="button" class="settings-row" @click="openBackups">
        <span class="row"><Icon name="download" :size="20" />升级恢复副本（{{ backups.length }} 份）</span>
        <Icon name="right" :size="16" />
      </button>
    </div>
  </template>

  <div v-else class="stack">
    <p class="field-help">只保存在这台手机，保留最近 3 份。与手动导出的备份分开保存。</p>
    <p v-if="loadingBackups && !backups.length" class="field-help" role="status">正在读取恢复副本…</p>
    <p v-else-if="!backups.length && !busy">还没有升级恢复副本。</p>
    <article v-for="backup in backups" :key="backup.id" class="card stack backup-card">
      <div>
        <h3>{{ date(backup.createdAt) }}</h3>
        <p class="field-help">
          {{ backup.from ? `版本 ${backup.from} → ${backup.to}` : '首次启用升级保护' }}
        </p>
      </div>
      <template v-if="restoreTarget?.id === backup.id">
        <p class="backup-confirm-copy">
          恢复到该副本？当前数据会先保存一份副本，恢复后应用将重新打开。
        </p>
        <p class="field-help">
          副本之后新增或修改的内容会被替换。只恢复配置与历史，不会重启专注或锁机；重新打开后会检查本机应用与权限。
        </p>
        <div class="row backup-actions">
          <button type="button" class="secondary" :disabled="busy" @click="restoreTarget = null">
            取消
          </button>
          <button
            type="button"
            class="primary"
            :disabled="busy || !!app.focus.session || !!app.lock.session"
            @click="restoreRecovery"
          >
            确认恢复
          </button>
        </div>
      </template>
      <div v-else class="row backup-actions">
        <button type="button" class="secondary" :disabled="busy" @click="exportRecovery(backup)">
          导出
        </button>
        <button
          type="button"
          class="text-button"
          :disabled="busy || !!app.focus.session || !!app.lock.session"
          @click="restoreTarget = backup"
        >
          恢复
        </button>
      </div>
    </article>
    <p v-if="app.focus.session || app.lock.session" class="notice">
      请先结束当前专注或锁机，再恢复副本。
    </p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.settings-group {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 0 17px;
}
.settings-row {
  width: 100%;
  min-height: 50px;
  min-width: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-size: 14px;
}
.settings-row:last-child {
  border-bottom: 0;
}
.settings-row .row {
  gap: 12px;
}
.settings-row > svg {
  color: var(--muted-surface);
}
.update-version {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.update-version h3 {
  font-size: 16px;
}
.update-version span {
  color: var(--muted);
  font-size: 13px;
}
.update-notes {
  white-space: pre-wrap;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.update-recheck {
  min-height: 48px;
  min-width: 48px;
  font-size: 13px;
}
.metered-confirm {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 18px;
  font-size: 14px;
}
.backup-card {
  border-radius: var(--radius);
}
.backup-card .field-help {
  color: var(--muted-surface);
  font-size: 12px;
}
.backup-confirm-copy {
  font-size: 13px;
  line-height: 1.6;
}
.backup-actions {
  gap: 10px;
}
.backup-actions button {
  min-height: 48px;
  min-width: 48px;
}
progress {
  width: 100%;
  height: 6px;
  accent-color: var(--ink);
  border: 0;
  border-radius: 6px;
  overflow: hidden;
}
progress::-webkit-progress-bar {
  background: var(--surface);
}
progress::-webkit-progress-value {
  background: var(--ink);
}
</style>
