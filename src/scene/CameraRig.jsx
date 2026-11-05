import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CAMERA, avatarLayout, camFocus, computeFov, scrollState } from './config'

const baseEuler = new THREE.Euler()
const baseQuat = new THREE.Quaternion()
const focusQuat = new THREE.Quaternion()
const focusPos = new THREE.Vector3()
const focusTarget = new THREE.Vector3()
const lookMatrix = new THREE.Matrix4()
const UP = new THREE.Vector3(0, 1, 0)

/**
 * Камера строго по центру коридора и смотрит вдоль -Z
 * (центральная перспектива; в самом конце пути — лёгкий наклон к столу).
 * Позицию по Z задаёт GSAP ScrollTrigger (через scrollState) —
 * скролл двигает только камеру, объекты стоят на месте.
 * camFocus — плавный подлёт к объекту по клику (обложки на столе).
 *
 * alignToHead (только для холста аватара): точка схода смещается
 * в голову аватара. Камера летит прямо в лицо, и аватар с надписью
 * растут вокруг него, а не уезжают вверх/вниз — на любом экране.
 */
export default function CameraRig({ alignToHead = false }) {
  const applied = useRef({ w: 0, h: 0, x: NaN, y: NaN })

  useFrame(({ camera, size }) => {
    const aspect = size.width / size.height
    const fov = computeFov(aspect)
    if (camera.fov !== fov || camera.aspect !== aspect) {
      camera.aspect = aspect
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    if (alignToHead) {
      const { headNdcX, headNdcY } = avatarLayout(fov, aspect)
      // сдвиг картинки так, чтобы голова оказалась в (headNdcX, headNdcY) (в пикселях).
      // По X сдвиг есть только на вертикальных экранах — рука помещается целиком.
      const offsetX = (-headNdcX * size.width) / 2
      const offsetY = (headNdcY * size.height) / 2
      const a = applied.current
      if (
        a.w !== size.width ||
        a.h !== size.height ||
        Math.abs(a.x - offsetX) > 0.01 ||
        Math.abs(a.y - offsetY) > 0.01
      ) {
        camera.setViewOffset(size.width, size.height, offsetX, offsetY, size.width, size.height)
        a.w = size.width
        a.h = size.height
        a.x = offsetX
        a.y = offsetY
      }
    }

    // Базовая поза: по скроллу. (R3F по умолчанию смотрит на (0,0,0) — задаём явно.)
    camera.position.set(0, CAMERA.y, scrollState.camZ)
    baseEuler.set(scrollState.pitch, 0, 0)
    baseQuat.setFromEuler(baseEuler)

    if (camFocus.amount > 0) {
      focusPos.fromArray(camFocus.pos)
      focusTarget.fromArray(camFocus.target)
      lookMatrix.lookAt(focusPos, focusTarget, UP)
      focusQuat.setFromRotationMatrix(lookMatrix)
      camera.position.lerp(focusPos, camFocus.amount)
      camera.quaternion.slerpQuaternions(baseQuat, focusQuat, camFocus.amount)
    } else {
      camera.quaternion.copy(baseQuat)
    }
  })

  return null
}
