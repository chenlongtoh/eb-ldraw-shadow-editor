import {
  normalizePartFile,
  parseShadowFileHeader,
  resolvePartConnectivityForEditor,
  resolvePartGeometryFeatures,
  serializeFlattenedConnectivity,
  type ConnectivityFileLoader,
  type GeometryFeature,
  type ShadowFileHeader,
  type SerializeFlattenedOptions,
} from '@eb/ldraw-parser'

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
  hasShadow: boolean
}> {
  const normalized = normalizeInput(partFile)
  const res = await fetch(`/api/connectivity/status?part=${encodeURIComponent(normalized)}`)
  if (!res.ok) throw new Error(`Status failed: ${res.status}`)
  return res.json()
}

async function fetchShadowHeader(partFile: string): Promise<ShadowFileHeader | null> {
  try {
    const res = await fetch(`/ldcad-parts-connectivity/parts/${partFile}`)
    if (!res.ok || res.headers.get('content-type')?.includes('text/html')) return null
    const text = await res.text()
    if (!text.includes('!LDCAD') && !/LDCad shadow info/i.test(text)) return null
    return parseShadowFileHeader(text)
  } catch {
    return null
  }
}

export async function loadPartConnectivity(partFile: string) {
  const normalized = normalizeInput(partFile)
  const status = await fetchPartStatus(normalized)
  if (!status.geometryExists) {
    throw new Error(`Part geometry not found: ${normalized}`)
  }
  const [resolved, geometryFeatures] = await Promise.all([
    resolvePartConnectivityForEditor(normalized, fileLoader),
    resolvePartGeometryFeatures(normalized, fileLoader),
  ])
  const hadShadowFile = resolved.hadShadowFile || status.hasShadow
  const shadowHeader = hadShadowFile ? await fetchShadowHeader(normalized) : null
  return {
    partFile: normalized,
    snaps: resolved.snaps,
    hadShadowFile,
    geometryFeatures,
    shadowHeader,
    partName: shadowHeader?.partName ?? undefined,
  }
}

export async function loadPartGeometryFeatures(partFile: string): Promise<GeometryFeature[]> {
  const normalized = normalizeInput(partFile)
  return resolvePartGeometryFeatures(normalized, fileLoader)
}

export function buildSaveContent(options: {
  partFile: string
  partName: string
  snaps: SerializeFlattenedOptions['snaps']
  shadowHeader?: ShadowFileHeader | null
  isNewShadow: boolean
}): string {
  const { partFile, partName, snaps, shadowHeader, isNewShadow } = options
  return serializeFlattenedConnectivity({
    partFile,
    partName,
    snaps,
    author: shadowHeader?.author ?? 'Part Connectivity Editor',
    license: shadowHeader?.license ?? 'CC BY-SA 4.0, see LICENSE.md',
    existingHistory: shadowHeader?.history ?? [],
    historyNote: isNewShadow
      ? `Initial connectivity for ${partFile}`
      : `Edited connectivity for ${partFile}`,
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

export function partGeometryUrl(partFile: string): string {
  return `/ldraw-parts/parts/${normalizeInput(partFile)}`
}
