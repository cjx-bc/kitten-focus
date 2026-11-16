<script setup lang="ts">
import { useApp } from '../stores/app'
import Sheet from './Sheet.vue'
import ProtectionStartSummary from './ProtectionStartSummary.vue'
const app = useApp()
</script>
<template>
  <Sheet v-if="app.startConfirmation" title="本轮专注规则" @close="app.confirmStart(false)">
    <div class="stack">
      <p>{{ app.startConfirmation.title }}</p>
      <template v-if="app.startConfirmation.strict && app.startConfirmation.mode === 'countdown'">
        <p>
          <strong>严格倒计时 · {{ app.startConfirmation.minutes }} 分钟</strong>
        </p>
        <p class="notice">开始后不能暂停、取消或提前结束，到期后正常记录并进入 5 分钟休息。</p>
        <p class="field-help">
          返回待办、锁屏或重新打开应用会继续本轮计时。修改严格开关只影响下一轮；帮助和故障恢复仍可进入。
        </p>
      </template>
      <template v-else-if="app.startConfirmation.strict">
        <p><strong>正计时 · 严格模式不适用</strong></p>
        <p class="notice">本轮仍是正计时，可以暂停和手动结束。正常结束后进入 5 分钟休息。</p>
      </template>
      <template v-else>
        <p>
          <strong
            >{{ app.startConfirmation.mode === 'countdown' ? '倒计时' : '正计时' }} ·
            普通专注</strong
          >
        </p>
        <p class="field-help">本轮可以暂停和手动结束。</p>
      </template>
      <template v-if="app.startConfirmation.study">
        <p><strong>学霸模式 · {{ app.startConfirmation.whitelistSource === 'custom' ? '子待办独立白名单' : '跟随全局白名单' }}</strong></p>
        <p>
          已选
          {{
            app.startConfirmation.whitelistCount
          }}
          个应用；小猫专注固定允许，必要系统交互保留。暂停计时期间仍限制应用。
        </p>
        <p class="field-help">
          开始时需要无障碍授权和服务连接。缺少能力会停止开始并说明原因，不会静默降低保护。
        </p>
      </template>
      <p class="field-help">严格模式只约束倒计时，不会自动开启应用限制或申请系统权限。</p>
      <p v-if="!app.startConfirmation.study" class="field-help">本轮通知名单：{{ app.startConfirmation.whitelistSource === 'custom' ? '子待办独立白名单' : '跟随全局白名单' }} · {{ app.startConfirmation.whitelistCount }} 个自选应用。开始后本轮名单固定。</p>
      <ProtectionStartSummary :preferences="app.startConfirmation.protections" @settings="app.confirmStart(false)" />
      <button class="primary wide" @click="app.confirmStart(true)">按此规则开始</button>
      <button class="secondary wide" @click="app.confirmStart(false)">暂不开始</button>
    </div>
  </Sheet>
</template>
