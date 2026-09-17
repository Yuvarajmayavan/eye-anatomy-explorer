import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildEye, ANCHORS } from "./eye.js";
import { ANATOMY, LIST_ORDER, SYSTEMS, CLINICAL } from "./anatomy-data.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ------------------------------------------------------------------ renderer
const canvas = $("#scene");
const stage = $("#stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 1.6;
controls.maxDistance = 14;
controls.autoRotateSpeed = 0.9;

// lights: warm key, cool rim, soft fill
const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x1a0f18, 0.55);
const key = new THREE.DirectionalLight(0xfff3e8, 2.4);
key.position.set(4, 6, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = key.shadow.camera.bottom = -4;
key.shadow.camera.right = key.shadow.camera.top = 4;
key.shadow.bias = -0.0005;
const rim = new THREE.DirectionalLight(0x5fb4ff, 2.2);
rim.position.set(-5, 3, -4);
const fill = new THREE.PointLight(0x8fc2ff, 14, 20, 2);
fill.position.set(5, -1, 1);
const inner = new THREE.PointLight(0xffb070, 3, 3, 2); // lights the cut interior
scene.add(hemi, key, rim, fill, inner);

// ------------------------------------------------------------------ model
const registry = {};
const eye = buildEye(registry);
eye.rotation.x = Math.PI / 2;           // optical axis -> +Z (towards viewer)
eye.rotation.z = -0.12;
eye.position.x = -0.35;
scene.add(eye);
eye.updateMatrixWorld(true);
inner.position.copy(eye.localToWorld(new THREE.Vector3(0.3, -0.2, -0.2)));

const pickables = [];
const base = new Map();
for (const [id, objs] of Object.entries(registry)) {
  for (const o of objs) {
    pickables.push(o);
    const m = o.material;
    base.set(o, { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, emissive: m.emissive?.clone(), ei: m.emissiveIntensity ?? 0, visible: o.visible });
  }
}
const LOW_PRIORITY = new Set(["anteriorChamber", "posteriorChamber", "vitreous", "conjunctiva"]);
const worldAnchor = (id) => eye.localToWorld((ANCHORS[id] || new THREE.Vector3()).clone());

// ------------------------------------------------------------------ state
const state = { selected: "schlemm", hidden: new Set(), isolate: false, xray: false, tool: "select", view: "lateral", labels: true, tab: "overview", list: "anatomy" };

function applyMaterials(t = 0) {
  for (const [id, objs] of Object.entries(registry)) {
    const sel = id === state.selected;
    for (const o of objs) {
      const b = base.get(o), m = o.material;
      o.visible = b.visible && !state.hidden.has(id);
      let op = b.opacity;
      if (state.xray && !sel && ["sclera", "choroid", "retina", "rectusMuscles", "conjunctiva", "ciliaryBody", "opticNerve"].includes(id)) op = Math.min(op, 0.22);
      if (state.isolate && !sel) op = Math.min(op, 0.06);
      const faded = op < b.opacity - 1e-3;
      m.transparent = b.transparent || faded;
      m.opacity = op;
      m.depthWrite = faded ? false : b.depthWrite;
      if (m.emissive) {
        if (sel) { m.emissive.set(0x2f8cff); m.emissiveIntensity = 0.35 + 0.25 * Math.sin(t * 3.2); }
        else { m.emissive.copy(b.emissive); m.emissiveIntensity = b.ei; }
      }
    }
  }
}

// ------------------------------------------------------------------ camera presets (world space)
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tgt = (x, y, z) => eye.localToWorld(V(x, y, z));
const PRESETS = {
  lateral: () => ({ pos: V(7.5, 1.9, 3.7), target: V(0.15, -0.38, 0) }),
  anterior: () => ({ pos: V(0.3, 0.1, 7.6), target: V(-0.35, -0.5, 0) }),
  posterior: () => ({ pos: V(3.4, 1.6, -6.4), target: V(0, -0.5, -0.6) }),
  section: () => ({ pos: V(7.7, 3.7, 0.5), target: V(0.1, -0.55, 0) }),
  cornea: () => ({ pos: V(2.1, 0.7, 4.2), target: tgt(0, 1.05, 0) }),
  lens: () => ({ pos: V(3.0, 1.9, 1.9), target: tgt(0, 0.72, 0) }),
  retina: () => ({ pos: V(3.3, 2.4, -0.6), target: tgt(0.2, -0.6, 0.4) }),
  nerve: () => ({ pos: V(2.2, 1.0, -5.2), target: tgt(0.6, -1.7, 0.6) }),
};
const QUICK = [["Full Eye", "lateral"], ["Cornea", "cornea"], ["Lens", "lens"], ["Retina", "retina"], ["Optic Nerve", "nerve"], ["Cross Section", "section"]];
const FOCUS = { cornea: "cornea", lens: "lens", zonules: "lens", iris: "cornea", pupil: "cornea", anteriorChamber: "cornea", retina: "retina", macula: "retina", opticDisc: "retina", choroid: "retina", vitreous: "section", opticNerve: "nerve", schlemm: "lateral", trabecular: "lateral", ciliaryBody: "lateral", posteriorChamber: "lens" };

let tween = null;
// pull the camera back on narrow screens so the whole eye fits horizontally
function fit(p) {
  const k = camera.aspect < 1.1 ? Math.min(2.3, 1.1 / camera.aspect) : 1;
  if (k > 1) p.pos = p.target.clone().add(p.pos.clone().sub(p.target).multiplyScalar(k)).add(V(0, -0.35 * (k - 1), 0));
  return p;
}
function flyTo(preset, ms = 900) {
  const p = fit(PRESETS[preset]()); if (!p) return;
  tween = { t0: performance.now(), ms, fromP: camera.position.clone(), fromT: controls.target.clone(), toP: p.pos, toT: p.target };
}
function setCamera(preset) { const p = fit(PRESETS[preset]()); camera.position.copy(p.pos); controls.target.copy(p.target); controls.update(); }

// ------------------------------------------------------------------ labels
const LABEL_SET = { lateral: ["cornea", "sclera", "ciliaryBody", "zonules", "schlemm", "iris", "lens", "vitreous"], section: ["sclera", "choroid", "retina", "ciliaryBody", "zonules", "lens", "vitreous", "opticNerve"], anterior: ["cornea", "iris", "pupil", "sclera"], posterior: ["opticNerve", "retina", "sclera", "rectusMuscles"] };
// label offset from anchor, as a fraction of the stage size
const OFFSET = { cornea: [-.22, -.28], sclera: [.04, -.27], ciliaryBody: [.23, -.24], zonules: [.25, -.08], schlemm: [.22, .04], iris: [-.2, .2], lens: [-.03, .23], vitreous: [.22, .2], choroid: [.24, .1], retina: [.2, .18], opticNerve: [.12, .16], pupil: [-.15, .18], rectusMuscles: [.14, -.18], macula: [.2, .12], opticDisc: [.2, -.1], trabecular: [.22, -.02], anteriorChamber: [-.2, -.16], posteriorChamber: [-.18, .2], conjunctiva: [-.18, -.2] };
const labelsEl = $("#labels"), leadersEl = $("#leaders");
const tagEls = {};
function tagFor(id) {
  if (!tagEls[id]) {
    const el = document.createElement("button");
    el.className = "tag"; el.textContent = ANATOMY[id].name;
    el.addEventListener("click", () => select(id, true));
    labelsEl.append(el); tagEls[id] = el;
  }
  return tagEls[id];
}
const tmp = new THREE.Vector3();
function updateLabels() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const cr = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const ids = new Set(state.labels ? (LABEL_SET[state.view] || LABEL_SET.lateral) : []);
  if (state.labels && state.selected) ids.add(state.selected);
  let svg = "";
  const placed = [];
  for (const id of Object.keys(tagEls)) if (!ids.has(id)) tagEls[id].style.opacity = 0, tagEls[id].style.pointerEvents = "none";
  for (const id of ids) {
    if (state.hidden.has(id)) continue;
    tmp.copy(worldAnchor(id)).project(camera);
    if (tmp.z > 1) continue;
    const ax = (tmp.x * 0.5 + 0.5) * cr.width + cr.left - sr.left;
    const ay = (-tmp.y * 0.5 + 0.5) * cr.height + cr.top - sr.top;
    const [ox, oy] = OFFSET[id] || [.18, -.12];
    const s = Math.min(w, h * 1.3);
    const el = tagFor(id);
    const hot = id === state.selected;
    el.classList.toggle("hot", hot);
    const bw = el.offsetWidth, bh = el.offsetHeight;
    let lx = ax + ox * s, ly = ay + oy * s;
    lx = Math.max(bw / 2 + 4, Math.min(w - bw / 2 - 4, lx));
    ly = Math.max(bh / 2 + 78, Math.min(h - 310, ly));
    for (let n = 0; n < 8; n++) {
      const hit = placed.find((r) => Math.abs(r.x - lx) < (r.w + bw) / 2 + 6 && Math.abs(r.y - ly) < (r.h + bh) / 2 + 4);
      if (!hit) break;
      ly = hit.y + (ly >= hit.y ? 1 : -1) * ((hit.h + bh) / 2 + 6);
    }
    placed.push({ x: lx, y: ly, w: bw, h: bh });
    el.style.transform = `translate(${lx - bw / 2}px, ${ly - bh / 2}px)`;
    el.style.opacity = 1; el.style.pointerEvents = "auto";
    const ex = lx + (ax < lx ? -bw / 2 : bw / 2) * (Math.abs(ax - lx) > bw / 2 ? 1 : 0);
    const ey = Math.abs(ax - lx) > bw / 2 ? ly : ly + (ay < ly ? -bh / 2 : bh / 2);
    const mx = ax + (ex - ax) * 0.15, my = ey;
    svg += `<path class="${hot ? "hot" : ""}" d="M${ax.toFixed(1)},${ay.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}"/><circle class="${hot ? "hot" : ""}" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="${hot ? 6 : 3}"/>`;
  }
  leadersEl.innerHTML = svg;
}

