import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { LDrawConditionalLineMaterial } from 'three/examples/jsm/materials/LDrawConditionalLineMaterial.js'
import {
  LDrawLoaderWithColors,
  PartRegistry,
  buildPlacementMatrix,
  buildStyledPartPrototype,
  createPlacedPartInstance,
  disposePlacedPartInstance,
  removeNullChildren,
  type PartStyleOptions,
} from '@eb/ldraw-three-core'
import type { PartPlacement } from '@eb/ldraw-models'
import * as THREE from 'three'
import { useEditorStore, snapGender, canEditSnap } from '../store/editor-store'
import { partGeometryUrl } from '../services/connectivity-api'
import { RotateAngleHud } from '../components/RotateAngleHud'
import { SnapTargetHud } from '../components/SnapTargetHud'
import { InheritedSnapHud } from '../components/InheritedSnapHud'
import { SnapOverlay } from './SnapOverlay'
import { SnapGizmo, type RotateDragInfo } from './SnapGizmo'
import { CameraViewCube } from './CameraViewCube'
import { CameraSyncBridge } from './CameraSyncBridge'
import { PlaceSnapTool } from './PlaceSnapTool'
import {
  applyOrthographicFit,
  applyOrthographicFrustum,
  computeOrthographicFit,
  type OrthoFitResult,
} from './ortho-camera-fit'

const emptyRegistry = new PartRegistry()

class EditorLDrawLoader extends LDrawLoaderWithColors {
  constructor() {
    super(emptyRegistry)
  }
}

const IDENTITY_PLACEMENT: PartPlacement = {
  file: '',
  colour: 16,
  x: 0,
  y: 0,
  z: 0,
  a: 1,
  b: 0,
  c: 0,
  d: 0,
  e: 1,
  f: 0,
  g: 0,
  h: 0,
  i: 1,
}

function FitCamera({ object, partFile }: { object: THREE.Object3D | null; partFile: string }) {
  const { camera, controls, size, invalidate } = useThree()
  const fitRef = useRef<OrthoFitResult | null>(null)
  const lastBoxRef = useRef(new THREE.Box3().makeEmpty())
  const lastAspectRef = useRef(0)
  const lastPartRef = useRef('')

  useFrame(() => {
    if (!object) return
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return

    const aspect = size.width / Math.max(size.height, 1)
    const ortho = camera as THREE.OrthographicCamera
    const layoutChanged =
      !box.equals(lastBoxRef.current)
      || aspect !== lastAspectRef.current
      || lastPartRef.current !== partFile

    if (layoutChanged) {
      fitRef.current = computeOrthographicFit(object, aspect)
      if (!fitRef.current) return

      applyOrthographicFit(ortho, fitRef.current, aspect, ortho.zoom)
      lastBoxRef.current.copy(box)
      lastAspectRef.current = aspect
      lastPartRef.current = partFile

      if (controls && 'target' in controls) {
        ;(controls as unknown as { target: THREE.Vector3 }).target.copy(fitRef.current.center)
        ;(controls as unknown as { update: () => void }).update?.()
      }
      invalidate()
      return
    }

    if (!fitRef.current) return

    // R3F resets orthographic bounds from viewport pixels; reapply world-space frustum.
    applyOrthographicFrustum(ortho, fitRef.current.baseHalfHeight, aspect, ortho.zoom, fitRef.current.farDistance)
  })

  return null
}

function LDrawPartMesh({
  url,
  partFile,
  onInstance,
}: {
  url: string
  partFile: string
  onInstance?: (object: THREE.Object3D | null) => void
}) {
  const result = useLoader(EditorLDrawLoader as unknown as typeof THREE.Loader, url, (loader) => {
    ;(loader as unknown as { setConditionalLineMaterial: (m: unknown) => void }).setConditionalLineMaterial(
      LDrawConditionalLineMaterial,
    )
  })

  const instance = useMemo(() => {
    const prototype = result as unknown as THREE.Group
    removeNullChildren(prototype as never)
    const style: PartStyleOptions = {
      colour: 16,
      colorMap: null,
      edgeLineColor: '#1e293b',
      meshColorOverride: '#94a3b8',
    }
    const styled = buildStyledPartPrototype(prototype as never, style)
    const placement: PartPlacement = { ...IDENTITY_PLACEMENT, file: partFile }
    return createPlacedPartInstance(styled, placement, buildPlacementMatrix as never) as unknown as THREE.Group
  }, [result, partFile])

  useEffect(() => {
    onInstance?.(instance)
    return () => {
      onInstance?.(null)
      disposePlacedPartInstance(instance as never)
    }
  }, [instance, onInstance])

  return <primitive object={instance} />
}

