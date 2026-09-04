import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolvePartGeometryFeatures } from '@eb/ldraw-parser'

const IB = path.resolve(__dirname, '../../../instruction-builder/public')
const LDRAW = path.join(IB, 'ldraw-parts')
const CONN = path.join(IB, 'ldcad-parts-connectivity')

function loadFromDisk(base: string, partFile: string): string | null {
  const candidates = [
    path.join(base, 'parts', partFile),
    path.join(base, 'p', partFile),
    path.join(base, 'parts', 's', partFile.replace(/^s[\\/]/, '')),
  ]
  if (partFile.includes('s/') || partFile.includes('s\\')) {
    const name = partFile.replace(/\\/g, '/').split('/').pop()!
    candidates.push(path.join(base, 'parts', 's', name))
  }
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, 'utf8')
  }
  return null
}

const diskLoader = {
  loadPartFileContent: async (f: string) => loadFromDisk(LDRAW, f),
  loadConnectivityContent: async (f: string) => loadFromDisk(CONN, f),
}

describe('resolvePartGeometryFeatures (disk)', () => {
  it('resolves brick 3003 studs from geometry tree', async () => {
    const features = await resolvePartGeometryFeatures('3003.dat', diskLoader)
    const studs = features.filter((f) => f.featureKind === 'maleStud')
    expect(studs.length).toBe(4)
    studs.forEach((f) => {
      expect(f.snap.gender).toBe('M')
      expect(f.sourceRef).toBe('stud.dat')
    })
  })

  it('resolves technic 2477 connhole anchors', async () => {
    const features = await resolvePartGeometryFeatures('2477.dat', diskLoader)
    const holes = features.filter((f) => f.featureKind === 'beamHole')
    expect(holes.length).toBeGreaterThanOrEqual(3)
    const connHoles = holes.filter((f) => f.sourceRef === 'connhole.dat')
    expect(connHoles.length).toBeGreaterThanOrEqual(3)
    holes.forEach((f) => {
      expect(f.snap.gender).toBe('F')
    })
  })

  it('resolves 80285 peghole side holes without shadow files', async () => {
    const features = await resolvePartGeometryFeatures('80285.dat', diskLoader)
    const holes = features.filter((f) => f.featureKind === 'beamHole')
    // peghole + peghole4 + connhole — not npeghol* cutters
    expect(holes.length).toBeGreaterThanOrEqual(14)
    expect(holes.every((f) => !f.sourceRef.startsWith('npeghol'))).toBe(true)
    const sidePegholes = holes.filter((f) => f.sourceRef === 'peghole4.dat')
    expect(sidePegholes.length).toBe(6)
    sidePegholes.forEach((f) => {
      expect(f.snap.gender).toBe('F')
      expect(f.snap.metaType).toBe('SNAP_CYL')
      // Seated into the well: not left at the raw peghole origin.
      // For placement (-20,-20,±10) with local +Y → world ∓Z, center is offset by L/2.
      expect(Math.abs(f.position[2])).toBeGreaterThan(10)
    })
  })
})
