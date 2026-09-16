import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ANATOMY, CATEGORIES } from "./anatomy-data.js";

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x081018);

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
camera.position.set(0, 0.25, 6.8);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minDistance = 2.2;
controls.maxDistance = 14;
controls.target.set(0,0,0);
controls.autoRotateSpeed = 0.65;
controls.enableRotate = true;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const eye = new THREE.Group();
scene.add(eye);

const anatomyMeshes = new Map();
const rootGroups = new Map();
const originalMaterials = new Map();
let selectedId = "cornea";
let autoRotate = false;
let sectionMode = false;
let demoTimer;
let isPointerDown = false;

const clipPlane = new THREE.Plane(new THREE.Vector3(-1,0,0), 0.15);
renderer.localClippingEnabled = true;

function mat(color, opts={}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: opts.roughness ?? .42, metalness: opts.metalness ?? 0,
    transparent: opts.transparent ?? false, opacity: opts.opacity ?? 1,
    transmission: opts.transmission ?? 0, thickness: opts.thickness ?? .2,
    side: opts.side ?? THREE.FrontSide, depthWrite: opts.depthWrite ?? true,
    emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 0,
    clippingPlanes: opts.clippingPlanes ?? []
  });
}
function addMesh(id, geometry, material, position=[0,0,0], rotation=[0,0,0], parent=eye) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.rotation.set(...rotation);
  mesh.userData.anatomyId = id;
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  if (!anatomyMeshes.has(id)) anatomyMeshes.set(id, []);
  anatomyMeshes.get(id).push(mesh);
  originalMaterials.set(mesh, material);
  return mesh;
}
function group(id){ const g=new THREE.Group(); g.userData.anatomyId=id; eye.add(g); rootGroups.set(id,g); return g; }

