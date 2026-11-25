const byId = id => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const HAS_MAP = typeof L !== "undefined";          // hindi mag-crash kung hindi ma-load ang Leaflet

// ---------- Header: anino kapag nag-scroll ----------
const topbar = byId("topbar");
function onScroll() { topbar.classList.toggle("scrolled", window.scrollY > 8); }
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------- Menu ng header (mobile) ----------
const burger = byId("burger");
const nav = byId("nav");

function setNav(open) {
  nav.classList.toggle("show", open);
  burger.setAttribute("aria-expanded", open);
}

burger.addEventListener("click", e => {
  e.stopPropagation();
  setNav(!nav.classList.contains("show"));
});
document.addEventListener("click", e => {
  if (!nav.contains(e.target)) setNav(false);
});
nav.addEventListener("click", e => {
  if (e.target.closest("a")) setNav(false);
});
window.matchMedia("(min-width: 861px)").addEventListener("change", () => setNav(false));

// ---------- Profile menu (kapag naka-login) ----------
const profileBtn = byId("profileBtn");
const profileMenu = byId("profileMenu");

function setMenu(open) {
  if (!profileMenu) return;
  profileMenu.classList.toggle("show", open);
  profileBtn.setAttribute("aria-expanded", open);
}

if (profileBtn) {
  profileBtn.addEventListener("click", e => {
    e.stopPropagation();
    setMenu(!profileMenu.classList.contains("show"));
  });
  document.addEventListener("click", e => {
    if (!profileMenu.contains(e.target)) setMenu(false);
  });
}

// ---------- Lumalabas na animation habang nag-scroll ----------
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add("in"));
}

// ---------- Stats: bilangan na umaakyat ----------
function countUp(el, to) {
  if (reduceMotion || to <= 0) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 900;
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
document.querySelectorAll("[data-count]").forEach(el => countUp(el, +el.dataset.count));


// ---------- Details modal ng destination (larawan + mapa + direksyon) ----------
const destModal = byId("destModal");
const UPLOADS = destModal.dataset.uploads;
const TILES = {
  street: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  sat: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
};
// Kulay ng pin bawat kategorya (ito rin ang legend at filter chips)
const CAT_COLORS = {
  Falls: "#0ea5e9", Park: "#22c55e", Farm: "#eab308", Historical: "#b45309",
  Resort: "#ec4899", Church: "#6366f1", Other: "#64748b"
};
const catColor = c => CAT_COLORS[c] || CAT_COLORS.Other;
const pinIcon = color => L.divIcon({
  className: "pin-icon", html: `<span style="--c:${color}"></span>`, iconSize: [30, 30], iconAnchor: [15, 36]
});
const meIcon = () => L.divIcon({ className: "me-icon", html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] });

let dmMap = null, dmMarker = null, lastFocus = null;
const dmLayers = {};
let dest = null;                      // {lat, lng} ng binuksang destination
let routeLine = null, meMarker = null;
let dirToken = 0;                     // para ma-cancel ang lumang request kapag nagsara o nag-iba ng modal

function peso(v) {
  const n = Number(v);
  return n > 0
    ? "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " entrance fee"
    : "Free entrance";
}

function setRow(id, text) {
  byId(id + "_li").hidden = !text;
  byId(id).textContent = text || "";
}

function setLayer(key) {
  Object.entries(dmLayers).forEach(([k, l]) => (k === key ? l.addTo(dmMap) : dmMap.removeLayer(l)));
  destModal.querySelectorAll(".map-tools button").forEach(b => b.classList.toggle("active", b.dataset.layer === key));
}

function showMap(lat, lng, color) {
  const ll = [lat, lng];
  dest = { lat, lng };
  if (!dmMap) {
    dmMap = L.map("dm_map", { scrollWheelZoom: false }).setView(ll, 16);
    dmLayers.street = L.tileLayer(TILES.street, { maxZoom: 19, attribution: "&copy; OpenStreetMap" });
    dmLayers.sat = L.tileLayer(TILES.sat, { maxZoom: 19, attribution: "Tiles &copy; Esri" });
    dmMarker = L.marker(ll, { icon: pinIcon(color) }).addTo(dmMap);
  } else {
    dmMarker.setLatLng(ll);
    dmMarker.setIcon(pinIcon(color));
  }
  setLayer("street");
  byId("dm_gmaps").href = `https://www.google.com/maps?q=${lat},${lng}`;
  setTimeout(() => {                                    // pagkatapos ng animation
    dmMap.invalidateSize();
    if (!routeLine) dmMap.setView(ll, 16);
  }, 400);
}

