import { duration } from './dates'
import { getSkinMeta, type WeekFarmSlice } from './pet'
import { getPetSpriteNodes, type SvgNode } from './petSprites'
import { roundedRectPath } from './canvasShapes'
import type { AnimalId } from './model'

function parseYmd(dateStr: string): [number, number, number] {
  const [y, m, d] = dateStr.split('-').map(Number)
  return [y || 2026, m || 1, d || 1]
}

/** Formats a natural week Monday..Sunday range concisely per docs/ux-spec.md §5.5.2. */
export function formatWeekRangeLabel(weekStartDate: string, weekEndDate: string): string {
  const [y1, m1, d1] = parseYmd(weekStartDate)
  const [y2, m2, d2] = parseYmd(weekEndDate)
  if (y1 !== y2) return `${y1} 年 ${m1} 月 ${d1} 日–${y2} 年 ${m2} 月 ${d2} 日`
  if (m1 === m2) return `${m1} 月 ${d1} 日–${d2} 日`
  return `${m1} 月 ${d1} 日–${m2} 月 ${d2} 日`
}

function resolveColor(
  raw: unknown,
  palette: { body: string; belly: string; accent: string },
): string {
  if (typeof raw !== 'string' || raw === 'none') return 'none'
  if (raw === 'var(--pet-body)') return palette.body
  if (raw === 'var(--pet-belly)') return palette.belly
  if (raw === 'var(--pet-accent)') return palette.accent
  return raw
}

function drawSvgNode(
  ctx: CanvasRenderingContext2D,
  node: SvgNode,
  palette: { body: string; belly: string; accent: string },
): void {
  const attrs = node.attrs
  const fill = resolveColor(attrs.fill ?? 'none', palette)
  const stroke = resolveColor(attrs.stroke ?? 'none', palette)
  const strokeWidth = Number(attrs['stroke-width'] ?? 2)

  ctx.save()
  if (attrs['stroke-linecap']) ctx.lineCap = attrs['stroke-linecap'] as CanvasLineCap
  if (attrs['stroke-linejoin']) ctx.lineJoin = attrs['stroke-linejoin'] as CanvasLineJoin
  ctx.lineWidth = strokeWidth

  if (node.tag === 'path' && typeof attrs.d === 'string') {
    if (typeof Path2D !== 'undefined') {
      const p = new Path2D(attrs.d)
      if (fill !== 'none') {
        ctx.fillStyle = fill
        ctx.fill(p)
      }
      if (stroke !== 'none') {
        ctx.strokeStyle = stroke
        ctx.stroke(p)
      }
    }
    ctx.restore()
    return
  }

  ctx.beginPath()
  if (node.tag === 'circle') {
    ctx.arc(Number(attrs.cx), Number(attrs.cy), Number(attrs.r), 0, Math.PI * 2)
  } else if (node.tag === 'ellipse') {
    ctx.ellipse(
      Number(attrs.cx),
      Number(attrs.cy),
      Number(attrs.rx),
      Number(attrs.ry),
      0,
      0,
      Math.PI * 2,
    )
  } else if (node.tag === 'rect') {
    const x = Number(attrs.x)
    const y = Number(attrs.y)
    const w = Number(attrs.width)
    const h = Number(attrs.height)
    const rx = Number(attrs.rx ?? 0)
    if (rx > 0) roundedRectPath(ctx, x, y, w, h, rx)
    else ctx.rect(x, y, w, h)
  }

  if (fill !== 'none') {
    ctx.fillStyle = fill
    ctx.fill()
  }
  if (stroke !== 'none') {
    ctx.strokeStyle = stroke
    ctx.stroke()
  }
  ctx.restore()
}

export function drawPetSpriteOnCanvas(
  ctx: CanvasRenderingContext2D,
  animalId: AnimalId,
  skinId: string,
  x: number,
  y: number,
  size: number,
): void {
  const skin = getSkinMeta(animalId, skinId)
  const nodes = getPetSpriteNodes(animalId, 3, skin.id)
  const palette = { body: skin.body, belly: skin.belly, accent: skin.accent }
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 120, size / 120)
  for (const node of nodes) {
    drawSvgNode(ctx, node, palette)
  }
  ctx.restore()
}

