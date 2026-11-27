<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApp } from '../stores/app'
import type { AnimalId } from '../domain/model'
import {
  ANIMAL_CATALOG,
  SKIN_CATALOG,
  getAnimalMeta,
  getAnimalUnlockStatus,
  getSkinMeta,
  getSkinUnlockStatus,
} from '../domain/pet'
import Icon from './Icon.vue'
import PetGraphic from './PetGraphic.vue'
import Sheet from './Sheet.vue'

type PickerView = 'roster' | 'skins'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const app = useApp()
const view = ref<PickerView>('roster')
const skinAnimalId = ref<AnimalId>('black-cat')
const busy = ref(false)

const isRandomMode = computed(() => app.data.pet?.selectedAnimalId === 'random')
const activeAnimalId = computed<AnimalId>(() => {
  const sel = app.data.pet?.selectedAnimalId
  if (sel && sel !== 'random' && app.petProjection.unlockedAnimals.includes(sel)) return sel
  return 'black-cat'
})
const reducedMotionPref = computed(() => app.data.preferences.animation === 'off')

const unlockedSkinCapableAnimals = computed(() =>
  ANIMAL_CATALOG.filter(
    (a) => SKIN_CATALOG[a.id].length > 1 && app.petProjection.unlockedAnimals.includes(a.id),
  ),
)

const rosterSkinTargetId = computed<AnimalId>(() => {
  if (!isRandomMode.value && SKIN_CATALOG[activeAnimalId.value].length > 1) {
    return activeAnimalId.value
  }
  return unlockedSkinCapableAnimals.value[0]?.id ?? 'black-cat'
})

const rosterSkinTargetMeta = computed(() => getAnimalMeta(rosterSkinTargetId.value))
const skinAnimalMeta = computed(() => getAnimalMeta(skinAnimalId.value))

function selectedSkinFor(animalId: AnimalId): string {
  const skin = app.data.pet?.selectedSkins?.[animalId]
  const unlocked = app.petProjection.unlockedSkins[animalId] ?? ['default']
  return skin && unlocked.includes(skin) ? skin : 'default'
}

const rosterSkinCurrentMeta = computed(() =>
  getSkinMeta(rosterSkinTargetId.value, selectedSkinFor(rosterSkinTargetId.value)),
)
const activeSkinId = computed(() => selectedSkinFor(skinAnimalId.value))
const activeSkinMeta = computed(() => getSkinMeta(skinAnimalId.value, activeSkinId.value))
const raisedForSkinAnimal = computed(
  () => app.petProjection.raisedByAnimal[skinAnimalId.value] ?? 0,
)

const sheetTitle = computed(() =>
  view.value === 'skins' ? `${skinAnimalMeta.value.name}毛色` : '伙伴图鉴',
)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      view.value = 'roster'
      skinAnimalId.value = rosterSkinTargetId.value
    }
  },
)

function openSkinsView(animalId: AnimalId = rosterSkinTargetId.value) {
  skinAnimalId.value = animalId
  view.value = 'skins'
}

