import { CAMERA, computeFov, scrollState, smoothstep, textOpacity } from './config'
import { DOCS } from './docs'

/*
 * Галерея: блоки с работами вдоль коридора.
 * Каждый блок = огромная надпись .red-heading на уровне глаз (камера пролетает
 * сквозь неё) + веревки с работами глубже по Z (камера плавно тормозит перед ними).
 *
 * В 3D-сцене используются лёгкие превью (src/assets/previews — генерирует
 * scripts/make-previews.ps1), в модале открываются оригиналы.
 */

const previews = import.meta.glob('../assets/previews/**/*.jpg', { eager: true, import: 'default' })
const originals = import.meta.glob('../assets/works/**/*.jpg', { eager: true, import: 'default' })

/** Работа: путь внутри works/ и пропорции (ширина / высота) */
const work = (file, aspect, alt) => ({
  file,
  aspect,
  alt,
  preview: previews[`../assets/previews/${file}`],
  full: originals[`../assets/works/${file}`],
})

const range = (from, to, fn) => Array.from({ length: to - from + 1 }, (_, i) => fn(from + i))
const pad = (n) => String(n).padStart(2, '0')

const POSTER_ASPECT = { 4: 2008 / 2560, 7: 1810 / 2560, 8: 1810 / 2560, 9: 1810 / 2560, 10: 2001 / 2560 }

/**
 * Блоки. Расстояние «надпись → работы» должно быть больше, чем дистанция
 * остановки камеры на телефоне (иначе надпись перекроет работы) — см. проверку ниже.
 * rows: веревки сверху вниз; height — высота работ в ряду (м), gap — промежуток.
 */
export const GALLERY = [
  {
    id: 'resume',
    title: 'Резюме',
    titleZ: -10,
    z: -14,
    minDistance: 3.2,
    rows: [{ ropeY: 3.1, height: 2.0, gap: 0.4, works: [work('resume/resume.jpg', 2007 / 2560, 'Резюме')] }],
  },
  {
    id: 'experience',
    title: 'Опыт работы',
    titleZ: -21,
    z: -25.5,
    minDistance: 3.2,
    rows: [
      { ropeY: 3.1, height: 2.0, gap: 0.4, works: [work('experience/experience.jpg', 2736 / 3489, 'Опыт работы')] },
    ],
  },
  {
    id: 'illustrations',
    title: 'Иллюстрации',
    titleZ: -33,
    z: -42.5,
    minDistance: 3.6,
    rows: [
      {
        ropeY: 3.42,
        height: 1.02,
        gap: 0.12,
        works: range(1, 6, (n) => work(`illustrations/ill-${pad(n)}.jpg`, 2007 / 2560, `Иллюстрация ${n}`)),
      },
      {
        ropeY: 2.08,
        height: 1.02,
        gap: 0.12,
        works: range(7, 12, (n) => work(`illustrations/ill-${pad(n)}.jpg`, 2007 / 2560, `Иллюстрация ${n}`)),
      },
    ],
  },
  {
    id: 'posters',
    title: 'Постеры',
    titleZ: -54,
    z: -63.5,
    minDistance: 3.6,
    rows: [
      {
        ropeY: 3.48,
        height: 1.12,
        gap: 0.16,
        works: range(1, 5, (n) => work(`posters/poster-${pad(n)}.jpg`, POSTER_ASPECT[n] ?? 2007 / 2560, `Постер ${n}`)),
      },
      {
        ropeY: 2.06,
        height: 1.12,
        gap: 0.16,
        works: range(6, 10, (n) => work(`posters/poster-${pad(n)}.jpg`, POSTER_ASPECT[n] ?? 2007 / 2560, `Постер ${n}`)),
      },
    ],
  },
  {
    id: 'landings',
    title: 'Лендинги',
    titleZ: -74,
    z: -81.5,
    minDistance: 3.4,
    rows: [
      {
        ropeY: 3.1,
        height: 2.0,
        gap: 0.45,
        works: [
          work('landings/landing-01.jpg', 1400 / 2100, 'Лендинг 1'),
          work('landings/landing-02.jpg', 1440 / 2048, 'Лендинг 2'),
        ],
      },
    ],
  },
]

/**
 * Зона «ЖУРНАЛ» в конце коридора: надпись, стол у торцевой стены,
 * на столе лежат обложки документов (см. docs.js).
 */
