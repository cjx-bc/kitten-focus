<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { App as CapacitorApp } from '@capacitor/app'
import { native } from './platform/bridge'
import { useApp } from './stores/app'
import Icon from './components/Icon.vue'
const app = useApp(),
  route = useRoute(),
  router = useRouter(),
  full = computed(() => route.path === '/focus')
const tabs = [
  { path: '/tasks', label: '待办', icon: 'tasks' },
  { path: '/calendar', label: '日历', icon: 'calendar' },
  { path: '/cat', label: '小猫', icon: 'cat' },
  { path: '/statistics', label: '统计', icon: 'statistics' },
  { path: '/settings', label: '我的', icon: 'user' },
]
onMounted(async () => {
  await app.init()
  if (native) {
    await CapacitorApp.addListener('appStateChange', (state) => {
      if (state.isActive) void app.tick()
    })
    await CapacitorApp.addListener('backButton', () => {
      if (route.path === '/focus') void router.replace('/tasks')
      else if (document.querySelector('dialog[open]'))
        (document.querySelector('dialog[open]') as HTMLDialogElement).dispatchEvent(
          new Event('cancel'),
        )
      else if (route.path !== '/tasks') void router.replace('/tasks')
      else void CapacitorApp.minimizeApp()
    })
  }
})
</script>
<template>
  <div class="app-shell" :class="{ fullscreen: full }">
    <div v-if="!app.ready && !app.error" class="boot">
      <span class="wordmark">小猫专注</span>
      <p>把时间留给认真生活的自己</p>
    </div>
    <template v-else
      ><div v-if="app.error" role="alert" class="error-banner">
        {{ app.error }}<button @click="app.error = ''">关闭</button>
      </div>
      <main><RouterView /></main>
      <nav v-if="!full" class="tabbar" aria-label="主导航">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.path"
          :to="tab.path"
          :aria-current="route.path === tab.path ? 'page' : undefined"
          ><Icon :name="tab.icon" :size="25" /><span>{{ tab.label }}</span></RouterLink
        >
      </nav></template
    ><Transition name="toast"
      ><div v-if="app.toast" class="toast" role="status">{{ app.toast }}</div></Transition
    >
  </div>
</template>
