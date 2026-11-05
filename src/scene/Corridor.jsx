import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { CORRIDOR, NICHE, DOOR, COLORS } from './config'
import { createFloorTexture } from './floorTexture'
import Lamps from './Lamps'
import { PAPER_BUMP, paperTexture } from './sketch'
import SketchOutline from './SketchOutline'

const { width: W, height: H, wall: T, zFront, zBack } = CORRIDOR
const LENGTH = zFront - zBack
const FLOOR_W = W + NICHE.depth * 2 + 0.4
const TEX_UNIT = 2.4 // сколько метров покрывает один повтор текстуры

/**
 * Коробка коридора. Светлые — «бумажные» (текстура бумаги со штриховкой
 * в масштабе поверхности) и с карандашным контуром; чёрные — без текстуры и контура.
 */
function Box({ size, position, color = COLORS.wall }) {
  const ink = color === COLORS.line
  const [sx, sy, sz] = size
  const paper = ink ? null : paperTexture(Math.max(sx, sz), sy)
  return (
    <mesh position={position} userData={{ noOutline: ink }}>
      <boxGeometry args={size} />
      <meshLambertMaterial
        color={color}
        map={paper?.map ?? null}
        bumpMap={paper?.bumpMap ?? null}
        bumpScale={PAPER_BUMP}
      />
    </mesh>
  )
}

// Контуры коридора «от руки»: длинные рёбра — несколькими штрихами пера
const OUTLINE_OPTS = { step: 0.14, jitter: 0.009, wave: 1.6, overshoot: 0.035, lift: 0.004, maxLen: 2.5, double: 0.15 }

// Z-центры дверных проёмов
const NICHES = []
for (let z = NICHE.firstZ; z >= NICHE.lastZ; z -= NICHE.step) NICHES.push(z)

// Отрезки стены между проёмами: [z1, z2], z1 > z2
function wallSegments() {
  const segs = []
  let start = zFront
  for (const zc of NICHES) {
    segs.push([start, zc + NICHE.width / 2])
    start = zc - NICHE.width / 2
  }
  segs.push([start, zBack])
  return segs
}

function SideWall({ side }) {
  const x = side * (W / 2 + T / 2)
  return wallSegments().map(([a, b]) => {
    const len = a - b
    const z = (a + b) / 2
    return (
      <group key={a}>
        <Box size={[T, H, len]} position={[x, H / 2, z]} />
        {/* плинтус */}
        <Box size={[0.04, 0.16, len]} position={[side * (W / 2 - 0.02), 0.08, z]} color={COLORS.line} />
      </group>
    )
  })
}

/*
 * Молдинги на стенах: прямоугольные рамы-панели (верхняя и нижняя),
 * горизонтальный пояс между ними. Нарисованы «от руки» (см. buildSketchStrokes)
 * и собраны в одну геометрию: одна отрисовка на весь коридор.
 */
const MOLD = {
  t: 0.024, // толщина линии
  rail: 1.02, // высота горизонтального пояса
  lower: [0.3, 0.84], // нижняя панель (от плинтуса до пояса)
  upper: [1.22, 3.55], // верхняя панель
  endMargin: 0.32, // отступ рам от краёв участка стены
  gap: 0.3, // промежуток между соседними рамами
  maxPanel: 2.6, // максимальная ширина одной рамы
  skip: [[DOOR.z + 0.6, DOOR.z - 0.6]], // участки без молдингов (портал с дверями)
}

/** Участки стен без проёмов и портала */
function moldingSegments() {
  const out = []
  for (const [a, b] of wallSegments()) {
    let parts = [[a, b]]
    for (const [sa, sb] of MOLD.skip) {
      parts = parts.flatMap(([pa, pb]) =>
        sa <= pb || sb >= pa ? [[pa, pb]] : [[pa, Math.max(sa, pb)], [Math.min(sb, pa), pb]].filter(([x, y]) => x - y > 0.05),
      )
    }
    out.push(...parts)
  }
  return out
}

/**
 * Штрихи молдингов «от руки»: { side, a: [z, y], b: [z, y], w }.
 * Линии рам заходят за углы (overshoot) — как в быстром наброске.
 */
