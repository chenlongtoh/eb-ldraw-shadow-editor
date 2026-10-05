import { useEffect } from 'react'
import type { LDrawSnapRecord } from '@eb/ldraw-models'
import { useEditorStore, canEditSnap } from '../store/editor-store'
import { cameraSync } from '../three/camera-sync'
import { applyKeyboardNudge, isTypingTarget } from '../three/snap-nudge'
import { positionStepLdu } from '../three/snap-snap'
import { parseGrid, type ParsedGrid } from '@eb/ldraw-parser'
import { defaultGrid, formatGrid } from '../services/snap-grid'

function Num({
  label,
  value,
  onChange,
  step = 1,
  disabled = false,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: number
  disabled?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  )
}

function GridFields({
  grid,
  onChange,
}: {
  grid: string | undefined
  onChange: (grid: string | undefined) => void
}) {
  const parsed = grid ? parseGrid(grid) : null
  const update = (partial: Partial<ParsedGrid>) => {
    if (!parsed) return
    onChange(formatGrid({ ...parsed, ...partial }))
  }
  const setCount = (key: 'xCount' | 'zCount', value: number) => {
    update({ [key]: Math.max(1, Math.round(value) || 1) })
  }

  return (
    <div className="grid-editor">
      <div className="field-row checks">
        <label>
          <input
            type="checkbox"
            checked={!!grid}
            onChange={(e) =>
              onChange(e.target.checked ? formatGrid(parsed ?? defaultGrid()) : undefined)
            }
          />
          Grid
        </label>
      </div>
      {grid && parsed && (
        <>
          <p className="muted grid-hint">
            Repeats this snap from its position. Center places the copies around that origin.
          </p>
          <div className="field-row">
            <Num label="X count" value={parsed.xCount} step={1} onChange={(n) => setCount('xCount', n)} />
            <Num label="Z count" value={parsed.zCount} step={1} onChange={(n) => setCount('zCount', n)} />
          </div>
          <div className="field-row">
            <Num label="X step" value={parsed.xStep} step={1} onChange={(xStep) => update({ xStep })} />
            <Num label="Z step" value={parsed.zStep} step={1} onChange={(zStep) => update({ zStep })} />
          </div>
          <div className="field-row checks">
            <label>
              <input
                type="checkbox"
                checked={parsed.xCentered}
                onChange={(e) => update({ xCentered: e.target.checked })}
              />
              center X
            </label>
            <label>
              <input
                type="checkbox"
                checked={parsed.zCentered}
                onChange={(e) => update({ zCentered: e.target.checked })}
              />
              center Z
            </label>
          </div>
        </>
      )}
      {grid && !parsed && (
        <label className="field">
          <span>Grid</span>
          <input
            type="text"
            value={grid}
            onChange={(e) => onChange(e.target.value || undefined)}
          />
        </label>
      )}
    </div>
  )
}

export function SnapPropertyForm() {
  const partFile = useEditorStore((s) => s.partFile)
  const snaps = useEditorStore((s) => s.snaps)
  const selectedSnapId = useEditorStore((s) => s.selectedSnapId)
  const updateSnap = useEditorStore((s) => s.updateSnap)
  const gridLock = useEditorStore((s) => s.gridLock)
  const definitionMode = useEditorStore((s) => s.definitionMode)
  const snap = snaps.find((s) => s.id === selectedSnapId)
  const editable = snap ? canEditSnap(snap, partFile, definitionMode) : false

  useEffect(() => {
    if (!snap || !editable) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const state = useEditorStore.getState()
      const current = state.snaps.find((s) => s.id === state.selectedSnapId)
      if (!current || !canEditSnap(current, state.partFile, state.definitionMode)) return

      const next = applyKeyboardNudge(
        e,
        current,
        cameraSync.quaternion,
        positionStepLdu(state.gridLock),
      )
      if (!next) return

      e.preventDefault()
      e.stopPropagation()
      state.updateSnap(current.id, next)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [snap, editable])

  if (!snap) {
    return (
      <section className="panel-section">
        <h2>Properties</h2>
        <p className="muted">Select a snap to edit its parameters.</p>
      </section>
    )
  }

  const patch = (p: Partial<LDrawSnapRecord>) => updateSnap(snap.id, p)
  const posStep = positionStepLdu(gridLock)
  const patchPos = (axis: 0 | 1 | 2, value: number) => {
    const next = [...snap.position] as [number, number, number]
    next[axis] = Math.round(value / posStep) * posStep
    patch({ position: next })
  }

  return (
    <section className="panel-section">
      <h2>Properties</h2>
      <p className="muted source-line">
        Source: <code>{snap.sourceFile}</code>
        {!editable && ' · read-only'}
      </p>

      <fieldset className="snap-props-fieldset" disabled={!editable}>
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

      <GridFields
        grid={snap.grid}
        onChange={(grid) => patch({ grid })}
      />

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
      </fieldset>
    </section>
  )
}
