import { createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { ANIMAL_IDS } from '../src/domain/model'
import { getPetSpriteNodes } from '../src/domain/petSprites'
import PetGraphic from '../src/components/PetGraphic.vue'

describe('12-animal × 4-state vector sprites', () => {
  it('provides distinct SVG geometry for all 12 species across stages 1, 2, 3, failed, and reuses stage 3 for standby', () => {
    const stage3Signatures = new Set<string>()

    for (const animalId of ANIMAL_IDS) {
      const s1 = JSON.stringify(getPetSpriteNodes(animalId, 1))
      const s2 = JSON.stringify(getPetSpriteNodes(animalId, 2))
      const s3 = JSON.stringify(getPetSpriteNodes(animalId, 3))
      const sb = JSON.stringify(getPetSpriteNodes(animalId, 'standby'))
      const sf = JSON.stringify(getPetSpriteNodes(animalId, 'failed'))

      expect(getPetSpriteNodes(animalId, 1).length).toBeGreaterThanOrEqual(4)
      expect(getPetSpriteNodes(animalId, 3).length).toBeGreaterThanOrEqual(5)
      expect(sb).toBe(s3)
      expect(new Set([s1, s2, s3, sf]).size).toBe(4)

      stage3Signatures.add(s3)
    }

    expect(stage3Signatures.size).toBe(12)
  })

  it('uses CSS variables for dynamic skin recoloring and adds coat markings for black-cat skins', () => {
    const catDefault = JSON.stringify(getPetSpriteNodes('black-cat', 3, 'default'))
    const catCow = JSON.stringify(getPetSpriteNodes('black-cat', 3, 'cow'))
    const catSiamese = JSON.stringify(getPetSpriteNodes('black-cat', 3, 'siamese'))
    const chickDefault = JSON.stringify(getPetSpriteNodes('yellow-chick', 3, 'default'))

    expect(catDefault).toContain('var(--pet-body)')
    expect(chickDefault).toContain('var(--pet-body)')
    expect(chickDefault).toContain('var(--pet-accent)')
    expect(catCow).not.toBe(catDefault)
    expect(catSiamese).not.toBe(catDefault)
    expect(catCow).not.toBe(catSiamese)
  })

  it('renders PetGraphic with viewBox 0 0 120 120, CSS palette variables, and species aria-label across skins', async () => {
    const chickHtml = await renderToString(
      createSSRApp({
        render: () => h(PetGraphic, { animalId: 'yellow-chick', skinId: 'chestnut', stage: 'standby' }),
      }),
    )
    expect(chickHtml).toMatch(/viewBox="0 0 120 120"/i)
    expect(chickHtml).toContain('aria-label="小黄鸡（待机）"')
    expect(chickHtml).toContain('--pet-body:#9c6b43')

    const dogFailedHtml = await renderToString(
      createSSRApp({
        render: () => h(PetGraphic, { animalId: 'balloon-dog', stage: 'failed' }),
      }),
    )
    expect(dogFailedHtml).toContain('aria-label="气球小狗（翻车）"')

    const dragonHtml = await renderToString(
      createSSRApp({
        render: () => h(PetGraphic, { animalId: 'black-dragon', stage: 3 }),
      }),
    )
    expect(dragonHtml).toContain('aria-label="小黑龙（阶段3）"')
  })
})
