<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import type { Theme, FocusItem, Mode } from '../domain/model'
import { uid, THEME_COLORS } from '../domain/model'
import { dateKey, duration, readableDate, timer, weekdayName } from '../domain/dates'
import { todaySummary } from '../domain/statistics'
import Icon from '../components/Icon.vue'
import Sheet from '../components/Sheet.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import { useConfirmation } from '../components/useConfirmation'
import StudyModeSheet from '../components/StudyModeSheet.vue'
import AppWhitelistEditor from '../components/AppWhitelistEditor.vue'
import { protectionDriver } from '../platform/bridge'
import type { ProtectionStatus } from '../domain/model'
import { studyDisplay } from '../domain/protectionDisplay'
const { confirmation, confirm, resolveConfirmation } = useConfirmation()
const app = useApp(),
  router = useRouter(),
  sheet = ref<'theme' | 'item' | 'free' | 'removeTheme' | null>(null),
  formError = ref(''),
  busy = ref(false),
  studyOpen = ref(false)
const protectionState = ref<ProtectionStatus | null>(null)
const protectionReadFailed = ref(false)
let protectionRevision = 0
const itemWhitelistOpen = ref(false)
const itemWhitelistExpanded = ref(false)
const newThemeMode = ref(false)
const newThemeName = ref('')
const deleteChoice = ref<'move' | 'delete' | null>(null)
const defaultMinutes = computed(() => app.data.preferences.defaultMinutes || 25)
const itemPackages = computed(() => itemForm.whitelist?.source === 'custom' ? itemForm.whitelist.packages : app.data.preferences.protection?.globalWhitelist ?? [])
function setItemWhitelist(source: 'global' | 'custom') {
  if (source === 'global') delete itemForm.whitelist
  else itemForm.whitelist = { source, packages: [...itemPackages.value] }
}
const blocker = computed(() =>
  app.lock.session
    ? { kind: 'lock' as const, text: '锁机进行中，结束后可开始', to: '/lock' }
    : app.focus.session
      ? {
          kind: 'focus' as const,
          text: `正在专注「${app.focus.session.title}」，结束后可开始其他事项`,
          to: '/focus',
        }
      : app.rest.session?.state === 'running'
        ? { kind: 'rest' as const, text: '休息中，结束后可开始', to: '/rest' }
        : null,
)
function isCurrentFocusItem(item: FocusItem) {
  return app.focus.session?.itemId === item.id
}
const activeProtection = computed(() => app.focus?.session?.protection ?? app.lock?.session?.protection)
const studyEntry = computed(() => studyDisplay(app.data.preferences.protection?.study === true,
  activeProtection.value?.study === true, activeProtection.value?.applicationsWithdrawn === true,
  protectionState.value, protectionReadFailed.value))
async function refreshProtection() {
  const revision = ++protectionRevision
  try {
    const value = await protectionDriver.status()
    if (revision === protectionRevision) { protectionState.value = value; protectionReadFailed.value = false }
  } catch {
    if (revision === protectionRevision) { protectionState.value = null; protectionReadFailed.value = true }
  }
}
function syncToday() {
  const next = dateKey()
  if (today.value !== next) today.value = next
}
function refreshWhenVisible() { syncToday(); if (!document.hidden) void refreshProtection() }
onMounted(() => { void refreshProtection(); document.addEventListener('visibilitychange', refreshWhenVisible); window.addEventListener('focus', refreshWhenVisible); window.addEventListener('protection-recovered', refreshWhenVisible) })
onBeforeUnmount(() => { protectionRevision++; document.removeEventListener('visibilitychange', refreshWhenVisible); window.removeEventListener('focus', refreshWhenVisible); window.removeEventListener('protection-recovered', refreshWhenVisible) })
watch([() => app.data.preferences.protection, () => app.focus.session?.id, () => app.lock.session?.id, () => studyOpen.value], refreshProtection)
watch(() => app.focus, syncToday)
const today = ref(dateKey()),
  todayOverview = computed(() => todaySummary(app.data.records, today.value)),
  todayStats = computed(() => todayOverview.value),
  itemStats = computed(() => todayOverview.value.items)
