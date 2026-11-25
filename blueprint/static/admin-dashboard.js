const $ = id => document.getElementById(id);

const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");
const reduceMotion = window.matchMedia("(prefers-reduced-motion:reduce)").matches;

// ---------- Sidebar (burger) ----------
function setNav(open) {
  document.body.classList.toggle("nav-open", open);
  burger.setAttribute("aria-expanded", open);
}

// Bukas ang sidebar sa desktop, sarado sa tablet at mobile
setNav(!mobile.matches);
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add("ready")));

// Kapag nag-iba ang laki ng screen, i-reset ayon sa bagong laki
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

// Isara kapag nag-click sa labas
document.addEventListener("click", e => {
  if (!profileMenu.contains(e.target)) setMenu(false);
});

// Isara gamit ang Esc
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

// ---------- Animation ng mga bar sa chart ----------
window.addEventListener("load", () => {
  document.querySelectorAll(".bar i").forEach(bar => {
    bar.style.width = bar.dataset.pct + "%";
  });
});

// ---------- Count-up ng mga bilang ----------
document.querySelectorAll("[data-count]").forEach(el => {
  const target = parseInt(el.dataset.count, 10);
  if (isNaN(target) || reduceMotion) return;

  const duration = 900, start = performance.now();
  function step(t) {
    const p = Math.min((t - start) / duration, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  }
  el.textContent = "0";
  requestAnimationFrame(step);
});