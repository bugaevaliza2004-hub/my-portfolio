import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CORRIDOR } from './config'

/*
 * Два вида частиц — по одной отрисовке (Points) на каждый:
 * чёрный графит и белый мел. Смешиваются в воздухе.
 */
// parallax — насколько сдвигаются за курсором ближние частицы (м);
// у видов разная сила, поэтому слои пыли расходятся между собой
const KINDS = [
  { seed: 424242, count: 50, opacity: 0.7, size: 0.035, dot: 'dark', parallax: 0.35 },
  { seed: 777001, count: 50, opacity: 0.95, size: 0.045, dot: 'light', parallax: 0.55 },
]
// настоящий курсор = ПК/ноутбук. Только там пыль и показывается (с параллаксом за мышью)
const HAS_MOUSE = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
const NEAR = 1.2 // ближе этого к камере частиц нет (иначе — крупные размытые пятна)
const SPAN = 26 // сколько метров коридора перед камерой заполнено пылью

// Детерминированный генератор — раскладка пыли одинаковая при каждой загрузке
function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

/**
 * Мягкая круглая крупинка (canvas 32×32, рисуется один раз).
 * dark — чёрный графит; light — белый мел без обводки.
 */
function dotTexture(kind) {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  if (kind === 'dark') {
    g.addColorStop(0, 'rgba(0,0,0,1)')
    g.addColorStop(0.45, 'rgba(0,0,0,0.8)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
  } else {
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.8)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
  }
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 32)
  // цвет задаётся текстурой, а не material.color
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Создаёт частицы одного вида: Points + параметры движения (вне React-рендера) */
function createDust({ seed, count: COUNT, opacity, size, dot, parallax }) {
  const rand = rng(seed)
  const pos = new Float32Array(COUNT * 3)
  const w = CORRIDOR.width - 0.4
  const seeds = Array.from({ length: COUNT }, () => ({
    x: (rand() - 0.5) * w,
    y: 0.15 + rand() * (CORRIDOR.height - 0.3),
    z: rand() * SPAN, // мировая «фаза» по глубине
    vy: (rand() - 0.5) * 0.06, // медленный дрейф вверх/вниз
    ph: rand() * Math.PI * 2,
    f: 0.15 + rand() * 0.35, // частота покачивания
    a: 0.05 + rand() * 0.12, // амплитуда покачивания
  }))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const material = new THREE.PointsMaterial({
    size,
    map: dotTexture(dot),
    color: '#ffffff', // цвет даёт текстура
    transparent: true,
    opacity,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false,
  })
  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  /** Шаг анимации: простые вычисления на CPU для каждой точки. mx, my — сглаженный курсор −1…1 */
  const update = (t, dt, camZ, mx, my) => {
    const p = geometry.attributes.position.array
    const px = mx * parallax
    const py = my * parallax * 0.6
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i]
      // медленный дрейф по высоте с отражением от пола и потолка
      s.y += s.vy * dt
      if (s.y < 0.1 || s.y > CORRIDOR.height - 0.1) s.vy = -s.vy
      // частица стоит в мире на месте, но остаётся в «окне» вокруг камеры:
      // ушедшая за спину переносится вперёд на длину окна (и наоборот)
      const rel = (((camZ - NEAR - s.z) % SPAN) + SPAN) % SPAN
      // параллакс: ближние к камере сдвигаются за курсором сильнее дальних
      const near = 1 - rel / SPAN
      const k = near * near
      p[i * 3] = s.x + Math.sin(t * s.f + s.ph) * s.a + px * k
      p[i * 3 + 1] = s.y + Math.cos(t * s.f * 0.8 + s.ph) * s.a * 0.6 + py * k
      p[i * 3 + 2] = camZ - NEAR - rel
    }
    geometry.attributes.position.needsUpdate = true
  }

  const dispose = () => {
    geometry.dispose()
    material.map.dispose()
    material.dispose()
  }

  return { points, update, dispose }
}

let dust = null
const getDust = () => (dust ??= KINDS.map(createDust))

/**
 * Частички в воздухе: чёрный графит и белый мел вперемешку.
 * Медленно парят и покачиваются по всему коридору, всегда вокруг камеры —
 * 100 точек хватает на весь путь. Две отрисовки, простой PointsMaterial.
 * Лёгкий параллакс за курсором. На тач-устройствах пыль отключена (производительность).
 */
export default function GraphiteDust() {
  // Пыль — только на ПК (мышь/трекпад). На телефонах и планшетах её нет совсем:
  // ни геометрии, ни отрисовки, ни расчётов в кадре
  return HAS_MOUSE ? <Dust /> : null
}

function Dust() {
  const systems = getDust()

  useEffect(
    () => () => {
      getDust().forEach((d) => d.dispose())
      dust = null
    },
    [],
  )

  // сглаженное положение курсора (инерция — пыль «догоняет» мышь)
  const mouse = useRef({ x: 0, y: 0 })

  useFrame(({ clock, camera, pointer }, delta) => {
    const dt = Math.min(delta, 0.1)
    const m = mouse.current
    const k = 1 - Math.exp(-dt * 2.5)
    m.x += (pointer.x - m.x) * k
    m.y += (pointer.y - m.y) * k
    for (const d of systems) d.update(clock.elapsedTime, dt, camera.position.z, m.x, m.y)
  })

  return (
    <>
      {systems.map((d, i) => (
        <primitive key={i} object={d.points} />
      ))}
    </>
  )
}
