import { useMemo } from 'react'
import { useEditorStore } from '../store/editor-store'
import {
  orientationToDisplayEulerDeg,
  type RotationAxis,
} from '../three/snap-rotation'
import type { RotateDragInfo } from '../three/SnapGizmo'

export function RotateAngleHud({
  gizmoMode,
  dragInfo,
}: {
  gizmoMode: 'translate' | 'rotate'
  dragInfo: RotateDragInfo | null
}) {
  const snaps = useEditorStore((s) => s.snaps)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const snap = snaps.find((s) => s.id === selectedSnapId)

  const euler = useMemo(
    () =>
      snap
        ? orientationToDisplayEulerDeg(snap.position, snap.orientation)
        : null,
    [snap],
  )

  if (gizmoMode !== 'rotate' || !snap || !euler) return null

  const showDrag = dragInfo?.active
  const axisLabel = (axis: RotationAxis) => axis.toUpperCase()
  const snapLabel =
    dragInfo && Number.isFinite(dragInfo.snapDeg)
      ? dragInfo.snapDeg < 1
        ? `${dragInfo.snapDeg.toFixed(1)}°`
        : `${dragInfo.snapDeg}°`
      : null

  return (
    <div className="rotate-hud" aria-live="polite">
      <div className="rotate-hud-title">Rotation</div>
      <div className="rotate-hud-euler">
        <span>Rx {euler[0].toFixed(1)}°</span>
        <span>Ry {euler[1].toFixed(1)}°</span>
        <span>Rz {euler[2].toFixed(1)}°</span>
      </div>
      {showDrag && dragInfo && (
        <div className="rotate-hud-delta">
          Δ {dragInfo.deltaDeg.toFixed(1)}°
          <span>
            ({axisLabel(dragInfo.axis)} {dragInfo.axisDeltaDeg >= 0 ? '+' : ''}
            {dragInfo.axisDeltaDeg.toFixed(1)}°)
          </span>
          {snapLabel && <span className="rotate-hud-snap">snap {snapLabel}</span>}
        </div>
      )}
      <div className="rotate-hud-keys">
        Drag far = fine (0.1°) · near = 1° / 5° / 45° · ←→ Y · ↑↓ X · ⇧←→ Z
      </div>
    </div>
  )
}
