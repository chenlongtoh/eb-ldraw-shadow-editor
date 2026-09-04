import { useEditorStore } from '../store/editor-store'
import { featureKindLabel } from '@eb/ldraw-parser'

export function SnapTargetHud({ gizmoMode }: { gizmoMode: 'translate' | 'rotate' }) {
  const snapTargetFeatureId = useEditorStore((s) => s.snapTargetFeatureId)
  const geometryFeatures = useEditorStore((s) => s.geometryFeatures)
  const snapToGeometry = useEditorStore((s) => s.snapToGeometry)

  if (gizmoMode !== 'translate' || !snapToGeometry || !snapTargetFeatureId) return null

  const feature = geometryFeatures.find((f) => f.id === snapTargetFeatureId)
  if (!feature) return null

  return (
    <div className="snap-target-hud" aria-live="polite">
      Snapping to {featureKindLabel(feature.featureKind)}
    </div>
  )
}
