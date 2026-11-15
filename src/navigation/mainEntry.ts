import type { Router } from 'vue-router'

/** Every navigation asks the same native owner that handles Android entry intents. */
export function installMainEntryGuard(router: Router, resolve: (path: string) => Promise<string>) {
  router.beforeEach(async to => {
    const destination = await resolve(to.path)
    return destination === to.path ? true : { path: destination, replace: true }
  })
}