function SnapScene({
  partFile,
  gizmoMode,
  onRotateDrag,
}: {
  partFile: string
  gizmoMode: 'translate' | 'rotate'
  onRotateDrag: (info: RotateDragInfo) => void
}) {
  const geometryUrl = useEditorStore((s) => s.geometryUrl)
  const snaps = useEditorStore((s) => s.snaps)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const showMale = useEditorStore((s) => s.showMale)
  const showFemale = useEditorStore((s) => s.showFemale)
  const showSourceLabels = useEditorStore((s) => s.showSourceLabels)
  const selectSnap = useEditorStore((s) => s.selectSnap)
  const updateSnapLive = useEditorStore((s) => s.updateSnapLive)
  const beginTransform = useEditorStore((s) => s.beginTransform)
  const pendingPlacement = useEditorStore((s) => s.pendingPlacement)
  const definitionMode = useEditorStore((s) => s.definitionMode)

  const url = partGeometryUrl(partFile, geometryUrl)
  const selected = snaps.find((s) => s.id === selectedSnapId) ?? null
  const selectedEditable = selected
    ? canEditSnap(selected, partFile, definitionMode)
    : false
  // Fit camera to part geometry only — never include snap overlays/gizmos,
  // otherwise dragging a snap outside the brick reframes/zooms the view.
  const [partGeometry, setPartGeometry] = useState<THREE.Object3D | null>(null)

  const visibleSnaps = snaps.filter((s) => {
    const g = snapGender(s)
    if (g === 'M' && !showMale) return false
    if (g === 'F' && !showFemale) return false
    return true
  })

  return (
    // LDraw Y-down → Three.js Y-up (same as Instruction Builder StepPreview)
    <group rotation={[Math.PI, 0, 0]}>
      <Suspense
        fallback={
          <Html center>
            <div className="canvas-loading">Loading geometry…</div>
          </Html>
        }
      >
        <LDrawPartMesh url={url} partFile={partFile} onInstance={setPartGeometry} />
      </Suspense>

      {visibleSnaps.map((snap) => (
        <SnapOverlay
          key={snap.id}
          snap={snap}
          selected={snap.id === selectedSnapId}
          locked={!canEditSnap(snap, partFile, definitionMode)}
          onSelect={selectSnap}
          showLabel={showSourceLabels}
        />
      ))}

      {selected && selectedEditable && !pendingPlacement && (
        <SnapGizmo
          snap={selected}
          mode={gizmoMode}
          enabled
          onDragStart={() => beginTransform()}
          onLive={(position, orientation) => {
            updateSnapLive(selected.id, { position, orientation })
          }}
          onRotateDrag={onRotateDrag}
        />
      )}

      <PlaceSnapTool />

      <FitCamera object={partGeometry} partFile={partFile} />
    </group>
  )
}

export function PartViewer({ gizmoMode }: { gizmoMode: 'translate' | 'rotate' }) {
  const partFile = useEditorStore((s) => s.partFile)
  const pendingPlacement = useEditorStore((s) => s.pendingPlacement)
  const [rotateDrag, setRotateDrag] = useState<RotateDragInfo | null>(null)

  useEffect(() => {
    if (gizmoMode !== 'rotate') setRotateDrag(null)
  }, [gizmoMode])

  if (!partFile) {
    return (
      <div className="viewer-empty">
        <p>Load a part to visualize snap areas on its geometry.</p>
      </div>
    )
  }

  return (
    <div className={`viewer-root${pendingPlacement ? ' viewer-placing' : ''}`}>
      <Canvas
        className="part-canvas"
        orthographic
        camera={{ position: [120, 90, 120], zoom: 1, near: -10000, far: 10000 }}
        onPointerMissed={() => {
          if (useEditorStore.getState().pendingPlacement) return
          useEditorStore.getState().selectSnap(null)
        }}
      >
        <color attach="background" args={['#1a1a1a']} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[80, 120, 60]} intensity={1.1} />
        <directionalLight position={[-40, -60, -80]} intensity={0.35} />
        <SnapScene
          partFile={partFile}
          gizmoMode={gizmoMode}
          onRotateDrag={setRotateDrag}
        />
        <OrbitControls
          makeDefault
          enableDamping={false}
          minZoom={0.25}
          maxZoom={8}
          // LMB selects / places only — never moves the camera.
          // MMB pan, wheel zoom, RMB rotate.
          enableRotate
          mouseButtons={{
            LEFT: undefined as unknown as THREE.MOUSE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.ROTATE,
          }}
        />
        <CanvasPointerBindings />
        <CameraSyncBridge />
      </Canvas>
      <CameraViewCube />
      <InheritedSnapHud />
      <RotateAngleHud gizmoMode={gizmoMode} dragInfo={rotateDrag} />
      <SnapTargetHud gizmoMode={gizmoMode} />
      {pendingPlacement && (
        <div className="place-snap-hud" aria-live="polite">
          Left-click to place · Middle-drag pan · Right-drag rotate · Esc to cancel
        </div>
      )}
    </div>
  )
}

/** Suppress browser context menu so RMB can rotate the view. */
function CanvasPointerBindings() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const onContextMenu = (e: Event) => e.preventDefault()
    el.addEventListener('contextmenu', onContextMenu)
    return () => el.removeEventListener('contextmenu', onContextMenu)
  }, [gl])
  return null
}
