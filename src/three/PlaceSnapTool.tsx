import { useEffect, useMemo, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { EditableSnap } from '../store/editor-store'
import { useEditorStore } from '../store/editor-store'
import { SnapOverlay } from './SnapOverlay'
import { LDRAW_DISPLAY_FLIP_INV } from './snap-geometry'
import {
  applySnapAnchor,
  findSnapTarget,
  GRID_STEP_LDU,
  quantizePosition,
} from './snap-snap'
import type { Ori9, Vec3 } from './snap-rotation'

/**
 * Click-to-place tool: ghost snap follows the pointer on a plane through the
 * orbit target; left-click commits, Escape cancels. Magnetic geometry snap and
 * 1 LDU grid lock apply the same as gizmo translate.
 */
export function PlaceSnapTool() {
  const pendingPlacement = useEditorStore((s) => s.pendingPlacement)
  const pendingPose = useEditorStore((s) => s.pendingPose)
  const updatePendingPose = useEditorStore((s) => s.updatePendingPose)
  const confirmPlaceSnap = useEditorStore((s) => s.confirmPlaceSnap)
  const cancelPlaceSnap = useEditorStore((s) => s.cancelPlaceSnap)
  const geometryFeatures = useEditorStore((s) => s.geometryFeatures)
  const snapToGeometry = useEditorStore((s) => s.snapToGeometry)
  const gridLock = useEditorStore((s) => s.gridLock)
  const setSnapTargetFeatureId = useEditorStore((s) => s.setSnapTargetFeatureId)
  const { camera, controls, gl } = useThree()

  const plane = useMemo(() => new THREE.Plane(), [])
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const ndc = useMemo(() => new THREE.Vector2(), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  const ctrlHeldRef = useRef(false)

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

  useEffect(() => {
    if (!pendingPlacement) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancelPlaceSnap()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingPlacement, cancelPlaceSnap])

  useEffect(() => {
    if (!pendingPlacement) {
      gl.domElement.style.cursor = ''
      return
    }
    gl.domElement.style.cursor = 'crosshair'

    const resolvePose = (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1

      const focus = new THREE.Vector3()
      if (controls && typeof controls === 'object' && 'target' in controls) {
        focus.copy((controls as { target: THREE.Vector3 }).target)
      }

      // Plane through orbit target, facing the camera (display space).
      const normal = camera.getWorldDirection(new THREE.Vector3()).negate()
      plane.setFromNormalAndCoplanarPoint(normal, focus)
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return null

      // Display → LDraw local (undo π X-flip used by the scene group).
      const ldraw = hit.clone().applyMatrix4(LDRAW_DISPLAY_FLIP_INV)
      let position: Vec3 = [ldraw.x, ldraw.y, ldraw.z]
      let orientation = [...(pendingPlacement.orientation ?? [1, 0, 0, 0, 1, 0, 0, 0, 1])] as Ori9
      let magnetHit = false

      if (snapToGeometry && !ctrlHeldRef.current && geometryFeatures.length > 0) {
        const probe = {
          ...pendingPlacement,
          id: 'pending',
          sourceFile: '(pending)',
          position,
          orientation,
        } as EditableSnap
        const target = findSnapTarget(probe, position, orientation, geometryFeatures)
        if (target) {
          const anchored = applySnapAnchor(probe, target)
          position = anchored.position
          orientation = anchored.orientation
          magnetHit = true
          setSnapTargetFeatureId(target.id)
        } else {
          setSnapTargetFeatureId(null)
        }
      } else {
        setSnapTargetFeatureId(null)
      }

      if (gridLock && !magnetHit) {
        position = quantizePosition(position, GRID_STEP_LDU)
      }

      return { position, orientation }
    }

    const onPointerMove = (e: PointerEvent) => {
      // Keep ghost tracking even while right-dragging to pan.
      const pose = resolvePose(e.clientX, e.clientY)
      if (pose) updatePendingPose(pose.position, pose.orientation)
    }

    const onPointerDown = (e: PointerEvent) => {
      // Only left-click commits; middle/right reach OrbitControls (pan / rotate).
      if (e.button !== 0) return
      const pose = resolvePose(e.clientX, e.clientY)
      if (pose) updatePendingPose(pose.position, pose.orientation)
      e.preventDefault()
      e.stopPropagation()
      confirmPlaceSnap()
    }

    // Capture left-click so selection/orbit don't also handle it.
    gl.domElement.addEventListener('pointermove', onPointerMove)
    gl.domElement.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      gl.domElement.style.cursor = ''
      gl.domElement.removeEventListener('pointermove', onPointerMove)
      gl.domElement.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [
    pendingPlacement,
    camera,
    controls,
    gl,
    geometryFeatures,
    snapToGeometry,
    gridLock,
    updatePendingPose,
    confirmPlaceSnap,
    setSnapTargetFeatureId,
    plane,
    raycaster,
    ndc,
    hit,
  ])

  if (!pendingPlacement || !pendingPose) return null

  const ghost: EditableSnap = {
    ...pendingPlacement,
    id: 'pending-ghost',
    sourceFile: '(pending)',
    position: pendingPose.position,
    orientation: pendingPose.orientation,
  }

  return <SnapOverlay snap={ghost} selected onSelect={() => undefined} showLabel={false} />
}
