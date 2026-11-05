import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { COLORS, scrollState, smoothstep } from './config'
import { JOURNAL, coverWorldPosition, journalReveal } from './gallery'
import { DOCS } from './docs'
import { PAPER_BUMP, paperTexture, radialShadowTexture, rectShadowTexture } from './sketch'
import { graphiteTexture, tableTopTexture } from './tableSketch'
import { buildBoxStrokes, buildRectStrokes } from './handDrawn'

const { width: TW, depth: TD, height: TH, top: TT } = JOURNAL.table
const LEG = 0.05
const COVER_Y = TH + 0.007 // обложки лежат на столешнице (над ними — тень и кромка, без мерцания)

// Части стола (размеры и положения) — общие для мешей и для контуров «от руки»
const LEG_X = TW / 2 - 0.12
const LEG_Z = TD / 2 - 0.1
const PARTS = {
  top: { size: [TW, TT, TD], position: [0, TH - TT / 2, 0], width: 0.011 },
  apron: { size: [TW - 0.24, 0.12, TD - 0.2], position: [0, TH - TT - 0.06, 0], width: 0.008 },
  legs: [
    [-LEG_X, -LEG_Z],
    [LEG_X, -LEG_Z],
    [-LEG_X, LEG_Z],
    [LEG_X, LEG_Z],
  ].map(([x, z]) => ({ size: [LEG, TH - TT, LEG], position: [x, (TH - TT) / 2, z], width: 0.007 })),
  braces: [-LEG_X, LEG_X].map((x) => ({ size: [0.03, 0.03, LEG_Z * 2], position: [x, 0.18, 0], width: 0.006 })),
}

/**
 * Стол «от руки»: столешница заштрихована красным карандашом по грязной бумаге,
 * ножки — тёмный графит со штрихами, все контуры — дрожащие линии пера
 * (одна геометрия, одна отрисовка). Материалы простые (Lambert / Basic).
 */
