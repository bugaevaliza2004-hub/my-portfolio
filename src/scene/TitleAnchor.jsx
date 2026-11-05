import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { AVATAR, TITLE_Z, avatarLayout, textFrozen, textOpacity } from './config'

// Высота строки надписи в долях font-size (line-height у .red-heading — 0.9)
const TITLE_LINE = 0.9
import { placeLabel } from './labelScale'

const center = new THREE.Vector3()
const edge = new THREE.Vector3()

/**
 * Надпись — DOM-элемент, «стоящий» в мире за головой аватара,
 * на AVATAR.titleDepth глубже него (параллакс).
 * Каждый кадр голова проецируется на экран, и по ней выставляются
 * позиция и размер шрифта. Камера летит вперёд — надпись растёт
 * вместе с аватаром и исчезает, когда камера пролетает сквозь неё.
 */
export default function TitleAnchor({ anchorRef, titleRef }) {
  const ratio = useRef(0) // ширина текста / font-size
  const last = useRef({ x: 0, y: 0, w: 0, o: -1 })

  // Измеряем пропорции надписи (и повторно — после загрузки шрифта)
  useEffect(() => {
    const measure = () => {
      const el = titleRef.current
      if (!el) return
      const prev = el.style.fontSize
      el.style.fontSize = '100px'
      ratio.current = el.offsetWidth / 100
      el.style.fontSize = prev
      last.current.w = 0 // форсируем обновление
      last.current.base = 0 // и перерисовку растра под новый шрифт
    }
    measure()
    document.fonts?.ready.then(measure)
  }, [titleRef])

  useFrame(({ camera, size }) => {
    const anchor = anchorRef.current
    const title = titleRef.current
    if (!anchor || !title || !ratio.current) return

    const dist = camera.position.z - TITLE_Z
    const opacity = textOpacity(dist)
    if (opacity <= 0.001) {
      if (last.current.o !== 0) {
        anchor.style.visibility = 'hidden'
        last.current.o = 0
      }
      return
    }

    const { headWorldY, headWidth, titleToHead, shift, headY, hairY, visH, portrait } = avatarLayout(
      camera.fov,
      camera.aspect,
    )
    // Реальная ширина надписи в мире: на старте она выглядит шириной
    // titleToHead × голова, но стоит глубже — поэтому в мире она больше.
    const startScale = (AVATAR.distance + AVATAR.titleDepth) / AVATAR.distance
    const worldW = headWidth * titleToHead * startScale

    // Вертикальные экраны: надпись поднята над макушкой (на пустую стену),
    // но не выше, чем позволяет верхний край экрана. На ПК portrait = 0 — без сдвига.
    let lift = 0
    if (portrait > 0) {
      const { gap, top } = AVATAR.titleAbove
      const titleH = ((headWidth * titleToHead) / ratio.current) * TITLE_LINE // высота на старте
      const want = hairY + gap * visH + titleH / 2 // низ надписи — над макушкой
      const maxY = visH / 2 - top * visH - titleH / 2 // верх надписи — в кадре
      lift = Math.max(0, Math.min(want, maxY) - headY) * portrait * startScale
    }

    // Надпись за головой, на своей глубине. На вертикальных экранах голова
    // сдвинута влево (shift) — надпись ставим так, чтобы на старте она была
    // по центру экрана (на ПК shift = 0 — ровно на оси головы, как раньше)
    const titleX = shift * startScale
    const titleY = headWorldY + lift
    center.set(titleX, titleY, TITLE_Z).project(camera)
    edge.set(titleX + worldW / 2, titleY, TITLE_Z).project(camera)

    const x = (center.x * 0.5 + 0.5) * size.width
    const y = (-center.y * 0.5 + 0.5) * size.height
    const textW = Math.abs(edge.x - center.x) * size.width // = 2 × полуширина в px

    const l = last.current
    if (
      Math.abs(l.x - x) < 0.3 &&
      Math.abs(l.y - y) < 0.3 &&
      Math.abs(l.w - textW) < 0.3 &&
      Math.abs(l.o - opacity) < 0.002
    )
      return
    l.x = x
    l.y = y
    l.w = textW
    l.o = opacity

    // размер — через transform (видеокарта), растр перерисовывается редко
    placeLabel(anchor, title, l, { x, y, w: textW, ratio: ratio.current, viewW: size.width, frozen: textFrozen(dist) })
    anchor.style.opacity = opacity // на том же GPU-слое, что и transform
    anchor.style.visibility = 'visible'
  })

  return null
}