function buildEye(){
  const scleraG = new THREE.SphereGeometry(2.35, 72, 48);
  const scleraM = mat(ANATOMY.sclera.color,{roughness:.6});
  addMesh("sclera",scleraG,scleraM);

  // Rear shell layers: nested slightly smaller spheres, cut away in section mode.
  addMesh("choroid",new THREE.SphereGeometry(2.16,64,40),mat(ANATOMY.choroid.color,{roughness:.5,side:THREE.BackSide,depthWrite:false}));
  addMesh("rpe",new THREE.SphereGeometry(2.08,64,40),mat(ANATOMY.rpe.color,{roughness:.65,side:THREE.BackSide,depthWrite:false}));
  addMesh("bruchsMembrane",new THREE.SphereGeometry(2.055,64,40),mat(ANATOMY.bruchsMembrane.color,{roughness:.7,side:THREE.BackSide,depthWrite:false}));
  addMesh("retina",new THREE.SphereGeometry(2.02,64,40),mat(ANATOMY.retina.color,{roughness:.55,side:THREE.BackSide,depthWrite:false}));

  // Cornea as a front cap: sphere scaled along Z and clipped visually by a front-facing geometry.
  const cornea = addMesh("cornea",new THREE.SphereGeometry(1.42,64,40),mat(ANATOMY.cornea.color,{transparent:true,opacity:.34,transmission:.18,thickness:.25,roughness:.16,depthWrite:false}),[0,0,2.0]);
  cornea.scale.set(1.35,1.35,.42);

  // Conjunctival ring.
  addMesh("conjunctiva",new THREE.TorusGeometry(1.62,.07,16,72),mat(ANATOMY.conjunctiva.color,{transparent:true,opacity:.55}),[0,0,2.13]);

  // Iris and pupil disks.
  addMesh("iris",new THREE.CircleGeometry(.82,64),mat(ANATOMY.iris.color,{roughness:.36}),[0,0,2.03],[0,0,0]);
  addMesh("pupil",new THREE.CircleGeometry(.34,64),mat(ANATOMY.pupil.color,{roughness:.25}),[0,0,2.055]);
  // Anterior chamber visual volume.
  const chamber=addMesh("anteriorChamber",new THREE.SphereGeometry(1.06,48,32),mat(ANATOMY.anteriorChamber.color,{transparent:true,opacity:.08,transmission:.05,depthWrite:false}),[0,0,1.5]);
  chamber.scale.set(1,1,.45);
  const posterior=addMesh("posteriorChamber",new THREE.SphereGeometry(.72,48,24),mat(ANATOMY.posteriorChamber.color,{transparent:true,opacity:.07,depthWrite:false}),[0,0,1.1]);
  posterior.scale.z=.42;

  // Lens, capsule and zonules.
  addMesh("lensCapsule",new THREE.SphereGeometry(.68,64,40),mat(ANATOMY.lensCapsule.color,{transparent:true,opacity:.16,transmission:.1,depthWrite:false}),[0,0,.75]);
  const lens=addMesh("lens",new THREE.SphereGeometry(.62,64,40),mat(ANATOMY.lens.color,{transparent:true,opacity:.42,transmission:.2,thickness:.45,roughness:.2}),[0,0,.73]);
  lens.scale.set(1,1,.55);
  for(let i=0;i<12;i++){
    const a=i*Math.PI*2/12;
    addMesh("zonules",new THREE.CylinderGeometry(.012,.012,.62,8),mat(ANATOMY.zonules.color,{roughness:.45}),[Math.cos(a)*.83,Math.sin(a)*.83,.72],[0,0,a]);
  }

  // Ciliary body ring + muscle.
  addMesh("ciliaryBody",new THREE.TorusGeometry(.98,.15,20,64),mat(ANATOMY.ciliaryBody.color,{roughness:.5}),[0,0,1.02]);
  addMesh("ciliaryMuscle",new THREE.TorusGeometry(.87,.065,14,64),mat(ANATOMY.ciliaryMuscle.color,{roughness:.5}),[0,0,1.08]);

  // Trabecular meshwork + Schlemm ring near limbus.
  addMesh("trabecularMeshwork",new THREE.TorusGeometry(1.38,.055,12,72),mat(ANATOMY.trabecularMeshwork.color,{roughness:.55}),[0,0,1.9]);
  addMesh("canalSchlemm",new THREE.TorusGeometry(1.45,.026,10,72),mat(ANATOMY.canalSchlemm.color,{roughness:.4}),[0,0,1.91]);

  // Vitreous volume.
  addMesh("vitreous",new THREE.SphereGeometry(1.86,56,40),mat(ANATOMY.vitreous.color,{transparent:true,opacity:.06,transmission:.03,depthWrite:false}),[0,0,-.1]);

  // Optic nerve.
  addMesh("opticNerve",new THREE.CylinderGeometry(.28,.43,1.45,40),mat(ANATOMY.opticNerve.color,{roughness:.6}),[0,0,-2.72],[Math.PI/2,0,0]);

  // Posterior landmarks and vessels on rear-facing side.
  const rearZ=-2.04;
  addMesh("opticDisc",new THREE.CircleGeometry(.34,48),mat(ANATOMY.opticDisc.color,{roughness:.45}),[.42,0,rearZ],[0,Math.PI,0]);
  addMesh("opticNerveHead",new THREE.RingGeometry(.28,.39,48),mat(ANATOMY.opticNerveHead.color,{roughness:.42}),[.42,0,rearZ-.008],[0,Math.PI,0]);
  addMesh("macula",new THREE.CircleGeometry(.48,48),mat(ANATOMY.macula.color,{transparent:true,opacity:.72,roughness:.45}),[-.35,0,rearZ-.01],[0,Math.PI,0]);
  addMesh("macularRegion",new THREE.RingGeometry(.47,.65,48),mat(ANATOMY.macularRegion.color,{transparent:true,opacity:.48,roughness:.45}),[-.35,0,rearZ-.012],[0,Math.PI,0]);
  addMesh("fovea",new THREE.CircleGeometry(.15,40),mat(ANATOMY.fovea.color,{roughness:.35}),[-.35,0,rearZ-.025],[0,Math.PI,0]);
  addMesh("fovealRegion",new THREE.RingGeometry(.14,.25,40),mat(ANATOMY.fovealRegion.color,{transparent:true,opacity:.65}),[-.35,0,rearZ-.02],[0,Math.PI,0]);

  // Ora serrata as a rear torus approximation.
  addMesh("oraSerrata",new THREE.TorusGeometry(1.82,.055,12,72),mat(ANATOMY.oraSerrata.color,{roughness:.6}),[0,0,-1.86],[0,0,0]);

  // Central retinal artery and vein represented by posterior vessels.
  addMesh("retinalArtery",new THREE.TorusGeometry(.08,.018,8,32),mat(ANATOMY.retinalArtery.color,{roughness:.35}),[.42,0,rearZ-.035],[0,Math.PI,0]);
  addMesh("retinalVein",new THREE.TorusGeometry(.12,.022,8,32),mat(ANATOMY.retinalVein.color,{roughness:.4}),[.42,0,rearZ-.04],[0,Math.PI,0]);

  // Major retinal vessels: branching curves on the posterior surface.
  const vesselMat=mat(ANATOMY.retinalVessels.color,{roughness:.32});
  const branchDefs=[
    [[.42,0],[.0,.55],[-.32,.9],[-.65,1.15]],
    [[.42,0],[-.05,-.55],[-.34,-.92],[-.6,-1.18]],
    [[.42,0],[-.55,.18],[-.95,.35],[-1.3,.43]],
    [[.42,0],[.58,-.18],[1.0,-.4],[1.34,-.55]]
  ];
  for(const pts of branchDefs){
    const curve=new THREE.CatmullRomCurve3(pts.map(([x,y])=>new THREE.Vector3(x,y,rearZ-.05)));
    addMesh("retinalVessels",new THREE.TubeGeometry(curve,30,.018,8,false),vesselMat);
  }

  // Extraocular muscle representation.
  const em=group("extraocularMuscle");
  const muscleMat=mat(ANATOMY.extraocularMuscle.color,{roughness:.65});
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-.5,2.05,.1),new THREE.Vector3(-.2,2.55,.2),new THREE.Vector3(.3,2.72,.1)]);
  const muscle=new THREE.Mesh(new THREE.TubeGeometry(curve,20,.13,14,false),muscleMat);
  muscle.userData.anatomyId="extraocularMuscle"; muscle.castShadow=true; em.add(muscle);
  anatomyMeshes.set("extraocularMuscle",[muscle]); originalMaterials.set(muscle,muscleMat);

  // Give all material arrays a clipping plane reference.
  for(const meshes of anatomyMeshes.values()){
    for(const m of meshes){
      m.material.clippingPlanes = [];
    }
  }
}

