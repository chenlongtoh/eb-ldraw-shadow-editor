/**
 * Dimension helpers for snap visualization (mirrors snap-endpoint-transforms math).
 */
import type { LDrawSnapRecord } from '@eb/ldraw-models'
import * as THREE from 'three'

/** Same π rotation around X used by PartViewer (LDraw Y-down → Three Y-up). */
export const LDRAW_DISPLAY_FLIP = new THREE.Matrix4().makeRotationX(Math.PI)
export const LDRAW_DISPLAY_FLIP_INV = LDRAW_DISPLAY_FLIP.clone().invert()

export function cylinderLength(record: LDrawSnapRecord): number {
  if (record.metaType === 'SNAP_CLP') return record.length ?? 8
  if (record.metaType === 'SNAP_FGR') {
    const seq = record.seq ?? [8]
    return seq.reduce((a, b) => a + b, 0)
  }
  if (record.metaType !== 'SNAP_CYL') return 0
  if (record.secs && record.secs.length > 0) {
    const total = record.secs.reduce((sum, sec) => sum + (sec.values[1] ?? 0), 0)
    if (total > 0) return total
  }
  return record.length ?? 4
}

export function maxRadius(record: LDrawSnapRecord): number {
  if (record.metaType === 'SNAP_CLP' || record.metaType === 'SNAP_FGR' || record.metaType === 'SNAP_SPH') {
    return record.radius ?? 4
  }
  if (record.metaType === 'SNAP_CYL' && record.secs && record.secs.length > 0) {
    return Math.max(...record.secs.map((s) => s.values[0] ?? 0), 1)
  }
  if (record.metaType === 'SNAP_GEN' && record.bounding) {
    if (record.bounding.kind === 'sphere') return record.bounding.values[0] ?? 8
    if (record.bounding.kind === 'cylinder') return record.bounding.values[0] ?? 8
    if (record.bounding.kind === 'box') {
      return Math.max(...record.bounding.values.map((v) => v / 2), 4)
    }
  }
  return 4
}

/**
 * Snap-local Y of the visual geometry center relative to placement origin.
 * Non-centered volumes extend along −Y from 0 → −length, so the center is at −length/2.
 * Centered snaps already place the origin at the geometric midpoint.
 */
export function geometryCenterLocalY(
  record: Pick<LDrawSnapRecord, 'metaType' | 'center' | 'secs' | 'length' | 'seq' | 'bounding' | 'radius'>,
): number {
  if (record.center) return 0
  if (record.metaType === 'SNAP_GEN' || record.metaType === 'SNAP_SPH') return 0
  const len = cylinderLength(record as LDrawSnapRecord)
  if (len <= 0) return 0
  return -len / 2
}

/** Build THREE.Matrix4 from LDCad pos + ori (row-major 3×3; local −Y = pointing direction). */
export function snapLocalMatrix(record: Pick<LDrawSnapRecord, 'position' | 'orientation'>): THREE.Matrix4 {
  const o = record.orientation
  const p = record.position
  const m = new THREE.Matrix4()
  m.set(
    o[0], o[1], o[2], p[0],
    o[3], o[4], o[5], p[1],
    o[6], o[7], o[8], p[2],
    0, 0, 0, 1,
  )
  return m
}

/** Part-local LDraw position of the snap's geometry center. */
export function geometryCenterPartLocal(
  record: Pick<
    LDrawSnapRecord,
    'position' | 'orientation' | 'metaType' | 'center' | 'secs' | 'length' | 'seq' | 'bounding' | 'radius'
  >,
): [number, number, number] {
  const cy = geometryCenterLocalY(record)
  if (Math.abs(cy) < 1e-12) {
    return [record.position[0], record.position[1], record.position[2]]
  }
  const o = record.orientation
  const p = record.position
  // c = R * (0, cy, 0) + t  — column 1 of ori is local Y
  return [
    o[1] * cy + p[0],
    o[4] * cy + p[1],
    o[7] * cy + p[2],
  ]
}

