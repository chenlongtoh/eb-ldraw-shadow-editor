import { useEffect, useState } from 'react'
import { SNAP_TEMPLATES, instantiateTemplate, type SnapTemplate } from '../data/snap-templates'
import { gridSummary, isStudGridTemplate, studAreaGrid } from '../services/snap-grid'
import { useEditorStore } from '../store/editor-store'

export function SnapTemplatePicker() {
  const beginPlaceSnap = useEditorStore((s) => s.beginPlaceSnap)
  const cancelPlaceSnap = useEditorStore((s) => s.cancelPlaceSnap)
  const pendingPlacement = useEditorStore((s) => s.pendingPlacement)
  const partFile = useEditorStore((s) => s.partFile)
  const [gridStuds, setGridStuds] = useState(false)
  const [xStuds, setXStuds] = useState(2)
  const [zStuds, setZStuds] = useState(2)

  const gridValue = gridStuds ? studAreaGrid(xStuds, zStuds) : undefined

  useEffect(() => {
    if (!pendingPlacement || !isStudGridTemplate(pendingTemplateId(pendingPlacement))) return
    if ((pendingPlacement.grid ?? undefined) === gridValue) return
    useEditorStore.setState({
      pendingPlacement: { ...pendingPlacement, grid: gridValue },
    })
  }, [gridValue, pendingPlacement])

  const place = (template: SnapTemplate) => {
    const snap = instantiateTemplate(template)
    if (isStudGridTemplate(template.id)) snap.grid = gridValue
    beginPlaceSnap(snap)
  }

  return (
    <section className="panel-section">
      <h2>Add snap</h2>
      {pendingPlacement && (
        <p className="muted place-hint">
          Click to place · WASD move · arrows rotate · middle-drag pan · right-drag rotate ·{' '}
          <kbd>Esc</kbd> cancel
          <button type="button" className="btn btn-ghost" onClick={() => cancelPlaceSnap()}>
            Cancel
          </button>
        </p>
      )}
      <div className="stud-grid-option">
        <label>
          <input
            type="checkbox"
            checked={gridStuds}
            onChange={(e) => setGridStuds(e.target.checked)}
          />
          Grid studs / anti-studs
        </label>
        {gridStuds && (
          <>
            <div className="field-row">
              <label className="field">
                <span>X studs</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={xStuds}
                  onChange={(e) => setXStuds(Math.max(1, Math.round(Number(e.target.value)) || 1))}
                />
              </label>
              <label className="field">
                <span>Z studs</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={zStuds}
                  onChange={(e) => setZStuds(Math.max(1, Math.round(Number(e.target.value)) || 1))}
                />
              </label>
            </div>
            <p className="muted grid-hint">
              {gridSummary(gridValue) ?? '1×1'} centered, 20 LDU apart. Applies to Male stud and Anti-stud.
            </p>
          </>
        )}
      </div>
      <div className="template-grid">
        {SNAP_TEMPLATES.map((t) => {
          const summary = isStudGridTemplate(t.id) ? gridSummary(gridValue) : null
          const description = summary ? `${t.description} · ${summary}` : t.description
          return (
            <button
              key={t.id}
              type="button"
              className={`template-card${pendingPlacement ? ' template-card-dim' : ''}`}
              disabled={!partFile}
              title={description}
              onClick={(e) => {
                place(t)
                e.currentTarget.blur()
              }}
            >
              <strong>{t.label}</strong>
              <span>{description}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Match the three stud / anti-stud templates while a placement is in progress. */
function pendingTemplateId(snap: {
  metaType: string
  gender?: string
  caps?: string
  slide?: boolean
  secs?: Array<{ shape: string; values: number[] }>
}): string | null {
  if (snap.metaType !== 'SNAP_CYL' || snap.caps !== 'one' || snap.slide) return null
  const sec = snap.secs?.length === 1 ? snap.secs[0] : null
  if (!sec || sec.values[0] !== 6 || sec.values[1] !== 4) return null
  if (snap.gender === 'M' && sec.shape === 'R') return 'male-stud'
  if (snap.gender === 'F' && sec.shape === 'S') return 'anti-stud-square'
  if (snap.gender === 'F' && sec.shape === 'R') return 'anti-stud-round'
  return null
}
