/**
 * Magnetic snap-to-geometry matching while dragging snap areas.
 */
import type { GeometryFeature } from '@eb/ldraw-parser'
import { featureKindLabel, isCompatibleSnap } from '@eb/ldraw-parser'
import type { EditableSnap } from '../store/editor-store'
import {
  geometryCenterLocalY,
  geometryCenterPartLocal,
  placementFromGeometryCenter,
} from './snap-geometry'
import type { Ori9, Vec3 } from './snap-rotation'

export const DEFAULT_SNAP_RADIUS_LDU = 15
/** Default translate increment when grid lock is enabled. */
export const GRID_STEP_LDU = 1

export function quantizePosition(position: Vec3, step: number = GRID_STEP_LDU): Vec3 {
  if (step <= 0) return position
  return [
    Math.round(position[0] / step) * step,
    Math.round(position[1] / step) * step,
    Math.round(position[2] / step) * step,
  ]
}

function dist3(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function featureGeometryCenter(feature: GeometryFeature): Vec3 {
  return geometryCenterPartLocal(feature.snap)
}

export function findSnapTarget(
  dragSnap: EditableSnap,
  dragPosition: Vec3,
  dragOrientation: Ori9,
  features: GeometryFeature[],
  options: { maxDistance: number; excludeSnapId?: string } = { maxDistance: DEFAULT_SNAP_RADIUS_LDU },
): GeometryFeature | null {
  const probeSnap = { ...dragSnap, position: dragPosition, orientation: dragOrientation }
  const dragCenter = geometryCenterPartLocal(probeSnap)

  let best: GeometryFeature | null = null
  let bestDist = options.maxDistance

  for (const feature of features) {
    if (!isCompatibleSnap(dragSnap, feature.snap)) continue
    const fc = featureGeometryCenter(feature)
    const d = dist3(dragCenter, fc)
    if (d <= bestDist) {
      bestDist = d
      best = feature
    }
  }
  return best
}

export function applySnapAnchor(
  dragSnap: EditableSnap,
  feature: GeometryFeature,
): { position: Vec3; orientation: Ori9 } {
  const orientation = [...feature.orientation] as Ori9
  const featureCenter = featureGeometryCenter(feature)
  const centerLocalY = geometryCenterLocalY(dragSnap)
  const position = placementFromGeometryCenter(featureCenter, orientation, centerLocalY)
  return { position, orientation }
}

export function snapTargetLabel(feature: GeometryFeature): string {
  return `Snapping to ${featureKindLabel(feature.featureKind)}`
}
