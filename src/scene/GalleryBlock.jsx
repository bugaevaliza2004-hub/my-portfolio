import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { CORRIDOR, COLORS, scrollState, smoothstep } from './config'
import { GALLERY, GALLERY_STYLE, blockReveal, layoutRow } from './gallery'
import { radialShadowTexture } from './sketch'
import { clothespinTexture } from './tableSketch'
import { buildBoxStrokes, buildRectStrokes, buildRopeGeometry } from './handDrawn'

const SHADOW_OPACITY = 0.32 // плотность «тени» на полу под работами
// Покачивание листов (радианы): из стороны в сторону и чуть к камере/от неё
const SWAY = { side: 0.016, depth: 0.02 }

const PIN = { w: 0.036, h: 0.15, d: 0.012 } // красные (штриховка) — в цвет заголовков

// Половинки прищепки (относительно её центра) — для мешей и для контура «от руки»
const PIN_HALVES = [1, -1].map((s) => ({ size: [PIN.w, PIN.h, PIN.d], position: [0, 0, s * (PIN.d / 2 + 0.003)], width: 0.0028 }))
// Одна общая геометрия дрожащего контура и общий материал — на все прищепки
let pinStrokes = null
const getPinStrokes = () =>
  (pinStrokes ??= buildBoxStrokes(PIN_HALVES, 777, { step: 0.006, jitter: 0.0011, wave: 0.06, overshoot: 0.005, lift: 0.0006 }))

