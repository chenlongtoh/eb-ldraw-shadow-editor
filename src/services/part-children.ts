import { normalizePartFile } from '@eb/ldraw-parser'

const TYPE1_RE =
  /^1\s+(\d+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+(.+?)\s*$/i

export type DirectChildFile = {
  /** Original type-1 filename as written in the DAT (e.g. `s\3003s01.dat`). */
  displayName: string
  /** Normalized load key (`s/3003s01.dat`). */
  loadFile: string
  count: number
}

/** Unique direct type-1 children of a DAT, in first-seen order. No grandchildren. */
export function listDirectChildFiles(content: string): DirectChildFile[] {
  const byKey = new Map<string, DirectChildFile>()
  const order: string[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line[0] !== '1') continue
    const m = TYPE1_RE.exec(line)
    if (!m) continue
    const displayName = m[14].trim()
    if (!displayName.toLowerCase().endsWith('.dat')) continue
    const loadFile = normalizePartFile(displayName).toLowerCase()
    const existing = byKey.get(loadFile)
    if (existing) {
      existing.count += 1
      continue
    }
    byKey.set(loadFile, { displayName, loadFile, count: 1 })
    order.push(loadFile)
  }
  return order.map((key) => byKey.get(key)!).filter(Boolean)
}

export type PartChildRef = DirectChildFile & {
  hasShadow: boolean
  geometryExists: boolean
}
