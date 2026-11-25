const $ = id => document.getElementById(id);

const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");

const MESSAGES = { none: "No results match your search." };

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
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  setMenu(false);
  if (mobile.matches) setNav(false);
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

// ---------- Live filter ng listahan (sa browser lang, walang reload) ----------
const filter = $("filter");
const rows = document.querySelectorAll("#rows tr:not(.none)");
const noResult = $("noResult");
const count = $("count");

filter.addEventListener("input", () => {
  const text = filter.value.trim().toLowerCase();
  let visible = 0;
  rows.forEach(row => {
    const show = row.textContent.toLowerCase().includes(text);
    row.style.display = show ? "" : "none";
    if (show) visible++;
  });
  count.textContent = visible;
  noResult.textContent = MESSAGES.none;
  noResult.hidden = visible > 0 || rows.length === 0;
});