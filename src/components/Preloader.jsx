import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
// облегчённая копия avatar-loading.png (600 px вместо 1254 px) — экран загрузки появляется сразу
import avatarLoading from '../assets/avatar-loading-600.png'

// Сколько «тишины» после последней загруженной текстуры ждём, прежде чем
// считать загрузку завершённой (Suspense-блоки могут запросить ещё файлы)
const SETTLE_MS = 400
// Страховка: если какой-то файл не ответил — всё равно открываем сайт
const MAX_WAIT_MS = 30000
const FADE_MS = 800

/**
 * Экран загрузки поверх 3D-сцены.
 * Прогресс — реальный, из загрузчика three.js (useProgress): все текстуры
 * аватара, работ и обложек. Исчезает плавно (opacity), когда загружено всё
 * и подгрузился шрифт надписей; потом удаляется из DOM.
 */
export default function Preloader() {
  const { active, progress } = useProgress()
  const [done, setDone] = useState(false)
  const [gone, setGone] = useState(false)
  // полоса только растёт: если в очередь добавились файлы, она не «откатывается»
  const [maxProgress, setMaxProgress] = useState(0)
  const target = Math.min(progress, 99.5) // 100% — только когда всё действительно готово
  if (target > maxProgress) setMaxProgress(target)
  const shown = done ? 100 : Math.max(maxProgress, target)
  const percent = Math.round(shown)

  // Загрузка завершена: загрузчик не активен, 100% и шрифт готов
  useEffect(() => {
    if (done || active || progress < 100) return
    let cancelled = false
    const t = setTimeout(() => {
      const fonts = document.fonts?.ready ?? Promise.resolve()
      fonts.then(() => !cancelled && setDone(true))
    }, SETTLE_MS)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [active, progress, done])

  // Страховка от зависшего файла
  useEffect(() => {
    const t = setTimeout(() => setDone(true), MAX_WAIT_MS)
    return () => clearTimeout(t)
  }, [])

  // Пока идёт загрузка — страница не прокручивается и стоит в начале
  useEffect(() => {
    if (done) {
      document.body.style.overflow = ''
      return
    }
    window.scrollTo(0, 0)
    document.body.style.overflow = 'hidden'
  }, [done])

  // После плавного исчезновения — убираем из DOM совсем
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setGone(true), FADE_MS + 50)
    return () => clearTimeout(t)
  }, [done])

  if (gone) return null

  return (
    <div className={`preloader${done ? ' is-done' : ''}`} role="status" aria-live="polite" aria-busy={!done}>
      <div className="preloader__inner">
        <img className="preloader__avatar" src={avatarLoading} alt="" width="600" height="600" decoding="async" />
        <div
          className="preloader__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Загрузка сайта"
        >
          <div className="preloader__fill" style={{ transform: `scaleX(${shown / 100})` }} />
        </div>
        <p className="preloader__text">
          Загрузка <span className="preloader__percent">{percent}%</span>
        </p>
      </div>
    </div>
  )
}
