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
  normalizeLibraryKey,
  normalizePartFile,
  PART_LIBRARY_FORMAT_VERSION,
  type PartLibrary,
  type PartLibraryIndex,
  type PartLibraryPointer,
} from '@eb/ldraw-parser'
import { libraryRelCandidates } from './ldraw-library-paths'

const DEFAULT_CDN_ORIGIN = 'https://d153vhmiaugp9b.cloudfront.net'

/** Our own parts (and their shadows) live in this folder of both libraries, looked up by id like parts/. */
export const CUSTOM_PARTS_FOLDER = 'custom_parts'

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

/** True when the part's geometry is one of ours (ldraw-parts custom_parts/), so its shadow belongs in custom_parts/ too. */
export function isCustomLibraryPart(partFile: string): boolean {
  const custom = parts?.index.folders[CUSTOM_PARTS_FOLDER]
  if (!custom) return false
  const name = resolveGeometryName(partFile)
  return !!name && Object.prototype.hasOwnProperty.call(custom, normalizeLibraryKey(name))
}

function libraryFileName(partFile: string): string {
  return normalizePartFile(partFile).replace(/\\/g, '/').toLowerCase()
}

const STUDIO_PREFIX = 'studio:'

/** A Studio part from the library's studio/ overlay (`studio:<id>`), kept apart from the LDraw part of the same id. */
export function isStudioPart(partFile: string): boolean {
  return libraryFileName(partFile).startsWith(STUDIO_PREFIX)
}

/**
 * Where a studio:<id> part lives in the libraries (`studio/parts/…` or `studio/p/…`),
 * taken from the part library so its shadow mirrors the geometry's location.
 */
function studioRelPath(partFile: string): string {
  const key = libraryFileName(partFile)
  const url = parts?.library.resolve(key)
  const published = url ? /\/objects\/[^/]+\/(studio\/.+)$/.exec(decodeURI(url))?.[1] : null
  return published ?? `studio/parts/${key.slice(STUDIO_PREFIX.length)}`
}

/** Library-relative path a shadow file for this part is saved under. */
export function shadowSavePath(partFile: string): string {
  if (isStudioPart(partFile)) return studioRelPath(partFile)
  const folder = isCustomLibraryPart(partFile) ? CUSTOM_PARTS_FOLDER : 'parts'
  return `${folder}/${libraryFileName(partFile)}`
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
  const local = isStudioPart(partFile)
    ? [studioRelPath(partFile)]
    : [...libraryRelCandidates(partFile), `${CUSTOM_PARTS_FOLDER}/${libraryFileName(partFile)}`]
  for (const rel of local) {
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

/** Top-level library parts (and studio:<id> parts) whose name contains `query`, sorted. */
export function searchLibraryParts(query: string, limit = 40): string[] {
  const q = query.trim().toLowerCase()
  if (!q || !parts) return []
  const results: string[] = []
  for (const folder of ['parts', CUSTOM_PARTS_FOLDER, 'studio']) {
    for (const key of Object.keys(parts.index.folders[folder] ?? {})) {
      const name = key.startsWith(STUDIO_PREFIX) ? key.slice(STUDIO_PREFIX.length) : folder === 'studio' ? null : key
      if (!name || !key.endsWith('.dat') || name.includes('/') || !key.includes(q)) continue
      results.push(key)
    }
  }
  return [...new Set(results)].sort().slice(0, limit)
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}
