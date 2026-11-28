import type { AnimalId } from './model'

export type PetStage = 'standby' | 1 | 2 | 3 | 'failed'
export type CorePetStage = 1 | 2 | 3 | 'failed'

export interface SvgNode {
  tag: 'path' | 'circle' | 'ellipse' | 'rect' | 'line' | 'polygon'
  attrs: Record<string, string | number>
}

const INK = '#222222'
const WHITE = '#FFFFFF'
const SHADOW = '#00000014'
const BODY = 'var(--pet-body)'
const BELLY = 'var(--pet-belly)'
const ACCENT = 'var(--pet-accent)'

const shadow = (cy: number, rx = 30, ry = 6): SvgNode => ({
  tag: 'ellipse',
  attrs: { cx: 60, cy, rx, ry, fill: SHADOW },
})

const circle = (
  cx: number,
  cy: number,
  r: number,
  fill: string,
  stroke?: string,
  strokeWidth = 2.2,
): SvgNode => ({
  tag: 'circle',
  attrs: stroke ? { cx, cy, r, fill, stroke, 'stroke-width': strokeWidth } : { cx, cy, r, fill },
})

const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  stroke?: string,
  strokeWidth = 2.2,
): SvgNode => ({
  tag: 'ellipse',
  attrs: stroke ? { cx, cy, rx, ry, fill, stroke, 'stroke-width': strokeWidth } : { cx, cy, rx, ry, fill },
})

const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  rx = 0,
  stroke?: string,
  strokeWidth = 2,
): SvgNode => ({
  tag: 'rect',
  attrs: stroke
    ? { x, y, width, height, rx, fill, stroke, 'stroke-width': strokeWidth }
    : { x, y, width, height, rx, fill },
})

