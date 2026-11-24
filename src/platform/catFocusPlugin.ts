import { registerPlugin } from '@capacitor/core'

const PLUGIN_CACHE_SYMBOL = Symbol.for('xiaomao.focus.catFocusPluginByRegistrar')

type PluginCache = WeakMap<object, Record<string, unknown>>

function getPluginCache(): PluginCache {
  const holder = globalThis as Record<symbol, PluginCache | undefined>
  let cache = holder[PLUGIN_CACHE_SYMBOL]
  if (!cache) {
    cache = new WeakMap<object, Record<string, unknown>>()
    holder[PLUGIN_CACHE_SYMBOL] = cache
  }
  return cache
}

/** Single shared Capacitor plugin proxy for CatFocus to avoid duplicate registration warnings. */
function resolveCatFocusPlugin(): Record<string, unknown> {
  const cache = getPluginCache()
  const existing = cache.get(registerPlugin)
  if (existing) return existing
  const created = registerPlugin<Record<string, unknown>>('CatFocus')
  cache.set(registerPlugin, created)
  return created
}

const catFocusPlugin = resolveCatFocusPlugin()

export function getCatFocusPlugin<T>(): T {
  return catFocusPlugin as unknown as T
}
