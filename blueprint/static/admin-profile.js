const $ = id => document.getElementById(id);

const KEY = "admin-profile-msg";   // para sa page na ito lang
const msg = $("msg");
const form = $("profileForm");
const btn = $("btnSave");

const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");

const MESSAGES = {
  saved: "Profile updated successfully.",
  name_required: "Please enter your name.",
  current_required: "Please enter your current password to change it.",
  password_short: "The new password must be at least 6 characters.",
  password_mismatch: "The new passwords do not match.",
  wrong_current_password: "Incorrect current password.",
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

// ---------- Ipakita o itago ang password (lahat ng may .eye) ----------
document.querySelectorAll(".eye").forEach(b => {
  b.addEventListener("click", () => {
    const input = $(b.dataset.target);
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    b.querySelector("use").setAttribute("href", reveal ? "#i-eyeoff" : "#i-eye");
  });
});

// ---------- Mensahe ----------
let msgTimer = null;
function showMsg(text, type = "error") {
  msg.hidden = false;
  msg.className = "msg " + type;
  void msg.offsetWidth;                // para umulit ang animation
  msg.textContent = text;
  msg.scrollIntoView({ behavior: "smooth", block: "center" });
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (msg.hidden = true), 5000);
}

// Ipakita ang success message na itinabi bago mag-reload
const saved = sessionStorage.getItem(KEY);
if (saved) { showMsg(saved, "ok"); sessionStorage.removeItem(KEY); }

// ---------- I-save ----------
form.addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("full_name").value.trim();
  const cur = $("current_password").value;
  const np = $("new_password").value;
  const cp = $("confirm_password").value;

  if (!name) { showMsg(MESSAGES.name_required); return $("full_name").focus(); }
  if (np) {
    if (!cur) { showMsg(MESSAGES.current_required); return $("current_password").focus(); }
    if (np.length < 6) { showMsg(MESSAGES.password_short); return $("new_password").focus(); }
    if (np !== cp) { showMsg(MESSAGES.password_mismatch); return $("confirm_password").focus(); }
  }

  btn.disabled = true;
  btn.classList.add("loading");
  try {
    const res = await fetch(location.href, { method: "POST", body: new FormData(form) });
    const data = await res.json();
    if (data.ok) {
      sessionStorage.setItem(KEY, MESSAGES.saved);
      location.reload();
      return;
    }
    showMsg(MESSAGES[data.error] || MESSAGES.network);
    if (data.error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
  } catch {
    showMsg(MESSAGES.network);
  }
  btn.disabled = false;
  btn.classList.remove("loading");
});