import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas, useLoader, useThree } from '@react-three/fiber'
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
import { useEditorStore, snapGender } from '../store/editor-store'
import { partGeometryUrl } from '../services/connectivity-api'
import { RotateAngleHud } from '../components/RotateAngleHud'
import { SnapOverlay } from './SnapOverlay'
import { SnapGizmo, type RotateDragInfo } from './SnapGizmo'

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
  const { camera, controls } = useThree()
  useEffect(() => {
    if (!object) return
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 40)
    const cam = camera as THREE.PerspectiveCamera
    cam.position.set(center.x + maxDim * 1.2, center.y + maxDim * 0.9, center.z + maxDim * 1.2)
    cam.near = 0.1
    cam.far = maxDim * 40
    cam.updateProjectionMatrix()
    if (controls && 'target' in controls) {
      ;(controls as unknown as { target: THREE.Vector3 }).target.copy(center)
      ;(controls as unknown as { update: () => void }).update?.()
    }
  }, [object, camera, controls, partFile])
  return null
}

function LDrawPartMesh({ url, partFile }: { url: string; partFile: string }) {
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
    return () => {
      disposePlacedPartInstance(instance as never)
    }
  }, [instance])

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
  const snaps = useEditorStore((s) => s.snaps)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const showMale = useEditorStore((s) => s.showMale)
  const showFemale = useEditorStore((s) => s.showFemale)
  const showSourceLabels = useEditorStore((s) => s.showSourceLabels)
  const selectSnap = useEditorStore((s) => s.selectSnap)
  const updateSnapLive = useEditorStore((s) => s.updateSnapLive)
  const beginTransform = useEditorStore((s) => s.beginTransform)

  const url = partGeometryUrl(partFile)
  const selected = snaps.find((s) => s.id === selectedSnapId) ?? null
  const [root, setRoot] = useState<THREE.Group | null>(null)

  const visibleSnaps = snaps.filter((s) => {
    const g = snapGender(s)
    if (g === 'M' && !showMale) return false
    if (g === 'F' && !showFemale) return false
    return true
  })

  return (
    // LDraw Y-down → Three.js Y-up (same as Instruction Builder StepPreview)
    <group rotation={[Math.PI, 0, 0]} ref={setRoot}>
      <Suspense
        fallback={
          <Html center>
            <div className="canvas-loading">Loading geometry…</div>
          </Html>
        }
      >
        <LDrawPartMesh url={url} partFile={partFile} />
      </Suspense>

      {visibleSnaps.map((snap) => (
        <SnapOverlay
          key={snap.id}
          snap={snap}
          selected={snap.id === selectedSnapId}
          onSelect={selectSnap}
          showLabel={showSourceLabels}
        />
      ))}

      {selected && (
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

      <FitCamera object={root} partFile={partFile} />
    </group>
  )
}

export function PartViewer({ gizmoMode }: { gizmoMode: 'translate' | 'rotate' }) {
  const partFile = useEditorStore((s) => s.partFile)
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
    <div className="viewer-root">
      <Canvas
        className="part-canvas"
        camera={{ position: [120, 90, 120], fov: 45, near: 0.1, far: 10000 }}
        onPointerMissed={() => useEditorStore.getState().selectSnap(null)}
      >
        <color attach="background" args={['#0b1220']} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[80, 120, 60]} intensity={1.1} />
        <directionalLight position={[-40, -60, -80]} intensity={0.35} />
        <SnapScene
          partFile={partFile}
          gizmoMode={gizmoMode}
          onRotateDrag={setRotateDrag}
        />
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      </Canvas>
      <RotateAngleHud gizmoMode={gizmoMode} dragInfo={rotateDrag} />
    </div>
  )
}
