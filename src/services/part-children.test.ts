import { describe, expect, it } from 'vitest'
import { listDirectPrimitiveFiles } from './part-children'

describe('listDirectPrimitiveFiles', () => {
  it('lists unique direct type-1 refs and keeps original spelling', () => {
    const content = [
      '0 Brick 2 x 2',
      '1 16 0 0 0 1 0 0 0 1 0 0 0 1 s\\3003s01.dat',
      '1 16 0 -4 0 1 0 0 0 1 0 0 0 1 stud.dat',
      '1 16 20 -4 0 1 0 0 0 1 0 0 0 1 stud.dat',
      '1 16 10 40 0 0 -20 0 -28 0 -28 -60 0 60 48\\1-8cyli.dat',
      '4 16 1 2 3 4 5 6 7 8 9 10 11 12',
    ].join('\n')

    expect(listDirectPrimitiveFiles(content)).toEqual([
      { displayName: 's\\3003s01.dat', loadFile: 's/3003s01.dat', count: 1 },
      { displayName: 'stud.dat', loadFile: 'stud.dat', count: 2 },
      { displayName: '48\\1-8cyli.dat', loadFile: '48/1-8cyli.dat', count: 1 },
    ])
  })

  it('returns an empty list when there are no type-1 refs', () => {
    expect(listDirectPrimitiveFiles('0 Comment\n4 16 0 0 0 1 1 1 2 2 2 3 3 3\n')).toEqual([])
  })
})
