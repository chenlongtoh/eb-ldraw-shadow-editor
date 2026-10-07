# LDraw Shadow Editor

EasternBrick tool to visualize and edit LDCad snap connectivity on LDraw part geometry.

## Setup

```bash
# The connectivity library this editor saves into, next to this repo:
git clone https://github.com/chenlongtoh/LDCadShadowLibrary.git ../LDCadShadowLibrary
npm install
npm run dev
```

Reads LDraw part geometry from the part library CDN (published by the `ldraw-parts` repo).

In `npm run dev`, connectivity is **read from and saved to** the local `../LDCadShadowLibrary`
checkout (override with `LDCAD_LIBRARY_DIR` in `.env`). Save writes shadow `.dat` files to its
`parts/` folder; commit and push that repo to publish them to the CDN.

Deployed/static builds read the published connectivity library from the CDN and cannot write,
so Save downloads the file instead.

## Usage

1. Enter a part ID (e.g. `3003`) and click **Load**
2. Inspect snap overlays on the mesh (blue = male CYL, orange = female)
3. Add snaps from templates, move/rotate with the gizmo, edit properties
4. **Save…** → confirm to write into the local LDCadShadowLibrary checkout
