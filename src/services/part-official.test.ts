import { describe, expect, it } from 'vitest'
import {
  ensureUnofficialMarker,
  hasUnofficialMarker,
  isUnofficialLdrawPart,
  parseLdrawOrgQualifier,
  parseLdrawPartDescription,
} from './part-official'

describe('part-official', () => {
  it('detects Unofficial_* !LDRAW_ORG', () => {
    const text = [
      '0 Tile  1 x  2 Cut Right 45 Degree',
      '0 Name: 5091.dat',
      '0 Author: Gerald Lasser [GeraldLasser]',
      '0 !LDRAW_ORG Unofficial_Part',
    ].join('\n')
    expect(parseLdrawOrgQualifier(text)).toBe('Unofficial_Part')
    expect(isUnofficialLdrawPart(text)).toBe(true)
    expect(parseLdrawPartDescription(text)).toBe('Tile  1 x  2 Cut Right 45 Degree')
  })

  it('treats official Part UPDATE as official', () => {
    const text = [
      '0 Brick  2 x  2',
      '0 Name: 3003.dat',
      '0 !LDRAW_ORG Part UPDATE 2022-05',
    ].join('\n')
    expect(isUnofficialLdrawPart(text)).toBe(false)
    expect(parseLdrawPartDescription(text)).toBe('Brick  2 x  2')
  })

  it('skips 0 FILE before the description', () => {
    const text = [
      '0 FILE bl_973.dat',
      '0 Torso with Pattern',
      '0 Name:  bl_973.dat',
    ].join('\n')
    expect(parseLdrawPartDescription(text)).toBe('Torso with Pattern')
    expect(isUnofficialLdrawPart(text)).toBe(false)
  })

  it('does not double-append {unofficial}', () => {
    expect(hasUnofficialMarker('Tile {unofficial}')).toBe(true)
    expect(ensureUnofficialMarker('Tile')).toBe('Tile {unofficial}')
    expect(ensureUnofficialMarker('Tile {unofficial}')).toBe('Tile {unofficial}')
    expect(ensureUnofficialMarker('0 !HISTORY 2026-01-01 {Ed} Initial info for x.dat')).toBe(
      '0 !HISTORY 2026-01-01 {Ed} Initial info for x.dat {unofficial}',
    )
  })
})
