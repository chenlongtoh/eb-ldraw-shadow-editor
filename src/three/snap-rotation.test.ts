import { describe, expect, it } from 'vitest'
import { rotationSnapDegForScreenDistance } from './snap-rotation'

describe('rotationSnapDegForScreenDistance', () => {
  it('uses coarse 45° near the pivot', () => {
    expect(rotationSnapDegForScreenDistance(0)).toBe(45)
    expect(rotationSnapDegForScreenDistance(0.069)).toBe(45)
  })

  it('steps down to 5°, 1°, then 0.1° as distance grows', () => {
    expect(rotationSnapDegForScreenDistance(0.07)).toBe(5)
    expect(rotationSnapDegForScreenDistance(0.13)).toBe(5)
    expect(rotationSnapDegForScreenDistance(0.14)).toBe(1)
    expect(rotationSnapDegForScreenDistance(0.24)).toBe(1)
    expect(rotationSnapDegForScreenDistance(0.25)).toBe(0.1)
    expect(rotationSnapDegForScreenDistance(0.5)).toBe(0.1)
  })

  it('falls back to coarse for invalid distances', () => {
    expect(rotationSnapDegForScreenDistance(Number.NaN)).toBe(45)
    expect(rotationSnapDegForScreenDistance(-1)).toBe(45)
  })
})
