import { describe, expect, it } from 'vitest'
import { collectNewShadowIncludes, serializeInclude } from './shadow-includes'

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
  it('does not SNAP_INCL geometry children on a new shadow', async () => {
    const includes = await collectNewShadowIncludes('3003.dat')
    expect(includes).toEqual([])
  })

  it('does not SNAP_INCL primitives referenced by a part with no shadow', async () => {
    const includes = await collectNewShadowIncludes('unofficial.dat', {
      loadPartFileContent: async () =>
        ['1 16 -10 0 -10 1 0 0 0 1 0 0 0 1 stud.dat', '1 16 10 0 10 1 0 0 0 1 0 0 0 1 stud.dat', ''].join(
          '\n',
        ),
      loadConnectivityContent: async () => '0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4]\n',
    })
    expect(includes).toEqual([])
  })

  it('does not SNAP_INCL a subpart that already has a shadow', async () => {
    const includes = await collectNewShadowIncludes('custom.dat', {
      loadPartFileContent: async () => '1 16 0 0 0 1 0 0 0 1 0 0 0 1 s\\body.dat\n',
      loadConnectivityContent: async () => '0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=R 6 20]\n',
    })
    expect(includes).toEqual([])
  })
})
