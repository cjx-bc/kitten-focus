import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './style.css'
import { resolveMainEntry } from './platform/bridge'
import { installMainEntryGuard, isStudySessionLocked } from './navigation/mainEntry'
import { useApp } from './stores/app'

const pinia = createPinia()
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/tasks' },
    { path: '/tasks', component: () => import('./views/TasksView.vue') },
    { path: '/calendar', component: () => import('./views/CalendarView.vue') },
    { path: '/cat', component: () => import('./views/CatView.vue') },
    { path: '/statistics', component: () => import('./views/StatisticsView.vue') },
    { path: '/settings', component: () => import('./views/SettingsView.vue') },
    { path: '/focus', component: () => import('./views/FocusView.vue') },
    { path: '/rest', component: () => import('./views/RestView.vue') },
    { path: '/lock', component: () => import('./views/LockView.vue') },
    ...['permissions', 'help', 'emergency', 'recovery'].map(section => ({ path: `/${section}`, component: () => import('./views/ProtectionHelpView.vue') })),
  ],
})
installMainEntryGuard(
  router,
  resolveMainEntry,
  () => isStudySessionLocked(useApp(pinia).focus.session),
)
createApp(App).use(pinia).use(router).mount('#app')
