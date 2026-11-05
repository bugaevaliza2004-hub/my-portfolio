/*
 * Дешёвое масштабирование HTML-надписей, «стоящих» в 3D.
 *
 * Раньше размер менялся через font-size в каждом кадре — браузер заново
 * рисовал буквы с многослойным белым свечением (text-shadow), а при пролёте
 * сквозь надпись она в разы больше экрана. Это и роняло FPS до ~5.
 *
 * Теперь: font-size (растр) меняется редко, а плавный размер даёт
 * transform: scale() — его делает видеокарта без перерисовки.
 *  — растр берётся чуть крупнее нужного (OVERSHOOT) — надпись слегка
 *    уменьшается, а значит остаётся чёткой;
 *  — перерисовка — только когда масштаб выйдет из окна [MIN_SCALE…MAX_SCALE];
 *  — у огромной надписи растр не больше MAX_RASTER ширин экрана: дальше она
 *    просто растягивается (в этот момент камера уже пролетает сквозь неё).
 */
const OVERSHOOT = 1.25
// Когда надпись быстро растёт (камера подлетает), растр берётся с бо́льшим
// запасом — перерисовок за пролёт вдвое меньше (каждая — это рывок FPS)
const GROW_OVERSHOOT = 1.8
const MIN_SCALE = 0.5
const MAX_SCALE = 1.05
// Предел растра (в ширинах экрана). Дальше надпись просто растягивается
// видеокартой — в этот момент камера уже пролетает сквозь неё.
// На тач-устройствах (телефоны/планшеты) предел ниже — у них слабее GPU.
const TOUCH =
  typeof window !== 'undefined' && !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches
const MAX_RASTER = TOUCH ? 1.1 : 1.6

/**
 * state — объект { base, ... } на компонент (useRef().current).
 * ratio — ширина текста / font-size. x, y — центр на экране (px), w — нужная ширина (px).
 * frozen — надпись гаснет при пролёте: растр не перерисовывается вообще,
 *   видеокарта только растягивает готовую текстуру (ни одной перерисовки
 *   текста с обводкой и свечением в самый тяжёлый момент).
 */
export function placeLabel(anchor, text, state, { x, y, w, ratio, viewW, frozen = false }) {
  const font = w / ratio // нужный font-size
  const cap = (viewW * MAX_RASTER) / ratio // предел растра
  let base = state.base
  const s0 = base ? font / base : 0
  const atCap = base && base >= cap * 0.999
  const growing = base && s0 > MAX_SCALE
  if (!base || s0 < MIN_SCALE || (growing && !atCap && !frozen)) {
    base = Math.min(font * (growing ? GROW_OVERSHOOT : OVERSHOOT), cap)
    state.base = base
    text.style.fontSize = `${base.toFixed(1)}px`
  }
  const s = font / base
  anchor.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(4)})`
}
