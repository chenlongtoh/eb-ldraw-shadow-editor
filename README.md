# Part Connectivity Editor

Standalone tool to visualize and edit LDCad snap connectivity on LDraw part geometry.

## Setup

```bash
npm install
npm run dev
```

Reads LDraw parts from `../instruction-builder/public/ldraw-parts` and **reads/writes** connectivity exclusively from `../LDCadShadowLibrary` (no Instruction Builder connectivity fallback).

Configure paths in `.env` (see `.env.example`):

```bash
LDCAD_SHADOW_LIBRARY=../LDCadShadowLibrary
```

On save, writes flattened shadow `.dat` files to `$LDCAD_SHADOW_LIBRARY/parts/`.

## Usage

1. Enter a part ID (e.g. `3003`) and click **Load**
2. Inspect snap overlays on the mesh (blue = male CYL, orange = female)
3. Add snaps from templates, move/rotate with the gizmo, edit properties
4. **Save…** → confirm to write `SNAP_CLEAR` + flattened snap lines
