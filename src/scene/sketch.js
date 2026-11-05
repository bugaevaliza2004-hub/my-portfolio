import * as THREE from 'three'

/*
 * «Скетч»-стиль без тяжёлых шейдеров:
 * — бумажная текстура со штриховкой карандашом (canvas, рисуется один раз);
 * — мягкие «тени» (полупрозрачные плоскости с градиентом, без реального освещения);
 * — карандашный контур: рёбра всех коробок сцены собираются в ОДНУ геометрию
 *   LineSegments (одна отрисовка на весь коридор).
 */

// Детерминированный генератор случайных чисел — рисунок всегда одинаковый
function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const PAPER_TILE = 2.4 // метров на один повтор текстуры

let paperBase = null
let bumpBase = null

/**
 * Бесшовный value-noise (несколько октав) — основа акварельных пятен и рельефа.
 * Возвращает Float32Array size×size со значениями 0…1.
 */
function tileableNoise(size, rand, octaves) {
  const out = new Float32Array(size * size)
  let amp = 1
  let norm = 0
  for (const cells of octaves) {
    const grid = Array.from({ length: cells * cells }, () => rand())
    const at = (x, y) => grid[((y + cells) % cells) * cells + ((x + cells) % cells)]
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * cells
      const y0 = Math.floor(gy)
      let ty = gy - y0
      ty = ty * ty * (3 - 2 * ty)
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * cells
        const x0 = Math.floor(gx)
        let tx = gx - x0
        tx = tx * tx * (3 - 2 * tx)
        const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx
        const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx
        out[y * size + x] += (a + (b - a) * ty) * amp
      }
    }
    norm += amp
    amp *= 0.5
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm
  return out
}

/** Заломы мятой бумаги: длинные почти прямые линии (общие для цвета и рельефа) */
function creaseLines(size, rand, count) {
  return Array.from({ length: count }, () => {
    const x = rand() * size
    const y = rand() * size
    const a = rand() * Math.PI
    const len = size * (0.25 + rand() * 0.55)
    // ломаная из 3 отрезков — залом не идеально прямой
    const pts = [[x, y]]
    let cx = x
    let cy = y
    for (let k = 0; k < 3; k++) {
      const aa = a + (rand() - 0.5) * 0.35
      cx += (Math.cos(aa) * len) / 3
      cy += (Math.sin(aa) * len) / 3
      pts.push([cx, cy])
    }
    return { pts, strength: 0.4 + rand() * 0.6 }
  })
}

/**
 * Бумага «как для скетча»: акварельные пятна, заломы, зерно, волокна,
 * карандашная штриховка. Плюс карта рельефа (bumpMap) с теми же заломами.
 * Обе текстуры бесшовные и рисуются один раз.
 */
