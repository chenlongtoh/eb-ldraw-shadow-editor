import { describe, expect, it } from 'vitest'
import { fallbackGeometryUrl, libraryRelCandidates } from './ldraw-library-paths'

describe('libraryRelCandidates', () => {
  it('searches parts then p for a top-level file', () => {
    expect(libraryRelCandidates('stud.dat')).toEqual(['parts/stud.dat', 'p/stud.dat'])
  })

  it('resolves s\\ subparts under parts/s', () => {
    expect(libraryRelCandidates('s\\7302s01.dat')).toEqual([
      'parts/s/7302s01.dat',
      'p/s/7302s01.dat',
      'p/7302s01.dat',
    ])
  })

  it('resolves high-res primitives under p/{folder}', () => {
    expect(libraryRelCandidates('48\\1-8cyli.dat')).toEqual([
      'parts/48/1-8cyli.dat',
      'p/48/1-8cyli.dat',
      'parts/s/1-8cyli.dat',
      'p/1-8cyli.dat',
    ])
  })
})

describe('fallbackGeometryUrl', () => {
  it('maps s/ files to parts/s and other folders to p/', () => {
    expect(fallbackGeometryUrl('s\\3003s01.dat')).toBe('/ldraw-parts/parts/s/3003s01.dat')
    expect(fallbackGeometryUrl('48/1-8cyli.dat')).toBe('/ldraw-parts/p/48/1-8cyli.dat')
    expect(fallbackGeometryUrl('3003.dat')).toBe('/ldraw-parts/parts/3003.dat')
  })
})
