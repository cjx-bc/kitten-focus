<script setup lang="ts">
import { computed } from 'vue'
import type { AnimalId } from '../domain/model'
import { getAnimalMeta, getSkinMeta } from '../domain/pet'
import { getPetSpriteNodes, type PetStage } from '../domain/petSprites'

const props = withDefaults(
  defineProps<{
    animalId?: AnimalId
    skinId?: string
    stage: PetStage
    size?: number
    bouncing?: boolean
    reducedMotion?: boolean
  }>(),
  {
    animalId: 'black-cat',
    skinId: 'default',
    size: 132,
    bouncing: false,
    reducedMotion: false,
  },
)

const skin = computed(() => getSkinMeta(props.animalId, props.skinId))
const animal = computed(() => getAnimalMeta(props.animalId))
const nodes = computed(() => getPetSpriteNodes(props.animalId, props.stage, skin.value.id))
const paletteStyle = computed(() => ({
  '--pet-body': skin.value.body,
  '--pet-belly': skin.value.belly,
  '--pet-accent': skin.value.accent,
}))
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 120 120"
    class="pet-svg"
    :class="{ 'pet-bounce': bouncing && !reducedMotion, 'pet-reduced': reducedMotion }"
    :style="paletteStyle"
    :data-animal-id="animal.id"
    :data-skin-id="skin.id"
    :data-stage="String(stage)"
    role="img"
    :aria-label="`${animal.name}（${stage === 'failed' ? '翻车' : stage === 'standby' ? '待机' : `阶段${stage}`}）`"
  >
    <component :is="node.tag" v-for="(node, idx) in nodes" :key="idx" v-bind="node.attrs" />
  </svg>
</template>

<style scoped>
.pet-svg {
  display: block;
  transform-origin: center bottom;
}
.pet-bounce {
  animation: pet-hop 320ms cubic-bezier(0.22, 1.35, 0.36, 1);
}
@keyframes pet-hop {
  0% {
    transform: translateY(0) scale(1, 1);
  }
  30% {
    transform: translateY(4px) scale(1.06, 0.92);
  }
  65% {
    transform: translateY(-14px) scale(0.96, 1.06);
  }
  100% {
    transform: translateY(0) scale(1, 1);
  }
}
.pet-reduced {
  animation: none !important;
  transition: none !important;
}
@media (prefers-reduced-motion: reduce) {
  .pet-bounce {
    animation: none !important;
  }
}
</style>
