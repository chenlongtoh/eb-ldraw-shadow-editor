import { describe, expect, it } from 'vitest'
import {
  parseConnectivityFile,
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
    expect(parseConnectivityFile(text, '3003.dat').snaps).toHaveLength(1)
  })
})
