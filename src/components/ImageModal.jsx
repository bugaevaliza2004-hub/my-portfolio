import { useCallback, useEffect, useRef } from 'react'

const MIN_SCALE = 1
const MAX_SCALE = 6
const DOUBLE_TAP_SCALE = 2.5

/**
 * Модальное окно с картинкой и «лупой»:
 * — колесо мыши: зум к курсору;
 * — щипок двумя пальцами: зум к центру щипка;
 * — перетаскивание (мышь/палец): сдвиг, если картинка не влезает;
 * — двойной клик/тап: быстрое приближение/сброс;
 * — крестик или Esc: закрыть (зум сбрасывается — окно размонтируется).
 * Всё через CSS transform: translate() scale().
 */
export default function ImageModal({ src, alt, onClose }) {
  const stageRef = useRef(null)
  const imgRef = useRef(null)
  const view = useRef({ s: 1, x: 0, y: 0 })
  const pointers = useRef(new Map())
  const pinch = useRef(null)
  const lastTap = useRef(0)

  const apply = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    const { s, x, y } = view.current
    img.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${s})`
    img.style.cursor = s > 1 ? 'grab' : 'zoom-in'
  }, [])

  // Не даём картинке уехать: сдвиг только в пределах выступающей части
  const clamp = useCallback(() => {
    const img = imgRef.current
    const stage = stageRef.current
    if (!img || !stage) return
    const v = view.current
    const maxX = Math.max(0, (img.offsetWidth * v.s - stage.clientWidth) / 2)
    const maxY = Math.max(0, (img.offsetHeight * v.s - stage.clientHeight) / 2)
    v.x = Math.min(maxX, Math.max(-maxX, v.x))
    v.y = Math.min(maxY, Math.max(-maxY, v.y))
  }, [])

  // Зум так, чтобы точка под курсором/пальцами осталась на месте
  const zoomAt = useCallback(
    (clientX, clientY, nextScale) => {
      const stage = stageRef.current
      const v = view.current
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale))
      const rect = stage.getBoundingClientRect()
      const px = clientX - (rect.left + rect.width / 2)
      const py = clientY - (rect.top + rect.height / 2)
      v.x = px - ((px - v.x) * s) / v.s
      v.y = py - ((py - v.y) * s) / v.s
      v.s = s
      clamp()
      apply()
    },
    [apply, clamp],
  )

  // Блокируем скролл страницы, Esc закрывает, колесо — зум
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.style.cursor = ''

    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    const stage = stageRef.current
    const onWheel = (e) => {
      e.preventDefault()
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)) // ctrl — жест трекпада
      zoomAt(e.clientX, e.clientY, view.current.s * factor)
    }
    // iOS Safari: щипок не должен зумить всю страницу — только картинку
    const stopGesture = (e) => e.preventDefault()
    window.addEventListener('keydown', onKey)
    stage.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('gesturestart', stopGesture, { passive: false })
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
      stage.removeEventListener('wheel', onWheel)
      document.removeEventListener('gesturestart', stopGesture)
    }
  }, [onClose, zoomAt])

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: view.current.s,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
      return
    }

    // двойной тап / двойной клик
    const now = performance.now()
    if (now - lastTap.current < 300) {
      const target = view.current.s > 1.05 ? 1 : DOUBLE_TAP_SCALE
      zoomAt(e.clientX, e.clientY, target)
      lastTap.current = 0
    } else {
      lastTap.current = now
    }
  }

  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, cur)

    if (pointers.current.size >= 2 && pinch.current) {
      // щипок: масштаб по расстоянию между пальцами + сдвиг за центром щипка
      const [a, b] = [...pointers.current.values()]
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      view.current.x += mid.x - pinch.current.mid.x
      view.current.y += mid.y - pinch.current.mid.y
      pinch.current.mid = mid
      zoomAt(mid.x, mid.y, (pinch.current.scale * dist) / pinch.current.dist)
      return
    }

    // один палец / мышь: сдвиг, только если картинка увеличена
    if (view.current.s > 1) {
      view.current.x += cur.x - prev.x
      view.current.y += cur.y - prev.y
      clamp()
      apply()
      imgRef.current.style.cursor = 'grabbing'
    }
  }

  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    apply()
  }

  // При ресайзе окна держим картинку в границах
  useEffect(() => {
    const onResize = () => {
      clamp()
      apply()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [apply, clamp])

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={alt}>
      <button type="button" className="modal__close" aria-label="Закрыть" onClick={onClose} autoFocus>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
        </svg>
      </button>

      <div
        ref={stageRef}
        className="modal__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img ref={imgRef} className="modal__img" src={src} alt={alt} draggable={false} />
      </div>

      <p className="modal__hint">
        <span className="modal__hint-mouse">Колесо — приблизить · перетащить — сдвинуть · двойной клик — сброс</span>
        <span className="modal__hint-touch">Щипок — приблизить · двойной тап — сброс</span>
      </p>
    </div>
  )
}
