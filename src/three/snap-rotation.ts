/**
 * Snap orientation helpers in Three.js display space (after π X-flip).
 * Rotations pivot around the snap geometry center (not the placement origin).
 */
import * as THREE from 'three'
import type { LDrawSnapRecord } from '@eb/ldraw-models'
import {
  displayCenterMatrixToLDrawPosOri,
  geometryCenterLocalY,
  snapDisplayMatrix,
  snapDisplayMatrixAtGeometryCenter,
} from './snap-geometry'

export type RotationAxis = 'x' | 'y' | 'z'

export type Ori9 = LDrawSnapRecord['orientation']
export type Vec3 = [number, number, number]

type SnapPose = Pick<
  LDrawSnapRecord,
  'position' | 'orientation' | 'metaType' | 'center' | 'secs' | 'length' | 'seq' | 'bounding' | 'radius'
>

function roundDeg(n: number): number {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? 0 : r
}

function axisVector(axis: RotationAxis): THREE.Vector3 {
  switch (axis) {
    case 'x':
      return new THREE.Vector3(1, 0, 0)
    case 'y':
      return new THREE.Vector3(0, 1, 0)
    case 'z':
      return new THREE.Vector3(0, 0, 1)
  }
}

/** Display-space Euler XYZ (degrees) for the snap orientation. */
export function orientationToDisplayEulerDeg(
  position: Vec3,
  orientation: Ori9,
): [number, number, number] {
  const m = snapDisplayMatrix({ position, orientation })
  const euler = new THREE.Euler().setFromRotationMatrix(m, 'XYZ')
  return [
    roundDeg(THREE.MathUtils.radToDeg(euler.x)),
    roundDeg(THREE.MathUtils.radToDeg(euler.y)),
    roundDeg(THREE.MathUtils.radToDeg(euler.z)),
  ]
}

/** Replace display-space Euler, pivoting around the geometry center. */
export function setDisplayEulerDeg(
  snap: SnapPose,
  eulerDeg: [number, number, number],
): { position: Vec3; orientation: Ori9 } {
  const centerLocalY = geometryCenterLocalY(snap)
  const display = snapDisplayMatrixAtGeometryCenter(snap)
  const pos = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  display.decompose(pos, quat, scl)
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(eulerDeg[0]),
    THREE.MathUtils.degToRad(eulerDeg[1]),
    THREE.MathUtils.degToRad(eulerDeg[2]),
    'XYZ',
  )
  // Keep geometry center fixed; only orientation changes.
  const next = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(euler), scl)
  return displayCenterMatrixToLDrawPosOri(next, centerLocalY)
}

/** Rotate snap in world display space around X/Y/Z, pivoting on geometry center. */
export function rotateSnapAboutDisplayAxis(
  snap: SnapPose,
  axis: RotationAxis,
  degrees: number,
): { position: Vec3; orientation: Ori9 } {
  const centerLocalY = geometryCenterLocalY(snap)
  const display = snapDisplayMatrixAtGeometryCenter(snap)
  const center = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const scl = new THREE.Vector3()
  display.decompose(center, quat, scl)

  const R = new THREE.Quaternion().setFromAxisAngle(
    axisVector(axis),
    THREE.MathUtils.degToRad(degrees),
  )
  const nextQuat = R.multiply(quat)
  // TransformControls-style: position (geometry center) stays put.
  const next = new THREE.Matrix4().compose(center, nextQuat, scl)
  return displayCenterMatrixToLDrawPosOri(next, centerLocalY)
}

/** Smallest angle (degrees) between two display orientations. */
export function displayOrientationDeltaDeg(
  position: Vec3,
  fromOri: Ori9,
  toOri: Ori9,
): number {
  const a = new THREE.Quaternion()
  const b = new THREE.Quaternion()
  snapDisplayMatrix({ position, orientation: fromOri }).decompose(
    new THREE.Vector3(),
    a,
    new THREE.Vector3(),
  )
  snapDisplayMatrix({ position, orientation: toOri }).decompose(
    new THREE.Vector3(),
    b,
    new THREE.Vector3(),
  )
  return roundDeg(THREE.MathUtils.radToDeg(a.angleTo(b)))
}

/** Dominant display-axis delta (for HUD), comparing two Euler triples. */
export function dominantEulerDelta(
  fromDeg: [number, number, number],
  toDeg: [number, number, number],
): { axis: RotationAxis; degrees: number } {
  const dx = shortestDegDelta(fromDeg[0], toDeg[0])
  const dy = shortestDegDelta(fromDeg[1], toDeg[1])
  const dz = shortestDegDelta(fromDeg[2], toDeg[2])
  const entries: Array<{ axis: RotationAxis; degrees: number }> = [
    { axis: 'x', degrees: dx },
    { axis: 'y', degrees: dy },
    { axis: 'z', degrees: dz },
  ]
  entries.sort((a, b) => Math.abs(b.degrees) - Math.abs(a.degrees))
  return { axis: entries[0].axis, degrees: roundDeg(entries[0].degrees) }
}

function shortestDegDelta(from: number, to: number): number {
  let d = to - from
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}
