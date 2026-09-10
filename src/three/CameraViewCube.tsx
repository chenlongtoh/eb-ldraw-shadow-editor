import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { ACCENT_BLUE, ACCENT_SOFT, ACCENT_VIVID, useUiTheme, type UiAccentPreference } from '../theme/ui-theme'
import { cameraSync, requestCameraTween } from './camera-sync'

const ACCENT_HEX: Record<UiAccentPreference, string> = {
  vivid: ACCENT_VIVID,
  soft: ACCENT_SOFT,
  blue: ACCENT_BLUE,
}

export const VIEW_CUBE_FACES = ['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back'] as const

const FACE_NORMALS: THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
]

const COLORS = {
  bg: '#1a1a1a',
  hover: '#404040',
  text: '#FFFFFF',
  stroke: '#27272a',
}

function makeFaceTexture(label: string, bg: string, text: string, stroke: string, font: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.CanvasTexture(canvas)

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = stroke
  ctx.lineWidth = 4
  ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)
  ctx.font = font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = text
  ctx.fillText(label.toUpperCase(), 64, 64)

  const texture = new THREE.CanvasTexture(canvas)
  texture.anisotropy = 4
  return texture
}

function FaceMaterial({
  index,
  faces,
  hover,
  active,
  font,
  activeColor,
  activeText,
}: {
  index: number
  faces: readonly string[]
  hover: boolean
  active: boolean
  font: string
  activeColor: string
  activeText: string
}) {
  const texture = useMemo(() => {
    const bg = active ? activeColor : hover ? COLORS.hover : COLORS.bg
    const text = active ? activeText : COLORS.text
    return makeFaceTexture(faces[index], bg, text, COLORS.stroke, font)
  }, [index, faces, hover, active, font, activeColor, activeText])

  return (
    <meshBasicMaterial
      attach={`material-${index}`}
      map={texture}
      color="white"
      toneMapped={false}
      transparent
      opacity={1}
    />
  )
}

function ViewCubeMesh({
  activeFace,
  faces,
  font,
  activeColor,
  activeText,
}: {
  activeFace: number
  faces: readonly string[]
  font: string
  activeColor: string
  activeText: string
}) {
  const [hover, setHover] = useState<number | null>(null)

  const handlePointerOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHover(null)
  }

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.faceIndex == null) return
    setHover(Math.floor(e.faceIndex / 2))
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    if (!e.face) return
    requestCameraTween(e.face.normal)
  }

  return (
    <mesh
      onPointerOut={handlePointerOut}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <FaceMaterial
          key={index}
          index={index}
          faces={faces}
          hover={hover === index}
          active={activeFace === index}
          font={font}
          activeColor={activeColor}
          activeText={activeText}
        />
      ))}
      <boxGeometry />
    </mesh>
  )
}

function ViewCubeScene({ activeColor, activeText }: { activeColor: string; activeText: string }) {
  const groupRef = useRef<THREE.Group>(null)
  const invQuat = useMemo(() => new THREE.Quaternion(), [])
  const viewFrom = useMemo(() => new THREE.Vector3(), [])
  const [activeFace, setActiveFace] = useState(0)
  const [viewLabel, setViewLabel] = useState<string>(VIEW_CUBE_FACES[0])
  const faces = VIEW_CUBE_FACES

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    invQuat.copy(cameraSync.quaternion).invert()
    group.quaternion.copy(invQuat)

    viewFrom.copy(cameraSync.position).sub(cameraSync.target)
    if (viewFrom.lengthSq() > 1e-12) viewFrom.normalize()

    let best = 0
    let bestDot = -Infinity
    for (let i = 0; i < FACE_NORMALS.length; i += 1) {
      const dot = viewFrom.dot(FACE_NORMALS[i])
      if (dot > bestDot) {
        bestDot = dot
        best = i
      }
    }

    setActiveFace((prev) => (prev === best ? prev : best))
    const nextLabel = faces[best]
    setViewLabel((prev) => (prev === nextLabel ? prev : nextLabel))
  })

  return (
    <>
      <ambientLight intensity={1.2} />
      <group ref={groupRef} scale={1.05}>
        <ViewCubeMesh
          activeFace={activeFace}
          faces={faces}
          font="600 18px Figtree, sans-serif"
          activeColor={activeColor}
          activeText={activeText}
        />
      </group>
      <ViewCubeLabel label={viewLabel} />
    </>
  )
}

function ViewCubeLabel({ label }: { label: string }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.font = '600 26px Figtree, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(label, 128, 32)
    }
    return new THREE.CanvasTexture(canvas)
  }, [label])

  return (
    <mesh position={[0, -1.55, 0]}>
      <planeGeometry args={[2.4, 0.42]} />
      <meshBasicMaterial map={texture} transparent toneMapped={false} depthTest={false} />
    </mesh>
  )
}

/** Separate overlay canvas — does not touch the main perspective camera. */
export function CameraViewCube() {
  const { accent } = useUiTheme()
  const activeColor = ACCENT_HEX[accent]
  const activeText = accent === 'blue' ? '#FFFFFF' : '#000000'

  return (
    <div className="view-cube-overlay" aria-label="Camera view cube">
      <Canvas
        orthographic
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, 8], zoom: 52, near: 0.1, far: 100 }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
        }}
      >
        <ViewCubeScene activeColor={activeColor} activeText={activeText} />
      </Canvas>
    </div>
  )
}
