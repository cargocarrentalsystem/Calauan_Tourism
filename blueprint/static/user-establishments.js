const byId = id => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const HAS_MAP = typeof L !== "undefined";

// Header scroll
const topbar = byId("topbar");
function onScroll(){ if(topbar) topbar.classList.toggle("scrolled", window.scrollY > 8); }
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// Mobile nav
const burger = byId("burger"), nav = byId("nav");
function setNav(open){
  if (!nav) return;
  nav.classList.toggle("show", open);
  burger?.setAttribute("aria-expanded", open);
}
burger?.addEventListener("click", e => { e.stopPropagation(); setNav(!nav.classList.contains("show")); });
document.addEventListener("click", e => { if (nav && !nav.contains(e.target) && !burger?.contains(e.target)) setNav(false); });
window.matchMedia("(min-width: 761px)").addEventListener("change", () => setNav(false));

// Profile menu
const profileBtn = byId("profileBtn"), profileMenu = byId("profileMenu");
function setMenu(open){
  if (!profileMenu) return;
  profileMenu.classList.toggle("show", open);
  profileBtn.setAttribute("aria-expanded", open);
}
if (profileBtn) {
  profileBtn.addEventListener("click", e => { e.stopPropagation(); setMenu(!profileMenu.classList.contains("show")); });
  document.addEventListener("click", e => { if (!profileMenu.contains(e.target) && !profileBtn.contains(e.target)) setMenu(false); });
}

// Scroll reveal
if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach(el => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
}

// Count-up stats
function countUp(el, to){
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

// Search/filter/sort
const qInput = byId("q"), catSel = byId("catFilter"), sortSel = byId("sortBy");
const resultLine = byId("resultLine"), noMatch = byId("noMatch"), cardsBox = byId("cards");
const cards = [...document.querySelectorAll(".dest")];
const state = { q: "", cat: "all", sort: "name" };

function applyFilters(){
  const q = state.q.trim().toLowerCase();
  let shown = 0;
  cards.forEach(c => {
    const d = c.dataset;
    const ok = (state.cat === "all" || d.category === state.cat)
      && (!q || `${d.name} ${d.category} ${d.address} ${d.description}`.toLowerCase().includes(q));
    c.classList.toggle("is-hidden", !ok);
    if (ok) shown++;
  });
  const sorted = [...cards].sort((a, b) => {
    if (state.sort === "name") return a.dataset.name.localeCompare(b.dataset.name);
    return (a.dataset.id - b.dataset.id) * -1;
  });
  sorted.forEach(c => cardsBox.appendChild(c));
  if (resultLine) {
    resultLine.innerHTML = "";
    const b = document.createElement("b"); b.textContent = shown;
    resultLine.append("Showing ", b, ` of ${cards.length} partner${cards.length === 1 ? "" : "s"}`);
  }
  if (noMatch) noMatch.hidden = shown > 0;
  if (cardsBox) cardsBox.hidden = shown === 0;
}

if (qInput) {
  let t;
  qInput.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { state.q = qInput.value; applyFilters(); }, 160); });
  catSel?.addEventListener("change", () => { state.cat = catSel.value; applyFilters(); });
  sortSel?.addEventListener("change", () => { state.sort = sortSel.value; applyFilters(); });
  byId("resetFilters")?.addEventListener("click", () => {
    state.q = ""; state.cat = "all"; state.sort = "name";
    qInput.value = ""; catSel.value = "all"; sortSel.value = "name";
    applyFilters();
  });
  applyFilters();
}

// ===== MODALS + MAP + BOOKING =====
const estModal = byId("estModal");
const UPLOADS = estModal.dataset.uploads;
const emMain = byId("em_main"), emThumbs = byId("em_thumbs");
let currentCard = null;

const TILES = {
  street: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  sat: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
};
const PIN_ICON = HAS_MAP ? L.divIcon({ className: "pin-icon", html: "<span></span>", iconSize: [28, 28], iconAnchor: [14, 34] }) : null;
const ME_ICON = HAS_MAP ? L.divIcon({ className: "me-icon", html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] }) : null;

let emMap = null, emMarker = null;
const emLayers = {};
let dest = null;
let routeLine = null, meMarker = null;
let dirToken = 0;

function setRow(id, text){ byId(id + "_li").hidden = !text; byId(id).textContent = text || ""; }

