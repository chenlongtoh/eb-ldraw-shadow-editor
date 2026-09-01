import type { LDrawSnapRecord, LDrawSourcedSnapRecord, SnapGender, SnapMetaType } from '@eb/ldraw-models'
import { create } from 'zustand'

export type EditableSnap = LDrawSourcedSnapRecord & {
  /** Stable id for selection / undo (not persisted). */
  id: string
}

export type ConnectivityStatus = 'missing' | 'partial' | 'ok' | 'unknown'

export interface EditorSnapState {
  partFile: string | null
  partName: string | null
  snaps: EditableSnap[]
  selectedSnapId: string | null
  dirty: boolean
  loading: boolean
  error: string | null
  status: ConnectivityStatus
  hadShadowFile: boolean
  showMale: boolean
  showFemale: boolean
  showSourceLabels: boolean
  /** Undo stack (snapshots of snaps arrays). */
  past: EditableSnap[][]
  future: EditableSnap[][]
  savePreview: string | null
}

export interface EditorSnapActions {
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  loadPart: (payload: {
    partFile: string
    partName?: string
    snaps: LDrawSourcedSnapRecord[]
    hadShadowFile: boolean
  }) => void
  selectSnap: (id: string | null) => void
  updateSnap: (id: string, patch: Partial<LDrawSnapRecord>) => void
  /** Update without pushing undo history (used during gizmo drag). */
  updateSnapLive: (id: string, patch: Partial<LDrawSnapRecord>) => void
  /** Push one undo snapshot before a continuous gizmo transform. */
  beginTransform: () => void
  addSnap: (snap: LDrawSnapRecord, sourceFile?: string) => string
  deleteSnap: (id: string) => void
  setVisibility: (opts: Partial<Pick<EditorSnapState, 'showMale' | 'showFemale' | 'showSourceLabels'>>) => void
  setSavePreview: (text: string | null) => void
  markClean: () => void
  undo: () => void
  redo: () => void
}

const IDENTITY_ORI: LDrawSnapRecord['orientation'] = [1, 0, 0, 0, 1, 0, 0, 0, 1]

function newId(): string {
  return crypto.randomUUID()
}

function cloneSnaps(snaps: EditableSnap[]): EditableSnap[] {
  return snaps.map((s) => ({
    ...s,
    position: [...s.position] as [number, number, number],
    orientation: [...s.orientation] as typeof IDENTITY_ORI,
    secs: s.secs?.map((sec) => ({ shape: sec.shape, values: [...sec.values] })),
    seq: s.seq ? [...s.seq] : undefined,
    bounding: s.bounding ? { kind: s.bounding.kind, values: [...s.bounding.values] } : undefined,
  }))
}

function pushHistory(state: EditorSnapState): Pick<EditorSnapState, 'past' | 'future' | 'dirty'> {
  return {
    past: [...state.past, cloneSnaps(state.snaps)].slice(-50),
    future: [],
    dirty: true,
  }
}

function inferStatus(snapCount: number, hadShadowFile: boolean): ConnectivityStatus {
  if (snapCount === 0) return 'missing'
  if (!hadShadowFile && snapCount > 0) return 'ok' // inherited only
  if (snapCount < 2) return 'partial'
  return 'ok'
}

function snapGender(snap: EditableSnap): SnapGender {
  return snap.gender ?? snap.genderOfs ?? 'M'
}

export const useEditorStore = create<EditorSnapState & EditorSnapActions>((set, get) => ({
  partFile: null,
  partName: null,
  snaps: [],
  selectedSnapId: null,
  dirty: false,
  loading: false,
  error: null,
  status: 'unknown',
  hadShadowFile: false,
  showMale: true,
  showFemale: true,
  showSourceLabels: false,
  past: [],
  future: [],
  savePreview: null,

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  loadPart: ({ partFile, partName, snaps, hadShadowFile }) => {
    const editable: EditableSnap[] = snaps.map((s) => ({
      ...s,
      id: newId(),
      orientation: s.orientation ?? IDENTITY_ORI,
      position: s.position ?? [0, 0, 0],
      slide: s.slide ?? false,
      center: s.center ?? false,
    }))
    set({
      partFile,
      partName: partName ?? partFile,
      snaps: editable,
      selectedSnapId: null,
      dirty: false,
      loading: false,
      error: null,
      hadShadowFile,
      status: inferStatus(editable.length, hadShadowFile),
      past: [],
      future: [],
      savePreview: null,
    })
  },

  selectSnap: (id) => set({ selectedSnapId: id }),

  updateSnap: (id, patch) => {
    const state = get()
    const hist = pushHistory(state)
    set({
      ...hist,
      snaps: state.snaps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  },

  updateSnapLive: (id, patch) => {
    const state = get()
    set({
      dirty: true,
      snaps: state.snaps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  },

  beginTransform: () => {
    const state = get()
    set(pushHistory(state))
  },

  addSnap: (snap, sourceFile = '(editor)') => {
    const state = get()
    const hist = pushHistory(state)
    const id = newId()
    const editable: EditableSnap = {
      ...snap,
      id,
      sourceFile,
      metaType: snap.metaType as SnapMetaType,
      position: snap.position ?? [0, 0, 0],
      orientation: snap.orientation ?? IDENTITY_ORI,
      slide: snap.slide ?? false,
      center: snap.center ?? false,
    }
    set({
      ...hist,
      snaps: [...state.snaps, editable],
      selectedSnapId: id,
      status: inferStatus(state.snaps.length + 1, state.hadShadowFile),
    })
    return id
  },

  deleteSnap: (id) => {
    const state = get()
    const hist = pushHistory(state)
    const snaps = state.snaps.filter((s) => s.id !== id)
    set({
      ...hist,
      snaps,
      selectedSnapId: state.selectedSnapId === id ? null : state.selectedSnapId,
      status: inferStatus(snaps.length, state.hadShadowFile),
    })
  },

  setVisibility: (opts) => set(opts),

  setSavePreview: (text) => set({ savePreview: text }),

  markClean: () => set({ dirty: false, past: [], future: [], savePreview: null }),

  undo: () => {
    const state = get()
    if (state.past.length === 0) return
    const previous = state.past[state.past.length - 1]
    set({
      snaps: previous,
      past: state.past.slice(0, -1),
      future: [cloneSnaps(state.snaps), ...state.future].slice(0, 50),
      dirty: true,
      selectedSnapId: null,
    })
  },

  redo: () => {
    const state = get()
    if (state.future.length === 0) return
    const next = state.future[0]
    set({
      snaps: next,
      future: state.future.slice(1),
      past: [...state.past, cloneSnaps(state.snaps)].slice(-50),
      dirty: true,
      selectedSnapId: null,
    })
  },
}))

export { snapGender }
