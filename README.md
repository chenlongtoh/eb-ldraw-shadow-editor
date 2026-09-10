# LDraw Shadow Editor

EasternBrick tool to visualize and edit LDCad snap connectivity on LDraw part geometry.

## Setup

```bash
git submodule update --init public/ldraw-parts public/ldraw-connectivity
npm install
npm run dev
```

Reads LDraw parts from `public/ldraw-parts` and **reads/writes** connectivity from `public/ldraw-connectivity`.

On save, writes shadow `.dat` files to `public/ldraw-connectivity/parts/`. Deployed/static hosts cannot write that tree, so Save downloads the file instead.

## Usage

1. Enter a part ID (e.g. `3003`) and click **Load**
2. Inspect snap overlays on the mesh (blue = male CYL, orange = female)
3. Add snaps from templates, move/rotate with the gizmo, edit properties
4. **Save…** → confirm to write into the connectivity submodule