/** Renders the Weekly Farm check-in PNG card onto `canvas` and returns a `image/png` data URL. */
export function renderWeeklyFarmCard(canvas: HTMLCanvasElement, slice: WeekFarmSlice): string {
  const W = 1080
  const H = 1350
  canvas.width = W
  canvas.height = H

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法初始化画布导出环境')

  const pad = 64
  const contentW = W - pad * 2
  const fontSans = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
  const fontNum = `Nunito, ${fontSans}`

  // Clean monochrome background (#FFFFFF)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  // Header
  ctx.fillStyle = '#222222'
  ctx.textBaseline = 'top'
  ctx.textAlign = 'left'
  ctx.font = `750 48px ${fontSans}`
  ctx.fillText('一周农场', pad, 64)

  ctx.fillStyle = '#737378'
  ctx.font = `500 28px ${fontSans}`
  ctx.fillText(
    `${slice.weekStartDate.slice(0, 4)} 年 · ${formatWeekRangeLabel(slice.weekStartDate, slice.weekEndDate)}`,
    pad,
    126,
  )

  // Stat cards (#F5F5F5, radius 24)
  const cardTop = 196
  const cardGap = 24
  const cardW = (contentW - cardGap) / 2
  const cardH = 160

  for (let i = 0; i < 2; i++) {
    const cx = pad + i * (cardW + cardGap)
    roundedRectPath(ctx, cx, cardTop, cardW, cardH, 28)
    ctx.fillStyle = '#F5F5F5'
    ctx.fill()

    ctx.fillStyle = '#66666B'
    ctx.font = `500 26px ${fontSans}`
    ctx.fillText(i === 0 ? '本周养成' : '累计专注', cx + 32, cardTop + 28)

    ctx.fillStyle = '#222222'
    ctx.font = `850 46px ${fontNum}`
    const valueText =
      i === 0
        ? `${slice.weekTotalCount} 只`
        : slice.totalDurationMs > 0
          ? duration(slice.totalDurationMs)
          : '0 分钟'
    ctx.fillText(valueText, cx + 32, cardTop + 76)
  }

  // Meadow card (#F5F5F5, flat horizon line, zero gradients)
  const meadowX = pad
  const meadowY = 392
  const meadowW = contentW
  const meadowH = 810
  roundedRectPath(ctx, meadowX, meadowY, meadowW, meadowH, 32)
  ctx.fillStyle = '#F5F5F5'
  ctx.fill()
  ctx.strokeStyle = '#EAEAEA'
  ctx.lineWidth = 2
  ctx.stroke()

  // Subtle flat hill arcs (brand-spec solid strokes, 0 gradients)
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(meadowX + 36, meadowY + 210)
  ctx.quadraticCurveTo(meadowX + meadowW * 0.5, meadowY + 150, meadowX + meadowW - 36, meadowY + 210)
  ctx.strokeStyle = '#E5E5E7'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.restore()

  if (slice.instances.length === 0) {
    ctx.fillStyle = '#66666B'
    ctx.textAlign = 'center'
    ctx.font = `500 30px ${fontSans}`
    ctx.fillText('本周还没有养大的小动物', W / 2, meadowY + meadowH / 2 - 18)
  } else {
    const cols = 6
    const rows = Math.max(1, Math.ceil(slice.instances.length / cols))
    const innerX = meadowX + 48
    const innerY = meadowY + 68
    const innerW = meadowW - 96
    const innerH = meadowH - 156
    const cellW = innerW / cols
    const cellH = Math.min(128, innerH / rows)
    const petSize = Math.min(104, cellW * 0.82, cellH * 0.86)
    const totalGridH = rows * cellH
    const offsetY = innerY + Math.max(0, (innerH - totalGridH) / 2)

    slice.instances.forEach((inst, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const staggerY = col % 2 === 1 ? 10 : -6
      const px = innerX + col * cellW + (cellW - petSize) / 2
      const py = offsetY + row * cellH + (cellH - petSize) / 2 + staggerY
      drawPetSpriteOnCanvas(ctx, inst.animalId, inst.skinId, px, py, petSize)
    })

    if (slice.weekTotalCount > slice.instances.length) {
      ctx.fillStyle = '#66666B'
      ctx.textAlign = 'center'
      ctx.font = `500 24px ${fontSans}`
      ctx.fillText(
        `展示抽样 ${slice.instances.length} 只 · 本周共养成 ${slice.weekTotalCount} 只`,
        W / 2,
        meadowY + meadowH - 52,
      )
    }
  }

  // Footer
  ctx.fillStyle = '#737378'
  ctx.textAlign = 'center'
  ctx.font = `500 24px ${fontSans}`
  ctx.fillText('小猫专注 · 专注此刻，陪小猫一起长大', W / 2, H - 94)

  return canvas.toDataURL('image/png')
}
