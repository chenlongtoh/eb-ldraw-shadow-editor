import * as THREE from 'three'

export interface OrthoFitResult {
  center: THREE.Vector3
  baseHalfHeight: number
  farDistance: number
}

/**
 * Compute orthographic framing for an object (isometric-style direction).
 */
export function computeOrthographicFit(object: THREE.Object3D, viewportAspect: number): OrthoFitResult | null {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return null

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 40)
  const aspect = Math.max(viewportAspect, 0.01)

  const halfHeight = maxDim * 0.75
  const halfWidth = halfHeight * aspect
  const halfProjected = Math.max(halfHeight, halfWidth / aspect)

  return {
    center,
    baseHalfHeight: halfProjected,
    farDistance: maxDim * 50,
  }
}

export function applyOrthographicFrustum(
  camera: THREE.OrthographicCamera,
  baseHalfHeight: number,
  viewportAspect: number,
  zoom: number,
  farDistance: number,
): void {
  const aspect = Math.max(viewportAspect, 0.01)
  const safeZoom = Math.max(zoom, 0.01)
  const half = baseHalfHeight / safeZoom

  camera.left = -half * aspect
  camera.right = half * aspect
  camera.top = half
  camera.bottom = -half
  camera.near = -farDistance
  camera.far = farDistance
  camera.updateProjectionMatrix()
}

export function applyOrthographicFit(
  camera: THREE.OrthographicCamera,
  fit: OrthoFitResult,
  viewportAspect: number,
  zoom: number,
): void {
  const maxDim = fit.farDistance / 50
  camera.position.set(
    fit.center.x + maxDim * 1.2,
    fit.center.y + maxDim * 0.9,
    fit.center.z + maxDim * 1.2,
  )
  camera.up.set(0, 1, 0)
  camera.lookAt(fit.center)
  applyOrthographicFrustum(camera, fit.baseHalfHeight, viewportAspect, zoom, fit.farDistance)
}