function openEst(card){
  currentCard = card;
  const d = card.dataset;
  const imgs = JSON.parse(d.images || "[]");

  byId("em_name").textContent = d.name;
  const cat = byId("em_category"); cat.textContent = d.category; cat.hidden = !d.category;
  const desc = byId("em_desc"); desc.textContent = d.description; desc.hidden = !d.description;
  setRow("em_address", d.address);
  setRow("em_barangay", d.barangay ? `Brgy. ${d.barangay}, Calauan, Laguna` : "");
  setRow("em_landmark", d.landmark ? `Near ${d.landmark}` : "");
  setRow("em_contact", d.contact);
  byId("em_book").href = d.bookUrl;

  emThumbs.replaceChildren();
  byId("em_gallery").hidden = !imgs.length;
  if (imgs.length) {
    emMain.src = UPLOADS + imgs[0];
    emMain.alt = d.name;
    emThumbs.hidden = imgs.length < 2;
    if (imgs.length > 1) {
      imgs.forEach((name, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "em-thumb" + (i === 0 ? " on" : "");
        b.setAttribute("aria-label", `Photo ${i + 1}`);
        const im = document.createElement("img");
        im.src = UPLOADS + name; im.alt = "";
        b.appendChild(im);
        b.addEventListener("click", () => {
          emMain.src = UPLOADS + name;
          emThumbs.querySelectorAll(".em-thumb").forEach(x => x.classList.toggle("on", x === b));
        });
        emThumbs.appendChild(b);
      });
    }
  }

  dirToken++; clearRoute();
  estModal.classList.add("show");
  document.body.classList.add("modal-open");

  const lat = parseFloat(d.lat), lng = parseFloat(d.lng);
  const hasPin = HAS_MAP && !isNaN(lat) && !isNaN(lng);
  byId("em_map_wrap").hidden = !hasPin;
  if (hasPin) showMap(lat, lng); else dest = null;

  estModal.querySelector(".modal-box").scrollTop = 0;
  setTimeout(() => byId("em_close").focus(), 300);
}

function closeEst(){
  dirToken++;
  estModal.classList.remove("show");
  document.body.classList.remove("modal-open");
}

function setLayer(key){
  Object.entries(emLayers).forEach(([k, l]) => (k === key ? l.addTo(emMap) : emMap.removeLayer(l)));
  estModal.querySelectorAll(".map-tools button").forEach(b => b.classList.toggle("active", b.dataset.layer === key));
}

function showMap(lat, lng){
  const ll = [lat, lng];
  dest = { lat, lng };
  if (!emMap) {
    emMap = L.map("em_map", { scrollWheelZoom: false }).setView(ll, 16);
    emLayers.street = L.tileLayer(TILES.street, { maxZoom: 19, attribution: "&copy; OpenStreetMap" });
    emLayers.sat = L.tileLayer(TILES.sat, { maxZoom: 19, attribution: "Tiles &copy; Esri" });
    emMarker = L.marker(ll, { icon: PIN_ICON }).addTo(emMap);
  } else {
    emMarker.setLatLng(ll);
  }
  setLayer("street");
  byId("em_gmaps").href = `https://www.google.com/maps?q=${lat},${lng}`;
  setTimeout(() => { emMap.invalidateSize(); if (!routeLine) emMap.setView(ll, 16); }, 360);
}

estModal.querySelectorAll(".map-tools button").forEach(b => {
  b.addEventListener("click", () => emMap && setLayer(b.dataset.layer));
});

// Directions
const dirBtn = byId("em_dir"), dirClearBtn = byId("em_dir_clear"), dirMsg = byId("em_dir_msg");

const GEO_ERR = {
  0: "Your browser doesn't support location.",
  1: "Location access was denied. Allow location for this site then try again.",
  2: "Unable to determine your current location. Please try again.",
  3: "Timed out while finding your location. Please try again."
};
const TURN = {
  left:"Turn left",right:"Turn right","slight left":"Slight left","slight right":"Slight right",
  "sharp left":"Sharp left","sharp right":"Sharp right",straight:"Go straight",uturn:"Make a U-turn"
};

