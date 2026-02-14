<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  title: string
  width: number
  height: number
  displayWidth: number
  displayHeight: number
  isResolved?: boolean
  globalZoom: number
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLElement | null>(null)

// 1. ZOOM LOGIC
const localZoom = ref(props.globalZoom)
const MAX_ZOOM = 150 // Choose your limit here
const MIN_ZOOM = 0.5

watch(
  () => props.globalZoom,
  (newVal) => {
    localZoom.value = newVal
  },
)

const handleWheel = (e: WheelEvent) => {
  e.preventDefault()
  const delta = e.deltaY > 0 ? 0.9 : 1.1
  const nextZoom = localZoom.value * delta
  localZoom.value = Math.min(Math.max(nextZoom, MIN_ZOOM), MAX_ZOOM)
}

// 2. DRAG TO PAN LOGIC
const isPanning = ref(false)
let startX = 0,
  startY = 0,
  scrollL = 0,
  scrollT = 0

const startPan = (e: MouseEvent) => {
  if (!containerRef.value) return

  isPanning.value = true
  // Store initial state
  startX = e.pageX - containerRef.value.offsetLeft
  startY = e.pageY - containerRef.value.offsetTop
  scrollL = containerRef.value.scrollLeft
  scrollT = containerRef.value.scrollTop

  // Add global listeners so drag continues even if mouse leaves the div
  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', stopPan)
}

const handleMouseMove = (e: MouseEvent) => {
  if (!isPanning.value || !containerRef.value) return

  e.preventDefault()
  const x = e.pageX - containerRef.value.offsetLeft
  const y = e.pageY - containerRef.value.offsetTop

  // Calculate distance moved
  const walkX = x - startX
  const walkY = y - startY

  // Update scroll position
  containerRef.value.scrollLeft = scrollL - walkX
  containerRef.value.scrollTop = scrollT - walkY
}

const stopPan = () => {
  isPanning.value = false
  window.removeEventListener('mousemove', handleMouseMove)
  window.removeEventListener('mouseup', stopPan)
}

defineExpose({ canvas: canvasRef })
</script>

<template>
  <section
    class="flex-1 flex flex-col min-w-0 min-h-0 border-r border-neutral-800 last:border-r-0 bg-[radial-gradient(#1a1a1a_1px,transparent_1px)] [background-size:20px_20px]"
  >
    <div
      class="p-3 border-b border-neutral-800 bg-neutral-950/50 flex justify-between items-center shrink-0"
    >
      <span class="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.3em]">{{
        title
      }}</span>
      <span class="text-[10px] font-mono text-neutral-600">{{ localZoom.toFixed(1) }}x</span>
    </div>

    <div
      ref="containerRef"
      @mousedown="startPan"
      @wheel="handleWheel"
      class="flex-1 overflow-auto p-32 flex items-center justify-center custom-scrollbar select-none cursor-grab active:cursor-grabbing"
    >
      <div
        class="relative shrink-0 shadow-2xl border border-neutral-800 bg-black"
        :style="{
          width: displayWidth * localZoom + 'px',
          height: displayHeight * localZoom + 'px',
        }"
      >
        <canvas
          ref="canvasRef"
          class="absolute inset-0 w-full h-full pointer-events-none"
          style="image-rendering: pixelated; object-fit: contain"
          :class="{ 'opacity-90': isResolved }"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #444;
}
</style>
