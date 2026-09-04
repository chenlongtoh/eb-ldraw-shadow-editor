import { SNAP_TEMPLATES, instantiateTemplate } from '../data/snap-templates'
import { useEditorStore } from '../store/editor-store'

export function SnapTemplatePicker() {
  const beginPlaceSnap = useEditorStore((s) => s.beginPlaceSnap)
  const cancelPlaceSnap = useEditorStore((s) => s.cancelPlaceSnap)
  const pendingPlacement = useEditorStore((s) => s.pendingPlacement)
  const partFile = useEditorStore((s) => s.partFile)

  return (
    <section className="panel-section">
      <h2>Add snap</h2>
      {pendingPlacement && (
        <p className="muted place-hint">
          Click to place · middle-drag pan · right-drag rotate · <kbd>Esc</kbd> cancel
          <button type="button" className="btn btn-ghost" onClick={() => cancelPlaceSnap()}>
            Cancel
          </button>
        </p>
      )}
      <div className="template-grid">
        {SNAP_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`template-card${pendingPlacement ? ' template-card-dim' : ''}`}
            disabled={!partFile}
            title={t.description}
            onClick={() => beginPlaceSnap(instantiateTemplate(t))}
          >
            <strong>{t.label}</strong>
            <span>{t.description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
