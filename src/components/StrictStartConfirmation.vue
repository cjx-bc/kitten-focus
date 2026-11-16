<script setup lang="ts">
import { useApp } from '../stores/app'
import Sheet from './Sheet.vue'
import ProtectionStartSummary from './ProtectionStartSummary.vue'
const app = useApp()
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
      <ProtectionStartSummary :preferences="app.startConfirmation.protections" @settings="app.confirmStart(false)" />
      <button class="primary wide" @click="app.confirmStart(true)">开始专注</button>
      <button class="secondary wide" @click="app.confirmStart(false)">暂不开始</button>
    </div>
  </Sheet>
</template>