export const JOURNAL = {
  title: 'Журнал',
  titleZ: -95,
  table: { width: 2.4, depth: 0.9, height: 0.78, top: 0.05 },
  tableZ: -109.3, // центр стола; задний край почти у торцевой стены (-109.9)
  minDistance: 2.4, // ближе камера не подлетает
  cover: { width: 0.55, gapX: 0.78, tilt: [-0.08, 0.05, 0.11] }, // tilt — лёгкий поворот «как брошены»
}

export const GALLERY_STYLE = {
  ropeRadius: 0.012,
  clipDrop: 0.07, // верх работы ниже веревки (прищепки)
  dropHeight: 0.8, // с какой высоты работы «опускаются» при появлении
  titleWidth: 5.4, // максимальная ширина огромной надписи (м)
  titleFitDistance: 3.6, // на узких экранах надпись целиком в кадре, пока до неё ≥ этого
  revealLength: 3, // за сколько метров пути камеры блок появляется
  firstRevealZ: -0.5, // первый блок появляется, когда камера подходит к дверям
}

/** Раскладка ряда: x-центры и размеры работ, по центру коридора */
export function layoutRow(row) {
  const widths = row.works.map((w) => row.height * w.aspect)
  const total = widths.reduce((a, b) => a + b, 0) + row.gap * (widths.length - 1)
  let x = -total / 2
  const items = widths.map((w) => {
    const item = { x: x + w / 2, w, h: row.height, y: row.ropeY - GALLERY_STYLE.clipDrop - row.height / 2 }
    x += w + row.gap
    return item
  })
  return { items, total }
}

/** Габариты блока (для подбора дистанции камеры) */
function blockBounds(block) {
  let halfW = 0
  let top = -Infinity
  let bottom = Infinity
  for (const row of block.rows) {
    const { total } = layoutRow(row)
    halfW = Math.max(halfW, total / 2)
    top = Math.max(top, row.ropeY + 0.1)
    bottom = Math.min(bottom, row.ropeY - GALLERY_STYLE.clipDrop - row.height - 0.05)
  }
  return { halfW, top, bottom }
}

/**
 * На каком расстоянии от работ остановиться, чтобы блок целиком
 * поместился в кадр (с полями) на текущем экране.
 */
export function viewDistance(block, fov, aspect) {
  const tanV = Math.tan((fov * Math.PI) / 360)
  const tanH = tanV * aspect
  const fill = 0.9
  const { halfW, top, bottom } = blockBounds(block)
  return Math.max(
    block.minDistance,
    halfW / (tanH * fill),
    (top - CAMERA.y) / (tanV * fill),
    (CAMERA.y - bottom) / (tanV * fill),
  )
}

/** Текущие fov/aspect окна (для траектории камеры) */
export function screenFovAspect() {
  const aspect = window.innerWidth / window.innerHeight
  return { fov: computeFov(aspect), aspect }
}

/**
 * Траектория камеры: остановка перед каждым блоком, затем конец коридора.
 * z — функции (пересчитываются при ресайзе/повороте экрана).
 * duration — в условных единицах таймлайна.
 */
export function cameraPath() {
  const stopZ = (block) => () => {
    const { fov, aspect } = screenFovAspect()
    return block.z + viewDistance(block, fov, aspect)
  }
  const path = []
  let prevZ = CAMERA.startZ
  GALLERY.forEach((block, i) => {
    const approxZ = block.z + block.minDistance
    // первый участок длиннее: медленный пролёт сквозь аватар и двери
    const duration = i === 0 ? 3 : Math.min(3.4, Math.max(2, (prevZ - approxZ) / 6))
    path.push({ z: stopZ(block), duration, ease: 'power1.inOut' })
    prevZ = approxZ
  })
  // финал: подлёт к столу с журналами
  path.push({
    z: () => {
      const { fov, aspect } = screenFovAspect()
      return JOURNAL.tableZ + journalDistance(fov, aspect)
    },
    duration: Math.min(3.6, Math.max(2, (prevZ - (JOURNAL.tableZ + JOURNAL.minDistance)) / 6)),
    ease: 'power1.inOut',
  })
  return path
}

/** Мировые координаты обложки i на столе (для раскладки и подлёта камеры) */
export function coverWorldPosition(i) {
  const x = (i - (DOCS.length - 1) / 2) * JOURNAL.cover.gapX
  return [x, JOURNAL.table.height + 0.004, JOURNAL.tableZ + 0.05]
}

/**
 * Поза камеры «сверху-сбоку» над обложкой i: выше и чуть ближе к зрителю,
 * со смещением в сторону — обложка видна под углом, но читается.
 */
