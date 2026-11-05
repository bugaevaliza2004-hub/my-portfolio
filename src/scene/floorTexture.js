import * as THREE from 'three'

// Детерминированный генератор случайных чисел — пол всегда одинаковый
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Пол-скетч: светлые «бумажные» доски, нарисованные карандашом.
 * Доски идут вдоль оси V (в сцене — вдоль Z, к точке схода).
 * Контуры — неровные двойные штрихи, волокна — тонкие карандашные линии,
 * местами — штриховка «тени». Текстура бесшовная, рисуется один раз.
 */
export function createFloorTexture(anisotropy = 1) {
  const size = 1024
  const planks = 8
  const pw = size / planks
  const rand = mulberry32(7)

  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')

  // бумага: тёплый светло-серый с зерном
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 222 + Math.round((rand() - 0.5) * 18)
    img.data[i] = v + 2
    img.data[i + 1] = v + 1
    img.data[i + 2] = v - 3
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  ctx.lineCap = 'round'

  /**
   * Линия «от руки» от (x0,y0) до (x1,y1): плавная волна (рука ведёт неровно)
   * + мелкое дрожание, неровный нажим, редкие отрывы пера.
   * Рисуется короткими отрезками разной толщины; по Y — с повтором (бесшовность).
   * Волна у длинных линий бесшовная по Y (целое число периодов на высоту текстуры).
   */
  const pencil = (x0, y0, x1, y1, width, alpha, jitter = 1.6) => {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const tx = (x1 - x0) / len
    const ty = (y1 - y0) / len
    const nx = -ty
    const ny = tx
    const longLine = len >= size * 0.99
    const amp = jitter * (longLine ? 1.6 : 1)
    const k1 = longLine ? 2 + Math.floor(rand() * 3) : 0.5 + rand()
    const k2 = longLine ? 7 + Math.floor(rand() * 6) : 2 + rand() * 2
    const p1 = rand() * 6.28
    const p2 = rand() * 6.28
    const steps = Math.max(3, Math.ceil(len / 6))
    // точки линии (одинаковые для всех повторов)
    const pts = []
    for (let s = 0; s <= steps; s++) {
      const u = s / steps
      const wave = amp * (0.7 * Math.sin(p1 + u * k1 * 6.283) + 0.3 * Math.sin(p2 + u * k2 * 6.283))
      const shake = (rand() - 0.5) * jitter * 0.5
      const off = wave + shake
      pts.push([x0 + (x1 - x0) * u + nx * off, y0 + (y1 - y0) * u + ny * off])
    }
    // нажим по отрезкам; иногда — отрыв пера
    const widths = pts.map((_, s) => width * (0.55 + 0.8 * (0.5 + 0.5 * Math.sin(p2 + (s / steps) * 17))))
    const gaps = pts.map(() => rand() < 0.012)
    // линия у края текстуры дорисовывается и с другой стороны (бесшовность по X)
    const xs = pts.map((p) => p[0])
    const dxs = Math.min(...xs) < 4 || Math.max(...xs) > size - 4 ? [0, size, -size] : [0]
    ctx.strokeStyle = `rgba(22,22,22,${alpha})`
    for (const dx of dxs) {
      for (const dy of [0, size, -size]) {
        for (let s = 1; s <= steps; s++) {
          if (gaps[s]) continue
          ctx.lineWidth = widths[s]
          ctx.beginPath()
          ctx.moveTo(pts[s - 1][0] + dx, pts[s - 1][1] + dy)
          ctx.lineTo(pts[s][0] + dx, pts[s][1] + dy)
          ctx.stroke()
        }
      }
    }
  }

  // зерно пола: мелкие тёмные и светлые крупинки (бесшовно — попиксельно)
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size
    const y = rand() * size
    ctx.fillStyle = rand() < 0.6 ? `rgba(0,0,0,${0.05 + rand() * 0.1})` : `rgba(255,255,255,${0.25 + rand() * 0.3})`
    ctx.fillRect(x, y, 1 + rand() * 1.4, 1 + rand() * 1.4)
  }

  for (let i = 0; i < planks; i++) {
    const x = i * pw

    // лёгкий тон доски — чтобы доски различались, как при растушёвке
    const tone = (rand() - 0.5) * 0.08
    ctx.fillStyle = tone > 0 ? `rgba(255,255,255,${tone})` : `rgba(0,0,0,${-tone})`
    ctx.fillRect(x, 0, pw, size)

    // продольный шов: основной штрих + бледный повтор (рука провела дважды)
    pencil(x + 1, 0, x + 1, size, 2.2, 0.8, 4)
    pencil(x + 3.5, 0, x + 3.5, size, 1, 0.3, 5)

    // торцевые стыки досок (разбежка), сумма длин = size → бесшовно
    const count = rand() > 0.5 ? 3 : 2
    const cuts = Array.from({ length: count - 1 }, () => rand()).sort()
    const offset = rand() * size
    const joints = [0, ...cuts].map((c) => (c * size + offset) % size)

    for (const jy of joints) {
      // торец: с заходом за шов, как в быстром наброске
      pencil(x - 3 + rand() * 3, jy, x + pw + 1 + rand() * 3, jy + (rand() - 0.5) * 5, 1.8, 0.75, 2.5)
      // гвоздики у стыка
      for (const nx of [x + pw * 0.22, x + pw * 0.78]) {
        for (const dy of [0, size]) {
          ctx.fillStyle = 'rgba(20,20,20,0.6)'
          ctx.beginPath()
          ctx.arc(nx, jy + 7 + dy, 1.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // волокна: длинные тонкие волнистые штрихи вдоль доски
    for (let k = 0; k < 7; k++) {
      const gx = x + 8 + rand() * (pw - 16)
      const y0 = rand() * size
      const len = 120 + rand() * 320
      const sway = (rand() - 0.5) * 10
      const a = 0.12 + rand() * 0.16
      for (const dy of [0, size, -size]) {
        ctx.strokeStyle = `rgba(30,30,30,${a})`
        ctx.lineWidth = 0.8
        ctx.beginPath()
        ctx.moveTo(gx, y0 + dy)
        ctx.bezierCurveTo(gx + sway, y0 + len * 0.33 + dy, gx - sway, y0 + len * 0.66 + dy, gx + sway * 0.4, y0 + len + dy)
        ctx.stroke()
      }
    }

    // сучок — овальные кольца
    if (rand() > 0.55) {
      const kx = x + pw * (0.3 + rand() * 0.4)
      const ky = size * (0.1 + rand() * 0.8)
      ctx.strokeStyle = 'rgba(25,25,25,0.35)'
      ctx.lineWidth = 0.9
      for (let r = 2; r < 11; r += 3) {
        ctx.beginPath()
        ctx.ellipse(kx, ky, r * 0.75, r * 2.2, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // карандашная штриховка-«тень» вдоль края доски (1–2 пучка на доску)
    const hatches = rand() > 0.3 ? 1 + Math.floor(rand() * 2) : 0
    for (let h = 0; h < hatches; h++) {
      const sy = rand() * size
      const n = 12 + Math.floor(rand() * 20)
      const fromLeft = rand() > 0.5
      for (let k = 0; k < n; k++) {
        const yy = sy + k * 5.5
        const l = 14 + rand() * 18
        const sx = fromLeft ? x + 5 : x + pw - 5 - l
        pencil(sx, yy, sx + l, yy - 10, 0.8, 0.2 + rand() * 0.1, 0.8)
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = anisotropy
  return texture
}
