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
function AxisArrow({ length, locked }: { length: number; locked: boolean }) {
  const shaftLen = Math.max(length * 0.55, 6)
  const color = locked ? '#94a3b8' : '#f8fafc'
  const opacity = locked ? 0.45 : 0.85
  return (
    <group>
      <mesh position={[0, -shaftLen / 2, 0]}>
        <cylinderGeometry args={[0.35, 0.35, shaftLen, 8]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
      </mesh>
      <mesh position={[0, -(shaftLen + 1.4), 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[1.1, 2.8, 10]} />
        <meshBasicMaterial color={color} transparent opacity={opacity + 0.05} depthTest={false} />
      </mesh>
    </group>
  )
}

/** Start Y for stacking sections toward −Y (LDCad Neg-Y pointing). */
function stackStartY(total: number, center: boolean): number {
  return center ? total / 2 : 0
}

function snapMatProps(snap: EditableSnap, selected: boolean, locked: boolean) {
  const color = snapColor(snap, selected, { locked })
  const opacity = locked
    ? selected
      ? 0.4
      : 0.22
    : selected
      ? 0.55
      : 0.35
  return {
    color,
    transparent: true as const,
    opacity,
    depthTest: false as const,
    wireframe: locked,
  }
}

function CylSections({
  snap,
  selected,
  locked,
}: {
  snap: EditableSnap
  selected: boolean
  locked: boolean
}) {
  const mat = snapMatProps(snap, selected, locked)
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
        const isSquare = sec.shape === 'S'
        return (
          <mesh key={i} position={[0, mid, 0]}>
            {isSquare ? (
              <boxGeometry args={[r * 2, h, r * 2]} />
            ) : (
              <cylinderGeometry args={[r, r, h, 20]} />
            )}
            <meshBasicMaterial {...mat} wireframe={locked || sec.shape === 'A'} />
          </mesh>
        )
      })}
    </>
  )
}

function ClipVisual({
  snap,
  selected,
  locked,
}: {
  snap: EditableSnap
  selected: boolean
  locked: boolean
}) {
  const mat = snapMatProps(snap, selected, locked)
  const r = snap.radius ?? 4
  const len = snap.length ?? 8
  const midY = snap.center ? 0 : -len / 2
  return (
    <mesh position={[0, midY, 0]}>
      <cylinderGeometry args={[r, r, len, 24, 1, true, 0, Math.PI * 1.4]} />
      <meshBasicMaterial {...mat} opacity={locked ? mat.opacity : selected ? 0.6 : 0.4} side={THREE.DoubleSide} />
    </mesh>
  )
}

function FingerVisual({
  snap,
  selected,
  locked,
}: {
  snap: EditableSnap
  selected: boolean
  locked: boolean
}) {
  const mat = snapMatProps(snap, selected, locked)
  const seq = snap.seq ?? [1, 1, 1]
  const r = snap.radius ?? 4
  const pitch = 4
  return (
    <group>
      {seq.map((solid, i) => {
        const y = -i * pitch
        return (
          <mesh key={i} position={[0, y, 0]}>
            <cylinderGeometry args={[r, r, pitch * 0.85, 16]} />
            <meshBasicMaterial
              {...mat}
              opacity={solid ? mat.opacity : locked ? 0.1 : 0.12}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function GenVisual({
  snap,
  selected,
  locked,
}: {
  snap: EditableSnap
  selected: boolean
  locked: boolean
}) {
  const color = snapColor(snap, selected, { locked })
  const opacity = locked ? (selected ? 0.55 : 0.35) : selected ? 0.9 : 0.7
  const b = snap.bounding
  if (b?.kind === 'box' && b.values.length >= 3) {
    const [x, y, z] = b.values
    return (
      <mesh>
        <boxGeometry args={[Math.max(x, 1), Math.max(y, 1), Math.max(z, 1)]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={opacity} depthTest={false} />
      </mesh>
    )
  }
  if (b?.kind === 'sphere' || snap.metaType === 'SNAP_SPH') {
    const r = b?.values[0] ?? snap.radius ?? 4
    return (
      <mesh>
        <sphereGeometry args={[Math.max(r, 1), 16, 12]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={opacity} depthTest={false} />
      </mesh>
    )
  }
  const r = maxRadius(snap)
  const h = cylinderLength(snap)
  return (
    <mesh>
      <cylinderGeometry args={[r, r, Math.max(h, 2), 16]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={opacity} depthTest={false} />
    </mesh>
  )
}

export function SnapOverlay({
  snap,
  selected,
  locked = false,
  onSelect,
  showLabel,
}: {
  snap: EditableSnap
  selected: boolean
  /** Inherited / read-only — muted color + wireframe. */
  locked?: boolean
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
      {snap.metaType === 'SNAP_CYL' && (
        <CylSections snap={snap} selected={selected} locked={locked} />
      )}
      {snap.metaType === 'SNAP_CLP' && (
        <ClipVisual snap={snap} selected={selected} locked={locked} />
      )}
      {snap.metaType === 'SNAP_FGR' && (
        <FingerVisual snap={snap} selected={selected} locked={locked} />
      )}
      {(snap.metaType === 'SNAP_GEN' || snap.metaType === 'SNAP_SPH') && (
        <GenVisual snap={snap} selected={selected} locked={locked} />
      )}
      <AxisArrow length={len} locked={locked} />
      {showLabel && (
        <Html center distanceFactor={180} style={{ pointerEvents: 'none' }}>
          <div className={`snap-label${locked ? ' snap-label-locked' : ''}`}>
            {snap.metaType.replace('SNAP_', '')}
            {locked ? ' · incl' : ''}
            <span>{snap.sourceFile}</span>
          </div>
        </Html>
      )}
    </group>
  )
}
