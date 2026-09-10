import type {
  LDrawPartConnectivityInclude,
  LDrawSnapRecord,
  LDrawSourcedSnapRecord,
  SnapGender,
  SnapMetaType,
} from '@eb/ldraw-models'
import type { GeometryFeature } from '@eb/ldraw-parser'
import type { ShadowFileHeader } from '../services/shadow-save'
import { create } from 'zustand'
import { isOwnSnap } from '../services/snap-ownership'
import type { PartPrimitiveRef } from '../services/part-children'

export type EditableSnap = LDrawSourcedSnapRecord & {
  /** Stable id for selection / undo (not persisted). */
  id: string
  /** Original `0 !LDCAD SNAP_*` line from this part's shadow when 1:1 mappable. */
  rawLine?: string
  /** Semantic fingerprint at load; if still equal, `rawLine` is emitted on save. */
  originFingerprint?: string
}

export type ConnectivityStatus = 'missing' | 'partial' | 'ok' | 'unknown'

export type PartNavMode = 'root' | 'primitive' | 'back' | 'keep'

const DEFAULT_EDITOR_NAME = 'John Doe'
const EDITOR_NAME_STORAGE_KEY = 'pce.editorName'
const LEGACY_EDITOR_NAME = 'Part Connectivity Editor'

function readEditorName(): string {
  try {
    const stored = sessionStorage.getItem(EDITOR_NAME_STORAGE_KEY)
    const trimmed = stored?.trim()
    if (!trimmed || trimmed === LEGACY_EDITOR_NAME) return DEFAULT_EDITOR_NAME
    return trimmed
  } catch {
    return DEFAULT_EDITOR_NAME
  }
}

function writeEditorName(name: string): void {
  try {
    sessionStorage.setItem(EDITOR_NAME_STORAGE_KEY, name)
  } catch {
    /* ignore quota / private mode */
  }
}

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
  /** Geometry header is `!LDRAW_ORG Unofficial_*`. */
  isUnofficial: boolean
  /** Parsed header from the existing shadow file (null for brand-new shadows). */
  shadowHeader: ShadowFileHeader | null
  /** Raw shadow file text at load time (empty string / null → treat as new). */
  shadowSourceText: string | null
  /** Prefill SNAP_INCL entries for a brand-new shadow (empty when a file already exists). */
  ownIncludes: LDrawPartConnectivityInclude[]
  /**
   * inherit: inherited (SNAP_INCL) snaps are read-only; save keeps INCL and only
   * writes own snap lines.
   * flatten: all snaps editable; save writes SNAP_CLEAR + full list (legacy).
   */
  definitionMode: 'inherit' | 'flatten'
  /** Name used in HISTORY braces; persists for the browser tab session. */
  editorName: string
  showMale: boolean
  showFemale: boolean
  showSourceLabels: boolean
  /** Geometry feature catalog for magnetic snap (from LDraw tree). */
  geometryFeatures: GeometryFeature[]
  /** Magnetic snap while moving (translate mode). */
  snapToGeometry: boolean
  /**
   * When true, translate positions snap to 1 LDU (Stepped Movement).
   * When false, translate by 0.1 LDU.
   */
  gridLock: boolean
  /** Active snap target during drag (for highlight / HUD). */
  snapTargetFeatureId: string | null
  /**
   * Template being placed with the mouse (follows pointer until click).
   * Null when not in place mode.
   */
  pendingPlacement: LDrawSnapRecord | null
  /** Live preview pose while placing (part-local LDraw). */
  pendingPose: { position: [number, number, number]; orientation: LDrawSnapRecord['orientation'] } | null
  /** In-memory clipboard for copy/paste of a snap (not OS clipboard). */
  clipboardSnap: LDrawSnapRecord | null
  /** Undo stack (snapshots of snaps arrays). */
  past: EditableSnap[][]
  future: EditableSnap[][]
  /** Direct type-1 DAT refs of the loaded part (one level). */
  partPrimitives: PartPrimitiveRef[]
  /** Resolved LDraw geometry URL for the current part. */
  geometryUrl: string | null
  /** Previously loaded parts when drilling into a listed primitive. */
  partNavStack: string[]
}

