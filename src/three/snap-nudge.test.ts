import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyKeyboardNudge,
  applyTranslationStep,
  viewTranslationDeltaLDraw,
  wasdFromCode,
} from './snap-nudge'

function cameraLookingFrom(x: number, y: number, z: number): THREE.Quaternion {
  const cam = new THREE.PerspectiveCamera()
  cam.position.set(x, y, z)
  cam.up.set(0, 1, 0)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  return cam.quaternion.clone()
}

function axisCount(delta: [number, number, number]): number {
  return (delta[0] !== 0 ? 1 : 0) + (delta[1] !== 0 ? 1 : 0) + (delta[2] !== 0 ? 1 : 0)
}

describe('WASD camera-relative translation', () => {
  it('maps physical WASD key codes', () => {
    expect(wasdFromCode('KeyW')).toBe('w')
    expect(wasdFromCode('KeyA')).toBe('a')
    expect(wasdFromCode('KeyS')).toBe('s')
    expect(wasdFromCode('KeyD')).toBe('d')
    expect(wasdFromCode('KeyM')).toBeNull()
  })

  it('moves D along +X for an identity camera; W/S follow screen-up as LDraw −Y', () => {
    const q = new THREE.Quaternion()
    expect(viewTranslationDeltaLDraw(q, 'd', 1)).toEqual([1, 0, 0])
    expect(viewTranslationDeltaLDraw(q, 'a', 1)).toEqual([-1, 0, 0])
    expect(viewTranslationDeltaLDraw(q, 'w', 1)).toEqual([0, -1, 0])
    expect(viewTranslationDeltaLDraw(q, 's', 1)).toEqual([0, 1, 0])
  })

  it('snaps W/S to LDraw −Y/+Y whenever the view is closer to Front / Left / Right / Back than Top / Bottom', () => {
    const sideish = [
      cameraLookingFrom(0, 0, 100),
      cameraLookingFrom(-100, 0, 0),
      cameraLookingFrom(100, 0, 0),
      cameraLookingFrom(0, 0, -100),
      cameraLookingFrom(0, 40, 100),
      cameraLookingFrom(80, 30, 80),
    ]
    for (const q of sideish) {
      expect(viewTranslationDeltaLDraw(q, 'w', 1)).toEqual([0, -1, 0])
      expect(viewTranslationDeltaLDraw(q, 's', 1)).toEqual([0, 1, 0])
      expect(axisCount(viewTranslationDeltaLDraw(q, 'a', 1))).toBe(1)
      expect(axisCount(viewTranslationDeltaLDraw(q, 'd', 1))).toBe(1)
    }
  })

  it('snaps isometric WASD onto a single axis with no diagonal', () => {
    const q = cameraLookingFrom(120, 90, 120)
    for (const key of ['w', 'a', 's', 'd'] as const) {
      const delta = viewTranslationDeltaLDraw(q, key, 1)
      expect(axisCount(delta)).toBe(1)
      expect(delta.some((n) => Math.abs(n) === 1)).toBe(true)
    }
  })

  it('snaps W/S onto X or Z when the view is closer to Top / Bottom', () => {
    for (const q of [cameraLookingFrom(0, 100, 0), cameraLookingFrom(0, 100, 30), cameraLookingFrom(0, -100, 0)]) {
      const w = viewTranslationDeltaLDraw(q, 'w', 1)
      expect(axisCount(w)).toBe(1)
      expect(w[1]).toBe(0)
    }
  })

  it('quantizes the result onto the stepped grid', () => {
    expect(applyTranslationStep([0, 0, 0], [0.7, 0.1, 0.7], 1)).toEqual([1, 0, 1])
    expect(applyTranslationStep([0, 0, 0], [0.07, 0, 0], 0.1)).toEqual([0.1, 0, 0])
  })
})

describe('applyKeyboardNudge', () => {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const
  const snap = {
    metaType: 'SNAP_CYL' as const,
    position: [0, 0, 0] as [number, number, number],
    orientation: [...identity] as [number, number, number, number, number, number, number, number, number],
    secs: [{ shape: 'R' as const, values: [6, 4] }],
    center: false,
  }

  it('translates D along +X for an identity camera', () => {
    const next = applyKeyboardNudge(
      { key: 'd', code: 'KeyD', shiftKey: false },
      snap,
      new THREE.Quaternion(),
      1,
    )
    expect(next?.position[0]).toBeCloseTo(1)
    expect(next?.orientation).toEqual([...identity])
  })

  it('rotates on ArrowRight and ignores unrelated keys', () => {
    const rotated = applyKeyboardNudge(
      { key: 'ArrowRight', code: 'ArrowRight', shiftKey: false },
      snap,
      new THREE.Quaternion(),
      1,
    )
    expect(rotated).not.toBeNull()
    expect(rotated?.orientation).not.toEqual([...identity])
    expect(applyKeyboardNudge({ key: 'm', code: 'KeyM', shiftKey: false }, snap, new THREE.Quaternion(), 1)).toBeNull()
  })
})
