const $ = id => document.getElementById(id);

const KEY = "partner-establishments-msg";   // for this page only
const msg = $("msg"), fMsg = $("fMsg");
const viewModal = $("viewModal"), formModal = $("formModal"), confirmModal = $("confirmModal");
const form = $("estForm"), qrInput = $("f_qr");
const UPLOADS = viewModal.dataset.uploads;
const MAX_MB = 5;
const MAX_IMAGES = 10;
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];

const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");

// All page messages
const DONE = {
  add: "Establishment added successfully.",
  edit: "Establishment updated successfully.",
  delete: "Establishment deleted."
};
const ERRORS = {
  missing_fields: "Please fill in all fields.",
  invalid_image: "Only PNG, JPG, JPEG, or WEBP images are accepted.",
  qr_required: "Please upload a GCash QR.",
  too_many_images: `You can add up to ${MAX_IMAGES} photos only.`,
  image_big: `Image is too large. Maximum size is ${MAX_MB}MB.`,
  invalid_barangay: "Please select a barangay from the list.",
  pin_required: "Please pin the establishment's location on the map.",
  out_of_area: "You can only pin locations within Calauan, Laguna.",
  not_found: "Establishment not found.",
  delete_failed: "Unable to delete the establishment.",
  not_logged_in: "Your session has expired. Please log in again.",
  network: "Unable to reach the server. Please try again."
};
const HINT_ADD = "Upload a GCash QR so tourists can pay.";
const HINT_EDIT = "Leave the QR blank if you don't want to change it.";

// ---------- Sidebar (burger) ----------
function setNav(open) {
  document.body.classList.toggle("nav-open", open);
  burger.setAttribute("aria-expanded", open);
}

// Bukas ang sidebar sa desktop, sarado sa tablet at mobile
setNav(!mobile.matches);
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("ready")));
mobile.addEventListener("change", e => setNav(!e.matches));

burger.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
overlay.addEventListener("click", () => setNav(false));

// ---------- Profile menu ----------
function setMenu(open) {
  profileMenu.classList.toggle("show", open);
  profileBtn.setAttribute("aria-expanded", open);
}

profileBtn.addEventListener("click", e => {
  e.stopPropagation();
  setMenu(!profileMenu.classList.contains("show"));
});
document.addEventListener("click", e => {
  if (!profileMenu.contains(e.target)) setMenu(false);
});

// ---------- Oras at petsa ----------
function updateClock() {
  const now = new Date();
  $("clockDate").textContent = now.toLocaleDateString("en-PH", {
    weekday: "short", month: "short", day: "numeric", year: "numeric"
  });
  $("clockTime").textContent = now.toLocaleTimeString("en-PH", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true
  });
}
updateClock();
setInterval(updateClock, 1000);

// ---------- Mensahe (page at form) ----------
function showMsg(el, text, type = "error", scroll = true) {
  el.hidden = false;
  el.className = "msg " + type;
  void el.offsetWidth;                 // para umulit ang animation
  el.textContent = text;
  if (scroll) el.scrollIntoView({ behavior: "smooth", block: "center" });
  clearTimeout(el._timer);
  el._timer = setTimeout(() => (el.hidden = true), 5000);
}

// Ipakita ang success message na itinabi bago mag-reload
const saved = sessionStorage.getItem(KEY);
if (saved) { showMsg(msg, saved, "ok"); sessionStorage.removeItem(KEY); }

