import { PartRegistry } from '@eb/ldraw-three-core'
import { normalizePartFile } from '@eb/ldraw-parser'

const registry = new PartRegistry()
const sources: Record<string, string> = {}

function dataUrlFor(content: string): string {
  return `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`
}

/** Shared with the Three.js loader so uploaded .dat files resolve as subobjects too. */
export function getCustomPartRegistry(): PartRegistry {
  return registry
}

export function getCustomPartContent(partFile: string): string | null {
  return registry.getSource(partFile)
}

export function getCustomPartUrl(partFile: string): string | null {
  if (!registry.has(partFile)) return null
  try {
    return registry.getUrl(partFile)
  } catch {
    const content = registry.getSource(partFile)
    return content != null ? dataUrlFor(content) : null
  }
}

export function registerCustomPart(partFile: string, content: string): string {
  const key = normalizePartFile(partFile)
  sources[key] = content
  registry.register({ ...sources })
  return getCustomPartUrl(key) ?? dataUrlFor(content)
}

/** Test helper. */
export function resetCustomParts(): void {
  for (const key of Object.keys(sources)) delete sources[key]
  registry.reset()
}
