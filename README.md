# Part Connectivity Editor

Standalone tool to visualize and edit LDCad snap connectivity on LDraw part geometry.

## Setup

```bash
npm install
npm run dev
```

Reads LDraw parts from `../instruction-builder/public/ldraw-parts` and connectivity from `../instruction-builder/public/ldcad-parts-connectivity`.

On save, writes flattened shadow `.dat` files into the Instruction Builder connectivity library when that path is writable. If not (e.g. sandboxed process), files are also written to `connectivity-overrides/parts/` in this repo (served with overlay priority). Copy those into IB's `public/ldcad-parts-connectivity/parts/` when ready.

## Usage

1. Enter a part ID (e.g. `3003`) and click **Load**
2. Inspect snap overlays on the mesh (blue = male CYL, orange = female)
3. Add snaps from templates, move/rotate with the gizmo, edit properties
4. **Save…** → confirm to write `SNAP_CLEAR` + flattened snap lines
