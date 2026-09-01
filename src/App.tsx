import { useEffect, useState } from 'react'
import { PartSearch } from './components/PartSearch'
import { SnapList } from './components/SnapList'
import { SnapTemplatePicker } from './components/SnapTemplatePicker'
import { SnapPropertyForm } from './components/SnapPropertyForm'
import { SaveBar } from './components/SaveBar'
import { PartViewer } from './three/PartViewer'
import { useEditorStore } from './store/editor-store'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function App() {
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate'>('translate')
  const error = useEditorStore((s) => s.error)
  const showMale = useEditorStore((s) => s.showMale)
  const showFemale = useEditorStore((s) => s.showFemale)
  const showSourceLabels = useEditorStore((s) => s.showSourceLabels)
  const setVisibility = useEditorStore((s) => s.setVisibility)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const deleteSnap = useEditorStore((s) => s.deleteSnap)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault()
        setGizmoMode('translate')
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        setGizmoMode('rotate')
        return
      }

      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      if (!selectedSnapId) return
      e.preventDefault()
      deleteSnap(selectedSnapId)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedSnapId, deleteSnap])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Part Connectivity Editor</h1>
          <p>Visualize and edit LDCad snap areas on LDraw part geometry.</p>
        </div>
        <div className="header-controls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={showMale}
              onChange={(e) => setVisibility({ showMale: e.target.checked })}
            />
            Male
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showFemale}
              onChange={(e) => setVisibility({ showFemale: e.target.checked })}
            />
            Female
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={showSourceLabels}
              onChange={(e) => setVisibility({ showSourceLabels: e.target.checked })}
            />
            Sources
          </label>
          <div className="mode-toggle">
            <button
              type="button"
              className={gizmoMode === 'translate' ? 'btn active' : 'btn btn-ghost'}
              onClick={() => setGizmoMode('translate')}
              title="Move (M)"
            >
              Move <kbd>M</kbd>
            </button>
            <button
              type="button"
              className={gizmoMode === 'rotate' ? 'btn active' : 'btn btn-ghost'}
              onClick={() => setGizmoMode('rotate')}
              title="Rotate (R)"
            >
              Rotate <kbd>R</kbd>
            </button>
          </div>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="app-body">
        <aside className="sidebar">
          <PartSearch />
          <SaveBar />
          <SnapTemplatePicker />
          <SnapList />
          <SnapPropertyForm gizmoMode={gizmoMode} />
        </aside>
        <main className="viewport">
          <PartViewer gizmoMode={gizmoMode} />
        </main>
      </div>
    </div>
  )
}