function addLights(){
  scene.add(new THREE.HemisphereLight(0xbfe8f2,0x081018,1.35));
  const key=new THREE.DirectionalLight(0xffffff,2.1); key.position.set(4,5,6); key.castShadow=true; scene.add(key);
  const fill=new THREE.PointLight(0x5ec8e4,1.1,12); fill.position.set(-4,1,4); scene.add(fill);
  const rim=new THREE.PointLight(0xb5a0ff,.65,12); rim.position.set(2,-3,-5); scene.add(rim);
}

function setMaterialState(mesh, opacity, visible){
  mesh.visible=visible;
  const m=mesh.material;
  if(m){
    m.transparent = opacity<.995 || m.transparent;
    m.opacity=opacity;
    m.depthWrite=opacity>.45;
    m.needsUpdate=true;
  }
}

function clearHighlight(){
  for(const [id,meshes] of anatomyMeshes){
    for(const m of meshes){
      const base=originalMaterials.get(m);
      if(base) m.material.emissive.set(0x000000), m.material.emissiveIntensity=0;
      m.scale.lerp(new THREE.Vector3(1,1,1),.35);
    }
  }
}
function highlight(id){
  clearHighlight();
  for(const [other,meshes] of anatomyMeshes){
    const isSelected=other===id;
    for(const m of meshes){
      const base=originalMaterials.get(m);
      if(isSelected){
        m.material.emissive.set(ANATOMY[id]?.color ?? 0x62d6ef);
        m.material.emissiveIntensity=.22;
      }else{
        m.material.emissive.set(0x000000);
        m.material.emissiveIntensity=0;
      }
    }
  }
}

function selectStructure(id, focus=true){
  if(!ANATOMY[id] || !anatomyMeshes.has(id)) return;
  selectedId=id;
  highlight(id);
  renderInfo();
  document.querySelectorAll(".anatomy-item").forEach(b=>b.classList.toggle("active",b.dataset.id===id));
  if(focus) focusOn(id);
  hideDemoHint();
}

