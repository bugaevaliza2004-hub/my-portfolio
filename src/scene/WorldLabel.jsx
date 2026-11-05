import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { placeLabel } from './labelScale'
import { textFrozen } from './config'

const center = new THREE.Vector3()
const edge = new THREE.Vector3()

/**
 * HTML-заголовок (.red-heading), «стоящий» в 3D-мире.
 * Каждый кадр точка position проецируется на экран, и по ней выставляются
 * позиция, размер шрифта (текст шириной worldWidth метров — число
 * или функция от камеры, для адаптива) и прозрачность.
 *
 * anchorRef — обёртка (позиционируется), textRef — сам заголовок.
 * getOpacity(camera) — прозрачность 0…1 (привязка к скроллу).
 */
export default function WorldLabel({ anchorRef, textRef, position, worldWidth, getOpacity, freezeNear = true }) {
  const ratio = useRef(0) // ширина текста / font-size
  const last = useRef({ x: 0, y: 0, w: 0, o: -1 })

  useEffect(() => {
    const measure = () => {
      const el = textRef.current
      if (!el) return
      const prev = el.style.fontSize
      el.style.fontSize = '100px'
      ratio.current = el.offsetWidth / 100
      el.style.fontSize = prev
      last.current.w = 0
      last.current.base = 0 // перерисовать растр под новый шрифт
    }
    measure()
    document.fonts?.ready.then(measure)
  }, [textRef])

  useFrame(({ camera, size }) => {
    const anchor = anchorRef.current
    const text = textRef.current
    if (!anchor || !text || !ratio.current) return

    const [px, py, pz] = position
    center.set(px, py, pz).project(camera)
    let opacity = getOpacity(camera)
    if (center.z > 1) opacity = 0 // точка позади камеры

    if (opacity <= 0.001) {
      if (last.current.o !== 0) {
        anchor.style.visibility = 'hidden'
        last.current.o = 0
      }
      return
    }

    const width = typeof worldWidth === 'function' ? worldWidth(camera) : worldWidth
    edge.set(px + width / 2, py, pz).project(camera)
    const x = (center.x * 0.5 + 0.5) * size.width
    const y = (-center.y * 0.5 + 0.5) * size.height
    const w = Math.abs(edge.x - center.x) * size.width

    const l = last.current
    if (Math.abs(l.x - x) < 0.3 && Math.abs(l.y - y) < 0.3 && Math.abs(l.w - w) < 0.3 && Math.abs(l.o - opacity) < 0.002)
      return
    l.x = x
    l.y = y
    l.w = w
    l.o = opacity

    // размер — через transform (видеокарта), растр перерисовывается редко
    // при пролёте сквозь надпись (она гаснет) растр не перерисовывается
    const frozen = freezeNear && textFrozen(camera.position.z - pz)
    placeLabel(anchor, text, l, { x, y, w, ratio: ratio.current, viewW: size.width, frozen })
    anchor.style.opacity = opacity // на том же GPU-слое, что и transform
    anchor.style.visibility = 'visible'
  })

  return null
}
