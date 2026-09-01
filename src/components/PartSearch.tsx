import { useCallback, useState } from 'react'
import { loadPartConnectivity, searchParts } from '../services/connectivity-api'
import { useEditorStore } from '../store/editor-store'

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
  const dirty = useEditorStore((s) => s.dirty)

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
    async (file?: string) => {
      const target = file ?? query
      if (dirty && !window.confirm('Discard unsaved snap edits?')) return
      setLoading(true)
      setError(null)
      try {
        const data = await loadPartConnectivity(target)
        loadPart(data)
        setResults([])
      } catch (err) {
        setError(String(err))
        setLoading(false)
      }
    },
    [query, dirty, setLoading, setError, loadPart],
  )

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
          <code>{partFile}</code>
          <span className={`badge badge-${status}`}>{status}</span>
          {dirty && <span className="badge badge-dirty">unsaved</span>}
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
