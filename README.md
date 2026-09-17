# Eye Anatomy Explorer

Static, single-page Three.js explorer of the human eye with a glassmorphism UI.

## Files

- `index.html` – layout, icons, import map (Three.js 0.180 from jsDelivr)
- `style.css` – glassmorphism theme and responsive layout
- `eye.js` – procedural 3D eye: layered cutaway (sclera, choroid, retina, vitreous), glass cornea and lens, textured iris, ciliary body and processes, zonular fibres, trabecular meshwork, Canal of Schlemm, extraocular muscles, optic nerve, and generated retinal/episcleral blood vessels
- `app.js` – rendering, camera views, picking, callout labels, toolbar (Hide / Isolate / X-Ray), quick-view thumbnails, info panel, notes, quiz, share links
- `anatomy-data.js` – structure content (overview, type, location, function, clinical relevance, key point)
- `wrangler.jsonc` – Cloudflare Workers static-assets config

## Run locally

```bash
python -m http.server 8080
# open http://localhost:8080
```

## Deploy

Pushes are built by Cloudflare Workers Builds. `main` is production; other branches get a per-version preview URL on the Worker's Deployments page.

## Limits

The model is procedural and educational, not a medically validated asset. For photoreal accuracy, load a licensed GLB in `eye.js` and tag each mesh with `userData.anatomyId` matching a key in `anatomy-data.js`; the rest of the app keeps working unchanged.
