import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const MIN_ZOOM = 1
const MAX_ZOOM = 5
const STEP = 1.4 // шаг кнопок «+ / −»
const DOUBLE_TAP_ZOOM = 2.5
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

/**
 * Модал-галерея страниц документа (только JPG, без PDF).
 * — «Назад / Вперёд» (и стрелки ← →), счётчик страниц;
 * — зум: кнопки − / +, ctrl/⌘ + колесо и щипок трекпада, щипок на телефоне,
 *   двойной клик / двойной тап; при зуме страница прокручивается
 *   (колесо, палец, перетаскивание мышью);
 * — крестик или Esc — закрыть.
 * Зум меняет реальный размер картинки (а не transform), поэтому
 * прокрутка работает нативно, а текст остаётся чётким.
 */
export default function DocModal({ doc, onClose }) {
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [natural, setNatural] = useState(null) // { w, h } текущей страницы
  const [box, setBox] = useState({ w: 0, h: 0 }) // размер области просмотра

  const bodyRef = useRef(null)
  const zoomRef = useRef(1)
  const pendingScroll = useRef(null)
  const total = doc.pages.length

  // Размер страницы при zoom = 1: целиком в области просмотра
  const pad = 16
  const aspect = natural ? natural.w / natural.h : 0.75
  const baseW = Math.max(1, Math.min(box.w - pad * 2, (box.h - pad * 2) * aspect))
  const imgW = Math.round(baseW * zoom)
  const imgH = Math.round((baseW / aspect) * zoom)

  /** Зум к точке (clientX/Y) — точка под курсором/пальцами остаётся на месте */
  const zoomTo = useCallback((next, clientX, clientY) => {
    const body = bodyRef.current
    const z1 = zoomRef.current
    const z2 = clampZoom(next)
    if (!body || Math.abs(z2 - z1) < 1e-3) return
    const rect = body.getBoundingClientRect()
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top
    pendingScroll.current = {
      left: (body.scrollLeft + px) * (z2 / z1) - px,
      top: (body.scrollTop + py) * (z2 / z1) - py,
    }
    zoomRef.current = z2
    setZoom(z2)
  }, [])

  // После перерисовки с новым размером — выставляем прокрутку
  useLayoutEffect(() => {
    const body = bodyRef.current
    if (body && pendingScroll.current) {
      body.scrollLeft = pendingScroll.current.left
      body.scrollTop = pendingScroll.current.top
      pendingScroll.current = null
    }
  }, [zoom])

  const goTo = useCallback(
    (next) => {
      const p = Math.min(total - 1, Math.max(0, next))
      setPage(p)
      setNatural(null)
      zoomRef.current = 1
      setZoom(1)
      if (bodyRef.current) {
        bodyRef.current.scrollTop = 0
        bodyRef.current.scrollLeft = 0
      }
    },
    [total],
  )

  // Размер области просмотра (ресайз, поворот экрана)
  useLayoutEffect(() => {
    const body = bodyRef.current
    const ro = new ResizeObserver(() => setBox({ w: body.clientWidth, h: body.clientHeight }))
    ro.observe(body)
    return () => ro.disconnect()
  }, [])

  // Предзагрузка соседних страниц (журнал тяжёлый — только ±1)
  useEffect(() => {
    ;[page - 1, page + 1].forEach((i) => {
      if (i >= 0 && i < total) new Image().src = doc.pages[i]
    })
  }, [page, total, doc])

  // Клавиатура, блокировка прокрутки страницы, жесты зума
  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') goTo(page + 1)
      else if (e.key === 'ArrowLeft') goTo(page - 1)
      else if (e.key === '+' || e.key === '=') zoomTo(zoomRef.current * STEP)
      else if (e.key === '-') zoomTo(zoomRef.current / STEP)
    }

    const body = bodyRef.current
    // ctrl/⌘ + колесо и щипок трекпада — зум; обычное колесо — прокрутка
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY)
    }

    // Щипок двумя пальцами — зум; одним пальцем — обычная прокрутка
    let pinch = null
    let lastTap = { t: 0, x: 0, y: 0 }
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })
    const onTouchStart = (e) => {
      if (e.touches.length === 2) pinch = { d: dist(e.touches), z: zoomRef.current }
    }
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinch) {
        e.preventDefault()
        const m = mid(e.touches)
        zoomTo((pinch.z * dist(e.touches)) / pinch.d, m.x, m.y)
      }
    }
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) pinch = null
      // двойной тап
      if (e.changedTouches.length === 1 && e.touches.length === 0) {
        const t = e.changedTouches[0]
        const now = performance.now()
        if (now - lastTap.t < 300 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 30) {
          zoomTo(zoomRef.current > 1.05 ? 1 : DOUBLE_TAP_ZOOM, t.clientX, t.clientY)
          lastTap = { t: 0, x: 0, y: 0 }
        } else {
          lastTap = { t: now, x: t.clientX, y: t.clientY }
        }
      }
    }

    // iOS Safari: щипок не должен зумить всю страницу — только документ
    const stopGesture = (e) => e.preventDefault()
    document.addEventListener('gesturestart', stopGesture, { passive: false })

    window.addEventListener('keydown', onKey)
    body.addEventListener('wheel', onWheel, { passive: false })
    body.addEventListener('touchstart', onTouchStart, { passive: true })
    body.addEventListener('touchmove', onTouchMove, { passive: false })
    body.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      document.body.style.overflow = prevOverflow
      document.removeEventListener('gesturestart', stopGesture)
      window.removeEventListener('keydown', onKey)
      body.removeEventListener('wheel', onWheel)
      body.removeEventListener('touchstart', onTouchStart)
      body.removeEventListener('touchmove', onTouchMove)
      body.removeEventListener('touchend', onTouchEnd)
    }
  }, [onClose, goTo, zoomTo, page])

  // Перетаскивание мышью — прокрутка увеличенной страницы
  const drag = useRef(null)
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, l: bodyRef.current.scrollLeft, t: bodyRef.current.scrollTop }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    bodyRef.current.scrollLeft = drag.current.l - (e.clientX - drag.current.x)
    bodyRef.current.scrollTop = drag.current.t - (e.clientY - drag.current.y)
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <div className="doc-modal" role="dialog" aria-modal="true" aria-label={doc.title}>
      <button type="button" className="modal__close" aria-label="Закрыть" onClick={onClose} autoFocus>
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
          <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" />
        </svg>
      </button>

      <div className="doc-modal__panel">
        <header className="doc-modal__header">
          <h2 className="red-heading doc-modal__title">{doc.title}</h2>
          <div className="doc-modal__zoom" role="group" aria-label="Масштаб">
            <button type="button" onClick={() => zoomTo(zoomRef.current / STEP)} disabled={zoom <= MIN_ZOOM} aria-label="Уменьшить">
              −
            </button>
            <button type="button" className="doc-modal__zoom-value" onClick={() => zoomTo(1)} aria-label="Сбросить масштаб">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => zoomTo(zoomRef.current * STEP)} disabled={zoom >= MAX_ZOOM} aria-label="Увеличить">
              +
            </button>
          </div>
        </header>

        <div
          ref={bodyRef}
          className={`doc-modal__body${zoom > 1 ? ' is-zoomed' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={(e) => zoomTo(zoomRef.current > 1.05 ? 1 : DOUBLE_TAP_ZOOM, e.clientX, e.clientY)}
        >
          <div className="doc-modal__sheet" style={{ padding: pad }}>
            <img
              key={doc.pages[page]}
              src={doc.pages[page]}
              alt={`${doc.title}, страница ${page + 1}`}
              width={imgW}
              height={imgH}
              style={{ width: imgW, height: imgH }}
              draggable={false}
              onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className={natural ? '' : 'is-loading'}
            />
          </div>
        </div>

        <footer className="doc-modal__footer">
          <button type="button" className="doc-modal__nav" onClick={() => goTo(page - 1)} disabled={page === 0}>
            ← Назад
          </button>
          <span className="doc-modal__counter" aria-live="polite">
            {page + 1} / {total}
          </span>
          <button type="button" className="doc-modal__nav" onClick={() => goTo(page + 1)} disabled={page === total - 1}>
            Вперёд →
          </button>
        </footer>
      </div>
    </div>
  )
}
