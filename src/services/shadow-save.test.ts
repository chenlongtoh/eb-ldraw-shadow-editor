import { describe, expect, it } from 'vitest'
import { parseConnectivityFile } from '@eb/ldraw-parser'
import { diffLines } from './line-diff'
import {
  appendHistoryToPreamble,
  applyAuthorToPreamble,
  applyUnofficialToPreamble,
  attachOriginLines,
  buildPreservedShadowContent,
  emitSnapLine,
  extractShadowPreamble,
  snapFingerprint,
} from './shadow-save'

const SAMPLE_FLAT = [
  '0 LDCad shadow info for "Brick  2 x  2"',
  '',
  '0 Author: LDCad Shadow Library',
  '0 !LICENSE CC BY-SA 4.0, see LICENSE.md',
  '',
  '0 !HISTORY 2013-11-22 {Roland Melkert} Initial info for 3003.dat',
  '',
  '0 !LDCAD SNAP_CLEAR',
  '',
  '0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4] [pos=0 24 0]',
  '0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=R 6 20] [pos=0 0 0]',
  '',
].join('\n')

const SAMPLE_INCL = [
  '0 LDCad shadow info for "Brick  2 x  2"',
  '',
  '0 Author: LDCad Shadow Library',
  '0 !LICENSE CC BY-SA 4.0, see LICENSE.md',
  '',
  '0 !HISTORY 2013-11-22 {Roland Melkert} Initial info for 3003.dat',
  '',
  '0 !LDCAD SNAP_INCL [ref=s\\3003s01.dat]',
  '',
].join('\n')

