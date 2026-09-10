import * as THREE from 'three'
import { LDRAW_DISPLAY_FLIP_INV } from './snap-geometry'
import { quantizePosition } from './snap-snap'
import {
  rotateSnapAboutDisplayAxis,
  type Ori9,
  type RotationAxis,
  type Vec3,
} from './snap-rotation'

export type WasdKey = 'w' | 'a' | 's' | 'd'

const IDENTITY_ORI: Ori9 = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export type NudgeableSnap = Parameters<typeof rotateSnapAboutDisplayAxis>[0]

function snapToClosestAxis(v: THREE.Vector3, step: number): Vec3 {
  const ax = Math.abs(v.x)
  const ay = Math.abs(v.y)
  const az = Math.abs(v.z)
  if (ax < 1e-12 && ay < 1e-12 && az < 1e-12) return [0, 0, 0]
  if (ax >= ay && ax >= az) return [Math.sign(v.x) * step, 0, 0]
  if (ay >= az) return [0, Math.sign(v.y) * step, 0]
  return [0, 0, Math.sign(v.z) * step]
}

/**
 * WASD in the camera view plane (A/D = right, W/S = up), snapped to one LDraw
 * axis. Display +Y is LDraw −Y, so screen-up becomes −Y whenever Y dominates.
 */
export function viewTranslationDeltaLDraw(
  cameraQuaternion: THREE.Quaternion,
  key: WasdKey,
  step: number,
): Vec3 {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion)
  const display = new THREE.Vector3()
  if (key === 'd') display.copy(right)
  else if (key === 'a') display.copy(right).negate()
  else if (key === 'w') display.copy(up)
  else display.copy(up).negate()

  if (display.lengthSq() < 1e-12) return [0, 0, 0]
  display.applyMatrix4(LDRAW_DISPLAY_FLIP_INV)
  return snapToClosestAxis(display, step)
}

export function applyTranslationStep(position: Vec3, delta: Vec3, step: number): Vec3 {
  return quantizePosition(
    [position[0] + delta[0], position[1] + delta[1], position[2] + delta[2]],
    step,
  )
}

export function wasdFromCode(code: string): WasdKey | null {
  if (code === 'KeyW') return 'w'
  if (code === 'KeyA') return 'a'
  if (code === 'KeyS') return 's'
  if (code === 'KeyD') return 'd'
  return null
}

export function wasdFromEvent(e: Pick<KeyboardEvent, 'code' | 'key'>): WasdKey | null {
  const fromCode = wasdFromCode(e.code)
  if (fromCode) return fromCode
  const key = e.key.toLowerCase()
  if (key === 'w' || key === 'a' || key === 's' || key === 'd') return key
  return null
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function arrowRotation(e: Pick<KeyboardEvent, 'key' | 'shiftKey'>): { axis: RotationAxis; degrees: number } | null {
  if (e.key === 'ArrowLeft') return { axis: e.shiftKey ? 'z' : 'y', degrees: -90 }
  if (e.key === 'ArrowRight') return { axis: e.shiftKey ? 'z' : 'y', degrees: 90 }
  if (e.key === 'ArrowUp') return { axis: 'x', degrees: -90 }
  if (e.key === 'ArrowDown') return { axis: 'x', degrees: 90 }
  return null
}

/** WASD translates in the view; arrows rotate 90° (Shift+←/→ = Z). */
export function applyKeyboardNudge(
  e: Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey'>,
  snap: NudgeableSnap,
  cameraQuaternion: THREE.Quaternion,
  step: number,
): { position: Vec3; orientation: Ori9 } | null {
  const wasd = wasdFromEvent(e)
  if (wasd) {
    const position = (snap.position ?? [0, 0, 0]) as Vec3
    const orientation = [...(snap.orientation ?? IDENTITY_ORI)] as Ori9
    const delta = viewTranslationDeltaLDraw(cameraQuaternion, wasd, step)
    return { position: applyTranslationStep(position, delta, step), orientation }
  }

  const rotation = arrowRotation(e)
  if (!rotation) return null
  return rotateSnapAboutDisplayAxis(snap, rotation.axis, rotation.degrees)
}
