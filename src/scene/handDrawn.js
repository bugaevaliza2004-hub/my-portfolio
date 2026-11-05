import * as THREE from 'three'

/*
 * Линии «от руки» для всей сцены. Каждый штрих — плоская лента (или две
 * скрещенные — для рёбер в 3D, чтобы линия была видна с любого ракурса):
 * плавная волна + мелкое дрожание (по длине в метрах — одинаково на коротких
 * и длинных рёбрах), неровный нажим, капля в начале, заход за концы,
 * длинные линии — несколькими штрихами, иногда второй бледный проход.
 * Строится один раз; в кадре ничего не считается (одна геометрия = одна отрисовка).
 */

export function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

const DEFAULTS = {
  step: 0.035, // шаг вдоль линии (м)
  jitter: 0.0045, // амплитуда дрожания (м)
  wave: 0.6, // длина «волны» руки (м); мелкое дрожание — в ~4 раза короче
  overshoot: 0.02, // заход за концы (м)
  lift: 0.002, // насколько ребро вынесено наружу коробки (без мерцания)
  maxLen: Infinity, // длиннее — рисуется несколькими штрихами
  double: 0.3, // доля линий со вторым проходом
}

function createBuilder(seed, opts) {
  const o = { ...DEFAULTS, ...opts }
  const rand = rng(seed)
  const pos = []
  const idx = []
  const t = new THREE.Vector3()

  /** Лента от a до b; дрожание — по n1/n2, ширина — по wDir */
  const ribbon = (a, b, n1, n2, wDir, width) => {
    t.subVectors(b, a)
    const len = t.length()
    if (len < 1e-5) return
    t.divideScalar(len)
    const over0 = o.overshoot * (0.2 + rand())
    const over1 = o.overshoot * (0.2 + rand())
    const total = len + over0 + over1
    const n = Math.max(2, Math.ceil(total / o.step))
    const k1 = (Math.PI * 2) / (o.wave * (0.7 + rand() * 0.6))
    const k2 = (Math.PI * 2) / (o.wave * (0.2 + rand() * 0.1))
    const p = [rand() * 6.28, rand() * 6.28, rand() * 6.28]
    const base = pos.length / 3
    for (let i = 0; i <= n; i++) {
      const u = i / n
      const s = -over0 + u * total
      const w1 = o.jitter * (0.7 * Math.sin(p[0] + s * k1) + 0.3 * Math.sin(p[1] + s * k2))
      const w2 = o.jitter * 0.6 * Math.sin(p[2] + s * k1 * 0.8)
      // нажим: капля в начале, истончение к концу, неровность по ходу
      const blob = 1 + 0.7 * Math.max(0, 1 - u * 10)
      const taper = Math.min(1, (1 - u) * 5)
      const w = width * blob * (0.5 + 0.5 * taper) * (0.75 + 0.45 * (0.5 + 0.5 * Math.sin(p[1] + s * k2 * 0.6)))
      const cx = a.x + t.x * s + n1.x * w1 + n2.x * w2
      const cy = a.y + t.y * s + n1.y * w1 + n2.y * w2
      const cz = a.z + t.z * s + n1.z * w1 + n2.z * w2
      pos.push(cx + (wDir.x * w) / 2, cy + (wDir.y * w) / 2, cz + (wDir.z * w) / 2)
      pos.push(cx - (wDir.x * w) / 2, cy - (wDir.y * w) / 2, cz - (wDir.z * w) / 2)
      if (i > 0) {
        const k = base + (i - 1) * 2
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    }
  }

  /**
   * Линия a→b: длинная — несколькими штрихами с нахлёстом; иногда второй проход.
   * widths — направления ширины лент (одно — плоская линия, два — скрещенные).
   */
  const line = (a, b, n1, n2, widths, width) => {
    const len = a.distanceTo(b)
    const parts = Math.max(1, Math.ceil(len / o.maxLen))
    for (let j = 0; j < parts; j++) {
      const lap = parts > 1 ? 0.03 / len : 0
      const pa = a.clone().lerp(b, Math.max(0, j / parts - lap))
      const pb = a.clone().lerp(b, Math.min(1, (j + 1) / parts + lap))
      for (const wd of widths) ribbon(pa, pb, n1, n2, wd, width)
    }
    if (rand() < o.double) {
      const sh = (rand() - 0.5) * o.jitter * 1.8
      const a2 = a.clone().addScaledVector(n1, sh)
      const b2 = b.clone().addScaledVector(n1, sh)
      for (const wd of widths) ribbon(a2, b2, n1, n2, wd, width * 0.45)
    }
  }

  const geometry = () => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setIndex(idx)
    g.computeBoundingSphere()
    return g
  }

  return { line, geometry, opts: o }
}

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]

