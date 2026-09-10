import type { LDrawSnapRecord } from '@eb/ldraw-models'

const IDENTITY: LDrawSnapRecord['orientation'] = [1, 0, 0, 0, 1, 0, 0, 0, 1]

export interface SnapTemplate {
  id: string
  label: string
  description: string
  snap: Omit<LDrawSnapRecord, 'position' | 'orientation'> & {
    position?: [number, number, number]
    orientation?: LDrawSnapRecord['orientation']
  }
}

export const SNAP_TEMPLATES: SnapTemplate[] = [
  {
    id: 'male-stud',
    label: 'Male stud',
    description: 'Standard stud (R 6 4)',
    snap: {
      metaType: 'SNAP_CYL',
      gender: 'M',
      caps: 'one',
      secs: [{ shape: 'R', values: [6, 4] }],
      slide: false,
      center: false,
      position: [0, 0, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'female-tube',
    label: 'Female tube',
    description: 'Brick underside tube (R 6 20)',
    snap: {
      metaType: 'SNAP_CYL',
      gender: 'F',
      caps: 'one',
      secs: [{ shape: 'R', values: [6, 20] }],
      slide: false,
      center: false,
      position: [0, 24, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'anti-stud-square',
    label: 'Anti-stud (square)',
    description: 'Plate underside (S 6 4)',
    snap: {
      metaType: 'SNAP_CYL',
      gender: 'F',
      caps: 'one',
      secs: [{ shape: 'S', values: [6, 4] }],
      slide: false,
      center: false,
      position: [0, 8, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'anti-stud-round',
    label: 'Anti-stud (round)',
    description: 'Plate underside (R 6 4)',
    snap: {
      metaType: 'SNAP_CYL',
      gender: 'F',
      caps: 'one',
      secs: [{ shape: 'R', values: [6, 4] }],
      slide: false,
      center: false,
      position: [0, 8, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'axle',
    label: 'Axle (male)',
    description: 'Technic axle cross-section',
    snap: {
      metaType: 'SNAP_CYL',
      gender: 'M',
      caps: 'none',
      secs: [{ shape: 'A', values: [6, 1] }],
      slide: true,
      center: false,
      position: [0, 0, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'axle-hole',
    label: 'Axle hole (female)',
    description: 'Technic axle hole',
    snap: {
      metaType: 'SNAP_CYL',
      gender: 'F',
      caps: 'none',
      secs: [{ shape: 'A', values: [6, 1] }],
      slide: true,
      center: false,
      position: [0, 0, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'technic-pin',
    label: 'Technic pin',
    description: 'Long pin with ridges',
    snap: {
      metaType: 'SNAP_CYL',
      gender: 'M',
      caps: 'none',
      secs: [
        { shape: 'L_', values: [6.25, 2] },
        { shape: 'R', values: [6, 16] },
        { shape: 'R', values: [8, 4] },
        { shape: 'R', values: [6, 16] },
        { shape: '_L', values: [6.25, 2] },
      ],
      slide: true,
      center: true,
      position: [0, 0, 0],
      orientation: [0, -1, 0, 1, 0, 0, 0, 0, 1],
    },
  },
  {
    id: 'beam-hole',
    label: 'Beam hole',
    description: 'Technic connector hole',
    snap: {
      metaType: 'SNAP_CYL',
      gender: 'F',
      caps: 'none',
      secs: [
        { shape: 'R', values: [8, 2] },
        { shape: 'R', values: [6, 16] },
        { shape: 'R', values: [8, 2] },
      ],
      slide: true,
      center: true,
      position: [0, 0, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'clip',
    label: 'C-clip',
    description: 'Vertical clip (radius 4)',
    snap: {
      metaType: 'SNAP_CLP',
      radius: 4,
      length: 8,
      center: true,
      slide: false,
      position: [0, 0, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'hinge-m',
    label: 'Hinge finger (M)',
    description: 'Male-offset hinge fingers',
    snap: {
      metaType: 'SNAP_FGR',
      genderOfs: 'M',
      seq: [4.5, 8, 4.5],
      radius: 6,
      center: true,
      slide: false,
      position: [0, 0, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'hinge-f',
    label: 'Hinge finger (F)',
    description: 'Female-offset hinge receptor',
    snap: {
      metaType: 'SNAP_FGR',
      genderOfs: 'F',
      seq: [40],
      radius: 4,
      center: false,
      slide: false,
      position: [0, 0, 0],
      orientation: [...IDENTITY],
    },
  },
  {
    id: 'ball-joint',
    label: 'Ball joint',
    description: 'Technic ball (sph 12.7)',
    snap: {
      metaType: 'SNAP_GEN',
      group: 'techBallJnt',
      gender: 'M',
      bounding: { kind: 'sphere', values: [12.7] },
      slide: false,
      center: false,
      position: [0, 0, 0],
      orientation: [...IDENTITY],
    },
  },
]

export function instantiateTemplate(template: SnapTemplate): LDrawSnapRecord {
  const s = template.snap
  return {
    metaType: s.metaType,
    gender: s.gender,
    genderOfs: s.genderOfs,
    group: s.group,
    position: [...(s.position ?? [0, 0, 0])] as [number, number, number],
    orientation: [...(s.orientation ?? IDENTITY)] as LDrawSnapRecord['orientation'],
    slide: s.slide ?? false,
    center: s.center ?? false,
    caps: s.caps,
    radius: s.radius,
    length: s.length,
    seq: s.seq ? [...s.seq] : undefined,
    secs: s.secs?.map((sec) => ({ shape: sec.shape, values: [...sec.values] })),
    bounding: s.bounding
      ? { kind: s.bounding.kind, values: [...s.bounding.values] }
      : undefined,
    grid: s.grid,
  }
}
