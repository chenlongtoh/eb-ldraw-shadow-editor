import { SNAP_TEMPLATES, instantiateTemplate } from '../data/snap-templates'
import { useEditorStore } from '../store/editor-store'

export function SnapTemplatePicker() {
  const addSnap = useEditorStore((s) => s.addSnap)
  const partFile = useEditorStore((s) => s.partFile)

  return (
    <section className="panel-section">
      <h2>Add snap</h2>
      <div className="template-grid">
        {SNAP_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="template-card"
            disabled={!partFile}
            title={t.description}
            onClick={() => addSnap(instantiateTemplate(t))}
          >
            <strong>{t.label}</strong>
            <span>{t.description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
