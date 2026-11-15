<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { protectionDriver } from '../platform/bridge'
import RecoverySheet from '../components/RecoverySheet.vue'
import Icon from '../components/Icon.vue'
const route = useRoute(), error = ref(''), recoveryOpen = ref(false)
const title = computed(() => ({ '/permissions': '权限与保护状态', '/help': '锁机帮助', '/emergency': '紧急与必要交互', '/recovery': '故障恢复' })[route.path] ?? '保护帮助')
async function authorize() {
  try { await protectionDriver.openSettings() }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
watch(() => route.path, path => { recoveryOpen.value = path === '/recovery' })
onMounted(() => { recoveryOpen.value = route.path === '/recovery' })
</script>
<template>
  <div class="page protection-help-page">
    <header class="page-header"><RouterLink to="/lock" class="icon-button" aria-label="返回锁机控制"><Icon name="back" /></RouterLink><h1>{{ title }}</h1></header>
    <template v-if="route.path === '/permissions'"><p>无障碍服务用于识别前台应用并显示应用限制页，不读取窗口正文。授权后返回应用重新检查；服务失效不会暂停本轮计时。</p><button class="secondary wide" @click="authorize">前往无障碍授权</button></template>
    <template v-else-if="route.path === '/emergency'"><p>电话、来电、紧急拨号、输入法和必要系统交互保持可用。可使用系统锁屏上的紧急呼叫入口；请按所在地与实际情况选择号码。</p><a class="secondary wide" href="tel:">打开电话拨号</a></template>
    <template v-else-if="route.path === '/recovery'"><p>恢复前先查看逐项清单；取消不操作。确认会撤销本轮保护并恢复普通入口，同一轮不会因重新打开应用或服务重连再次限制入口。锁机和严格计时继续，到期自动结束。</p><button class="secondary wide" @click="recoveryOpen = true">查看本轮恢复项目</button></template>
    <template v-else><p>锁机独立于待办和专注统计，结束后不会自动休息。普通锁机可确认后提前解除；严格锁机到期自动结束。</p><p>开启主界面限制后，本轮普通启动和业务路由都返回锁机控制页。权限、帮助、紧急和故障恢复始终可进入。设置修改仅用于下一轮，恢复不会结束严格锁机。</p></template>
    <div class="safety-links"><RouterLink to="/permissions">权限与保护状态</RouterLink><RouterLink to="/help">锁机帮助</RouterLink><RouterLink to="/emergency">紧急与必要交互</RouterLink><RouterLink to="/recovery">故障恢复</RouterLink><RouterLink to="/lock">返回锁机控制</RouterLink></div>
    <p v-if="error" role="alert" class="form-error">{{ error }}</p>
    <RecoverySheet :open="recoveryOpen" @close="recoveryOpen = false" />
  </div>
</template>
<style scoped>
.protection-help-page, .safety-links { display: grid; gap: 20px; }
p { line-height: 1.8; } .safety-links a { min-height: 44px; display: flex; align-items: center; }
</style>
