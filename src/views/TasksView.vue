<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useApp } from '../stores/app'
import type { Theme, FocusItem, Mode } from '../domain/model'
import { uid } from '../domain/model'
import { dateKey, duration, readableDate, weekdayName } from '../domain/dates'
import { statistics, itemToday } from '../domain/statistics'
import Icon from '../components/Icon.vue'
import Sheet from '../components/Sheet.vue'
import StudyModeSheet from '../components/StudyModeSheet.vue'
import AppWhitelistEditor from '../components/AppWhitelistEditor.vue'
import { protectionDriver } from '../platform/bridge'
import type { ProtectionStatus } from '../domain/model'
const app = useApp(),
  router = useRouter(),
  sheet = ref<'theme' | 'item' | 'free' | 'removeTheme' | null>(null),
  formError = ref(''),
  busy = ref(false),
  studyOpen = ref(false)
const protectionState = ref<ProtectionStatus | null>(null)
const itemWhitelistOpen = ref(false)
const itemPackages = computed(() => itemForm.whitelist?.source === 'custom' ? itemForm.whitelist.packages : app.data.preferences.protection?.globalWhitelist ?? [])
function setItemWhitelist(source: 'global' | 'custom') {
  itemForm.whitelist = source === 'global' ? { source } : { source, packages: [...itemPackages.value] }
}
const protectionLabels = { off: '未开启', authorization: '待授权', ready: '已就绪', protecting: '保护中', failed: '保护失效', unsupported: '本机不支持', recovered: '本轮已撤销' }
async function refreshProtection() {
  try { protectionState.value = await protectionDriver.status() } catch { protectionState.value = null }
}
function refreshWhenVisible() { if (!document.hidden) void refreshProtection() }
onMounted(() => { void refreshProtection(); document.addEventListener('visibilitychange', refreshWhenVisible) })
onBeforeUnmount(() => document.removeEventListener('visibilitychange', refreshWhenVisible))
watch([() => app.data.preferences.protection, () => app.focus.session?.id, () => studyOpen.value], refreshProtection)
const today = dateKey(),
  todayStats = computed(() => statistics(app.data.records, today, today)),
  itemStats = computed(
    () => new Map(app.items.map((i) => [i.id, itemToday(app.data.records, i.id, today)])),
  )
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
const colors = ['#ef4e36', '#e7a54a', '#7b9a80', '#698caa', '#a08bb0', '#85858b']
function openTheme(theme?: Theme) {
  Object.assign(
    themeForm,
    theme
      ? { ...theme }
      : {
          id: uid(),
          name: '',
          color: colors[app.themes.length % colors.length],
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
  Object.assign(
    itemForm,
    item
      ? structuredClone(item)
      : {
          id: uid(),
          themeId,
          title: '',
          note: '',
          mode: 'countdown',
          minutes: app.data.preferences.defaultMinutes,
          order: app.items.length,
        },
  )
  formError.value = ''
  sheet.value = 'item'
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
async function begin(item: FocusItem | null) {
  try {
    await app.start(item)
    await router.push('/focus')
  } catch (e) {
    app.notify(String(e instanceof Error ? e.message : e))
    if (app.focus.session) await router.push('/focus')
    else if (app.rest.session) await router.push('/rest')
  }
}
function openFree() {
  freeForm.minutes = app.data.preferences.defaultMinutes
  formError.value = ''
  sheet.value = 'free'
}
async function deleteItem() {
  if (!confirm('删除这个待办？历史专注记录会保留。')) return
  await execute(() => app.removeItem(itemForm.id))
}
function removeTheme() {
  moveTo.value = ''
  formError.value = ''
  sheet.value = 'removeTheme'
}
function toggleTheme(theme: Theme) {
  void app.saveTheme({ ...theme, collapsed: !theme.collapsed })
}
</script>
<template>
  <div class="page tasks-page">
    <header class="page-header">
      <h1>待办</h1>
      <div class="actions">
        <button class="icon-button" aria-label="自由专注" @click="openFree">
          <Icon name="clock" /></button
        ><button class="icon-button soft" aria-label="新建主题" @click="openTheme()">
          <Icon name="plus" />
        </button>
      </div>
    </header>
    <button class="study-entry secondary wide" @click="studyOpen = true"><span>学霸模式</span><span>{{ protectionState ? protectionLabels[protectionState.state] : '正在检查' }}</span></button>
    <StudyModeSheet v-if="studyOpen" :open="studyOpen" @close="studyOpen = false" />
    <AppWhitelistEditor :open="itemWhitelistOpen && sheet === 'item'" title="子待办独立白名单" :packages="itemPackages"
      @close="itemWhitelistOpen = false" @confirm="(packages) => { itemForm.whitelist = { source: 'custom', packages }; itemWhitelistOpen = false }" />
    <div class="daily-line">
      <span>{{ readableDate(today) }} {{ weekdayName(today) }}</span
      ><span
        >今日专注 <strong class="number">{{ duration(todayStats.totalMs) }}</strong></span
      >
    </div>
    <button v-if="app.focus.session" class="ongoing" @click="router.push('/focus')">
      <span class="row"
        ><span class="status-dot" /><span
          >{{ app.focus.session.title
          }}<small>{{ app.focus.session.state === 'paused' ? '已暂停' : '正在专注' }}</small></span
        ></span
      ><span class="row"
        ><span class="number">{{ duration(app.focus.elapsedMs) }}</span
        ><Icon name="right" :size="18"
      /></span>
    </button>
    <section v-for="theme in app.themes" :key="theme.id" class="theme-section">
      <header class="theme-header">
        <button class="theme-title" :aria-label="'编辑主题' + theme.name" @click="openTheme(theme)">
          <span class="theme-dot" :style="{ background: theme.color }" />
          <h2>{{ theme.name }}</h2>
        </button>
        <div class="row theme-actions">
          <button
            class="icon-button"
            :aria-label="'在' + theme.name + '下添加待办'"
            @click="openItem(theme.id)"
          >
            <Icon name="plus" :size="19" />
          </button>
          <button
            class="icon-button theme-toggle"
            :class="{ collapsed: theme.collapsed }"
            :aria-label="(theme.collapsed ? '展开主题' : '收起主题') + theme.name"
            :aria-expanded="!theme.collapsed"
            :aria-controls="'theme-items-' + theme.id"
            @click="toggleTheme(theme)"
          >
            <Icon name="down" :size="18" />
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
            >
              <button
                class="task-text"
                :aria-label="'编辑待办' + item.title"
                @click="openItem(theme.id, item)"
              >
                <h3>{{ item.title }}</h3>
                <p>
                  {{ item.mode === 'stopwatch' ? '正计时' : '倒计时 · ' + item.minutes + ' 分钟'
                  }}<span v-if="itemStats.get(item.id)?.count">
                    · 今日 {{ itemStats.get(item.id)?.count }} 次，{{
                      duration(itemStats.get(item.id)!.totalMs)
                    }}</span
                  >
                </p></button
              ><button class="start-button" :aria-label="'开始' + item.title" @click="begin(item)">
                <span class="start-icon"><Icon name="play" :size="14" /></span>
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
      <h2>给专注一个方向</h2>
      <p>创建一个主题，把常做的事情放在一起。每次想开始，随时回来。</p>
      <button class="primary" @click="openTheme()"><Icon name="plus" :size="18" />创建主题</button>
    </div>
    <button v-else class="add-theme" @click="openTheme()">
      <Icon name="plus" :size="17" />新建主题
    </button>
    <button class="free-focus secondary wide" @click="openFree">
      <Icon name="clock" :size="18" />自由专注
    </button>
    <p class="footer-note">待办一直都在，按自己的节奏来。</p>
    <Sheet
      :open="sheet === 'theme'"
      :title="app.themes.some((t) => t.id === themeForm.id) ? '编辑主题' : '新建主题'"
      @close="sheet = null"
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
              v-for="color in colors"
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
        <div v-if="app.themes.some((t) => t.id === themeForm.id)" class="row between">
          <span class="muted">调整主题顺序</span>
          <div class="row">
            <button
              type="button"
              class="icon-button soft"
              aria-label="主题上移"
              @click="app.move('theme', themeForm.id, -1)"
            >
              <Icon name="up" /></button
            ><button
              type="button"
              class="icon-button soft"
              aria-label="主题下移"
              @click="app.move('theme', themeForm.id, 1)"
            >
              <Icon name="arrowDown" />
            </button>
          </div>
        </div>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <button class="primary wide" :disabled="busy">保存主题</button
        ><button
          v-if="app.themes.some((t) => t.id === themeForm.id)"
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
      :title="app.items.some((i) => i.id === itemForm.id) ? '编辑待办' : '新建待办'"
      @close="sheet = null"
      ><form
        @submit.prevent="
          execute(() =>
            app.saveItem({
              ...itemForm,
              title: itemForm.title.trim(),
              minutes: Number(itemForm.minutes),
            }),
          )
        "
      >
        <label
          >待办名称<input
            v-model="itemForm.title"
            placeholder="例如：背单词"
            maxlength="120"
            required /></label
        ><label
          >所属主题<select v-model="itemForm.themeId">
            <option v-for="theme in app.themes" :key="theme.id" :value="theme.id">
              {{ theme.name }}
            </option>
          </select></label
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
        <fieldset>
          <legend>应用白名单</legend>
          <label class="switch"><span>跟随全局<small>每轮开始时使用最新全局名单</small></span><input type="radio" name="item-whitelist" :checked="itemForm.whitelist?.source !== 'custom'" @change="setItemWhitelist('global')" /></label>
          <label class="switch"><span>独立白名单<small>替代全局名单，不自动合并</small></span><input type="radio" name="item-whitelist" :checked="itemForm.whitelist?.source === 'custom'" @change="setItemWhitelist('custom')" /></label>
          <button v-if="itemForm.whitelist?.source === 'custom'" type="button" class="secondary wide" @click="itemWhitelistOpen = true">编辑独立白名单（{{ itemPackages.length }} 个包）</button>
          <p class="muted">独立空名单仅保留小猫与必要功能例外。保存待办后生效；本轮专注保持开始时的名单。</p>
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
        ><label
          >备注（选填）<textarea
            v-model="itemForm.note"
            placeholder="留一句提醒给自己"
            maxlength="1000"
          />
        </label>
        <div v-if="app.items.some((i) => i.id === itemForm.id)" class="row between">
          <span class="muted">调整待办顺序</span>
          <div class="row">
            <button
              type="button"
              class="icon-button soft"
              aria-label="待办上移"
              @click="app.move('item', itemForm.id, -1)"
            >
              <Icon name="up" /></button
            ><button
              type="button"
              class="icon-button soft"
              aria-label="待办下移"
              @click="app.move('item', itemForm.id, 1)"
            >
              <Icon name="arrowDown" />
            </button>
          </div>
        </div>
        <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
        <button class="primary wide" :disabled="busy">保存待办</button
        ><button
          v-if="app.items.some((i) => i.id === itemForm.id)"
          type="button"
          class="text-button danger"
          @click="deleteItem"
        >
          删除待办
        </button>
      </form></Sheet
    >
    <Sheet :open="sheet === 'free'" title="自由专注" @close="sheet = null"
      ><form
        @submit.prevent="
          execute(async () => {
            await app.start(null, freeForm.mode, Number(freeForm.minutes))
            await router.push('/focus')
          })
        "
      >
        <p class="muted">不用创建待办，现在就开始。</p>
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
    <Sheet :open="sheet === 'removeTheme'" title="删除主题" @close="sheet = null"
      ><form @submit.prevent="execute(() => app.removeTheme(themeForm.id, moveTo || null))">
        <p>删除“{{ themeForm.name }}”后，历史专注记录仍会保留。</p>
        <label
          >主题里的待办<select v-model="moveTo">
            <option value="">一并删除</option>
            <option
              v-for="theme in app.themes.filter((t) => t.id !== themeForm.id)"
              :key="theme.id"
              :value="theme.id"
            >
              移到 {{ theme.name }}
            </option>
          </select></label
        >
        <p v-if="formError" class="form-error">{{ formError }}</p>
        <button class="danger-button wide" :disabled="busy">确认删除主题</button>
      </form></Sheet
    >
  </div>
</template>
<style scoped>
.study-entry { display:flex; justify-content:space-between; margin-bottom:20px; font-size:13px; }
.daily-line {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 28px;
  gap: 8px;
}
.daily-line strong {
  font-size: 16px;
  color: var(--ink);
  margin-left: 4px;
}
.theme-section {
  margin-bottom: 18px;
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
  gap: 9px;
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 8px 4px;
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
.theme-actions {
  gap: 0;
  flex-shrink: 0;
  color: var(--muted);
}
.theme-actions .icon-button {
  transition: background-color 120ms ease;
}
.theme-toggle svg {
  transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
}
.theme-toggle.collapsed svg {
  transform: rotate(-90deg);
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
.task-text {
  min-width: 0;
  flex: 1;
  text-align: left;
  padding: 10px 0 10px 14px;
  min-height: 64px;
  border-radius: 14px 0 0 14px;
  transition: background-color 120ms ease;
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
.start-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  flex-shrink: 0;
  min-height: 48px;
  padding: 8px;
  border-radius: 0 14px 14px 0;
  transition: opacity 120ms ease;
}
.start-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: white;
  background: var(--ink);
}
.start-button svg {
  fill: currentColor;
  margin-left: 1px;
}
.theme-title:active,
.theme-actions .icon-button:active {
  opacity: 1;
  background: var(--surface);
}
.task-text:active {
  opacity: 1;
  background: var(--line);
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
  margin-bottom: 26px;
}
.task-empty {
  padding-top: 66px;
  padding-bottom: 58px;
}
.free-focus {
  margin-top: 12px;
  background: white;
  border: 1px solid var(--line);
}
.footer-note {
  font-size: 11px;
  text-align: center;
  color: #919196;
  margin-top: 20px;
}
.ongoing {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: #fff4f1;
  border-radius: 18px;
  margin-bottom: 24px;
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
</style>
