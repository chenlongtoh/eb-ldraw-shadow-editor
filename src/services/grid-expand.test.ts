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

  it('expands and round-trips a 3D grid (18910\'s hinge pins repeat along the snap\'s Y)', () => {
    const snap = parseConnectivityFile(
      '0 !LDCAD SNAP_CYL [gender=M] [caps=two] [secs=R 4 8] [pos=-26 66 -40] [ori=0 1 0 -1 0 0 0 0 1] [grid=1 2 1 0 60 0]',
      '18910.dat',
    ).snaps[0]
    expect(expandSnapWithGrid(snap).map((s) => s.position)).toEqual([[-26, 66, -40], [34, 66, -40]])
    expect(formatGrid(parseGrid('1 2 1 0 60 0')!)).toBe('1 2 1 0 60 0')
    expect(formatGrid(parseGrid('1 C 2 1 0 46 0')!)).toBe('1 C 2 1 0 46 0')
    expect(gridSummary('1 2 1 0 60 0')).toBe('1×2×1')
  })

  it('builds a centered stud-pitch grid for plates', () => {
    expect(studAreaGrid(4, 2)).toBe('C 4 C 2 20 20')
    expect(studAreaGrid(1, 1)).toBeUndefined()
  })
})
