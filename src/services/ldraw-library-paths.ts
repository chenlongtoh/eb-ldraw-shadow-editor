import { normalizePartFile } from '@eb/ldraw-parser'

/**
 * Candidate paths under an LDraw or LDCad shadow library root.
 * Order: official parts, primitives (`p/`), then `s/` / basename fallbacks.
 */
export function libraryRelCandidates(partFile: string): string[] {
  const n = normalizePartFile(partFile).replace(/\\/g, '/').toLowerCase()
  const name = n.split('/').pop() ?? n
  const cands = [`parts/${n}`, `p/${n}`]
  if (n.includes('/')) {
    cands.push(`parts/s/${name}`, `p/${name}`)
  }
  return [...new Set(cands)]
}

export function geometryUrlCandidates(partFile: string): string[] {
  return libraryRelCandidates(partFile).map((rel) => `/ldraw-parts/${rel}`)
}

export function shadowUrlCandidates(partFile: string): string[] {
  return libraryRelCandidates(partFile).map((rel) => `/ldraw-connectivity/${rel}`)
}

/** Best-effort geometry URL when the status probe is unavailable. */
export function fallbackGeometryUrl(partFile: string): string {
  const n = normalizePartFile(partFile).replace(/\\/g, '/').toLowerCase()
  if (n.startsWith('s/')) return `/ldraw-parts/parts/${n}`
  if (n.includes('/')) return `/ldraw-parts/p/${n}`
  return `/ldraw-parts/parts/${n}`
}