function openDestination(d) {
  lastFocus = document.activeElement;
  byId("dm_name").textContent = d.name;

  const cat = byId("dm_category");
  cat.textContent = d.category || "";
  cat.hidden = !d.category;

  const desc = byId("dm_desc");
  desc.textContent = d.description || "";
  desc.hidden = !d.description;

  setRow("dm_address", d.location);
  setRow("dm_barangay", d.barangay ? `Brgy. ${d.barangay}, Calauan, Laguna` : "");
  setRow("dm_landmark", d.landmark ? `Near ${d.landmark}` : "");
  setRow("dm_hours", d.hours);
  setRow("dm_contact", d.contact);
  byId("dm_fee").textContent = peso(d.fee);

  byId("dm_image_wrap").hidden = !d.image;
  if (d.image) {
    byId("dm_image").src = UPLOADS + d.image;
    byId("dm_image").alt = d.name;
  }

  dirToken++;                 // i-cancel ang anumang nakabinbing direksyon
  clearRoute();               // alisin ang ruta ng dating destination

  destModal.querySelector(".modal-box").scrollTop = 0;
  destModal.classList.add("show");
  document.body.classList.add("modal-open");

  const lat = parseFloat(d.lat), lng = parseFloat(d.lng);
  const hasPin = HAS_MAP && !isNaN(lat) && !isNaN(lng);
  byId("dm_map_wrap").hidden = !hasPin;
  if (hasPin) showMap(lat, lng, catColor(d.category));
  else dest = null;

  setTimeout(() => byId("dm_close").focus(), 300);
}

function closeDestination() {
  if (!destModal.classList.contains("show")) return;
  dirToken++;
  destModal.classList.remove("show");
  document.body.classList.remove("modal-open");
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

// ---------- Get Directions (mula sa kasalukuyang lokasyon ng user) ----------
const dirBtn = byId("dm_dir"), dirClearBtn = byId("dm_dir_clear"), dirMsg = byId("dm_dir_msg");

const GEO_ERR = {
  0: "Your browser doesn't support location.",
  1: "Location access was denied. Allow location for this site in your browser settings, then try again.",
  2: "Unable to determine your current location. Please try again.",
  3: "Timed out while finding your location. Please try again."
};
const TURN = {
  left: "Turn left", right: "Turn right", "slight left": "Slight left", "slight right": "Slight right",
  "sharp left": "Sharp left", "sharp right": "Sharp right",
  straight: "Go straight", uturn: "Make a U-turn"
};

function dirNotice(text) {
  dirMsg.hidden = false;
  dirMsg.className = "dm-msg error";
  dirMsg.textContent = text;
}

function setDirBusy(on, label = "Get Directions") {
  dirBtn.disabled = on;
  dirBtn.querySelector("span").textContent = label;
}

const fmtDist = m => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
function fmtTime(sec) {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} hr ${min % 60} min`;
}

function stepText(s) {
  const m = s.maneuver, road = s.name ? ` onto ${s.name}` : "";
  if (m.type === "arrive") return "You have arrived at your destination";
  if (m.type === "depart") return `Start${road}`;
  if (/roundabout|rotary/.test(m.type)) return `Enter the roundabout${road}`;
  return `${TURN[m.modifier] || "Continue"}${road}`;
}

// Hihingi ng permiso at kukunin ang kasalukuyang lokasyon ng device
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject({ code: 0 });
    navigator.geolocation.getCurrentPosition(resolve, reject,
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

// Ruta ng sasakyan (OSRM, libre). Ang coordinates ay lng,lat
async function fetchRoute(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}` +
              "?overview=full&geometries=geojson&steps=true";
  const data = await (await fetch(url)).json();
  if (data.code !== "Ok" || !data.routes.length) throw new Error("no_route");
  return data.routes[0];
}

