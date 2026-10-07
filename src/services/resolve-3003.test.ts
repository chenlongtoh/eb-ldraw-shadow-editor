import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePartConnectivityForEditor } from '@eb/ldraw-parser'

// Local checkouts of both libraries (sibling clones by default).
const LDRAW = process.env.LDRAW_PARTS_DIR ?? path.resolve(__dirname, '../../../ldraw-parts')
const CONN = process.env.LDCAD_LIBRARY_DIR ?? path.resolve(__dirname, '../../../LDCadShadowLibrary')

function loadFromDisk(base: string, partFile: string): string | null {
  const candidates = [
    path.join(base, 'parts', partFile),
    path.join(base, 'p', partFile),
    path.join(base, 'parts', 's', partFile.replace(/^s[\\/]/, '')),
  ]
  // Also try s\ refs as parts/s/
  if (partFile.includes('s/') || partFile.includes('s\\')) {
    const name = partFile.replace(/\\/g, '/').split('/').pop()!
    candidates.push(path.join(base, 'parts', 's', name))
  }
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8')
  }
  return null
}

describe('resolvePartConnectivityForEditor (disk)', () => {
  it('resolves brick 3003 with studs and tubes', async () => {
    const result = await resolvePartConnectivityForEditor('3003.dat', {
      loadPartFileContent: async (f) => loadFromDisk(LDRAW, f),
      loadConnectivityContent: async (f) => loadFromDisk(CONN, f),
      hasConnectivityFile: async (f) => existsSync(path.join(CONN, 'parts', f)),
    })
    expect(result.snaps.length).toBeGreaterThan(4)
    const males = result.snaps.filter((s) => s.gender === 'M')
    const females = result.snaps.filter((s) => s.gender === 'F')
    expect(males.length).toBeGreaterThan(0)
    expect(females.length).toBeGreaterThan(0)
  })
})
