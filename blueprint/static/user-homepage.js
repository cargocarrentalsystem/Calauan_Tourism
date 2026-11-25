const byId = id => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

// Isara kapag nag-click sa labas
document.addEventListener("click", e => {
  if (!nav.contains(e.target)) setNav(false);
});

// Isara kapag pumili ng link sa menu
nav.addEventListener("click", e => {
  if (e.target.closest("a")) setNav(false);
});

// Kapag lumaki ang screen, i-reset ang mobile menu
window.matchMedia("(min-width: 861px)").addEventListener("change", () => setNav(false));


// ---------- Carousel (anunsyo, destinasyon, establishment) ----------
function initCarousel(root) {
  const track = root.querySelector(".car-track");
  if (!track) return;
  const slides = [...track.children];
  const dotsBox = root.querySelector(".car-dots");
  const counter = root.querySelector(".car-count");
  const interval = +root.dataset.interval || 6000;
  const n = slides.length;
  let i = 0, timer = null, hover = false, focused = false, startX = null, startY = null;

  if (n < 2) root.classList.add("single");

  const dots = slides.map((_, k) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "car-dot";
    b.setAttribute("aria-label", `Go to slide ${k + 1}`);
    b.addEventListener("click", () => { go(k); play(); });
    dotsBox.appendChild(b);
    return b;
  });

  function go(k) {
    i = (k + n) % n;
    track.style.transform = `translateX(-${i * 100}%)`;
    slides.forEach((s, j) => {
      s.inert = j !== i;                       // hindi ma-tab ang mga nakatagong slide
      s.setAttribute("aria-hidden", j !== i);
      s.classList.toggle("is-active", j === i);
    });
    dots.forEach((d, j) => {
      d.classList.toggle("on", j === i);
      d.setAttribute("aria-current", j === i ? "true" : "false");
    });
    if (counter) counter.textContent = `${i + 1} / ${n}`;
  }

  function stop() { clearInterval(timer); timer = null; }

  // Auto-slide: humihinto kapag naka-hover, may focus, o may bukas na modal
  function play() {
    stop();
    if (n < 2 || reduceMotion || hover || focused || document.hidden) return;
    timer = setInterval(() => {
      if (!document.body.classList.contains("modal-open")) go(i + 1);
    }, interval);
  }

  root.querySelectorAll(".car-btn").forEach(b => {
    b.addEventListener("click", () => { go(i + Number(b.dataset.dir)); play(); });
  });

  root.addEventListener("mouseenter", () => { hover = true; stop(); });
  root.addEventListener("mouseleave", () => { hover = false; play(); });
  root.addEventListener("focusin", () => { focused = true; stop(); });
  root.addEventListener("focusout", () => { focused = false; play(); });
  document.addEventListener("visibilitychange", play);

  // Arrow keys kapag naka-focus ang carousel controls
  root.addEventListener("keydown", e => {
    if (e.target.closest(".car-btn, .car-dot")) {
      if (e.key === "ArrowLeft") { go(i - 1); play(); }
      if (e.key === "ArrowRight") { go(i + 1); play(); }
    }
  });

  // Swipe sa mobile (hindi hahadlang sa vertical scroll)
  root.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  root.addEventListener("touchend", e => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    startX = startY = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      go(i + (dx < 0 ? 1 : -1));
      play();
    }
  });

  go(0);
  play();
}

document.querySelectorAll("[data-carousel]").forEach(initCarousel);


// ---------- Lumalabas na animation habang nag-scroll ----------
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add("in"));
}


// ---------- Details modal ng destination (larawan + mapa) ----------
const destModal = byId("destModal");
const UPLOADS = destModal.dataset.uploads;
const HAS_MAP = typeof L !== "undefined";          // hindi mag-crash kung hindi ma-load ang Leaflet
const TILES = {
  street: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  sat: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
};
const PIN_ICON = HAS_MAP
  ? L.divIcon({ className: "pin-icon", html: "<span></span>", iconSize: [30, 30], iconAnchor: [15, 36] })
  : null;

let dmMap = null, dmMarker = null, lastFocus = null;
const dmLayers = {};

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

function showMap(lat, lng) {
  const ll = [lat, lng];
  if (!dmMap) {
    dmMap = L.map("dm_map", { scrollWheelZoom: false }).setView(ll, 16);
    dmLayers.street = L.tileLayer(TILES.street, { maxZoom: 19, attribution: "&copy; OpenStreetMap" });
    dmLayers.sat = L.tileLayer(TILES.sat, { maxZoom: 19, attribution: "Tiles &copy; Esri" });
    dmMarker = L.marker(ll, { icon: PIN_ICON }).addTo(dmMap);
  } else {
    dmMarker.setLatLng(ll);
  }
  setLayer("street");
  byId("dm_gmaps").href = `https://www.google.com/maps?q=${lat},${lng}`;
  setTimeout(() => { dmMap.invalidateSize(); dmMap.setView(ll, 16); }, 400);   // pagkatapos ng animation
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

  destModal.querySelector(".modal-box").scrollTop = 0;
  destModal.classList.add("show");
  document.body.classList.add("modal-open");

  const lat = parseFloat(d.lat), lng = parseFloat(d.lng);
  const hasPin = HAS_MAP && !isNaN(lat) && !isNaN(lng);
  byId("dm_map_wrap").hidden = !hasPin;
  if (hasPin) showMap(lat, lng);

  setTimeout(() => byId("dm_close").focus(), 300);
}

function closeDestination() {
  if (!destModal.classList.contains("show")) return;
  destModal.classList.remove("show");
  document.body.classList.remove("modal-open");
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

destModal.querySelectorAll(".map-tools button").forEach(b => {
  b.addEventListener("click", () => dmMap && setLayer(b.dataset.layer));
});
byId("dm_close").addEventListener("click", closeDestination);
destModal.addEventListener("click", e => { if (e.target === destModal) closeDestination(); });

// Focus trap sa loob ng modal (Tab / Shift+Tab)
destModal.addEventListener("keydown", e => {
  if (e.key !== "Tab" || !destModal.classList.contains("show")) return;
  const items = [...destModal.querySelectorAll("button, a[href]")].filter(el => !el.closest("[hidden]"));
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// Destination: View -> details modal
document.querySelectorAll(".btn-view").forEach(b => {
  b.addEventListener("click", () => openDestination(b.closest("[data-id]").dataset));
});


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

  // Isara kapag nag-click sa labas
  document.addEventListener("click", e => {
    if (!profileMenu.contains(e.target)) setMenu(false);
  });
}


// ---------- Esc: isara ang lahat ng bukas ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  setNav(false);
  setMenu(false);
  closeDestination();
});


// ---------- Footer: taon ----------
const yr = byId("year");
if (yr) yr.textContent = new Date().getFullYear();