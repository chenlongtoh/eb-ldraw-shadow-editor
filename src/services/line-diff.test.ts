import { describe, expect, it } from 'vitest'
import { diffLines, normalizeTextForDiff } from './line-diff'

describe('diffLines', () => {
  it('treats empty→file as all additions', () => {
    const result = diffLines('', 'a\nb\n')
    expect(result.deletions).toBe(0)
    expect(result.additions).toBe(2)
    expect(result.lines.every((l) => l.kind === 'add')).toBe(true)
    expect(result.lines.map((l) => l.text)).toEqual(['a', 'b'])
  })

  it('returns empty hunks for identical text (ignoring trailing newline)', () => {
    const result = diffLines('hello\n', 'hello')
    expect(result.additions).toBe(0)
    expect(result.deletions).toBe(0)
    expect(result.lines).toEqual([
      { kind: 'equal', text: 'hello', oldLine: 1, newLine: 1 },
    ])
  })

  it('reports simple add/remove/replace', () => {
    const result = diffLines('a\nb\nc\n', 'a\nx\nc\n')
    expect(result.deletions).toBe(1)
    expect(result.additions).toBe(1)
    expect(result.lines).toEqual([
      { kind: 'equal', text: 'a', oldLine: 1, newLine: 1 },
      { kind: 'del', text: 'b', oldLine: 2, newLine: null },
      { kind: 'add', text: 'x', oldLine: null, newLine: 2 },
      { kind: 'equal', text: 'c', oldLine: 3, newLine: 3 },
    ])
  })

  it('normalizeTextForDiff strips one trailing newline', () => {
    expect(normalizeTextForDiff('x\n')).toBe('x')
    expect(normalizeTextForDiff('x')).toBe('x')
  })

  it('treats CRLF and LF as the same lines', () => {
    const crlf = '0 Author: LDCad Shadow Library\r\n0 !LICENSE CC BY-SA 4.0\r\n'
    const lf = '0 Author: LDCad Shadow Library\n0 !LICENSE CC BY-SA 4.0\n'
    const result = diffLines(crlf, lf)
    expect(result.additions).toBe(0)
    expect(result.deletions).toBe(0)
    expect(result.lines.every((l) => l.kind === 'equal')).toBe(true)
  })
})
