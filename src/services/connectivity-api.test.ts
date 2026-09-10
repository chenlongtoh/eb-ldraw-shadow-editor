import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from './download-file'
import { resetCustomParts } from './custom-part-geometry'
import {
  SEARCH_UNAVAILABLE_MESSAGE,
  fetchPartPrimitives,
  fetchPartStatus,
  isMissingWriteApi,
  loadCustomPartFile,
  prefersDownloadSave,
  saveConnectivityFile,
  searchParts,
  shadowDownloadFilename,
} from './connectivity-api'

vi.mock('./download-file', () => ({
  downloadTextFile: vi.fn(),
}))

describe('isMissingWriteApi', () => {
  it('treats 404/405/501 as a missing write API', () => {
    expect(isMissingWriteApi({ status: 404 })).toBe(true)
    expect(isMissingWriteApi({ status: 405 })).toBe(true)
    expect(isMissingWriteApi({ status: 501 })).toBe(true)
    expect(isMissingWriteApi({ status: 400 })).toBe(false)
    expect(isMissingWriteApi({ status: 403 })).toBe(false)
    expect(isMissingWriteApi({ status: 500 })).toBe(false)
  })

  it('treats HTML error pages as a missing write API', () => {
    expect(
      isMissingWriteApi({
        status: 400,
        headers: { get: () => 'text/html; charset=utf-8' },
      }),
    ).toBe(true)
  })
})

describe('shadowDownloadFilename', () => {
  it('uses the part basename', () => {
    expect(shadowDownloadFilename('3003')).toBe('3003.dat')
    expect(shadowDownloadFilename('s/3003s01.dat')).toBe('3003s01.dat')
  })
})

describe('saveConnectivityFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.mocked(downloadTextFile).mockReset()
  })

  it('writes via the local API when PUT succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          wroteToShadowLibrary: true,
          shadowPath: '/lib/parts/3003.dat',
        }),
      })),
    )

    const result = await saveConnectivityFile('3003.dat', '0 !LDCAD SNAP_CLEAR\n')
    expect(result).toEqual({
      wroteToShadowLibrary: true,
      downloaded: false,
      shadowPath: '/lib/parts/3003.dat',
      warning: undefined,
    })
    expect(downloadTextFile).not.toHaveBeenCalled()
  })

  it('downloads when the write API is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        headers: { get: () => 'text/html' },
        text: async () => 'Not Found',
      })),
    )

    const result = await saveConnectivityFile('3003.dat', '0 !LDCAD SNAP_CLEAR\n')
    expect(result.downloaded).toBe(true)
    expect(result.wroteToShadowLibrary).toBe(false)
    expect(result.filename).toBe('3003.dat')
    expect(downloadTextFile).toHaveBeenCalledWith('3003.dat', '0 !LDCAD SNAP_CLEAR\n')
  })

  it('downloads when fetch fails (no write API host)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    const result = await saveConnectivityFile('3003.dat', 'body')
    expect(result.downloaded).toBe(true)
    expect(downloadTextFile).toHaveBeenCalledWith('3003.dat', 'body')
  })

  it('throws on a real save validation error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        headers: { get: () => 'text/plain' },
        text: async () => 'Body does not look like LDCad connectivity',
      })),
    )

    await expect(saveConnectivityFile('3003.dat', 'nope')).rejects.toThrow(/Save failed: 400/)
    expect(downloadTextFile).not.toHaveBeenCalled()
  })

  it('downloads immediately in production builds', async () => {
    vi.stubEnv('PROD', true)
    expect(prefersDownloadSave()).toBe(true)

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await saveConnectivityFile('3003.dat', '0 !LDCAD SNAP_CLEAR\n')
    expect(result.downloaded).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(downloadTextFile).toHaveBeenCalledWith('3003.dat', '0 !LDCAD SNAP_CLEAR\n')
  })
})

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => data,
    text: async () => JSON.stringify(data),
  }
}

