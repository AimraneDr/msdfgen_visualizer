// @ts-ignore
import initMsdfModule from '@/assets/msdf_wrapper.js'

export interface MsdfParams {
  mode: 0 | 1 | 2 | 3 // 0:SDF, 1:PSDF, 2:MSDF, 3:MTSDF
  px_scale: number
  px_range: number
  px_padding: number
  seed: number
  errorMode: number
  overlap: boolean
  coloringStrategy: 'simple' | 'inktrap' | 'distance'
  angle_threshold: number
}

export class MsdfEngine {
  private module: any
  private ftHandle: any
  private fontHandle: any
  private generate_glyph: any

  // Add this method or update the existing init in msdfEngine.ts
  async loadFont(fontUrl: string | File) {
    // Cleanup existing font if it exists
    if (this.fontHandle) {
      this.module._destroyFont(this.fontHandle)
    }

    let buf: ArrayBuffer
    if (fontUrl instanceof File) {
      buf = await fontUrl.arrayBuffer()
    } else {
      const resp = await fetch(fontUrl)
      buf = await resp.arrayBuffer()
    }

    const filename = `font_${Date.now()}.ttf`
    this.module.FS.writeFile(filename, new Uint8Array(buf))

    this.fontHandle = this.module.ccall(
      'loadFont',
      'number',
      ['number', 'string'],
      [this.ftHandle, filename],
    )

    // Clean up the virtual file system after loading into memory
    this.module.FS.unlink(filename)
  }

  async init(fontUrl: string) {
    this.module = await initMsdfModule({
      locateFile: (path: string) => (path.endsWith('.wasm') ? '/msdf_wrapper.wasm' : path),
    })

    this.generate_glyph = this.module.cwrap('msdf_generate', null, [
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
      'number',
    ])

    this.ftHandle = this.module._init_freetype()
    this.loadFont(fontUrl)
  }

  generate(char: string, params: MsdfParams) {
    const charCode = char.charCodeAt(0)
    const shape = this.module._msdf_shape_create()
    const advancePtr = this.module._malloc(8)

    if (!this.module._msdf_load_glyph(shape, this.fontHandle, charCode, advancePtr)) {
      this.module._free(advancePtr)
      return null
    }

    this.module._msdf_shape_normalize(shape)
    const angle = params.angle_threshold
    switch (params.coloringStrategy) {
      case 'simple':
        this.module._msdf_shape_edge_coloring_simple(shape, angle, BigInt(params.seed))
        break
      case 'distance':
        this.module._msdf_shape_edge_coloring_by_distance(shape, angle, BigInt(params.seed))
        break
      case 'inktrap':
      default:
        this.module._msdf_shape_edge_coloring_inktrap(shape, 3.0, BigInt(params.seed))
        break
    }
    const boundsPtr = this.module._malloc(32)
    this.module._msdf_shape_get_bounds(
      shape,
      boundsPtr,
      boundsPtr + 8,
      boundsPtr + 16,
      boundsPtr + 24,
    )

    const l = this.module.HEAPF64[boundsPtr / 8]
    const b = this.module.HEAPF64[(boundsPtr + 8) / 8]
    const r = this.module.HEAPF64[(boundsPtr + 16) / 8]
    const t = this.module.HEAPF64[(boundsPtr + 24) / 8]

    /**
     * 1. STABLE DISPLAY DIMENSIONS
     */
    const fixedLayoutScale = 40
    const displayW = Math.max(1, (r - l) * fixedLayoutScale)
    const displayH = Math.max(1, (t - b) * fixedLayoutScale)

    /**
     * 2. ATLAS BUFFER DIMENSIONS
     */
    const bufferW = Math.max(1, Math.ceil((r - l) * params.px_scale + params.px_padding * 2))
    const bufferH = Math.max(1, Math.ceil((t - b) * params.px_scale + params.px_padding * 2))

    // Offset the glyph inside the buffer to account for padding
    const tx = -l + params.px_padding / params.px_scale
    const ty = -b + params.px_padding / params.px_scale
    const range_em = params.px_range / params.px_scale

    const channels = params.mode >= 2 ? (params.mode === 3 ? 4 : 3) : 1
    const bufferSize = bufferW * bufferH * channels * 4
    const bufferPtr = this.module._malloc(bufferSize)
    this.generate_glyph(
      params.mode,
      shape,
      bufferW,
      bufferH,
      bufferPtr,
      range_em,
      params.px_scale,
      tx,
      ty,
      params.errorMode,
      params.overlap,
    )

    const pixels = new Float32Array(
      this.module.HEAPF32.buffer,
      bufferPtr,
      bufferW * bufferH * channels,
    ).slice()

    // Cleanup WASM memory
    this.module._free(bufferPtr)
    this.module._free(boundsPtr)
    this.module._msdf_shape_free(shape)
    this.module._free(advancePtr)

    return { pixels, width: bufferW, height: bufferH, displayW, displayH, channels }
  }

  dispose() {
    if (this.fontHandle) this.module._destroyFont(this.fontHandle)
    if (this.ftHandle) this.module._destroy_freetype(this.ftHandle)
  }
}
