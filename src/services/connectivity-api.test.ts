import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPartLibrary } from '@eb/ldraw-parser'
import { downloadTextFile } from './download-file'
import { resetCustomParts } from './custom-part-geometry'
import { setLibrariesForTests } from './libraries'
import {
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

const CDN = 'https://cdn.test/ldraw'

/**
 * A part library holding `files` (library path → text), with fetch serving its
 * objects and the local connectivity checkout serving `shadows` (path → text).
 */
function useLibrary(files: Record<string, string>, shadows: Record<string, string> = {}) {
  const folders: Record<string, Record<string, string>> = {}
  const objects: Record<string, string> = {}
  Object.entries(files).forEach(([libraryPath, text], i) => {
    const [folder, ...rest] = libraryPath.split('/')
    const hash = String(i).padStart(8, '0')
    ;(folders[folder] ??= {})[rest.join('/')] = hash
    objects[`${CDN}/objects/${hash}/${libraryPath}`] = text
  })
  const index = { formatVersion: 1, version: 'test', folders }
  setLibrariesForTests({ parts: { library: createPartLibrary(index, { baseUrl: CDN }), index } })
  const fetchMock = vi.fn(async (url: string) => {
    const body = objects[url] ?? shadows[url.replace(/^\/ldraw-connectivity\//, '')]
    return body === undefined ? textResponse('Not Found', 404) : textResponse(body)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchPartStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetCustomParts()
    setLibrariesForTests({ parts: null })
  })

  it('reads geometry from the part library and the shadow from the local checkout', async () => {
    useLibrary(
      { 'parts/3003.dat': '0 Brick  2 x  2\n0 !LDRAW_ORG Part UPDATE 2022-05\n' },
      { 'parts/3003.dat': '0 LDCad shadow info\n0 !LDCAD SNAP_CLEAR\n' },
    )

    await expect(fetchPartStatus('3003')).resolves.toEqual({
      partFile: '3003.dat',
      geometryExists: true,
      geometryUrl: `${CDN}/objects/00000000/parts/3003.dat`,
      hasShadow: true,
      isUnofficial: false,
      description: 'Brick  2 x  2',
    })
  })

  it('reports missing geometry without requesting it', async () => {
    const fetchMock = useLibrary({})
    await expect(fetchPartStatus('9999')).resolves.toMatchObject({ geometryExists: false, geometryUrl: null })
    expect(fetchMock.mock.calls.every(([url]) => !String(url).startsWith(CDN))).toBe(true)
  })
})

describe('searchParts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setLibrariesForTests({ parts: null })
  })

  it('searches top-level parts in the library index', async () => {
    useLibrary(
      { 'parts/3003.dat': '0 Brick', 'parts/30039.dat': '0 Tile', 'parts/s/3003s01.dat': '0 Sub', 'p/stud.dat': '0 Stud' },
      { 'parts/3003.dat': '0 !LDCAD SNAP_CLEAR\n' },
    )
    await expect(searchParts('3003')).resolves.toEqual([
      { partFile: '3003.dat', hasShadow: true },
      { partFile: '30039.dat', hasShadow: false },
    ])
  })
})

describe('fetchPartPrimitives', () => {
  beforeEach(() => {
    useLibrary({
      'parts/3003.dat': '0 Brick\n1 16 0 0 0 1 0 0 0 1 0 0 0 1 stud.dat\n',
      'p/stud.dat': '0 Stud\n',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetCustomParts()
    setLibrariesForTests({ parts: null })
  })

  it('parses type-1 refs from the library geometry', async () => {
    await expect(fetchPartPrimitives('3003')).resolves.toEqual([
      { displayName: 'stud.dat', loadFile: 'stud.dat', count: 1, geometryExists: true, hasShadow: false },
    ])
  })
})

describe('loadCustomPartFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetCustomParts()
    setLibrariesForTests({ parts: null })
  })

  it('rejects non-dat uploads', async () => {
    await expect(loadCustomPartFile({ name: 'notes.txt', text: async () => 'hello' })).rejects.toThrow(
      /LDraw \.dat/,
    )
  })

  it('loads uploaded geometry that is not in the library', async () => {
    URL.createObjectURL ??= () => 'blob:custom-dat'
    URL.revokeObjectURL ??= () => undefined
    useLibrary({})

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
