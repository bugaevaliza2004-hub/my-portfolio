import * as THREE from 'three'

/*
 * «Рукотворный» стол: текстуры и контуры, нарисованные как бы от руки.
 * Всё генерируется один раз (canvas / одна геометрия) — в кадре ничего не считается.
 */

// Детерминированный генератор — рисунок одинаковый при каждой загрузке
function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

/** Карандашный штрих: короткая чуть изогнутая линия */
function hatch(ctx, rand, x, y, len, angle, width, color) {
  const dx = Math.cos(angle) * len
  const dy = Math.sin(angle) * len
  const bend = (rand() - 0.5) * len * 0.12
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + dx / 2 - Math.sin(angle) * bend, y + dy / 2 + Math.cos(angle) * bend, x + dx, y + dy)
  ctx.stroke()
}

let topTexture = null
/**
 * Столешница: «грязная» бумага, плотно заштрихованная красным карандашом/маркером.
 * Штрихи разной густоты и нажима, местами просвечивает бумага,
 * поверх — редкая поперечная штриховка и следы графита.
 */
export function tableTopTexture() {
  if (topTexture) return topTexture
  const W = 1024
  const H = 384 // пропорции столешницы 2.4 × 0.9
  const rand = rng(90210)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  ctx.lineCap = 'round'

  // бумага: тёплая, с зерном
  const img = ctx.createImageData(W, H)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 232 + Math.round((rand() - 0.5) * 22)
    img.data[i] = v + 4
    img.data[i + 1] = v
    img.data[i + 2] = v - 8
    img.data[i + 3] = 255
  }
  ctx.putImageData(img, 0, 0)

  // грязь на бумаге: размытые серые пятна
  for (let i = 0; i < 14; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = 30 + rand() * 110
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(60,45,35,${0.05 + rand() * 0.07})`)
    g.addColorStop(1, 'rgba(60,45,35,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // основной слой: плотная красная штриховка под одним углом (рука ведёт «ёлочкой»)
  const main = -1.05
  for (let i = 0; i < 12000; i++) {
    const x = rand() * (W + 80) - 40
    const y = rand() * (H + 80) - 40
    const a = main + (rand() - 0.5) * 0.18
    const alpha = 0.4 + rand() * 0.45
    const red = 200 + Math.floor(rand() * 40)
    hatch(ctx, rand, x, y, 22 + rand() * 46, a, 1.6 + rand() * 2.6, `rgba(${red},${Math.floor(rand() * 18)},${Math.floor(rand() * 14)},${alpha})`)
  }

  // поперечная штриховка — гуще в отдельных местах (как будто дорисовывали тень)
  for (let k = 0; k < 9; k++) {
    const cx = rand() * W
    const cy = rand() * H
    const n = 60 + Math.floor(rand() * 120)
    for (let i = 0; i < n; i++) {
      const x = cx + (rand() - 0.5) * 220
      const y = cy + (rand() - 0.5) * 140
      hatch(ctx, rand, x, y, 18 + rand() * 30, 0.5 + (rand() - 0.5) * 0.2, 1 + rand() * 1.6, `rgba(150,0,0,${0.12 + rand() * 0.2})`)
    }
  }

  // просветы бумаги: светлые «пропуски» маркера и зерно
  for (let i = 0; i < 1200; i++) {
    ctx.fillStyle = `rgba(255,250,240,${0.08 + rand() * 0.18})`
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 1.5, 1 + rand() * 1.5)
  }
  for (let i = 0; i < 15; i++) {
    hatch(ctx, rand, rand() * W, rand() * H, 20 + rand() * 50, main + (rand() - 0.5) * 0.2, 1 + rand() * 2, `rgba(245,235,225,${0.25 + rand() * 0.25})`)
  }

  // следы графита: смазанные тёмные штрихи
  for (let i = 0; i < 70; i++) {
    hatch(ctx, rand, rand() * W, rand() * H, 10 + rand() * 40, rand() * Math.PI, 0.8 + rand(), `rgba(30,20,20,${0.08 + rand() * 0.14})`)
  }

  // к краям — чуть плотнее и темнее (рука «обводит» контур)
  const edge = ctx.createLinearGradient(0, 0, 0, H)
  edge.addColorStop(0, 'rgba(90,0,0,0.18)')
  edge.addColorStop(0.12, 'rgba(90,0,0,0)')
  edge.addColorStop(0.88, 'rgba(90,0,0,0)')
  edge.addColorStop(1, 'rgba(90,0,0,0.18)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, W, H)

  topTexture = new THREE.CanvasTexture(c)
  topTexture.colorSpace = THREE.SRGBColorSpace
  topTexture.anisotropy = 4
  return topTexture
}

let pinTexture = null
/** Прищепка: та же плотная красная карандашная штриховка по бумаге, в масштабе маленькой детали */
export function clothespinTexture() {
  if (pinTexture) return pinTexture
  const W = 64
  const H = 256 // пропорции половинки прищепки ≈ 0.036 × 0.15
  const rand = rng(5150)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  ctx.lineCap = 'round'
  // деталь мелкая: издалека штрихи усредняются, поэтому основа сразу
  // насыщенно-красная, а штриховка — светлее/темнее её (иначе прищепка выглядит розовой)
  ctx.fillStyle = '#e8180f'
  ctx.fillRect(0, 0, W, H)
  // плотная штриховка под углом: тёмно-красные и чуть светлые штрихи
  for (let i = 0; i < 1100; i++) {
    const dark = rand() < 0.6
    const color = dark
      ? `rgba(${150 + Math.floor(rand() * 40)},0,0,${0.35 + rand() * 0.4})`
      : `rgba(255,${60 + Math.floor(rand() * 40)},${50 + Math.floor(rand() * 30)},${0.25 + rand() * 0.3})`
    hatch(ctx, rand, rand() * (W + 20) - 10, rand() * (H + 20) - 10, 8 + rand() * 16, -1.05 + (rand() - 0.5) * 0.2, 1.4 + rand() * 1.8, color)
  }
  // поперечные штрихи потемнее
  for (let i = 0; i < 120; i++) {
    hatch(ctx, rand, rand() * W, rand() * H, 6 + rand() * 10, 0.5 + (rand() - 0.5) * 0.2, 1 + rand(), `rgba(120,0,0,${0.2 + rand() * 0.25})`)
  }
  // редкие просветы бумаги
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,235,225,${0.15 + rand() * 0.2})`
    ctx.fillRect(rand() * W, rand() * H, 1, 1)
  }
  pinTexture = new THREE.CanvasTexture(c)
  pinTexture.colorSpace = THREE.SRGBColorSpace
  return pinTexture
}

