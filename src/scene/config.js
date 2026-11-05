// Общие размеры сцены (в мировых единицах ≈ метрах)

export const CORRIDOR = {
  width: 6, // ширина коридора
  height: 4.5, // высота
  wall: 0.2, // толщина стен
  zFront: 10, // начало коридора (за камерой)
  zBack: -110, // торцевая стена
}

export const NICHE = {
  width: 2.2,
  height: 3.3,
  depth: 0.8,
  step: 7, // шаг между проёмами
  firstZ: -10,
  lastZ: -102,
}

export const DOOR = {
  z: -4, // положение портала с дверями
  openingWidth: 3.6,
  openingHeight: 3.4,
  maxAngle: Math.PI * 0.55, // ≈ 100°
}

export const CAMERA = {
  y: 1.6, // высота глаз
  startZ: 5.5,
  endZ: -98,
  baseFov: 55, // вертикальный FOV для горизонтальных экранов
  // На вертикальных экранах FOV растёт (картинка «отдаляется»),
  // чтобы коридор и аватар были видны целиком. Это верхний предел.
  maxFov: 85,
}

export const AVATAR = {
  distance: 2.5, // расстояние от стартовой позиции камеры (аватар стоит в мире на месте)
  // Когда камера подлетает вплотную, аватар и текст растворяются (метры до них)
  fadeFrom: 0.8,
  fadeTo: 0.25,

  // Высота картинки относительно высоты экрана (ноутбуки/горизонтальные).
  // > 1 — это нормально: сверху у картинки пустое поле, а низ уходит под край.
  heightFill: 1.35,
  // минимум, на сколько срез картинки (по груди) уходит под нижний край.
  // Почти 0 — аватар стоит как можно выше (на узких экранах видно больше руки)
  minBleed: 0.005,
  topMargin: 0.05, // отступ макушки от верхнего края экрана
  sideMargin: 0.03, // отступ рисунка (с рукой) от боковых краёв экрана

  fps: 8,
  sequence: [0, 1, 2, 1], // 1 → 2 → 3 → 2

  // Разметка картинки (доли от ширины/высоты, отсчёт сверху-слева)
  head: { u: 0.435, v: 0.345, width: 0.46 },
  content: { top: 0.11, left: 0.15, right: 0.99 }, // границы рисунка с рукой

  // Ширина надписи относительно ширины головы (>1 — выглядывает по бокам)
  // — так она выглядит на старте; дальше размер даёт перспектива.
  titleToHead: 2.1,
  // Насколько надпись стоит глубже аватара (метры по Z). Даёт параллакс:
  // при полёте аватар растёт быстрее текста — между ними чувствуется глубина.
  titleDepth: 1.5,
  titleMaxWidth: 0.94, // не шире 94% экрана

  // Широкие экраны (ПК, ноутбуки): стартовый кадр «ближе» — аватар и надпись
  // крупнее. Включается плавно между aspect from…to; телефоны и планшеты — без изменений.
  wide: {
    from: 1.3,
    to: 1.55,
    zoom: 1.25, // аватар крупнее на 25%
    sideBleed: 0.1, // рисунку (поднятой руке) можно уйти за боковой край на 10% ширины
    titleMaxWidth: 0.98, // надпись шире — сильнее выглядывает из-за головы
    // отступ сверху меньше — аватар выше, видно больше поднятой руки
    // (у рисунка над волосами есть пустое поле, макушка не обрезается)
    topMargin: -0.01,
  },

  // Вертикальные и квадратные экраны (телефоны, планшеты): рука с одной стороны
  // головы, поэтому рисунок несимметричен. Голову сдвигаем левее центра экрана
  // так, чтобы ВЕСЬ рисунок (с поднятой рукой) встал по центру: аватар крупнее,
  // рука не обрезается. Сдвиг делает камера холста аватара (setViewOffset) —
  // камера по-прежнему летит прямо в лицо. Надпись остаётся по центру экрана.
  // Плавно выключается к aspect `to`: на ноутбуках и ПК раскладка не меняется.
  balance: { from: 0.95, to: 1.3 },

  // Надпись «ПОРТФОЛИО» на вертикальных экранах (телефоны, планшеты портрет):
  // поднята над головой, на пустую стену — не перекрывает лицо. Доли высоты экрана.
  // На ноутбуках и ПК не действует (там надпись за головой, как раньше).
  titleAbove: {
    gap: 0.03, // зазор между макушкой и низом надписи
    top: 0.04, // минимальный отступ надписи от верхнего края экрана
  },
}

export const COLORS = {
  background: '#f2f2f2',
  wall: '#ffffff',
  nicheBack: '#d4d4d4',
  ceiling: '#e6e6e6',
  line: '#0a0a0a',
  door: '#f7f7f7',
}

/**
 * Состояние скролла. Его меняет один GSAP-таймлайн (ScrollTrigger, scrub),
 * а сцены читают значения в useFrame.
 */
export const scrollState = {
  camZ: CAMERA.startZ,
  door: 0, // 0 — закрыты, 1 — открыты
  pitch: 0, // наклон камеры (рад, вниз < 0) — в конце пути смотрим на стол
}

/**
 * «Подлёт» камеры к объекту по клику (не по скроллу): amount 0…1 смешивает
 * обычную позицию камеры с позой pos → взгляд на target. Анимируется GSAP.
 */
