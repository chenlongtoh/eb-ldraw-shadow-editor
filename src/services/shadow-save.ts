/**
 * Preserve original shadow-file text for unchanged preamble / SNAP lines.
 * Two save modes:
 * - inherit: keep SNAP_INCL / existing structure; only add/update/remove own SNAP_* lines
 * - flatten: SNAP_CLEAR + full explicit snap list (legacy editor behavior)
 */

import type {
  LDrawPartConnectivityInclude,
  LDrawSnapRecord,
  LDrawSourcedSnapRecord,
} from '@eb/ldraw-models'
import {
  expandSnapWithGrid,
  normalizePartFile,
  parseConnectivityFile,
  serializeSnapRecord,
} from '@eb/ldraw-parser'
import { ensureUnofficialMarker } from './part-official'
import { isOwnSnap } from './snap-ownership'
import { serializeInclude } from './shadow-includes'

const SNAP_META_RE = /^0\s+!LDCAD\s+SNAP_/i
const HISTORY_RE = /^0\s+!HISTORY\b/i
const GEOM_SNAP_TYPES = new Set(['SNAP_CYL', 'SNAP_CLP', 'SNAP_FGR', 'SNAP_GEN', 'SNAP_SPH'])

export type SaveDefinitionMode = 'inherit' | 'flatten'

function roundN(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1e6) / 1e6
}

/** Stable semantic fingerprint — ignores editor id / rawLine / sourceFile. */
export function snapFingerprint(snap: LDrawSnapRecord): string {
  return JSON.stringify({
    metaType: snap.metaType,
    gender: snap.gender ?? null,
    genderOfs: snap.genderOfs ?? null,
    group: snap.group ?? null,
    position: (snap.position ?? [0, 0, 0]).map(roundN),
    orientation: (snap.orientation ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]).map(roundN),
    slide: !!snap.slide,
    center: !!snap.center,
    caps: snap.caps ?? null,
    radius: snap.radius != null ? roundN(snap.radius) : null,
    length: snap.length != null ? roundN(snap.length) : null,
    seq: snap.seq?.map(roundN) ?? null,
    secs:
      snap.secs?.map((s) => ({ shape: s.shape, values: s.values.map(roundN) })) ?? null,
    bounding: snap.bounding
      ? { kind: snap.bounding.kind, values: snap.bounding.values.map(roundN) }
      : null,
    grid: snap.grid ?? null,
  })
}

function snapsSemanticallyEqual(a: LDrawSnapRecord, b: LDrawSnapRecord): boolean {
  return snapFingerprint(a) === snapFingerprint(b)
}

export interface OriginSnapLine {
  rawLine: string
  record: LDrawSnapRecord
}

function isGeomSnapLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('0 !LDCAD ')) return false
  const parsed = parseConnectivityFile(`${trimmed}\n`, '_line.dat')
  const record = parsed.snaps[0]
  return !!record && GEOM_SNAP_TYPES.has(String(record.metaType))
}

/** Geometry SNAP_* lines from a shadow file (in file order), with parsed records. */
export function extractOwnSnapDefs(shadowText: string): OriginSnapLine[] {
  const out: OriginSnapLine[] = []
  for (const raw of shadowText.split('\n')) {
    const trimmed = raw.trim()
    if (!trimmed.startsWith('0 !LDCAD ')) continue
    const parsed = parseConnectivityFile(`${trimmed}\n`, '_line.dat')
    const record = parsed.snaps[0]
    if (!record || !GEOM_SNAP_TYPES.has(String(record.metaType))) continue
    out.push({ rawLine: raw.replace(/\r$/, '').trimEnd(), record })
  }
  return out
}

/**
 * Preamble = everything before the first `0 !LDCAD SNAP_*` line.
 * Preserves title, author, license, history, and other comments exactly.
 */
export function extractShadowPreamble(shadowText: string): string[] {
  const lines: string[] = []
  for (const raw of shadowText.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (SNAP_META_RE.test(line.trim())) break
    lines.push(line)
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop()
  }
  return lines
}

/** Body = from the first `0 !LDCAD SNAP_*` through EOF (trimmed trailing blanks). */
export function extractShadowBody(shadowText: string): string[] {
  const all = shadowText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const start = all.findIndex((l) => SNAP_META_RE.test(l.trim()))
  if (start < 0) return []
  const body = all.slice(start)
  while (body.length > 0 && body[body.length - 1].trim() === '') body.pop()
  return body
}