// ------------------------------------------------------------------ sidebar
function listGroups() {
  if (state.list === "systems") return Object.entries(SYSTEMS);
  if (state.list === "clinical") return Object.entries(CLINICAL);
  return [[null, LIST_ORDER]];
}
function renderList() {
  const q = $("#searchSide").value.trim().toLowerCase();
  const html = listGroups().map(([title, ids]) => {
    const items = ids.filter((id) => !q || ANATOMY[id].name.toLowerCase().includes(q) || ANATOMY[id].sub.toLowerCase().includes(q));
    if (!items.length) return "";
    return (title ? `<div class="group-title">${esc(title)}</div>` : "") + items.map((id) => {
      const a = ANATOMY[id];
      return `<button class="item${id === state.selected ? " active" : ""}" data-id="${id}"><span class="orb" style="--c:${a.dot}"></span><span><b>${esc(a.name)}</b><small>${esc(a.sub)}</small></span><svg class="ico"><use href="#i-chev"/></svg></button>`;
    }).join("");
  }).join("");
  $("#structListEl").innerHTML = html || `<p class="group-title">No match</p>`;
}
$("#structListEl").addEventListener("click", (e) => {
  const b = e.target.closest(".item"); if (!b) return;
  select(b.dataset.id, true);
  $("#leftPanel").classList.remove("open");
});
$$("[data-list]").forEach((b) => b.addEventListener("click", () => {
  state.list = b.dataset.list;
  $$("[data-list]").forEach((x) => x.classList.toggle("active", x === b));
  renderList();
}));
$("#searchSide").addEventListener("input", renderList);
$("#structList").innerHTML = LIST_ORDER.map((id) => `<option value="${esc(ANATOMY[id].name)}">`).join("");
$("#searchMain").addEventListener("change", (e) => searchFor(e.target.value));
$("#searchMain").addEventListener("keydown", (e) => { if (e.key === "Enter") searchFor(e.target.value); });
function searchFor(v) {
  const q = v.trim().toLowerCase(); if (!q) return;
  const id = LIST_ORDER.find((i) => ANATOMY[i].name.toLowerCase().includes(q) || i.toLowerCase().includes(q));
  id ? select(id, true) : toast("No matching structure");
}

