import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import SketchOutline from './SketchOutline'
import { DOOR, COLORS, scrollState } from './config'
import { PAPER_BUMP, paperTexture } from './sketch'

const LEAF_W = DOOR.openingWidth / 2 - 0.01
const LEAF_H = DOOR.openingHeight - 0.02
const THICK = 0.07
// та же бумага, что и на стенах (масштаб под створку)
const DOOR_PAPER = paperTexture(DOOR.openingWidth / 2, DOOR.openingHeight)
const MARGIN = 0.18
// створки — красные, в цвет заголовков (обводка и ручки остаются чёрными)
const LEAF_COLOR = '#ff0000'
// контур «от руки» в масштабе двери
const LEAF_OUTLINE = { step: 0.05, jitter: 0.004, wave: 0.7, overshoot: 0.02, lift: 0.002 }

// Филенка: рамка + внутренняя вставка (двойная линия, как у молдинга)
function Panel({ w, h, x, y, z }) {
  return (
    <group position={[x, y, z]}>
      <mesh>
        <boxGeometry args={[w, h, 0.02]} />
        <meshLambertMaterial color={LEAF_COLOR} map={DOOR_PAPER.map} bumpMap={DOOR_PAPER.bumpMap} bumpScale={PAPER_BUMP} />
      </mesh>
      <mesh position={[0, 0, Math.sign(z) * 0.012]}>
        <boxGeometry args={[w - 0.12, h - 0.12, 0.005]} />
        <meshLambertMaterial color={LEAF_COLOR} map={DOOR_PAPER.map} bumpMap={DOOR_PAPER.bumpMap} bumpScale={PAPER_BUMP} />
      </mesh>
    </group>
  )
}

function Handle({ x, z }) {
  const s = Math.sign(z)
  return (
    <group position={[x, 1.1, z]}>
      {/* ручки — тушью, без контура */}
      {/* накладка */}
      <mesh userData={{ noOutline: true }}>
        <boxGeometry args={[0.05, 0.3, 0.015]} />
        <meshLambertMaterial color={COLORS.line} />
      </mesh>
      {/* ножка */}
      <mesh position={[0, 0.06, s * 0.03]} userData={{ noOutline: true }}>
        <boxGeometry args={[0.03, 0.03, 0.06]} />
        <meshLambertMaterial color={COLORS.line} />
      </mesh>
      {/* рычаг — смотрит к центру проёма */}
      <mesh position={[-Math.sign(x) * 0.07, 0.06, s * 0.06]} userData={{ noOutline: true }}>
        <boxGeometry args={[0.17, 0.03, 0.03]} />
        <meshLambertMaterial color={COLORS.line} />
      </mesh>
    </group>
  )
}

/**
 * Створка. dir = 1 — левая (петли слева, полотно идёт вправо),
 * dir = -1 — правая. Открывается наружу — к камере.
 */
function Leaf({ dir }) {
  const ref = useRef()
  const cx = dir * (LEAF_W / 2) // центр полотна относительно петли

  const lowerH = LEAF_H * 0.24
  const lowerY = MARGIN + lowerH / 2
  const upperBottom = MARGIN + lowerH + 0.16
  const upperH = LEAF_H - MARGIN - upperBottom
  const upperY = upperBottom + upperH / 2
  const panelW = LEAF_W - MARGIN * 2

  useFrame(() => {
    ref.current.rotation.y = -dir * scrollState.door * DOOR.maxAngle
  })

  return (
    <group ref={ref} position={[-dir * (DOOR.openingWidth / 2), 0, DOOR.z]}>
      {/* контуры створки и филёнок — дрожащим пером */}
      <SketchOutline width={0.009} seed={dir > 0 ? 11 : 12} opts={LEAF_OUTLINE}>
      {/* полотно */}
      <mesh position={[cx, LEAF_H / 2, 0]}>
        <boxGeometry args={[LEAF_W, LEAF_H, THICK]} />
        <meshLambertMaterial color={LEAF_COLOR} map={DOOR_PAPER.map} bumpMap={DOOR_PAPER.bumpMap} bumpScale={PAPER_BUMP} />
      </mesh>

      {/* филенки и ручки с обеих сторон */}
      {[1, -1].map((f) => {
        const z = f * (THICK / 2 + 0.01)
        return (
          <group key={f}>
            <Panel w={panelW} h={upperH} x={cx} y={upperY} z={z} />
            <Panel w={panelW} h={lowerH} x={cx} y={lowerY} z={z} />
            <Handle x={dir * (LEAF_W - 0.13)} z={f * (THICK / 2 + 0.008)} />
          </group>
        )
      })}
      </SketchOutline>
    </group>
  )
}

export default function Doors() {
  return (
    <group>
      <Leaf dir={1} />
      <Leaf dir={-1} />
    </group>
  )
}