function dirNotice(text){ dirMsg.hidden = false; dirMsg.textContent = text; }
function setDirBusy(on, label = "Get Directions"){ dirBtn.disabled = on; dirBtn.querySelector("span").textContent = label; }
const fmtDist = m => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
function fmtTime(sec){
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} hr ${min % 60} min`;
}
function stepText(s){
  const m = s.maneuver, road = s.name ? ` onto ${s.name}` : "";
  if (m.type === "arrive") return "You have arrived at your destination";
  if (m.type === "depart") return `Start${road}`;
  if (/roundabout|rotary/.test(m.type)) return `Enter the roundabout${road}`;
  return `${TURN[m.modifier] || "Continue"}${road}`;
}
function getPosition(){
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej({ code: 0 });
    navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}
async function fetchRoute(from, to){
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const data = await (await fetch(url)).json();
  if (data.code !== "Ok" || !data.routes.length) throw new Error("no_route");
  return data.routes[0];
}
function removeDrawn(){
  if (emMap) {
    if (routeLine) emMap.removeLayer(routeLine);
    if (meMarker) emMap.removeLayer(meMarker);
  }
  routeLine = meMarker = null;
}
function clearRoute(){
  removeDrawn();
  dirMsg.hidden = true; dirClearBtn.hidden = true;
  byId("em_dir_sum").hidden = true; byId("em_dir_steps").hidden = true;
  byId("em_steps").replaceChildren();
  byId("em_gmaps").textContent = "Open in Google Maps →";
  setDirBusy(false);
}
function drawRoute(from, route){
  removeDrawn();
  emMap.invalidateSize();
  routeLine = L.geoJSON(route.geometry, { style: { color: "#2563eb", weight: 5, opacity: 0.85 } }).addTo(emMap);
  meMarker = L.marker([from.lat, from.lng], { icon: ME_ICON }).addTo(emMap)
    .bindTooltip("You are here", { direction: "top", offset: [0, -8] });
  emMap.fitBounds(routeLine.getBounds().pad(0.15));
  byId("em_dist").textContent = fmtDist(route.distance);
  byId("em_time").textContent = `≈ ${fmtTime(route.duration)} drive`;
  byId("em_dir_sum").hidden = false;
  const ol = byId("em_steps"); ol.replaceChildren();
  route.legs.forEach(leg => leg.steps.forEach(s => {
    const li = document.createElement("li");
    li.textContent = stepText(s);
    if (s.distance > 0) {
      const sm = document.createElement("small"); sm.textContent = fmtDist(s.distance);
      li.appendChild(sm);
    }
    ol.appendChild(li);
  }));
  byId("em_dir_steps").hidden = !ol.children.length;
  dirClearBtn.hidden = false;
}

dirBtn.addEventListener("click", async () => {
  if (!dest) return;
  const token = ++dirToken;
  dirMsg.hidden = true;
  setDirBusy(true, "Finding your location...");
  let pos;
  try { pos = await getPosition(); }
  catch (e) {
    if (token !== dirToken) return;
    setDirBusy(false);
    return dirNotice(GEO_ERR[e && e.code] || GEO_ERR[2]);
  }
  if (token !== dirToken) return;
  const from = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  const a = byId("em_gmaps");
  a.href = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`;
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
  dirToken++; clearRoute();
  if (emMap && dest) emMap.setView([dest.lat, dest.lng], 16);
});

// Open / close est modal
cards.forEach(card => {
  card.addEventListener("click", e => { if (e.target.closest("a")) return; openEst(card); });
  card.addEventListener("keydown", e => {
    if (e.target !== card) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEst(card); }
  });
});
byId("em_close").addEventListener("click", closeEst);
estModal.addEventListener("click", e => { if (e.target === estModal) closeEst(); });

// ===== BOOKING =====
const LOGGED = document.body.dataset.logged === "1";
const OPEN_H = 6, CLOSE_H = 22, MAX_DAYS = 30;

const bookModal = byId("bookModal"), bkVerModal = byId("bkVerModal"), doneModal = byId("doneModal");
const bookForm = byId("bookForm"), bkVerForm = byId("bkVerForm");

const ERR = {
  select_dates: "Please select your dates on the calendar.",
  select_time: "Please select a start and end time.",
  invalid_guests: "Guests must be between 1 and 100.",
  invalid_date: "Please choose valid dates.",
  past_date: "You can't book a past date.",
  past_time: "That start time has already passed.",
  range_too_long: `You can book up to ${MAX_DAYS} days at a time.`,
  invalid_time: "Please choose a valid time range.",
  slot_taken: "Sorry, that date and time was just booked. Please choose another.",
  not_found: "This establishment is no longer available.",
  email_not_configured: "Email is not set up yet.",
  email_failed: "We couldn't send the code. Please try again.",
  code_invalid: "Enter the 6-digit code.",
  code_expired: "This code has expired. Request a new one.",
  code_wrong: "Incorrect code. Please try again.",
  too_many_attempts: "Too many wrong attempts. Request a new code.",
  no_pending: "No pending booking found. Please book again.",
  resend_wait: "Please wait a moment before requesting another code.",
  booking_failed: "We couldn't save your booking. Please try again.",
  network: "Can't reach the server. Please try again."
};

