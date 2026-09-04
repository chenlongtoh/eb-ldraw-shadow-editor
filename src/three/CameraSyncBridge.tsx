import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { cameraSync } from './camera-sync'

const turnRate = 2 * Math.PI
const dummy = new THREE.Object3D()
const q1 = new THREE.Quaternion()
const q2 = new THREE.Quaternion()
const targetPosition = new THREE.Vector3()
const defaultUp = new THREE.Vector3(0, 1, 0)

function isOrbitControls(controls: unknown): controls is { target: THREE.Vector3; update: (dt?: number) => void } {
  return !!controls && typeof controls === 'object' && 'target' in controls && 'update' in controls
}

/**
 * Keeps {@link cameraSync} updated from the main camera and runs view-cube tween requests.
 * Must live in the main scene Canvas (perspective camera + OrbitControls).
 */
export function CameraSyncBridge() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const invalidate = useThree((s) => s.invalidate)
  const animating = useRef(false)
  const radius = useRef(120)
  const savedUp = useRef(new THREE.Vector3())

  useEffect(() => {
    savedUp.current.copy(camera.up)
  }, [camera])

  useFrame((_, delta) => {
    if (isOrbitControls(controls)) {
      cameraSync.target.copy(controls.target)
    }
    cameraSync.position.copy(camera.position)
    cameraSync.quaternion.copy(camera.quaternion)

    const requested = cameraSync.tweenDirection
    if (requested && !animating.current) {
      animating.current = true
      cameraSync.tweenDirection = null
      radius.current = camera.position.distanceTo(cameraSync.target)
      q1.copy(camera.quaternion)
      targetPosition.copy(requested).multiplyScalar(radius.current).add(cameraSync.target)
      dummy.up.copy(defaultUp)
      dummy.position.copy(cameraSync.target)
      dummy.lookAt(targetPosition)
      q2.copy(dummy.quaternion)
      invalidate()
    }

    if (!animating.current) return

    if (q1.angleTo(q2) < 0.01) {
      animating.current = false
      camera.up.copy(savedUp.current)
      if (isOrbitControls(controls)) controls.update()
      invalidate()
      return
    }

    const step = delta * turnRate
    q1.rotateTowards(q2, step)
    camera.position.set(0, 0, 1).applyQuaternion(q1).multiplyScalar(radius.current).add(cameraSync.target)
    camera.up.set(0, 1, 0).applyQuaternion(q1).normalize()
    camera.quaternion.copy(q1)
    if (isOrbitControls(controls)) controls.update(delta)
    invalidate()
  })

  return null
}
