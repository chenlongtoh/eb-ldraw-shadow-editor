import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadTextFile } from './download-file'
import {
  isMissingWriteApi,
  prefersDownloadSave,
  saveConnectivityFile,
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
