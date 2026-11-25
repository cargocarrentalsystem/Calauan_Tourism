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

// Esc: isara ang bukas na menu
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { setNav(false); setMenu(false); }
});

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
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add("in"));
}

// ---------- Kopyahin ang numero / email ----------
document.querySelectorAll(".btn-copy").forEach(btn => {
  btn.addEventListener("click", async () => {
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = document.createElement("textarea");        // para sa lumang browser o HTTP
      t.value = text;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    const old = btn.dataset.label || btn.textContent;
    btn.dataset.label = old;
    btn.textContent = "Copied!";
    btn.classList.add("done");
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = old; btn.classList.remove("done"); }, 1500);
  });
});

// ---------- Footer: taon ----------
const yr = byId("year");
if (yr) yr.textContent = new Date().getFullYear();