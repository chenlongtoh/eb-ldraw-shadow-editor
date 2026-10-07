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
  retainOwnGridSnaps,
  type ShadowFileHeader,
  type SnapWithOrigin,
} from './shadow-save'
import { collectNewShadowIncludes } from './shadow-includes'
import {
  geometryUrl as libraryGeometryUrl,
  hasGeometry,
  hasShadow,
  readGeometry,
  readShadow,
  searchLibraryParts,
} from './libraries'
import { listDirectPrimitiveFiles, type PartPrimitiveRef } from './part-children'
import { isUnofficialLdrawPart, parseLdrawPartDescription } from './part-official'
import {
  getCustomPartContent,
  getCustomPartUrl,
  registerCustomPart,
} from './custom-part-geometry'

export type PartStatus = {
  partFile: string
  geometryExists: boolean
  geometryUrl: string | null
  hasShadow: boolean
  isUnofficial: boolean
  description: string | null
}

export type LoadedPartConnectivity = {
  partFile: string
  snaps: SnapWithOrigin[]
  hadShadowFile: boolean
  geometryFeatures: GeometryFeature[]
  shadowHeader: ShadowFileHeader | null
  shadowSourceText: string | null
  partName: string | undefined
  ownIncludes: LDrawPartConnectivityInclude[]
  isUnofficial: boolean
  geometryUrl: string
  primitives: PartPrimitiveRef[]
  isCustomGeometry: boolean
}

function normalizeInput(raw: string): string {
  let s = raw.trim().toLowerCase()
  if (!s.endsWith('.dat') && !s.endsWith('.ldr')) s = `${s}.dat`
  return normalizePartFile(s)
}

const fileLoader: ConnectivityFileLoader & {
  hasConnectivityFile?: (partFile: string) => Promise<boolean>
} = {
  loadPartFileContent: async (partFile) => {
    const custom = getCustomPartContent(partFile)
    if (custom != null) return custom
    return (await readGeometry(partFile))?.text ?? null
  },
  loadConnectivityContent: (partFile) => readShadow(partFile),
  hasConnectivityFile: (partFile) => hasShadow(partFile),
}

export async function searchParts(query: string): Promise<Array<{ partFile: string; hasShadow: boolean }>> {
  return Promise.all(
    searchLibraryParts(query).map(async (partFile) => ({ partFile, hasShadow: await hasShadow(partFile) })),
  )
}

async function fetchPartStatusFromLibrary(partFile: string): Promise<PartStatus> {
  const [geometry, shadow] = await Promise.all([readGeometry(partFile), hasShadow(partFile)])
  return {
    partFile,
    geometryExists: geometry != null,
    geometryUrl: geometry?.url ?? null,
    hasShadow: shadow,
    isUnofficial: geometry ? isUnofficialLdrawPart(geometry.text) : false,
    description: geometry ? parseLdrawPartDescription(geometry.text) : null,
  }
}

async function fetchPartStatusFromCustom(partFile: string, content: string, geometryUrl: string): Promise<PartStatus> {
  return {
    partFile,
    geometryExists: true,
    geometryUrl,
    hasShadow: await hasShadow(partFile),
    isUnofficial: isUnofficialLdrawPart(content),
    description: parseLdrawPartDescription(content),
  }
}

export async function fetchPartStatus(partFile: string): Promise<PartStatus> {
  const normalized = normalizeInput(partFile)
  const customContent = getCustomPartContent(normalized)
  const customUrl = customContent ? getCustomPartUrl(normalized) : null
  if (customContent && customUrl) {
    return fetchPartStatusFromCustom(normalized, customContent, customUrl)
  }

  return fetchPartStatusFromLibrary(normalized)
}

async function primitivesFromGeometryText(content: string): Promise<PartPrimitiveRef[]> {
  const listed = listDirectPrimitiveFiles(content)
  return Promise.all(
    listed.map(async (primitive) => {
      const customChild = getCustomPartContent(primitive.loadFile)
      return {
        ...primitive,
        geometryExists: customChild != null || hasGeometry(primitive.loadFile),
        hasShadow: await hasShadow(primitive.loadFile),
      }
    }),
  )
}

export async function fetchPartPrimitives(partFile: string): Promise<PartPrimitiveRef[]> {
  const normalized = normalizeInput(partFile)
  const customContent = getCustomPartContent(normalized)
  if (customContent) return primitivesFromGeometryText(customContent)

  const geometry = await readGeometry(normalized)
  return geometry ? primitivesFromGeometryText(geometry.text) : []
}

/** Fetch raw shadow library text for a part, or null if missing / not a shadow file. */
export async function fetchShadowSourceText(partFile: string): Promise<string | null> {
  const text = await readShadow(partFile)
  if (!text) return null
  if (!text.includes('!LDCAD') && !/LDCad shadow info/i.test(text)) return null
  return text
}

export async function loadPartConnectivity(
  partFile: string,
  options?: { customContent?: string },
): Promise<LoadedPartConnectivity> {
  const normalized = normalizeInput(partFile)
  if (options?.customContent != null) {
    registerCustomPart(normalized, options.customContent)
  }
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
  const snaps = attachOriginLines(
    normalized,
    shadowSourceText,
    retainOwnGridSnaps(normalized, shadowSourceText, resolved.snaps),
  )
  const ownIncludes = hadShadowFile
    ? []
    : await collectNewShadowIncludes(normalized, fileLoader)
  const isCustomGeometry = getCustomPartContent(normalized) != null
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
    geometryUrl: status.geometryUrl ?? libraryGeometryUrl(normalized) ?? '',
    primitives,
    isCustomGeometry,
  }
}

export async function loadCustomPartFile(file: { name: string; text: () => Promise<string> }): Promise<LoadedPartConnectivity> {
  const name = file.name.trim()
  if (!/\.(dat|ldr)$/i.test(name)) {
    throw new Error('Please choose an LDraw .dat (or .ldr) file')
  }
  const content = (await file.text()).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  if (!content.trim()) {
    throw new Error('The uploaded file is empty')
  }
  return loadPartConnectivity(name, { customContent: content })
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
  return knownUrl || libraryGeometryUrl(partFile) || ''
}

export type { SnapWithOrigin, PartPrimitiveRef, ShadowFileHeader }