export const camFocus = {
  amount: 0,
  pos: [0, 0, 0],
  target: [0, 0, 0],
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** Прозрачность аватара: исчезает, только когда камера вплотную */
export const nearOpacity = (dist) => smoothstep(AVATAR.fadeTo, AVATAR.fadeFrom, dist)

/**
 * Огромные надписи гаснут раньше аватара — до того, как камера упрётся в них
 * (к этому моменту надпись уже в 2+ раза шире экрана). Пока надпись гаснет,
 * её растр «заморожен» (labelScale.js): браузер ничего не перерисовывает,
 * видеокарта только растягивает готовую картинку и меняет прозрачность.
 */
export const TEXT_FADE = { from: 1.5, to: 0.65 } // метры до плоскости надписи
export const textOpacity = (dist) => smoothstep(TEXT_FADE.to, TEXT_FADE.from, dist)
/** Надпись уже начала гаснуть при пролёте — растр больше не перерисовывать */
export const textFrozen = (dist) => dist < TEXT_FADE.from

/** Z-координата плоскости аватара в мире */
export const AVATAR_Z = CAMERA.startZ - AVATAR.distance

/** Z-координата плоскости надписи — глубже аватара */
export const TITLE_Z = AVATAR_Z - AVATAR.titleDepth

/**
 * Размер и положение аватара в мире (рассчитывается под экран
 * для стартовой позиции камеры, дальше аватар стоит на месте).
 * На старте: ничего не обрезано по бокам и сверху, срез по талии
 * под нижним краем, голова по центру.
 * Y — относительно уровня глаз камеры.
 */
export function avatarLayout(fov, aspect) {
  const { head, content } = AVATAR
  const tanHalf = Math.tan((fov * Math.PI) / 360)
  const d0 = AVATAR.distance
  const visH = 2 * d0 * tanHalf
  const visW = visH * aspect

  // Широкие экраны: плавно «приближаем» стартовый кадр (0 — как на телефоне, 1 — ПК)
  const { wide } = AVATAR
  const w = smoothstep(wide.from, wide.to, aspect)
  const zoom = 1 + (wide.zoom - 1) * w
  const titleMaxWidth = AVATAR.titleMaxWidth + (wide.titleMaxWidth - AVATAR.titleMaxWidth) * w

  // Размер: по высоте экрана, но рисунок не шире экрана;
  // на широких — крупнее, и рука может немного уйти за край
  const halfRoom = (0.5 - AVATAR.sideMargin + wide.sideBleed * w) * visW
  const byHeight = visH * AVATAR.heightFill * zoom

  // Вертикальные экраны: сдвиг головы влево (shift, в мире на плоскости аватара),
  // чтобы рисунок с рукой встал по центру. b = 0 на ноутбуках/ПК — сдвига нет.
  const b = 1 - smoothstep(AVATAR.balance.from, AVATAR.balance.to, aspect)
  const centered = Math.min(byHeight, (2 * halfRoom) / (content.right - content.left))
  const shift = b * Math.max(0, (content.right - head.u) * centered - halfRoom)

  const height = Math.min(
    byHeight,
    (halfRoom + shift) / (content.right - head.u), // справа — поднятая рука
    (halfRoom - shift) / (head.u - content.left),
  )

  // Низ: под нижним краем, и достаточно низко, чтобы макушка не обрезалась
  const bottomByEdge = -visH / 2 - AVATAR.minBleed * height
  const topMargin = AVATAR.topMargin + (wide.topMargin - AVATAR.topMargin) * w
  const bottomByTop = visH / 2 - topMargin * visH - (1 - content.top) * height
  const bottom = Math.min(bottomByEdge, bottomByTop)
  const centerY = bottom + height / 2
  const headWidth = head.width * height

  // Ширина надписи относительно головы: titleToHead, но на старте
  // не шире titleMaxWidth экрана. Дальше текст растёт вместе с головой.
  const titleToHead = Math.min(AVATAR.titleToHead, (titleMaxWidth * visW) / headWidth)

  const headY = centerY + (0.5 - head.v) * height

  return {
    height,
    offsetX: (0.5 - head.u) * height, // голова — на оси камеры по X
    // В мире голова стоит ровно на уровне глаз (на оси полёта камеры),
    // поэтому при приближении аватар растёт вокруг лица и никуда не уезжает.
    spriteY: CAMERA.y + (centerY - headY),
    headWorldY: CAMERA.y,
    // Где голова должна быть на экране (NDC, -1…1, вверх +).
    // Холст аватара сдвигает точку схода сюда — см. CameraRig alignToHead.
    headNdcY: headY / (visH / 2),
    // То же по X: голова левее центра на вертикальных экранах (0 на ПК)
    headNdcX: -shift / (visW / 2),
    shift,
    // Для надписи на вертикальных экранах (на старте, в плоскости аватара,
    // 0 — центр экрана): центр головы, макушка, высота кадра и «насколько экран
    // вертикальный» (0 на ноутбуках/ПК — там надпись не двигается)
    headY,
    hairY: bottom + (1 - content.top) * height,
    visH,
    portrait: b,
    headWidth,
    titleToHead,
  }
}

/**
 * FOV под соотношение сторон.
 * На горизонтальных экранах — базовый вертикальный FOV.
 * На вертикальных расширяем угол (сохраняя горизонтальный обзор),
 * чтобы коридор не обрезался по бокам; не больше maxFov.
 */
export function computeFov(aspect) {
  if (aspect >= 1) return CAMERA.baseFov
  const half = (CAMERA.baseFov * Math.PI) / 360
  const fov = (2 * Math.atan(Math.tan(half) / aspect) * 180) / Math.PI
  return Math.min(fov, CAMERA.maxFov)
}