// ---------- Details ng establishment ----------
document.querySelectorAll(".btn-view").forEach(btn => {
  btn.addEventListener("click", () => {
    const d = btn.closest("tr").dataset;
    $("v_business").textContent = d.business;
    $("v_code").textContent = d.code;
    $("v_category").textContent = d.category || "-";
    $("v_address").textContent = d.address || "-";
    $("v_contact").textContent = d.contact || "-";
    $("v_description").textContent = d.description || "-";
    $("v_barangay").textContent = d.barangay ? d.barangay + ", Calauan, Laguna" : "-";
    $("v_landmark").textContent = d.landmark || "-";
    const hasPin = d.lat && d.lng;
    $("v_map_wrap").hidden = !hasPin;
    if (hasPin) $("v_map").href = `https://www.google.com/maps?q=${d.lat},${d.lng}`;

    // Mga larawan
    const imgs = JSON.parse(d.images || "[]");
    const gal = $("v_gallery");
    gal.replaceChildren();
    imgs.forEach(i => {
      const fig = document.createElement("figure");
      const img = document.createElement("img");
      img.src = UPLOADS + i.image;
      img.alt = d.business;
      img.loading = "lazy";
      fig.appendChild(img);
      if (i.front) {
        const tag = document.createElement("span");
        tag.textContent = "Front";
        fig.appendChild(tag);
      }
      gal.appendChild(fig);
    });
    $("v_gallery_wrap").hidden = !imgs.length;

    const wrap = $("v_qr_wrap");
    if (d.qr) {
      $("v_qr").src = UPLOADS + d.qr;
      wrap.hidden = false;
    } else {
      wrap.hidden = true;
    }
    viewModal.classList.add("show");
  });
});
$("v_close").addEventListener("click", () => viewModal.classList.remove("show"));
viewModal.addEventListener("click", e => { if (e.target === viewModal) viewModal.classList.remove("show"); });


// ---------- Form: magdagdag / mag-edit ----------
let currentQr = "";   // pangalan ng kasalukuyang QR kapag nag-e-edit
let items = [];       // {type:"old", id, src, front} o {type:"new", file, src}
let frontItem = null; // ang napiling front image
let removed = [];     // id ng mga lumang larawan na aalisin

function setPreview(src) {
  const img = $("f_qr_preview");
  if (src) { img.src = src; img.hidden = false; }
  else { img.removeAttribute("src"); img.hidden = true; }
}

function renderGallery() {
  const box = $("f_gallery");
  box.replaceChildren();

  items.forEach(it => {
    const tile = document.createElement("div");
    tile.className = "tile" + (it === frontItem ? " front" : "");

    const img = document.createElement("img");
    img.src = it.src;
    img.alt = "";
    tile.appendChild(img);

    if (it === frontItem) {
      const tag = document.createElement("span");
      tag.className = "tile-tag";
      tag.textContent = "Front";
      tile.appendChild(tag);
    } else {
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "tile-btn pick";
      pick.textContent = "Set as front";
      pick.addEventListener("click", () => { frontItem = it; renderGallery(); });
      tile.appendChild(pick);
    }

    const del = document.createElement("button");
    del.type = "button";
    del.className = "tile-btn del";
    del.setAttribute("aria-label", "Remove photo");
    del.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>';
    del.addEventListener("click", () => removeItem(it));
    tile.appendChild(del);

    box.appendChild(tile);
  });

  $("f_gallery_hint").textContent = items.length
    ? `${items.length} / ${MAX_IMAGES} photos. Tap "Set as front" for the one shown on the homepage.`
    : `No photos yet. Up to ${MAX_IMAGES} photos.`;
}

function removeItem(it) {
  if (it.type === "old") removed.push(it.id);
  else URL.revokeObjectURL(it.src);
  items = items.filter(x => x !== it);
  if (frontItem === it) frontItem = items[0] || null;
  renderGallery();
}

function clearGallery() {
  items.forEach(it => { if (it.type === "new") URL.revokeObjectURL(it.src); });
  items = [];
  removed = [];
  frontItem = null;
}

