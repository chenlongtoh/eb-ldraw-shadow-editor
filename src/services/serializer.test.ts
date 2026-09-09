import { describe, expect, it } from 'vitest'
import {
  parseConnectivityFile,
  parseShadowFileHeader,
  serializeFlattenedConnectivity,
  serializeSnapRecord,
} from '@eb/ldraw-parser'

describe('LDCad snap serializer round-trip', () => {
  it('preserves CYL fields', () => {
    const line =
      '0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=R 6 20] [pos=0 24 0] [grid=C 2 C 2 20 20]'
    const parsed = parseConnectivityFile(line, 't.dat').snaps[0]
    const again = parseConnectivityFile(serializeSnapRecord(parsed)!, 't.dat').snaps[0]
    expect(again.gender).toBe('F')
    expect(again.caps).toBe('one')
    expect(again.secs).toEqual([{ shape: 'R', values: [6, 20] }])
    expect(again.position).toEqual([0, 24, 0])
    expect(again.grid).toBe('C 2 C 2 20 20')
  })

  it('writes SNAP_CLEAR flattened file', () => {
    const snaps = parseConnectivityFile(
      '0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4]',
      'x.dat',
    ).snaps
    const text = serializeFlattenedConnectivity({
      partFile: '3003.dat',
      partName: 'Brick 2 x 2',
      snaps,
    })
    expect(text).toContain('0 !LDCAD SNAP_CLEAR')
    expect(text).toContain('0 LDCad shadow info for "Brick 2 x 2"')
    expect(parseConnectivityFile(text, '3003.dat').snaps).toHaveLength(1)
  })

  it('preserves existing history and appends a new entry', () => {
    const existing = [
      '0 LDCad shadow info for "Brick  2 x  2"',
      '',
      '0 Author: LDCad Shadow Library',
      '0 !LICENSE CC BY-SA 4.0, see LICENSE.md',
      '',
      '0 !HISTORY 2013-11-22 {Roland Melkert} Initial info for 3003.dat',
      '',
      '0 !LDCAD SNAP_CLEAR',
    ].join('\n')
    const header = parseShadowFileHeader(existing)
    expect(header.partName).toBe('Brick  2 x  2')
    expect(header.history).toEqual([
      '0 !HISTORY 2013-11-22 {Roland Melkert} Initial info for 3003.dat',
    ])

    const snaps = parseConnectivityFile(
      '0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4]',
      'x.dat',
    ).snaps
    const text = serializeFlattenedConnectivity({
      partFile: '3003.dat',
      partName: header.partName!,
      snaps,
      author: header.author ?? undefined,
      license: header.license ?? undefined,
      existingHistory: header.history,
      historyNote: 'Edited connectivity for 3003.dat',
    })
    expect(text).toContain('0 LDCad shadow info for "Brick  2 x  2"')
    expect(text).toContain('0 Author: LDCad Shadow Library')
    expect(text).toContain('0 !HISTORY 2013-11-22 {Roland Melkert} Initial info for 3003.dat')
    expect(text).toMatch(
      /0 !HISTORY \d{4}-\d{2}-\d{2} \{Part Connectivity Editor\} Edited connectivity for 3003\.dat/,
    )
    const historyLines = text.split('\n').filter((l) => l.startsWith('0 !HISTORY'))
    expect(historyLines).toHaveLength(2)
  })
})
