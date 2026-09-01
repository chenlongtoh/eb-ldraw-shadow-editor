import { useLayoutEffect, useRef } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { EditableSnap } from '../store/editor-store'
import { cylinderLength, maxRadius, snapColor, snapLocalMatrix } from './snap-geometry'

/**
 * LDCad rest snaps "point into" local −Y (Neg Y base). Draw overlays and the
 * direction arrow along −Y so they align with stud / anti-stud geometry
 * (LDraw −Y = up after the display π X-flip).
 */
function AxisArrow({ length }: { length: number }) {
  const shaftLen = Math.max(length * 0.55, 6)
  return (
    <group>
      <mesh position={[0, -shaftLen / 2, 0]}>
        <cylinderGeometry args={[0.35, 0.35, shaftLen, 8]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={0.85} depthTest={false} />
      </mesh>
      {/* ConeGeometry points +Y by default; flip so the tip faces −Y */}
      <mesh position={[0, -(shaftLen + 1.4), 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1.1, 2.8, 10]} />
        <meshBasicMaterial color="#f8fafc" transparent opacity={0.9} depthTest={false} />
      </mesh>
    </group>
  )
}

/** Start Y for stacking sections toward −Y (LDCad Neg-Y pointing). */
function stackStartY(total: number, center: boolean): number {
  // center: span [+total/2 → −total/2]; non-center: span [0 → −total]
  return center ? total / 2 : 0
}

function CylSections({ snap, selected }: { snap: EditableSnap; selected: boolean }) {
  const color = snapColor(snap, selected)
  const secs = snap.secs ?? [{ shape: 'R', values: [maxRadius(snap), cylinderLength(snap)] }]
  const total = secs.reduce((s, sec) => s + (sec.values[1] ?? 0), 0)
  let y = stackStartY(total, snap.center)
  return (
    <>
      {secs.map((sec, i) => {
        const r = Math.max(sec.values[0] ?? 4, 0.5)
        const h = Math.max(sec.values[1] ?? 1, 0.5)
        const mid = y - h / 2
        y -= h
        return (
          <mesh key={i} position={[0, mid, 0]}>
            <cylinderGeometry args={[r, r, h, 20]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={selected ? 0.55 : 0.35}
              depthTest={false}
              wireframe={sec.shape === 'A' || sec.shape === 'S'}
            />
          </mesh>
        )
      })}
    </>
  )
}

function ClipVisual({ snap, selected }: { snap: EditableSnap; selected: boolean }) {
  const color = snapColor(snap, selected)
  const r = snap.radius ?? 4
  const len = snap.length ?? 8
  // Non-centered: extend into −Y; centered: symmetric about origin
  const midY = snap.center ? 0 : -len / 2
  return (
    <mesh position={[0, midY, 0]}>
      <cylinderGeometry args={[r, r, len, 24, 1, true, 0, Math.PI * 1.4]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={selected ? 0.6 : 0.4}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function FingerVisual({ snap, selected }: { snap: EditableSnap; selected: boolean }) {
  const color = snapColor(snap, selected)
  const r = snap.radius ?? 4
  const seq = snap.seq ?? [8]
  const total = seq.reduce((a, b) => a + b, 0)
  let y = stackStartY(total, snap.center)
  return (
    <>
      {seq.map((h, i) => {
        const mid = y - h / 2
        y -= h
        const solid = i % 2 === 0
        return (
          <mesh key={i} position={[0, mid, 0]}>
            <cylinderGeometry args={[r, r, Math.max(h, 0.5), 16]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={solid ? (selected ? 0.55 : 0.35) : 0.12}
              depthTest={false}
            />
          </mesh>
        )
      })}
    </>
  )
}

function GenVisual({ snap, selected }: { snap: EditableSnap; selected: boolean }) {
  const color = snapColor(snap, selected)
  const b = snap.bounding
  if (!b || b.kind === 'sphere' || snap.metaType === 'SNAP_SPH') {
    const radius = b?.kind === 'sphere' ? (b.values[0] ?? 8) : (snap.radius ?? 8)
    return (
      <mesh>
        <sphereGeometry args={[radius, 20, 16]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={selected ? 0.9 : 0.7} depthTest={false} />
      </mesh>
    )
  }
  if (b.kind === 'cylinder') {
    const r = b.values[0] ?? 8
    const h = b.values[1] ?? 16
    return (
      <mesh>
        <cylinderGeometry args={[r, r, h, 20]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.7} depthTest={false} />
      </mesh>
    )
  }
  const [sx = 8, sy = 8, sz = 8] = b.values
  return (
    <mesh>
      <boxGeometry args={[sx, sy, sz]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={0.7} depthTest={false} />
    </mesh>
  )
}

export function SnapOverlay({
  snap,
  selected,
  onSelect,
  showLabel,
}: {
  snap: EditableSnap
  selected: boolean
  onSelect: (id: string) => void
  showLabel: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const len = Math.max(cylinderLength(snap), maxRadius(snap) * 2, 8)

  useLayoutEffect(() => {
    const g = groupRef.current
    if (!g) return
    g.matrix.copy(snapLocalMatrix(snap))
    g.matrixAutoUpdate = false
    g.updateMatrixWorld(true)
  }, [snap])

  return (
    <group
      ref={groupRef}
      matrixAutoUpdate={false}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(snap.id)
      }}
    >
      {snap.metaType === 'SNAP_CYL' && <CylSections snap={snap} selected={selected} />}
      {snap.metaType === 'SNAP_CLP' && <ClipVisual snap={snap} selected={selected} />}
      {snap.metaType === 'SNAP_FGR' && <FingerVisual snap={snap} selected={selected} />}
      {(snap.metaType === 'SNAP_GEN' || snap.metaType === 'SNAP_SPH') && (
        <GenVisual snap={snap} selected={selected} />
      )}
      <AxisArrow length={len} />
      {showLabel && (
        <Html center distanceFactor={180} style={{ pointerEvents: 'none' }}>
          <div className="snap-label">
            {snap.metaType.replace('SNAP_', '')}
            <span>{snap.sourceFile}</span>
          </div>
        </Html>
      )}
    </group>
  )
}