/** Прищепка «от руки»: красная карандашная штриховка, дрожащий контур, пружина, рифление */
function Clothespin({ x, y }) {
  const pinMap = clothespinTexture()
  return (
    <group position={[x, y, 0]}>
      {PIN_HALVES.map((h) => (
        <mesh key={h.position[2]} position={h.position}>
          <boxGeometry args={h.size} />
          {/* без света и тумана — красный остаётся ярким, как заголовки */}
          <meshBasicMaterial color="#ffffff" map={pinMap} fog={false} toneMapped={false} />
        </mesh>
      ))}
      <mesh geometry={getPinStrokes()}>
        <meshBasicMaterial color={COLORS.line} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.005, 0]}>
        <boxGeometry args={[PIN.w + 0.008, 0.018, PIN.d * 2 + 0.014]} />
        <meshLambertMaterial color={COLORS.line} />
      </mesh>
      {[0.035, 0.05].map((dy) => (
        <mesh key={dy} position={[0, dy, PIN.d + 0.004]}>
          <boxGeometry args={[PIN.w * 0.8, 0.004, 0.002]} />
          <meshBasicMaterial color={COLORS.line} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Блок галереи: веревки поперек коридора, на них работы с прищепками
 * (лицом к камере). Появляется по скроллу: веревки натягиваются от центра,
 * работы по очереди опускаются на них. Скролл назад — всё убирается.
 * Клик по работе (raycast R3F) открывает модал с оригиналом.
 */
export default function GalleryBlock({ index, onOpen }) {
  const block = GALLERY[index]
  const gl = useThree((s) => s.gl)

  // Раскладка: все работы блока плоским списком
  const { rows, works } = useMemo(() => {
    const flat = []
    const laidOut = block.rows.map((row) => {
      const { items } = layoutRow(row)
      return {
        ropeY: row.ropeY,
        items: items.map((item, i) => {
          const entry = { ...item, ...row.works[i], ropeY: row.ropeY, index: flat.length }
          flat.push(entry)
          return entry
        }),
      }
    })
    return { rows: laidOut, works: flat }
  }, [block])

  // Линии «от руки»: верёвки (трубка с лёгким провисом) и кромки листов — строятся один раз
  const sketch = useMemo(
    () => ({
      ropes: rows.map((_, r) => buildRopeGeometry(CORRIDOR.width, GALLERY_STYLE.ropeRadius, 100 + index * 10 + r)),
      frames: works.map((w, i) =>
        buildRectStrokes(w.w + 0.008, w.h + 0.008, 0.014, 500 + index * 50 + i, {
          step: 0.03,
          jitter: 0.003,
          wave: 0.5,
          overshoot: 0.015,
        }),
      ),
    }),
    [rows, works, index],
  )
  useEffect(() => () => [...sketch.ropes, ...sketch.frames].forEach((g) => g.dispose()), [sketch])

  const textures = useTexture(
    works.map((w) => w.preview),
    (loaded) => {
      const list = Array.isArray(loaded) ? loaded : [loaded]
      list.forEach((t) => {
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy())
      })
    },
  )

  const group = useRef()
  const ropes = useRef([])
  const hangs = useRef([])
  const sheetMats = useRef([])
  const frameMats = useRef([])
  const sheets = useRef([])
  const frames = useRef([])
  const shadowMats = useRef([])
  const hovered = useRef(-1)
  // Подсветка: текущий уровень 0…1 у каждой работы (плавно) и «тап» на телефоне
  const glow = useRef([])
  const tapped = useRef({ i: -1, until: 0 })

  // Видимость работы i: опустилась на веревку и камера ещё не пролетает сквозь неё
  const workDrop = (i, reveal) => {
    const n = works.length
    const shift = n > 1 ? (i / (n - 1)) * 0.3 : 0 // работы опускаются по очереди
    return smoothstep(0.25 + shift, 0.7 + shift, reveal)
  }
  const nearFade = () => smoothstep(0.6, 1.8, scrollState.camZ - block.z)
  const workOpacity = (i) => workDrop(i, blockReveal(index)) * nearFade()

  useFrame(({ clock }, delta) => {
    const reveal = blockReveal(index)
    group.current.visible = reveal > 0.001
    if (!group.current.visible) return

    // Подсветка наведённой (или только что нажатой) работы: ярче + чуть крупнее
    const now = performance.now()
    const k = 1 - Math.exp(-delta * 14)
    works.forEach((_, i) => {
      const active =
        (hovered.current === i || (tapped.current.i === i && now < tapped.current.until)) && workOpacity(i) > 0.6
      const g = (glow.current[i] ?? 0) + ((active ? 1 : 0) - (glow.current[i] ?? 0)) * k
      glow.current[i] = g
      if (g < 0.001 && !active) {
        if (sheets.current[i].scale.x !== 1) {
          sheets.current[i].scale.setScalar(1)
          frames.current[i].scale.setScalar(1)
          sheetMats.current[i].color.setScalar(1)
        }
        return
      }
      const s = 1 + 0.035 * g
      sheets.current[i].scale.setScalar(s)
      frames.current[i].scale.set(s + (0.05 * g) / works[i].w, s + (0.05 * g) / works[i].h, 1)
      sheetMats.current[i].color.setScalar(1 + 0.22 * g) // > 1 — текстура светлее
    })

    ropes.current.forEach((rope) => {
      rope.scale.x = Math.max(reveal, 0.0001)
    })
    const near = nearFade()
    const t = clock.elapsedTime
    works.forEach((w, i) => {
      const e = workDrop(i, reveal)
      const opacity = e * near
      const hang = hangs.current[i]
      hang.position.y = w.ropeY + (1 - e) * GALLERY_STYLE.dropHeight
      hang.visible = opacity > 0.001
      if (hang.visible) {
        // «сквозняк»: лист едва заметно качается маятником вокруг верёвки
        const ph = (index * 7 + i) * 2.399
        hang.rotation.z = SWAY.side * (Math.sin(t * 0.9 + ph) * 0.7 + Math.sin(t * 1.7 + ph * 1.3) * 0.3)
        hang.rotation.x = SWAY.depth * Math.sin(t * 0.6 + ph * 0.7)
      }
      sheetMats.current[i].opacity = opacity
      frameMats.current[i].opacity = opacity
      // тень на полу проявляется вместе с работой
      const sh = shadowMats.current[i]
      if (sh) sh.opacity = SHADOW_OPACITY * opacity
    })

    // Raycaster «видит» и скрытые работы — лупа только над видимой
    if (hovered.current >= 0) {
      document.body.style.cursor = workOpacity(hovered.current) > 0.6 ? 'zoom-in' : ''
    }
  })

  const handleClick = (i) => (event) => {
    // скрытая работа не перехватывает клик — он уходит дальше по лучу
    if (workOpacity(i) < 0.6) return
    event.stopPropagation()
    if (event.delta > 10) return // это было перетаскивание
    const w = works[i]
    onOpen({ src: w.full, alt: w.alt })
  }
  const handleOver = (i) => () => {
    hovered.current = i
  }
  // На телефоне нет наведения — подсвечиваем работу в момент касания
  const handleDown = (i) => (event) => {
    if (workOpacity(i) < 0.6) return
    if (event.pointerType === 'mouse') return
    tapped.current = { i, until: performance.now() + 600 }
  }
  const handleOut = (i) => () => {
    if (hovered.current === i) {
      hovered.current = -1
      document.body.style.cursor = ''
    }
  }

  const { clipDrop } = GALLERY_STYLE
  // тени на полу — только под нижним рядом (верхний висит над ним)
  const bottomRopeY = Math.min(...rows.map((r) => r.ropeY))
  const shadowMap = radialShadowTexture()

  return (
    <group ref={group} position={[0, 0, block.z]} visible={false}>
      {works.map((w, i) =>
        w.ropeY !== bottomRopeY ? null : (
          <mesh
            key={`shadow-${w.file}`}
            position={[w.x, 0.006, 0.05]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={-1}
          >
            <planeGeometry args={[w.w * 1.25, 0.9]} />
            <meshBasicMaterial
              ref={(el) => {
                shadowMats.current[i] = el
              }}
              map={shadowMap}
              color="#000000"
              transparent
              opacity={0}
              depthWrite={false}
              // поверх красной дорожки (у неё polygonOffset -1/-4, у её обводки -2/-8)
              polygonOffset
              polygonOffsetFactor={-4}
              polygonOffsetUnits={-16}
              toneMapped={false}
            />
          </mesh>
        ),
      )}
      {rows.map((row, r) => (
        <group key={r}>
          {/* веревка от стены до стены */}
          <mesh
            ref={(el) => { ropes.current[r] = el }}
            position={[0, row.ropeY, 0]}
            geometry={sketch.ropes[r]}
          >
            <meshLambertMaterial color="#1a1a1a" />
          </mesh>
          {/* крепления к стенам */}
          {[1, -1].map((s) => (
            <mesh key={s} position={[s * (CORRIDOR.width / 2 - 0.02), row.ropeY, 0]}>
              <boxGeometry args={[0.04, 0.08, 0.08]} />
              <meshLambertMaterial color={COLORS.line} />
            </mesh>
          ))}
        </group>
      ))}

      {works.map((w, i) => {
        const pinX = Math.min(0.16, w.w * 0.22)
        // точка подвеса — на верёвке над центром листа; всё внутри — относительно неё
        const dy = w.y - w.ropeY
        return (
          <group key={w.file} ref={(el) => { hangs.current[i] = el }} position={[w.x, w.ropeY, 0]}>
            {/* кромка листа — дрожащая линия пера */}
            <mesh
              ref={(el) => {
                frames.current[i] = el
              }}
              position={[0, dy, 0.002]}
              geometry={sketch.frames[i]}
            >
              <meshBasicMaterial
                ref={(el) => { frameMats.current[i] = el }}
                color={COLORS.line}
                transparent
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
            {/* работа */}
            <mesh
              ref={(el) => {
                sheets.current[i] = el
              }}
              position={[0, dy, 0]}
              onClick={handleClick(i)}
              onPointerDown={handleDown(i)}
              onPointerOver={handleOver(i)}
              onPointerOut={handleOut(i)}
            >
              <planeGeometry args={[w.w, w.h]} />
              <meshBasicMaterial
                ref={(el) => { sheetMats.current[i] = el }}
                map={textures[i]}
                transparent
                toneMapped={false}
              />
            </mesh>
            <Clothespin x={-w.w / 2 + pinX} y={-clipDrop / 2} />
            <Clothespin x={w.w / 2 - pinX} y={-clipDrop / 2} />
          </group>
        )
      })}
    </group>
  )
}