function textResponse(text: string, status = 200, contentType = 'text/plain') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => {
      throw new Error('not json')
    },
    text: async () => text,
  }
}

describe('fetchPartStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetCustomParts()
  })

  it('uses the local JSON API when it is available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          partFile: '3003.dat',
          geometryExists: true,
          geometryUrl: '/ldraw-parts/parts/3003.dat',
          hasShadow: true,
          isUnofficial: false,
          description: 'Brick  2 x  2',
        }),
      ),
    )

    await expect(fetchPartStatus('3003')).resolves.toMatchObject({
      geometryExists: true,
      geometryUrl: '/ldraw-parts/parts/3003.dat',
      hasShadow: true,
      description: 'Brick  2 x  2',
    })
  })

  it('falls back to static files when the status API is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/connectivity/status')) {
          return textResponse('<!doctype html>', 404, 'text/html')
        }
        if (url.includes('/ldraw-parts/parts/3003.dat')) {
          return textResponse('0 Brick  2 x  2\n0 !LDRAW_ORG Part UPDATE 2022-05\n')
        }
        if (url.includes('/ldraw-connectivity/parts/3003.dat')) {
          return textResponse('0 LDCad shadow info\n0 !LDCAD SNAP_CLEAR\n')
        }
        return textResponse('Not Found', 404, 'text/plain')
      }),
    )

    await expect(fetchPartStatus('3003')).resolves.toEqual({
      partFile: '3003.dat',
      geometryExists: true,
      geometryUrl: '/ldraw-parts/parts/3003.dat',
      hasShadow: true,
      isUnofficial: false,
      description: 'Brick  2 x  2',
    })
  })
})

describe('searchParts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('explains that search needs the local editor when the API is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse('<!doctype html>', 404, 'text/html')),
    )
    await expect(searchParts('3003')).rejects.toThrow(SEARCH_UNAVAILABLE_MESSAGE)
  })
})

describe('fetchPartPrimitives', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetCustomParts()
  })

  it('parses type-1 refs from static geometry when the children API is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/connectivity/children')) {
          return textResponse('<!doctype html>', 404, 'text/html')
        }
        if (url.includes('/ldraw-parts/parts/3003.dat')) {
          return textResponse('0 Brick\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 stud.dat\n')
        }
        if (url.includes('/ldraw-parts/parts/stud.dat') || url.includes('/ldraw-parts/p/stud.dat')) {
          return textResponse('0 Stud\n')
        }
        return textResponse('Not Found', 404, 'text/plain')
      }),
    )

    await expect(fetchPartPrimitives('3003')).resolves.toEqual([
      { displayName: 'stud.dat', loadFile: 'stud.dat', count: 1, geometryExists: true, hasShadow: false },
    ])
  })
})

describe('loadCustomPartFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetCustomParts()
  })

  it('rejects non-dat uploads', async () => {
    await expect(loadCustomPartFile({ name: 'notes.txt', text: async () => 'hello' })).rejects.toThrow(
      /LDraw \.dat/,
    )
  })

  it('loads uploaded geometry without the status API', async () => {
    URL.createObjectURL ??= () => 'blob:custom-dat'
    URL.revokeObjectURL ??= () => undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => textResponse('Not Found', 404, 'text/plain')),
    )

    const loaded = await loadCustomPartFile({
      name: 'CustomBrick.DAT',
      text: async () => '0 Custom brick\n0 !LDRAW_ORG Unofficial_Part\n',
    })
    expect(loaded.partFile).toBe('custombrick.dat')
    expect(loaded.isCustomGeometry).toBe(true)
    expect(loaded.isUnofficial).toBe(true)
    expect(loaded.partName).toBe('Custom brick')
    expect(loaded.geometryUrl).toMatch(/^(blob:|data:)/)
    expect(loaded.primitives).toEqual([])
  })
})