let graphite = null
/** Ножки и перекладины: тёмный графит с продольными штрихами и зерном */
export function graphiteTexture() {
  if (graphite) return graphite
  const W = 64
  const H = 256
  const rand = rng(31337)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  ctx.lineCap = 'round'
  ctx.fillStyle = '#1b1b1b'
  ctx.fillRect(0, 0, W, H)
  // продольные штрихи карандаша — светлее и темнее основы
  for (let i = 0; i < 160; i++) {
    const x = rand() * W
    const y = rand() * H
    const light = rand() < 0.55
    const color = light ? `rgba(120,120,120,${0.08 + rand() * 0.18})` : `rgba(0,0,0,${0.3 + rand() * 0.4})`
    hatch(ctx, rand, x, y, 30 + rand() * 90, Math.PI / 2 + (rand() - 0.5) * 0.12, 0.8 + rand() * 1.6, color)
  }
  // блеск графита и зерно бумаги
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(200,200,200,${0.05 + rand() * 0.12})`
    ctx.fillRect(rand() * W, rand() * H, 1, 1)
  }
  graphite = new THREE.CanvasTexture(c)
  graphite.colorSpace = THREE.SRGBColorSpace
  graphite.wrapS = graphite.wrapT = THREE.RepeatWrapping
  return graphite
}
