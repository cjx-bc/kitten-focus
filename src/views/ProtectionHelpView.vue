<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useApp } from '../stores/app'
import { protectionHelpSections as sections } from '../content/protectionHelp'
import RecoverySheet from '../components/RecoverySheet.vue'
import ProtectionDiagnostics from '../components/ProtectionDiagnostics.vue'
import Icon from '../components/Icon.vue'

const route = useRoute(), app = useApp()
const title = computed(() => ({ '/permissions': '权限与保护状态', '/help': '保护帮助', '/emergency': '紧急与必要交互', '/recovery': '故障恢复' })[route.path] ?? '保护帮助')
const returnPath = computed(() => app.lock.session ? '/lock' : app.focus.session ? '/focus' : '/settings')

function goToSection(id: string) {
  const target = document.getElementById(`help-${id}`)
  target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start' })
}

onMounted(() => {
  if (route.path === '/help' && route.hash?.startsWith('#help-')) {
    const id = route.hash.slice('#help-'.length)
    goToSection(id)
  }
})
</script>
<template>
  <div class="page protection-help-page">
    <header class="page-header"><RouterLink :to="returnPath" class="icon-button" aria-label="返回当前控制或设置"><Icon name="back" /></RouterLink><h1>{{ title }}</h1></header>
    <nav class="safety-links" aria-label="保护帮助导航">
      <RouterLink to="/permissions" :aria-current="route.path === '/permissions' ? 'page' : undefined">权限状态</RouterLink>
      <RouterLink to="/help" :aria-current="route.path === '/help' ? 'page' : undefined">离线帮助</RouterLink>
      <RouterLink to="/recovery" :aria-current="route.path === '/recovery' ? 'page' : undefined">故障恢复</RouterLink>
      <RouterLink to="/emergency" :aria-current="route.path === '/emergency' ? 'page' : undefined">紧急交互</RouterLink>
    </nav>
    <ProtectionDiagnostics v-if="route.path === '/permissions'" />
    <template v-else-if="route.path === '/emergency'">
      <p>电话、来电、紧急拨号、输入法和必要系统交互保留为例外。可使用系统锁屏上的紧急呼叫入口；请按所在地与实际情况选择号码。</p>
      <p>实际可达性仍受设备、运营商和系统权限影响，模拟器测试不能代替真实通话验证。遇到保护异常，可直接进入故障恢复，不必先解除严格计时。</p>
      <a class="secondary wide" href="tel:">打开电话拨号</a>
    </template>
    <template v-else-if="route.path === '/recovery'">
      <p>恢复前先查看逐项清单；未确认前不做操作。确认撤销本轮已施加的保护后，主动撤销的能力同一轮不会因服务重连再次开启。</p>
      <p>专注与锁机计时、严格约束、名单、偏好和记录保留。未恢复或受系统限制项目会继续显示，可重试处理。</p>
      <RecoverySheet inline :open="route.path === '/recovery'" />
      <RouterLink class="secondary wide" to="/permissions">查看逐项状态与失败原因</RouterLink>
    </template>
    <template v-else>
      <p class="muted">这些正文随应用提供，无需联网。实际支持与保护效果请到权限页逐项检查。</p>
      <nav class="help-contents" aria-label="帮助目录"><a v-for="section in sections" :key="section.id" :href="`#help-${section.id}`" @click.prevent="goToSection(section.id)">{{ section.title }}</a></nav>
      <section v-for="section in sections" :id="`help-${section.id}`" :key="section.id" class="help-section" tabindex="-1">
        <h2>{{ section.title }}</h2>
        <p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p>
        <div v-if="section.steps?.length" class="brand-steps" data-ux-card>
          <div v-for="step in section.steps" :key="step.brand" class="brand-step">
            <strong>{{ step.brand }}</strong>
            <span>{{ step.path }}</span>
          </div>
        </div>
      </section>
      <RouterLink class="secondary wide" to="/recovery">查看本轮恢复清单</RouterLink>
    </template>
    <RouterLink :to="returnPath" class="secondary wide">{{ app.lock.session ? '返回锁机控制' : app.focus.session ? '返回专注计时' : '返回我的' }}</RouterLink>
  </div>
</template>
<style scoped>
.protection-help-page { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; padding-bottom: 36px; }
.page-header { gap: 10px; margin-bottom: 0; }
.page-header h1 { flex: 1; font-size: 25px; }
p { font-size: 14px; line-height: 1.9; overflow-wrap: anywhere; }
.safety-links { display: flex; flex-wrap: nowrap; gap: 16px; overflow-x: auto; max-width: 100%; min-width: 0; border-bottom: 1px solid var(--line); padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
.safety-links a { flex-shrink: 0; white-space: nowrap; }
.safety-links a, .help-contents a { min-height: 48px; min-width: 48px; display: flex; align-items: center; font-size: 13px; }
.safety-links a[aria-current='page'] { font-weight: 700; text-decoration: underline; text-underline-offset: 6px; }
.help-contents { display: grid; padding: 10px 18px; background: var(--surface); border-radius: var(--radius); }
.help-section { display: grid; gap: 14px; scroll-margin-top: 24px; }
.help-section h2 { font-size: 19px; line-height: 1.6; }
.help-section:focus { outline: 2px solid var(--focus); outline-offset: 8px; border-radius: 4px; }
.brand-steps { background: var(--surface); border-radius: var(--radius); padding: 4px 18px; }
.brand-step { display: grid; gap: 4px; padding: 12px 0; border-bottom: 1px solid var(--line); font-size: 13px; line-height: 1.65; }
.brand-step:last-child { border-bottom: 0; }
.brand-step span { color: var(--muted-surface); }
.protection-help-page :deep(a.secondary.wide), .protection-help-page :deep(button.secondary.wide), .protection-help-page :deep(button.primary.wide) { min-height: 48px; min-width: 48px; }
</style>