function openForm(d) {
  const edit = !!d;
  form.reset();
  fMsg.hidden = true;
  $("f_pin_msg").hidden = true;

  $("f_id").value = edit ? d.id : "";
  $("f_business").value = edit ? d.business : "";
  $("f_category").value = edit ? d.category : "";
  $("f_barangay").value = edit ? (d.barangay || "") : "";
  $("f_landmark").value = edit ? (d.landmark || "") : "";
  $("f_address").value = edit ? d.address : "";
  $("f_contact").value = edit ? d.contact : "";
  $("f_description").value = edit ? d.description : "";
  $("f_lat").value = edit ? (d.lat || "") : "";
  $("f_lng").value = edit ? (d.lng || "") : "";

  $("fTitle").textContent = edit ? "Edit Establishment" : "Add Establishment";
  $("fHint").textContent = edit ? HINT_EDIT : HINT_ADD;
  $("fOk").textContent = edit ? "Save" : "Add";

  currentQr = edit ? (d.qr || "") : "";
  setPreview(currentQr ? UPLOADS + currentQr : "");
  $("f_qr_name").textContent = "";

  // Mga larawan
  clearGallery();
  const imgs = edit ? JSON.parse(d.images || "[]") : [];
  items = imgs.map(i => ({ type: "old", id: i.id, src: UPLOADS + i.image, front: i.front }));
  frontItem = items.find(i => i.front) || items[0] || null;
  renderGallery();

  formModal.classList.add("show");

  // Mapa
  initMap().then(() => {
    map.invalidateSize();
    const lat = parseFloat(edit ? d.lat : ""), lng = parseFloat(edit ? d.lng : "");
    if (!isNaN(lat) && !isNaN(lng)) {
      map.setView([lat, lng], 17);
      setPin(lat, lng);
    } else {
      clearPin();
      map.fitBounds(calauanBounds);
    }
    setTimeout(() => map.invalidateSize(), 350);   // pagkatapos ng animation ng modal
  });

  setTimeout(() => $("f_business").focus(), 300);
}

$("btnAdd").addEventListener("click", () => openForm(null));
document.querySelectorAll(".btn-edit").forEach(btn => {
  btn.addEventListener("click", () => openForm(btn.closest("tr").dataset));
});

function closeForm() { formModal.classList.remove("show"); }
$("fCancel").addEventListener("click", closeForm);
formModal.addEventListener("click", e => { if (e.target === formModal) closeForm(); });

// Preview ng napiling QR
qrInput.addEventListener("change", () => {
  const file = qrInput.files[0];
  if (!file) {
    setPreview(currentQr ? UPLOADS + currentQr : "");
    $("f_qr_name").textContent = "";
    return;
  }
  if (!IMG_TYPES.includes(file.type)) {
    qrInput.value = "";
    return showMsg(fMsg, ERRORS.invalid_image, "error", false);
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    qrInput.value = "";
    return showMsg(fMsg, ERRORS.image_big, "error", false);
  }
  setPreview(URL.createObjectURL(file));
  $("f_qr_name").textContent = file.name;
});

// Pagdagdag ng mga larawan ng establishment (pwedeng marami)
$("f_images").addEventListener("change", e => {
  const files = [...e.target.files];
  e.target.value = "";   // para mapili ulit ang parehong file kung kailangan

  for (const file of files) {
    if (items.length >= MAX_IMAGES) {
      showMsg(fMsg, ERRORS.too_many_images, "error", false);
      break;
    }
    if (!IMG_TYPES.includes(file.type)) {
      showMsg(fMsg, ERRORS.invalid_image, "error", false);
      continue;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      showMsg(fMsg, ERRORS.image_big, "error", false);
      continue;
    }
    const it = { type: "new", file, src: URL.createObjectURL(file) };
    items.push(it);
    if (!frontItem) frontItem = it;
  }
  renderGallery();
});