// ------------------------------------------------------------------ info panel
const FACT_ICONS = [["Type", "i-type", "type"], ["Location", "i-pin", "location"], ["Function", "i-fn", "fn"], ["Clinical Relevance", "i-drop", "clinical"]];
function renderInfo() {
  const a = ANATOMY[state.selected];
  $("#infoName").textContent = a.name;
  $("#infoSub").textContent = (Object.entries(SYSTEMS).find(([, ids]) => ids.includes(state.selected)) || [a.group])[0];
  const related = `<li><span class="fi"><svg class="ico"><use href="#i-link"/></svg></span><div><b>Related Structures</b>${a.related.map((r) => `<button data-rel="${r}">${esc(ANATOMY[r].name)}</button>`).join(", ")}</div></li>`;
  let html = "";
  if (state.tab === "overview") {
    html = `<p class="lead">${esc(a.overview)}</p>
      <ul class="facts">${FACT_ICONS.map(([t, ic, k]) => `<li><span class="fi"><svg class="ico"><use href="#${ic}"/></svg></span><div><b>${t}</b><span>${esc(a[k])}</span></div></li>`).join("")}${related}</ul>
      <div class="keypoint"><h4><svg class="ico"><use href="#i-bulb"/></svg>Key Point</h4><p>${esc(a.key)}</p></div>`;
  } else if (state.tab === "clinical") {
    html = `<p class="lead"><b>Clinical relevance:</b> ${esc(a.clinical)}.</p>
      <ul class="facts"><li><span class="fi"><svg class="ico"><use href="#i-fn"/></svg></span><div><b>Function</b><span>${esc(a.fn)}</span></div></li>${related}</ul>
      <div class="keypoint"><h4><svg class="ico"><use href="#i-bulb"/></svg>Clinical Pearl</h4><p>${esc(a.key)}</p></div>
      <p style="color:var(--dim);font-size:12px;margin-top:14px">Educational content — not a substitute for professional medical advice.</p>`;
  } else {
    html = `<div class="notes"><textarea id="noteInput" placeholder="Write your notes on ${esc(a.name)}…">${esc(store.get("eye-note:" + state.selected) || "")}</textarea>
      <div class="row"><button class="btn primary" id="saveNote">Save Note</button><button class="btn" id="delNote">Delete</button></div></div>`;
  }
  $("#tabBody").innerHTML = html;
}
$("#tabBody").addEventListener("click", (e) => {
  const r = e.target.closest("[data-rel]"); if (r) return select(r.dataset.rel, true);
  if (e.target.id === "saveNote") { store.set("eye-note:" + state.selected, $("#noteInput").value.trim()); toast("Note saved on this device"); }
  if (e.target.id === "delNote") { store.set("eye-note:" + state.selected, ""); renderInfo(); toast("Note deleted"); }
});
$$("[data-tab]").forEach((b) => b.addEventListener("click", () => {
  state.tab = b.dataset.tab;
  $$("[data-tab]").forEach((x) => x.classList.toggle("active", x === b));
  renderInfo();
}));
$("#closeInfo").addEventListener("click", () => $("#rightPanel").classList.remove("open"));