const msgTimers = new Map();
function say(el, text, type = "error"){
  el.hidden = false;
  el.className = "msg " + type;
  void el.offsetWidth;
  el.textContent = text;
  clearTimeout(msgTimers.get(el));
  msgTimers.set(el, setTimeout(() => (el.hidden = true), 6000));
}
async function post(url, body){
  try {
    const res = await fetch(url, { method: "POST", body });
    return await res.json();
  } catch { return { ok: false, error: "network" }; }
}
function busy(btn, on){ btn.disabled = on; btn.classList.toggle("loading", on); }
function openM(m){ m.classList.add("show"); document.body.classList.add("modal-open"); }
function closeM(m){ m.classList.remove("show"); if (!document.querySelector(".modal.show")) document.body.classList.remove("modal-open"); }

const pad = n => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const toDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dstr = dt => ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
const addDays = (s, n) => { const dt = toDate(s); dt.setDate(dt.getDate() + n); return dstr(dt); };
const todayStr = () => dstr(new Date());
const fmtDate = s => toDate(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtHour = h => `${h % 12 || 12}:00 ${h >= 12 ? "PM" : "AM"}`;
function rangeDays(a, b){
  const out = [];
  for (let d = a; d <= b && out.length <= MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

const bk = { card: null, occ: {}, selStart: null, selEnd: null, picking: false, viewY: 0, viewM: 0, summary: null };

function buildOcc(booked){
  const occ = {};
  booked.forEach(b => {
    for (let d = b.s; d <= b.e; d = addDays(d, 1)) {
      const arr = occ[d] || (occ[d] = new Array(24).fill(false));
      for (let h = b.from; h < b.to; h++) arr[h] = true;
    }
  });
  return occ;
}
function hourBlocked(ds, h){
  const today = todayStr();
  if (ds < today) return true;
  if (ds === today && h <= new Date().getHours()) return true;
  return !!(bk.occ[ds] && bk.occ[ds][h]);
}
function dayOff(ds){
  for (let h = OPEN_H; h < CLOSE_H; h++) if (!hourBlocked(ds, h)) return false;
  return true;
}
function rangeOk(a, b){
  if (b < a) return false;
  const days = rangeDays(a, b);
  return days.length <= MAX_DAYS && !days.some(dayOff);
}
function hoursFree(){
  const days = rangeDays(bk.selStart, bk.selEnd);
  const free = new Array(24).fill(false);
  for (let h = OPEN_H; h < CLOSE_H; h++) free[h] = days.every(d => !hourBlocked(d, h));
  return free;
}
async function loadAvailability(){
  const data = await fetch(bk.card.dataset.bookUrl + "/availability").then(r => r.json()).catch(() => ({ ok: false }));
  if (!data.ok) { bk.occ = {}; say(byId("bkMsg"), ERR.network); return; }
  bk.occ = buildOcc(data.booked);
}

function renderCal(){
  const y = bk.viewY, m = bk.viewM;
  byId("calTitle").textContent = new Date(y, m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const grid = byId("calGrid"); grid.replaceChildren();
  for (let i = 0; i < new Date(y, m, 1).getDay(); i++) grid.appendChild(document.createElement("span"));
  let limit = null;
  if (bk.picking && bk.selStart) {
    limit = addDays(bk.selStart, MAX_DAYS - 1);
    for (let d = addDays(bk.selStart, 1), i = 1; i < MAX_DAYS; d = addDays(d, 1), i++) {
      if (dayOff(d)) { limit = addDays(d, -1); break; }
    }
  }
  const total = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= total; d++) {
    const ds = ymd(y, m, d);
    const b = document.createElement("button");
    b.type = "button"; b.className = "cal-day"; b.textContent = d;
    const off = dayOff(ds);
    if (off) { b.classList.add("off"); b.disabled = true; }
    if (ds === todayStr()) b.classList.add("today");
    if (bk.selStart && (ds === bk.selStart || ds === bk.selEnd)) b.classList.add("sel");
    else if (bk.selStart && ds > bk.selStart && ds < bk.selEnd) b.classList.add("in");
    if (limit && ds > limit && !off) b.classList.add("dim");
    b.addEventListener("click", () => pickDate(ds));
    grid.appendChild(b);
  }
  const now = new Date();
  byId("calPrev").disabled = y === now.getFullYear() && m === now.getMonth();
  byId("calNext").disabled = y * 12 + m >= now.getFullYear() * 12 + now.getMonth() + 12;
}
byId("calPrev").addEventListener("click", () => { bk.viewM--; if (bk.viewM < 0) { bk.viewM = 11; bk.viewY--; } renderCal(); });
byId("calNext").addEventListener("click", () => { bk.viewM++; if (bk.viewM > 11) { bk.viewM = 0; bk.viewY++; } renderCal(); });

function pickDate(ds){
  if (dayOff(ds)) return;
  if (bk.picking && bk.selStart && ds >= bk.selStart && rangeOk(bk.selStart, ds)) {
    bk.selEnd = ds; bk.picking = false;
  } else {
    bk.selStart = bk.selEnd = ds; bk.picking = true;
  }
  renderCal(); syncDates();
}
function syncDates(){
  byId("bk_start").value = bk.selStart ? fmtDate(bk.selStart) : "";
  byId("bk_end").value = bk.selEnd ? fmtDate(bk.selEnd) : "";
  refreshTimes();
}
function refreshTimes(){
  const st = byId("bk_stime"), et = byId("bk_etime");
  const prev = st.value;
  st.replaceChildren(new Option("Select start time", ""));
  et.replaceChildren(new Option("Select end time", ""));
  byId("bk_notime").hidden = true;
  if (!bk.selStart) { st.disabled = et.disabled = true; return; }
  const free = hoursFree();
  let any = false;
  for (let h = OPEN_H; h < CLOSE_H; h++) {
    const o = new Option(fmtHour(h), String(h));
    o.disabled = !free[h]; if (free[h]) any = true;
    st.appendChild(o);
  }
  st.disabled = !any;
  byId("bk_notime").hidden = any;
  if (any && prev && free[+prev]) st.value = prev;
  fillEnd(free);
}
function fillEnd(free){
  const st = byId("bk_stime"), et = byId("bk_etime");
  const prev = et.value;
  et.replaceChildren(new Option("Select end time", ""));
  const s = st.value === "" ? null : +st.value;
  et.disabled = s === null;
  if (s === null) return;
  let open = true;
  for (let e = s + 1; e <= CLOSE_H; e++) {
    if (!free[e - 1]) open = false;
    const o = new Option(fmtHour(e), String(e));
    o.disabled = !open;
    et.appendChild(o);
  }
  const keep = prev && et.querySelector(`option[value="${prev}"]`);
  if (keep && !keep.disabled) et.value = prev;
}
byId("bk_stime").addEventListener("change", () => fillEnd(hoursFree()));

async function openBooking(card){
  if (!LOGGED) { location.href = card.dataset.bookUrl; return; }
  closeEst();
  bk.card = card;
  bk.selStart = bk.selEnd = null;
  bk.picking = false;
  bk.occ = {};
  const now = new Date();
  bk.viewY = now.getFullYear(); bk.viewM = now.getMonth();
  byId("bk_est").textContent = card.dataset.name;
  byId("bk_guests").value = 1;
  byId("bkMsg").hidden = true;
  renderCal(); syncDates();
  openM(bookModal);
  await loadAvailability();
  renderCal(); syncDates();
}

document.addEventListener("click", e => {
  const a = e.target.closest("a.book-link");
  if (!a || !LOGGED) return;
  e.preventDefault();
  openBooking(a.id === "em_book" ? currentCard : a.closest(".dest"));
});
byId("bk_close").addEventListener("click", () => closeM(bookModal));
bookModal.addEventListener("click", e => { if (e.target === bookModal) closeM(bookModal); });

bookForm.addEventListener("submit", async e => {
  e.preventDefault();
  const box = byId("bkMsg");
  if (!bk.selStart) return say(box, ERR.select_dates);
  const st = byId("bk_stime").value, et = byId("bk_etime").value;
  if (!st || !et) return say(box, ERR.select_time);
  const guests = parseInt(byId("bk_guests").value, 10);
  if (!(guests >= 1 && guests <= 100)) return say(box, ERR.invalid_guests);
  const fd = new FormData();
  fd.set("start_date", bk.selStart);
  fd.set("end_date", bk.selEnd);
  fd.set("start_time", pad(st) + ":00");
  fd.set("end_time", pad(et) + ":00");
  fd.set("guests", guests);
  const btn = byId("bkOk"); busy(btn, true);
  const data = await post(bk.card.dataset.bookUrl + "/submit", fd);
  busy(btn, false);
  if (!data.ok) {
    if (data.error === "not_logged_in") { location.href = bk.card.dataset.bookUrl; return; }
    say(box, ERR[data.error] || ERR.network);
    if (data.error === "slot_taken") {
      await loadAvailability();
      bk.selStart = bk.selEnd = null; bk.picking = false;
      renderCal(); syncDates();
    }
    return;
  }
  bk.summary = { place: bk.card.dataset.name, start: bk.selStart, end: bk.selEnd, sh: +st, eh: +et, guests };
  byId("bkv_email").textContent = data.email;
  byId("bkv_code").value = ""; byId("bkVerMsg").hidden = true;
  closeM(bookModal); openM(bkVerModal);
  startCooldown(30);
  setTimeout(() => byId("bkv_code").focus(), 300);
});

byId("bkv_code").addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, ""); });

