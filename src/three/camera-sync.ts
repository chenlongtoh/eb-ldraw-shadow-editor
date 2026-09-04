import * as THREE from 'three'

/** Shared camera state between the main viewport and the view-cube overlay. */
export const cameraSync = {
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  target: new THREE.Vector3(),
  /** When set, the main viewport animates the camera toward this direction (from target). */
  tweenDirection: null as THREE.Vector3 | null,
}

export function requestCameraTween(direction: THREE.Vector3): void {
  cameraSync.tweenDirection = direction.clone().normalize()
}