const SHADOW_TITLE_RE = /^(0\s+LDCad shadow info for\s+")([^"]*)(")\s*$/i

/** Append `{unofficial}` to the title and the first HISTORY line only. */
export function applyUnofficialToPreamble(preamble: string[]): string[] {
  let titleDone = false
  let historyDone = false
  return preamble.map((line) => {
    if (!titleDone) {
      const title = SHADOW_TITLE_RE.exec(line)
      if (title) {
        titleDone = true
        return `${title[1]}${ensureUnofficialMarker(title[2])}${title[3]}`
      }
    }
    if (!historyDone && HISTORY_RE.test(line.trim())) {
      historyDone = true
      return ensureUnofficialMarker(line)
    }
    return line
  })
}

function withUnofficialPreamble(preamble: string[], isUnofficial: boolean): string[] {
  return isUnofficial ? applyUnofficialToPreamble(preamble) : preamble
}

const AUTHOR_LINE_RE = /^0\s+Author:/i

/** Replace or insert the `0 Author:` line. */
export function applyAuthorToPreamble(preamble: string[], author: string): string[] {
  const trimmed = author.trim()
  if (!trimmed) return preamble
  const authorLine = `0 Author: ${trimmed}`
  let replaced = false
  const out = preamble.map((line) => {
    if (!replaced && AUTHOR_LINE_RE.test(line.trim())) {
      replaced = true
      return authorLine
    }
    return line
  })
  if (replaced) return out
  const licenseIdx = out.findIndex((l) => /^0\s+!LICENSE\b/i.test(l.trim()))
  if (licenseIdx >= 0) {
    out.splice(licenseIdx, 0, authorLine)
    return out
  }
  out.push(authorLine)
  return out
}

/** Insert a new HISTORY line after the last existing HISTORY (or after preamble). */
export function appendHistoryToPreamble(preamble: string[], newHistory: string): string[] {
  let lastHist = -1
  for (let i = 0; i < preamble.length; i++) {
    if (HISTORY_RE.test(preamble[i].trim())) lastHist = i
  }
  const result = [...preamble]
  if (lastHist >= 0) {
    result.splice(lastHist + 1, 0, newHistory)
  } else {
    result.push('')
    result.push(newHistory)
  }
  return result
}

export type SnapWithOrigin = LDrawSourcedSnapRecord & {
  rawLine?: string
  originFingerprint?: string
  /** Stable editor id when available (for matching during inherit save). */
  id?: string
}

/**
 * Attach original SNAP line text to resolved (grid-expanded) snaps when:
 * - snap comes from this part's own shadow file
 * - the originating definition was not a multi-cell grid (1:1 line ↔ snap)
 */
export function attachOriginLines(
  partFile: string,
  shadowText: string | null | undefined,
  snaps: LDrawSourcedSnapRecord[],
): SnapWithOrigin[] {
  const normalizedPart = normalizePartFile(partFile)
  const ownDefs = shadowText ? extractOwnSnapDefs(shadowText) : []
  const claimed = new Set<number>()

  return snaps.map((snap) => {
    const base: SnapWithOrigin = {
      ...snap,
      originFingerprint: snapFingerprint(snap),
    }

    const fromOwn = normalizePartFile(snap.sourceFile) === normalizedPart
    if (!fromOwn || ownDefs.length === 0) return base

    for (let i = 0; i < ownDefs.length; i++) {
      if (claimed.has(i)) continue
      const def = ownDefs[i]
      const expanded = expandSnapWithGrid(def.record)
      if (expanded.length !== 1) continue
      if (!snapsSemanticallyEqual(expanded[0], snap)) continue
      claimed.add(i)
      return {
        ...base,
        rawLine: def.rawLine,
        originFingerprint: snapFingerprint(snap),
      }
    }
    return base
  })
}

export function emitSnapLine(snap: SnapWithOrigin): string | null {
  if (
    snap.rawLine &&
    snap.originFingerprint &&
    snapFingerprint(snap) === snap.originFingerprint
  ) {
    return snap.rawLine
  }
  return serializeSnapRecord(snap)
}

function buildFreshPreamble(
  partName: string,
  author: string,
  license: string,
  newHistory: string,
): string[] {
  return [
    `0 LDCad shadow info for "${partName}"`,
    '',
    `0 Author: ${author}`,
    `0 !LICENSE ${license}`,
    '',
    newHistory,
  ]
}

function buildFlattenContent(options: {
  partName: string
  snaps: SnapWithOrigin[]
  shadowSourceText?: string | null
  isNewShadow: boolean
  newHistory: string
  author: string
  license: string
  isUnofficial: boolean
}): string {
  const { partName, snaps, shadowSourceText, isNewShadow, newHistory, author, license, isUnofficial } =
    options
  const snapLines = snaps
    .map((s) => emitSnapLine(s))
    .filter((line): line is string => Boolean(line))

  let preamble: string[]
  if (!isNewShadow && shadowSourceText) {
    preamble = applyAuthorToPreamble(
      appendHistoryToPreamble(extractShadowPreamble(shadowSourceText), newHistory),
      author,
    )
  } else {
    preamble = buildFreshPreamble(partName, author, license, newHistory)
  }

  return [
    ...withUnofficialPreamble(preamble, isUnofficial),
    '',
    '0 !LDCAD SNAP_CLEAR',
    '',
    ...snapLines,
    '',
  ].join('\n')
}

/**
 * Keep SNAP_INCL / comments / existing structure; only rewrite own geometry SNAP lines
 * and append newly added own snaps.
 */
function buildInheritContent(options: {
  partFile: string
  partName: string
  snaps: SnapWithOrigin[]
  shadowSourceText?: string | null
  isNewShadow: boolean
  newHistory: string
  author: string
  license: string
  isUnofficial: boolean
  includes?: LDrawPartConnectivityInclude[]
}): string {
  const {
    partFile,
    partName,
    snaps,
    shadowSourceText,
    isNewShadow,
    newHistory,
    author,
    license,
    isUnofficial,
    includes = [],
  } = options

  const ownSnaps = snaps.filter((s) => isOwnSnap(s.sourceFile, partFile))
  const claimed = new Set<string>()

  const claimKey = (s: SnapWithOrigin, index: number) => s.id ?? `idx:${index}`

  const matchOwnForLine = (line: string): SnapWithOrigin | null => {
    const normalized = line.trimEnd()
    const byRaw = ownSnaps.findIndex(
      (s, i) => !claimed.has(claimKey(s, i)) && s.rawLine === normalized,
    )
    if (byRaw >= 0) {
      claimed.add(claimKey(ownSnaps[byRaw], byRaw))
      return ownSnaps[byRaw]
    }

    const parsed = parseConnectivityFile(`${normalized}\n`, '_line.dat').snaps[0]
    if (!parsed) return null
    const expanded = expandSnapWithGrid(parsed)
    if (expanded.length !== 1) return null

    const bySem = ownSnaps.findIndex(
      (s, i) => !claimed.has(claimKey(s, i)) && snapsSemanticallyEqual(expanded[0], s),
    )
    if (bySem >= 0) {
      claimed.add(claimKey(ownSnaps[bySem], bySem))
      return ownSnaps[bySem]
    }
    return null
  }

  let preamble: string[]
  let body: string[] = []

  if (!isNewShadow && shadowSourceText) {
    preamble = applyAuthorToPreamble(
      appendHistoryToPreamble(extractShadowPreamble(shadowSourceText), newHistory),
      author,
    )
    body = extractShadowBody(shadowSourceText)
  } else {
    preamble = buildFreshPreamble(partName, author, license, newHistory)
    body = []
  }

  const outBody: string[] = []
  if (isNewShadow) {
    for (const incl of includes) {
      outBody.push(serializeInclude(incl))
    }
  }
  for (const line of body) {
    if (isGeomSnapLine(line)) {
      const match = matchOwnForLine(line)
      if (!match) {
        // Own snap removed from editor — drop the line. (Inherited defs aren't in this file.)
        continue
      }
      const emitted = emitSnapLine(match)
      if (emitted) outBody.push(emitted)
      continue
    }
    outBody.push(line)
  }

  for (let i = 0; i < ownSnaps.length; i++) {
    const snap = ownSnaps[i]
    if (claimed.has(claimKey(snap, i))) continue
    const emitted = emitSnapLine(snap)
    if (emitted) outBody.push(emitted)
  }

  const parts = [...withUnofficialPreamble(preamble, isUnofficial)]
  if (outBody.length > 0) {
    parts.push('')
    parts.push(...outBody)
  }
  parts.push('')
  return parts.join('\n')
}

export function buildPreservedShadowContent(options: {
  partFile: string
  partName: string
  snaps: SnapWithOrigin[]
  shadowSourceText?: string | null
  isNewShadow: boolean
  historyNote: string
  editorName: string
  author?: string
  license?: string
  /** inherit = keep INCL; flatten = SNAP_CLEAR + all snaps */
  mode?: SaveDefinitionMode
  /** Prefill SNAP_INCL entries for a brand-new shadow (inherit mode only). */
  includes?: LDrawPartConnectivityInclude[]
  /** Geometry is `!LDRAW_ORG Unofficial_*` — tag title + first HISTORY. */
  isUnofficial?: boolean
}): string {
  const {
    partFile,
    partName,
    snaps,
    shadowSourceText,
    isNewShadow,
    historyNote,
    editorName,
    author = 'LDCad Shadow Library',
    license = 'CC BY-SA 4.0, see LICENSE.md',
    mode = 'inherit',
    includes = [],
    isUnofficial = false,
  } = options

  const today = new Date().toISOString().slice(0, 10)
  const editor = editorName.trim() || 'John Doe'
  const newHistory = `0 !HISTORY ${today} {${editor}} ${historyNote}`

  if (mode === 'flatten') {
    return buildFlattenContent({
      partName,
      snaps,
      shadowSourceText,
      isNewShadow,
      newHistory,
      author,
      license,
      isUnofficial,
    })
  }

  return buildInheritContent({
    partFile,
    partName,
    snaps,
    shadowSourceText,
    includes,
    isNewShadow,
    newHistory,
    author,
    license,
    isUnofficial,
  })
}