/** 12 рёбер коробки (size, center, optional matrix) → в builder */
function addBox(builder, size, position, width, matrix) {
  const { lift } = builder.opts
  const half = size.map((v) => v / 2)
  const center = new THREE.Vector3(...position)
  // направления осей с учётом поворота коробки
  const axes = AXES.map((ax) => (matrix ? ax.clone().transformDirection(matrix) : ax))
  for (let axis = 0; axis < 3; axis++) {
    const o1 = (axis + 1) % 3
    const o2 = (axis + 2) % 3
    for (const s1 of [-1, 1]) {
      for (const s2 of [-1, 1]) {
        const a = center.clone()
        a.setComponent(axis, a.getComponent(axis) - half[axis])
        a.setComponent(o1, a.getComponent(o1) + s1 * (half[o1] + lift))
        a.setComponent(o2, a.getComponent(o2) + s2 * (half[o2] + lift))
        const b = a.clone()
        b.setComponent(axis, b.getComponent(axis) + size[axis])
        if (matrix) {
          a.applyMatrix4(matrix)
          b.applyMatrix4(matrix)
        }
        builder.line(a, b, axes[o1], axes[o2], [axes[o1], axes[o2]], width)
      }
    }
  }
}

/** Контуры коробок: [{ size, position, width }] → одна геометрия */
export function buildBoxStrokes(boxes, seed = 1, opts) {
  const b = createBuilder(seed, opts)
  for (const { size, position, width } of boxes) addBox(b, size, position, width)
  return b.geometry()
}

/**
 * Контуры всех BoxGeometry внутри root (в системе координат root).
 * Пропускает меши с userData.noOutline (чёрные «тушевые» детали).
 */
export function buildOutlineStrokes(root, width, seed = 1, opts) {
  const b = createBuilder(seed, opts)
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
  root.traverse((obj) => {
    if (!obj.isMesh || obj.userData.noOutline || obj.geometry.type !== 'BoxGeometry') return
    const { width: w, height: h, depth: d } = obj.geometry.parameters
    const m = new THREE.Matrix4().multiplyMatrices(inv, obj.matrixWorld)
    addBox(b, [w, h, d], [0, 0, 0], width, m)
  })
  return b.geometry()
}

/** Рамка-прямоугольник w×h в плоскости XY (z = 0), центр в начале координат */
export function buildRectStrokes(w, h, width, seed = 1, opts) {
  const b = createBuilder(seed, { lift: 0, ...opts })
  const [X, Y, Z] = AXES
  const x = w / 2
  const y = h / 2
  const v = (px, py) => new THREE.Vector3(px, py, 0)
  b.line(v(-x, -y), v(x, -y), Y, Z, [Y], width) // низ
  b.line(v(x, y), v(-x, y), Y, Z, [Y], width) // верх
  b.line(v(-x, y), v(-x, -y), X, Z, [X], width) // лево
  b.line(v(x, -y), v(x, y), X, Z, [X], width) // право
  return b.geometry()
}

/**
 * Верёвка «от руки»: трубка вдоль X от -len/2 до len/2, с лёгким провисом
 * и неровностью. Простая TubeGeometry — одна отрисовка.
 */
export function buildRopeGeometry(len, radius, seed = 1, { sag = 0.014, jitter = 0.004 } = {}) {
  const rand = rng(seed)
  const pts = []
  const n = 24
  const p1 = rand() * 6.28
  const p2 = rand() * 6.28
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const x = -len / 2 + u * len
    const edge = Math.sin(u * Math.PI) // у стен неровность сходит на нет
    const y = -sag * edge + jitter * edge * (0.6 * Math.sin(p1 + u * 9) + 0.4 * Math.sin(p2 + u * 23))
    const z = jitter * 0.6 * edge * Math.sin(p2 + u * 7)
    pts.push(new THREE.Vector3(x, y, z))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, radius, 6, false)
}