// ------------------------------------------------------------------ selection
function select(id, focus = false) {
  if (!ANATOMY[id]) return;
  state.selected = id;
  renderList(); renderInfo(); writeHash();
  $(`.item[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  if (focus && FOCUS[id]) { setView(FOCUS[id] in LABEL_SET ? FOCUS[id] : state.view, FOCUS[id]); }
  if (innerWidth <= 1100) $("#rightPanel").classList.add("open");
}
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; hideHint(); stopAuto(); });
canvas.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || state.tool !== "select") return;
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(pickables.filter((o) => o.visible && o.material.opacity > 0.03), false);
  if (!hits.length) return;
  const hit = hits.find((h) => !LOW_PRIORITY.has(h.object.userData.anatomyId)) || hits[0];
  select(hit.object.userData.anatomyId);
});

// ------------------------------------------------------------------ views & tools
function setView(labelView, preset = labelView) {
  state.view = labelView;
  $$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === labelView));
  $$(".qv").forEach((q) => q.classList.toggle("active", q.dataset.preset === preset));
  flyTo(preset); writeHash();
}
$$("[data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("#resetBtn").addEventListener("click", () => {
  state.hidden.clear(); state.isolate = state.xray = false;
  $$("[data-tool]").forEach((b) => b.classList.toggle("active", b.dataset.tool === "select"));
  state.tool = "select"; applyTool(); setView("lateral"); toast("View reset");
});
let auto = false;
function stopAuto() { if (auto) toggleAuto(); }
function toggleAuto() {
  auto = !auto; controls.autoRotate = auto;
  $("#rotateBtn").classList.toggle("on", auto);
  $("#rotateBtn span").textContent = auto ? "Stop Rotate" : "Auto Rotate";
}
$("#rotateBtn").addEventListener("click", toggleAuto);

function applyTool() {
  const t = state.tool;
  controls.mouseButtons.LEFT = t === "pan" ? THREE.MOUSE.PAN : t === "zoom" ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
  controls.touches.ONE = t === "pan" ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
}
$$("[data-tool]").forEach((b) => b.addEventListener("click", () => {
  const t = b.dataset.tool;
  if (t === "hide") { state.hidden.has(state.selected) ? state.hidden.delete(state.selected) : state.hidden.add(state.selected); b.classList.toggle("active", state.hidden.size > 0); toast(state.hidden.has(state.selected) ? `${ANATOMY[state.selected].name} hidden` : `${ANATOMY[state.selected].name} shown`); return; }
  if (t === "isolate") { state.isolate = !state.isolate; b.classList.toggle("active", state.isolate); if (state.isolate && FOCUS[state.selected]) flyTo(FOCUS[state.selected]); return; }
  if (t === "xray") { state.xray = !state.xray; b.classList.toggle("active", state.xray); return; }
  state.tool = t;
  $$("[data-tool]").forEach((x) => { if (["rotate", "zoom", "pan", "select"].includes(x.dataset.tool)) x.classList.toggle("active", x === b); });
  applyTool();
}));
$("#hideLabels").addEventListener("change", (e) => {
  state.labels = !e.target.checked;
  labelsEl.classList.toggle("off", !state.labels); leadersEl.classList.toggle("off", !state.labels);
});

// ------------------------------------------------------------------ top nav, dialogs, share
const modal = $("#modal");
function openModal(title, html) { $("#modalTitle").textContent = title; $("#modalBody").innerHTML = html; modal.showModal(); }
$("#modalClose").addEventListener("click", () => modal.close());
modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); }); // fallback for closedby
function quiz() {
  const pool = LIST_ORDER.filter((i) => ANATOMY[i].fn);
  const ans = pool[Math.floor(Math.random() * pool.length)];
  const opts = [ans]; while (opts.length < 4) { const o = pool[Math.floor(Math.random() * pool.length)]; if (!opts.includes(o)) opts.push(o); }
  opts.sort(() => Math.random() - 0.5);
  openModal("Quick Quiz", `<p>Which structure has this role?<br><b>“${esc(ANATOMY[ans].fn)}”</b></p>${opts.map((o) => `<button class="quiz-opt" data-q="${o}">${esc(ANATOMY[o].name)}</button>`).join("")}<div class="row"><button class="btn primary" id="nextQ">Next question</button></div>`);
  $("#modalBody").onclick = (e) => {
    const b = e.target.closest("[data-q]");
    if (b) { $$(".quiz-opt").forEach((x) => x.classList.add(x.dataset.q === ans ? "ok" : x === b ? "bad" : "")); select(ans); }
    if (e.target.id === "nextQ") quiz();
  };
}
function allNotes() {
  const list = store.keys().filter((k) => k.startsWith("eye-note:")).map((k) => [k.slice(9), store.get(k)]).filter(([id, t]) => ANATOMY[id] && t);
  openModal("My Notes", list.length ? `<div class="saved">${list.map(([id, t]) => `<button data-note="${id}"><b>${esc(ANATOMY[id].name)}</b><small>${esc(t)}</small></button>`).join("")}</div>` : `<p style="color:var(--muted)">No notes yet. Select a structure and open the Notes tab.</p>`);
  $("#modalBody").onclick = (e) => { const b = e.target.closest("[data-note]"); if (b) { modal.close(); select(b.dataset.note, true); } };
}
async function share() {
  writeHash();
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: "Eye Anatomy Explorer", text: `Explore the ${ANATOMY[state.selected].name}`, url });
    else { await navigator.clipboard.writeText(url); toast("Link copied"); }
  } catch { /* user cancelled */ }
}
$$("[data-nav]").forEach((b) => b.addEventListener("click", () => {
  const n = b.dataset.nav;
  if (n === "quiz") quiz();
  if (n === "notes") allNotes();
  if (n === "share") share();
  if (n === "more") openModal("About", `<p>Interactive, procedurally built 3D model of the human eye for ophthalmic education. Drag to rotate, scroll to zoom, click any structure for details.</p><div class="row"><button class="btn" id="capBtn">Download PNG</button></div>`), ($("#capBtn").onclick = capture);
}));
$("#mobileList").addEventListener("click", () => $("#leftPanel").classList.toggle("open"));
function capture() {
  renderer.render(scene, camera);
  const a = document.createElement("a");
  a.download = `eye-${state.selected}.png`; a.href = canvas.toDataURL("image/png"); a.click();
}
function writeHash() { history.replaceState(null, "", `#s=${state.selected}&v=${state.view}`); }
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (ANATOMY[p.get("s")]) state.selected = p.get("s");
  if (LABEL_SET[p.get("v")]) state.view = p.get("v");
}
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2000); }
function hideHint() { /* no-op: hint removed */ }