bkVerForm.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(); fd.set("code", byId("bkv_code").value.trim());
  const btn = byId("bkvOk"); busy(btn, true);
  const data = await post(bkVerModal.dataset.verifyUrl, fd);
  busy(btn, false);
  if (!data.ok) {
    if (data.error === "not_logged_in") { location.href = bk.card.dataset.bookUrl; return; }
    if (data.error === "slot_taken") {
      clearInterval(bkTimer); closeM(bkVerModal); openM(bookModal);
      say(byId("bkMsg"), ERR.slot_taken);
      await loadAvailability();
      bk.selStart = bk.selEnd = null; bk.picking = false;
      renderCal(); syncDates();
      return;
    }
    return say(byId("bkVerMsg"), ERR[data.error] || ERR.network);
  }
  clearInterval(bkTimer); closeM(bkVerModal); showDone(data.code);
});

let bkTimer;
function startCooldown(sec){
  const b = byId("bkResend");
  clearInterval(bkTimer);
  b.disabled = true;
  let left = sec;
  const tick = () => {
    if (left <= 0) { clearInterval(bkTimer); b.disabled = false; b.textContent = "Resend code"; return; }
    b.textContent = `Resend code (${left}s)`; left--;
  };
  tick(); bkTimer = setInterval(tick, 1000);
}
byId("bkResend").addEventListener("click", async () => {
  const data = await post(bkVerModal.dataset.resendUrl, new FormData());
  if (data.ok) { say(byId("bkVerMsg"), "A new code has been sent.", "ok"); startCooldown(30); }
  else say(byId("bkVerMsg"), ERR[data.error] || ERR.network);
});
byId("bkvCancel").addEventListener("click", () => { clearInterval(bkTimer); closeM(bkVerModal); });