export interface EditorSnapActions {
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  loadPart: (payload: {
    partFile: string
    partName?: string
    snaps: Array<
      LDrawSourcedSnapRecord & {
        rawLine?: string
        originFingerprint?: string
      }
    >
    hadShadowFile: boolean
    geometryFeatures?: GeometryFeature[]
    shadowHeader?: ShadowFileHeader | null
    shadowSourceText?: string | null
    ownIncludes?: LDrawPartConnectivityInclude[]
    isUnofficial?: boolean
    primitives?: PartPrimitiveRef[]
    geometryUrl?: string | null
  }, nav?: PartNavMode) => void
  setPartName: (name: string) => void
  setEditorName: (name: string) => void
  /** Flatten inheritance into this part (unlocks inherited snaps; save uses SNAP_CLEAR). */
  resetDefinition: () => void
  /** Return to inherit mode (inherited snaps become read-only again). */
  clearDefinitionReset: () => void
  selectSnap: (id: string | null) => void
  updateSnap: (id: string, patch: Partial<LDrawSnapRecord>) => void
  /** Update without pushing undo history (used during gizmo drag). */
  updateSnapLive: (id: string, patch: Partial<LDrawSnapRecord>) => void
  /** Push one undo snapshot before a continuous gizmo transform. */
  beginTransform: () => void
  setSnapTargetFeatureId: (id: string | null) => void
  setSnapToGeometry: (enabled: boolean) => void
  setGridLock: (enabled: boolean) => void
  addSnap: (snap: LDrawSnapRecord, sourceFile?: string) => string
  deleteSnap: (id: string) => void
  /** Begin click-to-place for a template snap. */
  beginPlaceSnap: (snap: LDrawSnapRecord) => void
  /** Update the ghost pose while moving the mouse. */
  updatePendingPose: (
    position: [number, number, number],
    orientation: LDrawSnapRecord['orientation'],
  ) => void
  /** Commit the pending snap at the current pose. */
  confirmPlaceSnap: () => string | null
  /** Cancel click-to-place without adding. */
  cancelPlaceSnap: () => void
  /** Copy the currently selected snap into the editor clipboard. */
  copySelectedSnap: () => boolean
  /** Paste a duplicate of the clipboard snap (offset slightly) and select it. */
  pasteSnap: () => string | null
  setVisibility: (opts: Partial<Pick<EditorSnapState, 'showMale' | 'showFemale' | 'showSourceLabels'>>) => void
  markClean: () => void
  /** Treat a downloaded/saved shadow payload as the new baseline (no library reload). */
  markSaved: (shadowSourceText: string) => void
  undo: () => void
  redo: () => void
}

const IDENTITY_ORI: LDrawSnapRecord['orientation'] = [1, 0, 0, 0, 1, 0, 0, 0, 1]

function newId(): string {
  return crypto.randomUUID()
}

function cloneSnapRecord(snap: EditableSnap | LDrawSnapRecord): LDrawSnapRecord {
  return {
    ...snap,
    position: [...(snap.position ?? [0, 0, 0])] as [number, number, number],
    orientation: [...(snap.orientation ?? IDENTITY_ORI)] as typeof IDENTITY_ORI,
    secs: snap.secs?.map((sec) => ({ shape: sec.shape, values: [...sec.values] })),
    seq: snap.seq ? [...snap.seq] : undefined,
    bounding: snap.bounding ? { kind: snap.bounding.kind, values: [...snap.bounding.values] } : undefined,
  }
}

