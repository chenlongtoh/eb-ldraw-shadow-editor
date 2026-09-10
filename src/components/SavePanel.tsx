import { useEffect, useMemo, useState } from 'react'
import {
  buildSaveContent,
  loadPartConnectivity,
  saveConnectivityFile,
} from '../services/connectivity-api'
import { diffLines } from '../services/line-diff'
import { useEditorStore } from '../store/editor-store'
import { SaveDiffView } from './SaveDiffView'

export function SavePanel() {
  const partFile = useEditorStore((s) => s.partFile)
  const partName = useEditorStore((s) => s.partName)
  const setPartName = useEditorStore((s) => s.setPartName)
  const snaps = useEditorStore((s) => s.snaps)
  const dirty = useEditorStore((s) => s.dirty)
  const hadShadowFile = useEditorStore((s) => s.hadShadowFile)
  const isUnofficial = useEditorStore((s) => s.isUnofficial)
  const shadowHeader = useEditorStore((s) => s.shadowHeader)
  const shadowSourceText = useEditorStore((s) => s.shadowSourceText)
  const editorName = useEditorStore((s) => s.editorName)
  const setEditorName = useEditorStore((s) => s.setEditorName)
  const definitionMode = useEditorStore((s) => s.definitionMode)
  const resetDefinition = useEditorStore((s) => s.resetDefinition)
  const clearDefinitionReset = useEditorStore((s) => s.clearDefinitionReset)
  const ownIncludes = useEditorStore((s) => s.ownIncludes)
  const loadPart = useEditorStore((s) => s.loadPart)
  const markClean = useEditorStore((s) => s.markClean)
  const setError = useEditorStore((s) => s.setError)
  const undo = useEditorStore((s) => s.undo)
  const redo = useEditorStore((s) => s.redo)
  const past = useEditorStore((s) => s.past)
  const future = useEditorStore((s) => s.future)

  const isNewShadow = !hadShadowFile
  const flattened = definitionMode === 'flatten'
  const prefilledIncludes = !hadShadowFile && ownIncludes.length > 0

  const [editorDraft, setEditorDraft] = useState(editorName)
  const [nameDraft, setNameDraft] = useState('')
  const [authorDraft, setAuthorDraft] = useState('LDCad Shadow Library')
  const [historyDraft, setHistoryDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setMessage(null)
    setSaving(false)
  }, [partFile])

  useEffect(() => {
    if (!partFile) return
    setEditorDraft(editorName)
    setNameDraft(partName ?? '')
    setAuthorDraft(shadowHeader?.author?.trim() || 'LDCad Shadow Library')
    setHistoryDraft(
      isNewShadow
        ? isUnofficial
          ? `Initial info for ${partFile} {unofficial}`
          : `Initial info for ${partFile}`
        : `Edited connectivity for ${partFile}`,
    )
  }, [partFile, hadShadowFile, isUnofficial, partName, editorName, isNewShadow, shadowHeader])

  const resolvedEditor = editorDraft.trim() || 'John Doe'
  const resolvedAuthor = authorDraft.trim() || 'LDCad Shadow Library'
  const resolvedName = isNewShadow
    ? nameDraft.trim()
    : (shadowHeader?.partName?.trim() || partName?.trim() || partFile || '')
  const resolvedHistory = isNewShadow
    ? isUnofficial
      ? `Initial info for ${partFile ?? ''} {unofficial}`
      : `Initial info for ${partFile ?? ''}`
    : historyDraft.trim()

  const canConfirm =
    Boolean(partFile) &&
    Boolean(resolvedName) &&
    Boolean(resolvedHistory) &&
    Boolean(resolvedEditor) &&
    Boolean(resolvedAuthor)

  const proposed = useMemo(() => {
    if (!partFile || !resolvedName || !resolvedHistory) return ''
    return buildSaveContent({
      partFile,
      partName: resolvedName,
      snaps,
      shadowHeader,
      shadowSourceText,
      isNewShadow,
      historyNote: resolvedHistory,
      editorName: resolvedEditor,
      author: resolvedAuthor,
      mode: definitionMode,
      includes: ownIncludes,
      isUnofficial,
    })
  }, [
    partFile,
    resolvedName,
    snaps,
    shadowHeader,
    shadowSourceText,
    isNewShadow,
    resolvedHistory,
    resolvedEditor,
    resolvedAuthor,
    definitionMode,
    ownIncludes,
    isUnofficial,
  ])

  const diff = useMemo(
    () => diffLines(shadowSourceText ?? '', proposed),
    [shadowSourceText, proposed],
  )

  const confirmWrite = async () => {
    if (!partFile || !canConfirm || !proposed) return
    setSaving(true)
    setMessage(null)
    try {
      setEditorName(resolvedEditor)
      if (isNewShadow) setPartName(resolvedName)

      const saveResult = await saveConnectivityFile(partFile, proposed)
      const verified = await loadPartConnectivity(partFile)
      loadPart({
        ...verified,
        partName: verified.partName ?? resolvedName,
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

  if (!partFile) {
    return (
      <section className="panel-section save-panel">
        <h2>Save</h2>
        <p className="muted">Load a part to save a shadow file.</p>
      </section>
    )
  }

  return (
    <section className="panel-section save-panel">
      <h2>Save</h2>
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
          disabled={!dirty || !canConfirm || saving}
          onClick={() => void confirmWrite()}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="definition-mode">
        {flattened ? (
          <>
            <p className="muted">
              Definition reset: inherited snaps are editable. Save will write{' '}
              <code>SNAP_CLEAR</code> and a full flattened list.
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => clearDefinitionReset()}>
              Keep inheritance
            </button>
          </>
        ) : (
          <>
            <p className="muted">
              Inherited snaps are read-only. Save keeps <code>SNAP_INCL</code> and only writes own
              additions/edits.
            </p>
            {prefilledIncludes && (
              <p className="muted">
                New shadow: prefilled {ownIncludes.length}{' '}
                {ownIncludes.length === 1 ? 'include' : 'includes'} from primitives.
              </p>
            )}
            <button
              type="button"
              className="btn btn-ghost"
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
          </>
        )}
      </div>

      <header className="save-panel-header">
        <h3>Save shadow file</h3>
        <p className="muted">
          <code>{partFile}</code>
          {isNewShadow ? ' · New shadow' : ' · Update'}
          {isUnofficial ? ' · Unofficial' : ''}
          {definitionMode === 'flatten' ? ' · Reset / flatten' : ' · Keep inheritance'}
        </p>
      </header>

      <div className="save-panel-body">
        <div className="save-modal-fields">
          <label className="field">
            <span>Author</span>
            <input
              type="text"
              value={authorDraft}
              onChange={(e) => setAuthorDraft(e.target.value)}
              placeholder="LDCad Shadow Library"
            />
            <span className="field-hint">
              Written as <code>0 Author: …</code>
            </span>
          </label>

          <label className="field">
            <span>Editor name</span>
            <input
              type="text"
              value={editorDraft}
              onChange={(e) => setEditorDraft(e.target.value)}
              onBlur={() => {
                const t = editorDraft.trim() || 'John Doe'
                setEditorDraft(t)
                setEditorName(t)
              }}
              placeholder="John Doe"
            />
            <span className="field-hint">Used in HISTORY lines.</span>
          </label>

          {isNewShadow ? (
            <label className="field">
              <span>Part name</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="e.g. Brick 2 x 2"
              />
              <span className="field-hint">
                Written as <code>0 LDCad shadow info for &quot;…&quot;</code>
                {isUnofficial ? (
                  <>
                    {' '}
                    Unofficial parts append <code>{'{unofficial}'}</code>.
                  </>
                ) : null}
              </span>
            </label>
          ) : (
            <label className="field">
              <span>Part name</span>
              <input type="text" value={resolvedName} readOnly disabled />
              <span className="field-hint">
                Existing shadow title is kept
                {isUnofficial ? (
                  <>
                    ; <code>{'{unofficial}'}</code> is added to the title and first HISTORY line if
                    missing
                  </>
                ) : (
                  ' unchanged'
                )}
                .
              </span>
            </label>
          )}

          <label className="field">
            <span>History message</span>
            <input
              type="text"
              value={isNewShadow ? resolvedHistory : historyDraft}
              onChange={(e) => {
                if (!isNewShadow) setHistoryDraft(e.target.value)
              }}
              readOnly={isNewShadow}
              disabled={isNewShadow}
            />
            <span className="field-hint">
              {isNewShadow
                ? 'Default for new shadows.'
                : 'Appended as a new !HISTORY line; existing history is preserved.'}
            </span>
          </label>
        </div>

        <SaveDiffView diff={diff} />
      </div>

      {message && <p className="save-message">{message}</p>}

      <div className="save-panel-footer">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || !canConfirm || saving}
          onClick={() => void confirmWrite()}
        >
          {saving ? 'Saving…' : 'Confirm write'}
        </button>
      </div>
    </section>
  )
}
