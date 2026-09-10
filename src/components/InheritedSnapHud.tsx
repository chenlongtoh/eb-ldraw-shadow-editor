import { useEditorStore, canEditSnap } from '../store/editor-store'

/** Top-left canvas card when the selected snap is inherited / read-only. */
export function InheritedSnapHud() {
  const partFile = useEditorStore((s) => s.partFile)
  const snaps = useEditorStore((s) => s.snaps)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const definitionMode = useEditorStore((s) => s.definitionMode)
  const resetDefinition = useEditorStore((s) => s.resetDefinition)

  const snap = snaps.find((s) => s.id === selectedSnapId)
  if (!snap || !partFile) return null
  if (canEditSnap(snap, partFile, definitionMode)) return null

  return (
    <div className="inherited-snap-hud" role="status">
      <strong>Inherited — read-only</strong>
      <p>
        From <code>{snap.sourceFile}</code>. Reset definition to edit these snaps, or add new snaps
        on this part.
      </p>
      <button
        type="button"
        className="btn btn-ghost inherited-snap-hud-action"
        onClick={() => {
          const ok = window.confirm(
            'Reset this part’s shadow definition?\n\n' +
              'Inherited snaps become editable. On save, SNAP_INCL is replaced with SNAP_CLEAR and a full flattened snap list in this part’s file. Included files are left unchanged.',
          )
          if (ok) resetDefinition()
        }}
      >
        Reset definition…
      </button>
    </div>
  )
}
