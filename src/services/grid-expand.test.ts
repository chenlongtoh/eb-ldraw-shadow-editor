import { describe, expect, it } from 'vitest'
import { expandSnapWithGrid, parseConnectivityFile, parseGrid } from '@eb/ldraw-parser'
import { formatGrid, gridSummary, studAreaGrid } from './snap-grid'

describe('expandSnapWithGrid', () => {
  it('expands a 2x2 centered grid into 4 snaps', () => {
    const snap = parseConnectivityFile(
      '0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=R 6 20] [pos=0 24 0] [grid=C 2 C 2 20 20]',
      't.dat',
    ).snaps[0]
    const expanded = expandSnapWithGrid(snap)
    expect(expanded).toHaveLength(4)
    expect(expanded.every((s) => s.grid === undefined)).toBe(true)
    const xs = expanded.map((s) => s.position[0]).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(-10)
    expect(xs[3]).toBeCloseTo(10)
  })

  it('round-trips a centered X/Z grid string', () => {
    expect(formatGrid(parseGrid('C 2 C 2 20 20')!)).toBe('C 2 C 2 20 20')
    expect(gridSummary('C 2 C 2 20 20')).toBe('2×2')
  })

  it('builds a centered stud-pitch grid for plates', () => {
    expect(studAreaGrid(4, 2)).toBe('C 4 C 2 20 20')
    expect(studAreaGrid(1, 1)).toBeUndefined()
  })
})