function focusOn(id){
  const meshes=anatomyMeshes.get(id); if(!meshes?.length)return;
  const box=new THREE.Box3();
  meshes.forEach(m=>box.expandByObject(m));
  const center=box.getCenter(new THREE.Vector3());
  const size=box.getSize(new THREE.Vector3());
  const maxDim=Math.max(size.x,size.y,size.z,.3);
  const dist=Math.max(1.9,Math.min(7.5,maxDim*3.0));
  const dir=new THREE.Vector3().subVectors(camera.position,controls.target).normalize();
  if(dir.lengthSq()<.1)dir.set(0,0,1);
  const targetPos=center.clone().add(dir.multiplyScalar(dist));
  animateCamera(targetPos,center);
}
function animateCamera(pos,target,duration=450){
  const fromP=camera.position.clone(), fromT=controls.target.clone(), start=performance.now();
  function step(now){
    const t=Math.min(1,(now-start)/duration), e=1-Math.pow(1-t,3);
    camera.position.lerpVectors(fromP,pos,e); controls.target.lerpVectors(fromT,target,e);
    if(t<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderInfo(){
  const a=ANATOMY[selectedId]; if(!a)return;
  document.querySelector("#infoName").textContent=a.name;
  document.querySelector("#infoContent").innerHTML=`
    <div class="eyebrow">${escapeHtml(a.category)}</div>
    <h3>FUNCTION</h3><p>${escapeHtml(a.function)}</p>
    <h3>CLINICAL RELEVANCE</h3><p>${escapeHtml(a.clinicalRelevance)}</p>
    <h3>RELATED STRUCTURES</h3>
    <div class="related">${a.related.map(id=>`<button data-related="${id}">${escapeHtml(ANATOMY[id]?.name||id)}</button>`).join("")}</div>`;
  document.querySelector("#noteInput").value=localStorage.getItem(noteKey(selectedId))||"";
  document.querySelectorAll("[data-related]").forEach(b=>b.onclick=()=>selectStructure(b.dataset.related,true));
}
function noteKey(id){return "eye-explorer-note:"+id}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

function buildSidebar(){
  const list=document.querySelector("#anatomyList");
  list.innerHTML=CATEGORIES.map(([cat,ids])=>`
    <div class="category">${cat}</div>
    ${ids.map(id=>`<button class="anatomy-item" data-id="${id}"><span class="swatch" style="color:#${ANATOMY[id].color.toString(16).padStart(6,"0")};background:#${ANATOMY[id].color.toString(16).padStart(6,"0")}"></span>${ANATOMY[id].name}</button>`).join("")}
  `).join("");
  list.querySelectorAll(".anatomy-item").forEach(b=>b.onclick=()=>{selectStructure(b.dataset.id,true);closeMobilePanels()});
}
function buildLayers(){
  const ids=Object.keys(ANATOMY).filter(id=>anatomyMeshes.has(id));
  const container=document.querySelector("#layerList");
  container.innerHTML=ids.map(id=>`
    <div class="layer-row">
      <div class="layer-top"><span class="layer-name">${escapeHtml(ANATOMY[id].name)}</span>
        <div class="layer-controls">
          <select data-state="${id}"><option value="visible">Visible</option><option value="transparent">Transparent</option><option value="hidden">Hidden</option></select>
          <input data-opacity="${id}" type="range" min="0" max="100" value="100" />
        </div>
      </div>
    </div>`).join("");
  container.querySelectorAll("[data-state]").forEach(sel=>sel.onchange=()=>{
    const id=sel.dataset.state, val=sel.value, range=container.querySelector(`[data-opacity="${id}"]`);
    const opacity=val==="hidden"?0:val==="transparent"?Math.min(35,+range.value):+range.value;
    anatomyMeshes.get(id)?.forEach(m=>setMaterialState(m,opacity/100,val!=="hidden"));
    if(id===selectedId) highlight(id);
  });
  container.querySelectorAll("[data-opacity]").forEach(r=>r.oninput=()=>{
    const id=r.dataset.opacity, sel=container.querySelector(`[data-state="${id}"]`);
    const opacity=+r.value/100;
    if(sel.value!=="hidden") anatomyMeshes.get(id)?.forEach(m=>setMaterialState(m,opacity,true));
  });
}

function resetView(){
  animateCamera(new THREE.Vector3(0,.25,6.8),new THREE.Vector3(0,0,0),500);
  controls.reset();
  sectionMode=false; applySection(false);
  autoRotate=false; controls.autoRotate=false; document.querySelector("#autoRotateBtn").textContent="Auto Rotate";
}
function applySection(on){
  sectionMode=on;
  renderer.localClippingEnabled=on;
  for(const meshes of anatomyMeshes.values()){
    meshes.forEach(m=>{
      m.material.clippingPlanes=on?[clipPlane]:[];
      m.material.needsUpdate=true;
    });
  }
  document.querySelector("#modeLabel").textContent=on?"SECTION MODE":"FULL EYE";
  document.querySelector("#sectionBtn").textContent=on?"Full Eye":"Section Mode";
}
function setView(view){
  const positions={
    anterior:new THREE.Vector3(0,0,7),
    lateral:new THREE.Vector3(7,0,.5),
    posterior:new THREE.Vector3(0,0,-7),
    section:new THREE.Vector3(5.2,.4,4.7)
  };
  animateCamera(positions[view]||positions.anterior,new THREE.Vector3(0,0,0),550);
  if(view==="section")applySection(true);
  else if(view!=="section")applySection(false);
}
function isolate(){
  anatomyMeshes.forEach((meshes,id)=>{
    meshes.forEach(m=>setMaterialState(m,id===selectedId?1:.06,id===selectedId));
  });
  focusOn(selectedId);
  toast(`Isolated ${ANATOMY[selectedId].name}. Use Layers → Visible or Reset to restore.`);
}
function showAll(){
  anatomyMeshes.forEach(meshes=>meshes.forEach(m=>setMaterialState(m,originalMaterials.get(m).opacity ?? 1,true)));
  highlight(selectedId);
}

function search(q){
  q=q.trim().toLowerCase(); if(!q)return;
  const id=Object.keys(ANATOMY).find(id=>ANATOMY[id].name.toLowerCase().includes(q)||id.toLowerCase().includes(q));
  if(id)selectStructure(id,true); else toast("No matching anatomy found.");
}

function saveNote(){
  const val=document.querySelector("#noteInput").value.trim();
  if(val)localStorage.setItem(noteKey(selectedId),val); else localStorage.removeItem(noteKey(selectedId));
  toast(val?"Note saved locally.":"Note cleared.");
  renderNotes();
}
function deleteNote(){
  localStorage.removeItem(noteKey(selectedId));
  document.querySelector("#noteInput").value="";
  toast("Note deleted.");
  renderNotes();
}
function renderNotes(){
  const el=document.querySelector("#savedNotesList");
  const entries=Object.keys(localStorage).filter(k=>k.startsWith("eye-explorer-note:")).map(k=>({id:k.split(":")[1],text:localStorage.getItem(k)})).filter(x=>x.text);
  el.innerHTML=entries.length?entries.map(x=>`<button class="saved-note" data-note-id="${x.id}" style="display:block;width:100%;text-align:left;border:0;background:transparent;color:#dcebf1"><strong>${escapeHtml(ANATOMY[x.id]?.name||x.id)}</strong><p>${escapeHtml(x.text)}</p></button>`).join(""):`<div class="saved-note"><p>No saved notes yet.</p></div>`;
  el.querySelectorAll("[data-note-id]").forEach(b=>b.onclick=()=>{selectStructure(b.dataset.noteId,true);document.querySelector("#notesPanel").classList.add("hidden")});
}

function encodeState(){
  const state={
    structure:selectedId,
    camera:[...camera.position.toArray()].map(n=>+n.toFixed(4)),
    target:[...controls.target.toArray()].map(n=>+n.toFixed(4)),
    section:sectionMode
  };
  const compact=btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  return `${location.origin}${location.pathname}#state=${encodeURIComponent(compact)}`;
}
function restoreState(){
  const hash=location.hash.match(/#state=([^&]+)/);
  if(!hash)return false;
  try{
    const state=JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(hash[1])))));
    if(state.camera)camera.position.fromArray(state.camera);
    if(state.target)controls.target.fromArray(state.target);
    if(state.section)applySection(true);
    if(state.structure)selectStructure(state.structure,false);
    return true;
  }catch(e){console.warn("Could not restore state",e);return false}
}
async function share(){
  const url=encodeState();
  try{await navigator.clipboard.writeText(url);toast("Shareable view link copied.");}
  catch{prompt("Copy this shareable view link:",url)}
  if(navigator.share){try{await navigator.share({title:"Eye Anatomy Explorer",text:`Explore ${ANATOMY[selectedId].name}`,url})}catch{}}
}
function capture(){
  renderer.render(scene,camera);
  const link=document.createElement("a");
  link.download=`eye-anatomy-${selectedId}-${Date.now()}.png`;
  link.href=renderer.domElement.toDataURL("image/png");
  link.click();
  toast("PNG capture exported.");
}
function toast(msg){
  const el=document.querySelector("#toast");el.textContent=msg;el.classList.add("show");
  clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("show"),2200);
}
function hideDemoHint(){document.querySelector("#demoHint").style.display="none"}

