# 3D Human Eye Anatomy Explorer

An interactive, real-time 3D model of the human eye for anatomy education —
built with plain HTML/CSS/JS and Three.js. No build step, no backend.

## 1. Project structure

```
/index.html         Page shell: toolbar, sidebar, viewport, info panel, modal
/style.css           Dark medical-education UI (glassmorphism used sparingly)
/anatomy-data.js     Anatomy facts: name, category, function, clinical relevance,
                      color, related structures — no rendering code
/app.js              Three.js scene, procedural eye geometry, interaction logic
/README.md           This file
```

There's no `/models` or `/textures` folder yet because the current build uses
procedurally generated geometry (spheres, rings, tubes, cylinders) rather than
a scanned/sculpted 3D asset — see §6 for how to swap in a real one later.

## 2. What's implemented

- Real Three.js scene: OrbitControls rotate/zoom/pan (mouse + touch), 31
  labeled anatomical entries mapped onto 28 distinct 3D meshes
- Click-to-select with highlight (emissive glow + rim outline), dimming of
  unrelated structures, and a data-driven info panel (function + clinical
  relevance + related structures)
- Left sidebar grouped by category, with a live "has a note" indicator
- Instant anatomy search
- Section Mode (Full / Anterior / Posterior / Cross) using a real WebGL
  clipping plane, plus six predefined camera views
- Layers panel: per-structure show/hide and an opacity slider
- Isolate Selected / Show All
- Personal notes per structure, saved to `localStorage`, with an "All My
  Notes" list, edit and delete
- Share View: encodes the selected structure, camera pose, section mode, and
  any layer overrides into a URL (`?s=...`) that reproduces the same view;
  falls back to the clipboard or a manual copy prompt, and uses the native
  Web Share sheet on mobile when available
- Capture View: exports the current viewport (plus the selected structure's
  name, if any) as a downloadable PNG
- Responsive layout: 3-column desktop, bottom-sheet anatomy list / info
  panel on mobile with floating action buttons
- A 3-second auto-rotate demo intro on first load (skipped when opening a
  shared link)

## 3. How to run locally

No build tools are required. The three files must stay in the same folder
because `index.html` loads `style.css`, `anatomy-data.js`, and `app.js` by
relative path, and both need an internet connection the first time so the
browser can fetch Three.js and OrbitControls from a CDN.

**Easiest:** double-click `index.html` to open it directly in a browser
(`file://`) — this works because the app has no server-side dependency and
doesn't `fetch()` any local asset files.

**Recommended (avoids occasional browser file:// quirks):** serve the folder
over HTTP:

```bash
cd eye-explorer
python3 -m http.server 8080
# then open http://localhost:8080
```

## 4. Deploying to Cloudflare Pages

1. Put `index.html`, `style.css`, `anatomy-data.js`, and `README.md` (optional)
   in a folder — no build command is needed.
2. **Dashboard:** Cloudflare Dashboard → Workers & Pages → Create → Pages →
   Upload assets → drag in the folder → deploy.
   **Or via CLI:**
   ```bash
   npm install -g wrangler
   wrangler pages deploy ./eye-explorer --project-name eye-anatomy-explorer
   ```
3. Build settings: Framework preset "None", build command empty, output
   directory `/` (the folder itself).
4. Once deployed, the CDN scripts (jsdelivr) and the page's own assets are
   both served over HTTPS, so Web Share, Clipboard, and camera-permission-free
   features all work normally.

## 5. Known limitations

- **Placeholder geometry, not a scanned model.** All structures are built
  from primitive shapes (spheres, rings, tori, tubes) sized to be anatomically
  *plausible*, not metrically precise. It's built for teaching orientation and
  spatial relationships, not for clinical measurement.
- **Section Mode has no "cut face" cap.** The clipping plane removes geometry
  beyond the plane but doesn't cap the cut with a solid face (that needs a
  stencil-buffer technique), so cut edges show the material's back face
  rather than a flat cross-section surface.
- **"View" buttons vs. "Section Mode" panel are related but distinct.** The
  toolbar's Anterior/Lateral/Superior/Posterior/Cross/Full buttons move the
  *camera*. The floating Section Mode panel controls the *clipping plane*.
  Picking "Cross Section" or "Full Eye" from the toolbar also sets the
  matching section mode for convenience; the other camera presets leave
  whatever section mode is currently active untouched.
- **Isolate Mode + deselect.** Clicking empty space while Isolate is active
  clears the selection highlight but doesn't automatically restore
  visibility — click the toolbar's Isolate/Show All button (or Reset) to
  bring every layer back.
- **No post-processing.** The "glow" on a selected structure is a cheap
  back-side rim mesh, not a full outline-pass; this keeps performance high on
  laptops and phones but the glow is subtler than a dedicated outline shader.
- **Zonule fibers and retinal vessels are simplified.** Real zonule fiber
  count and retinal vascular branching are far denser; this build uses a
  representative subset for clarity and frame rate.
- **One representative extraocular muscle**, not all six, is modeled — swap
  in the rest by following the same pattern in `app.js`.
- Tested against the described interactions and passes a manual click-through
  of every item in §2, but there's no automated test suite in this build.

## 6. Replacing the procedural model with a real GLB/GLTF

The app was structured so this is a swap, not a rewrite:

1. In `app.js`, everything the rest of the app depends on is the `registry`
   object: `registry[meshId] = { root: Object3D, materials: [Material], baseOpacity }`
   plus the `pickable` array of leaf meshes used for raycasting.
2. Replace the body of `buildEye()` with a `GLTFLoader` call. For each mesh in
   the loaded model whose name matches an `id` in `anatomy-data.js`, call the
   existing `register(id, mesh, mesh.material)` helper instead of building
   primitive geometry — everything else (sidebar, search, info panel, layers,
   section mode, notes, sharing) keeps working unmodified because it only
   reads from `registry` and `ANATOMY_DATA`.
3. Add `<script src=".../GLTFLoader.js"></script>` (same CDN/version family as
   the other Three.js scripts) to `index.html`.
4. If the model's materials aren't `MeshStandardMaterial` (or don't have
   `transparent`/`opacity` enabled), wrap them once at load time the same way
   `mat()` currently does, so the Layers panel's opacity slider keeps working.
5. Keep mesh names / IDs aligned with `anatomy-data.js`'s `meshId` field — that
   file doesn't need to change at all.

## 7. Medical accuracy note

This is an educational visualization, not a diagnostic tool — the interface
says so directly. Terminology follows standard ophthalmic anatomy; content
was written to be concise and avoid unsupported claims.
