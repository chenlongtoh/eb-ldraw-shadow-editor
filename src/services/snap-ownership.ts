import { normalizePartFile } from '@eb/ldraw-parser'

const EDITOR_SOURCES = new Set(['(editor)', '(paste)', '(pending)'])

/** Snap defined on this part's shadow (or created in the editor), not via SNAP_INCL. */
export function isOwnSnap(sourceFile: string, partFile: string): boolean {
  if (EDITOR_SOURCES.has(sourceFile)) return true
  return normalizePartFile(sourceFile) === normalizePartFile(partFile)
}

export function isInheritedSnap(sourceFile: string, partFile: string): boolean {
  return !isOwnSnap(sourceFile, partFile)
}
