/**
 * anatomy-data.js
 * ----------------
 * Pure data. No Three.js, no DOM. Every anatomical structure the app knows
 * about lives here, so adding a new one is a matter of adding an entry
 * (and, if it needs its own geometry, a builder in app.js's MESH_BUILDERS).
 *
 * meshId: which mesh in the scene this entry points to. Several entries can
 * share a meshId (e.g. "Optic Nerve Head" and "Optic Disc" are the same
 * physical structure viewed as two teaching labels) - clicking either one
 * highlights the same object.
 */

const ANATOMY_CATEGORIES = [
  { id: "external", label: "External" },
  { id: "anterior", label: "Anterior Segment" },
  { id: "lens", label: "Lens" },
  { id: "posterior", label: "Posterior Segment" },
  { id: "vessels", label: "Vessels" },
  { id: "muscles", label: "Extraocular" }
];

const ANATOMY_DATA = [
  {
    id: "cornea",
    meshId: "cornea",
    name: "Cornea",
    category: "external",
    color: "#cfe9f4",
    function: "The clear, dome-shaped anterior window of the eye. It provides roughly two-thirds of the eye's total focusing power and is the first surface light passes through.",
    clinicalRelevance: "Central to refractive surgery (LASIK/PRK), keratoconus, corneal transplant (keratoplasty), and contact lens fitting.",
    related: ["sclera", "anteriorChamber", "conjunctiva"]
  },
  {
    id: "sclera",
    meshId: "sclera",
    name: "Sclera",
    category: "external",
    color: "#f2ede1",
    function: "The tough, fibrous white outer coat that gives the eye its shape and protects the inner structures. It is continuous with the cornea at the limbus.",
    clinicalRelevance: "Site of scleral buckle surgery for retinal detachment; can thin or discolor in scleritis and some systemic diseases.",
    related: ["cornea", "choroid", "extraocularMuscle"]
  },
  {
    id: "conjunctiva",
    meshId: "conjunctiva",
    name: "Conjunctiva",
    category: "external",
    color: "#ffe3cf",
    function: "A thin, translucent mucous membrane covering the visible sclera and lining the inner eyelids, keeping the eye lubricated and helping guard against infection.",
    clinicalRelevance: "Site of conjunctivitis (\"pink eye\"), subconjunctival hemorrhage, and pterygium.",
    related: ["sclera", "cornea"]
  },
  {
    id: "iris",
    meshId: "iris",
    name: "Iris",
    category: "anterior",
    color: "#5c4530",
    function: "The pigmented, muscular diaphragm that controls pupil size, regulating how much light enters the eye.",
    clinicalRelevance: "Relevant in angle-closure glaucoma, iritis/uveitis, and iris coloboma.",
    related: ["pupil", "ciliaryBody", "anteriorChamber"]
  },
  {
    id: "pupil",
    meshId: "pupil",
    name: "Pupil",
    category: "anterior",
    color: "#0a0a0a",
    function: "The central opening in the iris through which light passes to reach the lens and retina. Its diameter changes reflexively with light levels.",
    clinicalRelevance: "Pupil size and reactivity are key neurological exam findings (e.g. relative afferent pupillary defect, Adie's pupil).",
    related: ["iris", "lens"]
  },
  {
    id: "anteriorChamber",
    meshId: "anteriorChamber",
    name: "Anterior Chamber",
    category: "anterior",
    color: "#bfe6f2",
    function: "The fluid-filled space between the cornea and the iris, filled with aqueous humor that nourishes nearby tissue and maintains intraocular pressure.",
    clinicalRelevance: "Its depth and drainage angle are assessed in glaucoma; aqueous misdirection and hyphema occur here.",
    related: ["cornea", "iris", "trabecularMeshwork"]
  },
  {
    id: "posteriorChamber",
    meshId: "posteriorChamber",
    name: "Posterior Chamber",
    category: "anterior",
    color: "#bfe6f2",
    function: "The narrow space behind the iris and in front of the lens, where aqueous humor is produced by the ciliary body before flowing into the anterior chamber.",
    clinicalRelevance: "Site of aqueous production; involved in pupillary block glaucoma.",
    related: ["iris", "ciliaryBody", "lens"]
  },
  {
    id: "trabecularMeshwork",
    meshId: "trabecularMeshwork",
    name: "Trabecular Meshwork",
    category: "anterior",
    color: "#8fb3a1",
    function: "A sponge-like tissue at the iridocorneal angle that filters aqueous humor as it drains from the anterior chamber into the canal of Schlemm.",
    clinicalRelevance: "The primary site of resistance in open-angle glaucoma and the target of trabeculectomy and MIGS procedures.",
    related: ["anteriorChamber", "canalOfSchlemm"]
  },
  {
    id: "canalOfSchlemm",
    meshId: "canalOfSchlemm",
    name: "Canal of Schlemm",
    category: "anterior",
    color: "#6fa39a",
    function: "A circular channel that collects filtered aqueous humor from the trabecular meshwork and returns it to the venous system.",
    clinicalRelevance: "Target of canaloplasty and several minimally invasive glaucoma surgeries (MIGS).",
    related: ["trabecularMeshwork"]
  },
  {
    id: "ciliaryBody",
    meshId: "ciliaryBody",
    name: "Ciliary Body",
    category: "anterior",
    color: "#a8865f",
    function: "A ring of tissue behind the iris that produces aqueous humor and, via the ciliary muscle, adjusts lens shape for focusing (accommodation).",
    clinicalRelevance: "Involved in accommodation loss (presbyopia), and a target of some glaucoma procedures (cyclophotocoagulation).",
    related: ["ciliaryMuscle", "zonules", "posteriorChamber"]
  },
  {
    id: "ciliaryMuscle",
    meshId: "ciliaryMuscle",
    name: "Ciliary Muscle",
    category: "anterior",
    color: "#8f6f4c",
    function: "Smooth muscle within the ciliary body that contracts and relaxes to change lens curvature, allowing the eye to focus on near and far objects.",
    clinicalRelevance: "Its gradual stiffening underlies presbyopia; it is temporarily paralyzed (cycloplegia) for certain eye exams.",
    related: ["ciliaryBody", "zonules"]
  },
  {
    id: "zonules",
    meshId: "zonules",
    name: "Zonules (of Zinn)",
    category: "anterior",
    color: "#e7e7e7",
    function: "Fine radial fibers that suspend the lens from the ciliary body, transmitting ciliary muscle tension to reshape the lens during accommodation.",
    clinicalRelevance: "Weakness or rupture (zonulopathy) causes lens instability, relevant in Marfan syndrome and cataract surgery planning.",
    related: ["ciliaryBody", "lens"]
  },
  {
    id: "lens",
    meshId: "lens",
    name: "Lens",
    category: "lens",
    color: "#d7edf7",
    function: "A transparent, biconvex structure behind the iris that fine-tunes focusing power by changing shape, working with the cornea to focus light on the retina.",
    clinicalRelevance: "Clouding of the lens is a cataract, one of the most common causes of treatable vision loss worldwide.",
    related: ["lensCapsule", "zonules", "pupil"]
  },
  {
    id: "lensCapsule",
    meshId: "lensCapsule",
    name: "Lens Capsule",
    category: "lens",
    color: "#eef7fb",
    function: "A thin, elastic membrane that encloses the lens, anchoring the zonule fibers and helping shape the lens during accommodation.",
    clinicalRelevance: "The posterior capsule is preserved in modern cataract surgery to support the replacement intraocular lens (IOL); it can cloud afterward (posterior capsule opacification).",
    related: ["lens", "zonules"]
  },
  {
    id: "vitreous",
    meshId: "vitreous",
    name: "Vitreous Body",
    category: "posterior",
    color: "#cfe3ea",
    function: "A clear, gel-like substance filling the space between the lens and the retina, helping maintain the eye's spherical shape.",
    clinicalRelevance: "Vitreous detachment, floaters, and hemorrhage occur here; it is removed or replaced in vitrectomy surgery.",
    related: ["lens", "retina"]
  },
  {
    id: "retina",
    meshId: "retina",
    name: "Retina",
    category: "posterior",
    color: "#b5503c",
    function: "The light-sensitive layer lining the back of the eye. Photoreceptor cells convert light into neural signals sent to the brain via the optic nerve.",
    clinicalRelevance: "Site of retinal detachment, diabetic retinopathy, and retinitis pigmentosa.",
    related: ["choroid", "macula", "opticNerve", "oraSerrata"]
  },
  {
    id: "choroid",
    meshId: "choroid",
    name: "Choroid",
    category: "posterior",
    color: "#6e2a28",
    function: "A vascular layer between the retina and sclera that supplies blood and oxygen to the outer retina and absorbs excess light.",
    clinicalRelevance: "Involved in choroidal neovascularization (a feature of wet age-related macular degeneration) and choroidal melanoma.",
    related: ["retina", "sclera", "bruchsMembrane"]
  },
  {
    id: "bruchsMembrane",
    meshId: "bruchsMembrane",
    name: "Bruch's Membrane",
    category: "posterior",
    color: "#9c716c",
    function: "A thin, multi-layered membrane separating the choroid from the retinal pigment epithelium, regulating the exchange of nutrients and waste.",
    clinicalRelevance: "Deposits beneath it (drusen) and breaks in it are early and late features of age-related macular degeneration.",
    related: ["choroid", "rpe"]
  },
  {
    id: "rpe",
    meshId: "rpe",
    name: "Retinal Pigment Epithelium",
    category: "posterior",
    color: "#43291b",
    function: "A single layer of pigmented cells beneath the photoreceptors that supports and nourishes them and recycles visual pigment.",
    clinicalRelevance: "RPE dysfunction and atrophy (geographic atrophy) underlie dry age-related macular degeneration and several inherited retinal dystrophies.",
    related: ["retina", "bruchsMembrane", "macula"]
  },
  {
    id: "macula",
    meshId: "macula",
    name: "Macula",
    category: "posterior",
    color: "#d99a5f",
    function: "A small, specialized oval region of the retina, rich in cone photoreceptors, responsible for sharp central and color vision.",
    clinicalRelevance: "Affected in age-related macular degeneration, macular edema, and macular holes - major causes of central vision loss.",
    related: ["fovea", "retina"]
  },
  {
    id: "fovea",
    meshId: "fovea",
    name: "Fovea",
    category: "posterior",
    color: "#8a3d2c",
    function: "A tiny pit at the center of the macula with the eye's highest concentration of cone photoreceptors, giving the sharpest point of vision.",
    clinicalRelevance: "Foveal involvement is the key factor determining visual prognosis in macular disease and surgery.",
    related: ["macula"]
  },
  {
    id: "opticDisc",
    meshId: "opticDisc",
    name: "Optic Disc",
    category: "posterior",
    color: "#f0d9a3",
    function: "The visible point on the retina where axons from retinal ganglion cells converge to form the optic nerve; it contains no photoreceptors, creating the eye's natural blind spot.",
    clinicalRelevance: "Its appearance (\"cupping\") is a key sign monitored in glaucoma; swelling (papilledema) can signal raised intracranial pressure.",
    related: ["opticNerve", "retina"]
  },
  {
    id: "opticNerve",
    meshId: "opticNerve",
    name: "Optic Nerve",
    category: "posterior",
    color: "#e7dcc3",
    function: "The bundle of over a million nerve fibers that carries visual signals from the retina to the brain.",
    clinicalRelevance: "Damaged progressively in glaucoma; also affected by optic neuritis, ischemic optic neuropathy, and compressive lesions.",
    related: ["opticDisc", "centralRetinalArtery", "centralRetinalVein"]
  },
  {
    id: "extraocularMuscle",
    meshId: "extraocularMuscle",
    name: "Extraocular Muscle",
    category: "muscles",
    color: "#b3484a",
    function: "One of six muscles attached to the outer sclera that rotate the eye within the orbit, coordinating eye movements between both eyes.",
    clinicalRelevance: "Imbalance causes strabismus (misaligned eyes); these muscles are surgically adjusted to correct it.",
    related: ["sclera"]
  },
  {
    id: "centralRetinalArtery",
    meshId: "centralRetinalArtery",
    name: "Central Retinal Artery",
    category: "vessels",
    color: "#c0392b",
    function: "A small branch of the ophthalmic artery that travels within the optic nerve and supplies blood to the inner retina.",
    clinicalRelevance: "Its sudden blockage (central retinal artery occlusion) causes painless, sudden vision loss and is treated as a medical emergency.",
    related: ["opticNerve", "retinalVessels"]
  },
  {
    id: "centralRetinalVein",
    meshId: "centralRetinalVein",
    name: "Central Retinal Vein",
    category: "vessels",
    color: "#2f6690",
    function: "The vein running alongside the central retinal artery through the optic nerve, draining blood from the retina.",
    clinicalRelevance: "Blockage (central retinal vein occlusion) causes retinal hemorrhage and swelling and is a common cause of vision loss in older adults.",
    related: ["opticNerve", "retinalVessels"]
  },
  {
    id: "retinalVessels",
    meshId: "retinalVessels",
    name: "Major Retinal Vessels",
    category: "vessels",
    color: "#ad3a29",
    function: "Branches of the central retinal artery and vein that fan out across the retinal surface, nourishing it and providing a view of the body's circulation.",
    clinicalRelevance: "Their appearance changes visibly in diabetes, hypertension, and other vascular disease - retinal exams often reveal systemic illness.",
    related: ["centralRetinalArtery", "centralRetinalVein", "retina"]
  },
  {
    id: "oraSerrata",
    meshId: "oraSerrata",
    name: "Ora Serrata",
    category: "posterior",
    color: "#7d9c8d",
    function: "The scalloped, serrated boundary marking the transition from the light-sensitive retina to the non-sensory ciliary body toward the front of the eye.",
    clinicalRelevance: "A common origin point for peripheral retinal tears and detachments.",
    related: ["retina", "ciliaryBody"]
  },
  {
    id: "opticNerveHead",
    meshId: "opticDisc",
    name: "Optic Nerve Head",
    category: "posterior",
    color: "#f0d9a3",
    function: "Another name for the optic disc: the point where retinal nerve fibers exit the eye to form the optic nerve.",
    clinicalRelevance: "Examined directly with ophthalmoscopy or OCT as a primary indicator of glaucomatous damage.",
    related: ["opticDisc", "opticNerve"]
  },
  {
    id: "fovealRegion",
    meshId: "fovea",
    name: "Foveal Region",
    category: "posterior",
    color: "#8a3d2c",
    function: "The small surrounding zone centered on the fovea, together forming the area of sharpest, cone-driven vision used for reading and fine detail.",
    clinicalRelevance: "Precise anatomy here (foveal contour, avascular zone) is routinely measured on OCT imaging.",
    related: ["fovea", "macula"]
  },
  {
    id: "macularRegion",
    meshId: "macula",
    name: "Macular Region",
    category: "posterior",
    color: "#d99a5f",
    function: "The broader area of retina surrounding and including the macula, containing a high density of cones supporting detailed central vision.",
    clinicalRelevance: "The region most commonly imaged and monitored in macular degeneration and diabetic macular edema.",
    related: ["macula", "fovea", "retina"]
  }
];

function getAnatomyById(id) {
  return ANATOMY_DATA.find((a) => a.id === id) || null;
}

function getAnatomyByMeshId(meshId) {
  return ANATOMY_DATA.filter((a) => a.meshId === meshId);
}

function getPrimaryAnatomyForMesh(meshId) {
  // Prefer a non-alias entry (id === meshId) when one exists.
  const entries = getAnatomyByMeshId(meshId);
  return entries.find((a) => a.id === meshId) || entries[0] || null;
}
