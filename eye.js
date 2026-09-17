// Procedural, anatomically-layered 3D eye with a cutaway wedge.
// Local frame: optical axis = +Y (cornea at +Y). The caller rotates the group so +Y faces the viewer.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// Cutaway wedge (azimuth, sphere convention x=-ρcosφ, z=ρsinφ)
export const CUT_START = 148 * DEG;
export const CUT_END = 246 * DEG;
const PHI0 = CUT_END;                    // solid starts where the cut ends
const PHI_LEN = TAU - (CUT_END - CUT_START);

const R = { scleraOut: 1.2, scleraIn: 1.135, choroidIn: 1.105, retinaIn: 1.078 };

export function inCut(phi) {
  const p = ((phi % TAU) + TAU) % TAU;
  return p > CUT_START - 2 * DEG && p < CUT_END + 2 * DEG;
}
const P = (rho, y, phi) => new THREE.Vector3(-rho * Math.cos(phi), y, rho * Math.sin(phi));
const sph = (r, th, phi) => P(r * Math.sin(th), r * Math.cos(th), phi);
const arc = (r, t0, t1, n = 48, cy = 0) => {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = (t0 + (t1 - t0) * i / n) * DEG; out.push([r * Math.sin(t), cy + r * Math.cos(t)]); }
  return out;
};

// ---------------------------------------------------------------- random
let seed = 1337;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rr = (a, b) => a + (b - a) * rnd();

// ---------------------------------------------------------------- revolve
// profile: array of polylines (smooth within, hard edge between) forming one closed loop.
function revolve(profile, { phiStart = PHI0, phiLen = PHI_LEN, segs = 96, caps = true, uv } = {}) {
  const all = profile.flat();
  let total = 0; const lens = [0];
  for (let i = 1; i < all.length; i++) { total += Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]); lens.push(total); }
  const uvf = uv || ((rho, y, phi, t) => [phi / TAU, t]);
  const sides = [];
  let offset = 0;
  profile.forEach((line) => {
    const pos = [], uvs = [], idx = [];
    const m = line.length;
    for (let j = 0; j <= segs; j++) {
      const phi = phiStart + phiLen * j / segs;
      for (let k = 0; k < m; k++) {
        const [rho, y] = line[k];
        const v = P(rho, y, phi); pos.push(v.x, v.y, v.z);
        uvs.push(...uvf(rho, y, phi, lens[offset + k] / total));
      }
    }
    for (let j = 0; j < segs; j++) for (let k = 0; k < m - 1; k++) {
      const a = j * m + k, b = (j + 1) * m + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    sides.push(g);
    offset += m;
  });
  const side = mergeGeometries(sides);
  let cap = null;
  if (caps && phiLen < TAU - 1e-3) {
    // de-duplicate closing/joining points for triangulation
    const pts = [];
    all.forEach(p => { const l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - p[0], l[1] - p[1]) > 1e-6) pts.push(p); });
    if (Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-6) pts.pop();
    const tris = THREE.ShapeUtils.triangulateShape(pts.map(p => new THREE.Vector2(p[0], p[1])), []);
    const caps2 = [phiStart, phiStart + phiLen].map((phi, s) => {
      const pos = [], nor = [], uvs = [];
      const n = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).multiplyScalar(s ? 1 : -1);
      pts.forEach(([rho, y]) => { const v = P(rho, y, phi); pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); uvs.push(rho * 0.8, y * 0.8 + 0.5); });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(tris.flat());
      return g;
    });
    cap = mergeGeometries(caps2);
  }
  return { side, cap };
}

// ---------------------------------------------------------------- canvas textures
function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d"); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
function noise(ctx, w, h, n, colors, rMax = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rnd() * colors.length) | 0];
    ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, rnd() * rMax, 0, TAU); ctx.fill();
  }
}
function branch2D(ctx, x, y, ang, len, width, color, depth) {
  ctx.strokeStyle = color; ctx.lineCap = "round";
  let px = x, py = y;
  for (let i = 0; i < len; i++) {
    ang += rr(-0.35, 0.35);
    const nx = px + Math.cos(ang) * 6, ny = py + Math.sin(ang) * 6;
    ctx.lineWidth = Math.max(0.5, width * (1 - i / len));
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
    px = nx; py = ny;
    if (depth > 0 && rnd() < 0.12) branch2D(ctx, px, py, ang + rr(-1.2, 1.2), len * 0.55, width * 0.6, color, depth - 1);
  }
}

