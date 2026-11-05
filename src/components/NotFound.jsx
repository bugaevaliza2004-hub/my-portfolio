import { useEffect } from 'react'
// облегчённая копия avatar-404.png (600 px): на экране аватар не больше ~360 px
import avatar404 from '../assets/avatar-404-600.png'

/**
 * Страница 404: «4 [плачущий аватар] 4», текст и кнопка возврата.
 * Лёгкая — без 3D-сцены: грузится только эта картинка и шрифт.
 */
export default function NotFound() {
  useEffect(() => {
    const prev = document.title
    document.title = '404 — страница не найдена'
    // не индексировать страницу ошибки
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => {
      document.title = prev
      meta.remove()
    }
  }, [])

  return (
    <main className="not-found">
      <div className="not-found__inner">
        <h1 className="not-found__code" aria-label="Ошибка 404">
          <span className="red-heading not-found__digit" aria-hidden="true">
            4
          </span>
          <img className="not-found__avatar" src={avatar404} alt="" width="600" height="600" />
          <span className="red-heading not-found__digit" aria-hidden="true">
            4
          </span>
        </h1>
        <p className="not-found__text">Ой... Кажется, вы заблудились в галерее</p>
        <a className="not-found__button" href={import.meta.env.BASE_URL}>
          Вернуться в галерею
        </a>
      </div>
    </main>
  )
}