const path = (
  d: string,
  fill: string,
  stroke?: string,
  strokeWidth = 2.5,
  extra: Record<string, string | number> = {},
): SvgNode => ({
  tag: 'path',
  attrs: {
    d,
    fill,
    ...(stroke ? { stroke, 'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } : {}),
    ...extra,
  },
})

function bigEyes(lx: number, rx: number, y: number, r = 7.5, pr = 3.8): SvgNode[] {
  return [
    circle(lx, y, r, WHITE, INK, 1.6),
    circle(rx, y, r, WHITE, INK, 1.6),
    circle(lx + 1.5, y, pr, INK),
    circle(rx - 1.5, y, pr, INK),
  ]
}

function xEyes(lx: number, rx: number, y: number, r = 7): SvgNode[] {
  const s = Math.max(2.6, r * 0.42)
  return [
    circle(lx, y, r, WHITE, INK, 1.6),
    circle(rx, y, r, WHITE, INK, 1.6),
    path(
      `M${lx - s} ${y - s} L${lx + s} ${y + s} M${lx + s} ${y - s} L${lx - s} ${y + s} ` +
        `M${rx - s} ${y - s} L${rx + s} ${y + s} M${rx + s} ${y - s} L${rx - s} ${y + s}`,
      'none',
      INK,
      2,
    ),
  ]
}

function dizzySwirl(y = 18): SvgNode {
  return path(`M52 ${y} Q60 ${y - 7} 68 ${y} Q72 ${y + 6} 62 ${y + 8} Q55 ${y + 8} 58 ${y + 3}`, 'none', ACCENT, 2.5)
}

function blackCatSkinMarkings(stage: CorePetStage, skinId: string): SvgNode[] {
  if (skinId === 'cow') {
    if (stage === 1) return [path('M37 56 Q48 48 53 60 Q45 68 34 64 Z', INK)]
    if (stage === 2) return [path('M39 42 Q50 35 55 47 Q46 55 37 49 Z', INK), ellipse(72, 82, 7, 9, INK)]
    if (stage === 3) return [path('M36 42 Q48 34 54 46 Q46 56 35 50 Z', INK), ellipse(73, 84, 8, 10, INK)]
    return [path('M38 66 Q49 60 54 71 Q45 79 36 74 Z', INK)]
  }
  if (skinId === 'siamese') {
    if (stage === 1) return [ellipse(60, 71, 14, 10, BELLY)]
    if (stage === 2) return [ellipse(60, 56, 14, 10, BELLY)]
    if (stage === 3) return [ellipse(60, 54, 16, 12, BELLY)]
    return [ellipse(60, 72, 15, 10, BELLY)]
  }
  return []
}

function catStageNodes(
  stage: CorePetStage,
  opts: {
    skinId?: string
    tabby?: boolean
    lickingPaw?: boolean
    angelStage?: boolean
  } = {},
): SvgNode[] {
  const { skinId = 'default', tabby = false, lickingPaw = false, angelStage = false } = opts
  const markings = blackCatSkinMarkings(stage, skinId)

  if (stage === 1) {
    return [
      shadow(98, 28),
      path('M36 48 L42 32 L52 44 M84 48 L78 32 L68 44', BODY, INK, 2.5),
      circle(60, 68, 27, BODY, INK, 2.3),
      ellipse(60, 78, 14, 10, BELLY),
      ...markings,
      ...(tabby
        ? [
            path('M54 47 L56 54 M60 45 L60 54 M66 47 L64 54', 'none', '#9c5218', 2.2),
            path('M38 66 L44 68 M82 66 L76 68', 'none', '#9c5218', 2),
          ]
        : []),
      ...(angelStage ? [path('M61 45 L56 53 L62 53 L58 60', 'none', ACCENT, 2.4)] : []),
      ...bigEyes(49, 71, 65, 7, 3.4),
      circle(60, 74, 2.3, ACCENT),
    ]
  }

  if (stage === 2) {
    return [
      shadow(102, 30),
      path('M82 88 Q96 84 94 70', 'none', BODY === 'var(--pet-body)' ? INK : BODY, 7),
      ...(tabby ? [path('M82 88 Q96 84 94 70', 'none', BODY, 5)] : []),
      ...(angelStage
        ? [
            path('M38 72 Q22 60 26 78 Q31 86 40 82 Z', BELLY, INK, 2),
            path('M82 72 Q98 60 94 78 Q89 86 80 82 Z', BELLY, INK, 2),
          ]
        : []),
      ellipse(60, 80, 24, 21, BODY, INK, 2.3),
      ellipse(60, 84, 13, 12, BELLY),
      path('M34 48 L36 24 L52 38 Z M86 48 L84 24 L68 38 Z', BODY, INK, 2.5),
      circle(60, 52, 24, BODY, INK, 2.3),
      ...markings,
      ...(tabby
        ? [
            path('M54 32 L56 39 M60 30 L60 39 M66 32 L64 39', 'none', '#9c5218', 2.2),
            path('M38 52 L44 53 M82 52 L76 53', 'none', '#9c5218', 2),
          ]
        : []),
      rect(46, 70, 28, 4, ACCENT, 2),
      circle(60, 75, 3.2, angelStage ? ACCENT : WHITE, INK, 1.5),
      ...bigEyes(49, 71, 51, 7.5, 3.8),
      ...(lickingPaw
        ? [
            ellipse(54, 62, 6, 4.5, BODY, INK, 1.8),
            path('M58 58 Q61 63 64 58', 'none', ACCENT, 2),
          ]
        : [path('M56 59 Q60 62 64 59', 'none', skinId === 'cow' ? INK : WHITE, 1.8)]),
    ]
  }

  if (stage === 3) {
    return [
      shadow(105, 34),
      ...(angelStage
        ? [
            path('M42 15 Q60 8 78 15', 'none', '#ef4e36', 3),
            path('M44 19 Q60 12 76 19', 'none', '#e7a54a', 2.5),
            path('M46 23 Q60 17 74 23', 'none', '#a08bb0', 2.2),
            path('M36 68 Q12 46 16 74 Q22 88 38 84 Z', BELLY, INK, 2.2),
            path('M84 68 Q108 46 104 74 Q98 88 82 84 Z', BELLY, INK, 2.2),
          ]
        : []),
      path('M82 90 Q104 82 98 54 Q95 44 88 48', 'none', tabby ? '#c47926' : INK, 8),
      path(
        'M36 96 C34 72 44 62 60 62 C76 62 86 72 84 96 C84 102 74 104 60 104 C46 104 36 102 36 96 Z',
        BODY,
        INK,
        2.3,
      ),
      ellipse(60, 86, tabby ? 17 : 13, tabby ? 15 : 13, BELLY),
      path('M32 46 L31 18 L52 33 Z M88 46 L89 18 L68 33 Z', BODY, INK, 2.5),
      ellipse(60, 49, tabby ? 29 : 27, 23, BODY, INK, 2.3),
      ...markings,
      ...(tabby
        ? [
            path('M54 29 L56 36 M60 28 L60 36 M66 29 L64 36', 'none', '#9c5218', 2.2),
            path('M35 49 L42 50 M85 49 L78 50', 'none', '#9c5218', 2),
          ]
        : []),
      ...bigEyes(48, 72, 48, 8.2, 4),
      rect(44, 68, 32, 4.5, ACCENT, 2.2),
      circle(60, 74, 3.6, angelStage ? ACCENT : WHITE, INK, 1.5),
      ellipse(49, 100, 6.5, 4, BODY, INK, 1.8),
      ellipse(71, 100, 6.5, 4, BODY, INK, 1.8),
    ]
  }

  return [
    shadow(104, 34),
    dizzySwirl(16),
    ...(angelStage
      ? [
          path('M38 30 Q54 24 68 34', 'none', '#a08bb0', 2.4),
          path('M36 74 Q16 64 20 84 Q28 92 38 86 Z', BELLY, INK, 2),
          path('M84 74 Q104 64 100 84 Q92 92 82 86 Z', BELLY, INK, 2),
        ]
      : []),
    ellipse(60, 80, 26, 20, BODY, INK, 2.3),
    ellipse(60, 78, 13, 10, BELLY),
    path('M36 80 L32 101 L50 92 Z M84 80 L88 101 L70 92 Z', BODY, INK, 2.5),
    ...markings,
    ellipse(44, 54, 6, 9, BODY, INK, 2),
    ellipse(76, 54, 6, 9, BODY, INK, 2),
    ...xEyes(49, 71, 74, 7),
    path('M55 84 Q60 80 65 84', 'none', ACCENT, 2.2),
  ]
}

function yellowChickNodes(stage: CorePetStage): SvgNode[] {
  if (stage === 1) {
    return [
      shadow(100, 28),
      circle(60, 56, 24, BODY, INK, 2.5),
      ...bigEyes(50, 70, 54, 6.8, 3.3),
      path('M56 62 L60 67 L64 62 Z', ACCENT, INK, 1.8),
      path('M34 68 L42 62 L50 70 L60 62 L70 70 L78 62 L86 68 C86 88 76 100 60 100 C44 100 34 88 34 68 Z', WHITE, INK, 2.5),
    ]
  }
  if (stage === 2) {
    return [
      shadow(102, 28),
      path('M58 34 Q54 21 63 24 Q67 16 70 28 Q64 31 62 34', 'none', BODY, 4),
      path('M58 34 Q54 21 63 24 Q67 16 70 28', 'none', INK, 2.2),
      ellipse(32, 72, 7, 11, BODY, INK, 2.2),
      ellipse(88, 72, 7, 11, BODY, INK, 2.2),
      circle(60, 68, 27, BODY, INK, 2.5),
      ellipse(60, 78, 15, 11, BELLY),
      ...bigEyes(49, 71, 63, 7.2, 3.6),
      path('M55 71 L60 77 L65 71 Z', ACCENT, INK, 1.8),
      path('M48 95 L45 101 M52 95 L53 101 M68 95 L67 101 M72 95 L75 101', 'none', ACCENT, 2.4),
    ]
  }
  if (stage === 3) {
    return [
      shadow(105, 32),
      path('M49 30 C49 20 56 20 58 26 C60 18 68 19 67 27 C72 22 76 28 71 33 Z', ACCENT, INK, 2),
      ellipse(31, 70, 8, 13, BODY, INK, 2.3),
      ellipse(89, 70, 8, 13, BODY, INK, 2.3),
      path('M35 76 C34 45 45 31 60 31 C75 31 86 45 85 76 C85 93 74 98 60 98 C46 98 35 93 35 76 Z', BODY, INK, 2.5),
      ellipse(60, 78, 17, 13, BELLY),
      ...bigEyes(49, 71, 55, 7.6, 3.8),
      path('M55 63 L60 70 L65 63 Z', ACCENT, INK, 1.8),
      path('M49 97 L44 104 M49 97 L52 104 M71 97 L68 104 M71 97 L76 104', 'none', ACCENT, 2.6),
    ]
  }
  return [
    shadow(104, 32),
    dizzySwirl(16),
    path('M50 96 C50 104 56 104 58 98 C60 105 68 104 67 97 Z', ACCENT, INK, 2),
    ellipse(60, 72, 26, 23, BODY, INK, 2.5),
    ellipse(60, 68, 15, 11, BELLY),
    path('M48 48 L44 41 M51 48 L54 41 M72 48 L68 41 M70 48 L76 41', 'none', ACCENT, 2.4),
    ...xEyes(49, 71, 74, 7),
    path('M56 64 L60 58 L64 64 Z', ACCENT, INK, 1.8),
  ]
}

function whiteGooseNodes(stage: CorePetStage): SvgNode[] {
  if (stage === 1) {
    return [
      shadow(99, 28),
      circle(60, 68, 26, BODY, INK, 2.5),
      ellipse(60, 76, 15, 11, BELLY),
      ...bigEyes(49, 71, 63, 7, 3.4),
      ellipse(60, 73, 7, 4, ACCENT, INK, 1.8),
    ]
  }
  if (stage === 2) {
    return [
      shadow(103, 31),
      ellipse(58, 78, 25, 19, BODY, INK, 2.5),
      path('M48 64 C46 46 50 34 60 34 C70 34 74 44 72 64', BODY, INK, 2.5),
      ellipse(58, 78, 14, 10, BELLY),
      ...bigEyes(53, 67, 47, 6.4, 3.2),
      ellipse(68, 54, 8.5, 4.2, ACCENT, INK, 1.8),
      path('M48 96 L44 103 L53 103 Z M68 96 L64 103 L73 103 Z', ACCENT, INK, 1.8),
    ]
  }
  if (stage === 3) {
    return [
      shadow(105, 34),
      path('M40 60 C34 60 32 76 34 86 C36 95 48 98 62 98 C78 98 86 90 86 76 C86 64 76 58 66 58 L66 36 C66 24 58 20 50 22 C43 24 41 32 42 44 Z', BODY, INK, 2.5),
      path('M50 74 Q66 72 74 84', 'none', INK, 2),
      ellipse(53, 35, 6.2, 6.2, WHITE, INK, 1.6),
      circle(54.5, 35, 3, INK),
      ellipse(38, 37, 8.5, 4.2, ACCENT, INK, 1.8),
      path('M41 53 Q55 58 68 53 L71 61 Q56 66 40 61 Z', ACCENT, INK, 2),
      path('M64 60 L78 72 L70 76 L58 63 Z', ACCENT, INK, 2),
      path('M50 98 L44 105 L54 105 Z M68 98 L62 105 L72 105 Z', ACCENT, INK, 1.8),
    ]
  }
  return [
    shadow(104, 34),
    dizzySwirl(18),
    ellipse(60, 78, 28, 18, BODY, INK, 2.5),
    path('M42 74 Q60 66 78 74 L76 81 Q60 75 44 81 Z', ACCENT, INK, 2),
    ...xEyes(50, 70, 68, 6.5),
    ellipse(60, 77, 7, 3.8, ACCENT, INK, 1.8),
    path('M44 58 L40 50 L49 52 Z M76 58 L80 50 L71 52 Z', ACCENT, INK, 1.8),
  ]
}

function pixelBirdNodes(stage: CorePetStage): SvgNode[] {
  if (stage === 1) {
    return [
      shadow(101, 26),
      rect(44, 36, 32, 8, WHITE, 0, INK, 2),
      rect(36, 44, 48, 44, WHITE, 0, INK, 2.5),
      rect(44, 88, 32, 8, WHITE, 0, INK, 2),
      rect(36, 56, 48, 16, BODY, 0, INK, 2),
      rect(44, 58, 10, 10, WHITE, 0, INK, 1.5),
      rect(48, 61, 4, 4, INK),
      rect(66, 58, 10, 10, WHITE, 0, INK, 1.5),
      rect(68, 61, 4, 4, INK),
      rect(56, 68, 8, 6, ACCENT),
    ]
  }
  if (stage === 2) {
    return [
      shadow(102, 28),
      rect(52, 28, 8, 8, BODY, 0, INK, 2),
      rect(60, 32, 8, 6, BODY, 0, INK, 2),
      rect(36, 38, 48, 46, BODY, 0, INK, 2.5),
      rect(44, 62, 32, 20, BELLY),
      rect(44, 48, 12, 12, WHITE, 0, INK, 1.8),
      rect(64, 48, 12, 12, WHITE, 0, INK, 1.8),
      rect(49, 52, 5, 5, INK),
      rect(66, 52, 5, 5, INK),
      rect(56, 60, 8, 6, ACCENT, 0, INK, 1.6),
      rect(46, 84, 6, 12, ACCENT),
      rect(68, 84, 6, 12, ACCENT),
    ]
  }
  if (stage === 3) {
    return [
      shadow(105, 32),
      rect(50, 22, 8, 8, ACCENT, 0, INK, 2),
      rect(58, 26, 8, 6, BODY, 0, INK, 2),
      rect(80, 60, 12, 12, BODY, 0, INK, 2),
      rect(86, 54, 10, 8, BODY, 0, INK, 2),
      rect(34, 34, 50, 52, BODY, 0, INK, 2.5),
      rect(26, 50, 10, 22, BODY, 0, INK, 2),
      rect(44, 62, 32, 22, BELLY),
      rect(64, 56, 14, 16, BODY, 0, INK, 2),
      rect(42, 44, 12, 12, WHITE, 0, INK, 1.8),
      rect(60, 44, 12, 12, WHITE, 0, INK, 1.8),
      rect(47, 48, 5, 5, INK),
      rect(62, 48, 5, 5, INK),
      rect(30, 54, 12, 8, ACCENT, 0, INK, 1.6),
      rect(46, 86, 6, 12, ACCENT),
      rect(42, 94, 10, 4, ACCENT),
      rect(66, 86, 6, 12, ACCENT),
      rect(62, 94, 10, 4, ACCENT),
    ]
  }
  return [
    shadow(104, 32),
    rect(52, 14, 16, 4, ACCENT),
    rect(64, 18, 4, 8, ACCENT),
    rect(56, 22, 8, 4, ACCENT),
    rect(36, 46, 48, 44, BODY, 0, INK, 2.5),
    rect(44, 48, 32, 18, BELLY),
    rect(42, 66, 12, 12, WHITE, 0, INK, 1.8),
    rect(66, 66, 12, 12, WHITE, 0, INK, 1.8),
    path('M45 69 L51 75 M51 69 L45 75 M69 69 L75 75 M75 69 L69 75', 'none', INK, 2),
    rect(56, 58, 8, 6, ACCENT, 0, INK, 1.6),
    rect(46, 36, 6, 10, ACCENT),
    rect(68, 36, 6, 10, ACCENT),
  ]
}

function patchBearNodes(stage: CorePetStage): SvgNode[] {
  if (stage === 1) {
    return [
      shadow(99, 28),
      circle(38, 46, 10, BODY, INK, 2.2),
      circle(82, 46, 10, BODY, INK, 2.2),
      circle(60, 68, 27, BODY, INK, 2.3),
      ellipse(60, 75, 11, 8, BELLY),
      ...bigEyes(49, 71, 63, 7, 3.4),
      ellipse(60, 72, 4, 2.8, INK),
    ]
  }
  if (stage === 2) {
    return [
      shadow(103, 30),
      ellipse(60, 80, 24, 21, BODY, INK, 2.3),
      ellipse(60, 84, 13, 12, BELLY),
      circle(38, 33, 10, BODY, INK, 2.2),
      circle(82, 33, 10, BODY, INK, 2.2),
      circle(60, 51, 24, BODY, INK, 2.3),
      ellipse(60, 58, 10, 7.5, BELLY),
      ...bigEyes(49, 71, 48, 7, 3.5),
      ellipse(60, 55, 3.8, 2.6, INK),
      ellipse(47, 98, 7, 5, BODY, INK, 2),
      ellipse(73, 98, 7, 5, BODY, INK, 2),
    ]
  }
  if (stage === 3) {
    return [
      shadow(105, 34),
      path('M35 94 C34 70 44 62 60 62 C76 62 86 70 85 94 C85 102 74 104 60 104 C46 104 35 102 35 94 Z', BODY, INK, 2.3),
      ellipse(60, 86, 14, 13, BELLY),
      circle(36, 30, 11, BODY, INK, 2.2),
      circle(84, 30, 11, BODY, INK, 2.2),
      circle(36, 30, 5, BELLY),
      circle(84, 30, 5, BELLY),
      ellipse(60, 49, 27, 23, BODY, INK, 2.3),
      ellipse(60, 56, 11, 8, BELLY),
      ellipse(60, 53, 4, 2.8, INK),
      circle(72, 47, 8, WHITE, INK, 1.6),
      circle(70.5, 47, 3.8, INK),
      // Red-star eyepatch
      path('M36 37 L84 55', 'none', BELLY, 2.4),
      circle(48, 46, 9, '#111111', WHITE, 1.4),
      path('M48 40 L49.8 44.2 L54 44.6 L50.8 47.4 L51.8 51.6 L48 49.4 L44.2 51.6 L45.2 47.4 L42 44.6 L46.2 44.2 Z', ACCENT),
      ellipse(48, 100, 7.5, 5, BODY, INK, 2),
      ellipse(72, 100, 7.5, 5, BODY, INK, 2),
    ]
  }
  return [
    shadow(104, 34),
    dizzySwirl(16),
    ellipse(60, 78, 26, 21, BODY, INK, 2.3),
    ellipse(60, 76, 13, 10, BELLY),
    circle(39, 95, 9, BODY, INK, 2),
    circle(81, 95, 9, BODY, INK, 2),
    ellipse(44, 53, 6, 9, BODY, INK, 2),
    ellipse(76, 53, 6, 9, BODY, INK, 2),
    circle(48, 72, 8.5, '#111111', WHITE, 1.4),
    path('M48 67 L49.6 70.6 L53.4 71 L50.5 73.5 L51.4 77.2 L48 75.2 L44.6 77.2 L45.5 73.5 L42.6 71 L46.4 70.6 Z', ACCENT),
    circle(72, 72, 7, WHITE, INK, 1.6),
    path('M69 69 L75 75 M75 69 L69 75', 'none', INK, 2),
  ]
}

function greenParrotNodes(stage: CorePetStage): SvgNode[] {
  if (stage === 1) {
    return [
      shadow(100, 27),
      path('M58 42 Q55 30 64 33 Q67 27 68 38', BODY, INK, 2),
      circle(60, 68, 26, BODY, INK, 2.4),
      ellipse(60, 76, 14, 10, BELLY),
      ...bigEyes(49, 71, 63, 7, 3.4),
      path('M55 70 C55 66 65 66 65 72 C65 76 60 79 58 76 Z', ACCENT, INK, 1.8),
    ]
  }
  if (stage === 2) {
    return [
      shadow(102, 29),
      path('M56 32 Q50 18 62 24 Q67 16 70 28', BODY, INK, 2.2),
      ellipse(60, 74, 23, 24, BODY, INK, 2.4),
      ellipse(60, 78, 14, 15, BELLY),
      ellipse(36, 72, 7, 14, BODY, INK, 2.2),
      ellipse(84, 72, 7, 14, BODY, INK, 2.2),
      ...bigEyes(49, 71, 52, 7.2, 3.6),
      path('M55 59 C55 54 66 54 66 61 C66 66 60 69 57 65 Z', ACCENT, INK, 1.8),
      path('M50 96 L47 102 M53 96 L55 102 M70 96 L68 102 M73 96 L76 102', 'none', BELLY, 2.4),
    ]
  }
  if (stage === 3) {
    return [
      shadow(105, 32),
      path('M54 90 L48 106 L58 106 L64 90 Z', BODY, INK, 2),
      path('M54 30 Q49 16 61 22 Q68 15 70 28', BODY, INK, 2.2),
      path('M37 70 C36 42 46 28 60 28 C74 28 84 42 83 70 C83 89 72 95 60 95 C48 95 37 89 37 70 Z', BODY, INK, 2.4),
      ellipse(60, 76, 15, 16, BELLY),
      ellipse(34, 68, 7, 16, BODY, INK, 2.2),
      ellipse(86, 68, 7, 16, BODY, INK, 2.2),
      ...bigEyes(49, 71, 49, 7.6, 3.8),
      circle(41, 58, 5, ACCENT),
      circle(79, 58, 5, ACCENT),
      path('M55 56 C55 50 66 50 66 58 C66 64 60 67 57 63 Z', '#e7a54a', INK, 1.8),
      path('M50 95 L46 102 M52 95 L55 102 M70 95 L67 102 M72 95 L76 102', 'none', '#e7a54a', 2.4),
    ]
  }
  return [
    shadow(104, 32),
    dizzySwirl(16),
    ellipse(60, 74, 24, 22, BODY, INK, 2.4),
    ellipse(60, 70, 14, 12, BELLY),
    circle(42, 74, 4.5, ACCENT),
    circle(78, 74, 4.5, ACCENT),
    ...xEyes(49, 71, 78, 7),
    path('M55 68 C55 63 65 63 65 70 Z', '#e7a54a', INK, 1.8),
    path('M48 50 L45 43 M72 50 L75 43', 'none', '#e7a54a', 2.4),
  ]
}

function flyingPigNodes(stage: CorePetStage): SvgNode[] {
  if (stage === 1) {
    return [
      shadow(100, 28),
      path('M35 55 Q27 42 42 46 Z M85 55 Q93 42 78 46 Z', BODY, INK, 2.2),
      circle(60, 68, 27, BODY, INK, 2.3),
      ...bigEyes(49, 71, 61, 6.8, 3.4),
      ellipse(60, 73, 10, 7, BELLY, INK, 1.8),
      circle(56.5, 73, 1.8, ACCENT),
      circle(63.5, 73, 1.8, ACCENT),
    ]
  }
  if (stage === 2) {
    return [
      shadow(102, 30),
      path('M84 80 Q95 76 92 69 Q89 65 95 62', 'none', INK, 2.4),
      ellipse(60, 75, 27, 23, BODY, INK, 2.3),
      path('M36 52 Q27 38 44 43 Z M84 52 Q93 38 76 43 Z', BODY, INK, 2.2),
      ...bigEyes(49, 71, 60, 7.2, 3.6),
      ellipse(60, 73, 10.5, 7, BELLY, INK, 1.8),
      circle(56.5, 73, 1.9, ACCENT),
      circle(63.5, 73, 1.9, ACCENT),
      rect(44, 93, 7, 8, BODY, 3, INK, 1.8),
      rect(69, 93, 7, 8, BODY, 3, INK, 1.8),
    ]
  }
  if (stage === 3) {
    return [
      shadow(105, 32),
      path('M35 66 Q10 44 16 68 Q22 78 36 74 Z', BELLY, INK, 2.2),
      path('M85 66 Q110 44 104 68 Q98 78 84 74 Z', BELLY, INK, 2.2),
      path('M84 78 Q97 74 93 66 Q90 61 97 58', 'none', INK, 2.5),
      ellipse(60, 70, 27, 24, BODY, INK, 2.3),
      path('M36 48 Q26 32 45 38 Z M84 48 Q94 32 75 38 Z', BODY, INK, 2.2),
      ...bigEyes(49, 71, 56, 7.5, 3.8),
      ellipse(60, 69, 11, 7.5, BELLY, INK, 1.8),
      circle(56, 69, 2, ACCENT),
      circle(64, 69, 2, ACCENT),
      rect(45, 90, 7, 9, BODY, 3, INK, 1.8),
      rect(68, 90, 7, 9, BODY, 3, INK, 1.8),
    ]
  }
  return [
    shadow(104, 32),
    dizzySwirl(16),
    path('M34 72 Q14 58 18 78 Q26 86 36 80 Z', BELLY, INK, 2),
    path('M86 72 Q106 58 102 78 Q94 86 84 80 Z', BELLY, INK, 2),
    ellipse(60, 75, 27, 22, BODY, INK, 2.3),
    rect(45, 45, 7, 10, BODY, 3, INK, 1.8),
    rect(68, 45, 7, 10, BODY, 3, INK, 1.8),
    ...xEyes(49, 71, 74, 7),
    ellipse(60, 64, 10, 6.5, BELLY, INK, 1.8),
    circle(56.5, 64, 1.8, ACCENT),
    circle(63.5, 64, 1.8, ACCENT),
  ]
}

function balloonDogNodes(stage: CorePetStage): SvgNode[] {
  if (stage === 1) {
    return [
      shadow(100, 26),
      circle(60, 38, 5, BODY, INK, 2),
      circle(60, 68, 26, BODY, INK, 2.4),
      path('M44 54 Q48 48 55 49', 'none', WHITE, 2.6),
      ...bigEyes(49, 71, 66, 6.8, 3.4),
      path('M56 76 Q60 79 64 76', 'none', WHITE, 2),
    ]
  }
  if (stage === 2) {
    return [
      shadow(102, 28),
      ellipse(49, 34, 6, 11, BODY, INK, 2.2),
      ellipse(71, 34, 6, 11, BODY, INK, 2.2),
      ellipse(60, 52, 22, 17, BODY, INK, 2.4),
      ellipse(60, 82, 20, 16, BELLY, INK, 2.4),
      ...bigEyes(51, 69, 51, 6.5, 3.2),
      circle(36, 52, 4, ACCENT, INK, 1.8),
    ]
  }
  if (stage === 3) {
    return [
      shadow(105, 34),
      // Balloon tail & pom
      path('M86 68 L94 52', 'none', BODY, 6),
      circle(95, 49, 5.5, BELLY, INK, 2),
      // Sausage torso & legs
      rect(44, 62, 42, 20, BODY, 10, INK, 2.3),
      rect(43, 76, 12, 24, BELLY, 6, INK, 2.2),
      rect(73, 76, 12, 24, BELLY, 6, INK, 2.2),
      // Balloon ears & head
      ellipse(40, 29, 7, 13, BELLY, INK, 2.2),
      ellipse(52, 28, 7, 13, BELLY, INK, 2.2),
      rect(24, 38, 34, 22, BODY, 11, INK, 2.3),
      circle(23, 49, 4.5, BELLY, INK, 1.8),
      circle(38, 48, 6.5, WHITE, INK, 1.6),
      circle(39.5, 48, 3.2, INK),
      circle(51, 48, 6.5, WHITE, INK, 1.6),
      circle(50, 48, 3.2, INK),
    ]
  }
  // Deflated puddle balloon dog ("气球小狗漏气挂了")
  return [
    shadow(104, 36),
    dizzySwirl(24),
    path(
      'M22 86 C22 76 34 74 44 78 C54 82 64 72 74 78 C84 84 96 76 98 86 C98 96 82 98 60 98 C38 98 22 96 22 86 Z',
      BODY,
      INK,
      2.4,
    ),
    ellipse(34, 88, 9, 4, BELLY, INK, 1.8),
    ellipse(86, 88, 9, 4, BELLY, INK, 1.8),
    ...xEyes(49, 67, 84, 6),
    path('M76 80 L92 72', 'none', BELLY, 3),
  ]
}

function lightDeerNodes(stage: CorePetStage): SvgNode[] {
  if (stage === 1) {
    return [
      shadow(100, 28),
      ellipse(35, 50, 10, 5.5, BODY, INK, 2.2),
      ellipse(85, 50, 10, 5.5, BODY, INK, 2.2),
      circle(60, 68, 26, BODY, INK, 2.4),
      circle(46, 56, 3, BELLY),
      circle(74, 56, 3, BELLY),
      ...bigEyes(49, 71, 63, 7, 3.4),
      circle(60, 73, 4.5, ACCENT, INK, 1.8),
    ]
  }
  if (stage === 2) {
    return [
      shadow(103, 30),
      path('M45 34 L39 18 M42 25 L34 22 M75 34 L81 18 M78 25 L86 22', 'none', '#c68b59', 2.8),
      ellipse(60, 81, 22, 20, BODY, INK, 2.4),
      ellipse(60, 84, 12, 12, BELLY),
      ellipse(35, 44, 9, 5, BODY, INK, 2),
      ellipse(85, 44, 9, 5, BODY, INK, 2),
      circle(60, 52, 23, BODY, INK, 2.4),
      ...bigEyes(49, 71, 50, 7.2, 3.6),
      circle(60, 59, 4.5, ACCENT, INK, 1.8),
    ]
  }
  if (stage === 3) {
    return [
      shadow(105, 32),
      // Antlers with fairy light cord and bulbs
      path('M45 34 L34 12 M40 24 L29 22 M43 18 L47 11 M75 34 L86 12 M80 24 L91 22 M77 18 L73 11', 'none', '#c68b59', 3),
      path('M30 22 Q45 14 60 22 Q75 14 90 22', 'none', INK, 1.6),
      circle(32, 20, 3.8, '#ef4e36', INK, 1.2),
      circle(47, 15, 3.8, '#e7a54a', INK, 1.2),
      circle(73, 15, 3.8, '#7b9a80', INK, 1.2),
      circle(88, 20, 3.8, '#ef4e36', INK, 1.2),
      ellipse(60, 82, 23, 21, BODY, INK, 2.4),
      ellipse(60, 85, 13, 13, BELLY),
      ellipse(33, 45, 10, 5.2, BODY, INK, 2.2),
      ellipse(87, 45, 10, 5.2, BODY, INK, 2.2),
      ellipse(60, 52, 24, 21, BODY, INK, 2.4),
      ...bigEyes(49, 71, 50, 7.4, 3.7),
      circle(60, 60, 4.8, ACCENT, INK, 1.8),
      ellipse(49, 100, 5.5, 4, INK),
      ellipse(71, 100, 5.5, 4, INK),
    ]
  }
  return [
    shadow(104, 32),
    dizzySwirl(15),
    path('M42 88 L32 102 M78 88 L88 102', 'none', '#c68b59', 2.8),
    circle(34, 99, 3.5, '#e7a54a', INK, 1.2),
    circle(86, 99, 3.5, '#7b9a80', INK, 1.2),
    ellipse(60, 75, 25, 21, BODY, INK, 2.4),
    ellipse(60, 73, 13, 10, BELLY),
    ...xEyes(49, 71, 74, 7),
    circle(60, 64, 4.5, ACCENT, INK, 1.8),
  ]
}

function blackDragonNodes(stage: CorePetStage): SvgNode[] {
  if (stage === 1) {
    return [
      shadow(100, 28),
      ellipse(60, 69, 25, 29, BODY, INK, 2.5),
      path('M36 74 Q60 92 84 74 Q82 96 60 98 Q38 96 36 74 Z', BELLY, INK, 2.2),
      path('M44 58 L54 54 L60 60 L68 54 L76 58', 'none', ACCENT, 2.4),
      ...bigEyes(49, 71, 64, 6.8, 3.4),
    ]
  }
  if (stage === 2) {
    return [
      shadow(103, 30),
      path('M42 36 L34 18 L48 30 Z M78 36 L86 18 L72 30 Z', ACCENT, INK, 2),
      path('M82 88 Q98 84 96 68 L90 72', 'none', BODY, 6),
      ellipse(60, 80, 24, 21, BODY, INK, 2.3),
      ellipse(60, 83, 13, 13, BELLY),
      circle(60, 51, 23, BODY, INK, 2.3),
      ...bigEyes(49, 71, 50, 7.2, 3.6),
      path('M55 59 Q60 63 65 59', 'none', BELLY, 2),
    ]
  }
  if (stage === 3) {
    return [
      shadow(106, 36),
      // Auspicious cloud (祥云)
      path('M24 98 C24 90 34 88 40 92 C44 85 56 85 60 90 C66 84 78 86 81 92 C88 89 96 92 96 98 C96 104 86 106 60 106 C34 106 24 104 24 98 Z', WHITE, INK, 2.2),
      // Red horns & spines
      path('M42 34 L31 14 L50 28 Z M78 34 L89 14 L70 28 Z', ACCENT, INK, 2),
      path('M84 82 Q104 72 98 48 L92 54', 'none', INK, 6.5),
      path('M37 88 C36 66 46 58 60 58 C74 58 84 66 83 88 Z', BODY, INK, 2.3),
      ellipse(60, 78, 13, 11, BELLY),
      ellipse(60, 48, 26, 22, BODY, INK, 2.3),
      // Golden whiskers
      path('M36 52 Q24 49 22 57 M84 52 Q96 49 98 57', 'none', BELLY, 2.2),
      ...bigEyes(49, 71, 47, 7.8, 3.8),
      circle(60, 56, 2.4, ACCENT),
    ]
  }
  return [
    shadow(104, 34),
    dizzySwirl(16),
    path('M42 86 L34 102 L49 92 Z M78 86 L86 102 L71 92 Z', ACCENT, INK, 2),
    ellipse(60, 75, 26, 21, BODY, INK, 2.3),
    ellipse(60, 72, 13, 11, BELLY),
    ...xEyes(49, 71, 74, 7),
    path('M54 62 Q60 58 66 62', 'none', BELLY, 2),
  ]
}

export function getPetSpriteNodes(
  animalId: AnimalId,
  stage: PetStage,
  skinId = 'default',
): SvgNode[] {
  const coreStage: CorePetStage = stage === 'standby' ? 3 : stage

  switch (animalId) {
    case 'black-cat':
      return catStageNodes(coreStage, { skinId })
    case 'yellow-chick':
      return yellowChickNodes(coreStage)
    case 'white-goose':
      return whiteGooseNodes(coreStage)
    case 'orange-cat':
      return catStageNodes(coreStage, {
        tabby: true,
        lickingPaw: coreStage === 2,
      })
    case 'pixel-bird':
      return pixelBirdNodes(coreStage)
    case 'patch-bear':
      return patchBearNodes(coreStage)
    case 'green-parrot':
      return greenParrotNodes(coreStage)
    case 'flying-pig':
      return flyingPigNodes(coreStage)
    case 'balloon-dog':
      return balloonDogNodes(coreStage)
    case 'light-deer':
      return lightDeerNodes(coreStage)
    case 'angel-cat':
      return catStageNodes(coreStage, { angelStage: true })
    case 'black-dragon':
      return blackDragonNodes(coreStage)
  }
}
