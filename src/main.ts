import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import './style.css'
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
  ],
})
createApp(App).use(createPinia()).use(router).mount('#app')
