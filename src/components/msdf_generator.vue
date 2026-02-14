<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import { MsdfEngine, type MsdfParams } from '../lib/msdfEngine'

import Viewport from './InspectorViewport.vue'

const engine = new MsdfEngine()
const isReady = ref(false)
const charInput = ref('G')
const zoom = ref(8)
const canvasDim = reactive({ w: 0, h: 0 })
const displayDim = reactive({ w: 0, h: 0 })
const params = reactive<MsdfParams>({
  mode: 3, // Default to MTSDF
  px_scale: 40,
  px_range: 4,
  px_padding: 4,
  seed: 0,
  errorMode: 2, // Default to EDGE_PRIORITY
  overlap: true,
  coloringStrategy: 'inktrap',
  angle_threshold: 3.0,
})

const globalZoom = ref(8)

const viewMTSDF = ref<InstanceType<typeof Viewport> | null>(null)
const viewResolved = ref<InstanceType<typeof Viewport> | null>(null)

const fontName = ref('Roboto.ttf')

const handleFontUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    const file = target.files[0]
    fontName.value = file.name
    await engine.loadFont(file)
    render()
  }
}

const render = () => {
  if (!isReady.value || !charInput.value) return
  const result = engine.generate(charInput.value, params)
  if (!result) return

  canvasDim.w = result.width
  canvasDim.h = result.height
  displayDim.w = result.displayW // UI Container size
  displayDim.h = result.displayH

  draw(
    result.pixels,
    result.width,
    result.height,
    viewMTSDF.value?.canvas ?? null,
    false,
    result.channels,
  )
  draw(
    result.pixels,
    result.width,
    result.height,
    viewResolved.value?.canvas ?? null,
    true,
    result.channels,
  )
}
function draw(
  data: Float32Array,
  w: number,
  h: number,
  canvas: HTMLCanvasElement | null,
  resolve: boolean,
  channels: number, // Pass the channel count from the result
) {
  if (!canvas) return
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)

  for (let y = 0; y < h; y++) {
    const flipY = h - 1 - y
    for (let x = 0; x < w; x++) {
      const srcIdx = (y * w + x) * channels
      const dstIdx = (flipY * w + x) * 4

      if (resolve) {
        let dist = 0

        if (channels >= 3) {
          // Median thresholding for MSDF/MTSDF
          const r = data[srcIdx] ?? 0
          const g = data[srcIdx + 1] ?? 0
          const b = data[srcIdx + 2] ?? 0
          dist = Math.max(Math.min(r, g), Math.min(Math.max(r, g), b))

          // If MTSDF, intersect with alpha channel
          if (channels === 4) {
            dist = Math.min(dist, data[srcIdx + 3] ?? 0)
          }
        } else {
          // Single channel SDF/PSDF
          dist = data[srcIdx] ?? 0
        }

        const opacity = Math.max(0, Math.min(255, (dist - 0.48) * 20 * 255))
        img.data[dstIdx] = img.data[dstIdx + 1] = img.data[dstIdx + 2] = 255
        img.data[dstIdx + 3] = opacity
      } else {
        // Raw Texture View
        if (channels === 1) {
          const val = (data[srcIdx] ?? 0) * 255
          img.data[dstIdx] = img.data[dstIdx + 1] = img.data[dstIdx + 2] = val
        } else {
          img.data[dstIdx] = (data[srcIdx] ?? 0) * 255
          img.data[dstIdx + 1] = (data[srcIdx + 1] ?? 0) * 255
          img.data[dstIdx + 2] = (data[srcIdx + 2] ?? 0) * 255
        }
        // Alpha visualization: if 4 channels, use it; otherwise solid
        img.data[dstIdx + 3] = channels === 4 ? (data[srcIdx + 3] ?? 0) * 255 : 255
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

watch([() => charInput.value, params], render, { deep: true })
onMounted(async () => {
  await engine.init('/Roboto.ttf')
  isReady.value = true
  render()
})
onBeforeUnmount(() => engine.dispose())

const randomizeSeed = () => {
  // Generates a random integer between 0 and 9999
  params.seed = Math.floor(Math.random() * 10000000)
}
</script>

<template>
  <div
    class="flex flex-col h-screen w-full bg-neutral-950 text-neutral-200 overflow-hidden select-none"
  >
    <header
      class="h-14 border-b border-neutral-800 bg-neutral-900/80 flex items-center px-6 gap-8 z-20 shrink-0"
    >
      <div class="flex items-center gap-4 border-r border-neutral-800 pr-8">
        <div class="w-6 h-6 bg-blue-600 rounded flex items-center justify-center font-bold text-xs">
          M
        </div>
        <h1 class="text-sm font-bold tracking-tight uppercase text-neutral-400">Inspector v2</h1>
      </div>
      <div class="flex items-center gap-3 border-l border-neutral-800 pl-8">
        <label class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Font</label>
        <label
          class="flex items-center gap-2 cursor-pointer bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-3 py-1.5 rounded transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="text-blue-400"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span class="text-xs font-mono text-neutral-300 max-w-[120px] truncate">{{
            fontName
          }}</span>
          <input type="file" accept=".ttf,.otf" class="hidden" @change="handleFontUpload" />
        </label>
      </div>
      <div class="flex items-center gap-4 flex-1 max-w-md">
        <label class="text-[10px] font-bold text-neutral-500 uppercase tracking-widest"
          >Global Zoom</label
        >
        <input
          type="range"
          v-model.number="globalZoom"
          min="1"
          max="100"
          step="0.5"
          class="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <span class="font-mono text-xs text-blue-400 w-12">{{ globalZoom.toFixed(1) }}x</span>
      </div>

      <button
        @click="globalZoom = 8"
        class="text-[10px] bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-3 py-1 rounded transition-colors text-neutral-400"
      >
        RESET VIEWS
      </button>
    </header>
    <div class="flex flex-1 min-h-0 overflow-hidden">
      <aside
        class="w-80 border-r border-neutral-800 bg-neutral-900/50 p-6 flex flex-col gap-6 z-10 overflow-y-auto"
      >
        <div class="space-y-6">
          <div class="space-y-1">
            <label class="text-[10px] text-neutral-500 font-bold uppercase tracking-wider"
              >Glyph Input</label
            >
            <input
              v-model="charInput"
              class="w-full bg-neutral-800 border border-neutral-700 rounded-lg py-2 text-center text-2xl font-mono outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          <hr class="border-neutral-800" />

          <div class="space-y-3">
            <label class="text-[10px] text-blue-500 font-bold uppercase tracking-wider"
              >Generation Mode</label
            >

            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="(label, m) in ['SDF', 'PSDF', 'MSDF', 'MTSDF']"
                :key="m"
                @click="params.mode = m as any"
                :class="
                  params.mode === m
                    ? 'bg-blue-600 border-blue-400 text-white'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:bg-neutral-750'
                "
                class="py-1.5 rounded text-[10px] font-bold border transition-all"
              >
                {{ label }}
              </button>
            </div>

            <div class="space-y-1">
              <label class="text-[10px] text-neutral-500 uppercase">Error Correction</label>
              <select
                v-model.number="params.errorMode"
                class="w-full bg-neutral-800 border border-neutral-700 rounded p-1.5 text-xs outline-none text-neutral-300"
              >
                <option :value="0">Disabled</option>
                <option :value="1">Indiscriminate</option>
                <option :value="2">Edge Priority</option>
                <option :value="3">Edge Only</option>
              </select>
            </div>
          </div>

          <div class="space-y-3">
            <label class="text-[10px] text-blue-500 font-bold uppercase tracking-wider"
              >Shape / Coloring</label
            >
            <div class="space-y-1">
              <label class="text-[10px] text-neutral-500 uppercase">Coloring Strategy</label>
              <select
                v-model="params.coloringStrategy"
                class="w-full bg-neutral-800 border border-neutral-700 rounded p-1.5 text-xs outline-none text-neutral-300"
              >
                <option value="simple">Simple</option>
                <option value="inktrap">InkTrap</option>
                <option value="distance">By Distance</option>
              </select>
            </div>
            <div class="space-y-1">
              <div class="flex justify-between text-[10px] text-neutral-400 uppercase">
                <span>Angle Threshold</span>
                <span class="text-blue-400 font-mono"
                  >{{ params.angle_threshold.toFixed(1) }}°</span
                >
              </div>
              <div class="flex gap-2 items-center">
                <input
                  type="range"
                  v-model.number="params.angle_threshold"
                  min="0"
                  max="10"
                  step="0.1"
                  class="flex-1 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <input
                  type="number"
                  v-model.number="params.angle_threshold"
                  step="0.1"
                  class="w-12 bg-neutral-800 border border-neutral-700 rounded px-1 py-0.5 font-mono text-[10px] text-center outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div class="space-y-2">
              <div class="flex justify-between items-center">
                <label class="text-[10px] text-neutral-500 uppercase">Overlap Support</label>
                <input
                  type="checkbox"
                  v-model="params.overlap"
                  class="w-4 h-4 accent-blue-500 bg-neutral-800 border-neutral-700 rounded"
                />
              </div>
            </div>

            <div class="space-y-2">
              <label class="text-[10px] text-neutral-500 uppercase">Seed</label>
              <div class="flex gap-2">
                <input
                  type="number"
                  v-model.number="params.seed"
                  class="flex-1 bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 font-mono text-xs outline-none focus:border-blue-500"
                />
                <button
                  @click="randomizeSeed"
                  class="px-2 bg-neutral-800 border border-neutral-700 rounded hover:bg-neutral-700 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    class="text-neutral-400"
                  >
                    <path d="M2 18L6 14L10 18" />
                    <path d="M20 6L16 10L12 6" />
                    <path d="M22 2L2 22" />
                    <path d="M22 22L12 12" />
                    <path d="M2 2L6 6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <hr class="border-neutral-800" />

          <div class="space-y-4">
            <label class="text-[10px] text-blue-500 font-bold uppercase tracking-wider"
              >Atlas Constants</label
            >
            <div
              v-for="key in ['px_scale', 'px_range', 'px_padding'] as const"
              :key="key"
              class="space-y-1"
            >
              <div class="flex justify-between text-[10px] text-neutral-400 uppercase">
                <span>{{ key.split('_')[1] }}</span>
                <span class="text-blue-400 font-mono">{{ params[key] }}</span>
              </div>
              <input
                type="range"
                v-model.number="params[key]"
                :min="key === 'px_scale' ? 10 : 0"
                max="100"
                step="0.5"
                class="w-full accent-blue-500"
              />
            </div>
          </div>
        </div>

        <div
          class="mt-auto p-3 bg-neutral-950/50 border border-neutral-800 rounded-lg text-[10px] font-mono text-neutral-500"
        >
          <div class="flex justify-between">
            <span>CHANNELS:</span>
            <span class="text-neutral-300">{{
              params.mode >= 2 ? (params.mode === 3 ? 4 : 3) : 1
            }}</span>
          </div>
          <div class="flex justify-between">
            <span>BUFFER:</span>
            <span class="text-neutral-300">{{ canvasDim.w }}x{{ canvasDim.h }}</span>
          </div>
        </div>
      </aside>

      <Viewport
        ref="viewMTSDF"
        title="01. MTSDF Texture"
        :zoom="zoom"
        :width="canvasDim.w"
        :height="canvasDim.h"
        :display-width="displayDim.w"
        :display-height="displayDim.h"
        :global-zoom="globalZoom"
      />
      <Viewport
        ref="viewResolved"
        title="02. Resolved Output"
        :zoom="zoom"
        :width="canvasDim.w"
        :height="canvasDim.h"
        :display-width="displayDim.w"
        :display-height="displayDim.h"
        :global-zoom="globalZoom"
        is-resolved
      />
    </div>
  </div>
</template>