function showDone(code){
  const s = bk.summary;
  const oneDay = s.start === s.end;
  const rows = [
    ["Booking ID", code], ["Place", s.place],
    ["Dates", oneDay ? fmtDate(s.start) : `${fmtDate(s.start)} – ${fmtDate(s.end)}`],
    ["Time", `${fmtHour(s.sh)} – ${fmtHour(s.eh)}${oneDay ? "" : " (each day)"}`],
    ["Guests", String(s.guests)], ["Status", "Pending"], ["Payment", "Unpaid"]
  ];
  const dl = byId("doneSum"); dl.replaceChildren();
  rows.forEach(([k, v]) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt"); const dd = document.createElement("dd");
    dt.textContent = k; dd.textContent = v;
    row.append(dt, dd); dl.appendChild(row);
  });
  openM(doneModal);
}
byId("doneOk").addEventListener("click", () => closeM(doneModal));
doneModal.addEventListener("click", e => { if (e.target === doneModal) closeM(doneModal); });

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  closeEst();
  [bookModal, bkVerModal, doneModal].forEach(closeM);
  setMenu(false);
  setNav(false);
});

// Open from URL: /establishments?open=<id> o ?book=<id>
const qs = new URLSearchParams(location.search);
const qOpen = qs.get("open"), qBook = qs.get("book");
if (qOpen || qBook) {
  const target = cards.find(c => c.dataset.id === (qBook || qOpen));
  if (target) (qBook && LOGGED) ? openBooking(target) : openEst(target);
  history.replaceState(null, "", location.pathname);
}