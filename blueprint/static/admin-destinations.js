const $ = id => document.getElementById(id);

const KEY = "admin-destinations-msg";   // para sa page na ito lang
const msg = $("msg"), formMsg = $("formMsg");
const modal = $("modal"), form = $("form");
const title = $("modalTitle"), btnSave = $("btnSave");
const preview = $("preview"), fileInput = $("f_image");

const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");

// All page messages
const MESSAGES = {
  added: "Destination added successfully.",
  edited: "Destination updated successfully.",
  toggled: "Destination visibility updated.",
  deleted: "Destination deleted.",
  confirm_delete: "This action cannot be undone.",
  name_required: "Please enter the destination name.",
  fee_invalid: "Entrance fee must be a number of 0 or higher.",
  invalid_fee: "Entrance fee must be a number of 0 or higher.",
  image_type: "Only JPG, PNG, or WEBP images are accepted.",
  invalid_image: "Only JPG, PNG, or WEBP images are accepted.",
  image_big: "Image is too large. Maximum size is 5MB.",
  barangay_required: "Please select a barangay.",
  invalid_barangay: "Please select a barangay from the list.",
  pin_required: "Please pin the destination's location on the map.",
  out_of_area: "You can only pin locations within Calauan, Laguna.",
  not_logged_in: "Your session has expired. Please log in again.",
  network: "Unable to reach the server. Please try again."
};

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

// ---------- Mga mensahe ----------
function show(el, text, type = "error") {
  el.hidden = false;
  el.className = "msg " + type;
  void el.offsetWidth;                 // para umulit ang animation
  el.textContent = text;
}

let msgTimer = null;
function showMsg(text, type = "error") {
  show(msg, text, type);
  msg.scrollIntoView({ behavior: "smooth", block: "center" });
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (msg.hidden = true), 5000);
}

const saved = sessionStorage.getItem(KEY);
if (saved) { showMsg(saved, "ok"); sessionStorage.removeItem(KEY); }

function reloadWith(text) {
  sessionStorage.setItem(KEY, text);
  location.reload();
}

async function post(url, body) {
  try {
    const res = await fetch(url, { method: "POST", body });
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

function handleLogout(error) {
  if (error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
}

// ---------- Modal ng form ----------
function showPreview(src) {
  preview.hidden = !src;
  if (src) preview.src = src;
}

function openModal(titleText, d) {
  title.textContent = titleText;
  formMsg.hidden = true;
  pinMsg.hidden = true;
  $("f_lat").value = d ? (d.lat || "") : "";
  $("f_lng").value = d ? (d.lng || "") : "";
  modal.classList.add("show");

  // Mapa
  initMap().then(() => {
    map.invalidateSize();
    const lat = parseFloat(d ? d.lat : ""), lng = parseFloat(d ? d.lng : "");
    if (!isNaN(lat) && !isNaN(lng)) {
      map.setView([lat, lng], 17);
      setPin(lat, lng);
    } else {
      clearPin();
      map.fitBounds(calauanBounds);
    }
    setTimeout(() => map.invalidateSize(), 350);   // pagkatapos ng animation ng modal
  });

  setTimeout(() => $("f_name").focus(), 350);
}

function closeModal() { modal.classList.remove("show"); }

$("btnAdd").addEventListener("click", () => {
  form.reset();
  $("f_id").value = "";
  showPreview("");
  openModal("Add Destination");
});

document.querySelectorAll(".btn-edit").forEach(btn => {
  btn.addEventListener("click", () => {
    const d = btn.dataset;
    form.reset();
    $("f_id").value = d.id;
    $("f_name").value = d.name;
    $("f_category").value = d.category;
    $("f_barangay").value = d.barangay || "";
    $("f_landmark").value = d.landmark || "";
    $("f_location").value = d.location;
    $("f_description").value = d.description;
    $("f_fee").value = d.fee;
    $("f_hours").value = d.hours;
    $("f_contact").value = d.contact;
    $("f_status").value = d.status;
    showPreview(d.image);
    openModal("Edit Destination", d);
  });
});

// Preview ng napiling larawan
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file && /^image\//.test(file.type)) showPreview(URL.createObjectURL(file));
  else if (!file) showPreview("");
});

$("btnCancel").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

// ---------- I-save ----------
form.addEventListener("submit", async e => {
  e.preventDefault();
  formMsg.hidden = true;

  // Validation sa browser
  const name = $("f_name").value.trim();
  const fee = parseFloat($("f_fee").value || "0");
  const file = fileInput.files[0];

  if (!name) { show(formMsg, MESSAGES.name_required); return $("f_name").focus(); }
  if (isNaN(fee) || fee < 0) { show(formMsg, MESSAGES.fee_invalid); return $("f_fee").focus(); }
  if (!$("f_barangay").value) { show(formMsg, MESSAGES.barangay_required); return $("f_barangay").focus(); }
  if (!$("f_lat").value || !$("f_lng").value) return pinNotice(MESSAGES.pin_required);
  if (file) {
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return show(formMsg, MESSAGES.image_type);
    if (file.size > 5 * 1024 * 1024) return show(formMsg, MESSAGES.image_big);
  }

  btnSave.disabled = true;
  btnSave.classList.add("loading");
  const data = await post(form.action, new FormData(form));
  if (data.ok) {
    reloadWith(data.mode === "edit" ? MESSAGES.edited : MESSAGES.added);
  } else {
    show(formMsg, MESSAGES[data.error] || MESSAGES.network);
    handleLogout(data.error);
    btnSave.disabled = false;
    btnSave.classList.remove("loading");
  }
});

// ---------- Itago / Ipakita ----------
document.querySelectorAll(".btn-toggle").forEach(btn => {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.classList.add("loading");
    const data = await post(btn.dataset.url);
    if (data.ok) reloadWith(MESSAGES.toggled);
    else {
      showMsg(MESSAGES[data.error] || MESSAGES.network);
      handleLogout(data.error);
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  });
});

