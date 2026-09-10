import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from './download-file'

describe('downloadTextFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('clicks an anchor with the filename and blob URL', () => {
    const click = vi.fn()
    const remove = vi.fn()
    const appendChild = vi.fn()
    const anchor = {
      href: '',
      download: '',
      rel: '',
      click,
      remove,
    }
    const doc = {
      createElement: vi.fn(() => anchor),
      body: { appendChild },
    } as unknown as Document

    const createObjectURL = vi.fn(() => 'blob:test-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    downloadTextFile('3003.dat', '0 !LDCAD SNAP_CLEAR\n', doc)

    expect(doc.createElement).toHaveBeenCalledWith('a')
    expect(anchor.download).toBe('3003.dat')
    expect(anchor.href).toBe('blob:test-url')
    expect(appendChild).toHaveBeenCalledWith(anchor)
    expect(click).toHaveBeenCalled()
    expect(remove).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url')
  })
})
