import { parseGrid, type ParsedGrid } from '@eb/ldraw-parser'

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (Object.is(n, -0)) return '0'
  if (Number.isInteger(n)) return String(n)
  const s = n.toFixed(6).replace(/\.?0+$/, '')
  return s === '-0' ? '0' : s
}

function formatCount(centered: boolean, count: number): string {
  return centered ? `C ${count}` : String(count)
}

/**
 * LDCad `[grid=…]` value: `[C] Xcnt [C] Zcnt Xstep Zstep`, or the 3D form
 * `[C] Xcnt [C] Ycnt [C] Zcnt Xstep Ystep Zstep` when the grid repeats along Y.
 */
export function formatGrid(grid: ParsedGrid): string {
  if ((grid.yCount ?? 1) > 1) {
    return [
      formatCount(grid.xCentered, grid.xCount),
      formatCount(grid.yCentered ?? false, grid.yCount ?? 1),
      formatCount(grid.zCentered, grid.zCount),
      formatNumber(grid.xStep),
      formatNumber(grid.yStep ?? 0),
      formatNumber(grid.zStep),
    ].join(' ')
  }
  return [
    formatCount(grid.xCentered, grid.xCount),
    formatCount(grid.zCentered, grid.zCount),
    formatNumber(grid.xStep),
    formatNumber(grid.zStep),
  ].join(' ')
}

/** One LEGO stud, in LDraw units. */
export const STUD_PITCH_LDU = 20

const STUD_GRID_TEMPLATE_IDS = new Set(['male-stud', 'anti-stud-square', 'anti-stud-round'])

export function isStudGridTemplate(templateId: string): boolean {
  return STUD_GRID_TEMPLATE_IDS.has(templateId)
}

/**
 * Centered stud grid for a male stud or anti-stud (`C x C z 20 20`).
 * A 1×1 size is a single snap and returns no grid string.
 */
export function studAreaGrid(xStuds: number, zStuds: number): string | undefined {
  const xCount = Math.max(1, Math.round(xStuds) || 1)
  const zCount = Math.max(1, Math.round(zStuds) || 1)
  if (xCount === 1 && zCount === 1) return undefined
  return formatGrid({
    xCount,
    zCount,
    xStep: STUD_PITCH_LDU,
    zStep: STUD_PITCH_LDU,
    xCentered: true,
    zCentered: true,
  })
}

export function defaultGrid(): ParsedGrid {
  return {
    xCount: 2,
    zCount: 2,
    xStep: 20,
    zStep: 20,
    xCentered: true,
    zCentered: true,
  }
}

/** Short label such as `2×2`. Null when the grid does not repeat. */
export function gridSummary(grid: string | undefined): string | null {
  if (!grid) return null
  const parsed = parseGrid(grid)
  if (!parsed) return 'grid'
  const { xCount, zCount, yCount = 1 } = parsed
  if (xCount === 1 && yCount === 1 && zCount === 1) return null
  return yCount > 1 ? `${xCount}×${yCount}×${zCount}` : `${xCount}×${zCount}`
}