const TEX = {};
function buildTextures() {
  // Iris: radial stroma fibres, crypts, collarette, dark limbal ring
  TEX.iris = canvasTex(1024, 1024, (c, w) => {
    const cx = w / 2, R0 = w / 2;
    const g = c.createRadialGradient(cx, cx, R0 * 0.28, cx, cx, R0);
    g.addColorStop(0, "#c9a24a"); g.addColorStop(0.18, "#8a8a4a"); g.addColorStop(0.3, "#3d8fbf");
    g.addColorStop(0.62, "#2f86c8"); g.addColorStop(0.9, "#1d5a92"); g.addColorStop(1, "#0b1f3a");
    c.fillStyle = g; c.fillRect(0, 0, w, w);
    for (let i = 0; i < 2600; i++) {
      const a = rnd() * TAU, r0 = R0 * rr(0.3, 0.5), r1 = R0 * rr(0.75, 0.99);
      const light = rnd() < 0.5;
      c.strokeStyle = light ? `rgba(${170 + rnd() * 70},${210 + rnd() * 40},255,${rr(0.12, 0.45)})` : `rgba(5,30,60,${rr(0.15, 0.5)})`;
      c.lineWidth = rr(0.6, 2.2);
      c.beginPath();
      const wob = rr(-0.08, 0.08);
      c.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
      c.quadraticCurveTo(cx + Math.cos(a + wob) * (r0 + r1) / 2, cx + Math.sin(a + wob) * (r0 + r1) / 2, cx + Math.cos(a + wob * 0.5) * r1, cx + Math.sin(a + wob * 0.5) * r1);
      c.stroke();
    }
    for (let i = 0; i < 90; i++) { // crypts
      const a = rnd() * TAU, r = R0 * rr(0.42, 0.8);
      c.fillStyle = `rgba(4,20,45,${rr(0.25, 0.55)})`;
      c.beginPath(); c.ellipse(cx + Math.cos(a) * r, cx + Math.sin(a) * r, rr(4, 14), rr(2, 5), a, 0, TAU); c.fill();
    }
    c.strokeStyle = "rgba(230,200,120,.55)"; c.lineWidth = 7; // collarette
    c.beginPath();
    for (let i = 0; i <= 120; i++) { const a = i / 120 * TAU, r = R0 * (0.44 + 0.02 * Math.sin(i * 1.7)); c.lineTo(cx + Math.cos(a) * r, cx + Math.sin(a) * r); }
    c.stroke();
    const rim = c.createRadialGradient(cx, cx, R0 * 0.86, cx, cx, R0);
    rim.addColorStop(0, "rgba(5,15,35,0)"); rim.addColorStop(1, "rgba(5,15,35,.9)");
    c.fillStyle = rim; c.fillRect(0, 0, w, w);
    const pr = c.createRadialGradient(cx, cx, R0 * 0.26, cx, cx, R0 * 0.34);
    pr.addColorStop(0, "rgba(20,10,5,.9)"); pr.addColorStop(1, "rgba(20,10,5,0)");
    c.fillStyle = pr; c.fillRect(0, 0, w, w);
  });

  // Sclera: porcelain white, subtle pink, fine surface noise
  TEX.sclera = canvasTex(2048, 1024, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#f7e2dc"); g.addColorStop(0.2, "#f6eeea"); g.addColorStop(0.7, "#efe4de"); g.addColorStop(1, "#e7cfc6");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    noise(c, w, h, 16000, ["rgba(210,160,150,.10)", "rgba(255,255,255,.25)", "rgba(190,120,110,.06)"], 3);
    for (let i = 0; i < 60; i++) branch2D(c, rnd() * w, rr(40, h), rr(0, TAU), 40, 1.6, "rgba(200,70,70,.18)", 2);
  });
  TEX.scleraCap = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#f3e9e3"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { c.strokeStyle = `rgba(200,170,160,${rr(.05, .22)})`; c.lineWidth = rr(.5, 1.5); const y = rnd() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * .3, y + rr(-8, 8), w * .6, y + rr(-8, 8), w, y + rr(-8, 8)); c.stroke(); }
  }, { repeat: [3, 3] });

  // Choroid: deep red with dense vessel mesh
  TEX.choroid = canvasTex(2048, 1024, (c, w, h) => {
    c.fillStyle = "#5c1116"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) branch2D(c, rnd() * w, rnd() * h, rr(0, TAU), 30, 4, `rgba(${200 + rnd() * 55},${40 + rnd() * 40},50,.75)`, 3);
    noise(c, w, h, 6000, ["rgba(30,0,5,.4)", "rgba(255,120,110,.15)"], 3);
  });
  TEX.choroidCap = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#7a1a20"; c.fillRect(0, 0, w, h); noise(c, w, h, 900, ["#a02a30", "#4a0b10", "#c0444a"], 5);
  }, { repeat: [4, 4] });

  // Retina: warm orange fundus glow
  TEX.retina = canvasTex(2048, 1024, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#9c2a14"); g.addColorStop(0.35, "#d24d22"); g.addColorStop(0.75, "#e86a2c"); g.addColorStop(1, "#c4451c");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) branch2D(c, rnd() * w, rnd() * h, rr(0, TAU), 26, 3, "rgba(150,30,20,.25)", 2);
    noise(c, w, h, 20000, ["rgba(255,170,90,.12)", "rgba(110,15,10,.16)"], 3);
  });
  TEX.retinaCap = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = "#f0843c"; c.fillRect(0, 0, w, h); noise(c, w, h, 900, ["#ffb070", "#c85a20"], 3);
  }, { repeat: [4, 4] });

  // Muscle: striated red
  TEX.muscle = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#b52a2a"; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) {
      c.fillStyle = `rgba(${rnd() < .5 ? "255,120,110" : "70,5,10"},${rr(.15, .45)})`;
      c.fillRect(x + rr(-1, 1), 0, rr(1, 2.2), h);
    }
    c.fillStyle = "rgba(255,230,220,.25)"; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 6, w, 6);
  }, { repeat: [1, 1] });

  // Ciliary body: red with radial pleats
  TEX.ciliary = canvasTex(1024, 256, (c, w, h) => {
    c.fillStyle = "#a8262f"; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 7) { c.fillStyle = `rgba(${rnd() < .5 ? "255,140,140" : "60,0,10"},${rr(.2, .5)})`; c.fillRect(x, 0, 3, h); }
  }, { repeat: [12, 1] });

  // Optic nerve: yellow fascicles
  TEX.nerve = canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = "#e9a93a"; c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 5) { c.fillStyle = `rgba(${rnd() < .5 ? "255,230,150" : "150,80,10"},${rr(.2, .55)})`; c.fillRect(x + rr(-1, 1), 0, rr(2, 4), h); }
  }, { repeat: [3, 1] });

  // Lens: faint concentric lamellae (used as alpha-ish colour)
  TEX.lens = canvasTex(512, 512, (c, w) => {
    c.fillStyle = "#fff9ef"; c.fillRect(0, 0, w, w);
    for (let r = 10; r < w / 2; r += 9) { c.strokeStyle = `rgba(210,190,150,${rr(.05, .15)})`; c.lineWidth = 1.2; c.beginPath(); c.arc(w / 2, w / 2, r, 0, TAU); c.stroke(); }
  });
}

