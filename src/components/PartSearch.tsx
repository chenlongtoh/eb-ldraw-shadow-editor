import { useCallback, useState } from 'react'
import { loadPartConnectivity, searchParts } from '../services/connectivity-api'
import { useEditorStore, type PartNavMode } from '../store/editor-store'

export function PartSearch() {
  const [query, setQuery] = useState('3003')
  const [results, setResults] = useState<Array<{ partFile: string; hasShadow: boolean }>>([])
  const [searching, setSearching] = useState(false)
  const loadPart = useEditorStore((s) => s.loadPart)
  const setLoading = useEditorStore((s) => s.setLoading)
  const setError = useEditorStore((s) => s.setError)
  const loading = useEditorStore((s) => s.loading)
  const partFile = useEditorStore((s) => s.partFile)
  const status = useEditorStore((s) => s.status)
  const isUnofficial = useEditorStore((s) => s.isUnofficial)
  const dirty = useEditorStore((s) => s.dirty)
  const partChildren = useEditorStore((s) => s.partChildren)
  const partNavStack = useEditorStore((s) => s.partNavStack)

  const doSearch = useCallback(async () => {
    setSearching(true)
    try {
      const list = await searchParts(query)
      setResults(list)
    } catch (err) {
      setError(String(err))
    } finally {
      setSearching(false)
    }
  }, [query, setError])

  const doLoad = useCallback(
    async (file?: string, nav: PartNavMode = 'root') => {
      const target = file ?? query
      if (dirty && !window.confirm('Discard unsaved snap edits?')) return
      setLoading(true)
      setError(null)
      try {
        const data = await loadPartConnectivity(target)
        loadPart(data, nav)
        setQuery(data.partFile)
        setResults([])
      } catch (err) {
        setError(String(err))
        setLoading(false)
      }
    },
    [query, dirty, setLoading, setError, loadPart],
  )

  const goBack = useCallback(() => {
    const prev = partNavStack[partNavStack.length - 1]
    if (prev) void doLoad(prev, 'back')
  }, [partNavStack, doLoad])

  return (
    <section className="panel-section">
      <h2>Part</h2>
      <div className="row">
        <input
          className="input"
          value={query}
          placeholder="Part ID (e.g. 3003)"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void doLoad()
          }}
        />
        <button type="button" className="btn" disabled={loading} onClick={() => void doLoad()}>
          Load
        </button>
        <button type="button" className="btn btn-ghost" disabled={searching} onClick={() => void doSearch()}>
          Search
        </button>
      </div>
      {partFile && (
        <div className="part-status">
          {partNavStack.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={loading}
              onClick={goBack}
            >
              Back
            </button>
          )}
          <code>{partFile}</code>
          <span className={`badge badge-${status}`}>{status}</span>
          {isUnofficial && <span className="badge badge-unofficial">unofficial</span>}
          {dirty && <span className="badge badge-dirty">unsaved</span>}
        </div>
      )}
      {partFile && (
        <div className="child-tree">
          <div className="child-tree-label">Children</div>
          <div className="child-tree-root">
            <code>{partFile}</code>
          </div>
          {partChildren.length === 0 ? (
            <p className="child-tree-empty">No child primitives</p>
          ) : (
            <ul className="child-tree-items">
              {partChildren.map((child) => (
                <li key={child.loadFile}>
                  {child.geometryExists ? (
                    <button
                      type="button"
                      className="linkish"
                      disabled={loading}
                      onClick={() => void doLoad(child.loadFile, 'child')}
                    >
                      {child.displayName}
                    </button>
                  ) : (
                    <code className="child-tree-missing">{child.displayName}</code>
                  )}
                  {child.count > 1 && <span className="child-tree-count">×{child.count}</span>}
                  {!child.hasShadow && (
                    <span className="badge badge-missing">no shadow</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.partFile}>
              <button type="button" className="linkish" onClick={() => void doLoad(r.partFile)}>
                {r.partFile}
              </button>
              <span className={`badge badge-${r.hasShadow ? 'ok' : 'missing'}`}>
                {r.hasShadow ? 'shadow' : 'no shadow'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
