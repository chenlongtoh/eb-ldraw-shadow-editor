import { useEditorStore, snapGender, canEditSnap } from '../store/editor-store'
import { isInheritedSnap } from '../services/snap-ownership'

export function SnapList() {
  const partFile = useEditorStore((s) => s.partFile)
  const snaps = useEditorStore((s) => s.snaps)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const selectSnap = useEditorStore((s) => s.selectSnap)
  const deleteSnap = useEditorStore((s) => s.deleteSnap)
  const definitionMode = useEditorStore((s) => s.definitionMode)

  return (
    <section className="panel-section">
      <h2>Snaps ({snaps.length})</h2>
      {snaps.length === 0 ? (
        <p className="muted">No snap areas — add one from a template.</p>
      ) : (
        <ul className="snap-list">
          {snaps.map((snap, index) => {
            const active = snap.id === selectedSnapId
            const gender = snapGender(snap)
            const editable = canEditSnap(snap, partFile, definitionMode)
            const inherited = partFile ? isInheritedSnap(snap.sourceFile, partFile) : false
            return (
              <li
                key={snap.id}
                className={[
                  active ? 'active' : '',
                  !editable ? 'snap-locked' : '',
                  active && !editable ? 'snap-locked-active' : '',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined}
              >
                <button type="button" className="snap-list-item" onClick={() => selectSnap(snap.id)}>
                  <span className="snap-index">#{index + 1}</span>
                  <span className="snap-type">{snap.metaType.replace('SNAP_', '')}</span>
                  <span className={`gender gender-${gender}`}>{gender}</span>
                  {inherited && definitionMode === 'inherit' && (
                    <span className="snap-badge" title={`From ${snap.sourceFile}`}>
                      incl
                    </span>
                  )}
                  <span className="snap-pos">
                    {snap.position.map((n) => n.toFixed(1)).join(', ')}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  title={editable ? 'Delete snap' : 'Inherited — reset definition to edit'}
                  disabled={!editable}
                  onClick={() => deleteSnap(snap.id)}
                >
                  {editable ? (
                    '×'
                  ) : (
                    <span className="snap-lock-icon" aria-hidden>
                      ▨
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