const themeForm = reactive<Theme>({
  id: '',
  name: '',
  color: '#ef4e36',
  order: 0,
  collapsed: false,
})
const itemForm = reactive<FocusItem>({
  id: '',
  themeId: '',
  title: '',
  note: '',
  mode: 'countdown',
  minutes: 25,
  order: 0,
})
const freeForm = reactive<{ mode: Mode; minutes: number }>({ mode: 'countdown', minutes: 25 }),
  moveTo = ref('')
const isEditingTheme = computed(() => app.themes.some((t) => t.id === themeForm.id))
const themeIndex = computed(() => app.themes.findIndex((t) => t.id === themeForm.id))
const savedItem = computed(() => app.items.find((i) => i.id === itemForm.id))
const savedItemThemeChanged = computed(
  () => !!savedItem.value && (newThemeMode.value || savedItem.value.themeId !== itemForm.themeId),
)
const savedItemSiblings = computed(() =>
  savedItem.value ? app.items.filter((i) => i.themeId === savedItem.value!.themeId) : [],
)
const itemIndex = computed(() => savedItemSiblings.value.findIndex((i) => i.id === itemForm.id))
const otherThemes = computed(() => app.themes.filter((t) => t.id !== themeForm.id))
const removingThemeName = computed(
  () => app.themes.find((t) => t.id === themeForm.id)?.name ?? themeForm.name,
)
const removingCount = computed(() => app.items.filter((i) => i.themeId === themeForm.id).length)
const moveToThemeName = computed(
  () => otherThemes.value.find((t) => t.id === moveTo.value)?.name ?? '',
)
const removeThemeButtonText = computed(() => {
  if (removingCount.value === 0) return '删除主题'
  if (deleteChoice.value === 'move')
    return `删除主题，${removingCount.value} 个待办移到「${moveToThemeName.value}」`
  if (deleteChoice.value === 'delete') return `删除主题和 ${removingCount.value} 个待办`
  return '请选择待办的去向'
})
function openTheme(theme?: Theme) {
  Object.assign(
    themeForm,
    theme
      ? { ...theme }
      : {
          id: uid(),
          name: '',
          color: THEME_COLORS[app.themes.length % THEME_COLORS.length]!,
          order: app.themes.length,
          collapsed: false,
        },
  )
  formError.value = ''
  sheet.value = 'theme'
}
function openItem(themeId: string, item?: FocusItem) {
  delete itemForm.whitelist
  itemWhitelistOpen.value = false
  itemWhitelistExpanded.value = false
  newThemeName.value = ''
  if (item) {
    newThemeMode.value = false
    Object.assign(itemForm, {
      id: item.id,
      themeId: item.themeId,
      title: item.title,
      note: item.note,
      mode: item.mode,
      minutes: item.minutes,
      order: item.order,
    })
    if (item.whitelist?.source === 'custom') {
      itemForm.whitelist = { source: 'custom', packages: [...item.whitelist.packages] }
    } else if (item.whitelist?.source === 'global') {
      itemForm.whitelist = { source: 'global' }
    }
  } else {
    newThemeMode.value = !app.themes.length
    Object.assign(itemForm, {
      id: uid(),
      themeId: themeId || app.themes[0]?.id || '',
      title: '',
      note: '',
      mode: 'countdown',
      minutes: defaultMinutes.value,
      order: app.items.length,
    })
  }
  formError.value = ''
  sheet.value = 'item'
}
function onItemThemeSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === '') {
    newThemeMode.value = true
    newThemeName.value = ''
  } else {
    newThemeMode.value = false
    itemForm.themeId = value
  }
}
async function submitItem() {
  const payload: FocusItem = {
    ...itemForm,
    title: itemForm.title.trim(),
    minutes: Number(itemForm.minutes),
  }
  if (newThemeMode.value || !app.themes.length) {
    await execute(() =>
      app.saveItemWithNewTheme(
        {
          name: newThemeName.value.trim(),
          color: THEME_COLORS[app.themes.length % THEME_COLORS.length]!,
        },
        payload,
      ),
    )
  } else {
    await execute(() => app.saveItem(payload))
  }
}
async function reorder(kind: 'theme' | 'item', id: string, direction: number) {
  if (busy.value) return
  busy.value = true
  formError.value = ''
  try {
    await app.move(kind, id, direction)
  } catch (e) {
    formError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
async function execute(operation: () => Promise<unknown>) {
  busy.value = true
  formError.value = ''
  try {
    await operation()
    sheet.value = null
  } catch (e) {
    formError.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}
async function begin(item: FocusItem | null, requestedMode?: Mode, requestedMinutes?: number) {
  if (busy.value) return
  if (blocker.value) {
    app.notify(blocker.value.text)
    return
  }
  busy.value = true
  try {
    if (requestedMode !== undefined) await app.start(item, requestedMode, requestedMinutes)
    else await app.start(item)
    await router.push('/focus')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (message !== '已取消开始专注') app.notify(message)
    if (app.focus.session) await router.push('/focus')
    else if (app.rest.session) await router.push('/rest')
    else if (app.lock.session) await router.push('/lock')
  } finally {
    busy.value = false
  }
}
function onTaskCardClick(item: FocusItem) {
  if (isCurrentFocusItem(item)) {
    void router.push('/focus')
    return
  }
  if (blocker.value) {
    app.notify(blocker.value.text)
    return
  }
  void begin(item)
}
function startDefaultFree() {
  return begin(null, 'countdown', defaultMinutes.value)
}
async function startFree() {
  if (busy.value) return
  busy.value = true
  formError.value = ''
  try {
    await app.start(null, freeForm.mode, Number(freeForm.minutes))
    sheet.value = null
    await router.push('/focus')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    formError.value = message === '已取消开始专注' ? '' : message
  } finally {
    busy.value = false
  }
}
function openFree() {
  if (blocker.value) {
    app.notify(blocker.value.text)
    return
  }
  freeForm.minutes = defaultMinutes.value
  formError.value = ''
  sheet.value = 'free'
}
async function deleteItem() {
  const id = itemForm.id
  if (!(await confirm('删除这个待办？历史专注记录会保留。'))) return
  await execute(() => app.removeItem(id))
}
function removeTheme() {
  deleteChoice.value = null
  moveTo.value = otherThemes.value[0]?.id ?? ''
  formError.value = ''
  sheet.value = 'removeTheme'
}
async function submitRemoveTheme() {
  if (removingCount.value > 0 && !deleteChoice.value) return
  const target = removingCount.value > 0 && deleteChoice.value === 'move' ? moveTo.value : null
  if (removingCount.value > 0 && deleteChoice.value === 'move' && !target) {
    formError.value = '请选择目标主题'
    return
  }
  await execute(() => app.removeTheme(themeForm.id, target))
}
function toggleTheme(theme: Theme) {
  void app.toggleThemeCollapsed(theme.id).catch(() => {})
}
</script>
<template>
  <div class="page tasks-page">
    <ConfirmationDialog :request="confirmation" @resolve="resolveConfirmation" />
    <header class="page-header">
      <div class="task-title">
        <h1>待办</h1>
        <button class="study-entry" aria-haspopup="dialog" :aria-expanded="studyOpen"
          :aria-label="'学霸模式，' + studyEntry.text"
          @click="studyOpen = true">
          <span class="study-chip" :data-tone="studyEntry.tone">学霸模式<span class="study-entry-state" role="status">· {{ studyEntry.text }}</span><Icon name="down" :size="12" /></span>
        </button>
      </div>
      <div class="actions">
        <button class="icon-button" aria-label="自由专注" :aria-disabled="blocker ? 'true' : undefined" @click="openFree">
          <Icon name="clock" /></button
        ><button class="icon-button soft" aria-label="新建主题" @click="openTheme()">
          <Icon name="plus" />
        </button>
      </div>
    </header>
    <StudyModeSheet v-if="studyOpen" :open="studyOpen" @close="studyOpen = false" />
    <AppWhitelistEditor :open="itemWhitelistOpen && sheet === 'item'" title="子待办独立白名单" :packages="itemPackages"
      @close="itemWhitelistOpen = false" @confirm="(packages) => { itemForm.whitelist = { source: 'custom', packages }; itemWhitelistOpen = false }" />
    <div class="daily-line">
      <span>{{ readableDate(today) }} {{ weekdayName(today) }}</span
      ><span
        >今日专注 <strong class="number">{{ duration(todayStats.totalMs) }}</strong></span
      >
    </div>
    <button v-if="app.lock.session" class="ongoing" @click="router.push('/lock')">
      <span class="row">
        <Icon name="clock" />
        <span>{{ app.lock.session.title }}<small>锁机进行中 · 返回处理</small></span>
      </span>
      <Icon name="right" :size="18" />
    </button>
    <button v-if="app.focus.session" class="ongoing" @click="router.push('/focus')">
      <span class="row"
        ><span class="status-dot" /><span
          >返回{{ app.focus.session.title
          }}<small>{{ app.focus.session.state === 'paused' ? '已暂停' : '正在专注' }}</small></span
        ></span
      ><span class="row"
        ><span class="number">{{ duration(app.focus.elapsedMs) }}</span
        ><Icon name="right" :size="18"
      /></span>
    </button>
    <button v-if="app.rest.session?.state === 'running'" class="ongoing" @click="router.push('/rest')">
      <span class="row"
        ><span class="status-dot" /><span
          >{{ app.rest.session.record.title
          }}<small>休息中 · 返回休息</small></span
        ></span
      ><span class="row"
        ><span class="number">{{ timer(app.rest.remainingMs) }}</span
        ><Icon name="right" :size="18"
      /></span>
    </button>
    <p v-if="blocker" class="blocker-hint" role="status">{{ blocker.text }}</p>
    <section v-for="theme in app.themes" :key="theme.id" class="theme-section">
      <header class="theme-header">
        <button
          class="theme-title"
          :class="{ collapsed: theme.collapsed }"
          :aria-label="(theme.collapsed ? '展开主题' : '收起主题') + theme.name"
          :aria-expanded="!theme.collapsed"
          :aria-controls="'theme-items-' + theme.id"
          @click="toggleTheme(theme)"
        >
          <span class="theme-dot" :style="{ background: theme.color }" />
          <h2>{{ theme.name }}</h2>
          <Icon name="down" :size="16" />
        </button>
        <div class="row theme-actions">
          <button
            class="icon-button small"
            :aria-label="'在' + theme.name + '下添加待办'"
            @click="openItem(theme.id)"
          >
            <Icon name="plus" :size="19" />
          </button>
          <button
            class="icon-button small"
            :aria-label="'编辑主题' + theme.name"
            @click="openTheme(theme)"
          >
            <Icon name="more" :size="19" />
          </button>
        </div>
      </header>
      <div
        :id="'theme-items-' + theme.id"
        class="theme-items"
        :class="{ collapsed: theme.collapsed }"
        :inert="theme.collapsed"
        :aria-hidden="theme.collapsed"
      >
        <div class="theme-items-inner">
          <div class="item-list">
            <article
              v-for="item in app.items.filter((i) => i.themeId === theme.id)"
              :key="item.id"
              class="task-card"
              :class="{ current: isCurrentFocusItem(item) }"
            >
              <button
                class="task-main"
                :aria-label="isCurrentFocusItem(item) ? '返回专注' + item.title : '开始' + item.title"
                :aria-disabled="blocker && !isCurrentFocusItem(item) ? 'true' : undefined"
                :disabled="busy"
                @click="onTaskCardClick(item)"
              >
                <span class="task-text">
                  <h3>{{ item.title }}</h3>
                  <p v-if="isCurrentFocusItem(item)" class="ongoing-label">
                    {{ app.focus.session?.state === 'paused' ? '已暂停' : '进行中' }} · 返回专注
                  </p>
                  <p v-else>
                    {{ item.mode === 'stopwatch' ? '正计时' : '倒计时 · ' + item.minutes + ' 分钟'
                    }}<span v-if="itemStats.get(item.id)?.count || itemStats.get(item.id)?.totalMs">
                      · 今日 {{
                        itemStats.get(item.id)?.count
                          ? `${itemStats.get(item.id)!.count} 次，${duration(itemStats.get(item.id)!.totalMs)}`
                          : duration(itemStats.get(item.id)!.totalMs)
                      }}</span
                    >
                  </p>
                </span>
                <span v-if="isCurrentFocusItem(item)" class="start-icon current" aria-hidden="true">
                  <span class="status-dot" />
                </span>
                <span v-else class="start-icon" :class="{ blocked: !!blocker }" aria-hidden="true">
                  <Icon name="play" :size="14" />
                </span>
              </button>
              <button
                class="task-more"
                :aria-label="'编辑' + item.title"
                @click="openItem(theme.id, item)"
              >
                <Icon name="more" :size="18" />
              </button>
            </article>
            <button
              v-if="!app.items.some((i) => i.themeId === theme.id)"
              class="add-first"
              @click="openItem(theme.id)"
            >
              <Icon name="plus" :size="16" />添加第一个待办
            </button>
          </div>
        </div>
      </div>
    </section>
    <div v-if="!app.themes.length" class="empty task-empty">
      <div class="empty-mark"><Icon name="tasks" :size="31" /></div>
      <h2>现在就开始专注</h2>
      <p>不用先分类，点一下就能计时。</p>
      <div class="empty-actions">
        <button
          class="primary wide"
          :aria-disabled="blocker ? 'true' : undefined"
          :disabled="busy"
          @click="startDefaultFree"
        >
          <Icon name="play" :size="16" />开始 {{ defaultMinutes }} 分钟专注
        </button>
        <button class="secondary wide" :disabled="busy" @click="openItem('')">
          <Icon name="plus" :size="18" />创建第一个待办
        </button>
      </div>
      <p class="empty-example">例如「英语 → 背单词」，以后每天点它就能开始</p>
    </div>
    <template v-else>
      <button class="add-theme" @click="openTheme()">
        <Icon name="plus" :size="17" />新建主题
      </button>
      <button
        class="free-focus secondary wide"
        :aria-disabled="blocker ? 'true' : undefined"
        @click="openFree"
      >
        <Icon name="clock" :size="18" />自由专注
      </button>
    </template>
    <Sheet
      :open="sheet === 'theme'"
      :title="isEditingTheme ? '编辑主题' : '新建主题'"
      :close-disabled="busy"
      @close="!busy && (sheet = null)"
      ><form
        @submit.prevent="
          execute(() => app.saveTheme({ ...themeForm, name: themeForm.name.trim() }))
        "
      >
        <label
          >主题名称<input
            v-model="themeForm.name"
            placeholder="例如：英语、数学、阅读"
            maxlength="80"
            required
        /></label>
        <fieldset>
          <legend>主题颜色</legend>
          <div class="color-picker">
            <button
              v-for="color in THEME_COLORS"
              :key="color"
              type="button"
              class="color-swatch"
              :class="{ active: color === themeForm.color }"
              :style="{ background: color }"
              :aria-label="color"
              :aria-pressed="color === themeForm.color"
              @click="themeForm.color = color"
            />
          </div>
        </fieldset>
        <div v-if="isEditingTheme" class="row between">
          <span class="muted">调整顺序 · 立即生效</span>
          <div class="row">
            <button
              type="button"
              class="icon-button soft"
              aria-label="主题上移"
              :disabled="busy || themeIndex <= 0"
              @click="reorder('theme', themeForm.id, -1)"
            >
              <Icon name="up" /></button
            ><button
              type="button"
              class="icon-button soft"
              aria-label="主题下移"
              :disabled="busy || themeIndex < 0 || themeIndex >= app.themes.length - 1"
              @click="reorder('theme', themeForm.id, 1)"
            >
              <Icon name="arrowDown" />
            </button>
          </div>
        </div>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <button class="primary wide" :disabled="busy">保存主题</button
        ><button
          v-if="isEditingTheme"
          type="button"
          class="text-button danger"
          @click="removeTheme"
        >
          删除主题
        </button>
      </form></Sheet
    >
    <Sheet
      :open="sheet === 'item'"
      :title="savedItem ? '编辑待办' : '新建待办'"
      :close-disabled="busy"
      @close="!busy && (sheet = null)"
      ><form @submit.prevent="submitItem">
        <label
          >待办名称<input
            v-model="itemForm.title"
            placeholder="例如：背单词"
            maxlength="120"
            required /></label
        >
        <fieldset>
          <legend>计时方式</legend>
          <div class="segmented">
            <button
              type="button"
              :class="{ active: itemForm.mode === 'countdown' }"
              @click="itemForm.mode = 'countdown'"
            >
              倒计时</button
            ><button
              type="button"
              :class="{ active: itemForm.mode === 'stopwatch' }"
              @click="itemForm.mode = 'stopwatch'"
            >
              正计时
            </button>
          </div>
        </fieldset>
        <label v-if="itemForm.mode === 'countdown'"
          >专注时长（分钟）<input
            v-model.number="itemForm.minutes"
            type="number"
            min="1"
            step="1"
            required
          /><span class="chip-row"
            ><button
              v-for="m in [25, 45, 60]"
              :key="m"
              type="button"
              class="chip"
              :class="{ active: itemForm.minutes === m }"
              @click="itemForm.minutes = m"
            >
              {{ m }} 分钟
            </button></span
          ></label
        >
        <label v-if="app.themes.length"
          >所属主题<select :value="newThemeMode ? '' : itemForm.themeId" @change="onItemThemeSelect">
            <option v-for="theme in app.themes" :key="theme.id" :value="theme.id">
              {{ theme.name }}
            </option>
            <option value="">+ 新建主题…</option>
          </select></label
        >
        <div v-if="!app.themes.length || newThemeMode" class="new-theme-field">
          <label
            >{{ app.themes.length ? '新主题名称' : '所属主题' }}<input
              v-model="newThemeName"
              placeholder="例如：英语、数学、阅读"
              maxlength="80"
              required
          /></label>
          <div class="chip-row" aria-label="推荐主题名称">
            <button
              v-for="preset in ['英语', '数学', '阅读']"
              :key="preset"
              type="button"
              class="chip"
              :class="{ active: newThemeName.trim() === preset }"
              @click="newThemeName = preset"
            >
              {{ preset }}
            </button>
          </div>
        </div>
        <label
          >备注（选填）<textarea
            v-model="itemForm.note"
            placeholder="留一句提醒给自己"
            maxlength="1000"
          />
        </label>
        <div class="whitelist-collapse">
          <button
            type="button"
            class="collapse-row"
            :aria-expanded="itemWhitelistExpanded"
            aria-controls="item-whitelist-panel"
            @click="itemWhitelistExpanded = !itemWhitelistExpanded"
          >
            <span>
              应用限制 ·
              {{
                itemForm.whitelist?.source === 'custom'
                  ? `独立白名单（${itemPackages.length} 个应用）`
                  : '跟随全局'
              }}
            </span>
            <Icon name="down" :size="16" :class="{ open: itemWhitelistExpanded }" />
          </button>
          <div v-if="itemWhitelistExpanded" id="item-whitelist-panel" class="whitelist-panel">
            <label class="switch"><span>跟随全局<small>每轮开始时使用最新全局名单</small></span><input type="radio" name="item-whitelist" :checked="itemForm.whitelist?.source !== 'custom'" @change="setItemWhitelist('global')" /></label>
            <label class="switch"><span>独立白名单<small>替代全局名单，不自动合并</small></span><input type="radio" name="item-whitelist" :checked="itemForm.whitelist?.source === 'custom'" @change="setItemWhitelist('custom')" /></label>
            <button v-if="itemForm.whitelist?.source === 'custom'" type="button" class="secondary wide" :disabled="!protectionState?.supported" @click="itemWhitelistOpen = true">编辑独立白名单（{{ itemPackages.length }} 个应用）</button>
            <p class="field-help">独立空名单仅保留小猫与必要功能例外。保存待办后生效；本轮专注保持开始时的名单。</p>
          </div>
        </div>
        <div v-if="savedItem" class="row between">
          <span class="muted">{{ savedItemThemeChanged ? '更换主题后，保存再调整顺序' : '调整顺序 · 立即生效' }}</span>
          <div class="row">
            <button
              type="button"
              class="icon-button soft"
              aria-label="待办上移"
              :disabled="busy || savedItemThemeChanged || itemIndex <= 0"
              @click="reorder('item', itemForm.id, -1)"
            >
              <Icon name="up" /></button
            ><button
              type="button"
              class="icon-button soft"
              aria-label="待办下移"
              :disabled="busy || savedItemThemeChanged || itemIndex < 0 || itemIndex >= savedItemSiblings.length - 1"
              @click="reorder('item', itemForm.id, 1)"
            >
              <Icon name="arrowDown" />
            </button>
          </div>
        </div>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <button class="primary wide" :disabled="busy">保存待办</button
        ><button
          v-if="savedItem"
          type="button"
          class="text-button danger"
          @click="deleteItem"
        >
          删除待办
        </button>
      </form></Sheet
    >
    <Sheet :open="sheet === 'free'" title="自由专注" :close-disabled="busy" @close="!busy && (sheet = null)"
      ><form
        @submit.prevent="startFree"
      >
        <div class="segmented">
          <button
            type="button"
            :class="{ active: freeForm.mode === 'countdown' }"
            @click="freeForm.mode = 'countdown'"
          >
            倒计时</button
          ><button
            type="button"
            :class="{ active: freeForm.mode === 'stopwatch' }"
            @click="freeForm.mode = 'stopwatch'"
          >
            正计时
          </button>
        </div>
        <label v-if="freeForm.mode === 'countdown'"
          >专注时长（分钟）<input
            v-model.number="freeForm.minutes"
            type="number"
            min="1"
            step="1"
            required
          /><span class="chip-row"
            ><button
              v-for="m in [25, 45, 60]"
              :key="m"
              type="button"
              class="chip"
              :class="{ active: freeForm.minutes === m }"
              @click="freeForm.minutes = m"
            >
              {{ m }} 分钟
            </button></span
          ></label
        >
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <button class="primary wide" :disabled="busy">
          <Icon name="play" :size="18" />开始专注
        </button>
      </form></Sheet
    >
    <Sheet :open="sheet === 'removeTheme'" title="删除主题" :close-disabled="busy" @close="!busy && (sheet = null)"
      ><form @submit.prevent="submitRemoveTheme">
        <p>删除“{{ removingThemeName }}”后，历史专注记录仍会保留。</p>
        <template v-if="removingCount > 0">
          <fieldset class="delete-choices">
            <legend>这个主题里有 {{ removingCount }} 个待办，怎么处理？</legend>
            <label class="switch">
              <span>
                移到其他主题
                <small v-if="!otherThemes.length">没有其他主题可移入</small>
                <small v-else>保留这些待办的专注入口</small>
              </span>
              <input
                v-model="deleteChoice"
                type="radio"
                name="remove-theme-choice"
                value="move"
                :disabled="!otherThemes.length"
              />
            </label>
            <label v-if="deleteChoice === 'move' && otherThemes.length">
              目标主题
              <select v-model="moveTo">
                <option v-for="theme in otherThemes" :key="theme.id" :value="theme.id">
                  {{ theme.name }}
                </option>
              </select>
            </label>
            <label class="switch">
              <span>
                一并删除这 {{ removingCount }} 个待办
                <small>历史专注记录仍会保留</small>
              </span>
              <input v-model="deleteChoice" type="radio" name="remove-theme-choice" value="delete" />
            </label>
          </fieldset>
          <p v-if="deleteChoice === 'delete'" class="delete-warning">
            这些待办的开始入口会消失，历史专注记录保留。
          </p>
        </template>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <button
          class="danger-button wide"
          :disabled="busy || (removingCount > 0 && (!deleteChoice || (deleteChoice === 'move' && !moveTo)))"
        >
          {{ removeThemeButtonText }}
        </button>
      </form></Sheet
    >
  </div>
</template>
<style scoped>
.tasks-page {
  min-height: calc(100dvh - var(--nav-height) - env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
}
.tasks-page > * {
  flex-shrink: 0;
}
.task-title { display: flex; align-items: baseline; gap: 8px; flex: 1; min-width: 0; }
.task-title h1 { flex-shrink: 0; }
.page-header .actions { flex-shrink: 0; }
.study-entry { display: inline-flex; align-items: center; min-height: 44px; min-width: 0; max-width: 100%; border-radius: 100px; font-size: 12px; font-weight: 500; color: var(--muted); }
.study-chip { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; min-width: 0; overflow: hidden; padding: 5px 8px; background: var(--surface); border-radius: 100px; white-space: nowrap; line-height: 18px; }
.study-entry-state { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.study-chip[data-tone='enabled'] { background: var(--ink); color: var(--white); }
.study-chip[data-tone='warning'] { background: #fff1ef; color: #c13a25; }
@media (max-width: 360px) {
  .page-header { gap: 4px; }
  .page-header .actions .icon-button { width: 44px; height: 44px; }
  .task-title { gap: 6px; }
  .study-chip { gap: 3px; padding-inline: 6px; font-size: 11px; }
  .study-chip > svg { display: none; }
}
.daily-line {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 16px;
  gap: 8px;
}
.daily-line strong {
  font-size: 16px;
  color: var(--ink);
  margin-left: 4px;
}
.theme-section {
  margin-bottom: 12px;
}
.theme-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  gap: 4px;
}
.theme-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 8px 6px;
  text-align: left;
  border-radius: 10px;
  transition: background-color 120ms ease;
}
.theme-title h2 {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 17px;
  line-height: 24px;
  font-weight: 650;
}
.theme-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
}
.theme-title > svg {
  color: var(--muted);
  transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
}
.theme-title.collapsed > svg {
  transform: rotate(-90deg);
}
.theme-actions {
  gap: 0;
  flex-shrink: 0;
  color: var(--muted);
}
.theme-actions .icon-button {
  transition: background-color 120ms ease;
}
.theme-items {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
  transition:
    grid-template-rows 180ms cubic-bezier(0.2, 0, 0, 1),
    opacity 140ms ease;
}
.theme-items.collapsed {
  grid-template-rows: 0fr;
  opacity: 0;
}
.theme-items-inner {
  min-height: 0;
  overflow: hidden;
}
.item-list {
  display: grid;
  gap: 8px;
  padding-top: 6px;
}
.task-card {
  display: flex;
  align-items: stretch;
  min-height: 64px;
  border-radius: 14px;
  background: var(--surface);
}
.task-card.current {
  background: #fff4f1;
}
.task-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  flex: 1;
  text-align: left;
  padding: 10px 12px 10px 14px;
  min-height: 64px;
  border-radius: 14px 0 0 14px;
  transition: background-color 120ms ease;
}
.task-text {
  min-width: 0;
  flex: 1;
  display: block;
}
.task-text h3 {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.task-text p {
  font-size: 12px;
  color: var(--muted);
  margin-top: 3px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.task-text .ongoing-label {
  color: #c13a25;
  font-weight: 500;
}
.start-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 50%;
  color: white;
  background: var(--ink);
}
.start-icon.blocked {
  background: #d8d8de;
  color: white;
}
.start-icon.current {
  background: #fde7e1;
}
.start-icon svg {
  fill: currentColor;
  margin-left: 1px;
}
.task-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  flex-shrink: 0;
  min-height: 64px;
  color: var(--muted);
  border-left: 1px solid var(--line);
  border-radius: 0 14px 14px 0;
  transition: background-color 120ms ease;
}
.theme-title:active,
.theme-actions .icon-button:active {
  opacity: 1;
  background: var(--surface);
}
.task-main:active:not(:disabled),
.task-more:active {
  opacity: 1;
  background: var(--line);
}
.task-card.current .task-main:active:not(:disabled) {
  background: #fde7e1;
}
.add-first {
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--muted);
  font-size: 13px;
  border: 1px dashed #ddd;
  border-radius: 14px;
  width: 100%;
}
.add-theme {
  width: 100%;
  display: flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 8px;
}
.task-empty {
  margin-block: auto;
  padding-top: clamp(16px, 4dvh, 36px);
  padding-bottom: clamp(16px, 4dvh, 36px);
}
.empty-actions {
  width: 100%;
  max-width: 280px;
  display: grid;
  gap: 10px;
}
.empty-example {
  font-size: 12px;
}
.free-focus {
  margin-top: auto;
  background: white;
  border: 1px solid var(--line);
}
.ongoing {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fff4f1;
  border-radius: 18px;
  margin-bottom: 14px;
  text-align: left;
  font-size: 14px;
}
.ongoing small {
  display: block;
  margin-top: 5px;
}
.ongoing .number {
  font-size: 18px;
}
.blocker-hint {
  font-size: 12px;
  color: var(--muted);
  margin: -6px 0 14px 4px;
  line-height: 1.5;
}
.new-theme-field {
  display: grid;
  gap: 10px;
}
.whitelist-collapse {
  background: var(--surface);
  border-radius: 14px;
  overflow: hidden;
}
.collapse-row {
  width: 100%;
  min-height: 50px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  font-size: 14px;
}
.collapse-row svg {
  color: var(--muted);
  transform: rotate(-90deg);
  transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
}
.collapse-row svg.open {
  transform: rotate(0deg);
}
.whitelist-panel {
  display: grid;
  gap: 10px;
  padding: 8px 14px 14px;
  border-top: 1px solid var(--line);
}
.delete-choices {
  display: grid;
  gap: 6px;
}
.delete-choices legend {
  margin-bottom: 6px;
}
.switch:has(input:disabled) > span {
  opacity: 0.5;
}
.delete-warning {
  background: #fff1ef;
  color: #a32a19;
  padding: 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
}
.danger-button {
  height: auto;
  line-height: 1.4;
  text-align: center;
}
</style>
