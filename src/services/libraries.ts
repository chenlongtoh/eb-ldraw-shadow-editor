/**
 * Where the editor reads LDraw geometry and LDCad connectivity from.
 *
 * Geometry always comes from the part library CDN (published by the ldraw-parts
 * repo): names resolve through its index, so a file costs one request and a
 * missing one costs none.
 *
 * Connectivity is what this tool edits, so in `npm run dev` it is read from the
 * local LDCadShadowLibrary checkout the save API writes into (served at
 * `/ldraw-connectivity` by vite.config.ts) — a save shows up on the next load,
 * and is published by committing and pushing that repo. Deployed builds cannot
 * write, so they read the published connectivity library from the CDN.
 */
import {
  configurePartLibraries,
  createPartLibrary,
  PART_LIBRARY_FORMAT_VERSION,
  type PartLibrary,
  type PartLibraryIndex,
  type PartLibraryPointer,
} from '@eb/ldraw-parser'
import { libraryRelCandidates } from './ldraw-library-paths'

const DEFAULT_CDN_ORIGIN = 'https://d153vhmiaugp9b.cloudfront.net'

/** True when connectivity is read from (and saved to) the local checkout. */
export function usesLocalConnectivity(): boolean {
  return !!import.meta.env.DEV
}

function baseUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, '')
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Library request failed (${response.status}): ${url}`)
  return (await response.json()) as T
}

interface LoadedLibrary {
  library: PartLibrary
  index: PartLibraryIndex
}

async function loadLibrary(url: string): Promise<LoadedLibrary> {
  const pointer = await getJson<PartLibraryPointer>(`${url}/latest.json`)
  if (pointer.formatVersion !== PART_LIBRARY_FORMAT_VERSION) {
    throw new Error(`Unsupported library format ${pointer.formatVersion} at ${url}`)
  }
  const index = await getJson<PartLibraryIndex>(`${url}/index/${encodeURIComponent(pointer.version)}.json`)
  return { library: createPartLibrary(index, { baseUrl: url }), index }
}

let parts: LoadedLibrary | null = null
let connectivity: PartLibrary | null = null
let loading: Promise<void> | null = null

/** Load the libraries once; call before the first part loads. */
export function initLibraries(): Promise<void> {
  loading ??= (async () => {
    const partsUrl = baseUrl(import.meta.env.VITE_LDRAW_PARTS_URL, `${DEFAULT_CDN_ORIGIN}/ldraw`)
    const connectivityUrl = baseUrl(import.meta.env.VITE_LDCAD_CONNECTIVITY_URL, `${DEFAULT_CDN_ORIGIN}/ldcad`)
    const [loadedParts, loadedConnectivity] = await Promise.all([
      loadLibrary(partsUrl),
      usesLocalConnectivity() ? Promise.resolve(null) : loadLibrary(connectivityUrl),
    ])
    parts = loadedParts
    connectivity = loadedConnectivity?.library ?? null
    configurePartLibraries({ parts: parts.library, connectivity })
  })().catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}

/** Install libraries directly (tests). */
export function setLibrariesForTests(next: {
  parts: { library: PartLibrary; index: PartLibraryIndex } | null
  connectivity?: PartLibrary | null
}): void {
  parts = next.parts
  connectivity = next.connectivity ?? null
  loading = next.parts ? Promise.resolve() : null
  configurePartLibraries({ parts: parts?.library ?? null, connectivity })
}

function partLibrary(): PartLibrary {
  if (!parts) throw new Error('Part library is not loaded yet.')
  return parts.library
}

/** Library entry for a part, trying `s/` and `p/` fallbacks the way type-1 refs are written. */
function resolveGeometryName(partFile: string): string | null {
  const library = partLibrary()
  return libraryRelCandidates(partFile).find((rel) => library.has(rel)) ?? null
}

export function geometryUrl(partFile: string): string | null {
  const name = resolveGeometryName(partFile)
  return name ? partLibrary().resolve(name) : null
}

export function hasGeometry(partFile: string): boolean {
  return resolveGeometryName(partFile) != null
}

export async function readGeometry(partFile: string): Promise<{ url: string; text: string } | null> {
  const name = resolveGeometryName(partFile)
  if (!name) return null
  const text = await partLibrary().fetchText(name)
  const url = partLibrary().resolve(name)
  return text != null && url ? { url, text: normalizeNewlines(text) } : null
}

/** Shadow (connectivity) file text, or null when the part has none. */
export async function readShadow(partFile: string): Promise<string | null> {
  if (connectivity) {
    const name = libraryRelCandidates(partFile).find((rel) => connectivity?.has(rel))
    const text = name ? await connectivity.fetchText(name) : null
    return text != null ? normalizeNewlines(text) : null
  }
  if (!usesLocalConnectivity()) return null
  for (const rel of libraryRelCandidates(partFile)) {
    try {
      const response = await fetch(`/ldraw-connectivity/${rel}`)
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) continue
      return normalizeNewlines(await response.text())
    } catch {
      // try the next candidate
    }
  }
  return null
}

export async function hasShadow(partFile: string): Promise<boolean> {
  if (connectivity) return libraryRelCandidates(partFile).some((rel) => connectivity?.has(rel))
  return (await readShadow(partFile)) != null
}

/** Top-level library parts whose filename contains `query`, sorted. */
export function searchLibraryParts(query: string, limit = 40): string[] {
  const q = query.trim().toLowerCase()
  if (!q || !parts) return []
  const results: string[] = []
  for (const key of Object.keys(parts.index.folders.parts ?? {})) {
    if (!key.endsWith('.dat') || key.includes('/') || !key.includes(q)) continue
    results.push(key)
  }
  return results.sort().slice(0, limit)
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}