// ---------- Modal ng kumpirmasyon (burahin) ----------
const confirmModal = $("confirmModal"), cmOk = $("cmOk"), cmCancel = $("cmCancel");

function askDelete(name) {
  return new Promise(resolve => {
    $("cmText").textContent = `${name}: ${MESSAGES.confirm_delete}`;
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

document.querySelectorAll(".btn-delete").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!(await askDelete(btn.dataset.name))) return;
    btn.disabled = true;
    btn.classList.add("loading");
    const data = await post(btn.dataset.url);
    if (data.ok) reloadWith(MESSAGES.deleted);
    else {
      showMsg(MESSAGES[data.error] || MESSAGES.network);
      handleLogout(data.error);
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  });
});

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  closeModal();
  confirmModal.classList.remove("show");
  setMenu(false);
  if (mobile.matches) setNav(false);
});


// ---------- Mapa (Calauan, Laguna) ----------
const BOUNDARY_URL = modal.dataset.boundary;          // static/calauan.geojson (opsyonal)
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
let map = null, mapReady = null, pin = null, lastOk = null, pinTimer = null;
let polys = [];                                       // mga polygon ng Calauan: [[ring, ring...], ...]
let calauanBounds = L.latLngBounds([14.07, 121.26], [14.23, 121.42]);
const layers = {};

function pinNotice(text) {
  show(pinMsg, text);
  pinMsg.scrollIntoView({ behavior: "smooth", block: "nearest" });
  clearTimeout(pinTimer);
  pinTimer = setTimeout(() => (pinMsg.hidden = true), 5000);
}

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
        return pinNotice(MESSAGES.out_of_area);
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
      { stroke: false, fillColor: "#2e1065", fillOpacity: 0.5, interactive: false }).addTo(map);

    // Guhit ng boundary
    const line = L.geoJSON(geo, { style: { color: "#fbbf24", weight: 3, fill: false }, interactive: false }).addTo(map);
    calauanBounds = line.getBounds();
    map.setMaxBounds(calauanBounds.pad(0.25));

    map.on("click", e => {
      if (!inCalauan(e.latlng.lat, e.latlng.lng)) return pinNotice(MESSAGES.out_of_area);
      pinMsg.hidden = true;
      setPin(e.latlng.lat, e.latlng.lng);
    });

  if (approx) pinNotice("Unable to load the exact boundary of Calauan. Approximate boundary is being used for now.");
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