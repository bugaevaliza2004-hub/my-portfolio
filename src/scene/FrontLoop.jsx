import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AVATAR, AVATAR_Z, TITLE_Z, scrollState } from './config'

/*
 * Холст аватара (верхний слой) рисуется «по требованию», а не 60 раз в секунду:
 *  — когда камера сдвинулась (скролл);
 *  — когда сменился кадр анимации аватара (8 раз в секунду);
 *  — при ресайзе (R3F делает это сам).
 * После пролёта сквозь аватар холст скрывается целиком — браузер его
 * не композитит. Картинка та же, нагрузка на видеокарту заметно меньше.
 */

let invalidateFront = null

/** Внутри холста аватара: отдаёт его invalidate наружу */
export function FrontRegister() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    invalidateFront = invalidate
    return () => {
      invalidateFront = null
    }
  }, [invalidate])
  return null
}

/**
 * Внутри основного холста (он рисуется каждый кадр): решает,
 * нужен ли новый кадр холсту аватара, и прячет его, когда аватар позади.
 */
export function FrontDriver({ layerRef }) {
  const last = useRef({ z: NaN, step: -1, visible: true })
  useFrame(({ clock }) => {
    const z = scrollState.camZ
    const l = last.current

    // аватар позади камеры — слой не нужен совсем
    const visible = z - AVATAR_Z > AVATAR.fadeTo - 0.05
    if (visible !== l.visible && layerRef.current) {
      layerRef.current.style.visibility = visible ? '' : 'hidden'
      l.visible = visible
    }

    // надпись «ПОРТФОЛИО» обновляется из холста аватара — рисуем, пока она не пройдена
    if (!invalidateFront || z < TITLE_Z - 0.5) {
      l.z = z
      return
    }
    const step = Math.floor(clock.elapsedTime * AVATAR.fps)
    if (z !== l.z || step !== l.step) {
      l.z = z
      l.step = step
      invalidateFront()
    }
  })
  return null
}