function cloneSnaps(snaps: EditableSnap[]): EditableSnap[] {
  return snaps.map((s) => ({
    ...cloneSnapRecord(s),
    id: s.id,
    sourceFile: s.sourceFile,
    rawLine: s.rawLine,
    originFingerprint: s.originFingerprint,
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

function canEditSnap(
  snap: EditableSnap,
  partFile: string | null,
  definitionMode: 'inherit' | 'flatten',
): boolean {
  if (!partFile) return false
  if (definitionMode === 'flatten') return true
  return isOwnSnap(snap.sourceFile, partFile)
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
  isUnofficial: false,
  shadowHeader: null,
  shadowSourceText: null,
  ownIncludes: [],
  definitionMode: 'inherit',
  editorName: readEditorName(),
  showMale: true,
  showFemale: true,
  showSourceLabels: false,
  geometryFeatures: [],
  snapToGeometry: true,
  gridLock: true,
  snapTargetFeatureId: null,
  pendingPlacement: null,
  pendingPose: null,
  clipboardSnap: null,
  past: [],
  future: [],
  partPrimitives: [],
  geometryUrl: null,
  partNavStack: [],

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  loadPart: ({
    partFile,
    partName,
    snaps,
    hadShadowFile,
    geometryFeatures = [],
    shadowHeader = null,
    shadowSourceText = null,
    ownIncludes = [],
    isUnofficial = false,
    primitives = [],
    geometryUrl = null,
  }, nav = 'keep') => {
    const editable: EditableSnap[] = snaps.map((s) => ({
      ...s,
      id: newId(),
      orientation: s.orientation ?? IDENTITY_ORI,
      position: s.position ?? [0, 0, 0],
      slide: s.slide ?? false,
      center: s.center ?? false,
      rawLine: s.rawLine,
      originFingerprint: s.originFingerprint,
    }))
    const resolvedName =
      shadowHeader?.partName?.trim()
      || partName?.trim()
      || (hadShadowFile ? partFile : null)
    const includes = hadShadowFile ? [] : ownIncludes
    set((state) => {
      let partNavStack = state.partNavStack
      if (nav === 'root') {
        partNavStack = []
      } else if (nav === 'primitive' && state.partFile) {
        partNavStack = [...state.partNavStack, state.partFile]
      } else if (nav === 'back') {
        partNavStack = state.partNavStack.slice(0, -1)
      }
      return {
        partFile,
        partName: resolvedName,
        snaps: editable,
        selectedSnapId: null,
        dirty: !hadShadowFile && includes.length > 0,
        loading: false,
        error: null,
        hadShadowFile,
        isUnofficial,
        shadowHeader: hadShadowFile ? shadowHeader : null,
        shadowSourceText: hadShadowFile ? (shadowSourceText ?? null) : null,
        ownIncludes: includes,
        definitionMode: 'inherit',
        status: inferStatus(editable.length, hadShadowFile),
        past: [],
        future: [],
        geometryFeatures,
        snapTargetFeatureId: null,
        pendingPlacement: null,
        pendingPose: null,
        partPrimitives: primitives,
        geometryUrl,
        partNavStack,
      }
    })
  },

  setPartName: (name) => set({ partName: name, dirty: true }),

  setEditorName: (name) => {
    const trimmed = name.trim() || DEFAULT_EDITOR_NAME
    writeEditorName(trimmed)
    set({ editorName: trimmed })
  },

  resetDefinition: () => set({ definitionMode: 'flatten', dirty: true }),

  clearDefinitionReset: () => set({ definitionMode: 'inherit' }),

  selectSnap: (id) => set({ selectedSnapId: id, snapTargetFeatureId: null }),

  setSnapTargetFeatureId: (id) => set({ snapTargetFeatureId: id }),

  setSnapToGeometry: (enabled) => set({ snapToGeometry: enabled }),

  setGridLock: (enabled) => set({ gridLock: enabled }),

  beginPlaceSnap: (snap) => {
    const placement = cloneSnapRecord(snap)
    set({
      pendingPlacement: placement,
      pendingPose: {
        position: [...(placement.position ?? [0, 0, 0])] as [number, number, number],
        orientation: [...(placement.orientation ?? IDENTITY_ORI)] as typeof IDENTITY_ORI,
      },
      selectedSnapId: null,
      snapTargetFeatureId: null,
    })
  },

  updatePendingPose: (position, orientation) => {
    const state = get()
    if (!state.pendingPlacement) return
    set({
      pendingPose: {
        position: [...position] as [number, number, number],
        orientation: [...orientation] as typeof IDENTITY_ORI,
      },
    })
  },

  confirmPlaceSnap: () => {
    const state = get()
    if (!state.pendingPlacement || !state.pendingPose) return null
    const snap = {
      ...cloneSnapRecord(state.pendingPlacement),
      position: [...state.pendingPose.position] as [number, number, number],
      orientation: [...state.pendingPose.orientation] as typeof IDENTITY_ORI,
    }
    set({ pendingPlacement: null, pendingPose: null, snapTargetFeatureId: null })
    return get().addSnap(snap, '(editor)')
  },

  cancelPlaceSnap: () => set({ pendingPlacement: null, pendingPose: null, snapTargetFeatureId: null }),

  updateSnap: (id, patch) => {
    const state = get()
    const target = state.snaps.find((s) => s.id === id)
    if (!target || !canEditSnap(target, state.partFile, state.definitionMode)) return
    const hist = pushHistory(state)
    set({
      ...hist,
      snaps: state.snaps.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  },

  updateSnapLive: (id, patch) => {
    const state = get()
    const target = state.snaps.find((s) => s.id === id)
    if (!target || !canEditSnap(target, state.partFile, state.definitionMode)) return
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
    const target = state.snaps.find((s) => s.id === id)
    if (!target || !canEditSnap(target, state.partFile, state.definitionMode)) return
    const hist = pushHistory(state)
    const snaps = state.snaps.filter((s) => s.id !== id)
    set({
      ...hist,
      snaps,
      selectedSnapId: state.selectedSnapId === id ? null : state.selectedSnapId,
      status: inferStatus(snaps.length, state.hadShadowFile),
    })
  },

  copySelectedSnap: () => {
    const state = get()
    const snap = state.snaps.find((s) => s.id === state.selectedSnapId)
    if (!snap) return false
    set({ clipboardSnap: cloneSnapRecord(snap) })
    return true
  },

  pasteSnap: () => {
    const state = get()
    if (!state.clipboardSnap || !state.partFile) return null
    const pasted = cloneSnapRecord(state.clipboardSnap)
    // Offset so the duplicate is visible next to the original.
    pasted.position = [pasted.position[0] + 1, pasted.position[1], pasted.position[2]]
    return get().addSnap(pasted, '(paste)')
  },

  setVisibility: (opts) => set(opts),

  markClean: () => set({ dirty: false, past: [], future: [] }),

  markSaved: (shadowSourceText) =>
    set({
      dirty: false,
      past: [],
      future: [],
      shadowSourceText,
      hadShadowFile: true,
    }),

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

export { snapGender, canEditSnap }