// ------------------------------------------------------------------ resize / loop
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);

function thumbnails() {
  const saveP = camera.position.clone(), saveT = controls.target.clone(), saveLabels = state.selected;
  const off = document.createElement("canvas"); off.width = 180; off.height = 195;
  const ctx = off.getContext("2d");
  const html = QUICK.map(([name, preset]) => {
    setCamera(preset);
    applyMaterials(0);
    renderer.render(scene, camera);
    const cw = canvas.width, ch = canvas.height, side = Math.min(cw, ch) * 0.8;
    ctx.fillStyle = "#07142b"; ctx.fillRect(0, 0, 180, 195);
    ctx.drawImage(canvas, (cw - side) / 2, (ch - side * 1.08) / 2, side, side * 1.08, 0, 0, 180, 195);
    return `<button class="qv${preset === "lateral" ? " active" : ""}" data-preset="${preset}"><span class="thumb" style="background-image:url(${off.toDataURL("image/jpeg", 0.85)})"></span>${name}</button>`;
  }).join("");
  $("#quickGrid").innerHTML = html;
  camera.position.copy(saveP); controls.target.copy(saveT); controls.update();
  state.selected = saveLabels;
}
$("#quickGrid").addEventListener("click", (e) => {
  const q = e.target.closest(".qv"); if (!q) return;
  const p = q.dataset.preset;
  setView(p in LABEL_SET ? p : (p === "retina" || p === "nerve" ? "posterior" : "lateral"), p);
});

const STILL = new URLSearchParams(location.search).has("still");
const clock = new THREE.Clock();
function loop() {
  const t = clock.getElapsedTime();
  if (tween) {
    const k = Math.min(1, (performance.now() - tween.t0) / tween.ms), e = 1 - Math.pow(1 - k, 3);
    camera.position.lerpVectors(tween.fromP, tween.toP, e);
    controls.target.lerpVectors(tween.fromT, tween.toT, e);
    if (k >= 1) tween = null;
  }
  controls.update();
  applyMaterials(t);
  renderer.render(scene, camera);
  updateLabels();
  if (!STILL) requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ boot
readHash();
resize();
thumbnails();
setCamera(state.view);
$$("[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
renderList();
renderInfo();
applyTool();
$("#loading").classList.add("done");
loop();
window.__eye = { scene, camera, controls, eye, select, setView, state };
