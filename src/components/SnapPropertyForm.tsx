import { useEffect, useMemo, useState } from 'react'
import type { LDrawSnapRecord } from '@eb/ldraw-models'
import { useEditorStore } from '../store/editor-store'
import {
  orientationToDisplayEulerDeg,
  rotateSnapAboutDisplayAxis,
  setDisplayEulerDeg,
  type RotationAxis,
} from '../three/snap-rotation'

function Num({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function SnapPropertyForm({ gizmoMode }: { gizmoMode: 'translate' | 'rotate' }) {
  const snaps = useEditorStore((s) => s.snaps)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const updateSnap = useEditorStore((s) => s.updateSnap)
  const gridLock = useEditorStore((s) => s.gridLock)
  const snap = snaps.find((s) => s.id === selectedSnapId)

  const euler = useMemo(
    () =>
      snap
        ? orientationToDisplayEulerDeg(snap.position, snap.orientation)
        : ([0, 0, 0] as [number, number, number]),
    [snap],
  )

  const [customAxis, setCustomAxis] = useState<RotationAxis>('y')
  const [customDegrees, setCustomDegrees] = useState(90)
  const [eulerDraft, setEulerDraft] = useState<[number, number, number]>([0, 0, 0])

  useEffect(() => {
    setEulerDraft(euler)
  }, [euler[0], euler[1], euler[2], selectedSnapId])

  useEffect(() => {
    if (!snap || gizmoMode !== 'rotate') return

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      let axis: RotationAxis | null = null
      let degrees = 0

      if (e.key === 'ArrowLeft') {
        axis = e.shiftKey ? 'z' : 'y'
        degrees = -90
      } else if (e.key === 'ArrowRight') {
        axis = e.shiftKey ? 'z' : 'y'
        degrees = 90
      } else if (e.key === 'ArrowUp') {
        axis = 'x'
        degrees = -90
      } else if (e.key === 'ArrowDown') {
        axis = 'x'
        degrees = 90
      } else {
        return
      }

      e.preventDefault()
      const next = rotateSnapAboutDisplayAxis(snap, axis, degrees)
      updateSnap(snap.id, next)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [snap, gizmoMode, updateSnap])

  if (!snap) {
    return (
      <section className="panel-section">
        <h2>Properties</h2>
        <p className="muted">Select a snap to edit its parameters.</p>
      </section>
    )
  }

  const patch = (p: Partial<LDrawSnapRecord>) => updateSnap(snap.id, p)
  const posStep = gridLock ? 1 : 0.1
  const patchPos = (axis: 0 | 1 | 2, value: number) => {
    const next = [...snap.position] as [number, number, number]
    next[axis] = gridLock ? Math.round(value) : value
    patch({ position: next })
  }

  const nudge = (axis: RotationAxis, degrees: number) => {
    patch(rotateSnapAboutDisplayAxis(snap, axis, degrees))
  }

  const applyCustom = () => {
    patch(rotateSnapAboutDisplayAxis(snap, customAxis, customDegrees))
  }

  const applyEuler = () => {
    patch(setDisplayEulerDeg(snap, eulerDraft))
  }

  return (
    <section className="panel-section">
      <h2>Properties</h2>
      <p className="muted source-line">
        Source: <code>{snap.sourceFile}</code>
      </p>

      <div className="field-row">
        <label className="field">
          <span>Type</span>
          <select
            value={snap.metaType}
            onChange={(e) => patch({ metaType: e.target.value as LDrawSnapRecord['metaType'] })}
          >
            <option value="SNAP_CYL">SNAP_CYL</option>
            <option value="SNAP_CLP">SNAP_CLP</option>
            <option value="SNAP_FGR">SNAP_FGR</option>
            <option value="SNAP_GEN">SNAP_GEN</option>
            <option value="SNAP_SPH">SNAP_SPH</option>
          </select>
        </label>
        <label className="field">
          <span>Gender</span>
          <select
            value={snap.gender ?? ''}
            onChange={(e) =>
              patch({ gender: e.target.value ? (e.target.value as LDrawSnapRecord['gender']) : undefined })
            }
          >
            <option value="">—</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </label>
        <label className="field">
          <span>GenderOfs</span>
          <select
            value={snap.genderOfs ?? ''}
            onChange={(e) =>
              patch({
                genderOfs: e.target.value ? (e.target.value as LDrawSnapRecord['genderOfs']) : undefined,
              })
            }
          >
            <option value="">—</option>
            <option value="M">M</option>
            <option value="F">F</option>
          </select>
        </label>
      </div>

      <div className="field-row">
        <Num label="X" value={snap.position[0]} onChange={(x) => patchPos(0, x)} step={posStep} />
        <Num label="Y" value={snap.position[1]} onChange={(y) => patchPos(1, y)} step={posStep} />
        <Num label="Z" value={snap.position[2]} onChange={(z) => patchPos(2, z)} step={posStep} />
      </div>

      <div className={`rotation-panel ${gizmoMode === 'rotate' ? 'rotation-panel-active' : ''}`}>
        <div className="rotation-panel-header">
          <h3>Rotation</h3>
          {gizmoMode === 'rotate' && <span className="rotation-badge">Rotate mode</span>}
        </div>
        <p className="muted rotation-hint">
          Arrow keys: ←/→ = ±90° Y, ↑/↓ = ±90° X, Shift+←/→ = ±90° Z
        </p>

        <div className="field-row">
          <Num
            label="Rx °"
            value={eulerDraft[0]}
            step={1}
            onChange={(x) => setEulerDraft([x, eulerDraft[1], eulerDraft[2]])}
          />
          <Num
            label="Ry °"
            value={eulerDraft[1]}
            step={1}
            onChange={(y) => setEulerDraft([eulerDraft[0], y, eulerDraft[2]])}
          />
          <Num
            label="Rz °"
            value={eulerDraft[2]}
            step={1}
            onChange={(z) => setEulerDraft([eulerDraft[0], eulerDraft[1], z])}
          />
        </div>
        <button type="button" className="btn btn-ghost btn-block" onClick={applyEuler}>
          Set absolute angles
        </button>

        <div className="nudge-row">
          <span className="nudge-label">Nudge 90°</span>
          <button type="button" className="btn btn-ghost" onClick={() => nudge('x', -90)} title="−90° X">
            X−
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => nudge('x', 90)} title="+90° X">
            X+
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => nudge('y', -90)} title="−90° Y">
            Y−
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => nudge('y', 90)} title="+90° Y">
            Y+
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => nudge('z', -90)} title="−90° Z">
            Z−
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => nudge('z', 90)} title="+90° Z">
            Z+
          </button>
        </div>

        <div className="field-row custom-angle-row">
          <label className="field">
            <span>Axis</span>
            <select
              value={customAxis}
              onChange={(e) => setCustomAxis(e.target.value as RotationAxis)}
            >
              <option value="x">X</option>
              <option value="y">Y</option>
              <option value="z">Z</option>
            </select>
          </label>
          <Num label="Angle °" value={customDegrees} step={1} onChange={setCustomDegrees} />
          <button type="button" className="btn" onClick={applyCustom}>
            Apply
          </button>
        </div>
      </div>

      <details className="ori-details">
        <summary>Orientation (9 floats)</summary>
        <div className="ori-grid">
          {snap.orientation.map((v, i) => (
            <input
              key={i}
              type="number"
              step={0.01}
              value={v}
              onChange={(e) => {
                const next = [...snap.orientation] as LDrawSnapRecord['orientation']
                next[i] = parseFloat(e.target.value) || 0
                patch({ orientation: next })
              }}
            />
          ))}
        </div>
      </details>

      <div className="field-row checks">
        <label>
          <input
            type="checkbox"
            checked={snap.center}
            onChange={(e) => patch({ center: e.target.checked })}
          />
          center
        </label>
        <label>
          <input
            type="checkbox"
            checked={snap.slide}
            onChange={(e) => patch({ slide: e.target.checked })}
          />
          slide
        </label>
      </div>

      <label className="field">
        <span>Group</span>
        <input
          type="text"
          value={snap.group ?? ''}
          onChange={(e) => patch({ group: e.target.value || undefined })}
        />
      </label>

      <label className="field">
        <span>Grid</span>
        <input
          type="text"
          placeholder="C 2 C 2 20 20"
          value={snap.grid ?? ''}
          onChange={(e) => patch({ grid: e.target.value || undefined })}
        />
      </label>

      {snap.metaType === 'SNAP_CYL' && (
        <>
          <label className="field">
            <span>Caps</span>
            <select
              value={snap.caps ?? 'none'}
              onChange={(e) => patch({ caps: e.target.value })}
            >
              <option value="none">none</option>
              <option value="one">one</option>
              <option value="two">two</option>
              <option value="A">A</option>
              <option value="B">B</option>
            </select>
          </label>
          <label className="field">
            <span>Secs</span>
            <input
              type="text"
              value={
                snap.secs
                  ?.map((s) => `${s.shape} ${s.values.join(' ')}`)
                  .join('   ') ?? ''
              }
              onChange={(e) => {
                const tokens = e.target.value.trim().split(/\s+/).filter(Boolean)
                const secs: NonNullable<LDrawSnapRecord['secs']> = []
                let i = 0
                while (i < tokens.length) {
                  const shape = tokens[i++]
                  const values: number[] = []
                  while (i < tokens.length && !Number.isNaN(Number(tokens[i]))) {
                    values.push(Number(tokens[i++]))
                  }
                  secs.push({ shape, values })
                }
                patch({ secs })
              }}
            />
          </label>
        </>
      )}

      {(snap.metaType === 'SNAP_CLP' || snap.metaType === 'SNAP_FGR' || snap.metaType === 'SNAP_SPH') && (
        <div className="field-row">
          <Num
            label="Radius"
            value={snap.radius ?? 0}
            onChange={(radius) => patch({ radius })}
            step={0.5}
          />
          {snap.metaType === 'SNAP_CLP' && (
            <Num
              label="Length"
              value={snap.length ?? 0}
              onChange={(length) => patch({ length })}
              step={0.5}
            />
          )}
        </div>
      )}

      {snap.metaType === 'SNAP_FGR' && (
        <label className="field">
          <span>Seq</span>
          <input
            type="text"
            value={snap.seq?.join(' ') ?? ''}
            onChange={(e) =>
              patch({
                seq: e.target.value
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean)
                  .map(Number)
                  .filter((n) => !Number.isNaN(n)),
              })
            }
          />
        </label>
      )}

      {snap.metaType === 'SNAP_GEN' && (
        <label className="field">
          <span>Bounding</span>
          <input
            type="text"
            placeholder="sph 12.7"
            value={
              snap.bounding
                ? `${snap.bounding.kind === 'sphere' ? 'sph' : snap.bounding.kind === 'cylinder' ? 'cyl' : snap.bounding.kind} ${snap.bounding.values.join(' ')}`
                : ''
            }
            onChange={(e) => {
              const tokens = e.target.value.trim().split(/\s+/).filter(Boolean)
              if (tokens.length < 2) {
                patch({ bounding: undefined })
                return
              }
              const kindStr = tokens[0]
              const values = tokens.slice(1).map(Number)
              const kind =
                kindStr === 'cyl' || kindStr === 'cylinder'
                  ? 'cylinder'
                  : kindStr === 'sph' || kindStr === 'sphere'
                    ? 'sphere'
                    : kindStr === 'box'
                      ? 'box'
                      : 'point'
              patch({ bounding: { kind, values } })
            }}
          />
        </label>
      )}
    </section>
  )
}
