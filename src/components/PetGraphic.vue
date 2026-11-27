<script setup lang="ts">
import { computed } from 'vue'
import type { AnimalId } from '../domain/model'
import { getAnimalMeta, getSkinMeta } from '../domain/pet'

const props = withDefaults(
  defineProps<{
    animalId?: AnimalId
    skinId?: string
    stage: 'standby' | 1 | 2 | 3 | 'failed'
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
const paletteStyle = computed(() => ({
  '--pet-body': skin.value.body,
  '--pet-belly': skin.value.belly,
  '--pet-accent': skin.value.accent,
}))
const isLightBody = computed(() => skin.value.body.toLowerCase() === '#ffffff')
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
    role="img"
    :aria-label="`${animal.name}（${stage === 'failed' ? '翻车' : stage === 'standby' ? '待机' : `阶段${stage}`}）`"
  >
    <!-- Stage 1: Puffball / emerging kitten -->
    <g v-if="stage === 1">
      <ellipse cx="60" cy="98" rx="28" ry="6" fill="#00000014" />
      <path
        d="M36 48 L42 32 L52 44 M84 48 L78 32 L68 44"
        fill="var(--pet-body)"
        stroke="#222222"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <circle
        cx="60"
        cy="68"
        r="27"
        fill="var(--pet-body)"
        stroke="#222222"
        :stroke-width="isLightBody ? 2.5 : 2"
      />
      <ellipse cx="60" cy="78" rx="14" ry="10" fill="var(--pet-belly)" />
      <circle cx="49" cy="65" r="7" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
      <circle cx="71" cy="65" r="7" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
      <circle cx="50.5" cy="65" r="3.4" fill="#222222" />
      <circle cx="69.5" cy="65" r="3.4" fill="#222222" />
      <circle cx="60" cy="74" r="2.2" fill="var(--pet-accent)" />
    </g>

    <!-- Stage 2: Young short-tail kitten -->
    <g v-else-if="stage === 2">
      <ellipse cx="60" cy="102" rx="30" ry="6" fill="#00000014" />
      <!-- Short curved tail -->
      <path
        d="M82 88 Q96 84 94 70"
        fill="none"
        stroke="#222222"
        stroke-width="7"
        stroke-linecap="round"
      />
      <!-- Body -->
      <ellipse
        cx="60"
        cy="80"
        rx="24"
        ry="21"
        fill="var(--pet-body)"
        stroke="#222222"
        :stroke-width="isLightBody ? 2.5 : 2"
      />
      <ellipse cx="60" cy="84" rx="13" ry="12" fill="var(--pet-belly)" />
      <!-- Head & ears -->
      <path
        d="M34 48 L36 24 L52 38 Z M86 48 L84 24 L68 38 Z"
        fill="var(--pet-body)"
        stroke="#222222"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <circle
        cx="60"
        cy="52"
        r="24"
        fill="var(--pet-body)"
        stroke="#222222"
        :stroke-width="isLightBody ? 2.5 : 2"
      />
      <!-- Collar dot -->
      <rect x="46" y="70" width="28" height="4" rx="2" fill="var(--pet-accent)" />
      <circle cx="60" cy="75" r="3.2" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
      <!-- Big white eyes -->
      <circle cx="49" cy="51" r="7.5" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
      <circle cx="71" cy="51" r="7.5" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
      <circle cx="51" cy="51" r="3.8" fill="#222222" />
      <circle cx="69" cy="51" r="3.8" fill="#222222" />
      <path d="M56 59 Q60 62 64 59" fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" />
    </g>

    <!-- Stage 3 / Standby: Adult black cat with raised tail -->
    <g v-else-if="stage === 3 || stage === 'standby'">
      <ellipse cx="60" cy="105" rx="34" ry="6" fill="#00000014" />
      <!-- Raised curled tail -->
      <path
        d="M82 90 Q104 82 98 54 Q95 44 88 48"
        fill="none"
        stroke="#222222"
        stroke-width="8"
        stroke-linecap="round"
      />
      <!-- Body -->
      <path
        d="M36 96 C34 72 44 62 60 62 C76 62 86 72 84 96 C84 102 74 104 60 104 C46 104 36 102 36 96 Z"
        fill="var(--pet-body)"
        stroke="#222222"
        :stroke-width="isLightBody ? 2.5 : 2"
      />
      <ellipse cx="60" cy="86" rx="13" ry="13" fill="var(--pet-belly)" />
      <!-- Ears -->
      <path
        d="M32 46 L31 18 L52 33 Z M88 46 L89 18 L68 33 Z"
        fill="var(--pet-body)"
        stroke="#222222"
        stroke-width="2.5"
        stroke-linejoin="round"
      />
      <!-- Head -->
      <ellipse
        cx="60"
        cy="49"
        rx="27"
        ry="23"
        fill="var(--pet-body)"
        stroke="#222222"
        :stroke-width="isLightBody ? 2.5 : 2"
      />
      <!-- Siamese mask or cow patch accent -->
      <ellipse
        v-if="skinId === 'siamese'"
        cx="60"
        cy="54"
        rx="16"
        ry="12"
        fill="var(--pet-belly)"
      />
      <path
        v-if="skinId === 'cow'"
        d="M36 42 Q48 34 54 46 Q46 56 35 50 Z"
        fill="#222222"
      />
      <!-- Eyes -->
      <circle cx="48" cy="48" r="8.2" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
      <circle cx="72" cy="48" r="8.2" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
      <circle cx="50.5" cy="48" r="4" fill="#222222" />
      <circle cx="69.5" cy="48" r="4" fill="#222222" />
      <!-- Collar + Bell -->
      <rect x="44" y="68" width="32" height="4.5" rx="2.2" fill="var(--pet-accent)" />
      <circle cx="60" cy="74" r="3.6" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
      <!-- Paws -->
      <ellipse cx="49" cy="100" rx="6.5" ry="4" fill="var(--pet-body)" stroke="#222222" stroke-width="1.8" />
      <ellipse cx="71" cy="100" rx="6.5" ry="4" fill="var(--pet-body)" stroke="#222222" stroke-width="1.8" />
    </g>

    <!-- Failed: Upside-down / dizzy cat -->
    <g v-else>
      <ellipse cx="60" cy="104" rx="34" ry="6" fill="#00000014" />
      <!-- Dizzy swirl above -->
      <path
        d="M52 16 Q60 10 68 16 Q72 22 62 24 Q55 24 58 19"
        fill="none"
        stroke="var(--pet-accent)"
        stroke-width="2.5"
        stroke-linecap="round"
      />
      <!-- Inverted / flopped cat -->
      <g transform="translate(0, 6)">
        <ellipse
          cx="60"
          cy="74"
          rx="26"
          ry="20"
          fill="var(--pet-body)"
          stroke="#222222"
          :stroke-width="isLightBody ? 2.5 : 2"
        />
        <ellipse cx="60" cy="72" rx="13" ry="10" fill="var(--pet-belly)" />
        <!-- Ears pointing down -->
        <path
          d="M36 74 L32 95 L50 86 Z M84 74 L88 95 L70 86 Z"
          fill="var(--pet-body)"
          stroke="#222222"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <!-- Paws up -->
        <ellipse cx="44" cy="48" rx="6" ry="9" fill="var(--pet-body)" stroke="#222222" stroke-width="2" />
        <ellipse cx="76" cy="48" rx="6" ry="9" fill="var(--pet-body)" stroke="#222222" stroke-width="2" />
        <!-- X eyes -->
        <circle cx="49" cy="68" r="7" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
        <circle cx="71" cy="68" r="7" fill="#FFFFFF" stroke="#222222" stroke-width="1.5" />
        <path d="M46 65 L52 71 M52 65 L46 71 M68 65 L74 71 M74 65 L68 71" stroke="#222222" stroke-width="2" stroke-linecap="round" />
        <!-- Accent wavy mouth -->
        <path d="M55 78 Q60 74 65 78" fill="none" stroke="var(--pet-accent)" stroke-width="2.2" stroke-linecap="round" />
      </g>
    </g>
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
