import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { AVATAR_Z, COLORS } from './config'
import { JOURNAL } from './gallery'
import { rng } from './handDrawn'

/*
 * Красная ковровая дорожка по центру пола: от точки под аватаром
 * до стола с журналами. Нарисована «маркером»:
 *  — края неровные (полоса строится по той же дрожащей функции, что и обводка);
 *  — внутри — тайловая текстура штрихов маркера по бумаге;
 *  — по краям и торцам — чёрная линия пера.
 * Две простые геометрии (полоса + обводка), Lambert/Basic, считается один раз.
 */

const Z_START = AVATAR_Z // строго под аватаром
const Z_END = JOURNAL.tableZ // уходит под стол
const WIDTH = 1.8
const Y = 0.004 // чуть выше пола
const STEP = 0.1 // шаг по длине (м)
const TILE = 2.6 // метров на один повтор текстуры
const EDGE = { jitter: 0.022, wave: 1.9, shake: 0.006 }

let markerTex = null
/** Штрихи красного маркера вдоль дорожки; бесшовно по длине (V) */
function markerTexture() {
  if (markerTex) return markerTex
  const W = 256
  const H = 512
  const rand = rng(8080)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  ctx.lineCap = 'round'
  ctx.fillStyle = '#d9150d'
  ctx.fillRect(0, 0, W, H)

  // штрих с повтором по вертикали — текстура бесшовная по длине дорожки
  const stroke = (x0, y0, x1, y1, width, color) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    for (const dy of [0, H, -H]) {
      ctx.beginPath()
      ctx.moveTo(x0, y0 + dy)
      ctx.quadraticCurveTo((x0 + x1) / 2 + (rand() - 0.5) * 6, (y0 + y1) / 2 + dy, x1, y1 + dy)
      ctx.stroke()
    }
  }

  // широкие полупрозрачные проходы маркера вдоль дорожки — видны «полосы»
  for (let i = 0; i < 70; i++) {
    const x = rand() * W
    const y = rand() * H
    const len = 120 + rand() * 260
    const dark = rand() < 0.55
    stroke(x, y, x + (rand() - 0.5) * 10, y + len, 8 + rand() * 16,
      dark ? `rgba(150,0,0,${0.12 + rand() * 0.18})` : `rgba(255,70,50,${0.1 + rand() * 0.16})`)
  }
  // мелкая штриховка поперёк — как будто закрашивали быстро
  for (let i = 0; i < 900; i++) {
    const x = rand() * W
    const y = rand() * H
    const len = 10 + rand() * 26
    const a = -0.6 + (rand() - 0.5) * 0.3
    stroke(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, 1 + rand() * 1.8,
      rand() < 0.6 ? `rgba(140,0,0,${0.15 + rand() * 0.25})` : `rgba(255,90,70,${0.1 + rand() * 0.15})`)
  }
  // края полосы чуть плотнее (маркер «обводил» край)
  const g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0, 'rgba(110,0,0,0.35)')
  g.addColorStop(0.1, 'rgba(110,0,0,0)')
  g.addColorStop(0.9, 'rgba(110,0,0,0)')
  g.addColorStop(1, 'rgba(110,0,0,0.35)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // просветы бумаги
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = `rgba(255,235,225,${0.08 + rand() * 0.2})`
    ctx.fillRect(rand() * W, rand() * H, 1 + rand(), 1 + rand())
  }

  markerTex = new THREE.CanvasTexture(c)
  markerTex.colorSpace = THREE.SRGBColorSpace
  markerTex.wrapS = THREE.ClampToEdgeWrapping
  markerTex.wrapT = THREE.RepeatWrapping
  markerTex.anisotropy = 4
  return markerTex
}

/** Неровный край: плавная волна руки + мелкое дрожание (м) */
function edgeFn(seed) {
  const rand = rng(seed)
  const k1 = (Math.PI * 2) / EDGE.wave
  const k2 = (Math.PI * 2) / (EDGE.wave * 0.23)
  const p1 = rand() * 6.28
  const p2 = rand() * 6.28
  return (z) => EDGE.jitter * (0.7 * Math.sin(p1 + z * k1) + 0.3 * Math.sin(p2 + z * k2 * 1.07)) +
    EDGE.shake * Math.sin(z * 37.3 + p2)
}

