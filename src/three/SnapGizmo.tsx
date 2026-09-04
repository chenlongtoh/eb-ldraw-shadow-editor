import { useLayoutEffect, useRef, useState, useEffect } from 'react'
import { TransformControls } from '@react-three/drei'
import { createPortal, useThree } from '@react-three/fiber'
import type { Group } from 'three'
import * as THREE from 'three'
import type { TransformControls as TransformControlsImpl } from 'three-stdlib'
import type { EditableSnap } from '../store/editor-store'
import { useEditorStore } from '../store/editor-store'
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
import { applySnapAnchor, findSnapTarget, GRID_STEP_LDU, quantizePosition } from './snap-snap'

export interface RotateDragInfo {
  active: boolean
  deltaDeg: number
  axis: 'x' | 'y' | 'z'
  axisDeltaDeg: number
  eulerDeg: [number, number, number]
}

type TranslateGizmo = THREE.Object3D & {
  mode: string
  eye: THREE.Vector3
  updateMatrixWorld: (force?: boolean) => void
}

/**
 * three-stdlib TransformControls flips translate arrows toward the camera.
 * Pin them to display +X / +Y / +Z instead.
 *
 * Display +Y is LDraw −Y (up) after the π X-flip, which is the left-hand
 * “−Y is up” convention used by snaps.
 */
function pinTranslateGizmoAxes(controls: TransformControlsImpl): () => void {
  const gizmo = (controls as unknown as { gizmo: TranslateGizmo }).gizmo
  const original = gizmo.updateMatrixWorld
  const savedEye = new THREE.Vector3()

  gizmo.updateMatrixWorld = function pinnedUpdateMatrixWorld(this: TranslateGizmo, force?: boolean) {
    savedEye.copy(this.eye)
    if (this.mode === 'translate') {
      this.eye.x = Math.abs(this.eye.x)
      this.eye.y = Math.abs(this.eye.y)
      this.eye.z = Math.abs(this.eye.z)
    }
    original.call(this, force)
    this.eye.copy(savedEye)
  }

  return () => {
    gizmo.updateMatrixWorld = original
  }
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
  const controlsRef = useRef<TransformControlsImpl>(null)
  const [ready, setReady] = useState(false)
  const dragging = useRef(false)
  const historyPushed = useRef(false)
  const dragStartOri = useRef<Ori9 | null>(null)
  const dragStartEuler = useRef<[number, number, number] | null>(null)
  const centerLocalYRef = useRef(0)
  const ctrlHeldRef = useRef(false)
  const { controls, scene } = useThree()
  const geometryFeatures = useEditorStore((s) => s.geometryFeatures)
  const snapToGeometry = useEditorStore((s) => s.snapToGeometry)
  const gridLock = useEditorStore((s) => s.gridLock)
  const setSnapTargetFeatureId = useEditorStore((s) => s.setSnapTargetFeatureId)

  useEffect(() => {
    const syncCtrl = (e: KeyboardEvent) => {
      ctrlHeldRef.current = e.ctrlKey
    }
    const onBlur = () => {
      ctrlHeldRef.current = false
    }
    window.addEventListener('keydown', syncCtrl)
    window.addEventListener('keyup', syncCtrl)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', syncCtrl)
      window.removeEventListener('keyup', syncCtrl)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  useLayoutEffect(() => {
    setReady(!!anchorRef.current)
  }, [])

  useLayoutEffect(() => {
    const controls = controlsRef.current
    if (!controls || !ready) return
    return pinTranslateGizmoAxes(controls)
  }, [ready, mode, snap.id])

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

    let finalPos = position
    let finalOri = orientation
    let magnetHit = false

    if (
      mode === 'translate' &&
      snapToGeometry &&
      !ctrlHeldRef.current &&
      geometryFeatures.length > 0
    ) {
      const target = findSnapTarget(snap, position, orientation, geometryFeatures)
      if (target) {
        const anchored = applySnapAnchor(snap, target)
        finalPos = anchored.position
        finalOri = anchored.orientation
        magnetHit = true
        setSnapTargetFeatureId(target.id)
      } else {
        setSnapTargetFeatureId(null)
      }
    } else if (mode === 'translate') {
      setSnapTargetFeatureId(null)
    }

    // Grid lock: 1 LDU steps unless unlocked or already magnetically snapped.
    if (mode === 'translate' && gridLock && !magnetHit) {
      finalPos = quantizePosition(finalPos, GRID_STEP_LDU)
    }

    if (mode === 'translate') {
      const m = snapDisplayMatrix({ position: finalPos, orientation: finalOri })
      m.decompose(obj.position, obj.quaternion, obj.scale)
      obj.updateMatrix()
    }

    onLive(finalPos, finalOri)

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
          ref={controlsRef}
          key={`${snap.id}-${mode}`}
          object={anchorRef.current}
          mode={mode}
          space="world"
          size={0.85}
          translationSnap={mode === 'translate' && gridLock ? GRID_STEP_LDU : null}
          onMouseDown={() => {
            dragging.current = true
            historyPushed.current = false
            centerLocalYRef.current = geometryCenterLocalY(snap)
            dragStartOri.current = [...snap.orientation] as Ori9
            dragStartEuler.current = orientationToDisplayEulerDeg(snap.position, snap.orientation)
            if (controls) (controls as unknown as { enabled: boolean }).enabled = false
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
            setSnapTargetFeatureId(null)
            onRotateDrag?.({
              active: false,
              deltaDeg: 0,
              axis: 'y',
              axisDeltaDeg: 0,
              eulerDeg: orientationToDisplayEulerDeg(snap.position, snap.orientation),
            })
            if (controls) (controls as unknown as { enabled: boolean }).enabled = true
          }}
        />
      )}
    </>,
    scene,
  )
}