describe('shadow-save preservation', () => {
  it('extracts preamble without SNAP lines', () => {
    const preamble = extractShadowPreamble(SAMPLE_FLAT)
    expect(preamble.join('\n')).toContain('Brick  2 x  2')
    expect(preamble.join('\n')).toContain('0 !HISTORY 2013-11-22')
    expect(preamble.some((l) => l.includes('SNAP_'))).toBe(false)
  })

  it('appends HISTORY after existing history without rewriting title', () => {
    const preamble = extractShadowPreamble(SAMPLE_FLAT)
    const next = appendHistoryToPreamble(
      preamble,
      '0 !HISTORY 2026-09-09 {Part Connectivity Editor} Edited connectivity for 3003.dat',
    )
    expect(next[0]).toBe('0 LDCad shadow info for "Brick  2 x  2"')
    const hist = next.filter((l) => l.startsWith('0 !HISTORY'))
    expect(hist).toHaveLength(2)
    expect(hist[0]).toContain('Roland Melkert')
    expect(hist[1]).toContain('Part Connectivity Editor')
  })

  it('flatten mode keeps original SNAP lines when unchanged', () => {
    const parsed = parseConnectivityFile(SAMPLE_FLAT, '3003.dat')
    const sourced = parsed.snaps.map((s) => ({ ...s, sourceFile: '3003.dat' }))
    const withOrigin = attachOriginLines('3003.dat', SAMPLE_FLAT, sourced)

    const text = buildPreservedShadowContent({
      partFile: '3003.dat',
      partName: 'Brick  2 x  2',
      snaps: withOrigin,
      shadowSourceText: SAMPLE_FLAT,
      isNewShadow: false,
      historyNote: 'Edited connectivity for 3003.dat',
      editorName: 'Part Connectivity Editor',
      mode: 'flatten',
    })

    expect(text).toContain('0 !LDCAD SNAP_CLEAR')
    expect(text).toContain('0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4] [pos=0 24 0]')

    const diff = diffLines(SAMPLE_FLAT, text)
    const added = diff.lines.filter((l) => l.kind === 'add').map((l) => l.text)
    expect(added.some((t) => t.includes('Edited connectivity for 3003.dat'))).toBe(true)
    expect(added.every((t) => t.includes('HISTORY') || t.trim() === '')).toBe(true)
    expect(diff.deletions).toBe(0)
  })

  it('new shadow inherit mode writes prefilled SNAP_INCL lines', () => {
    const text = buildPreservedShadowContent({
      partFile: 'unofficial.dat',
      partName: 'Unofficial brick',
      snaps: [],
      shadowSourceText: null,
      isNewShadow: true,
      historyNote: 'Initial info for unofficial.dat',
      editorName: 'Part Connectivity Editor',
      mode: 'inherit',
      includes: [
        {
          ref: 's\\7126s01.dat',
          position: [0, 0, 0],
          orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        },
        {
          ref: 'stud.dat',
          position: [10, 0, 10],
          orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        },
      ],
    })

    expect(text).toContain('0 !LDCAD SNAP_INCL [ref=s\\7126s01.dat]')
    expect(text).toContain('0 !LDCAD SNAP_INCL [ref=stud.dat] [pos=10 0 10]')
    expect(text).not.toContain('SNAP_CLEAR')
    expect(text).toContain('0 LDCad shadow info for "Unofficial brick"')
    expect(text).toContain('0 Author: LDCad Shadow Library')
  })

  it('writes a custom Author line on new and existing shadows', () => {
    const fresh = buildPreservedShadowContent({
      partFile: 'x.dat',
      partName: 'Part',
      snaps: [],
      shadowSourceText: null,
      isNewShadow: true,
      historyNote: 'Initial info for x.dat',
      editorName: 'Part Connectivity Editor',
      author: 'Ada Lovelace',
      mode: 'inherit',
    })
    expect(fresh).toContain('0 Author: Ada Lovelace')

    const updated = buildPreservedShadowContent({
      partFile: '3003.dat',
      partName: 'Brick  2 x  2',
      snaps: attachOriginLines(
        '3003.dat',
        SAMPLE_FLAT,
        parseConnectivityFile(SAMPLE_FLAT, '3003.dat').snaps.map((s) => ({
          ...s,
          sourceFile: '3003.dat',
        })),
      ),
      shadowSourceText: SAMPLE_FLAT,
      isNewShadow: false,
      historyNote: 'Edited connectivity for 3003.dat',
      editorName: 'Part Connectivity Editor',
      author: 'Ada Lovelace',
      mode: 'inherit',
    })
    expect(updated).toContain('0 Author: Ada Lovelace')
    expect(updated).not.toContain('0 Author: LDCad Shadow Library')
  })

  it('inserts Author when the preamble has none', () => {
    expect(
      applyAuthorToPreamble(
        ['0 LDCad shadow info for "Brick"', '', '0 !LICENSE CC BY-SA 4.0'],
        'LDCad Shadow Library',
      ),
    ).toEqual([
      '0 LDCad shadow info for "Brick"',
      '',
      '0 Author: LDCad Shadow Library',
      '0 !LICENSE CC BY-SA 4.0',
    ])
  })

  it('inherit mode keeps SNAP_INCL and appends new own snaps', () => {
    const newSnap = parseConnectivityFile(
      '0 !LDCAD SNAP_CYL [gender=M] [caps=one] [secs=R 6 4] [pos=10 0 0]',
      'x.dat',
    ).snaps[0]
    const text = buildPreservedShadowContent({
      partFile: '3003.dat',
      partName: 'Brick  2 x  2',
      snaps: [
        {
          ...newSnap,
          sourceFile: '(editor)',
          id: 'new-1',
        },
      ],
      shadowSourceText: SAMPLE_INCL,
      isNewShadow: false,
      historyNote: 'Added side snap',
      editorName: 'Part Connectivity Editor',
      mode: 'inherit',
    })

    expect(text).toContain('0 !LDCAD SNAP_INCL [ref=s\\3003s01.dat]')
    expect(text).not.toContain('SNAP_CLEAR')
    expect(text).toMatch(/0 !LDCAD SNAP_CYL .*\[pos=10 0 0\]/)
    expect(text).toContain('0 LDCad shadow info for "Brick  2 x  2"')
    expect(text).toContain('0 !HISTORY 2013-11-22 {Roland Melkert} Initial info for 3003.dat')

    const diff = diffLines(SAMPLE_INCL, text)
    const dels = diff.lines.filter((l) => l.kind === 'del')
    expect(dels).toHaveLength(0)
    const adds = diff.lines.filter((l) => l.kind === 'add').map((l) => l.text)
    expect(adds.some((t) => t.includes('Added side snap'))).toBe(true)
    expect(adds.some((t) => t.includes('SNAP_CYL'))).toBe(true)
  })

  it('flatten mode replaces INCL with SNAP_CLEAR and all snaps', () => {
    const inherited = parseConnectivityFile(
      '0 !LDCAD SNAP_CYL [gender=F] [caps=one] [secs=R 6 20] [pos=0 24 0]',
      's.dat',
    ).snaps[0]
    const text = buildPreservedShadowContent({
      partFile: '3003.dat',
      partName: 'Brick  2 x  2',
      snaps: [{ ...inherited, sourceFile: 's/3003s01.dat' }],
      shadowSourceText: SAMPLE_INCL,
      isNewShadow: false,
      historyNote: 'Flattened',
      editorName: 'Part Connectivity Editor',
      mode: 'flatten',
    })

    expect(text).toContain('0 !LDCAD SNAP_CLEAR')
    expect(text).not.toContain('SNAP_INCL')
    expect(text).toContain('SNAP_CYL')
  })

  it('re-serializes only the edited own snap in flatten mode', () => {
    const parsed = parseConnectivityFile(SAMPLE_FLAT, '3003.dat')
    const sourced = parsed.snaps.map((s) => ({ ...s, sourceFile: '3003.dat' }))
    const withOrigin = attachOriginLines('3003.dat', SAMPLE_FLAT, sourced)
    withOrigin[0] = {
      ...withOrigin[0],
      position: [0, 25, 0],
    }

    expect(emitSnapLine(withOrigin[0])).not.toBe(withOrigin[0].rawLine)
    expect(emitSnapLine(withOrigin[1])).toBe(withOrigin[1].rawLine)

    const text = buildPreservedShadowContent({
      partFile: '3003.dat',
      partName: 'Brick  2 x  2',
      snaps: withOrigin,
      shadowSourceText: SAMPLE_FLAT,
      isNewShadow: false,
      historyNote: 'Moved stud',
      editorName: 'Ada',
      mode: 'flatten',
    })

    const diff = diffLines(SAMPLE_FLAT, text)
    const dels = diff.lines.filter((l) => l.kind === 'del').map((l) => l.text)
    const adds = diff.lines.filter((l) => l.kind === 'add').map((l) => l.text)
    expect(dels.some((t) => t.includes('[pos=0 24 0]'))).toBe(true)
    expect(adds.some((t) => t.includes('[pos=0 25 0]'))).toBe(true)
    expect(dels.some((t) => t.includes('[gender=F]'))).toBe(false)
    expect(text).toContain(withOrigin[1].rawLine!)
  })

  it('new unofficial shadow tags title and first HISTORY', () => {
    const text = buildPreservedShadowContent({
      partFile: '13767.dat',
      partName: 'MINI FIGURE HELMET NO. 23 (Needs Work)',
      snaps: [],
      shadowSourceText: null,
      isNewShadow: true,
      historyNote: 'Initial info for 13767.dat',
      editorName: 'Part Connectivity Editor',
      mode: 'inherit',
      isUnofficial: true,
    })

    expect(text).toContain(
      '0 LDCad shadow info for "MINI FIGURE HELMET NO. 23 (Needs Work) {unofficial}"',
    )
    expect(text).toMatch(
      /0 !HISTORY \d{4}-\d{2}-\d{2} \{Part Connectivity Editor\} Initial info for 13767\.dat \{unofficial\}/,
    )
    expect(text.match(/\{unofficial\}/g)?.length).toBe(2)
  })

  it('existing unofficial save tags title and first HISTORY only', () => {
    const existing = [
      '0 LDCad shadow info for "Tile  1 x  2 Cut Left 45 Degree"',
      '',
      '0 Author: LDCad Shadow Library',
      '0 !LICENSE CC BY-SA 4.0, see LICENSE.md',
      '',
      '0 !HISTORY 2025-06-14 {Philippe Hurbain} Initial info for 5091.dat',
      '',
      '0 !LDCAD SNAP_INCL [ref=s\\5092s01.dat]',
      '',
    ].join('\n')

    const text = buildPreservedShadowContent({
      partFile: '5091.dat',
      partName: 'Tile  1 x  2 Cut Left 45 Degree',
      snaps: [],
      shadowSourceText: existing,
      isNewShadow: false,
      historyNote: 'Edited connectivity for 5091.dat',
      editorName: 'Part Connectivity Editor',
      mode: 'inherit',
      isUnofficial: true,
    })

    expect(text).toContain(
      '0 LDCad shadow info for "Tile  1 x  2 Cut Left 45 Degree {unofficial}"',
    )
    expect(text).toContain(
      '0 !HISTORY 2025-06-14 {Philippe Hurbain} Initial info for 5091.dat {unofficial}',
    )
    expect(text).toMatch(
      /0 !HISTORY \d{4}-\d{2}-\d{2} \{Part Connectivity Editor\} Edited connectivity for 5091\.dat\n/,
    )
    expect(text).not.toMatch(/Edited connectivity for 5091\.dat \{unofficial\}/)
  })

  it('does not double-tag unofficial title or first HISTORY', () => {
    const preamble = applyUnofficialToPreamble([
      '0 LDCad shadow info for "Modulex Plate  1 x 16 {unofficial}"',
      '0 !HISTORY 2025-07-18 {Roland Melkert} Initial info for u7025.dat {unofficial}',
      '0 !HISTORY 2026-09-10 {Part Connectivity Editor} Edited connectivity for u7025.dat',
    ])
    expect(preamble[0]).toBe('0 LDCad shadow info for "Modulex Plate  1 x 16 {unofficial}"')
    expect(preamble[1]).toBe(
      '0 !HISTORY 2025-07-18 {Roland Melkert} Initial info for u7025.dat {unofficial}',
    )
    expect(preamble[2]).toBe(
      '0 !HISTORY 2026-09-10 {Part Connectivity Editor} Edited connectivity for u7025.dat',
    )
  })

  it('official save does not add {unofficial}', () => {
    const text = buildPreservedShadowContent({
      partFile: '3003.dat',
      partName: 'Brick  2 x  2',
      snaps: [],
      shadowSourceText: SAMPLE_INCL,
      isNewShadow: false,
      historyNote: 'Edited connectivity for 3003.dat',
      editorName: 'Part Connectivity Editor',
      mode: 'inherit',
      isUnofficial: false,
    })
    expect(text).not.toContain('{unofficial}')
    expect(text).toContain('0 LDCad shadow info for "Brick  2 x  2"')
  })

  it('fingerprint changes when position changes', () => {
    const snap = parseConnectivityFile(
      '0 !LDCAD SNAP_CYL [gender=M] [secs=R 6 4] [pos=0 24 0]',
      't.dat',
    ).snaps[0]
    const a = snapFingerprint(snap)
    const b = snapFingerprint({ ...snap, position: [0, 25, 0] })
    expect(a).not.toBe(b)
  })
})