// ---------------------------------------------------------------- vessels on a sphere
function growVessels(opts) {
  const { r, th0, phi0, heading, steps, width, minTh, maxTh, clipCut = true, depth, branchP = 0.09, turn = 0.22, ds = 0.022, into, budget } = opts;
  if (budget.n-- <= 0) return;
  let th = th0, phi = phi0, psi = heading, w = width;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    if (th < minTh || th > maxTh || (clipCut && inCut(phi))) break;
    pts.push(sph(r, th, phi));
    psi += rr(-turn, turn);
    th += (ds * Math.cos(psi)) / r;
    phi += (ds * Math.sin(psi)) / (r * Math.max(0.15, Math.sin(th)));
    if (depth > 0 && i > 3 && budget.n > 0 && rnd() < branchP) {
      growVessels({ ...opts, th0: th, phi0: phi, heading: psi + (rnd() < .5 ? 1 : -1) * rr(0.5, 1.1), steps: Math.floor((steps - i) * rr(0.45, 0.8)), width: w * 0.62, depth: depth - 1 });
    }
  }
  if (pts.length >= 3) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, Math.min(120, pts.length * 2), w, 5, false);
    // taper the tube toward its end
    const p = g.attributes.position, segsR = 6;
    const rings = p.count / segsR;
    for (let k = 0; k < rings; k++) {
      const t = k / (rings - 1), s = 1 - 0.7 * t;
      const c = curve.getPointAt(Math.min(1, t));
      for (let j = 0; j < segsR; j++) {
        const i = k * segsR + j;
        const v = new THREE.Vector3().fromBufferAttribute(p, i).sub(c).multiplyScalar(s).add(c);
        p.setXYZ(i, v.x, v.y, v.z);
      }
    }
    g.deleteAttribute("uv");
    into.push(g);
  }
}


// ---------------------------------------------------------------- glass rim (fresnel glow)
function fresnelMat(color, power = 2.2, strength = 0.9) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPow: { value: power }, uStr: { value: strength } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPow; uniform float uStr; varying vec3 vN; varying vec3 vV;
      void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow); gl_FragColor = vec4(uColor * f * uStr, f * uStr); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
  });
}