// I-save
form.addEventListener("submit", async e => {
  e.preventDefault();
  const editing = !!$("f_id").value;
  if (!editing && !qrInput.files.length) {
    return showMsg(fMsg, ERRORS.qr_required, "error", false);
  }
  if (!$("f_barangay").value) {
    return showMsg(fMsg, ERRORS.missing_fields, "error", true);
  }
  if (!$("f_lat").value || !$("f_lng").value) {
    return showMsg($("f_pin_msg"), ERRORS.pin_required, "error", true);
  }

  const fd = new FormData(form);

  // Mga larawan: "new:<bilang>" ang front kung bago, "old:<id>" kung luma
  let n = 0;
  items.forEach(it => {
    if (it.type === "new") {
      fd.append("images", it.file);
      if (it === frontItem) fd.set("front", "new:" + n);
      n++;
    } else if (it === frontItem) {
      fd.set("front", "old:" + it.id);
    }
  });
  removed.forEach(id => fd.append("remove", id));

  const btn = $("fOk");
  btn.disabled = true;
  btn.classList.add("loading");

  try {
    const res = await fetch(form.dataset.url, { method: "POST", body: fd });
    const data = await res.json();
    if (data.ok) {
      sessionStorage.setItem(KEY, DONE[data.mode]);
      location.reload();
      return;
    }
    showMsg(fMsg, ERRORS[data.error] || ERRORS.network, "error", false);
    if (data.error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
  } catch {
    showMsg(fMsg, ERRORS.network, "error", false);
  }
  btn.disabled = false;
  btn.classList.remove("loading");
});


// ---------- Burahin ----------
const cmOk = $("cmOk"), cmCancel = $("cmCancel");

function ask(name) {
  return new Promise(resolve => {
    $("cmText").textContent = `${name}: This will be permanently deleted and cannot be undone.`;
    confirmModal.classList.add("show");
    setTimeout(() => cmCancel.focus(), 300);

    const done = value => {
      confirmModal.classList.remove("show");
      cmOk.onclick = cmCancel.onclick = confirmModal.onclick = null;
      resolve(value);
    };
    cmOk.onclick = () => done(true);
    cmCancel.onclick = () => done(false);
    confirmModal.onclick = e => { if (e.target === confirmModal) done(false); };
  });
}

document.querySelectorAll(".btn-del").forEach(btn => {
  btn.addEventListener("click", async () => {
    const row = btn.closest("tr");
    if (!(await ask(row.dataset.business))) return;

    const buttons = row.querySelectorAll("button");
    buttons.forEach(b => (b.disabled = true));
    btn.classList.add("loading");

    try {
      const res = await fetch(row.dataset.deleteUrl, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        sessionStorage.setItem(KEY, DONE.delete);
        location.reload();
        return;
      }
      showMsg(msg, ERRORS[data.error] || ERRORS.network);
      if (data.error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
    } catch {
      showMsg(msg, ERRORS.network);
    }
    btn.classList.remove("loading");
    buttons.forEach(b => (b.disabled = false));
  });
});

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  viewModal.classList.remove("show");
  formModal.classList.remove("show");
  confirmModal.classList.remove("show");
  setMenu(false);
  if (mobile.matches) setNav(false);
});


// ---------- Mapa (Calauan, Laguna) ----------
const BOUNDARY_URL = formModal.dataset.boundary;      // static/calauan.geojson (opsyonal)
const BOUNDARY_CACHE = "calauan-boundary-v1";
const NOMINATIM = "https://nominatim.openstreetmap.org/search?q=Calauan,+Laguna,+Philippines" +
                  "&format=jsonv2&polygon_geojson=1&polygon_threshold=0.0003&limit=5";
const TILES = {
  street: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  sat: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
};
// Tinatayang kahon, gagamitin lang kung hindi ma-load ang tunay na boundary
const RECT = { type: "Polygon", coordinates: [[[121.26, 14.07], [121.42, 14.07], [121.42, 14.23], [121.26, 14.23], [121.26, 14.07]]] };
const PIN_HINT = "Click the map to place the pin. Only locations inside the highlighted boundary are allowed.";
const PIN_ICON = L.divIcon({ className: "pin-icon", html: "<span></span>", iconSize: [28, 28], iconAnchor: [14, 34] });

const pinMsg = $("f_pin_msg");
let map = null, mapReady = null, pin = null, lastOk = null;
let polys = [];                                       // mga polygon ng Calauan: [[ring, ring...], ...]
let calauanBounds = L.latLngBounds([14.07, 121.26], [14.23, 121.42]);
const layers = {};

function toGeometry(g) {
  if (!g) return null;
  if (g.type === "FeatureCollection") return toGeometry(g.features.find(f => f.geometry && /Polygon/.test(f.geometry.type)));
  if (g.type === "Feature") return g.geometry;
  return /Polygon/.test(g.type) ? g : null;
}

