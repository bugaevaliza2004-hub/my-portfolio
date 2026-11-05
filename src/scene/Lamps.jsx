import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CORRIDOR, NICHE } from './config'

const { height: H, zBack } = CORRIDOR

// Белый мягкий ореол (canvas 64×64, рисуется один раз)
let haloTexture = null
function getHaloTexture() {
  if (haloTexture) return haloTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  haloTexture = new THREE.CanvasTexture(c)
  return haloTexture
}

// Плавная «пульсация» 0…1: сумма двух медленных синусов (без рывков)
const pulse = (t, ph) => 0.5 + 0.3 * Math.sin(t * 0.8 + ph) + 0.2 * Math.sin(t * 2.1 + ph * 1.7)

/**
 * Потолочные светильники. Каждый очень плавно и едва заметно «дышит»
 * яркостью (как старые лампы в галерее) — в своей фазе.
 * Только смена цвета/прозрачности материала, без источников света и теней.
 */
export default function Lamps() {
  const lamps = useMemo(() => {
    const list = []
    let i = 0
    for (let z = NICHE.firstZ + NICHE.step / 2; z > zBack + 2; z -= NICHE.step) {
      list.push({ z, ph: (i++ * 2.399) % (Math.PI * 2) }) // «золотой угол» — фазы не совпадают
    }
    return list
  }, [])
  const lampMats = useRef([])
  const haloMats = useRef([])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    lamps.forEach(({ ph }, i) => {
      const p = pulse(t, ph)
      lampMats.current[i]?.color.setScalar(0.9 + 0.1 * p) // яркость лампы ±5%
      if (haloMats.current[i]) haloMats.current[i].opacity = 0.35 + 0.3 * p
    })
  })

  const halo = getHaloTexture()

  return (
    <group>
      {lamps.map(({ z }, i) => (
        <group key={z}>
          <mesh position={[0, H - 0.02, z]}>
            <boxGeometry args={[1.6, 0.03, 0.5]} />
            <meshBasicMaterial ref={(el) => { lampMats.current[i] = el }} color="#ffffff" toneMapped={false} />
          </mesh>
          {/* ореол света на потолке вокруг лампы */}
          <mesh position={[0, H - 0.004, z]} rotation={[Math.PI / 2, 0, 0]} userData={{ noOutline: true }}>
            <planeGeometry args={[3.4, 1.8]} />
            <meshBasicMaterial
              ref={(el) => { haloMats.current[i] = el }}
              map={halo}
              transparent
              opacity={0.5}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * Общий свет коридора: тоже едва заметно «дышит» (±3%) —
 * стены и пол чуть светлеют и темнеют вслед за лампами.
 */
export function GalleryLights() {
  const amb = useRef()
  const hemi = useRef()
  useFrame(({ clock }) => {
    const k = 1 + 0.03 * (pulse(clock.elapsedTime * 0.7, 1.3) * 2 - 1)
    amb.current.intensity = 1.2 * k
    hemi.current.intensity = 2.2 * k
  })
  return (
    <>
      <ambientLight ref={amb} intensity={1.2} />
      <hemisphereLight ref={hemi} args={['#ffffff', '#9a9a9a', 2.2]} />
    </>
  )
}