async function toggleRandomMode(checked: boolean) {
  if (busy.value) return
  busy.value = true
  try {
    await app.selectAnimal(checked ? 'random' : activeAnimalId.value)
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

async function chooseAnimal(animalId: AnimalId) {
  if (busy.value || !app.petProjection.unlockedAnimals.includes(animalId)) return
  busy.value = true
  try {
    await app.selectAnimal(animalId)
    if (SKIN_CATALOG[animalId].length > 1) {
      skinAnimalId.value = animalId
    }
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

async function chooseSkin(skinId: string) {
  if (busy.value) return
  const unlocked = app.petProjection.unlockedSkins[skinAnimalId.value] ?? ['default']
  if (!unlocked.includes(skinId)) return
  busy.value = true
  try {
    if (typeof app.selectSkin === 'function') {
      await app.selectSkin(skinAnimalId.value, skinId)
    } else {
      await app.selectAnimal(skinAnimalId.value, skinId)
    }
  } catch (e) {
    app.notify(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Sheet
    :open="open"
    :title="sheetTitle"
    :back-label="view === 'skins' ? '伙伴图鉴' : undefined"
    :close-disabled="busy"
    @back="view = 'roster'"
    @close="emit('close')"
  >
    <!-- View 1: 12-animal roster & random toggle -->
    <div v-if="view === 'roster'" class="stack">
      <div class="notice picker-summary">
        <div class="picker-summary-main">
          <span>当前好感 <strong class="number">{{ app.petProjection.affection }}</strong></span>
          <span class="picker-summary-sep" aria-hidden="true">·</span>
          <span>历史最高 <strong class="number">{{ app.petProjection.peakAffection }}</strong></span>
          <span class="picker-summary-sep" aria-hidden="true">·</span>
          <span>已养大 <strong class="number">{{ app.petProjection.totalRaised }}</strong> 只</span>
        </div>
        <p class="picker-summary-tip">每满 5 分钟专注好感 +1，提前放弃 -5（已解锁伙伴永不回锁）</p>
      </div>

      <div class="card random-card">
        <label class="switch">
          <span class="random-label">
            <strong>随机出场</strong>
            <small>
              {{
                isRandomMode
                  ? `已开启 · 从 ${app.petProjection.unlockedAnimals.length} 只已解锁伙伴随机上阵`
                  : '开启后每次专注从已解锁伙伴中随机上阵'
              }}
            </small>
          </span>
          <input
            type="checkbox"
            :checked="isRandomMode"
            :disabled="busy"
            @change="toggleRandomMode(($event.target as HTMLInputElement).checked)"
          />
        </label>
      </div>

      <div
        class="pet-roster-grid"
        data-decision-group
        role="group"
        aria-label="十二只伙伴图鉴"
      >
        <button
          v-for="animal in ANIMAL_CATALOG"
          :key="animal.id"
          type="button"
          class="pet-roster-card"
          :class="{
            active: !isRandomMode && activeAnimalId === animal.id,
            locked: !getAnimalUnlockStatus(animal, app.petProjection).unlocked,
          }"
          :disabled="!getAnimalUnlockStatus(animal, app.petProjection).unlocked || busy"
          :aria-pressed="!isRandomMode && activeAnimalId === animal.id"
          @click="chooseAnimal(animal.id)"
        >
          <div class="pet-roster-art">
            <PetGraphic
              :animal-id="animal.id"
              :skin-id="selectedSkinFor(animal.id)"
              stage="standby"
              :size="56"
              :reduced-motion="reducedMotionPref"
            />
          </div>
          <span class="pet-roster-name">{{ animal.name }}</span>
          <span
            v-if="SKIN_CATALOG[animal.id].length > 1"
            class="coat-dots"
            aria-hidden="true"
          >
            <span
              v-for="skin in SKIN_CATALOG[animal.id]"
              :key="skin.id"
              class="coat-dot"
              :class="{
                current: selectedSkinFor(animal.id) === skin.id,
                locked: !getSkinUnlockStatus(skin, app.petProjection).unlocked,
              }"
              :style="{ background: skin.body }"
            />
          </span>
          <span
            class="pet-roster-status"
            :class="{
              active: !isRandomMode && activeAnimalId === animal.id,
            }"
          >
            <template v-if="!getAnimalUnlockStatus(animal, app.petProjection).unlocked">
              {{ getAnimalUnlockStatus(animal, app.petProjection).progressText }}
            </template>
            <template v-else-if="!isRandomMode && activeAnimalId === animal.id">
              上阵中
            </template>
            <template v-else-if="isRandomMode">
              随机池中
            </template>
            <template v-else>
              已解锁
            </template>
          </span>
        </button>
      </div>

      <button
        v-if="SKIN_CATALOG[rosterSkinTargetId].length > 1 || isRandomMode"
        type="button"
        class="skin-entry-row"
        :disabled="busy"
        @click="openSkinsView(rosterSkinTargetId)"
      >
        <span class="skin-entry-left">
          <span class="skin-swatch-mini" :style="{ background: rosterSkinCurrentMeta.body }" />
          <span>
            切换{{ rosterSkinTargetMeta.name }}毛色
            <small>当前：{{ rosterSkinCurrentMeta.name }}</small>
          </span>
        </span>
        <Icon name="right" :size="18" />
      </button>

      <button type="button" class="primary wide" @click="emit('close')">完成</button>
    </div>

    <!-- View 2: Coat / skin picker inside the same <Sheet> -->
    <div v-else class="stack">
      <div
        v-if="isRandomMode && unlockedSkinCapableAnimals.length > 1"
        class="segmented"
        role="tablist"
        aria-label="选择调整毛色的伙伴"
      >
        <button
          v-for="animal in unlockedSkinCapableAnimals"
          :key="animal.id"
          type="button"
          role="tab"
          :aria-selected="skinAnimalId === animal.id"
          :class="{ active: skinAnimalId === animal.id }"
          @click="skinAnimalId = animal.id"
        >
          {{ animal.name }}
        </button>
      </div>

      <div class="card skin-preview-card">
        <PetGraphic
          :animal-id="skinAnimalId"
          :skin-id="activeSkinId"
          stage="standby"
          :size="92"
          :reduced-motion="reducedMotionPref"
        />
        <div class="skin-preview-info">
          <h3>{{ skinAnimalMeta.name }} · {{ activeSkinMeta.name }}</h3>
          <p class="skin-preview-count">
            累计已养出 <strong class="number">{{ raisedForSkinAnimal }}</strong> 只{{ skinAnimalMeta.name }}
          </p>
        </div>
      </div>

      <div class="skin-options" data-decision-group role="group" aria-label="毛色列表">
        <button
          v-for="skin in SKIN_CATALOG[skinAnimalId]"
          :key="skin.id"
          type="button"
          class="skin-option-card"
          :class="{
            active: activeSkinId === skin.id,
            locked: !getSkinUnlockStatus(skin, app.petProjection).unlocked,
          }"
          :disabled="!getSkinUnlockStatus(skin, app.petProjection).unlocked || busy"
          :aria-pressed="activeSkinId === skin.id"
          @click="chooseSkin(skin.id)"
        >
          <span class="skin-option-left">
            <span class="skin-swatch" :style="{ background: skin.body }" />
            <span class="skin-option-text">
              <strong>{{ skin.name }}</strong>
              <small v-if="!getSkinUnlockStatus(skin, app.petProjection).unlocked">
                {{ getSkinUnlockStatus(skin, app.petProjection).progressText }}
              </small>
              <small v-else-if="activeSkinId === skin.id">使用中</small>
              <small v-else>已解锁 · 点击切换</small>
            </span>
          </span>
          <span v-if="activeSkinId === skin.id" class="skin-active-pill">当前</span>
        </button>
      </div>

      <button type="button" class="primary wide" @click="emit('close')">完成</button>
    </div>
  </Sheet>
</template>

<style scoped>
.picker-summary {
  display: grid;
  gap: 4px;
}
.picker-summary-main {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
  color: var(--ink);
}
.picker-summary-main .number {
  font-size: 16px;
}
.picker-summary-sep {
  color: var(--muted-surface);
}
.picker-summary-tip {
  font-size: 12px;
  color: var(--muted-surface);
}
.random-card {
  padding: 6px 16px;
}
.random-label {
  display: grid;
  gap: 2px;
}
.random-label strong {
  font-size: 15px;
  color: var(--ink);
}
.random-label small {
  font-size: 12px;
  color: var(--muted-surface);
}
.pet-roster-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.pet-roster-card {
  min-width: 48px;
  min-height: 118px;
  padding: 12px 10px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1.5px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  text-align: center;
}
.pet-roster-card.active {
  border-color: var(--ink);
  background: var(--white);
}
.pet-roster-card.locked {
  opacity: 0.72;
}
.pet-roster-card.locked .pet-roster-art {
  filter: grayscale(1);
  opacity: 0.65;
}
.pet-roster-name {
  font-size: 14px;
  font-weight: 650;
  color: var(--ink);
}
.coat-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.coat-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid var(--ink);
}
.coat-dot.current {
  box-shadow: 0 0 0 1.5px var(--ink);
}
.coat-dot.locked {
  opacity: 0.35;
}
.pet-roster-status {
  font-size: 12px;
  color: var(--muted-surface);
  line-height: 1.3;
}
.pet-roster-status.active {
  padding: 2px 8px;
  border-radius: 100px;
  background: var(--ink);
  color: var(--white);
  font-weight: 600;
}
.skin-entry-row {
  width: 100%;
  min-height: 54px;
  padding: 10px 16px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  color: var(--ink);
  font-size: 14px;
  font-weight: 600;
}
.skin-entry-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.skin-entry-left small {
  display: block;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted-surface);
}
.skin-swatch-mini {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--ink);
  flex-shrink: 0;
}
.skin-preview-card {
  display: flex;
  align-items: center;
  gap: 14px;
}
.skin-preview-info {
  flex: 1;
  display: grid;
  gap: 4px;
}
.skin-preview-info h3 {
  font-size: 16px;
}
.skin-preview-count {
  font-size: 13px;
  color: var(--muted-surface);
}
.skin-options {
  display: grid;
  gap: 10px;
}
.skin-option-card {
  width: 100%;
  min-height: 56px;
  padding: 12px 16px;
  border-radius: var(--radius);
  background: var(--surface);
  border: 1.5px solid transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
}
.skin-option-card.active {
  border-color: var(--ink);
  background: var(--white);
}
.skin-option-card.locked {
  opacity: 0.72;
}
.skin-option-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.skin-swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid var(--ink);
  flex-shrink: 0;
}
.skin-option-text {
  display: grid;
  gap: 2px;
}
.skin-option-text strong {
  font-size: 14px;
  color: var(--ink);
}
.skin-option-text small {
  font-size: 12px;
  color: var(--muted-surface);
}
.skin-active-pill {
  padding: 3px 10px;
  border-radius: 100px;
  background: var(--ink);
  color: var(--white);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
</style>
