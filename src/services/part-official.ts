/** LDraw Parts Tracker / unofficial qualifier on `0 !LDRAW_ORG`. */
const LDRAW_ORG_RE = /^0\s+!LDRAW_ORG\s+(\S+)/i
const FILE_META_RE = /^0\s+FILE\b/i
const NAME_META_RE = /^0\s+Name:/i
const AUTHOR_META_RE = /^0\s+Author:/i
const META_CMD_RE = /^0\s+!/

export const UNOFFICIAL_MARKER = '{unofficial}'

export function parseLdrawOrgQualifier(geometryText: string): string | null {
  for (const raw of geometryText.split(/\r?\n/)) {
    const match = LDRAW_ORG_RE.exec(raw.trim())
    if (match) return match[1]
  }
  return null
}

/** True when the geometry header is `!LDRAW_ORG Unofficial_*`. */
export function isUnofficialLdrawPart(geometryText: string): boolean {
  const qualifier = parseLdrawOrgQualifier(geometryText)
  return !!qualifier && /^unofficial/i.test(qualifier)
}

/** First description line of an LDraw part (skips optional `0 FILE`). */
export function parseLdrawPartDescription(geometryText: string): string | null {
  for (const raw of geometryText.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (FILE_META_RE.test(line)) continue
    if (!line.startsWith('0')) break
    if (META_CMD_RE.test(line) || NAME_META_RE.test(line) || AUTHOR_META_RE.test(line)) break
    const description = line.replace(/^0\s+/, '').trim()
    return description || null
  }
  return null
}

export function hasUnofficialMarker(text: string): boolean {
  return /\{unofficial\}\s*$/i.test(text.trimEnd())
}

export function ensureUnofficialMarker(text: string): string {
  const trimmed = text.trimEnd()
  if (hasUnofficialMarker(trimmed)) return trimmed
  return `${trimmed} ${UNOFFICIAL_MARKER}`
}
