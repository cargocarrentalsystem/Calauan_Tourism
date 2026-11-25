const $ = id => document.getElementById(id);

const msg = $("formMsg"), form = $("form"), btnSave = $("btnSave");
const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");

// Lahat ng mensahe ng page na ito
// All page messages
const MESSAGES = {
  saved: "Contact information saved successfully.",
  invalid_mobile: "Invalid mobile number. Use numbers only (+, -, spaces, and parentheses are allowed).",
  invalid_landline: "Invalid landline. Use numbers only (+, -, spaces, and parentheses are allowed).",
  invalid_email: "Invalid email address.",
  too_long: "The Facebook or Instagram link is too long.",
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

// ---------- Mensahe ----------
let msgTimer = null;
function show(text, type = "error") {
  msg.hidden = false;
  msg.className = "msg " + type;
  void msg.offsetWidth;                // para umulit ang animation
  msg.textContent = text;
  msg.scrollIntoView({ behavior: "smooth", block: "center" });
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (msg.hidden = true), 5000);
}

// ---------- I-save ----------
form.addEventListener("submit", async e => {
  e.preventDefault();
  msg.hidden = true;

  btnSave.disabled = true;
  btnSave.classList.add("loading");

  let data;
  try {
    const res = await fetch(form.action, { method: "POST", body: new FormData(form) });
    data = await res.json();
  } catch {
    data = { ok: false, error: "network" };
  }

  btnSave.disabled = false;
  btnSave.classList.remove("loading");

  if (data.ok) {
    // Ipakita ang buong link na na-save
    $("f_facebook").value = data.facebook || "";
    $("f_instagram").value = data.instagram || "";
    return show(MESSAGES.saved, "ok");
  }

  show(MESSAGES[data.error] || MESSAGES.network);
  if (data.error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
});

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  setMenu(false);
  if (mobile.matches) setNav(false);
});