type SwipeOptions = {
  paths: readonly string[]
  currentPath: () => string
  isBlocked: () => boolean
  navigate: (path: string) => void
}

type Gesture = {
  id: number
  x: number
  y: number
  startedAt: number
  path: string
  horizontal: boolean
}

/** Switch tabs on release, without moving the page or changing vertical scrolling. */
export function createTabSwipe(options: SwipeOptions) {
  let gesture: Gesture | null = null
  const reset = () => {
    gesture = null
  }
  const blocked = () =>
    options.isBlocked() ||
    !options.paths.includes(options.currentPath()) ||
    !!document.querySelector('dialog[open], [aria-modal="true"]')

  function start(event: TouchEvent) {
    reset()
    if (blocked() || event.touches.length !== 1) return
    const target = event.target
    if (
      target instanceof Element &&
      target.closest(
        'input, textarea, select, canvas, [contenteditable]:not([contenteditable="false"]), [role="slider"], [data-tab-swipe-ignore]',
      )
    )
      return
    // Leave Android's screen-edge back gesture to the system.
    const touch = event.touches[0]!
    if (touch.clientX < 24 || touch.clientX > innerWidth - 24) return
    if (target instanceof Element) {
      for (let element: Element | null = target; element; element = element.parentElement) {
        if (
          element.scrollWidth > element.clientWidth + 1 &&
          /auto|scroll/.test(getComputedStyle(element).overflowX)
        )
          return
        if (element === event.currentTarget) break
      }
    }
    gesture = {
      id: touch.identifier,
      x: touch.clientX,
      y: touch.clientY,
      startedAt: performance.now(),
      path: options.currentPath(),
      horizontal: false,
    }
  }

  function move(event: TouchEvent) {
    if (!gesture) return
    if (blocked() || event.touches.length !== 1 || options.currentPath() !== gesture.path) {
      reset()
      return
    }
    const touch = Array.from(event.touches).find((touch) => touch.identifier === gesture!.id)
    if (!touch) return reset()
    const x = Math.abs(touch.clientX - gesture.x),
      y = Math.abs(touch.clientY - gesture.y)
    if (!gesture.horizontal) {
      if (Math.max(x, y) < 10) return
      // A gesture that begins vertically stays a scroll, even if it later curves sideways.
      if (x <= y * 1.5) return reset()
      gesture.horizontal = true
    }
    if (event.cancelable) event.preventDefault()
  }

  function end(event: TouchEvent) {
    const finished = gesture
    reset()
    if (
      !finished?.horizontal ||
      blocked() ||
      event.touches.length ||
      options.currentPath() !== finished.path ||
      performance.now() - finished.startedAt > 800
    )
      return
    const touch = Array.from(event.changedTouches).find((touch) => touch.identifier === finished.id)
    if (!touch) return
    const x = touch.clientX - finished.x,
      y = touch.clientY - finished.y
    if (Math.abs(x) < 60 || Math.abs(x) <= Math.abs(y) * 1.5) return
    const index = options.paths.indexOf(finished.path),
      destination = options.paths[index + (x < 0 ? 1 : -1)]
    if (destination) {
      if (event.cancelable) event.preventDefault()
      options.navigate(destination)
    }
  }

  return { start, move, end, reset }
}
