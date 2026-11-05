import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { buildOutlineStrokes } from './handDrawn'

/**
 * Контур «от руки» всех коробок внутри (кроме userData.noOutline):
 * дрожащие штрихи пера, собранные в одну геометрию — одна отрисовка.
 * Строится один раз при монтировании; движется вместе с группой.
 */
export default function SketchOutline({ children, width = 0.01, seed = 1, color = '#141414', opts }) {
  const root = useRef()
  useLayoutEffect(() => {
    const group = root.current
    const geom = buildOutlineStrokes(group, width, seed, opts)
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.frustumCulled = false
    mesh.userData.noOutline = true
    group.add(mesh)
    return () => {
      group.remove(mesh)
      geom.dispose()
      mat.dispose()
    }
    // строится один раз: состав коробок статичен
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return <group ref={root}>{children}</group>
}
