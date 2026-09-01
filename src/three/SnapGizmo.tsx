import { useLayoutEffect, useRef, useState } from 'react'
import { TransformControls } from '@react-three/drei'
import { createPortal, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import type { EditableSnap } from '../store/editor-store'
import {
  displayCenterMatrixToLDrawPosOri,
  displayMatrixToLDrawPosOri,
  geometryCenterLocalY,
  snapDisplayMatrix,
  snapDisplayMatrixAtGeometryCenter,
} from './snap-geometry'
import {
  displayOrientationDeltaDeg,
  dominantEulerDelta,
  orientationToDisplayEulerDeg,
  type Ori9,
  type Vec3,
} from './snap-rotation'

export interface RotateDragInfo {
  active: boolean
  deltaDeg: number
  axis: 'x' | 'y' | 'z'
  axisDeltaDeg: number
  eulerDeg: [number, number, number]
}

/**
 * Gizmo anchor + TransformControls at the scene root in display space.
 *
 * Translate: anchor at placement origin (LDCad `pos`).
 * Rotate: anchor at geometry center so rings orbit the visible snap volume,
 * then convert back to placement origin on emit.
 */
export function SnapGizmo({
  snap,
  mode,
  enabled,
  onDragStart,
  onLive,
  onRotateDrag,
}: {
  snap: EditableSnap
  mode: 'translate' | 'rotate'
  enabled: boolean
  onDragStart: () => void
  onLive: (pos: Vec3, ori: Ori9) => void
  onRotateDrag?: (info: RotateDragInfo) => void
}) {
  const anchorRef = useRef<Group>(null)
  const [ready, setReady] = useState(false)
  const dragging = useRef(false)
  const historyPushed = useRef(false)
  const dragStartOri = useRef<Ori9 | null>(null)
  const dragStartEuler = useRef<[number, number, number] | null>(null)
  const centerLocalYRef = useRef(0)
  const { controls, scene } = useThree()

  useLayoutEffect(() => {
    setReady(!!anchorRef.current)
  }, [])

  useLayoutEffect(() => {
    const obj = anchorRef.current
    if (!obj || dragging.current) return
    const m =
      mode === 'rotate' ? snapDisplayMatrixAtGeometryCenter(snap) : snapDisplayMatrix(snap)
    m.decompose(obj.position, obj.quaternion, obj.scale)
    obj.updateMatrix()
  }, [snap, mode])

  const emitLive = () => {
    const obj = anchorRef.current
    if (!obj) return
    obj.updateMatrix()

    const { position, orientation } =
      mode === 'rotate'
        ? displayCenterMatrixToLDrawPosOri(obj.matrix, centerLocalYRef.current)
        : displayMatrixToLDrawPosOri(obj.matrix)

    onLive(position, orientation)

    if (mode === 'rotate' && dragging.current && dragStartOri.current && dragStartEuler.current) {
      const eulerDeg = orientationToDisplayEulerDeg(position, orientation)
      const deltaDeg = displayOrientationDeltaDeg(position, dragStartOri.current, orientation)
      const dom = dominantEulerDelta(dragStartEuler.current, eulerDeg)
      onRotateDrag?.({
        active: true,
        deltaDeg,
        axis: dom.axis,
        axisDeltaDeg: dom.degrees,
        eulerDeg,
      })
    }
  }

  return createPortal(
    <>
      <group ref={anchorRef} />
      {enabled && ready && anchorRef.current && (
        <TransformControls
          key={`${snap.id}-${mode}`}
          object={anchorRef.current}
          mode={mode}
          space="world"
          size={0.85}
          onMouseDown={() => {
            dragging.current = true
            historyPushed.current = false
            centerLocalYRef.current = geometryCenterLocalY(snap)
            dragStartOri.current = [...snap.orientation] as Ori9
            dragStartEuler.current = orientationToDisplayEulerDeg(snap.position, snap.orientation)
            if (controls) (controls as { enabled: boolean }).enabled = false
          }}
          onObjectChange={() => {
            if (!dragging.current) return
            if (!historyPushed.current) {
              historyPushed.current = true
              onDragStart()
            }
            emitLive()
          }}
          onMouseUp={() => {
            if (dragging.current) emitLive()
            dragging.current = false
            historyPushed.current = false
            dragStartOri.current = null
            dragStartEuler.current = null
            onRotateDrag?.({
              active: false,
              deltaDeg: 0,
              axis: 'y',
              axisDeltaDeg: 0,
              eulerDeg: orientationToDisplayEulerDeg(snap.position, snap.orientation),
            })
            if (controls) (controls as { enabled: boolean }).enabled = true
          }}
        />
      )}
    </>,
    scene,
  )
}