function pointerEvent(e){
  const rect=canvas.getBoundingClientRect();
  pointer.x=((e.clientX-rect.left)/rect.width)*2-1;
  pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
}
function pick(e){
  pointerEvent(e); raycaster.setFromCamera(pointer,camera);
  const objects=[...anatomyMeshes.values()].flat();
  const hits=raycaster.intersectObjects(objects,true);
  if(hits.length){
    const id=hits[0].object.userData.anatomyId;
    if(id)selectStructure(id,true);
  }
}

document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>setView(b.dataset.view));
document.querySelector("#resetBtn").onclick=resetView;
document.querySelector("#autoRotateBtn").onclick=()=>{
  autoRotate=!autoRotate;controls.autoRotate=autoRotate;
  document.querySelector("#autoRotateBtn").textContent=autoRotate?"Stop Rotate":"Auto Rotate";
};
document.querySelector("#sectionBtn").onclick=()=>applySection(!sectionMode);
document.querySelector("#layersBtn").onclick=()=>document.querySelector("#layersPanel").classList.toggle("hidden");
document.querySelector("#closeLayers").onclick=()=>document.querySelector("#layersPanel").classList.add("hidden");
document.querySelector("#captureBtn").onclick=capture;
document.querySelector("#shareBtn").onclick=share;
document.querySelector("#saveNoteBtn").onclick=saveNote;
document.querySelector("#deleteNoteBtn").onclick=deleteNote;
document.querySelector("#allNotesBtn").onclick=()=>{renderNotes();document.querySelector("#notesPanel").classList.remove("hidden")};
document.querySelector("#closeNotes").onclick=()=>document.querySelector("#notesPanel").classList.add("hidden");
document.querySelector("#searchInput").addEventListener("keydown",e=>{if(e.key==="Enter")search(e.target.value)});
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.querySelector("#"+b.dataset.close).classList.remove("open"));
canvas.addEventListener("pointerdown",()=>isPointerDown=true);
canvas.addEventListener("pointerup",e=>{if(isPointerDown)pick(e);isPointerDown=false});
window.addEventListener("resize",resize);

function openMobilePanels(){
  if(innerWidth<=780){
    document.querySelector("#anatomySidebar").classList.add("open");
    document.querySelector("#infoPanel").classList.add("open");
  }
}
function closeMobilePanels(){
  document.querySelector("#anatomySidebar").classList.remove("open");
  document.querySelector("#infoPanel").classList.remove("open");
}

function resize(){
  const w=canvas.clientWidth,h=canvas.clientHeight;
  if(!w||!h)return;
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);renderer.setPixelRatio(Math.min(devicePixelRatio,2));
}
function animate(){
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene,camera);
}
buildEye();addLights();buildSidebar();buildLayers();renderInfo();renderNotes();resize();animate();
document.querySelector("#loading").remove();
const restored=restoreState();
if(!restored)selectStructure("cornea",false);
setTimeout(()=>{autoRotate=true;controls.autoRotate=true;setTimeout(()=>{autoRotate=false;controls.autoRotate=false},3000)},250);