function Table() {
  const strokes = useMemo(
    () => buildBoxStrokes([PARTS.top, PARTS.apron, ...PARTS.legs, ...PARTS.braces], 4242, { wave: 0.6 }),
    [],
  )
  useEffect(() => () => strokes.dispose(), [strokes])
  const top = tableTopTexture()
  const lead = graphiteTexture()
  const apronPaper = paperTexture(PARTS.apron.size[0], PARTS.apron.size[1])

  return (
    <group>
      {/* столешница: красная штриховка */}
      <mesh position={PARTS.top.position}>
        <boxGeometry args={PARTS.top.size} />
        <meshLambertMaterial color="#ffffff" map={top} />
      </mesh>
      {/* тёмный кант по переднему краю */}
      <mesh position={[0, TH - TT / 2, TD / 2 + 0.006]}>
        <boxGeometry args={[TW, TT * 0.4, 0.012]} />
        <meshLambertMaterial color="#ffffff" map={lead} />
      </mesh>
      {/* царга под столешницей — та же бумага, что и стены */}
      <mesh position={PARTS.apron.position}>
        <boxGeometry args={PARTS.apron.size} />
        <meshLambertMaterial color="#ececec" map={apronPaper.map} bumpMap={apronPaper.bumpMap} bumpScale={PAPER_BUMP} />
      </mesh>
      {/* ножки и нижние перекладины — графит */}
      {[...PARTS.legs, ...PARTS.braces].map((p) => (
        <mesh key={p.position.join()} position={p.position}>
          <boxGeometry args={p.size} />
          <meshLambertMaterial color="#ffffff" map={lead} />
        </mesh>
      ))}
      {/* контуры от руки */}
      <mesh geometry={strokes} frustumCulled={false}>
        <meshBasicMaterial color={COLORS.line} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * Зона «ЖУРНАЛ»: стол у торцевой стены, на нём три обложки
 * (лежат горизонтально — повернуты на 90° вокруг X).
 * Клик по обложке → onOpen(index): камера подлетает и открывается галерея страниц.
 */
export default function JournalDesk({ onOpen }) {
  const gl = useThree((s) => s.gl)
  const textures = useTexture(
    DOCS.map((d) => d.coverPreview),
    (loaded) => {
      const list = Array.isArray(loaded) ? loaded : [loaded]
      list.forEach((t) => {
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = gl.capabilities.getMaxAnisotropy() // обложки видны под углом
      })
    },
  )

  const covers = useRef([])
  const coverMats = useRef([])
  const coverShadowMats = useRef([])
  const coverEdgeMats = useRef([])
  // кромки обложек «от руки» — по одной геометрии на обложку, строятся один раз
  const coverEdges = useMemo(
    () =>
      DOCS.map((doc, i) => {
        const w = JOURNAL.cover.width
        return buildRectStrokes(w + 0.006, w / doc.coverAspect + 0.006, 0.008, 900 + i, {
          step: 0.02,
          jitter: 0.002,
          wave: 0.35,
          overshoot: 0.01,
        })
      }),
    [],
  )
  useEffect(() => () => coverEdges.forEach((g) => g.dispose()), [coverEdges])
  const hovered = useRef(-1)
  const rectShadow = rectShadowTexture()
  const roundShadow = radialShadowTexture()

  // Обложки «ложатся» на стол по очереди при появлении зоны
  const coverShow = (i, reveal) => smoothstep(0.3 + i * 0.15, 0.7 + i * 0.15, reveal)
  const clickable = (i) => coverShow(i, journalReveal()) > 0.9 && scrollState.camZ < JOURNAL.tableZ + 8

  useFrame(() => {
    const reveal = journalReveal()
    DOCS.forEach((_, i) => {
      const e = coverShow(i, reveal)
      covers.current[i].visible = e > 0.001
      covers.current[i].position.y = COVER_Y + (1 - e) * 0.5
      coverMats.current[i].opacity = e
      coverEdgeMats.current[i].opacity = e
      coverShadowMats.current[i].opacity = 0.38 * e
    })
    if (hovered.current >= 0) document.body.style.cursor = clickable(hovered.current) ? 'pointer' : ''
  })

  const cw = JOURNAL.cover.width

  return (
    <group position={[0, 0, JOURNAL.tableZ]}>
      {/* мягкая «тень» стола на полу */}
      <mesh position={[0, 0.006, 0.08]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-1}>
        <planeGeometry args={[TW * 1.2, TD * 1.7]} />
        <meshBasicMaterial map={roundShadow} color="#000000" transparent opacity={0.34} depthWrite={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-16} toneMapped={false} />
      </mesh>
      <Table />
      {DOCS.map((doc, i) => {
        const [x] = coverWorldPosition(i)
        const h = cw / doc.coverAspect
        return (
          <group
            key={doc.id}
            ref={(el) => {
              covers.current[i] = el
            }}
            position={[x, COVER_Y, 0.05]}
          >
            {/* лежит на столе: -90° вокруг X, плюс лёгкий поворот «как брошена» */}
            <group rotation={[-Math.PI / 2, 0, JOURNAL.cover.tilt[i] ?? 0]}>
              {/* мягкая «тень» под обложкой — чуть смещена к зрителю */}
              <mesh position={[0.025, -0.035, -0.004]}>
                <planeGeometry args={[cw + 0.12, h + 0.12]} />
                <meshBasicMaterial
                  ref={(el) => {
                    coverShadowMats.current[i] = el
                  }}
                  map={rectShadow}
                  color="#000000"
                  transparent
                  opacity={0}
                  depthWrite={false}
                  polygonOffset
                  polygonOffsetFactor={-1}
                  toneMapped={false}
                />
              </mesh>
              {/* кромка документа — дрожащая линия пера */}
              <mesh position={[0, 0, 0.0015]} geometry={coverEdges[i]}>
                <meshBasicMaterial
                  ref={(el) => {
                    coverEdgeMats.current[i] = el
                  }}
                  color={COLORS.line}
                  transparent
                  opacity={0}
                  side={THREE.DoubleSide}
                  toneMapped={false}
                />
              </mesh>
              <mesh
                onClick={(event) => {
                  if (!clickable(i)) return
                  event.stopPropagation()
                  if (event.delta > 10) return
                  onOpen(i)
                }}
                onPointerOver={() => {
                  hovered.current = i
                }}
                onPointerOut={() => {
                  if (hovered.current === i) {
                    hovered.current = -1
                    document.body.style.cursor = ''
                  }
                }}
              >
                <planeGeometry args={[cw, h]} />
                <meshBasicMaterial
                  ref={(el) => {
                    coverMats.current[i] = el
                  }}
                  map={textures[i]}
                  transparent
                  toneMapped={false}
                />
              </mesh>
            </group>
          </group>
        )
      })}
    </group>
  )
}
