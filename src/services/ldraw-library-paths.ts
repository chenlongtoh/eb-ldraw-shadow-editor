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
