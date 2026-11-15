import { expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { installMainEntryGuard } from '../src/navigation/mainEntry'

it('guards ordinary navigation including hash-like direct entries but keeps named safety destinations reachable', async () => {
  let restricted = true
  const decide = vi.fn(async (path: string) => restricted && !['/lock', '/permissions', '/help', '/emergency', '/recovery'].includes(path) ? '/lock' : path)
  const paths = ['/tasks', '/statistics', '/settings', '/lock', '/permissions', '/help', '/emergency', '/recovery']
  const router = createRouter({ history: createMemoryHistory(), routes: paths.map(path => ({ path, component: {} })) })
  installMainEntryGuard(router, decide)
  for (const path of ['/tasks', '/statistics', '/settings']) {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe('/lock')
  }
  for (const path of ['/permissions', '/help', '/emergency', '/recovery']) {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe(path)
  }
  restricted = false
  for (const path of ['/tasks', '/statistics', '/settings']) {
    await router.push(path)
    expect(router.currentRoute.value.path).toBe(path)
  }
  expect(decide).toHaveBeenCalledWith('/statistics')
})