function moldingStrokes() {
  const strokes = []
  const { t } = MOLD
  for (const side of [-1, 1]) {
    const line = (z0, y0, z1, y1, w = t) => strokes.push({ side, a: [z0, y0], b: [z1, y1], w })
    const frame = (z0, z1, y0, y1) => {
      line(z0, y0, z1, y0) // низ
      line(z0, y1, z1, y1) // верх
      line(z0, y0, z0, y1) // ближняя стойка
      line(z1, y0, z1, y1) // дальняя стойка
    }
    for (const [a, b] of moldingSegments()) {
      line(a, MOLD.rail, b, MOLD.rail, t * 1.5) // горизонтальный пояс
      const usable = a - b - MOLD.endMargin * 2
      if (usable < 0.6) continue
      const n = Math.max(1, Math.ceil((usable + MOLD.gap) / (MOLD.maxPanel + MOLD.gap)))
      const pw = (usable - MOLD.gap * (n - 1)) / n
      for (let i = 0; i < n; i++) {
        const z0 = a - MOLD.endMargin - i * (pw + MOLD.gap)
        frame(z0, z0 - pw, ...MOLD.upper)
        frame(z0, z0 - pw, ...MOLD.lower)
      }
    }
  }
  return strokes
}

// Детерминированный генератор — рисунок не «прыгает» при перезагрузке
function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

/**
 * Геометрия «нарисованных» линий: каждый штрих — плоская лента на стене
 * с плавным дрожанием центра, неровной толщиной, заходами за концы
 * и иногда вторым, более бледным повтором (рука провела дважды).
 * Всё в одном BufferGeometry → одна отрисовка.
 */
