import {
  normalizePartFile,
  resolvePartConnectivityForEditor,
  resolvePartGeometryFeatures,
  type ConnectivityFileLoader,
  type GeometryFeature,
} from '@eb/ldraw-parser'
import type { LDrawPartConnectivityInclude } from '@eb/ldraw-models'
import { downloadTextFile } from './download-file'
import {
  attachOriginLines,
  buildPreservedShadowContent,
  parseShadowFileHeader,
  type ShadowFileHeader,
  type SnapWithOrigin,
} from './shadow-save'
import { collectNewShadowIncludes } from './shadow-includes'
import {
  fallbackGeometryUrl,
  geometryUrlCandidates,
  shadowUrlCandidates,
} from './ldraw-library-paths'
import type { PartPrimitiveRef } from './part-children'

function normalizeInput(raw: string): string {
  let s = raw.trim().toLowerCase()
  if (!s.endsWith('.dat')) s = `${s}.dat`
  return normalizePartFile(s)
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

const fileLoader: ConnectivityFileLoader & {
  hasConnectivityFile?: (partFile: string) => Promise<boolean>
} = {
  loadPartFileContent: (partFile) => fetchFirstText(geometryUrlCandidates(partFile)),
  loadConnectivityContent: (partFile) => fetchFirstText(shadowUrlCandidates(partFile)),
  hasConnectivityFile: async (partFile) =>
    (await fetchFirstText(shadowUrlCandidates(partFile))) != null,
}

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

export async function fetchPartPrimitives(partFile: string): Promise<PartPrimitiveRef[]> {
  const normalized = normalizeInput(partFile)
  const res = await fetch(`/api/connectivity/children?part=${encodeURIComponent(normalized)}`)
  if (!res.ok) throw new Error(`Primitives failed: ${res.status}`)
  const data = (await res.json()) as { children?: PartPrimitiveRef[] }
  return data.children ?? []
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
  const [resolved, geometryFeatures, primitives] = await Promise.all([
    resolvePartConnectivityForEditor(normalized, fileLoader),
    resolvePartGeometryFeatures(normalized, fileLoader),
    fetchPartPrimitives(normalized),
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
    primitives,
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

export type SaveConnectivityResult = {
  wroteToShadowLibrary: boolean
  downloaded: boolean
  filename?: string
  shadowPath?: string
  warning?: string
}

/** Deployed/static builds have no local shadow-library write API. */
export function prefersDownloadSave(): boolean {
  return !!import.meta.env.PROD
}

/** True when a PUT response means the write API is missing (static / deployed host). */
export function isMissingWriteApi(res: {
  status: number
  headers?: { get(name: string): string | null }
}): boolean {
  if (res.status === 404 || res.status === 405 || res.status === 501) return true
  const contentType = res.headers?.get('content-type') ?? ''
  return res.status >= 400 && contentType.includes('text/html')
}

export function shadowDownloadFilename(partFile: string): string {
  const n = normalizeInput(partFile)
  return n.split(/[/\\]/).pop() ?? n
}

function downloadShadowFile(partFile: string, content: string): SaveConnectivityResult {
  const filename = shadowDownloadFilename(partFile)
  downloadTextFile(filename, content)
  return {
    wroteToShadowLibrary: false,
    downloaded: true,
    filename,
  }
}

export async function saveConnectivityFile(
  partFile: string,
  content: string,
): Promise<SaveConnectivityResult> {
  const normalized = normalizeInput(partFile)
  if (prefersDownloadSave()) {
    return downloadShadowFile(normalized, content)
  }

  const rel = `parts/${normalized}`
  try {
    const res = await fetch(`/api/connectivity/${rel}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: content,
    })
    if (res.ok) {
      const data = (await res.json()) as {
        wroteToShadowLibrary?: boolean
        shadowPath?: string
        warning?: string
      }
      return {
        wroteToShadowLibrary: data.wroteToShadowLibrary ?? true,
        downloaded: false,
        shadowPath: data.shadowPath,
        warning: data.warning,
      }
    }
    if (isMissingWriteApi(res)) {
      return downloadShadowFile(normalized, content)
    }
    const text = await res.text()
    throw new Error(`Save failed: ${res.status} ${text}`)
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Save failed:')) throw err
    return downloadShadowFile(normalized, content)
  }
}

export function partGeometryUrl(partFile: string, knownUrl?: string | null): string {
  return knownUrl || fallbackGeometryUrl(partFile)
}

export type { SnapWithOrigin, PartPrimitiveRef, ShadowFileHeader }
