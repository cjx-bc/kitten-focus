import { createSSRApp, h, reactive } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultProtection, emptyData, type AnimalId } from '../src/domain/model'
import { ANIMAL_CATALOG } from '../src/domain/pet'

const mocks = vi.hoisted(() => ({
  app: null as any,
}))

vi.mock('../src/stores/app', () => ({ useApp: () => mocks.app }))

import PetPickerSheet from '../src/components/PetPickerSheet.vue'

async function mountPickerSSR(props: { open?: boolean } = { open: true }, prepare?: (state: any) => void) {
  let setupState: any
  const vnode = h(PetPickerSheet, { open: props.open ?? true })
  const app = createSSRApp({ render: () => vnode })
  if (prepare) {
    app.mixin({
      created() {
        const internal = (this as any).$
        if (internal?.type === PetPickerSheet) {
          setupState = internal.setupState
          prepare(setupState)
        }
      },
    })
  }
  const html = await renderToString(app)
  return { state: setupState ?? (vnode.component as any).setupState, html }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.app = reactive({
    data: {
      ...emptyData(),
      pet: {
        version: 1,
        selectedAnimalId: 'black-cat' as AnimalId | 'random',
        selectedSkins: {},
        lastSelectedItemId: null,
        retroCutoffAt: null,
      },
      preferences: { defaultMinutes: 25, sound: true, vibration: true, activeSemesterId: null, protection: defaultProtection() },
    },
    petProjection: {
      affection: 35,
      peakAffection: 35,
      currentStreakDays: 4,
      maxConsecutiveDays: 4,
      totalRaised: 12,
      raisedByAnimal: {
        'black-cat': 10,
        'yellow-chick': 2,
        'white-goose': 0,
        'orange-cat': 0,
        'pixel-bird': 0,
        'patch-bear': 0,
        'green-parrot': 0,
        'flying-pig': 0,
        'balloon-dog': 0,
        'light-deer': 0,
        'angel-cat': 0,
        'black-dragon': 0,
      },
      dailyGainToday: 5,
      dailyGains: {},
      recordEffects: new Map(),
      unlockedAnimals: ['black-cat', 'yellow-chick', 'white-goose'],
      unlockedSkins: { 'black-cat': ['default', 'cow'], 'yellow-chick': ['default'] },
      weekFarmSlice: () => ({ weekStartDate: '2026-11-23', weekEndDate: '2026-11-29', weekTotalCount: 0, totalDurationMs: 0, instances: [] }),
      weeklyFourColorMatrix: () => [],
    },
    selectAnimal: vi.fn(async (id: AnimalId | 'random', skinId?: string) => {
      mocks.app.data.pet.selectedAnimalId = id
      if (skinId && id !== 'random') {
        mocks.app.data.pet.selectedSkins = { ...mocks.app.data.pet.selectedSkins, [id]: skinId }
      }
    }),
    selectSkin: vi.fn(async (id: AnimalId, skinId: string) => {
      mocks.app.data.pet.selectedSkins = { ...mocks.app.data.pet.selectedSkins, [id]: skinId }
    }),
    notify: vi.fn(),
  })
})

describe('PetPickerSheet single-layer companion roster & skin picker', () => {
  it('renders current affection, random toggle, all 12 animals, and locked milestone progress in roster view', async () => {
    const { html } = await mountPickerSSR()

    expect(html).toContain('伙伴图鉴')
    expect(html).toContain('35')
    expect(html).toContain('随机出场')
    for (const animal of ANIMAL_CATALOG) {
      expect(html).toContain(animal.name)
    }
    expect(html).toContain('上阵中')
    expect(html).toContain('好感需达到 65')
    expect(html).toContain('连续专注 4/7 天')
    expect(html).toContain('累计养出 12/50 只')
    expect(html).toContain('切换小黑猫毛色')
  })

  it('switches to skins view inside the same Sheet with backLabel and shows 10/30 coat unlock thresholds', async () => {
    const { html, state } = await mountPickerSSR({ open: true }, (s) => {
      s.openSkinsView('black-cat')
    })

    expect(html).toContain('伙伴图鉴')
    expect(html).toContain('小黑猫毛色')
    expect(html).toContain('煤球纯黑')
    expect(html).toContain('奶牛黑白斑')
    expect(html).toContain('暹罗重点色')
    expect(html).toContain('累计养出 30 只解锁（10/30）')

    await state.chooseSkin('cow')
    expect(mocks.app.selectSkin).toHaveBeenCalledWith('black-cat', 'cow')
    expect(mocks.app.data.pet.selectedSkins['black-cat']).toBe('cow')
  })

  it('toggles random mode via selectAnimal("random") and preserves selected skins without overwriting random', async () => {
    const { state } = await mountPickerSSR()

    await state.toggleRandomMode(true)
    expect(mocks.app.selectAnimal).toHaveBeenCalledWith('random')
    expect(mocks.app.data.pet.selectedAnimalId).toBe('random')

    state.openSkinsView('black-cat')
    await state.chooseSkin('cow')
    expect(mocks.app.data.pet.selectedAnimalId).toBe('random')
    expect(mocks.app.data.pet.selectedSkins['black-cat']).toBe('cow')
  })
})