function removeDrawn() {
  if (dmMap) {
    if (routeLine) dmMap.removeLayer(routeLine);
    if (meMarker) dmMap.removeLayer(meMarker);
  }
  routeLine = meMarker = null;
}

function clearRoute() {
  removeDrawn();
  dirMsg.hidden = true;
  dirClearBtn.hidden = true;
  byId("dm_dir_sum").hidden = true;
  byId("dm_dir_steps").hidden = true;
  byId("dm_steps").replaceChildren();
  byId("dm_gmaps").textContent = "Open in Google Maps →";
  setDirBusy(false);
}

function drawRoute(from, route) {
  removeDrawn();
  dmMap.invalidateSize();
  routeLine = L.geoJSON(route.geometry, { style: { color: "#2563eb", weight: 5, opacity: 0.85 } }).addTo(dmMap);
  meMarker = L.marker([from.lat, from.lng], { icon: meIcon() }).addTo(dmMap)
    .bindTooltip("You are here", { direction: "top", offset: [0, -8] });
  dmMap.fitBounds(routeLine.getBounds().pad(0.15));

  byId("dm_dist").textContent = fmtDist(route.distance);
  byId("dm_time").textContent = `≈ ${fmtTime(route.duration)} drive`;
  byId("dm_dir_sum").hidden = false;

  const ol = byId("dm_steps");
  ol.replaceChildren();
  route.legs.forEach(leg => leg.steps.forEach(s => {
    const li = document.createElement("li");
    li.textContent = stepText(s);
    if (s.distance > 0) {
      const sm = document.createElement("small");
      sm.textContent = fmtDist(s.distance);
      li.appendChild(sm);
    }
    ol.appendChild(li);
  }));
  byId("dm_dir_steps").hidden = !ol.children.length;
  dirClearBtn.hidden = false;
}