/** Placement origin from geometry-center position + orientation. */
export function placementFromGeometryCenter(
  centerPartLocal: [number, number, number],
  orientation: LDrawSnapRecord['orientation'],
  centerLocalY: number,
): [number, number, number] {
  if (Math.abs(centerLocalY) < 1e-12) {
    return [centerPartLocal[0], centerPartLocal[1], centerPartLocal[2]]
  }
  // t = c - R * (0, cy, 0)
  return [
    centerPartLocal[0] - orientation[1] * centerLocalY,
    centerPartLocal[1] - orientation[4] * centerLocalY,
    centerPartLocal[2] - orientation[7] * centerLocalY,
  ]
}

/** LDraw local matrix → Three.js display matrix (after π X-flip). */
export function snapDisplayMatrix(record: Pick<LDrawSnapRecord, 'position' | 'orientation'>): THREE.Matrix4 {
  return LDRAW_DISPLAY_FLIP.clone().multiply(snapLocalMatrix(record))
}

/**
 * Display matrix whose origin is the snap geometry center (for rotation pivot).
 * Linear part matches snap orientation; translation is the center in display space.
 */
export function snapDisplayMatrixAtGeometryCenter(
  record: Pick<
    LDrawSnapRecord,
    'position' | 'orientation' | 'metaType' | 'center' | 'secs' | 'length' | 'seq' | 'bounding' | 'radius'
  >,
): THREE.Matrix4 {
  const center = geometryCenterPartLocal(record)
  return snapDisplayMatrix({ position: center, orientation: record.orientation })
}

/** Three.js display matrix → LDraw local pos/ori. */
export function displayMatrixToLDrawPosOri(display: THREE.Matrix4): {
  position: [number, number, number]
  orientation: [number, number, number, number, number, number, number, number, number]
} {
  const local = LDRAW_DISPLAY_FLIP_INV.clone().multiply(display)
  return matrixToPosOri(local)
}

/**
 * Convert a display matrix anchored at the geometry center back to LDCad
 * placement origin + orientation.
 */
export function displayCenterMatrixToLDrawPosOri(
  displayCenter: THREE.Matrix4,
  centerLocalY: number,
): {
  position: [number, number, number]
  orientation: [number, number, number, number, number, number, number, number, number]
} {
  const { position: centerPart, orientation } = displayMatrixToLDrawPosOri(displayCenter)
  return {
    position: placementFromGeometryCenter(centerPart, orientation, centerLocalY),
    orientation,
  }
}

/** Extract pos + ori from a THREE.Matrix4 (same convention as snapLocalMatrix). */
export function matrixToPosOri(m: THREE.Matrix4): {
  position: [number, number, number]
  orientation: [number, number, number, number, number, number, number, number, number]
} {
  const e = m.elements
  // Three.js Matrix4 is column-major
  return {
    position: [e[12], e[13], e[14]],
    orientation: [
      e[0], e[4], e[8],
      e[1], e[5], e[9],
      e[2], e[6], e[10],
    ],
  }
}

export function snapColor(
  record: LDrawSnapRecord,
  selected: boolean,
  options?: { locked?: boolean },
): string {
  const locked = options?.locked ?? false
  if (locked && selected) return '#94a3b8'
  if (selected && !locked) return '#B8FF00'

  let base: string
  switch (record.metaType) {
    case 'SNAP_CYL':
      base = (record.gender ?? 'M') === 'M' ? '#3b82f6' : '#f97316'
      break
    case 'SNAP_CLP':
      base = '#a855f7'
      break
    case 'SNAP_FGR':
      base = '#22c55e'
      break
    case 'SNAP_GEN':
    case 'SNAP_SPH':
      base = '#eab308'
      break
    default:
      base = '#94a3b8'
  }

  if (!locked) return base

  // Desaturated variants — keep hue family, signal “not editable”
  switch (record.metaType) {
    case 'SNAP_CYL':
      return (record.gender ?? 'M') === 'M' ? '#6b849e' : '#b8896a'
    case 'SNAP_CLP':
      return '#8b7aa3'
    case 'SNAP_FGR':
      return '#6a9478'
    case 'SNAP_GEN':
    case 'SNAP_SPH':
      return '#a89b6a'
    default:
      return '#64748b'
  }
}
