import { useEffect, useState } from 'react'
import { BrandWordmark } from './components/BrandWordmark'
import { PartSearch } from './components/PartSearch'
import { SnapList } from './components/SnapList'
import { SnapTemplatePicker } from './components/SnapTemplatePicker'
import { SnapPropertyForm } from './components/SnapPropertyForm'
import { SavePanel } from './components/SavePanel'
import { ThemeSettingsModal } from './components/ThemeSettingsModal'
import { PartViewer } from './three/PartViewer'
import { useEditorStore } from './store/editor-store'
import { isTypingTarget } from './three/snap-nudge'

export function App() {
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate'>('translate')
  const [showSettings, setShowSettings] = useState(false)
  const error = useEditorStore((s) => s.error)
  const showMale = useEditorStore((s) => s.showMale)
  const showFemale = useEditorStore((s) => s.showFemale)
  const showSourceLabels = useEditorStore((s) => s.showSourceLabels)
  const snapToGeometry = useEditorStore((s) => s.snapToGeometry)
  const setSnapToGeometry = useEditorStore((s) => s.setSnapToGeometry)
  const gridLock = useEditorStore((s) => s.gridLock)
  const setGridLock = useEditorStore((s) => s.setGridLock)
  const setVisibility = useEditorStore((s) => s.setVisibility)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const deleteSnap = useEditorStore((s) => s.deleteSnap)
  const copySelectedSnap = useEditorStore((s) => s.copySelectedSnap)
  const pasteSnap = useEditorStore((s) => s.pasteSnap)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showSettings) return
      if (isTypingTarget(e.target)) return

      const mod = e.metaKey || e.ctrlKey
      if (mod && !e.altKey) {
        const key = e.key.toLowerCase()
        if (key === 'c') {
          if (copySelectedSnap()) e.preventDefault()
          return
        }
        if (key === 'v') {
          if (pasteSnap()) e.preventDefault()
          return
        }
      }

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
  }, [selectedSnapId, deleteSnap, copySelectedSnap, pasteSnap, showSettings])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-brand">
          <BrandWordmark suffix="LDraw Shadow Editor" />
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
          <label className="toggle">
            <input
              type="checkbox"
              checked={snapToGeometry}
              onChange={(e) => setSnapToGeometry(e.target.checked)}
            />
            Snap
          </label>
          <label className="toggle" title="Move by 1 LDU. Off = 0.1 LDU.">
            <input
              type="checkbox"
              checked={gridLock}
              onChange={(e) => setGridLock(e.target.checked)}
            />
            Stepped Movement
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
          <button type="button" className="btn btn-ghost" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      <div className="app-body">
        <aside className="sidebar">
          <PartSearch />
          <SnapTemplatePicker />
          <SnapList />
          <SnapPropertyForm gizmoMode={gizmoMode} />
        </aside>
        <main className="viewport">
          <PartViewer gizmoMode={gizmoMode} />
        </main>
        <aside className="sidebar sidebar-right">
          <SavePanel />
        </aside>
      </div>

      {showSettings && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false)
          }}
        >
          <ThemeSettingsModal onClose={() => setShowSettings(false)} />
        </div>
      )}
    </div>
  )
}
