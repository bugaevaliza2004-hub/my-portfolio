import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { AVATAR, AVATAR_Z, avatarLayout, nearOpacity } from './config'

import avatar1 from '../assets/avatar-1.png'
import avatar2 from '../assets/avatar-2.png'
import avatar3 from '../assets/avatar-3.png'

/**
 * 2D-аватар: sprite всегда повернут к камере.
 * Покадровая анимация 8 fps: 1 → 2 → 3 → 2.
 * Стоит в мире на месте (z = AVATAR_Z); камера пролетает сквозь него.
 */
export default function Avatar() {
  const textures = useTexture([avatar1, avatar2, avatar3])
  const material = useRef()
  const sprite = useRef()
  const current = useRef(-1)

  useMemo(() => {
    textures.forEach((t) => {
      t.colorSpace = THREE.SRGBColorSpace
    })
  }, [textures])

  // Мягкая тень (вместо CSS drop-shadow на весь холст): силуэт кадра,
  // уменьшенный до 64 px и растянутый обратно — получается размытым «бесплатно».
  // Считается один раз на кадр анимации.
  const shadows = useMemo(() => textures.map((t) => silhouette(t.image)), [textures])
  const shadowSprite = useRef()
  const shadowMat = useRef()

  useFrame(({ clock, camera }) => {
    // Растворяется, только когда камера подлетела вплотную / пролетела
    const opacity = nearOpacity(camera.position.z - AVATAR_Z)
    sprite.current.visible = opacity > 0.001
    shadowSprite.current.visible = sprite.current.visible
    if (!sprite.current.visible) return
    material.current.opacity = opacity
    shadowMat.current.opacity = SHADOW.opacity * opacity

    // Размер под экран (меняется только при ресайзе)
    const { height, spriteY, offsetX } = avatarLayout(camera.fov, camera.aspect)
    sprite.current.scale.set(height, height, 1)
    sprite.current.position.set(offsetX, spriteY, AVATAR_Z)
    // тень — чуть ниже и крупнее, сразу за аватаром
    const sh = height * SHADOW.scale
    shadowSprite.current.scale.set(sh, sh, 1)
    shadowSprite.current.position.set(offsetX, spriteY - height * SHADOW.drop, AVATAR_Z - 0.01)

    const step = Math.floor(clock.elapsedTime * AVATAR.fps) % AVATAR.sequence.length
    const frame = AVATAR.sequence[step]
    if (frame !== current.current) {
      current.current = frame
      material.current.map = textures[frame]
      shadowMat.current.map = shadows[frame]
    }
  })

  return (
    <>
      <sprite ref={shadowSprite} renderOrder={-1}>
        <spriteMaterial ref={shadowMat} map={shadows[0]} color="#000000" transparent depthWrite={false} toneMapped={false} />
      </sprite>
      <sprite ref={sprite}>
        <spriteMaterial
          ref={material}
          map={textures[0]}
          transparent
          depthWrite={false}
          toneMapped={false}
          onBeforeCompile={crushBlacks}
          customProgramCacheKey={crushKey}
        />
      </sprite>
    </>
  )
}

/*
 * Чистый чёрный: в рисунке тёмные места (волосы, свитер) с буро-красным
 * зерном. Прямо в шейдере (файлы не меняются, стоит пару операций на пиксель):
 *  — темнее BLACK.from — чисто чёрный, до BLACK.to — плавный переход к исходному;
 *  — у тёмных тонов (до BLACK.neutral) убирается цветной оттенок.
 * Значения — линейная яркость (≈ sRGB 28 / 68 / 110 из 255). Светлое не трогается.
 * Больше from/to — чернее и контрастнее, меньше — больше полутонов в волосах.
 */
const BLACK = { from: 0.012, to: 0.06, neutral: 0.16 }
const crushKey = () => 'avatar-crush-blacks'
function crushBlacks(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <map_fragment>',
    `#include <map_fragment>
    {
      float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      float sat = smoothstep(${BLACK.from * 2}, ${BLACK.neutral}, l);
      float keep = smoothstep(${BLACK.from}, ${BLACK.to}, l);
      diffuseColor.rgb = mix(vec3(l), diffuseColor.rgb, sat) * keep;
    }`,
  )
}

// Тень аватара: прозрачность, смещение вниз и увеличение (доли высоты рисунка)
// scale: силуэт занимает 60/64 текстуры (поля), 1.02 / 0.9375 ≈ 1.088 — тень на 2% крупнее рисунка
const SHADOW = { opacity: 0.35, drop: 0.012, scale: 1.088 }

/** Размытый силуэт картинки: альфа-канал в 64×64 → при растяжении сглаживается */
function silhouette(image) {
  const size = 64
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  ctx.drawImage(image, 2, 2, size - 4, size - 4) // поля — чтобы края тени не срезались
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#fff' // цвет задаёт материал (чёрный), здесь важна только альфа
  ctx.fillRect(0, 0, size, size)
  const t = new THREE.CanvasTexture(c)
  t.minFilter = THREE.LinearFilter
  t.generateMipmaps = false
  return t
}
