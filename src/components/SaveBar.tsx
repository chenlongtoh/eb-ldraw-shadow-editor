import { useEffect, useState } from 'react'
import {
  buildSaveContent,
  loadPartConnectivity,
  saveConnectivityFile,
} from '../services/connectivity-api'
import { useEditorStore } from '../store/editor-store'

export function SaveBar() {
  const partFile = useEditorStore((s) => s.partFile)
  const partName = useEditorStore((s) => s.partName)
  const setPartName = useEditorStore((s) => s.setPartName)
  const snaps = useEditorStore((s) => s.snaps)
  const dirty = useEditorStore((s) => s.dirty)
  const hadShadowFile = useEditorStore((s) => s.hadShadowFile)
  const shadowHeader = useEditorStore((s) => s.shadowHeader)
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
  const [nameDraft, setNameDraft] = useState('')
  const [awaitingName, setAwaitingName] = useState(false)

  const isNewShadow = !hadShadowFile
  const canEditName = isNewShadow

  useEffect(() => {
    setNameDraft(partName ?? '')
    setAwaitingName(false)
    setMessage(null)
  }, [partFile, partName])

  if (!partFile) return null

  const preparePreview = (explicitName?: string) => {
    const resolvedName = (explicitName ?? partName ?? '').trim()
    if (isNewShadow && !resolvedName) {
      setAwaitingName(true)
      setSavePreview(null)
      setMessage('Enter a display name for this new shadow file.')
      return
    }

    if (canEditName && resolvedName && resolvedName !== partName) {
      setPartName(resolvedName)
    }

    const content = buildSaveContent({
      partFile,
      partName: resolvedName || partFile,
      snaps,
      shadowHeader,
      isNewShadow,
    })
    setSavePreview(content)
    setAwaitingName(false)
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
        partName: verified.partName ?? partName ?? partFile,
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
  const previewHead = lines.slice(0, 14).join('\n')
  const previewTail = lines.length > 18 ? lines.slice(-4).join('\n') : ''
  const historyCount = lines.filter((l) => l.startsWith('0 !HISTORY')).length

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
          onClick={() => preparePreview()}
        >
          Save…
        </button>
      </div>

      {(awaitingName || (isNewShadow && !savePreview)) && (
        <div className="save-name-prompt">
          <label className="field">
            <span>Shadow display name</span>
            <input
              type="text"
              value={nameDraft}
              placeholder="e.g. Brick 2 x 2"
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  preparePreview(nameDraft)
                }
              }}
            />
          </label>
          <p className="muted">
            Required for new shadow files. Existing files keep their original name.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!nameDraft.trim()}
            onClick={() => preparePreview(nameDraft)}
          >
            Continue
          </button>
        </div>
      )}

      {!isNewShadow && partName && (
        <p className="muted save-name-locked">
          Name: <strong>{partName}</strong> (unchanged)
        </p>
      )}

      {savePreview && (
        <div className="save-preview">
          <p>
            Will write <code>{partFile}</code>
            {isNewShadow ? ' (new shadow)' : ' (update)'} — {historyCount} history line
            {historyCount === 1 ? '' : 's'},{' '}
            {lines.filter((l) => l.startsWith('0 !LDCAD')).length} meta lines.
          </p>
          <pre>
            {previewHead}
            {previewTail ? `\n…\n${previewTail}` : ''}
          </pre>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void confirmSave()}>
              {saving ? 'Saving…' : 'Confirm write'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setSavePreview(null)
                setAwaitingName(isNewShadow)
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && <p className="save-message">{message}</p>}
    </section>
  )
}