// ---------------------------------------------------------------- muscle sweep (rounded, tapered band)
function muscleSweep(phiC, t0, t1, apex) {
  const B = new THREE.Vector3(Math.sin(phiC), 0, Math.cos(phiC));
  const thick = (t) => 0.03 + 0.07 * Math.sin(Math.min(1, t / 0.75) * Math.PI * 0.5) - 0.03 * Math.max(0, (t - 0.8) / 0.2);
  const wide = (t) => 0.16 + 0.1 * Math.sin(Math.min(1, t / 0.6) * Math.PI * 0.5) - 0.18 * Math.max(0, (t - 0.55) / 0.45);
  const center = (t) => {
    if (t <= 0.62) { const th = (52 + (150 - 52) * t / 0.62) * DEG; return sph(1.2 + thick(t) * 0.75, th, phiC); }
    const k = (t - 0.62) / 0.38, a = sph(1.2 + thick(0.62) * 0.75, 150 * DEG, phiC);
    const ctrl = sph(1.45, 172 * DEG, phiC);
    return a.clone().multiplyScalar((1 - k) ** 2).add(ctrl.multiplyScalar(2 * k * (1 - k))).add(apex.clone().multiplyScalar(k * k));
  };
  const L = 70, M = 18, pos = [], uvs = [], idx = [];
  for (let i = 0; i <= L; i++) {
    const t = t0 + (t1 - t0) * i / L;
    const c = center(t), T = center(Math.min(1, t + 0.004)).sub(center(Math.max(0, t - 0.004))).normalize();
    let N = new THREE.Vector3().crossVectors(B, T).normalize();
    if (N.dot(c) < 0) N.negate();
    const Bb = new THREE.Vector3().crossVectors(T, N).normalize();
    const h = thick(t), w = Math.max(0.03, wide(t));
    for (let j = 0; j <= M; j++) {
      const a = j / M * TAU;
      const p = c.clone().addScaledVector(N, Math.sin(a) * h).addScaledVector(Bb, Math.cos(a) * w * (1 - 0.15 * Math.sin(a) ** 2));
      pos.push(p.x, p.y, p.z); uvs.push(j / M * 2, t * 2);
    }
  }
  for (let i = 0; i < L; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- build
export function buildEye(registry) {
  buildTextures();
  seed = 1337;
  const eye = new THREE.Group();
  const add = (id, obj, parent = eye) => {
    obj.traverse(o => { if (o.isMesh || o.isLine || o.isPoints) { o.userData.anatomyId = id; (registry[id] ||= []).push(o); o.castShadow = o.isMesh; o.receiveShadow = o.isMesh; } });
    parent.add(obj);
    return obj;
  };
  const mesh = (geo, mat) => new THREE.Mesh(geo, mat);
  const std = (p) => new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, ...p });

  // --- Sclera
  const th0 = Math.asin(0.58 / R.scleraOut) / DEG; // limbus
  const scl = revolve([arc(R.scleraOut, th0, 172, 90), [[R.scleraOut * Math.sin(172 * DEG), R.scleraOut * Math.cos(172 * DEG)], [R.scleraIn * Math.sin(172 * DEG), R.scleraIn * Math.cos(172 * DEG)]], arc(R.scleraIn, 172, 31.5, 90), [[R.scleraIn * Math.sin(31.5 * DEG), R.scleraIn * Math.cos(31.5 * DEG)], [R.scleraOut * Math.sin(th0 * DEG), R.scleraOut * Math.cos(th0 * DEG)]]],
    { segs: 140, uv: (rho, y, phi) => [phi / TAU, 1 - Math.acos(Math.max(-1, Math.min(1, y / Math.hypot(rho, y)))) / Math.PI] });
  const scleraMat = std({ map: TEX.sclera, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.25, sheen: 0.4, sheenColor: new THREE.Color("#ffd6d0") });
  const scleraG = new THREE.Group();
  scleraG.add(mesh(scl.side, scleraMat));
  scleraG.add(mesh(scl.cap, std({ map: TEX.scleraCap, roughness: 0.7 })));
  add("sclera", scleraG);

  // --- Choroid
  const ch = revolve([arc(R.scleraIn - 0.002, 52, 173, 80), arc(R.choroidIn, 173, 52, 80)], { segs: 140, uv: (rho, y, phi) => [phi / TAU, Math.acos(y / Math.hypot(rho, y)) / Math.PI] });
  const chG = new THREE.Group();
  chG.add(mesh(ch.side, std({ map: TEX.choroid, roughness: 0.5, clearcoat: 0.2 })));
  chG.add(mesh(ch.cap, std({ map: TEX.choroidCap, roughness: 0.6 })));
  add("choroid", chG);

  // --- Retina
  const re = revolve([arc(R.choroidIn - 0.002, 57, 173, 80), arc(R.retinaIn, 173, 57, 80)], { segs: 140, uv: (rho, y, phi) => [phi / TAU, Math.acos(y / Math.hypot(rho, y)) / Math.PI] });
  const reG = new THREE.Group();
  reG.add(mesh(re.side, std({ map: TEX.retina, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4, emissive: new THREE.Color("#5a1500"), emissiveIntensity: 0.35 })));
  reG.add(mesh(re.cap, std({ map: TEX.retinaCap, roughness: 0.6 })));
  add("retina", reG);

  // Retinal vessels radiate from the optic disc (inner retinal surface)
  const discTh = 158 * DEG, discPhi = 40 * DEG;
  const art = [], vein = [];
  const rb = { n: 70 }, vb = { n: 70 };
  for (let i = 0; i < 7; i++) {
    const h = i / 7 * TAU + rr(-.2, .2);
    growVessels({ r: R.retinaIn - 0.006, th0: discTh, phi0: discPhi, heading: h, steps: 95, width: 0.0115, minTh: 58 * DEG, maxTh: 179 * DEG, depth: 3, into: art, budget: rb, turn: 0.12, branchP: 0.07 });
    growVessels({ r: R.retinaIn - 0.009, th0: discTh, phi0: discPhi, heading: h + 0.25, steps: 95, width: 0.0145, minTh: 58 * DEG, maxTh: 179 * DEG, depth: 3, into: vein, budget: vb, turn: 0.12, branchP: 0.07 });
  }
  const artMat = std({ color: "#ff3b2e", roughness: 0.3, clearcoat: 0.8, emissive: new THREE.Color("#4a0000"), emissiveIntensity: 0.4 });
  const veinMat = std({ color: "#8e0d1a", roughness: 0.35, clearcoat: 0.8 });
  const rv = new THREE.Group();
  if (art.length) rv.add(mesh(mergeGeometries(art), artMat));
  if (vein.length) rv.add(mesh(mergeGeometries(vein), veinMat));
  add("retina", rv);

  // Optic disc & macula
  const onSurface = (m, r, th, phi) => { const p = sph(r, th, phi); m.position.copy(p); m.lookAt(0, 0, 0); return m; };
  add("opticDisc", onSurface(mesh(new THREE.CircleGeometry(0.085, 40), std({ color: "#ffd9a0", roughness: 0.4, emissive: new THREE.Color("#ff9a40"), emissiveIntensity: 0.25 })), R.retinaIn - 0.004, discTh, discPhi));
  add("opticDisc", onSurface(mesh(new THREE.CircleGeometry(0.035, 30), std({ color: "#fff3dc", roughness: 0.3 })), R.retinaIn - 0.006, discTh, discPhi));
  const macG = new THREE.Group();
  macG.add(onSurface(mesh(new THREE.CircleGeometry(0.13, 40), std({ color: "#8a2410", roughness: 0.6, transparent: true, opacity: 0.8 })), R.retinaIn - 0.004, 176 * DEG, 30 * DEG));
  macG.add(onSurface(mesh(new THREE.CircleGeometry(0.035, 30), std({ color: "#3a0c05", roughness: 0.4 })), R.retinaIn - 0.006, 176 * DEG, 30 * DEG));
  add("macula", macG);

  // Episcleral / conjunctival vessels on the outer sclera
  const sv = [], sv2 = [];
  const sb = { n: 260 };
  for (let i = 0; i < 46; i++) {
    const phi = rnd() * TAU; if (inCut(phi)) continue;
    growVessels({ r: R.scleraOut + 0.004, th0: rr(th0 + 2, th0 + 10) * DEG, phi0: phi, heading: rr(-0.4, 0.4), steps: rr(20, 60) | 0, width: rr(0.004, 0.008), minTh: th0 * DEG, maxTh: 150 * DEG, depth: 2, into: rnd() < .6 ? sv : sv2, budget: sb, turn: 0.35, branchP: 0.14, ds: 0.02 });
  }
  for (let i = 0; i < 26; i++) {
    const phi = rnd() * TAU; if (inCut(phi)) continue;
    growVessels({ r: R.scleraOut + 0.004, th0: rr(100, 165) * DEG, phi0: phi, heading: rr(0, TAU), steps: 50, width: rr(0.006, 0.01), minTh: th0 * DEG, maxTh: 172 * DEG, depth: 2, into: rnd() < .5 ? sv : sv2, budget: sb, turn: 0.3, branchP: 0.12 });
  }
  const svG = new THREE.Group();
  if (sv.length) svG.add(mesh(mergeGeometries(sv), std({ color: "#d9272e", roughness: 0.35, clearcoat: 0.6 })));
  if (sv2.length) svG.add(mesh(mergeGeometries(sv2), std({ color: "#9b1422", roughness: 0.35, clearcoat: 0.6 })));
  add("conjunctiva", svG);

  // Conjunctiva: thin translucent film over anterior sclera
  const cj = revolve([arc(R.scleraOut + 0.012, th0, 62, 40), arc(R.scleraOut + 0.002, 62, th0, 40)], { segs: 120 });
  add("conjunctiva", mesh(cj.side, std({ color: "#ffd2dc", transparent: true, opacity: 0.18, roughness: 0.15, clearcoat: 1, depthWrite: false })));

  // --- Cornea (full, glass)
  const Rc = 0.846, yc = 0.434;
  const aC = Math.asin(0.58 / Rc) / DEG;
  const cornea = revolve([arc(Rc, 0.0001, aC, 40, yc), [[0.58, yc + Rc * Math.cos(aC * DEG)], [0.555, yc + 0.79 * Math.cos(Math.asin(0.555 / 0.79))]], arc(0.79, Math.asin(0.555 / 0.79) / DEG, 0.0001, 40, yc)], { phiStart: 0, phiLen: TAU, segs: 128, caps: false });
  const corneaMat = new THREE.MeshPhysicalMaterial({ color: "#eaf8ff", transmission: 1, thickness: 0.12, ior: 1.376, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 1, envMapIntensity: 1.6, specularIntensity: 1, attenuationColor: new THREE.Color("#bfe8ff"), attenuationDistance: 3 });
  add("cornea", mesh(cornea.side, corneaMat));
  add("cornea", mesh(cornea.side, fresnelMat("#9fdcff", 2.4, 0.9)));
  // limbal ring (grey-blue transition)
  add("cornea", mesh(revolve([arc(R.scleraOut + 0.004, th0 - 0.3, th0 + 2.2, 6), arc(R.scleraOut - 0.004, th0 + 2.2, th0 - 0.3, 6)], { phiStart: 0, phiLen: TAU, segs: 128, caps: false }).side, std({ color: "#8fa6b8", transparent: true, opacity: 0.55, roughness: 0.3 })));

  // --- Anterior chamber (aqueous)
  const ac = revolve([arc(0.785, 0.0001, 43, 30, yc), [[0.55, 0.99], [0.2, 0.955], [0.0001, 0.955]]], { phiStart: 0, phiLen: TAU, segs: 64, caps: false });
  add("anteriorChamber", mesh(ac.side, std({ color: "#9fd4ff", transparent: true, opacity: 0.06, roughness: 0.1, depthWrite: false })));

  // --- Iris (textured disc with thickness)
  const irisUV = (rho, y, phi) => [0.5 - (rho / 0.6) * Math.cos(phi) * 0.5, 0.5 + (rho / 0.6) * Math.sin(phi) * 0.5];
  const iris = revolve([[[0.18, 0.948], [0.3, 0.958], [0.45, 0.962], [0.6, 0.955]], [[0.6, 0.955], [0.6, 0.93]], [[0.6, 0.93], [0.45, 0.925], [0.3, 0.925], [0.18, 0.93]], [[0.18, 0.93], [0.18, 0.948]]], { phiStart: 0, phiLen: TAU, segs: 160, caps: false, uv: irisUV });
  add("iris", mesh(iris.side, std({ map: TEX.iris, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: new THREE.Color("#9fdcff") })));
  const pupil = mesh(new THREE.CircleGeometry(0.182, 64), new THREE.MeshBasicMaterial({ color: "#020306", side: THREE.DoubleSide }));
  pupil.rotation.x = -Math.PI / 2; pupil.position.y = 0.935;
  add("pupil", pupil);

  // --- Posterior chamber
  const pc = revolve([[[0.2, 0.922], [0.59, 0.922], [0.6, 0.86], [0.47, 0.73], [0.35, 0.86], [0.2, 0.9]]], { phiStart: 0, phiLen: TAU, segs: 64, caps: false });
  add("posteriorChamber", mesh(pc.side, std({ color: "#8fb0ff", transparent: true, opacity: 0.05, depthWrite: false })));

  // --- Lens
  const lensProfile = (a, front, back, cy, n = 30) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const r = a * i / n; pts.push([r, cy + front * Math.pow(Math.max(0, 1 - (r / a) ** 2), 0.62)]); }
    for (let i = n; i >= 0; i--) { const r = a * i / n; pts.push([r, cy - back * Math.pow(Math.max(0, 1 - (r / a) ** 2), 0.58)]); }
    pts[0][0] = 0.0001; pts[pts.length - 1][0] = 0.0001;
    return [pts];
  };
  const lens = revolve(lensProfile(0.46, 0.2, 0.17, 0.72), { phiStart: 0, phiLen: TAU, segs: 128, caps: false, uv: (rho, y, phi) => [0.5 - rho * Math.cos(phi), 0.5 + rho * Math.sin(phi)] });
  const lensMat = std({ color: "#f7f1e6", map: TEX.lens, transparent: true, opacity: 0.62, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04, sheen: 0.8, sheenColor: new THREE.Color("#d8ecff"), iridescence: 0.35, depthWrite: false, emissive: new THREE.Color("#3a4a5a"), emissiveIntensity: 0.25 });
  add("lens", mesh(lens.side, lensMat));
  add("lens", mesh(lens.side, fresnelMat("#eaf6ff", 1.6, 1.4)));
  const nuc = revolve(lensProfile(0.26, 0.1, 0.09, 0.72), { phiStart: 0, phiLen: TAU, segs: 64, caps: false });
  add("lens", mesh(nuc.side, std({ color: "#f3dfb5", transparent: true, opacity: 0.22, roughness: 0.2, depthWrite: false })));

  // --- Ciliary body (sectioned) + processes
  const cbProfile = [arc(R.scleraIn - 0.002, 31.5, 56, 30), [[R.scleraIn * Math.sin(56 * DEG), R.scleraIn * Math.cos(56 * DEG)], [0.8, 0.6], [0.64, 0.66], [0.575, 0.72], [0.565, 0.8], [0.585, 0.87], [(R.scleraIn - 0.002) * Math.sin(31.5 * DEG), (R.scleraIn - 0.002) * Math.cos(31.5 * DEG)]]];
  const cb = revolve(cbProfile, { segs: 140, uv: (rho, y, phi, t) => [phi / TAU, t] });
  const cbG = new THREE.Group();
  const cbMat = std({ map: TEX.ciliary, roughness: 0.45, clearcoat: 0.4 });
  cbG.add(mesh(cb.side, cbMat));
  cbG.add(mesh(cb.cap, std({ map: TEX.muscle, roughness: 0.5 })));
  const procGeo = new THREE.SphereGeometry(1, 10, 8);
  const procs = new THREE.InstancedMesh(procGeo, std({ color: "#d4454e", roughness: 0.35, clearcoat: 0.6 }), 76);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  let pi = 0;
  for (let i = 0; i < 76; i++) {
    const phi = i / 76 * TAU;
    if (inCut(phi)) continue;
    const p = P(0.6, 0.745, phi);
    q.setFromEuler(new THREE.Euler(0, phi + Math.PI / 2, 0));
    s.set(0.012, 0.06, 0.05);
    m4.compose(p, q, s);
    procs.setMatrixAt(pi++, m4);
  }
  procs.count = pi;
  cbG.add(procs);
  add("ciliaryBody", cbG);

  // --- Zonular fibres (clean white fibres, full circle)
  const fib = [];
  for (let i = 0; i < 200; i++) {
    const phi = i / 200 * TAU + rr(-0.01, 0.01);
    const from = P(rr(0.585, 0.62), rr(0.7, 0.82), phi);
    const toY = [0.72 + rr(0.02, 0.08), 0.72, 0.72 - rr(0.02, 0.07)][i % 3];
    const toR = Math.sqrt(Math.max(0, 1 - ((toY - 0.72) / (toY > 0.72 ? 0.2 : 0.17)) ** 2)) * 0.45 * 0.98 + 0.004;
    const to = P(toR, toY, phi + rr(-0.03, 0.03));
    const mid = from.clone().lerp(to, 0.5);
    fib.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 6, 0.0038, 4, false));
  }
  add("zonules", mesh(mergeGeometries(fib.map(g => { g.deleteAttribute("uv"); return g; })), std({ color: "#f4f8ff", roughness: 0.25, emissive: new THREE.Color("#9fb8d0"), emissiveIntensity: 0.25, transparent: true, opacity: 0.92 })));

  // --- Trabecular meshwork & Canal of Schlemm (angle)
  const ring = (rho, y, rad, id, mat, phiStart = 0, phiLen = TAU) => {
    const pts = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * TAU; pts.push([rho + Math.cos(a) * rad, y + Math.sin(a) * rad]); }
    return add(id, mesh(revolve([pts], { phiStart, phiLen, segs: 140, caps: false }).side, mat));
  };
  ring(0.585, 0.975, 0.016, "trabecular", std({ color: "#7fdcff", roughness: 0.4, emissive: new THREE.Color("#1f6f9a"), emissiveIntensity: 0.5 }));
  ring(0.63, 0.99, 0.013, "schlemm", std({ color: "#46b6ff", roughness: 0.3, emissive: new THREE.Color("#1a78ff"), emissiveIntensity: 0.9 }));

  // --- Vitreous (sectioned gel)
  const vit = revolve([arc(R.retinaIn - 0.004, 58, 179.99, 70), [[0.0001, R.retinaIn * -1], [0.0001, 0.55], [0.3, 0.57], [0.47, 0.68], [0.8, 0.62], [(R.retinaIn - 0.004) * Math.sin(58 * DEG), (R.retinaIn - 0.004) * Math.cos(58 * DEG)]]], { segs: 96 });
  const vitG = new THREE.Group();
  vitG.add(mesh(vit.side, std({ color: "#bfe6ff", transparent: true, opacity: 0.05, roughness: 0.1, depthWrite: false })));
  vitG.add(mesh(vit.cap, std({ color: "#cfeeff", transparent: true, opacity: 0.12, roughness: 0.05, clearcoat: 1, depthWrite: false, emissive: new THREE.Color("#2a5a80"), emissiveIntensity: 0.15 })));
  add("vitreous", vitG);

  // --- Extraocular (rectus) muscles
  const musG = new THREE.Group();
  const musMat = std({ map: TEX.muscle, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.35, sheen: 0.5, sheenColor: new THREE.Color("#ff8a80") });
  const tendonMat = std({ color: "#f3ece2", roughness: 0.3, clearcoat: 0.9 });
  const apex = new THREE.Vector3(0, -2.9, 0);
  [292, 112, 20].forEach((deg) => {
    const ph = deg * DEG;
    musG.add(mesh(muscleSweep(ph, 0.05, 1, apex.clone().add(P(0.12, 0, ph))), musMat));
    musG.add(mesh(muscleSweep(ph, 0, 0.06, apex), tendonMat));
  });
  add("rectusMuscles", musG);

  // --- Optic nerve (exits at the disc, curves back)
  const dir = sph(1, discTh, discPhi).normalize();
  const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
  const nPath = new THREE.CatmullRomCurve3([dir.clone().multiplyScalar(1.05), dir.clone().multiplyScalar(1.6), dir.clone().multiplyScalar(2.2).add(new THREE.Vector3(0, -0.15, 0)).add(side.clone().multiplyScalar(0.05)), dir.clone().multiplyScalar(2.9).add(new THREE.Vector3(0, -0.35, 0)).add(side.clone().multiplyScalar(0.15))]);
  const nG = new THREE.Group();
  nG.add(mesh(new THREE.TubeGeometry(nPath, 60, 0.17, 32, false), std({ map: TEX.nerve, roughness: 0.45, clearcoat: 0.4 })));
  nG.add(mesh(new THREE.TubeGeometry(nPath, 60, 0.195, 32, false), std({ color: "#fff1d6", transparent: true, opacity: 0.22, roughness: 0.2, clearcoat: 1, depthWrite: false })));
  const cap2 = mesh(new THREE.CircleGeometry(0.17, 32), std({ color: "#f4c46a", roughness: 0.5 }));
  cap2.position.copy(nPath.getPoint(1)); cap2.lookAt(nPath.getPoint(1).add(nPath.getTangent(1)));
  nG.add(cap2);
  const nv = [];
  [[0.14, 0.02, "a"], [-0.14, 0.024, "v"], [0.0, 0.016, "a"]].forEach(([off, w]) => {
    const pts = []; for (let i = 0; i <= 30; i++) { const t = i / 30; const p = nPath.getPoint(t); const tan = nPath.getTangent(t); const n = new THREE.Vector3(0, 1, 0).cross(tan).normalize(); const b = tan.clone().cross(n).normalize(); pts.push(p.add(n.multiplyScalar(off * 1.3 + Math.sin(t * 9) * 0.01)).add(b.multiplyScalar(0.16))); }
    nv.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, w, 6, false));
  });
  nG.add(mesh(mergeGeometries(nv.map(g => { g.deleteAttribute("uv"); return g; })), std({ color: "#c81e28", roughness: 0.3, clearcoat: 0.8 })));
  add("opticNerve", nG);

  return eye;
}

