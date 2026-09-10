/**
 * Prefill SNAP_INCL lines for a part that has no shadow file yet.
 *
 * Walks the LDraw type-1 tree and includes the largest file that already
 * produces snaps (library shadow or a synthesized primitive default).
 * Children of an included file are skipped — they are already resolved by
 * inheritance. Geometry-only files (box, edge, logo) are ignored.
 */

import type { LDrawPartConnectivityInclude } from '@eb/ldraw-models'
import {
  classifyFeatureFilename,
  normalizePartFile,
  parseConnectivityFile,
  type ConnectivityFileLoader,
  type GeometryFeatureKind,
} from '@eb/ldraw-parser'

const BUNDLED_PARTS_BASE_PATH = '/ldraw-parts'
const CONNECTIVITY_BASE_PATH = '/ldraw-connectivity'
const MAX_NEST_DEPTH = 100

const IDENTITY_ORI: LDrawPartConnectivityInclude['orientation'] = [1, 0, 0, 0, 1, 0, 0, 0, 1]

const TYPE1_RE =
  /^1\s+(\d+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+(.+?)\s*$/i

/** Filename kinds that have a synthesized default snap when no shadow exists. */
const DEFAULT_SNAP_KINDS = new Set<GeometryFeatureKind>([
  'maleStud',
  'beamHole',
  'pegHole',
  'axle',
  'axleHole',
  'clip',
])

type Ori9 = LDrawPartConnectivityInclude['orientation']
type Vec3 = [number, number, number]

interface Type1Ref {
  /** Original type-1 filename (kept for SNAP_INCL [ref=…]). */
  ref: string
  pos: Vec3
  ori: Ori9
}

function mulOri(a: Ori9, b: Ori9): Ori9 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ]
}

function applyOri(rot: Ori9, translation: Vec3, point: Vec3): Vec3 {
  return [
    rot[0] * point[0] + rot[1] * point[1] + rot[2] * point[2] + translation[0],
    rot[3] * point[0] + rot[4] * point[1] + rot[5] * point[2] + translation[1],
    rot[6] * point[0] + rot[7] * point[1] + rot[8] * point[2] + translation[2],
  ]
}

function extractType1Refs(content: string): Type1Ref[] {
  const refs: Type1Ref[] = []
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line[0] !== '1') continue
    const m = TYPE1_RE.exec(line)
    if (!m) continue
    const ref = m[14].trim()
    if (!ref.toLowerCase().endsWith('.dat')) continue
    refs.push({
      ref,
      pos: [parseFloat(m[2]), parseFloat(m[3]), parseFloat(m[4])],
      ori: [
        parseFloat(m[5]),
        parseFloat(m[6]),
        parseFloat(m[7]),
        parseFloat(m[8]),
        parseFloat(m[9]),
        parseFloat(m[10]),
        parseFloat(m[11]),
        parseFloat(m[12]),
        parseFloat(m[13]),
      ],
    })
  }
  return refs
}

function candidateUrls(base: string, partFile: string): string[] {
  const normalized = normalizePartFile(partFile)
  const urls = [`${base}/parts/${normalized}`, `${base}/p/${normalized}`]
  const slash = normalized.replace(/\\/g, '/')
  if (slash.includes('/')) {
    urls.push(`${base}/parts/${slash}`)
    const name = slash.split('/').pop()
    if (name) urls.push(`${base}/parts/s/${name}`)
  }
  return urls
}

async function defaultLoadPartFileContent(partFile: string): Promise<string | null> {
  for (const url of candidateUrls(BUNDLED_PARTS_BASE_PATH, partFile)) {
    try {
      const response = await fetch(url)
      if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
        return response.text()
      }
    } catch {
      /* try next */
    }
  }
  return null
}

async function defaultLoadConnectivityContent(partFile: string): Promise<string | null> {
  for (const url of candidateUrls(CONNECTIVITY_BASE_PATH, partFile)) {
    try {
      const response = await fetch(url)
      if (response.ok && !response.headers.get('content-type')?.includes('text/html')) {
        return response.text()
      }
    } catch {
      /* try next */
    }
  }
  return null
}

function hasSynthesizedDefault(partFile: string): boolean {
  const kind = classifyFeatureFilename(partFile)
  return kind != null && DEFAULT_SNAP_KINDS.has(kind)
}

async function fileProducesSnaps(
  partFile: string,
  loadConn: (f: string) => Promise<string | null>,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const key = normalizePartFile(partFile).toLowerCase()
  const cached = cache.get(key)
  if (cached != null) return cached

  const text = await loadConn(partFile)
  if (text) {
    const parsed = parseConnectivityFile(text, partFile)
    const produces = parsed.snaps.length > 0 || parsed.includes.length > 0
    cache.set(key, produces)
    return produces
  }

  const produces = hasSynthesizedDefault(partFile)
  cache.set(key, produces)
  return produces
}

function isZeroPos(pos: Vec3): boolean {
  return Math.abs(pos[0]) < 1e-9 && Math.abs(pos[1]) < 1e-9 && Math.abs(pos[2]) < 1e-9
}

function isIdentityOri(ori: Ori9): boolean {
  return ori.every((v, i) => Math.abs(v - IDENTITY_ORI[i]) < 1e-9)
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Object.is(n, -0)) return '0'
  if (Number.isInteger(n)) return String(n)
  const s = n.toFixed(6).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}

/** Serialize one SNAP_INCL line (pos/ori omitted when identity). */
export function serializeInclude(incl: LDrawPartConnectivityInclude): string {
  const parts = [`0 !LDCAD SNAP_INCL [ref=${incl.ref}]`]
  if (!isZeroPos(incl.position)) {
    parts.push(`[pos=${incl.position.map(formatNumber).join(' ')}]`)
  }
  if (!isIdentityOri(incl.orientation)) {
    parts.push(`[ori=${incl.orientation.map(formatNumber).join(' ')}]`)
  }
  if (incl.grid) parts.push(`[grid=${incl.grid}]`)
  return parts.join(' ')
}

/**
 * Collect SNAP_INCL entries for a part with no top-level shadow file.
 * Does not include the part itself.
 */
export async function collectNewShadowIncludes(
  partFile: string,
  fileLoader?: ConnectivityFileLoader,
): Promise<LDrawPartConnectivityInclude[]> {
  const loadPart = fileLoader?.loadPartFileContent ?? defaultLoadPartFileContent
  const loadConn = fileLoader?.loadConnectivityContent ?? defaultLoadConnectivityContent
  const producesCache = new Map<string, boolean>()
  const includes: LDrawPartConnectivityInclude[] = []

  const walk = async (file: string, pos: Vec3, ori: Ori9, stack: Set<string>, depth: number) => {
    if (depth > MAX_NEST_DEPTH) return
    const normalized = normalizePartFile(file).toLowerCase()
    if (stack.has(normalized)) return
    stack.add(normalized)

    const content = await loadPart(file)
    if (!content) {
      stack.delete(normalized)
      return
    }

    for (const ref of extractType1Refs(content)) {
      const childPos = applyOri(ori, pos, ref.pos)
      const childOri = mulOri(ori, ref.ori)
      if (await fileProducesSnaps(ref.ref, loadConn, producesCache)) {
        includes.push({
          ref: ref.ref,
          position: childPos,
          orientation: childOri,
        })
        continue
      }
      await walk(ref.ref, childPos, childOri, stack, depth + 1)
    }

    stack.delete(normalized)
  }

  await walk(partFile, [0, 0, 0], [...IDENTITY_ORI], new Set(), 0)
  return includes
}
