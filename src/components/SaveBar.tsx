import { useState } from 'react'
import {
  buildSaveContent,
  loadPartConnectivity,
  saveConnectivityFile,
} from '../services/connectivity-api'
import { useEditorStore } from '../store/editor-store'

export function SaveBar() {
  const partFile = useEditorStore((s) => s.partFile)
  const partName = useEditorStore((s) => s.partName)
  const snaps = useEditorStore((s) => s.snaps)
  const dirty = useEditorStore((s) => s.dirty)
  const savePreview = useEditorStore((s) => s.savePreview)
  const setSavePreview = useEditorStore((s) => s.setSavePreview)
  const markClean = useEditorStore((s) => s.markClean)
  const loadPart = useEditorStore((s) => s.loadPart)
  const setError = useEditorStore((s) => s.setError)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!partFile) return null

  const preparePreview = () => {
    const content = buildSaveContent(partFile, partName ?? partFile, snaps)
    setSavePreview(content)
    setMessage(null)
  }

  const confirmSave = async () => {
    if (!savePreview) return
    setSaving(true)
    setMessage(null)
    try {
      const saveResult = await saveConnectivityFile(partFile, savePreview)
      const verified = await loadPartConnectivity(partFile)
      loadPart({
        ...verified,
        partName: partName ?? partFile,
      })
      markClean()
      setMessage(
        `Saved ${verified.snaps.length} snaps to ${saveResult.shadowPath ?? partFile}` +
          (saveResult.warning ? ` ${saveResult.warning}` : ''),
      )
    } catch (err) {
      setError(String(err))
      setMessage(String(err))
    } finally {
      setSaving(false)
    }
  }

  const lines = savePreview?.split('\n') ?? []
  const previewHead = lines.slice(0, 12).join('\n')
  const previewTail = lines.length > 16 ? lines.slice(-4).join('\n') : ''

  return (
    <section className="panel-section save-bar">
      <div className="row">
        <button type="button" className="btn btn-ghost" disabled={past.length === 0} onClick={undo}>
          Undo
        </button>
        <button type="button" className="btn btn-ghost" disabled={future.length === 0} onClick={redo}>
          Redo
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty && !savePreview}
          onClick={preparePreview}
        >
          Save…
        </button>
      </div>

      {savePreview && (
        <div className="save-preview">
          <p>
            Will write <code>{partFile}</code> to the configured shadow library ({lines.filter((l) => l.startsWith('0 !LDCAD')).length}{' '}
            meta lines, SNAP_CLEAR + flattened snaps).
          </p>
          <pre>{previewHead}{previewTail ? `\n…\n${previewTail}` : ''}</pre>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void confirmSave()}>
              {saving ? 'Saving…' : 'Confirm write'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setSavePreview(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <p className="save-message">{message}</p>}
    </section>
  )
}
