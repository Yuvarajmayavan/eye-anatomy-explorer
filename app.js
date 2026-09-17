/**
 * app.js
 * ------
 * Rendering + interaction logic for the 3D Human Eye Anatomy Explorer.
 * Anatomical facts live in anatomy-data.js; this file only builds
 * geometry, wires up the UI, and reacts to state changes.
 *
 * If a professional GLB/GLTF eye model becomes available later, replace
 * the body of buildEye() with a GLTFLoader call that populates the same
 * `registry` map (id -> {root, materials}) that the rest of the app reads
 * from — nothing else needs to change. See README.md.
 */

(function () {
  "use strict";

  if (typeof THREE === "undefined") {
    document.getElementById("viewport").insertAdjacentHTML(
      "beforeend",
      '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'color:#93a8ba;font-size:13px;text-align:center;padding:30px;">' +
      "Could not load the Three.js 3D engine (no network access). " +
      "This app needs an internet connection the first time it runs so the browser can fetch the 3D library.</div>"
    );
    return;
  }

  // ------------------------------------------------------------------
  // Global state
  // ------------------------------------------------------------------
  var viewportEl = document.getElementById("viewport");
  var scene, camera, renderer, controls, raycaster, clock;
  var eyeRoot = new THREE.Group();
  var registry = {};        // meshId -> { root, materials: [Material], baseOpacity }
  var pickable = [];        // flat list of leaf meshes for raycasting
  var currentMeshId = null; // currently selected/highlighted mesh
  var currentAnatomyId = null; // currently displayed info-card entry (may be an alias id)
  var isolateActive = false;
  var sectionMode = "full";
  var glowMesh = null;
  var cameraAnim = null;
  var suppressDemo = false;
  var notesCache = {}; // in-memory fallback if localStorage is unavailable
  var storageOK = true;

  try {
    var t = "__eyeExplorerTest__";
    window.localStorage.setItem(t, "1");
    window.localStorage.removeItem(t);
  } catch (e) {
    storageOK = false;
  }

  var clipPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0.02);

  var VIEW_PRESETS = {
    anterior: { pos: [0, 0.15, 6.2], target: [0, 0, 0.6] },
    lateral: { pos: [6.2, 0.15, 0], target: [0, 0, 0] },
    superior: { pos: [0.2, 5.6, 2.4], target: [0, 0, 0] },
    posterior: { pos: [0, 0.15, -6.2], target: [0, 0, -1] },
    cross: { pos: [4.8, 1.6, 2.6], target: [0, 0, 0], section: "cross" },
    full: { pos: [0, 0.6, 6], target: [0, 0, 0], section: "full" }
  };

  // ------------------------------------------------------------------
  // Boot
  // ------------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", init);

  function init() {
    buildScene();
    buildEye();
    buildSidebar();
    buildLayersPanel();
    wireUI();
    window.addEventListener("resize", onResize);
    onResize();

    var restored = tryRestoreFromURL();
    animate();

    if (!restored) runDemoIntro();
  }

  // ------------------------------------------------------------------
  // Scene setup
  // ------------------------------------------------------------------
  function buildScene() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.6, 6);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;
    viewportEl.insertBefore(renderer.domElement, viewportEl.firstChild);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.5;
    controls.maxDistance = 16;
    controls.target.set(0, 0, 0);
    controls.autoRotateSpeed = 1.6;

    scene.add(new THREE.HemisphereLight(0xdcefff, 0x141c26, 0.65));
    var key = new THREE.DirectionalLight(0xffffff, 0.95);
    key.position.set(3.5, 4.5, 5);
    scene.add(key);
    var fill = new THREE.DirectionalLight(0xbcd8ea, 0.35);
    fill.position.set(-4, -1.5, -3.5);
    scene.add(fill);
    var rim = new THREE.DirectionalLight(0x8fd8e6, 0.3);
    rim.position.set(-2, 2, -5);
    scene.add(rim);

    scene.add(eyeRoot);
    raycaster = new THREE.Raycaster();
    clock = new THREE.Clock();
  }

  // ------------------------------------------------------------------
  // Geometry helpers
  // ------------------------------------------------------------------
  function hexToInt(hex) {
    return parseInt(hex.replace("#", "0x"), 16);
  }

  function mat(id, opts) {
    var color = hexToInt(getPrimaryAnatomyForMesh(id).color);
    var m = new THREE.MeshStandardMaterial({
      color: color,
      roughness: opts.roughness != null ? opts.roughness : 0.65,
      metalness: opts.metalness != null ? opts.metalness : 0.03,
      transparent: true,
      opacity: opts.opacity != null ? opts.opacity : 1,
      side: opts.side || THREE.FrontSide,
      emissive: 0x000000,
      emissiveIntensity: 0
    });
    m.userData.baseOpacity = m.opacity;
    m.userData.baseColor = color;
    return m;
  }

  function shellGeometry(radius, thetaStart, segW, segH) {
    var g = new THREE.SphereGeometry(radius, segW || 40, segH || 26, 0, Math.PI * 2, thetaStart, Math.PI - thetaStart);
    g.rotateX(Math.PI / 2);
    return g;
  }

  function register(id, root, material) {
    root.traverse(function (o) {
      if (o.isMesh) {
        o.userData.meshId = id;
        pickable.push(o);
      }
    });
    registry[id] = { root: root, materials: [material], baseOpacity: material.userData.baseOpacity };
    eyeRoot.add(root);
  }

  function alignAlongDirection(mesh, dir) {
    var y = new THREE.Vector3(0, 1, 0);
    var q = new THREE.Quaternion().setFromUnitVectors(y, dir.clone().normalize());
    mesh.quaternion.copy(q);
  }

  // ------------------------------------------------------------------
  // Eye model construction (procedural placeholder geometry)
  // ------------------------------------------------------------------
  function buildEye() {
    // ---- External ----
    var scleraMat = mat("sclera", { roughness: 0.75, opacity: 1 });
    var scleraMesh = new THREE.Mesh(shellGeometry(2.0, 0.62, 48, 30), scleraMat);
    register("sclera", scleraMesh, scleraMat);

    var corneaMat = mat("cornea", { roughness: 0.05, metalness: 0, opacity: 0.3, side: THREE.DoubleSide });
    var corneaGeo = new THREE.SphereGeometry(1.55, 40, 28, 0, Math.PI * 2, 0, 0.9);
    corneaGeo.rotateX(Math.PI / 2);
    corneaGeo.translate(0, 0, 0.6);
    var corneaMesh = new THREE.Mesh(corneaGeo, corneaMat);
    register("cornea", corneaMesh, corneaMat);

    var conjMat = mat("conjunctiva", { roughness: 0.5, opacity: 0.12, side: THREE.DoubleSide });
    var conjMesh = new THREE.Mesh(shellGeometry(2.02, 0.62, 40, 26), conjMat);
    register("conjunctiva", conjMesh, conjMat);

    // ---- Anterior segment ----
    var irisMat = mat("iris", { roughness: 0.8, opacity: 1, side: THREE.DoubleSide });
    var irisMesh = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.95, 48), irisMat);
    irisMesh.position.z = 1.25;
    register("iris", irisMesh, irisMat);

    var pupilMat = mat("pupil", { roughness: 0.9, opacity: 0.92, side: THREE.DoubleSide });
    var pupilMesh = new THREE.Mesh(new THREE.CircleGeometry(0.35, 40), pupilMat);
    pupilMesh.position.z = 1.23;
    register("pupil", pupilMesh, pupilMat);

    var acMat = mat("anteriorChamber", { roughness: 0.1, opacity: 0.08, side: THREE.DoubleSide });
    var acMesh = new THREE.Mesh(new THREE.SphereGeometry(0.92, 24, 16), acMat);
    acMesh.scale.set(1, 1, 0.32);
    acMesh.position.z = 1.48;
    register("anteriorChamber", acMesh, acMat);

    var pcMat = mat("posteriorChamber", { roughness: 0.1, opacity: 0.08, side: THREE.DoubleSide });
    var pcMesh = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 16), pcMat);
    pcMesh.scale.set(1, 1, 0.2);
    pcMesh.position.z = 1.13;
    register("posteriorChamber", pcMesh, pcMat);

    var tmMat = mat("trabecularMeshwork", { roughness: 0.7, opacity: 0.85 });
    var tmMesh = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.045, 10, 48), tmMat);
    tmMesh.position.z = 1.63;
    register("trabecularMeshwork", tmMesh, tmMat);

    var csMat = mat("canalOfSchlemm", { roughness: 0.6, opacity: 0.85 });
    var csMesh = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.025, 8, 44), csMat);
    csMesh.position.z = 1.55;
    register("canalOfSchlemm", csMesh, csMat);

    var cbMat = mat("ciliaryBody", { roughness: 0.75, opacity: 1 });
    var cbMesh = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.22, 14, 40), cbMat);
    cbMesh.position.z = 1.0;
    register("ciliaryBody", cbMesh, cbMat);

    var cmMat = mat("ciliaryMuscle", { roughness: 0.75, opacity: 1 });
    var cmMesh = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.12, 12, 36), cmMat);
    cmMesh.position.z = 1.0;
    register("ciliaryMuscle", cmMesh, cmMat);

    // Zonules: thin fibers connecting ciliary body ring to lens equator
    var zonuleMat = mat("zonules", { roughness: 0.5, opacity: 0.65 });
    var zonuleGroup = new THREE.Group();
    var zCount = 28;
    for (var i = 0; i < zCount; i++) {
      var ang = (i / zCount) * Math.PI * 2;
      var pA = new THREE.Vector3(Math.cos(ang) * 1.0, Math.sin(ang) * 1.0, 1.0);
      var pB = new THREE.Vector3(Math.cos(ang) * 0.85, Math.sin(ang) * 0.85, 0.55);
      var mid = pA.clone().add(pB).multiplyScalar(0.5);
      var len = pA.distanceTo(pB);
      var fiber = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, len, 4), zonuleMat);
      fiber.position.copy(mid);
      alignAlongDirection(fiber, pB.clone().sub(pA));
      zonuleGroup.add(fiber);
    }
    register("zonules", zonuleGroup, zonuleMat);

    // ---- Lens ----
    var lensMat = mat("lens", { roughness: 0.05, opacity: 0.42, side: THREE.DoubleSide });
    var lensMesh = new THREE.Mesh(new THREE.SphereGeometry(0.85, 32, 24), lensMat);
    lensMesh.scale.set(1, 1, 0.55);
    lensMesh.position.z = 0.55;
    register("lens", lensMesh, lensMat);

    var lcMat = mat("lensCapsule", { roughness: 0.1, opacity: 0.16, side: THREE.DoubleSide });
    var lcMesh = new THREE.Mesh(new THREE.SphereGeometry(0.89, 28, 20), lcMat);
    lcMesh.scale.set(1, 1, 0.57);
    lcMesh.position.z = 0.55;
    register("lensCapsule", lcMesh, lcMat);

    // ---- Posterior segment ----
    var vitMat = mat("vitreous", { roughness: 0.1, opacity: 0.12, side: THREE.DoubleSide });
    var vitMesh = new THREE.Mesh(new THREE.SphereGeometry(1.75, 32, 24), vitMat);
    vitMesh.position.z = -0.15;
    register("vitreous", vitMesh, vitMat);

    var retinaMat = mat("retina", { roughness: 0.85, opacity: 0.97, side: THREE.DoubleSide });
    var retinaMesh = new THREE.Mesh(shellGeometry(1.86, 1.0, 48, 30), retinaMat);
    register("retina", retinaMesh, retinaMat);

    var rpeMat = mat("rpe", { roughness: 0.9, opacity: 0.95, side: THREE.DoubleSide });
    var rpeMesh = new THREE.Mesh(shellGeometry(1.885, 1.0, 40, 26), rpeMat);
    register("rpe", rpeMesh, rpeMat);

    var bruchMat = mat("bruchsMembrane", { roughness: 0.8, opacity: 0.7, side: THREE.DoubleSide });
    var bruchMesh = new THREE.Mesh(shellGeometry(1.905, 1.0, 40, 26), bruchMat);
    register("bruchsMembrane", bruchMesh, bruchMat);

    var choroidMat = mat("choroid", { roughness: 0.7, opacity: 0.9, side: THREE.DoubleSide });
    var choroidMesh = new THREE.Mesh(shellGeometry(1.94, 1.0, 40, 26), choroidMat);
    register("choroid", choroidMesh, choroidMat);

    // Ora serrata: ring boundary between retina and ciliary body
    var oraMat = mat("oraSerrata", { roughness: 0.6, opacity: 0.8 });
    var oraRadius = 1.86 * Math.sin(1.0);
    var oraMesh = new THREE.Mesh(new THREE.TorusGeometry(oraRadius, 0.03, 8, 48), oraMat);
    oraMesh.position.z = 1.86 * Math.cos(1.0);
    register("oraSerrata", oraMesh, oraMat);

    // Macula / fovea / optic disc: small patches on the posterior retina,
    // oriented outward with lookAt so they sit tangent to the retinal shell.
    var maculaDir = new THREE.Vector3(-0.14, 0.02, -0.99).normalize();
    var maculaMat = mat("macula", { roughness: 0.8, opacity: 1, side: THREE.DoubleSide });
    var maculaMesh = new THREE.Mesh(new THREE.CircleGeometry(0.34, 28), maculaMat);
    maculaMesh.position.copy(maculaDir.clone().multiplyScalar(1.865));
    maculaMesh.lookAt(0, 0, 0);
    register("macula", maculaMesh, maculaMat);

    var foveaMat = mat("fovea", { roughness: 0.85, opacity: 1, side: THREE.DoubleSide });
    var foveaMesh = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), foveaMat);
    foveaMesh.position.copy(maculaDir.clone().multiplyScalar(1.858));
    foveaMesh.lookAt(0, 0, 0);
    register("fovea", foveaMesh, foveaMat);

    var discDir = new THREE.Vector3(0.32, 0.08, -0.94).normalize();
    var discMat = mat("opticDisc", { roughness: 0.75, opacity: 1, side: THREE.DoubleSide });
    var discMesh = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), discMat);
    discMesh.position.copy(discDir.clone().multiplyScalar(1.865));
    discMesh.lookAt(0, 0, 0);
    register("opticDisc", discMesh, discMat);

    // Optic nerve: cylinder trailing away from the disc
    var nerveMat = mat("opticNerve", { roughness: 0.8, opacity: 1 });
    var nerveFrom = discDir.clone().multiplyScalar(1.9);
    var nerveTo = discDir.clone().multiplyScalar(3.1);
    var nerveLen = nerveFrom.distanceTo(nerveTo);
    var nerveMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, nerveLen, 18), nerveMat);
    nerveMesh.position.copy(nerveFrom.clone().add(nerveTo).multiplyScalar(0.5));
    alignAlongDirection(nerveMesh, nerveTo.clone().sub(nerveFrom));
    register("opticNerve", nerveMesh, nerveMat);

    // ---- Vessels ----
    var arteryMat = mat("centralRetinalArtery", { roughness: 0.4, opacity: 1 });
    var arteryFrom = discDir.clone().multiplyScalar(2.9);
    var arteryTo = discDir.clone().multiplyScalar(1.86);
    var arteryOffset = new THREE.Vector3(0.05, 0.03, 0);
    var arteryMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, arteryFrom.distanceTo(arteryTo), 8),
      arteryMat
    );
    arteryMesh.position.copy(arteryFrom.clone().add(arteryTo).multiplyScalar(0.5)).add(arteryOffset);
    alignAlongDirection(arteryMesh, arteryTo.clone().sub(arteryFrom));
    register("centralRetinalArtery", arteryMesh, arteryMat);

    var veinMat = mat("centralRetinalVein", { roughness: 0.4, opacity: 1 });
    var veinOffset = new THREE.Vector3(-0.05, -0.03, 0);
    var veinMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, arteryFrom.distanceTo(arteryTo), 8),
      veinMat
    );
    veinMesh.position.copy(arteryFrom.clone().add(arteryTo).multiplyScalar(0.5)).add(veinOffset);
    alignAlongDirection(veinMesh, arteryTo.clone().sub(arteryFrom));
    register("centralRetinalVein", veinMesh, veinMat);

    // Major retinal vessels: a few curved branches fanning across the retina
    var vesselMat = mat("retinalVessels", { roughness: 0.5, opacity: 0.9 });
    var vesselGroup = new THREE.Group();
    var branchDirs = [
      new THREE.Vector3(0.7, 0.35, -0.7),
      new THREE.Vector3(0.6, -0.45, -0.68),
      new THREE.Vector3(-0.15, 0.7, -0.75),
      new THREE.Vector3(-0.2, -0.65, -0.78)
    ];
    branchDirs.forEach(function (d) {
      d.normalize();
      var start = discDir.clone().multiplyScalar(1.86);
      var end = d.clone().multiplyScalar(1.87);
      var mid = start.clone().lerp(end, 0.5).multiplyScalar(1.02);
      var curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      var tube = new THREE.TubeGeometry(curve, 16, 0.02, 6, false);
      vesselGroup.add(new THREE.Mesh(tube, vesselMat));
    });
    register("retinalVessels", vesselGroup, vesselMat);

    // ---- Extraocular muscle (representative single muscle) ----
    var muscleMat = mat("extraocularMuscle", { roughness: 0.6, opacity: 1 });
    var muscleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 1.3), muscleMat);
    muscleMesh.position.set(0, -2.0, -0.15);
    muscleMesh.rotation.x = -0.12;
    register("extraocularMuscle", muscleMesh, muscleMat);

    // Aliased structures (opticNerveHead / fovealRegion / macularRegion)
    // intentionally share meshId with their primary structure and need no
    // separate geometry — they're resolved through anatomy-data.js.
  }

  // ------------------------------------------------------------------
  // Sidebar
  // ------------------------------------------------------------------
  function buildSidebar() {
    var container = document.getElementById("sidebarContent");
    var html = "";
    ANATOMY_CATEGORIES.forEach(function (cat) {
      var items = ANATOMY_DATA.filter(function (a) { return a.category === cat.id; });
      if (!items.length) return;
      html += '<h2>' + escapeHTML(cat.label) + "</h2>";
      items.forEach(function (a) {
        html +=
          '<button class="nav-item" data-anatomy-id="' + a.id + '" data-mesh-id="' + a.meshId + '">' +
          '<span class="swatch" style="background:' + a.color + '"></span>' +
          "<span>" + escapeHTML(a.name) + "</span>" +
          '<span class="has-note" data-note-indicator="' + a.id + '"></span>' +
          "</button>";
      });
    });
    container.innerHTML = html;
    container.querySelectorAll(".nav-item").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectAnatomy(btn.getAttribute("data-anatomy-id"));
        closeMobileSheet("sidebar");
      });
    });
    refreshNoteIndicators();
  }

  function markSidebarSelected(meshId) {
    document.querySelectorAll(".nav-item").forEach(function (btn) {
      btn.classList.toggle("selected", btn.getAttribute("data-mesh-id") === meshId);
    });
  }

  function refreshNoteIndicators() {
    document.querySelectorAll("[data-note-indicator]").forEach(function (el) {
      var id = el.getAttribute("data-note-indicator");
      el.textContent = getNote(id) ? "\u25CF" : "";
    });
  }

  // ------------------------------------------------------------------
  // Layers panel
  // ------------------------------------------------------------------
  function buildLayersPanel() {
    var container = document.getElementById("layersContent");
    var html = "";
    Object.keys(registry).sort().forEach(function (meshId) {
      var a = getPrimaryAnatomyForMesh(meshId);
      if (!a) return;
      html +=
        '<div class="layer-row" data-layer="' + meshId + '">' +
        '<div class="layer-top">' +
        '<span class="swatch" style="background:' + a.color + '"></span>' +
        '<span class="name">' + escapeHTML(a.name) + "</span>" +
        '<button class="vis-btn" data-vis-toggle="' + meshId + '">&#128065;</button>' +
        "</div>" +
        '<input type="range" min="0" max="100" value="' +
        Math.round(registry[meshId].baseOpacity * 100) +
        '" data-opacity="' + meshId + '" />' +
        '<div class="pct" data-pct="' + meshId + '">' + Math.round(registry[meshId].baseOpacity * 100) + "%</div>" +
        "</div>";
    });
    container.innerHTML = html;

    container.querySelectorAll("[data-vis-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-vis-toggle");
        var entry = registry[id];
        entry.root.visible = !entry.root.visible;
        btn.classList.toggle("off", !entry.root.visible);
      });
    });
    container.querySelectorAll("[data-opacity]").forEach(function (slider) {
      slider.addEventListener("input", function () {
        var id = slider.getAttribute("data-opacity");
        var v = parseInt(slider.value, 10) / 100;
        registry[id].materials.forEach(function (m) { m.opacity = v; });
        document.querySelector('[data-pct="' + id + '"]').textContent = slider.value + "%";
      });
    });
  }

  // ------------------------------------------------------------------
  // Selection / highlighting
  // ------------------------------------------------------------------
  function selectAnatomy(anatomyId) {
    var entry = getAnatomyById(anatomyId);
    if (!entry) return;
    currentAnatomyId = anatomyId;
    highlightMesh(entry.meshId);
    focusCameraOnMesh(entry.meshId);
    openInfoPanel(entry);
    markSidebarSelected(entry.meshId);
    if (isolateActive) applyIsolate();
  }

  function highlightMesh(meshId) {
    if (currentMeshId === meshId) return;
    currentMeshId = meshId;
    clearGlow();

    Object.keys(registry).forEach(function (id) {
      var entry = registry[id];
      entry.materials.forEach(function (m) {
        if (id === meshId) {
          m.opacity = entry.baseOpacity;
          m.emissive.setHex(m.userData.baseColor);
          m.emissiveIntensity = 0.35;
        } else {
          m.opacity = entry.baseOpacity * 0.18;
          m.emissiveIntensity = 0;
        }
      });
    });

    var entry = registry[meshId];
    if (entry && entry.root.isMesh) {
      var glow = new THREE.Mesh(
        entry.root.geometry,
        new THREE.MeshBasicMaterial({
          color: entry.materials[0].userData.baseColor,
          transparent: true,
          opacity: 0.35,
          side: THREE.BackSide
        })
      );
      glow.position.copy(entry.root.position);
      glow.rotation.copy(entry.root.rotation);
      glow.scale.copy(entry.root.scale).multiplyScalar(1.06);
      glow.raycast = function () {}; // never interferes with picking
      eyeRoot.add(glow);
      glowMesh = glow;
    }
  }

  function clearGlow() {
    if (glowMesh) {
      eyeRoot.remove(glowMesh);
      glowMesh.geometry = null;
      glowMesh = null;
    }
  }

  function deselectAll() {
    currentMeshId = null;
    currentAnatomyId = null;
    clearGlow();
    Object.keys(registry).forEach(function (id) {
      var entry = registry[id];
      entry.materials.forEach(function (m) {
        m.opacity = entry.baseOpacity;
        m.emissiveIntensity = 0;
      });
    });
    markSidebarSelected(null);
    document.getElementById("infoContent").innerHTML =
      '<div class="info-empty">Select a structure from the model or the anatomy list to see its details here.</div>';
  }

  // ------------------------------------------------------------------
  // Isolate mode
  // ------------------------------------------------------------------
  function toggleIsolate() {
    if (!currentMeshId) {
      showToast("Select a structure first, then Isolate.");
      return;
    }
    isolateActive = !isolateActive;
    var btn = document.getElementById("isolateBtn");
    btn.classList.toggle("active", isolateActive);
    btn.innerHTML = isolateActive
      ? '<span class="glyph">&#9678;</span> Show All'
      : '<span class="glyph">&#9678;</span> Isolate';
    if (isolateActive) {
      applyIsolate();
    } else {
      Object.keys(registry).forEach(function (id) { registry[id].root.visible = true; });
      buildLayersPanel();
    }
  }

  function applyIsolate() {
    Object.keys(registry).forEach(function (id) {
      registry[id].root.visible = id === currentMeshId;
    });
  }

  // ------------------------------------------------------------------
  // Info panel
  // ------------------------------------------------------------------
  function openInfoPanel(entry) {
    var cat = ANATOMY_CATEGORIES.find(function (c) { return c.id === entry.category; });
    var relatedHtml = (entry.related || [])
      .map(function (rid) {
        var r = getAnatomyById(rid);
        if (!r) return "";
        return '<button class="chip" data-goto="' + rid + '">' + escapeHTML(r.name) + "</button>";
      })
      .join("");

    var existingNote = getNote(entry.id) || "";

    document.getElementById("infoContent").innerHTML =
      '<div class="info-card">' +
      '<span class="cat-pill">' + escapeHTML(cat ? cat.label : "") + "</span>" +
      "<h1>" + escapeHTML(entry.name) + "</h1>" +
      '<div class="section-label">Function</div><p>' + escapeHTML(entry.function) + "</p>" +
      '<div class="section-label">Clinical Relevance</div><p class="clinical">' + escapeHTML(entry.clinicalRelevance) + "</p>" +
      (relatedHtml ? '<div class="section-label">Related Structures</div><div class="related-chips">' + relatedHtml + "</div>" : "") +
      '<div class="section-label">My Notes</div>' +
      '<div class="notes-box">' +
      '<textarea id="noteInput" placeholder="Type your notes here…">' + escapeHTML(existingNote) + "</textarea>" +
      '<div class="notes-actions">' +
      '<button class="btn primary" id="saveNoteBtn">Save Note</button>' +
      '<button class="btn ghost" id="deleteNoteBtn"' + (existingNote ? "" : " disabled") + ">Delete</button>" +
      "</div>" +
      '<div class="saved-hint" id="savedHint">Saved.</div>' +
      "</div>" +
      "</div>";

    document.querySelectorAll("#infoContent [data-goto]").forEach(function (chip) {
      chip.addEventListener("click", function () { selectAnatomy(chip.getAttribute("data-goto")); });
    });
    document.getElementById("saveNoteBtn").addEventListener("click", function () {
      var val = document.getElementById("noteInput").value;
      saveNote(entry.id, val);
      var hint = document.getElementById("savedHint");
      hint.classList.add("show");
      setTimeout(function () { hint.classList.remove("show"); }, 1400);
      document.getElementById("deleteNoteBtn").disabled = !val;
      refreshNoteIndicators();
    });
    document.getElementById("deleteNoteBtn").addEventListener("click", function () {
      deleteNote(entry.id);
      document.getElementById("noteInput").value = "";
      document.getElementById("deleteNoteBtn").disabled = true;
      refreshNoteIndicators();
    });
  }

  // ------------------------------------------------------------------
  // Notes (localStorage, with in-memory fallback)
  // ------------------------------------------------------------------
  function noteKey(id) { return "eyeExplorerNote:" + id; }

  function getNote(id) {
    if (!storageOK) return notesCache[id] || "";
    try {
      return window.localStorage.getItem(noteKey(id)) || "";
    } catch (e) {
      return notesCache[id] || "";
    }
  }

  function saveNote(id, text) {
    notesCache[id] = text;
    if (!storageOK) return;
    try {
      if (text && text.trim()) window.localStorage.setItem(noteKey(id), text);
      else window.localStorage.removeItem(noteKey(id));
    } catch (e) { /* ignore quota / privacy-mode errors */ }
  }

  function deleteNote(id) { saveNote(id, ""); }

  function getAllNotes() {
    var out = [];
    ANATOMY_DATA.forEach(function (a) {
      var n = getNote(a.id);
      if (n && n.trim()) out.push({ id: a.id, name: a.name, text: n });
    });
    return out;
  }

  function renderNotesModal() {
    var notes = getAllNotes();
    var html;
    if (!notes.length) {
      html = '<div class="empty">No notes yet. Select a structure and add one.</div>';
    } else {
      html = notes
        .map(function (n) {
          return (
            '<div class="note-item">' +
            '<div class="nm" data-goto-note="' + n.id + '">' + escapeHTML(n.name) + "</div>" +
            '<div class="nb">' + escapeHTML(n.text) + "</div>" +
            "</div>"
          );
        })
        .join("");
    }
    document.getElementById("notesModalContent").innerHTML = html;
    document.querySelectorAll("[data-goto-note]").forEach(function (el) {
      el.addEventListener("click", function () {
        selectAnatomy(el.getAttribute("data-goto-note"));
        document.getElementById("notesModal").classList.remove("open");
      });
    });
  }

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------
  function wireSearch() {
    var input = document.getElementById("searchInput");
    var results = document.getElementById("searchResults");

    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      if (!q) { results.classList.remove("open"); results.innerHTML = ""; return; }
      var matches = ANATOMY_DATA.filter(function (a) { return a.name.toLowerCase().indexOf(q) !== -1; }).slice(0, 8);
      if (!matches.length) {
        results.innerHTML = '<div class="empty">No matching structures.</div>';
      } else {
        results.innerHTML = matches
          .map(function (a) {
            return (
              '<div class="result" data-result="' + a.id + '">' +
              '<span class="swatch" style="width:8px;height:8px;border-radius:50%;background:' + a.color + '"></span>' +
              "<span>" + escapeHTML(a.name) + "</span></div>"
            );
          })
          .join("");
        results.querySelectorAll("[data-result]").forEach(function (r) {
          r.addEventListener("click", function () {
            selectAnatomy(r.getAttribute("data-result"));
            results.classList.remove("open");
            input.value = "";
          });
        });
      }
      results.classList.add("open");
    });

    document.addEventListener("click", function (e) {
      if (!input.contains(e.target) && !results.contains(e.target)) results.classList.remove("open");
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        var first = results.querySelector("[data-result]");
        if (first) first.click();
      }
    });
  }

  // ------------------------------------------------------------------
  // Camera control / views / section mode
  // ------------------------------------------------------------------
  function focusCameraOnMesh(meshId) {
    var entry = registry[meshId];
    if (!entry) return;
    var worldPos = new THREE.Vector3();
    entry.root.getWorldPosition(worldPos);

    var dir = camera.position.clone().sub(controls.target).normalize();
    var dist = Math.max(2.8, Math.min(camera.position.distanceTo(controls.target), 5.5));
    var newCamPos = worldPos.clone().add(dir.multiplyScalar(dist));
    animateCamera(newCamPos, worldPos, 600);
  }

  function goToView(name) {
    var preset = VIEW_PRESETS[name];
    if (!preset) return;
    document.querySelectorAll("#viewGroup .tbtn").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-view") === name);
    });
    animateCamera(new THREE.Vector3(preset.pos[0], preset.pos[1], preset.pos[2]), new THREE.Vector3(preset.target[0], preset.target[1], preset.target[2]), 700);
    if (preset.section) setSectionMode(preset.section, true);
  }

  function animateCamera(toPos, toTarget, duration) {
    if (cameraAnim) cancelAnimationFrame(cameraAnim.raf);
    var fromPos = camera.position.clone();
    var fromTarget = controls.target.clone();
    var start = performance.now();
    controls.enabled = false;

    function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

    function step() {
      var elapsed = performance.now() - start;
      var t = Math.min(1, elapsed / duration);
      var e = ease(t);
      camera.position.lerpVectors(fromPos, toPos, e);
      controls.target.lerpVectors(fromTarget, toTarget, e);
      controls.update();
      if (t < 1) {
        cameraAnim = { raf: requestAnimationFrame(step) };
      } else {
        controls.enabled = true;
        cameraAnim = null;
      }
    }
    step();
  }

  function setSectionMode(mode, skipRadioSync) {
    sectionMode = mode;
    var active = mode !== "full";
    Object.keys(registry).forEach(function (id) {
      registry[id].materials.forEach(function (m) { m.clippingPlanes = active ? [clipPlane] : []; });
    });
    if (!skipRadioSync) {
      var radio = document.querySelector('input[name="section"][value="' + mode + '"]');
      if (radio) radio.checked = true;
    }
    document.getElementById("sectionModeBtn").classList.toggle("active", active);
  }

  // ------------------------------------------------------------------
  // Raycasting / click handling
  // ------------------------------------------------------------------
  function wirePicking() {
    var mouse = new THREE.Vector2();
    var downPos = null;
    var downTime = 0;

    function setMouseFromEvent(e) {
      var rect = renderer.domElement.getBoundingClientRect();
      var cx = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0].clientX);
      var cy = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0].clientY);
      mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;
    }

    renderer.domElement.addEventListener("pointerdown", function (e) {
      downPos = { x: e.clientX, y: e.clientY };
      downTime = performance.now();
    });

    renderer.domElement.addEventListener("pointerup", function (e) {
      if (!downPos) return;
      var moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      var elapsed = performance.now() - downTime;
      downPos = null;
      if (moved > 6 || elapsed > 550) return; // was a drag, not a click

      setMouseFromEvent(e);
      raycaster.setFromCamera(mouse, camera);
      var hits = raycaster.intersectObjects(pickable, false);
      if (hits.length) {
        var meshId = hits[0].object.userData.meshId;
        var anatomyEntry = getPrimaryAnatomyForMesh(meshId);
        if (anatomyEntry) selectAnatomy(anatomyEntry.id);
      } else {
        deselectAll();
      }
    });
  }

  // ------------------------------------------------------------------
  // Share view (URL state)
  // ------------------------------------------------------------------
  function buildShareState() {
    var visOverrides = {};
    var opOverrides = {};
    Object.keys(registry).forEach(function (id) {
      var entry = registry[id];
      if (!entry.root.visible) visOverrides[id] = 0;
      var op = Math.round(entry.materials[0].opacity * 100);
      var base = Math.round(entry.baseOpacity * 100);
      if (op !== base) opOverrides[id] = op;
    });
    return {
      a: currentAnatomyId,
      sm: sectionMode,
      cp: [round2(camera.position.x), round2(camera.position.y), round2(camera.position.z)],
      ct: [round2(controls.target.x), round2(controls.target.y), round2(controls.target.z)],
      v: visOverrides,
      o: opOverrides
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function encodeState(state) {
    try {
      return btoa(encodeURIComponent(JSON.stringify(state)));
    } catch (e) {
      return "";
    }
  }

  function decodeState(str) {
    try {
      return JSON.parse(decodeURIComponent(atob(str)));
    } catch (e) {
      return null;
    }
  }

  function buildShareURL() {
    var encoded = encodeState(buildShareState());
    var url = window.location.origin + window.location.pathname;
    if (encoded) url += "?s=" + encoded;
    return url;
  }

  function tryRestoreFromURL() {
    var params = new URLSearchParams(window.location.search);
    var s = params.get("s");
    if (!s) return false;
    var state = decodeState(s);
    if (!state) return false;

    suppressDemo = true;
    if (state.sm) setSectionMode(state.sm, false);
    if (state.v) {
      Object.keys(state.v).forEach(function (id) { if (registry[id]) registry[id].root.visible = false; });
    }
    if (state.o) {
      Object.keys(state.o).forEach(function (id) {
        if (registry[id]) registry[id].materials.forEach(function (m) { m.opacity = state.o[id] / 100; });
      });
    }
    buildLayersPanel();
    if (state.cp && state.ct) {
      camera.position.set(state.cp[0], state.cp[1], state.cp[2]);
      controls.target.set(state.ct[0], state.ct[1], state.ct[2]);
      controls.update();
    }
    if (state.a) selectAnatomy(state.a);
    return true;
  }

  function shareView() {
    var url = buildShareURL();
    if (navigator.share) {
      navigator.share({ title: "3D Eye Anatomy Explorer", url: url }).catch(function () { copyLinkFallback(url); });
    } else {
      copyLinkFallback(url);
    }
  }

  function copyLinkFallback(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () { showToast("Link copied to clipboard."); },
        function () { window.prompt("Copy this link:", url); }
      );
    } else {
      window.prompt("Copy this link:", url);
    }
  }

  // ------------------------------------------------------------------
  // Screenshot export
  // ------------------------------------------------------------------
  function captureView() {
    renderer.render(scene, camera);
    var srcCanvas = renderer.domElement;
    var out = document.createElement("canvas");
    out.width = srcCanvas.width;
    out.height = srcCanvas.height;
    var ctx = out.getContext("2d");
    ctx.fillStyle = "#0a1420";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(srcCanvas, 0, 0, out.width, out.height);

    if (currentAnatomyId) {
      var entry = getAnatomyById(currentAnatomyId);
      var label = entry ? entry.name : "";
      var pad = 18 * (out.width / srcCanvas.clientWidth);
      var fontSize = Math.round(out.width * 0.022);
      ctx.font = "600 " + fontSize + "px -apple-system, Segoe UI, sans-serif";
      var textW = ctx.measureText(label).width;
      var boxW = textW + pad * 2;
      var boxH = fontSize + pad;
      var x = pad, y = out.height - boxH - pad;
      ctx.fillStyle = "rgba(10,20,32,0.72)";
      ctx.fillRect(x, y, boxW, boxH);
      ctx.fillStyle = "#eef3f7";
      ctx.fillText(label, x + pad * 0.6, y + boxH * 0.68);
    }

    var link = document.createElement("a");
    var name = (currentAnatomyId || "full-eye") + "-" + Date.now() + ".png";
    link.download = "eye-anatomy-" + name;
    link.href = out.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Screenshot saved.");
  }

  // ------------------------------------------------------------------
  // Demo intro
  // ------------------------------------------------------------------
  function runDemoIntro() {
    controls.autoRotate = true;
    setTimeout(function () {
      controls.autoRotate = false;
      var tip = document.getElementById("demoTooltip");
      tip.classList.add("show");
      setTimeout(function () { tip.classList.remove("show"); }, 2600);
    }, 3000);
  }

  function showToast(msg) {
    var tip = document.getElementById("demoTooltip");
    tip.textContent = msg;
    tip.classList.add("show");
    setTimeout(function () {
      tip.classList.remove("show");
      setTimeout(function () { tip.textContent = "Click any structure to explore."; }, 400);
    }, 2000);
  }

  // ------------------------------------------------------------------
  // Mobile bottom sheets
  // ------------------------------------------------------------------
  function openMobileSheet(which) {
    document.getElementById(which).classList.add("open");
    document.getElementById("sheetBackdrop").classList.add("open");
  }
  function closeMobileSheet(which) {
    document.getElementById(which).classList.remove("open");
    document.getElementById("sheetBackdrop").classList.remove("open");
  }

  // ------------------------------------------------------------------
  // UI wiring
  // ------------------------------------------------------------------
  function wireUI() {
    wireSearch();
    wirePicking();

    document.querySelectorAll("#viewGroup .tbtn").forEach(function (btn) {
      btn.addEventListener("click", function () { goToView(btn.getAttribute("data-view")); });
    });

    document.getElementById("resetBtn").addEventListener("click", function () {
      deselectAll();
      isolateActive = false;
      var isoBtn = document.getElementById("isolateBtn");
      isoBtn.classList.remove("active");
      isoBtn.innerHTML = '<span class="glyph">&#9678;</span> Isolate';
      Object.keys(registry).forEach(function (id) {
        registry[id].root.visible = true;
        registry[id].materials.forEach(function (m) { m.opacity = registry[id].baseOpacity; });
      });
      buildLayersPanel();
      setSectionMode("full");
      goToView("full");
    });

    var autoBtn = document.getElementById("autoRotateBtn");
    autoBtn.addEventListener("click", function () {
      controls.autoRotate = !controls.autoRotate;
      autoBtn.classList.toggle("active", controls.autoRotate);
    });

    document.getElementById("sectionModeBtn").addEventListener("click", function () {
      togglePanel("sectionPanel");
    });
    document.getElementById("layersBtn").addEventListener("click", function () {
      togglePanel("layersPanel");
    });
    document.querySelectorAll('input[name="section"]').forEach(function (radio) {
      radio.addEventListener("change", function () { setSectionMode(radio.value, true); });
    });
    document.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.getElementById(btn.getAttribute("data-close")).classList.remove("open");
      });
    });

    document.getElementById("isolateBtn").addEventListener("click", toggleIsolate);
    document.getElementById("captureBtn").addEventListener("click", captureView);
    document.getElementById("shareBtn").addEventListener("click", shareView);

    document.getElementById("allNotesBtn").addEventListener("click", function () {
      renderNotesModal();
      document.getElementById("notesModal").classList.add("open");
    });
    document.getElementById("closeNotesModal").addEventListener("click", function () {
      document.getElementById("notesModal").classList.remove("open");
    });
    document.getElementById("notesModal").addEventListener("click", function (e) {
      if (e.target.id === "notesModal") document.getElementById("notesModal").classList.remove("open");
    });

    // Mobile
    document.getElementById("fabAnatomy").addEventListener("click", function () { openMobileSheet("sidebar"); });
    document.getElementById("fabInfo").addEventListener("click", function () { openMobileSheet("infoPanel"); });
    document.getElementById("sheetBackdrop").addEventListener("click", function () {
      closeMobileSheet("sidebar");
      closeMobileSheet("infoPanel");
    });
    document.querySelectorAll(".sheet-handle").forEach(function (h) {
      h.addEventListener("click", function () {
        closeMobileSheet("sidebar");
        closeMobileSheet("infoPanel");
      });
    });
  }

  function togglePanel(id) {
    var el = document.getElementById(id);
    var willOpen = !el.classList.contains("open");
    document.querySelectorAll(".float-panel").forEach(function (p) { p.classList.remove("open"); });
    if (willOpen) el.classList.add("open");
  }

  // ------------------------------------------------------------------
  // Render loop / resize
  // ------------------------------------------------------------------
  function onResize() {
    var w = viewportEl.clientWidth, h = viewportEl.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  // ------------------------------------------------------------------
  // Utility
  // ------------------------------------------------------------------
  function escapeHTML(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
