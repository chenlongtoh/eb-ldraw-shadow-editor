import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectNewShadowIncludes, serializeInclude } from './shadow-includes'

const IB = path.resolve(__dirname, '../../../instruction-builder/public')
const LDRAW = path.join(IB, 'ldraw-parts')
const CONN = path.join(IB, 'ldcad-parts-connectivity')

function loadFromDisk(base: string, partFile: string): string | null {
  const slash = partFile.replace(/\\/g, '/')
  const name = slash.split('/').pop()!
  const candidates = [
    path.join(base, 'parts', slash),
    path.join(base, 'p', slash),
    path.join(base, 'parts', 's', name),
    path.join(base, 'p', name),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8')
  }
  return null
}

const diskLoader = {
  loadPartFileContent: async (f: string) => loadFromDisk(LDRAW, f),
  loadConnectivityContent: async (f: string) => loadFromDisk(CONN, f),
}

describe('serializeInclude', () => {
  it('omits identity pose', () => {
    expect(
      serializeInclude({
        ref: 's\\3003s01.dat',
        position: [0, 0, 0],
        orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
    ).toBe('0 !LDCAD SNAP_INCL [ref=s\\3003s01.dat]')
  })

  it('writes pos when offset', () => {
    expect(
      serializeInclude({
        ref: 'stud.dat',
        position: [10, 0, -10],
        orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      }),
    ).toBe('0 !LDCAD SNAP_INCL [ref=stud.dat] [pos=10 0 -10]')
  })
})

describe('collectNewShadowIncludes', () => {
  it('includes the largest subpart on 3003 and skips inner studs', async () => {
    const includes = await collectNewShadowIncludes('3003.dat', diskLoader)
    expect(includes).toHaveLength(1)
    expect(includes[0].ref.toLowerCase().replace(/\//g, '\\')).toBe('s\\3003s01.dat')
    expect(includes[0].position).toEqual([0, 0, 0])
    expect(includes.every((i) => !/stud/i.test(i.ref))).toBe(true)
  })

  it('includes leaf primitives when a group has no shadow', async () => {
    const files: Record<string, string> = {
      'unofficial.dat': [
        '0 UNOFFICIAL',
        '1 16 0 0 0 1 0 0 0 1 0 0 0 1 box5.dat',
        '1 16 -10 0 -10 1 0 0 0 1 0 0 0 1 stud.dat',
        '1 16 10 0 10 1 0 0 0 1 0 0 0 1 stud.dat',
        '',
      ].join('\n'),
      'box5.dat': '0 Box\n',
      'stud.dat': '0 Stud\n',
    }
    const conn: Record<string, string> = {
      'stud.dat': '0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4]\n',
    }
    const includes = await collectNewShadowIncludes('unofficial.dat', {
      loadPartFileContent: async (f) => files[f.replace(/\\/g, '/')] ?? files[f] ?? null,
      loadConnectivityContent: async (f) => conn[f.replace(/\\/g, '/')] ?? conn[f] ?? null,
    })
    expect(includes).toHaveLength(2)
    expect(includes.map((i) => i.ref)).toEqual(['stud.dat', 'stud.dat'])
    expect(includes[0].position).toEqual([-10, 0, -10])
    expect(includes[1].position).toEqual([10, 0, 10])
  })

  it('ignores geometry-only files', async () => {
    const includes = await collectNewShadowIncludes('empty.dat', {
      loadPartFileContent: async () => '1 16 0 0 0 1 0 0 0 1 0 0 0 1 box5.dat\n',
      loadConnectivityContent: async () => null,
    })
    expect(includes).toEqual([])
  })

  it('synthesizes an include for a classified primitive with no shadow', async () => {
    const includes = await collectNewShadowIncludes('pin.dat', {
      loadPartFileContent: async () => '1 16 0 8 0 1 0 0 0 1 0 0 0 1 peghole.dat\n',
      loadConnectivityContent: async () => null,
    })
    expect(includes).toHaveLength(1)
    expect(includes[0].ref).toBe('peghole.dat')
    expect(includes[0].position).toEqual([0, 8, 0])
  })
})
