import type { FourColorState, WeeklyFourColorCell } from './pet'
import { duration, readableDate } from './dates'

export interface WeeklyGridPngOptions {
  weekDates: readonly string[]
  matrix: readonly (readonly WeeklyFourColorCell[])[]
  totalMs: number
  sessionCount: number
}

const WEEKDAY_SHORT = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

const STATE_COLOR: Record<FourColorState, string> = {
  empty: '#F5F5F5',
  focus: '#222222',
  pause: '#EAEAEA',
  early: '#EF4E36',
  manual: '#D1D1D6',
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function createDiagonalHatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | string {
  const tile = document.createElement('canvas')
  tile.width = 10
  tile.height = 10
  const tctx = tile.getContext('2d')
  if (!tctx) return '#EAEAEA'
  tctx.fillStyle = '#EAEAEA'
  tctx.fillRect(0, 0, 10, 10)
  tctx.strokeStyle = '#737378'
  tctx.lineWidth = 2
  tctx.beginPath()
  tctx.moveTo(-2, 10)
  tctx.lineTo(10, -2)
  tctx.moveTo(0, 12)
  tctx.lineTo(12, 0)
  tctx.stroke()
  return ctx.createPattern(tile, 'repeat') ?? '#EAEAEA'
}

/**
 * Renders the Monday-Sunday 00:00-23:00 four-color distribution matrix onto an offscreen canvas
 * and returns a crisp PNG data URL.
 */
export function renderWeeklyGridPngDataUrl(options: WeeklyGridPngOptions): string {
  const { weekDates, matrix, totalMs, sessionCount } = options
  const width = 920
  const height = 1140
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建导出画布')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  const padX = 56
  // Header
  ctx.fillStyle = '#222222'
  ctx.font = '700 34px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.fillText('小猫专注 · 一周专注分布图', padX, 74)

  const startLabel = weekDates[0] ? readableDate(weekDates[0]) : ''
  const endLabel = weekDates[6] ? readableDate(weekDates[6]) : ''
  ctx.fillStyle = '#737378'
  ctx.font = '500 22px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
  ctx.fillText(
    `${startLabel} — ${endLabel} · 累计 ${duration(totalMs)} · ${sessionCount} 次专注`,
    padX,
    116,
  )

  const labelColW = 76
  const gridLeft = padX + labelColW
  const gridTop = 186
  const gridW = width - padX - gridLeft
  const colGap = 10
  const rowGap = 6
  const cellW = (gridW - colGap * 6) / 7
  const cellH = 28

  // Day headers
  ctx.textAlign = 'center'
  for (let d = 0; d < 7; d++) {
    const cx = gridLeft + d * (cellW + colGap) + cellW / 2
    ctx.fillStyle = '#222222'
    ctx.font = '600 20px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText(WEEKDAY_SHORT[d]!, cx, 162)
  }

  const hatchPattern = createDiagonalHatchPattern(ctx)

  // Hour rows 00:00..23:00
  for (let h = 0; h < 24; h++) {
    const y = gridTop + h * (cellH + rowGap)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#737378'
    ctx.font = '700 18px Nunito, -apple-system, sans-serif'
    ctx.fillText(`${String(h).padStart(2, '0')}:00`, gridLeft - 14, y + 20)

    for (let d = 0; d < 7; d++) {
      const x = gridLeft + d * (cellW + colGap)
      const state: FourColorState = matrix[d]?.[h]?.state ?? 'empty'
      drawRoundedRect(ctx, x, y, cellW, cellH, 6)
      ctx.fillStyle = state === 'pause' ? hatchPattern : STATE_COLOR[state]
      ctx.fill()
      if (state === 'empty') {
        ctx.strokeStyle = '#EAEAEA'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }

  // Legend
  const legendY = gridTop + 24 * (cellH + rowGap) + 34
  const legendItems: Array<{ state: FourColorState; label: string }> = [
    { state: 'focus', label: '专注' },
    { state: 'pause', label: '暂停' },
    { state: 'early', label: '提前结束' },
    { state: 'manual', label: '手动补录' },
  ]
  ctx.textAlign = 'left'
  let lx = padX
  for (const item of legendItems) {
    drawRoundedRect(ctx, lx, legendY, 24, 24, 6)
    ctx.fillStyle = item.state === 'pause' ? hatchPattern : STATE_COLOR[item.state]
    ctx.fill()
    ctx.fillStyle = '#222222'
    ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
    ctx.fillText(item.label, lx + 34, legendY + 19)
    lx += 168
  }

  return canvas.toDataURL('image/png')
}
