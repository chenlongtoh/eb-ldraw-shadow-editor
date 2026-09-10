import {
  normalizePartFile,
  parseShadowFileHeader,
  resolvePartConnectivityForEditor,
  resolvePartGeometryFeatures,
  type ConnectivityFileLoader,
  type GeometryFeature,
  type ShadowFileHeader,
  type SerializeFlattenedOptions,
} from '@eb/ldraw-parser'
import type { LDrawPartConnectivityInclude } from '@eb/ldraw-models'
import { attachOriginLines, buildPreservedShadowContent, type SnapWithOrigin } from './shadow-save'
import { collectNewShadowIncludes } from './shadow-includes'
import {
  fallbackGeometryUrl,
  geometryUrlCandidates,
  shadowUrlCandidates,
} from './ldraw-library-paths'
import type { PartChildRef } from './part-children'

function normalizeInput(raw: string): string {
  let s = raw.trim().toLowerCase()
  if (!s.endsWith('.dat')) s = `${s}.dat`
  return normalizePartFile(s)
}

const fileLoader: ConnectivityFileLoader = {}

export async function searchParts(query: string): Promise<Array<{ partFile: string; hasShadow: boolean }>> {
  const q = query.trim()
  if (!q) return []
  const res = await fetch(`/api/connectivity/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error(`Search failed: ${res.status}`)
  const data = (await res.json()) as { results: Array<{ partFile: string; hasShadow: boolean }> }
  return data.results
}

export async function fetchPartStatus(partFile: string): Promise<{
  partFile: string
  geometryExists: boolean
  geometryUrl: string | null
  hasShadow: boolean
  isUnofficial: boolean
  description: string | null
}> {
  const normalized = normalizeInput(partFile)
  const res = await fetch(`/api/connectivity/status?part=${encodeURIComponent(normalized)}`)
  if (!res.ok) throw new Error(`Status failed: ${res.status}`)
  const data = (await res.json()) as {
    partFile: string
    geometryExists: boolean
    geometryUrl?: string | null
    hasShadow: boolean
    isUnofficial?: boolean
    description?: string | null
  }
  return {
    partFile: data.partFile,
    geometryExists: data.geometryExists,
    geometryUrl: data.geometryUrl ?? null,
    hasShadow: data.hasShadow,
    isUnofficial: !!data.isUnofficial,
    description: data.description ?? null,
  }
}

export async function fetchPartChildren(partFile: string): Promise<PartChildRef[]> {
  const normalized = normalizeInput(partFile)
  const res = await fetch(`/api/connectivity/children?part=${encodeURIComponent(normalized)}`)
  if (!res.ok) throw new Error(`Children failed: ${res.status}`)
  const data = (await res.json()) as { children?: PartChildRef[] }
  return data.children ?? []
}

async function fetchFirstText(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url)
      if (!res.ok || res.headers.get('content-type')?.includes('text/html')) continue
      return (await res.text()).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    } catch {
      /* try next */
    }
  }
  return null
}

/** Fetch raw shadow library text for a part, or null if missing / not a shadow file. */
export async function fetchShadowSourceText(partFile: string): Promise<string | null> {
  const text = await fetchFirstText(shadowUrlCandidates(partFile))
  if (!text) return null
  if (!text.includes('!LDCAD') && !/LDCad shadow info/i.test(text)) return null
  return text
}

export async function loadPartConnectivity(partFile: string) {
  const normalized = normalizeInput(partFile)
  const status = await fetchPartStatus(normalized)
  if (!status.geometryExists) {
    throw new Error(`Part geometry not found: ${normalized}`)
  }
  const [resolved, geometryFeatures, children] = await Promise.all([
    resolvePartConnectivityForEditor(normalized, fileLoader),
    resolvePartGeometryFeatures(normalized, fileLoader),
    fetchPartChildren(normalized),
  ])
  const hadShadowFile = resolved.hadShadowFile || status.hasShadow
  const shadowSourceText = hadShadowFile ? await fetchShadowSourceText(normalized) : null
  const shadowHeader = shadowSourceText ? parseShadowFileHeader(shadowSourceText) : null
  const snaps = attachOriginLines(normalized, shadowSourceText, resolved.snaps)
  const ownIncludes = hadShadowFile
    ? []
    : await collectNewShadowIncludes(normalized, fileLoader)
  return {
    partFile: normalized,
    snaps,
    hadShadowFile,
    geometryFeatures,
    shadowHeader,
    shadowSourceText,
    partName: shadowHeader?.partName ?? status.description ?? undefined,
    ownIncludes,
    isUnofficial: !!status.isUnofficial,
    geometryUrl: status.geometryUrl ?? geometryUrlCandidates(normalized)[0] ?? fallbackGeometryUrl(normalized),
    children,
  }
}

export async function loadPartGeometryFeatures(partFile: string): Promise<GeometryFeature[]> {
  const normalized = normalizeInput(partFile)
  return resolvePartGeometryFeatures(normalized, fileLoader)
}

export function buildSaveContent(options: {
  partFile: string
  partName: string
  snaps: SnapWithOrigin[]
  shadowHeader?: ShadowFileHeader | null
  shadowSourceText?: string | null
  isNewShadow: boolean
  historyNote: string
  editorName: string
  author?: string
  mode?: 'inherit' | 'flatten'
  includes?: LDrawPartConnectivityInclude[]
  isUnofficial?: boolean
}): string {
  const {
    partFile,
    partName,
    snaps,
    shadowHeader,
    shadowSourceText,
    isNewShadow,
    historyNote,
    editorName,
    author,
    mode = 'inherit',
    includes = [],
    isUnofficial = false,
  } = options
  return buildPreservedShadowContent({
    partFile,
    partName,
    snaps,
    shadowSourceText,
    isNewShadow,
    historyNote,
    editorName,
    author: author?.trim() || shadowHeader?.author || 'LDCad Shadow Library',
    license: shadowHeader?.license ?? 'CC BY-SA 4.0, see LICENSE.md',
    mode,
    includes,
    isUnofficial,
  })
}

export async function saveConnectivityFile(partFile: string, content: string): Promise<{
  wroteToShadowLibrary: boolean
  shadowPath?: string
  warning?: string
}> {
  const normalized = normalizeInput(partFile)
  const rel = `parts/${normalized}`
  const res = await fetch(`/api/connectivity/${rel}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: content,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Save failed: ${res.status} ${text}`)
  }
  return res.json()
}

export function partGeometryUrl(partFile: string, knownUrl?: string | null): string {
  return knownUrl || fallbackGeometryUrl(partFile)
}

export type { SerializeFlattenedOptions, SnapWithOrigin, PartChildRef }