function buildSketchStrokes(strokes) {
  const rand = seeded(20251104)
  const pos = []
  const idx = []
  const STEP = 0.12 // шаг сэмплов вдоль линии (м)
  const JITTER = 0.012 // амплитуда дрожания (м) — рука с пером

  const ribbon = (side, [az, ay], [bz, by], width, wallOffset) => {
    const dz = bz - az
    const dy = by - ay
    const len = Math.hypot(dz, dy)
    const tz = dz / len
    const ty = dy / len
    // нормаль в плоскости стены
    const nz = -ty
    const ny = tz
    // заход за концы и лёгкий перекос всей линии
    const over0 = 0.012 + rand() * 0.045
    const over1 = 0.012 + rand() * 0.045
    const skew = (rand() - 0.5) * 0.012
    const p1 = rand() * 6.28
    const p2 = rand() * 6.28
    const f1 = 2 + rand() * 3
    const f2 = 7 + rand() * 6
    const total = len + over0 + over1
    const n = Math.max(2, Math.ceil(total / STEP))
    const x = side * (W / 2 - wallOffset)
    const base = pos.length / 3
    for (let i = 0; i <= n; i++) {
      const u = i / n
      const s = -over0 + u * total
      const wob =
        JITTER * (0.65 * Math.sin(p1 + u * f1 * 6.28) + 0.35 * Math.sin(p2 + u * f2 * 6.28)) + skew * (u - 0.5)
      // нажим пера: старт с «каплей» туши, к концу линия истончается,
      // по ходу — неровная толщина
      const blob = 1 + 0.9 * Math.max(0, 1 - u * 14)
      const taper = Math.min(1, (1 - u) * 6)
      const w = width * blob * (0.45 + 0.55 * taper) * (0.7 + 0.5 * (0.5 + 0.5 * Math.sin(p2 + u * 13)))
      const cz = az + tz * s + nz * wob
      const cy = ay + ty * s + ny * wob
      pos.push(x, cy + (ny * w) / 2, cz + (nz * w) / 2)
      pos.push(x, cy - (ny * w) / 2, cz - (nz * w) / 2)
      if (i > 0) {
        const k = base + (i - 1) * 2
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    }
  }

  for (const st of strokes) {
    const len = Math.hypot(st.b[0] - st.a[0], st.b[1] - st.a[1])
    // длинные линии перо иногда проводит в два штриха с нахлёстом
    if (len > 1.2 && rand() < 0.4) {
      const cut = 0.35 + rand() * 0.3
      const lap = 0.03 + rand() * 0.05
      const mid = (t) => [st.a[0] + (st.b[0] - st.a[0]) * t, st.a[1] + (st.b[1] - st.a[1]) * t]
      ribbon(st.side, st.a, mid(cut + lap / len), st.w, 0.004)
      ribbon(st.side, mid(cut - lap / len), st.b, st.w, 0.0042)
    } else {
      ribbon(st.side, st.a, st.b, st.w, 0.004)
    }
    // ~35% линий — второй, тонкий и чуть смещённый проход
    if (rand() < 0.35) {
      const shift = (rand() - 0.5) * 0.02
      const vertical = st.a[0] === st.b[0]
      const off = vertical ? [shift, 0] : [0, shift]
      ribbon(
        st.side,
        [st.a[0] + off[0], st.a[1] + off[1]],
        [st.b[0] + off[0], st.b[1] + off[1]],
        st.w * 0.45,
        0.005,
      )
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geom.setIndex(idx)
  geom.computeBoundingSphere()
  return geom
}

function Moldings() {
  const geometry = useMemo(() => buildSketchStrokes(moldingStrokes()), [])
  useLayoutEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} frustumCulled={false} userData={{ noOutline: true }}>
      <meshBasicMaterial color={COLORS.line} side={THREE.DoubleSide} />
    </mesh>
  )
}

// Дверной проём-ниша как в классической галерее
function Niche({ side, z }) {
  const { width: NW, height: NH, depth: ND } = NICHE
  const face = side * (W / 2 - 0.015) // плоскость наличника
  return (
    <group>
      {/* перемычка над проёмом (заполняет всю глубину ниши) */}
      <Box size={[ND, H - NH, NW]} position={[side * (W / 2 + ND / 2), (NH + H) / 2, z]} />
      {/* задняя стенка */}
      <Box size={[T, NH, NW + T * 2]} position={[side * (W / 2 + ND + T / 2), NH / 2, z]} color={COLORS.nicheBack} />
      {/* откосы */}
      {[1, -1].map((d) => (
        <Box
          key={d}
          size={[ND - T, NH, T]}
          position={[side * (W / 2 + T + (ND - T) / 2), NH / 2, z + d * (NW / 2 + T / 2)]}
        />
      ))}
      {/* черный наличник */}
      {[1, -1].map((d) => (
        <Box
          key={`c${d}`}
          size={[0.03, NH + 0.08, 0.08]}
          position={[face, (NH + 0.08) / 2, z + d * (NW / 2 + 0.04)]}
          color={COLORS.line}
        />
      ))}
      <Box size={[0.03, 0.08, NW + 0.16]} position={[face, NH + 0.04, z]} color={COLORS.line} />
    </group>
  )
}

// Стена-портал, в проёме которой стоят двери
function DoorPortal() {
  const { z, openingWidth: OW, openingHeight: OH } = DOOR
  const sideW = (W - OW) / 2
  const depth = 0.3
  return (
    <group position={[0, 0, z]}>
      {[1, -1].map((s) => (
        <Box key={s} size={[sideW, H, depth]} position={[s * (OW / 2 + sideW / 2), H / 2, 0]} />
      ))}
      <Box size={[OW, H - OH, depth]} position={[0, OH + (H - OH) / 2, 0]} />
      {/* наличник с обеих сторон */}
      {[1, -1].map((f) => (
        <group key={f} position={[0, 0, f * (depth / 2 + 0.01)]}>
          {[1, -1].map((s) => (
            <Box key={s} size={[0.12, OH + 0.12, 0.02]} position={[s * (OW / 2 + 0.06), (OH + 0.12) / 2, 0]} color={COLORS.line} />
          ))}
          <Box size={[OW + 0.24, 0.12, 0.02]} position={[0, OH + 0.06, 0]} color={COLORS.line} />
        </group>
      ))}
    </group>
  )
}

export default function Corridor() {
  const gl = useThree((s) => s.gl)
  const floorTex = useMemo(() => {
    const t = createFloorTexture(gl.capabilities.getMaxAnisotropy())
    t.repeat.set(FLOOR_W / TEX_UNIT, LENGTH / TEX_UNIT)
    return t
  }, [gl])

  const zMid = (zFront + zBack) / 2

  return (
    <SketchOutline width={0.012} seed={2024} opts={OUTLINE_OPTS}>
      {/* пол */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, zMid]}>
        <planeGeometry args={[FLOOR_W, LENGTH]} />
        <meshLambertMaterial map={floorTex} />
      </mesh>

      {/* потолок */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, H, zMid]}>
        <planeGeometry args={[FLOOR_W, LENGTH]} />
        <meshLambertMaterial
          color={COLORS.ceiling}
          map={paperTexture(FLOOR_W, LENGTH).map}
          bumpMap={paperTexture(FLOOR_W, LENGTH).bumpMap}
          bumpScale={PAPER_BUMP}
        />
      </mesh>

      {/* светильники (плавно мерцают) */}
      <Lamps />

      {/* стены */}
      <SideWall side={-1} />
      <SideWall side={1} />
      <Moldings />

      {/* карниз — черные линии к точке схода */}
      {[1, -1].map((s) => (
        <Box key={s} size={[0.04, 0.06, LENGTH]} position={[s * (W / 2 - 0.02), H - 0.03, zMid]} color={COLORS.line} />
      ))}

      {NICHES.map((z) => (
        <group key={z}>
          <Niche side={-1} z={z} />
          <Niche side={1} z={z} />
        </group>
      ))}

      {/* торцевая стена */}
      <Box size={[FLOOR_W, H, T]} position={[0, H / 2, zBack]} />

      <DoorPortal />
    </SketchOutline>
  )
}
