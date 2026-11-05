/*
 * Документы зоны «ЖУРНАЛ».
 * Страницы подхватываются автоматически: все *.jpg из папки документа
 * (src/assets/docs/<id>/01.jpg, 02.jpg, …), по порядку номеров.
 * Пропуски в нумерации (например, нет 08.jpg) не мешают — берётся то, что есть.
 * Чтобы добавить страницу — просто положите файл в папку.
 */

const pageFiles = import.meta.glob('../assets/docs/*/*.{jpg,jpeg,png}', { eager: true, import: 'default' })
const coverFiles = import.meta.glob('../assets/docs/*-cover.{jpg,jpeg,png}', { eager: true, import: 'default' })
// лёгкие копии обложек для 3D-стола (scripts/make-previews.ps1)
const coverPreviews = import.meta.glob('../assets/previews/docs/*-cover.jpg', { eager: true, import: 'default' })

const pageNumber = (path) => {
  const name = path.split('/').pop()
  const n = parseInt(name, 10)
  return Number.isNaN(n) ? Infinity : n
}

/**
 * Файлы, которые не показываются в галерее (лежат в папке по ошибке).
 * Ключ — папка документа, значение — имена файлов.
 */
const EXCLUDE = {
  journal: ['02.jpg'],
}

/** Все страницы документа id, отсортированные по номеру файла (без исключённых) */
function pagesOf(id) {
  const skip = EXCLUDE[id] ?? []
  return Object.entries(pageFiles)
    .filter(([path]) => path.split('/').at(-2) === id && !skip.includes(path.split('/').pop()))
    .sort(([a], [b]) => pageNumber(a) - pageNumber(b) || a.localeCompare(b))
    .map(([, url]) => url)
}

function coverOf(id, files = coverFiles) {
  const entry = Object.entries(files).find(([path]) => path.split('/').pop().startsWith(`${id}-cover.`))
  return entry?.[1]
}

const doc = (id, title, coverAspect) => ({
  id,
  title,
  cover: coverOf(id),
  coverPreview: coverOf(id, coverPreviews) ?? coverOf(id), // для 3D; если превью ещё нет — оригинал
  coverAspect,
  pages: pagesOf(id),
})

/** Документы на столе (слева направо) */
export const DOCS = [
  doc('journal', 'Журнал', 1241 / 1654),
  doc('brandbook', 'Брендбук', 1240 / 1755),
  doc('mediakit', 'Медиакит', 1240 / 1755),
]

if (import.meta.env.DEV) {
  for (const d of DOCS) {
    if (!d.cover) console.warn(`[docs] нет обложки ${d.id}-cover.jpg`)
    if (!d.pages.length) console.warn(`[docs] в папке docs/${d.id} нет страниц`)
  }
}