function createPaper() {
  const size = 1024
  const rand = rng(11)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')

  const blotch = tileableNoise(size, rand, [3, 6, 12]) // крупные акварельные разводы
  const fine = tileableNoise(size, rand, [48, 96]) // мелкая шероховатость
  const creases = creaseLines(size, rand, 7)

  // цвет: тёплый белый с разводами и зерном
  const img = ctx.createImageData(size, size)
  for (let i = 0, p = 0; p < size * size; p++, i += 4) {
    const b = blotch[p] - 0.5
    const f = fine[p] - 0.5
    const grain = (rand() - 0.5) * 16
    const v = 236 + b * 34 + f * 18 + grain
    img.data[i] = v + 2
    img.data[i + 1] = v + 1
    img.data[i + 2] = v - 2
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)

  // рисуем с повтором на соседние «плитки», чтобы штрихи на краях не обрывались
  const wrapped = (draw) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(dx, dy)
  }

  // акварельные «затёки»: мягкие серые пятна с тёмной кромкой
  for (let i = 0; i < 6; i++) {
    const x = rand() * size
    const y = rand() * size
    const r = 60 + rand() * 120
    wrapped((dx, dy) => {
      const g = ctx.createRadialGradient(x + dx, y + dy, r * 0.2, x + dx, y + dy, r)
      g.addColorStop(0, 'rgba(120,120,120,0.035)')
      g.addColorStop(0.85, 'rgba(110,110,110,0.06)')
      g.addColorStop(1, 'rgba(110,110,110,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  // заломы: тёмная линия + светлый блик рядом
  for (const c of creases) {
    wrapped((dx, dy) => {
      ctx.lineCap = 'round'
      ctx.strokeStyle = `rgba(70,70,70,${0.1 * c.strength})`
      ctx.lineWidth = 1.4
      ctx.beginPath()
      c.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)))
      ctx.stroke()
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * c.strength})`
      ctx.lineWidth = 1.2
      ctx.beginPath()
      c.pts.forEach(([x, y], k) => (k ? ctx.lineTo(x + dx + 1.6, y + dy + 1.6) : ctx.moveTo(x + dx + 1.6, y + dy + 1.6)))
      ctx.stroke()
    })
  }

  // рельеф: та же основа (разводы + шероховатость + заломы), только высоты
  const bump = document.createElement('canvas')
  bump.width = bump.height = size
  const bctx = bump.getContext('2d')
  const bimg = bctx.createImageData(size, size)
  for (let i = 0, p = 0; p < size * size; p++, i += 4) {
    const v = 128 + (blotch[p] - 0.5) * 60 + (fine[p] - 0.5) * 120 + (rand() - 0.5) * 40
    bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v
    bimg.data[i + 3] = 255
  }
  bctx.putImageData(bimg, 0, 0)
  for (const c of creases) {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        bctx.lineCap = 'round'
        bctx.strokeStyle = `rgba(255,255,255,${0.7 * c.strength})` // гребень залома
        bctx.lineWidth = 3
        bctx.beginPath()
        c.pts.forEach(([x, y], k) => (k ? bctx.lineTo(x + dx, y + dy) : bctx.moveTo(x + dx, y + dy)))
        bctx.stroke()
      }
    }
  }

  const bumpTex = new THREE.CanvasTexture(bump)
  bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping
  bumpBase = bumpTex

  // волокна
  for (let i = 0; i < 140; i++) {
    const x = rand() * size
    const y = rand() * size
    const len = 8 + rand() * 22
    const a = rand() * Math.PI
    const alpha = 0.04 + rand() * 0.05
    wrapped((dx, dy) => {
      ctx.strokeStyle = `rgba(90,90,90,${alpha})`
      ctx.lineWidth = 0.7
      ctx.beginPath()
      ctx.moveTo(x + dx, y + dy)
      ctx.quadraticCurveTo(
        x + dx + Math.cos(a) * len * 0.5 + 3,
        y + dy + Math.sin(a) * len * 0.5 - 3,
        x + dx + Math.cos(a) * len,
        y + dy + Math.sin(a) * len,
      )
      ctx.stroke()
    })
  }

  // карандашная штриховка: пучки параллельных штрихов (в основном диагональ,
  // иногда перекрёстная), с неровным нажимом — как набросок карандашом
  for (let c = 0; c < 26; c++) {
    const cx = rand() * size
    const cy = rand() * size
    const n = 6 + Math.floor(rand() * 12)
    const len = 40 + rand() * 90
    const cross = rand() < 0.3
    const ang = (cross ? Math.PI / 4 : -Math.PI / 4) + (rand() - 0.5) * 0.3
    const alpha = 0.07 + rand() * 0.1
    const strokes = Array.from({ length: n }, (_, k) => ({
      off: k * (4 + rand() * 2.5),
      l: len * (0.5 + rand() * 0.5),
      j: (rand() - 0.5) * 10,
      bend: (rand() - 0.5) * 4,
      w: 0.8 + rand() * 0.9,
    }))
    wrapped((dx, dy) => {
      ctx.strokeStyle = `rgba(35,35,35,${alpha})`
      ctx.lineCap = 'round'
      for (const s of strokes) {
        ctx.lineWidth = s.w
        const px = cx + dx + Math.cos(ang + Math.PI / 2) * s.off + s.j
        const py = cy + dy + Math.sin(ang + Math.PI / 2) * s.off
        const ex = px + Math.cos(ang) * s.l
        const ey = py + Math.sin(ang) * s.l
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.quadraticCurveTo((px + ex) / 2 + s.bend, (py + ey) / 2 - s.bend, ex, ey)
        ctx.stroke()
      }
    })
  }

  const t = new THREE.CanvasTexture(canvas)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

const paperCache = new Map()

/**
 * Бумага с повтором под размер поверхности (метры): { map, bumpMap }.
 * Клоны делят одно изображение — в видеопамять каждое загружается один раз.
 */
export function paperTexture(widthM, heightM) {
  if (!paperBase) paperBase = createPaper()
  const u = Math.max(0.25, Math.round((widthM / PAPER_TILE) * 4) / 4)
  const v = Math.max(0.25, Math.round((heightM / PAPER_TILE) * 4) / 4)
  const key = `${u}|${v}`
  let t = paperCache.get(key)
  if (!t) {
    const map = paperBase.clone()
    const bumpMap = bumpBase.clone()
    map.repeat.set(u, v)
    bumpMap.repeat.set(u, v)
    t = { map, bumpMap }
    paperCache.set(key, t)
  }
  return t
}

/** Сила рельефа бумаги (bumpScale) */
export const PAPER_BUMP = 1.4

let radialShadow = null
let rectShadow = null

/** Мягкое круглое/овальное пятно (тень на полу) */
export function radialShadowTexture() {
  if (radialShadow) return radialShadow
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.45, 'rgba(0,0,0,0.55)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  radialShadow = new THREE.CanvasTexture(canvas)
  return radialShadow
}

/** Мягкий прямоугольник (тень от листа на столе). shadowBlur работает везде, включая iOS */
export function rectShadowTexture() {
  if (rectShadow) return rectShadow
  const size = 128
  const pad = 26
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.shadowColor = 'rgba(0,0,0,1)'
  ctx.shadowBlur = 18
  ctx.fillStyle = 'rgba(0,0,0,1)'
  ctx.fillRect(pad, pad, size - pad * 2, size - pad * 2)
  rectShadow = new THREE.CanvasTexture(canvas)
  return rectShadow
}
