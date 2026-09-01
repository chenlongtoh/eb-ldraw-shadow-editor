import { useEditorStore, snapGender } from '../store/editor-store'

export function SnapList() {
  const snaps = useEditorStore((s) => s.snaps)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const selectSnap = useEditorStore((s) => s.selectSnap)
  const deleteSnap = useEditorStore((s) => s.deleteSnap)

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
            return (
              <li key={snap.id} className={active ? 'active' : undefined}>
                <button type="button" className="snap-list-item" onClick={() => selectSnap(snap.id)}>
                  <span className="snap-index">#{index + 1}</span>
                  <span className="snap-type">{snap.metaType.replace('SNAP_', '')}</span>
                  <span className={`gender gender-${gender}`}>{gender}</span>
                  <span className="snap-pos">
                    {snap.position.map((n) => n.toFixed(1)).join(', ')}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  title="Delete snap"
                  onClick={() => deleteSnap(snap.id)}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
