export function playLightCompletionFeedback(options: {
  sound?: boolean
  vibration?: boolean
}): void {
  if (options.vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([120, 80, 120])
    } catch {}
  }
  if (options.sound && typeof window !== 'undefined') {
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(660, now)
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.14)
      gain.gain.setValueAtTime(0.001, now)
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.onended = () => {
        void ctx.close().catch(() => {})
      }
      osc.start(now)
      osc.stop(now + 0.35)
    } catch {}
  }
}