dirBtn.addEventListener("click", async () => {
  if (!dest) return;
  const token = ++dirToken;
  dirMsg.hidden = true;
  setDirBusy(true, "Finding your location...");

  let pos;
  try {
    pos = await getPosition();                          // dito lalabas ang tanong ng browser
  } catch (e) {
    if (token !== dirToken) return;
    setDirBusy(false);
    return dirNotice(GEO_ERR[e && e.code] || GEO_ERR[2]);
  }
  if (token !== dirToken) return;

  const from = { lat: pos.coords.latitude, lng: pos.coords.longitude };

  // Google Maps link na may simula at destinasyon (para sa turn-by-turn sa phone)
  const a = byId("dm_gmaps");
  a.href = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}` +
           `&destination=${dest.lat},${dest.lng}&travelmode=driving`;
  a.textContent = "Open directions in Google Maps →";

  setDirBusy(true, "Getting the route...");
  try {
    const route = await fetchRoute(from, dest);
    if (token !== dirToken) return;
    drawRoute(from, route);
  } catch {
    if (token !== dirToken) return;
    dirNotice("Unable to get a route right now. You can open directions in Google Maps below.");
  }
  setDirBusy(false);
});

dirClearBtn.addEventListener("click", () => {
  dirToken++;
  clearRoute();
  if (dmMap && dest) dmMap.setView([dest.lat, dest.lng], 16);
});

destModal.querySelectorAll(".map-tools button").forEach(b => {
  b.addEventListener("click", () => dmMap && setLayer(b.dataset.layer));
});
byId("dm_close").addEventListener("click", closeDestination);
destModal.addEventListener("click", e => { if (e.target === destModal) closeDestination(); });

// Focus trap sa loob ng modal
destModal.addEventListener("keydown", e => {
  if (e.key !== "Tab" || !destModal.classList.contains("show")) return;
  const items = [...destModal.querySelectorAll("button:not([disabled]), a[href], summary")]
    .filter(el => !el.closest("[hidden]") && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// Esc: isara ang lahat ng bukas
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  setNav(false);
  setMenu(false);
  closeDestination();
});

// ---------- Mga card ----------
const cardsBox = byId("cards");
const cards = [...document.querySelectorAll(".dest")];

cards.forEach(card => {
  card.addEventListener("click", () => openDestination(card.dataset));
  card.addEventListener("keydown", e => {
    if (e.target !== card) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDestination(card.dataset); }
  });
});

// Lumalabas ang mga card nang sunud-sunod habang nag-i-scroll
const cardIO = ("IntersectionObserver" in window && !reduceMotion)
  ? new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.style.setProperty("--d", `${(en.target._i || 0) * 0.07}s`);
          en.target.classList.add("in");
          cardIO.unobserve(en.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -30px 0px" })
  : null;

function revealCards() {
  let i = 0;
  cards.forEach(c => {
    if (c.classList.contains("is-hidden") || c.classList.contains("in")) return;
    c._i = i++ % 6;
    if (cardIO) cardIO.observe(c); else c.classList.add("in");
  });
}
revealCards();


// ---------- Mapa ng lahat ng destinasyon + legend ----------
const mapSection = byId("mapSection");
const pinned = cards.filter(c => !isNaN(parseFloat(c.dataset.lat)) && !isNaN(parseFloat(c.dataset.lng)));
byId("statPins").textContent = HAS_MAP ? pinned.length : 0;

let allMap = null, pinLayer = null, legendBox = null;
const markers = new Map();            // card -> marker

function fitVisible() {
  if (!allMap) return;
  const vis = pinned.filter(c => !c.classList.contains("is-hidden"));
  if (!vis.length) return;
  const b = L.latLngBounds(vis.map(c => [parseFloat(c.dataset.lat), parseFloat(c.dataset.lng)]));
  if (vis.length === 1) allMap.setView(b.getCenter(), 15);
  else allMap.fitBounds(b.pad(0.2));
}

function renderLegend() {
  if (!legendBox) return;
  const counts = {};
  pinned.filter(c => !c.classList.contains("is-hidden")).forEach(c => {
    const cat = CAT_COLORS[c.dataset.category] ? c.dataset.category : "Other";
    counts[cat] = (counts[cat] || 0) + 1;
  });
  legendBox.replaceChildren();
  const title = document.createElement("b");
  title.textContent = "Legend";
  legendBox.appendChild(title);
  Object.keys(CAT_COLORS).filter(c => counts[c]).forEach(c => {
    const row = document.createElement("div");
    row.className = "legend-row";
    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = CAT_COLORS[c];
    const name = document.createElement("span");
    name.textContent = c;
    const n = document.createElement("small");
    n.textContent = counts[c];
    row.append(dot, name, n);
    legendBox.appendChild(row);
  });
}

function syncMarkers() {
  if (!allMap) return;
  pinned.forEach(c => {
    const m = markers.get(c);
    const show = !c.classList.contains("is-hidden");
    if (show && !pinLayer.hasLayer(m)) pinLayer.addLayer(m);
    if (!show && pinLayer.hasLayer(m)) pinLayer.removeLayer(m);
  });
  renderLegend();
  fitVisible();
}

if (!HAS_MAP || !pinned.length) {
  mapSection.hidden = true;                 // walang mapa o walang destination na may pin
} else {
  allMap = L.map("all_map", { scrollWheelZoom: false }).setView([14.1472, 121.3153], 12);
  const allLayers = {
    street: L.tileLayer(TILES.street, { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(allMap),
    sat: L.tileLayer(TILES.sat, { maxZoom: 19, attribution: "Tiles &copy; Esri" })
  };
  pinLayer = L.layerGroup().addTo(allMap);

  // Isang pin bawat destination; pindutin para buksan ang details modal
  pinned.forEach(card => {
    const d = card.dataset;
    const ll = [parseFloat(d.lat), parseFloat(d.lng)];
    const m = L.marker(ll, { icon: pinIcon(catColor(d.category)), title: d.name })
      .bindTooltip(d.name, { direction: "top", offset: [0, -30] })
      .on("click", () => openDestination(d));
    markers.set(card, m);
    pinLayer.addLayer(m);
  });

  const legend = L.control({ position: "bottomright" });
  legend.onAdd = () => {
    legendBox = L.DomUtil.create("div", "legend");
    L.DomEvent.disableClickPropagation(legendBox);
    renderLegend();
    return legendBox;
  };
  legend.addTo(allMap);
  fitVisible();

  // Street / Satellite
  const tools = byId("mapTools");
  tools.querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => {
      Object.entries(allLayers).forEach(([k, l]) => (k === b.dataset.layer ? l.addTo(allMap) : allMap.removeLayer(l)));
      tools.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === b));
    });
  });

  // Mag-refresh ng laki kapag lumabas na sa screen (para sa animation ng reveal)
  setTimeout(() => allMap.invalidateSize(), 500);

  // Paalala kung may destination na wala pang pin
  const missing = cards.length - pinned.length;
  if (missing) {
    const note = byId("mapNote");
    note.hidden = false;
    note.textContent = `${missing} destination${missing > 1 ? "s have" : " has"} no pin on the map yet.`;
  }
}


// ---------- Search, filter at sort ----------
const qInput = byId("q"), feeSel = byId("feeFilter"), sortSel = byId("sortBy");
const chipsBox = byId("chips"), resultLine = byId("resultLine"), noMatch = byId("noMatch");
const state = { q: "", cat: "all", fee: "all", sort: "new" };

// Kulay ng tuldok sa chips
if (chipsBox) {
  chipsBox.querySelectorAll(".fchip[data-cat]").forEach(ch => {
    const dot = ch.querySelector(".fdot");
    if (dot) dot.style.setProperty("--c", catColor(ch.dataset.cat));
  });
}

function haystack(c) {
  const d = c.dataset;
  return `${d.name} ${d.category} ${d.location} ${d.barangay} ${d.landmark} ${d.description}`.toLowerCase();
}

function applyFilters() {
  const q = state.q.trim().toLowerCase();
  let shown = 0;

  cards.forEach(c => {
    const fee = Number(c.dataset.fee) || 0;
    const ok =
      (state.cat === "all" || c.dataset.category === state.cat) &&
      (state.fee === "all" || (state.fee === "free" ? fee <= 0 : fee > 0)) &&
      (!q || haystack(c).includes(q));
    c.classList.toggle("is-hidden", !ok);
    if (ok) shown++;
  });

  // Ayusin ang pagkakasunod-sunod
  const byFee = c => Number(c.dataset.fee) || 0;
  const sorted = [...cards].sort((a, b) => {
    if (state.sort === "name") return a.dataset.name.localeCompare(b.dataset.name);
    if (state.sort === "low") return byFee(a) - byFee(b) || a.dataset.idx - b.dataset.idx;
    if (state.sort === "high") return byFee(b) - byFee(a) || a.dataset.idx - b.dataset.idx;
    return a.dataset.idx - b.dataset.idx;
  });
  sorted.forEach(c => cardsBox.appendChild(c));

  resultLine.innerHTML = "";
  const b = document.createElement("b");
  b.textContent = shown;
  resultLine.append("Showing ", b, ` of ${cards.length} destination${cards.length === 1 ? "" : "s"}`);
  noMatch.hidden = shown > 0;
  cardsBox.hidden = shown === 0;

  revealCards();
  syncMarkers();
}

if (qInput) {
  let t = null;
  qInput.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = qInput.value; applyFilters(); }, 160);
  });
  feeSel.addEventListener("change", () => { state.fee = feeSel.value; applyFilters(); });
  sortSel.addEventListener("change", () => { state.sort = sortSel.value; applyFilters(); });

  chipsBox.addEventListener("click", e => {
    const ch = e.target.closest(".fchip");
    if (!ch) return;
    state.cat = ch.dataset.cat;
    chipsBox.querySelectorAll(".fchip").forEach(x => x.classList.toggle("active", x === ch));
    applyFilters();
  });

  byId("resetFilters").addEventListener("click", () => {
    Object.assign(state, { q: "", cat: "all", fee: "all", sort: "new" });
    qInput.value = ""; feeSel.value = "all"; sortSel.value = "new";
    chipsBox.querySelectorAll(".fchip").forEach(x => x.classList.toggle("active", x.dataset.cat === "all"));
    applyFilters();
  });

  applyFilters();
}

// /destinations?open=<id> -> kusang bubukas ang details modal
const openId = new URLSearchParams(location.search).get("open");
if (openId) {
  const target = cards.find(c => c.dataset.id === openId);
  if (target) openDestination(target.dataset);
  history.replaceState(null, "", location.pathname);
}

// ---------- Footer: taon ----------
const yr = byId("year");
if (yr) yr.textContent = new Date().getFullYear();