/** Плоская лента пера по полилинии на полу (нажим меняется по ходу) */
function inkRibbon(points, width, rand, pos, idx) {
  const base = pos.length / 3
  const ph = rand() * 6.28
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)]
    const b = points[Math.min(points.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dz = b[1] - a[1]
    const l = Math.hypot(dx, dz) || 1
    const nx = -dz / l
    const nz = dx / l
    const u = i / (points.length - 1)
    const w = width * (0.75 + 0.45 * (0.5 + 0.5 * Math.sin(ph + i * 0.21))) * (1 + 0.6 * Math.max(0, 1 - u * 30))
    const [x, z] = points[i]
    pos.push(x + (nx * w) / 2, Y + 0.002, z + (nz * w) / 2, x - (nx * w) / 2, Y + 0.002, z - (nz * w) / 2)
    if (i > 0) {
      const k = base + (i - 1) * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  }
}

function buildCarpet() {
  const left = edgeFn(31)
  const right = edgeFn(57)
  const len = Z_START - Z_END
  const n = Math.ceil(len / STEP)
  const xl = (z) => -WIDTH / 2 + left(z)
  const xr = (z) => WIDTH / 2 + right(z)

  // полоса
  const pos = []
  const uv = []
  const idx = []
  for (let i = 0; i <= n; i++) {
    const z = Z_START - (i / n) * len
    const v = (Z_START - z) / TILE
    pos.push(xl(z), Y, z, xr(z), Y, z)
    uv.push(0, v, 1, v)
    if (i > 0) {
      const k = (i - 1) * 2
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2) // лицевая сторона — вверх
    }
  }
  const strip = new THREE.BufferGeometry()
  strip.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  strip.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  strip.setIndex(idx)
  strip.computeVertexNormals()
  strip.computeBoundingSphere()

  // обводка: края — по тем же функциям (совпадают с полосой), торцы — штрихом поперёк
  const rand = rng(4711)
  const ip = []
  const ii = []
  const side = (fx) => {
    // край — несколькими штрихами пера с нахлёстом
    const seg = 3.2
    for (let s = 0; s < len; s += seg) {
      const pts = []
      const a = Math.max(0, s - 0.06)
      const b = Math.min(len, s + seg + 0.06)
      for (let d = a; d <= b + 1e-6; d += 0.05) {
        const z = Z_START - d
        pts.push([fx(z) + (rand() - 0.5) * 0.002, z])
      }
      inkRibbon(pts, 0.022, rand, ip, ii)
    }
  }
  side(xl)
  side(xr)
  for (const z of [Z_START, Z_END]) {
    const pts = []
    const over = 0.03
    const x0 = xl(z) - over
    const x1 = xr(z) + over
    const ph = rand() * 6.28
    for (let t = 0; t <= 1.0001; t += 0.04) {
      pts.push([x0 + (x1 - x0) * t, z + 0.012 * Math.sin(ph + t * 7) + (rand() - 0.5) * 0.004])
    }
    inkRibbon(pts, 0.024, rand, ip, ii)
  }
  const ink = new THREE.BufferGeometry()
  ink.setAttribute('position', new THREE.Float32BufferAttribute(ip, 3))
  ink.setIndex(ii)
  ink.computeBoundingSphere()

  return { strip, ink }
}

export default function CarpetRunner() {
  const { strip, ink } = useMemo(() => buildCarpet(), [])
  useEffect(
    () => () => {
      strip.dispose()
      ink.dispose()
    },
    [strip, ink],
  )
  const map = markerTexture()

  return (
    <group>
      <mesh geometry={strip}>
        {/* без света — красный остаётся ярким, как заголовки; polygonOffset — без мерцания с полом вдали */}
        <meshBasicMaterial map={map} toneMapped={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-4} />
      </mesh>
      <mesh geometry={ink}>
        <meshBasicMaterial color={COLORS.line} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-8} />
      </mesh>
    </group>
  )
}
