/**
 * SNAP_INCL lines for shadow files.
 *
 * LDCad already inherits snap data from every type-1 subfile — primitives
 * (`stud.dat`, `connhole.dat`, `48/…`), shortcuts, and subparts — by merging
 * each referenced file with its shadow. A brand-new shadow must not repeat
 * those refs as SNAP_INCL, or the same snaps are applied twice.
 *
 * SNAP_INCL stays valid in an existing shadow that includes a file the
 * geometry does not already reference. Save keeps those lines.
 */

import type { LDrawPartConnectivityInclude } from '@eb/ldraw-models'
import type { ConnectivityFileLoader } from '@eb/ldraw-parser'

const IDENTITY_ORI: LDrawPartConnectivityInclude['orientation'] = [1, 0, 0, 0, 1, 0, 0, 0, 1]

type Ori9 = LDrawPartConnectivityInclude['orientation']
type Vec3 = [number, number, number]

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
 * SNAP_INCL entries to prefill when a part has no shadow file yet.
 * Always empty: targets found in the part geometry are already inherited.
 */
export async function collectNewShadowIncludes(
  partFile: string,
  fileLoader?: ConnectivityFileLoader,
): Promise<LDrawPartConnectivityInclude[]> {
  void partFile
  void fileLoader
  return []
}