async function loadBoundary() {
  try {
    const c = localStorage.getItem(BOUNDARY_CACHE);
    if (c) return JSON.parse(c);
  } catch {}

  let geo = null;
  try {                                               // 1) sarili mong file
    const r = await fetch(BOUNDARY_URL);
    if (r.ok) geo = toGeometry(await r.json());
  } catch {}
  if (!geo) {                                         // 2) OpenStreetMap (Nominatim)
    try {
      const list = await (await fetch(NOMINATIM)).json();
      const hit = list.find(x => x.geojson && /Polygon/.test(x.geojson.type) && /Laguna/.test(x.display_name));
      geo = hit ? hit.geojson : null;
    } catch {}
  }
  if (geo) { try { localStorage.setItem(BOUNDARY_CACHE, JSON.stringify(geo)); } catch {} }
  return geo;
}

// Nasa loob ba ng polygon ang punto? (ray casting)
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inCalauan(lat, lng) {
  return polys.some(p => inRing(lng, lat, p[0]) && !p.slice(1).some(h => inRing(lng, lat, h)));
}

function writePin(lat, lng) {
  lastOk = L.latLng(lat, lng);
  $("f_lat").value = lat.toFixed(7);
  $("f_lng").value = lng.toFixed(7);
  $("f_pin_hint").textContent = `Pinned: ${lat.toFixed(6)}, ${lng.toFixed(6)}. Drag the pin to adjust.`;
}

function setPin(lat, lng) {
  if (!pin) {
    pin = L.marker([lat, lng], { draggable: true, icon: PIN_ICON }).addTo(map);
    pin.on("dragend", () => {
      const p = pin.getLatLng();
      if (!inCalauan(p.lat, p.lng)) {                 // lumabas sa boundary: ibalik
        pin.setLatLng(lastOk);
        return showMsg(pinMsg, ERRORS.out_of_area, "error", false);
      }
      pinMsg.hidden = true;
      writePin(p.lat, p.lng);
    });
  } else {
    pin.setLatLng([lat, lng]);
  }
  writePin(lat, lng);
}

function clearPin() {
  if (pin) { map.removeLayer(pin); pin = null; }
  lastOk = null;
  $("f_lat").value = "";
  $("f_lng").value = "";
  $("f_pin_hint").textContent = PIN_HINT;
}

function initMap() {
  if (mapReady) return mapReady;
  mapReady = (async () => {
    map = L.map("f_map", { center: [14.1472, 121.3153], zoom: 13, minZoom: 11, maxZoom: 19 });
    layers.street = L.tileLayer(TILES.street, { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);
    layers.sat = L.tileLayer(TILES.sat, { maxZoom: 19, attribution: "Tiles &copy; Esri" });

    let geo = await loadBoundary();
    const approx = !geo;
    if (approx) geo = RECT;
    polys = geo.type === "Polygon" ? [geo.coordinates] : geo.coordinates;

    // Padilimin ang labas ng Calauan (ang loob ay "butas")
    const holes = polys.map(p => p[0].map(([x, y]) => [y, x]));
    L.polygon([[[-85, -180], [-85, 180], [85, 180], [85, -180]], ...holes],
      { stroke: false, fillColor: "#0b2e17", fillOpacity: 0.5, interactive: false }).addTo(map);

    // Guhit ng boundary
    const line = L.geoJSON(geo, { style: { color: "#f5b81c", weight: 3, fill: false }, interactive: false }).addTo(map);
    calauanBounds = line.getBounds();
    map.setMaxBounds(calauanBounds.pad(0.25));

    map.on("click", e => {
      if (!inCalauan(e.latlng.lat, e.latlng.lng)) {
        return showMsg(pinMsg, ERRORS.out_of_area, "error", false);
      }
      pinMsg.hidden = true;
      setPin(e.latlng.lat, e.latlng.lng);
    });

  if (approx) {
    showMsg(pinMsg, "Unable to load the exact boundary of Calauan. Approximate boundary is being used for now.", "error", false);
  }
    $("f_pin_hint").textContent = PIN_HINT;
  })();
  return mapReady;
}

// Street / Satellite
document.querySelectorAll(".map-tools button").forEach(b => {
  b.addEventListener("click", () => {
    if (!map) return;
    Object.entries(layers).forEach(([k, l]) => (k === b.dataset.layer ? l.addTo(map) : map.removeLayer(l)));
    document.querySelectorAll(".map-tools button").forEach(x => x.classList.toggle("active", x === b));
  });
});