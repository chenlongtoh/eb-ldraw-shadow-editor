import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { collectNewShadowIncludes, isAutoInheritedPrimitive, serializeInclude } from './shadow-includes'

const LDRAW = path.resolve(__dirname, '../../public/ldraw-parts')
const CONN = path.resolve(__dirname, '../../public/ldraw-connectivity')

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

describe('isAutoInheritedPrimitive', () => {
  it('treats studs and high-res primitives as auto-inherited', () => {
    expect(isAutoInheritedPrimitive('stud.dat')).toBe(true)
    expect(isAutoInheritedPrimitive('peghole.dat')).toBe(true)
    expect(isAutoInheritedPrimitive('48\\stud.dat')).toBe(true)
  })

  it('does not treat subparts or numbered parts as primitives', () => {
    expect(isAutoInheritedPrimitive('s\\3003s01.dat')).toBe(false)
    expect(isAutoInheritedPrimitive('3003.dat')).toBe(false)
    expect(isAutoInheritedPrimitive('60483a.dat')).toBe(false)
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

  it('does not SNAP_INCL leaf primitives (already inherited from geometry)', async () => {
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
    expect(includes).toEqual([])
  })

  it('ignores geometry-only files', async () => {
    const includes = await collectNewShadowIncludes('empty.dat', {
      loadPartFileContent: async () => '1 16 0 0 0 1 0 0 0 1 0 0 0 1 box5.dat\n',
      loadConnectivityContent: async () => null,
    })
    expect(includes).toEqual([])
  })

  it('does not SNAP_INCL classified primitives with synthesized defaults', async () => {
    const includes = await collectNewShadowIncludes('pin.dat', {
      loadPartFileContent: async () => '1 16 0 8 0 1 0 0 0 1 0 0 0 1 peghole.dat\n',
      loadConnectivityContent: async () => null,
    })
    expect(includes).toEqual([])
  })

  it('still SNAP_INCLs a nested subpart that has its own shadow', async () => {
    const files: Record<string, string> = {
      'custom.dat': [
        '0 Custom',
        '1 16 0 0 0 1 0 0 0 1 0 0 0 1 s\\body.dat',
        '1 16 10 0 10 1 0 0 0 1 0 0 0 1 stud.dat',
        '',
      ].join('\n'),
      's/body.dat': '0 Body\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 stud.dat\n',
      'stud.dat': '0 Stud\n',
    }
    const conn: Record<string, string> = {
      's/body.dat': '0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=R 6 20]\n',
      'stud.dat': '0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4]\n',
    }
    const includes = await collectNewShadowIncludes('custom.dat', {
      loadPartFileContent: async (f) => {
        const key = f.replace(/\\/g, '/')
        return files[key] ?? files[f] ?? null
      },
      loadConnectivityContent: async (f) => {
        const key = f.replace(/\\/g, '/')
        return conn[key] ?? conn[f] ?? null
      },
    })
    expect(includes).toHaveLength(1)
    expect(includes[0].ref.toLowerCase().replace(/\//g, '\\')).toBe('s\\body.dat')
  })
})
