<script setup lang="ts">
import { computed, ref } from 'vue'
import { useApp } from '../stores/app'
import { useUpdates } from '../stores/updates'
import { native, exportFile } from '../platform/bridge'
import { updatesDriver, type UpgradeBackup } from '../platform/updates'
import Sheet from './Sheet.vue'
import Icon from './Icon.vue'

const app = useApp(),
  updates = useUpdates(),
  panel = ref<'update' | 'backups' | null>(null),
  busy = ref(false),
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
  ),
  rowText = computed(() =>
    updates.checking
      ? '正在检查'
      : state.value.phase === 'downloading'
        ? `下载中 ${progress.value}%`
        : state.value.phase === 'ready'
          ? '待安装'
          : updates.hasUpdate
            ? `发现 ${state.value.release!.versionName}`
            : state.value.currentVersion,
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
function close() {
  panel.value = null
  error.value = ''
  meteredConfirm.value = false
  restoreTarget.value = null
}
async function openUpdate() {
  panel.value = 'update'
  error.value = ''
  meteredConfirm.value = false
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
async function showBackups() {
  panel.value = 'backups'
  restoreTarget.value = null
  await execute(async () => {
    backups.value = (await updatesDriver.backups()).backups
  })
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
    location.reload()
  })
}
</script>

<template>
  <template v-if="native">
    <button class="settings-row" @click="openUpdate">
      <span class="row"><Icon name="refresh" :size="20" />检查更新</span>
      <span class="row settings-value">
        <span v-if="updates.hasUpdate" class="update-dot" aria-label="有新版本" />
        {{ rowText }}<Icon name="right" :size="16" />
      </span>
    </button>
    <button class="settings-row" @click="showBackups">
      <span class="row"><Icon name="download" :size="20" />升级恢复副本</span>
      <Icon name="right" :size="16" />
    </button>
  </template>
  <Sheet v-if="panel === 'update'" title="应用更新" @close="close">
    <div class="stack update-content">
      <div class="update-heading">
        <span class="update-mark"><Icon name="cat" :size="32" /></span>
        <div>
          <h3>小猫专注</h3>
          <p class="field-help">当前版本 {{ state.currentVersion }}</p>
        </div>
      </div>
      <p v-if="updates.checking" role="status">正在检查新版本…</p>
      <template v-else-if="release">
        <div class="update-version">
          <h2>{{ release.versionName }}</h2>
          <span>{{ size(release.size) }}</span>
        </div>
        <p class="update-notes">{{ release.notes || '优化使用体验。' }}</p>
        <div v-if="state.phase === 'downloading'" class="stack" role="status">
          <div class="row between">
            <span>正在下载</span><span class="number">{{ progress }}%</span>
          </div>
          <progress :value="state.received" :max="state.total || 1" aria-label="更新下载进度" />
          <p class="field-help">{{ state.message || '切到后台后也会继续下载。' }}</p>
          <button class="secondary wide" :disabled="busy" @click="cancelDownload">取消下载</button>
        </div>
        <template v-else-if="state.phase === 'ready'">
          <p class="field-help">安装包已校验。安装前会自动保存本地恢复副本。</p>
          <p v-if="!state.canInstall" class="notice">
            首次更新需要允许“小猫专注”安装应用。开启后返回这里，点击安装。
          </p>
          <button class="primary wide" :disabled="busy || !!app.focus.session" @click="install">
            {{ state.canInstall ? '安装更新' : '允许安装更新' }}
          </button>
        </template>
        <template v-else>
          <p v-if="state.phase === 'failed'" class="form-error" role="alert">{{ state.message }}</p>
          <div v-if="meteredConfirm" class="metered-confirm stack">
            <p>将使用手机流量下载 {{ size(release.size) }}，继续吗？</p>
            <button class="primary wide" :disabled="busy" @click="download(true)">
              使用流量下载
            </button>
            <button class="text-button" @click="meteredConfirm = false">暂不下载</button>
          </div>
          <button
            v-else
            class="primary wide"
            :disabled="busy || !!app.focus.session"
            @click="download()"
          >
            {{ state.phase === 'failed' ? '重新下载' : '立即更新' }}
          </button>
        </template>
        <p v-if="app.focus.session" class="notice">当前还有未结束的专注，结束后即可更新。</p>
      </template>
      <p v-else-if="!updates.error && !state.checkError">已经是最新版本。</p>
      <p v-if="updates.error || state.checkError" class="form-error" role="alert">
        {{ updates.error || state.checkError }}
      </p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
      <button
        v-if="!updates.checking && state.phase !== 'downloading'"
        class="text-button"
        :disabled="busy"
        @click="updates.check(true)"
      >
        重新检查
      </button>
      <p class="field-help">按自己的节奏更新。暂不更新也可继续使用。</p>
    </div>
  </Sheet>
  <Sheet v-if="panel === 'backups'" title="升级恢复副本" @close="close">
    <div class="stack">
      <template v-if="restoreTarget">
        <p>
          恢复到
          {{ date(restoreTarget.createdAt) }}
          的数据？当前数据会先保存一份副本，恢复后应用将重新打开。
        </p>
        <p class="notice">副本之后新增或修改的内容会被替换。只恢复配置与历史，不会重启专注或锁机；重新打开后会检查本机应用与权限。</p>
        <button
          class="primary wide"
          :disabled="busy || !!app.focus.session || !!app.lock.session"
          @click="restoreRecovery"
        >
          确认恢复此副本
        </button>
        <button class="secondary wide" :disabled="busy" @click="restoreTarget = null">
          返回副本列表
        </button>
      </template>
      <template v-else>
        <p class="field-help">只保存在这台手机，保留最近 3 份。与手动导出的备份分开保存。</p>
        <p v-if="!backups.length && !busy">还没有升级恢复副本。</p>
        <article v-for="backup in backups" :key="backup.id" class="card stack">
          <div>
            <h3>{{ date(backup.createdAt) }}</h3>
            <p class="field-help">
              {{ backup.from ? `构建 ${backup.from} → ${backup.to}` : '首次启用升级保护' }}
            </p>
          </div>
          <div class="row">
            <button class="secondary" :disabled="busy" @click="exportRecovery(backup)">导出</button
            ><button
              class="text-button"
              :disabled="busy || !!app.focus.session || !!app.lock.session"
              @click="restoreTarget = backup"
            >
              恢复
            </button>
          </div>
        </article>
      </template>
      <p v-if="app.focus.session || app.lock.session" class="notice">请先结束当前专注或锁机，再恢复副本。</p>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </div>
  </Sheet>
</template>

<style scoped>
.settings-row {
  width: 100%;
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 15px 17px;
  text-align: left;
  font-size: 14px;
}
.settings-row + .settings-row {
  border-top: 1px solid var(--line);
}
.settings-value {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.update-dot {
  height: 6px;
  width: 6px;
  background: var(--accent);
  border-radius: 50%;
}
.update-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}
.update-heading p {
  margin-top: 5px;
}
.update-mark {
  width: 58px;
  height: 58px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: var(--surface);
}
.update-version {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
.metered-confirm {
  background: var(--surface);
  border-radius: 16px;
  padding: 18px;
  font-size: 14px;
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
