# Eye Anatomy Explorer

A static, single-page Three.js/WebGL educational 3D eye anatomy explorer.

## Project structure

```text
eye-anatomy-explorer/
├── index.html
├── style.css
├── app.js
├── anatomy-data.js
├── README.md
├── models/
├── textures/
└── icons/
```

## Run locally

A local HTTP server is recommended because the app uses ES modules.

### Python

```bash
cd eye-anatomy-explorer
python -m http.server 8080
```

Open `http://localhost:8080`.

### Node

```bash
npx serve .
```

## Deploy to Cloudflare Pages

1. Put this folder in a GitHub repository.
2. In Cloudflare Pages, create a project from the repository.
3. Framework preset: none / static.
4. Build command: none.
5. Output directory: `/` (the repository root).
6. Deploy.

No backend is required for the MVP.

## Included functionality

- Real Three.js/WebGL geometry
- OrbitControls rotation, zoom and pan
- Raycast selection of anatomical structures
- Highlighting and data-driven information panel
- Anatomy sidebar and instant search
- Predefined anterior/lateral/posterior/cross-section views
- Section mode using a real Three.js clipping plane
- Layer visibility / transparent / hidden states
- Per-structure opacity controls
- Selection isolation
- LocalStorage personal notes
- Shareable URL state including selected structure, camera and section state
- Clipboard/API share support where available
- PNG viewport capture
- Responsive mobile layout
- Automatic 3-second introductory rotation

## Medical-content note

This is an educational visualization, not a diagnostic device. The procedural model intentionally simplifies microscopic and spatial anatomy. Clinical text is kept concise and should be reviewed by an ophthalmology/anatomy subject-matter expert before formal teaching or clinical use.

## Replacing the procedural model with a professional GLB/GLTF model

The rendering and interaction architecture is deliberately data-driven. A production anatomical GLB can replace the procedural meshes without changing the UI, notes, sharing or selection architecture.

Recommended migration:

1. Add a professional, properly licensed GLB to `models/eye.glb`.
2. Import `GLTFLoader` from `three/addons/loaders/GLTFLoader.js`.
3. Load the model during `buildEye()`.
4. Give each selectable mesh a `userData.anatomyId` matching a key in `anatomy-data.js`.
5. Populate `anatomyMeshes` with the imported meshes and `originalMaterials`.
6. Keep `selectStructure()`, `focusOn()`, layer controls, notes and URL state unchanged.
7. For sectioning, keep the renderer's clipping-plane approach, but test the model's materials and transparent meshes carefully.

## Known limitations of this MVP

- The eye is a procedural educational model, not a histologically or surgically accurate professional anatomical asset.
- Some tiny structures are represented as educational rings, shells or markers so they remain selectable.
- The posterior vessel network is illustrative rather than a complete vascular map.
- URL sharing stores camera/target/section state; the layer panel's individual opacity states are not yet serialized.
- PNG capture is the WebGL viewport only; the HTML information card is not baked into the image.
- Mobile browser performance varies with device GPU capability.
- A professional GLB should be medically reviewed and licensed before production use.