export function coverFocusPose(i) {
  const [x, y, z] = coverWorldPosition(i)
  const side = x === 0 ? 0.25 : Math.sign(x) * 0.35
  return { pos: [x + side, y + 0.95, z + 0.7], target: [x, y, z] }
}

/** Дистанция до стола: стол целиком в кадре по ширине */
export function journalDistance(fov, aspect) {
  const tanH = Math.tan((fov * Math.PI) / 360) * aspect
  return Math.max(JOURNAL.minDistance, (JOURNAL.table.width / 2 + 0.15) / (tanH * 0.9))
}

/** Наклон камеры вниз в конце пути — чтобы смотреть на столешницу */
export function journalPitch() {
  const { fov, aspect } = screenFovAspect()
  const d = journalDistance(fov, aspect)
  return -Math.atan((CAMERA.y - JOURNAL.table.height) / d) * 0.85
}

/** Появление зоны «ЖУРНАЛ»: после пролёта последнего блока работ */
export function journalReveal(camZ = scrollState.camZ) {
  const startZ = GALLERY[GALLERY.length - 1].z + 0.4
  return smoothstep(0, GALLERY_STYLE.revealLength, startZ - camZ)
}

export const journalTitleOpacity = (camera) =>
  smoothstep(0, 0.6, journalReveal(camera.position.z)) * textOpacity(camera.position.z - JOURNAL.titleZ)

/**
 * Контакты на торцевой стене, над столом с документами.
 * y — центр блока (м от пола): заметно выше столешницы (0.78 м),
 * чтобы текст не перекрывал обложки, и ниже верхнего края финального кадра.
 */
export const CONTACTS = {
  z: -109.85, // чуть перед торцевой стеной (-109.9)
  y: 1.7,
  width: 2.0, // ширина блока (по самой длинной строке — почте) на ПК, м
  fill: 0.86, // на узких экранах: блок не шире 86% кадра — почта не обрезается
}

/**
 * Ширина блока контактов под экран: считается для финальной точки камеры
 * (перед столом), так что на телефоне почта целиком влезает по ширине.
 */
export const contactsWidth = (camera) => {
  const d = journalDistance(camera.fov, camera.aspect) + (JOURNAL.tableZ - CONTACTS.z)
  const visW = 2 * d * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect
  return Math.min(CONTACTS.width, visW * CONTACTS.fill)
}

/** Контакты проявляются, когда камера пролетела надпись «ЖУРНАЛ» */
export const contactsOpacity = (camera) => smoothstep(0.3, 2.5, JOURNAL.titleZ - camera.position.z)

/** Общая длительность таймлайна (для высоты трека скролла) */
export const TIMELINE_DURATION = cameraPath().reduce((sum, s) => sum + s.duration, 0)

/**
 * Появление блока 0…1 — по положению камеры: блок проявляется,
 * когда камера пролетела работы предыдущего блока (иначе его надпись
 * легла бы поверх них). Скролл назад — блок убирается.
 */
export function blockReveal(index, camZ = scrollState.camZ) {
  const startZ = index === 0 ? GALLERY_STYLE.firstRevealZ : GALLERY[index - 1].z + 0.4
  return smoothstep(0, GALLERY_STYLE.revealLength, startZ - camZ)
}

/** Ширина огромной надписи под текущий экран */
export const titleWidth = (camera) => {
  const visW = 2 * GALLERY_STYLE.titleFitDistance * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect
  return Math.min(GALLERY_STYLE.titleWidth, visW * 0.9)
}

/** Прозрачность надписи: появляется с блоком, растворяется при пролёте сквозь неё */
export const titleOpacity = (index) => (camera) =>
  smoothstep(0, 0.6, blockReveal(index, camera.position.z)) * textOpacity(camera.position.z - GALLERY[index].titleZ)

// Проверка раскладки при разработке: надпись должна быть пройдена
// до точки остановки даже на самом узком телефоне (aspect 0.42).
if (import.meta.env.DEV) {
  const aspect = 0.42
  const fov = computeFov(aspect)
  for (const block of GALLERY) {
    const stop = block.z + viewDistance(block, fov, aspect)
    if (stop > block.titleZ - 0.3) {
      console.warn(`[gallery] «${block.title}»: на узком экране надпись перекроет работы — увеличьте titleZ - z`)
    }
    if (!block.rows.every((r) => r.works.every((w) => w.preview && w.full))) {
      console.warn(`[gallery] «${block.title}»: не найден файл работы (превью или оригинал)`)
    }
  }
}
