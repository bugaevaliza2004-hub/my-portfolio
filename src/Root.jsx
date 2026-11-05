import { Suspense, lazy } from 'react'
import App from './App.jsx'

// Страница 404 — отдельный маленький файл: грузится только на неверном адресе
const NotFound = lazy(() => import('./components/NotFound.jsx'))

// На сайте одна страница — галерея. Любой другой путь — 404.
// (Роутер ради этого не нужен: проверка адреса легче целой библиотеки.)
const base = import.meta.env.BASE_URL // '/' или подпапка хостинга
const path = window.location.pathname
const isHome = path === base || path === `${base}index.html` || `${path}/` === base

export default function Root() {
  if (isHome) return <App />
  return (
    <Suspense fallback={null}>
      <NotFound />
    </Suspense>
  )
}
