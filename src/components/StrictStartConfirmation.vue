<script setup lang="ts">
import { ref, watch } from 'vue'
import { useApp } from '../stores/app'
import { native } from '../platform/bridge'
import Sheet from './Sheet.vue'
import ProtectionStartSummary from './ProtectionStartSummary.vue'
const app = useApp()
const unreadyIds = ref<string[]>([])
watch(() => app.startConfirmation, () => { unreadyIds.value = [] })
</script>
<template>
  <Sheet v-if="app.startConfirmation" title="开始专注" @close="app.confirmStart(false)">
    <div class="stack">
      <p>{{ app.startConfirmation.title }}</p>
      <template v-if="app.startConfirmation.strict && app.startConfirmation.mode === 'countdown'">
        <p>
          <strong>严格倒计时 · {{ app.startConfirmation.minutes }} 分钟</strong>
        </p>
        <p class="notice">开始后不可暂停或提前结束，故障恢复也不会结束计时。</p>
      </template>
      <template v-else-if="app.startConfirmation.strict">
        <p><strong>正计时 · 严格模式不适用</strong></p>
      </template>
      <template v-else>
        <p>
          <strong
            >{{ app.startConfirmation.mode === 'countdown' ? '倒计时' : '正计时' }} ·
            普通专注</strong
          >
        </p>
      </template>
      <template v-if="app.startConfirmation.study">
        <p><strong>学霸模式 · {{ app.startConfirmation.whitelistSource === 'custom' ? '子待办独立白名单' : '跟随全局白名单' }}</strong></p>
        <p>
          已选
          {{
            app.startConfirmation.whitelistCount
          }}
          个应用。暂停期间仍限制名单外应用。
        </p>
      </template>
      <p v-if="!app.startConfirmation.study && app.startConfirmation.protections.interceptNotifications" class="field-help">通知白名单 · {{ app.startConfirmation.whitelistCount }} 个应用</p>
      <ProtectionStartSummary :preferences="app.startConfirmation.protections" @settings="app.confirmStart(false)" @unready="unreadyIds = $event" />
      <p v-if="native && unreadyIds.length" role="alert" class="field-help">存在未授权或本机不支持的保护项，直接开始会被原生检查拦截。</p>
      <button v-if="native && unreadyIds.length" type="button" class="secondary wide" @click="app.clearUnreadyProtections(unreadyIds)">关闭未就绪项后重新开始</button>
      <button class="primary wide" @click="app.confirmStart(true)">开始专注</button>
      <button class="secondary wide" @click="app.confirmStart(false)">暂不开始</button>
    </div>
  </Sheet>
</template>
