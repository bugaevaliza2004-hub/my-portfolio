import { Suspense, createRef, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import CameraRig from './scene/CameraRig'
import Corridor from './scene/Corridor'
import Doors from './scene/Doors'
import CarpetRunner from './scene/CarpetRunner'
import Avatar from './scene/Avatar'
import TitleAnchor from './scene/TitleAnchor'
import GalleryBlock from './scene/GalleryBlock'
import WorldLabel from './scene/WorldLabel'
import JournalDesk from './scene/JournalDesk'
import GraphiteDust from './scene/GraphiteDust'
import { GalleryLights } from './scene/Lamps'
import { FrontDriver, FrontRegister } from './scene/FrontLoop'
import ImageModal from './components/ImageModal'
import DocModal from './components/DocModal'
import Preloader from './components/Preloader'
import ContactEmail from './components/ContactEmail'
import { CAMERA, COLORS, camFocus, scrollState } from './scene/config'
import {
  GALLERY,
  JOURNAL,
  TIMELINE_DURATION,
  CONTACTS,
  cameraPath,
  contactsOpacity,
  contactsWidth,
  coverFocusPose,
  journalPitch,
  journalTitleOpacity,
  titleOpacity,
  titleWidth,
} from './scene/gallery'
import { DOCS } from './scene/docs'

gsap.registerPlugin(ScrollTrigger)
// на телефонах не пересчитывать скролл при скрытии адресной строки
ScrollTrigger.config({ ignoreMobileResize: true })

const canvasProps = {
  dpr: [1, 1.5],
  shadows: false,
  flat: true, // без tone mapping — чистые черный и белый
  camera: { fov: CAMERA.baseFov, near: 0.1, far: 130, position: [0, CAMERA.y, CAMERA.startZ], rotation: [0, 0, 0] },
}

// ~90vh прокрутки на единицу таймлайна + один экран
const TRACK_HEIGHT = `${Math.round(TIMELINE_DURATION * 90 + 100)}vh`

// Надписи блоков: позиция в мире и прозрачность (по скроллу)
const TITLES = [
  ...GALLERY.map((block, i) => ({
    id: block.id,
    text: block.title,
    position: [0, CAMERA.y, block.titleZ],
    getOpacity: titleOpacity(i),
  })),
  { id: 'journal', text: JOURNAL.title, position: [0, CAMERA.y, JOURNAL.titleZ], getOpacity: journalTitleOpacity },
].map((t) => ({ ...t, anchorRef: createRef(), textRef: createRef() }))

// Контакты на торцевой стене над столом
const contactsAnchorRef = createRef()
const contactsTextRef = createRef()

export default function App() {
  const trackRef = useRef(null)
  const frontLayerRef = useRef(null)
  // Плотность пикселей: 1.5 (как в canvasProps), при стабильной просадке FPS — 1
  const [dpr, setDpr] = useState(1.5)
  const titleRef = useRef(null)
  const anchorRef = useRef(null)

  const [modal, setModal] = useState(null) // { src, alt } | null
  const openModal = useCallback((work) => setModal(work), [])
  const closeModal = useCallback(() => setModal(null), [])

  // Документы: камера подлетает к обложке «сверху-сбоку», затем открывается галерея
  const [docIndex, setDocIndex] = useState(null)
  const flying = useRef(false)
  const openDoc = useCallback((i) => {
    if (flying.current) return
    flying.current = true
    document.body.style.overflow = 'hidden' // скролл не двигает камеру во время подлёта
    const { pos, target } = coverFocusPose(i)
    camFocus.pos = pos
    camFocus.target = target
    gsap.to(camFocus, {
      amount: 1,
      duration: 1.1,
      ease: 'power2.inOut',
      overwrite: true,
      onComplete: () => {
        flying.current = false
        setDocIndex(i)
      },
    })
  }, [])
  const closeDoc = useCallback(() => {
    setDocIndex(null)
    // модал при размонтировании вернёт overflow, заданный на время подлёта, —
    // снимаем блокировку прокрутки уже после него
    requestAnimationFrame(() => {
      document.body.style.overflow = ''
    })
    gsap.to(camFocus, { amount: 0, duration: 0.9, ease: 'power2.inOut', overwrite: true })
  }, [])

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: trackRef.current,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          invalidateOnRefresh: true, // точки остановки пересчитываются при повороте/ресайзе
        },
      })

      // Один таймлайн = один ScrollTrigger. Скролл двигает ТОЛЬКО камеру:
      // аватар, надписи и работы стоят на месте, камера пролетает сквозь
      // надписи и плавно тормозит перед каждым блоком работ.
      const path = cameraPath()
      let at = 0
      for (const { z, duration, ease } of path) {
        tl.to(scrollState, { camZ: z, duration, ease }, at)
        at += duration
      }

      // в конце пути камера слегка наклоняется — смотрим на стол с журналами
      const last = path[path.length - 1]
      tl.to(scrollState, { pitch: journalPitch, duration: last.duration * 0.5, ease: 'power1.inOut' }, at - last.duration * 0.5)

      // двери открываются сразу после пролёта аватара, до подлёта к порталу
      tl.to(scrollState, { door: 1, duration: 0.75, ease: 'power2.inOut' }, 0.7)
    })
    return () => ctx.revert()
  }, [])

  return (
    <>
      {/* Слой 0: коридор, двери, блоки с работами (кликабельный) */}
      <div className="layer layer--back">
        <Canvas {...canvasProps} dpr={[1, dpr]} gl={{ antialias: true, powerPreference: 'high-performance' }}>
          {/* слабое устройство — снижаем разрешение рендера (Retina не рендерит лишнее) */}
          <PerformanceMonitor flipflops={3} onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} onFallback={() => setDpr(1)} />
          <color attach="background" args={[COLORS.background]} />
          <fog attach="fog" args={[COLORS.background, 14, 80]} />
          <GalleryLights />
          <CameraRig />
          {/* холст аватара перерисовывается только когда нужно */}
          <FrontDriver layerRef={frontLayerRef} />
          <Corridor />
          <CarpetRunner />
          <Doors />
          <GraphiteDust />
          {GALLERY.map((block, i) => (
            <Suspense key={block.id} fallback={null}>
              <GalleryBlock index={i} onOpen={openModal} />
            </Suspense>
          ))}
          <Suspense fallback={null}>
            <JournalDesk onOpen={openDoc} />
          </Suspense>
          {TITLES.map((t) => (
            <WorldLabel
              key={t.id}
              anchorRef={t.anchorRef}
              textRef={t.textRef}
              position={t.position}
              worldWidth={titleWidth}
              getOpacity={t.getOpacity}
            />
          ))}
          <WorldLabel
            anchorRef={contactsAnchorRef}
            textRef={contactsTextRef}
            position={[0, CONTACTS.y, CONTACTS.z]}
            worldWidth={contactsWidth}
            getOpacity={contactsOpacity}
            freezeNear={false}
          />
        </Canvas>
      </div>

      {/* Слой 1: надписи — поверх коридора, за аватаром */}
      <div className="layer layer--text">
        <div ref={anchorRef} className="world-anchor">
          <h1 ref={titleRef} className="red-heading hero-title">
            Портфолио
          </h1>
        </div>
        {TITLES.map((t) => (
          <div key={t.id} ref={t.anchorRef} className="world-anchor">
            <h2 ref={t.textRef} className="red-heading section-title">
              {t.text}
            </h2>
          </div>
        ))}
        <div ref={contactsAnchorRef} className="world-anchor">
          <address ref={contactsTextRef} className="red-heading contacts">
            <span className="contacts__title">Контакты</span>
            <ContactEmail className="contacts__line contacts__link" email="bugaeva.liza2004@gmail.com" />
            <a className="contacts__line contacts__link" href="https://t.me/privetyaliza" target="_blank" rel="noopener noreferrer">
              tg: privetyaliza
            </a>
          </address>
        </div>
      </div>

      {/* Слой 2 (верхний): аватар на прозрачном холсте — поверх текста, клики пропускает */}
      <div ref={frontLayerRef} className="layer layer--front">
        <Canvas {...canvasProps} dpr={[1, dpr]} frameloop="demand" gl={{ antialias: true, alpha: true }} style={{ pointerEvents: 'none' }}>
          <FrontRegister />
          <CameraRig alignToHead />
          <TitleAnchor anchorRef={anchorRef} titleRef={titleRef} />
          <Suspense fallback={null}>
            <Avatar />
          </Suspense>
        </Canvas>
      </div>

      {/* Пост-эффекты: плёночный шум и виньетка (CSS, поверх сцены, под модалами) */}
      <div className="fx" aria-hidden="true" />

      {/* Длина скролла — по длине траектории камеры */}
      <div ref={trackRef} className="scroll-track" style={{ height: TRACK_HEIGHT }} aria-hidden="true" />

      {modal && <ImageModal src={modal.src} alt={modal.alt} onClose={closeModal} />}
      {docIndex !== null && <DocModal doc={DOCS[docIndex]} onClose={closeDoc} />}

      {/* Экран загрузки — поверх всего, пока не загрузятся текстуры */}
      <Preloader />
    </>
  )
}