// Label anchor points in LOCAL eye coordinates
const MID = (CUT_START + CUT_END) / 2;
export const ANCHORS = {
  cornea: sph(1, 0.1, 0).multiplyScalar(0).add(new THREE.Vector3(0, 1.26, 0)).add(P(0.35, 0, 250 * DEG)),
  sclera: sph(R.scleraOut, 70 * DEG, 300 * DEG),
  ciliaryBody: P(0.8, 0.66, CUT_END - 0.01),
  zonules: P(0.53, 0.75, MID + 0.25),
  schlemm: P(0.63, 0.99, CUT_END - 0.02),
  iris: P(0.52, 0.96, 100 * DEG),
  lens: P(0.44, 0.74, MID - 0.2),
  vitreous: sph(0.75, 118 * DEG, MID),
  retina: sph(R.retinaIn, 125 * DEG, MID + Math.PI),
  opticNerve: sph(1.9, 158 * DEG, 40 * DEG),
  choroid: sph(R.choroidIn + 0.012, 125 * DEG, CUT_START + 0.005),
  macula: sph(R.retinaIn, 176 * DEG, 30 * DEG),
  opticDisc: sph(R.retinaIn, 158 * DEG, 40 * DEG),
  trabecular: P(0.585, 0.975, CUT_END - 0.02),
  anteriorChamber: P(0.25, 1.08, 200 * DEG),
  posteriorChamber: P(0.45, 0.88, 200 * DEG),
  pupil: new THREE.Vector3(0, 0.94, 0),
  conjunctiva: sph(R.scleraOut, 40 * DEG, 20 * DEG),
  rectusMuscles: sph(R.scleraOut + 0.08, 100 * DEG, 300 * DEG),
};
