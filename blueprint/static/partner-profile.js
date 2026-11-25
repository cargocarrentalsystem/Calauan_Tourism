const $ = id => document.getElementById(id);

const KEY = "partner-profile-msg";   // for this page only
const MAX_MB = 5;
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];

const msg = $("msg"), form = $("profileForm");
const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");

const ERRORS = {
  missing_fields: "Please fill in your name and contact number.",
  too_long: "Name or contact number is too long.",
  invalid_image: "Only PNG, JPG, JPEG, or WEBP images are accepted.",
  image_big: `Image is too large. Maximum size is ${MAX_MB}MB.`,
  not_found: "Account not found.",
  not_logged_in: "Your session has expired. Please log in again.",
  network: "Unable to reach the server. Please try again."
};

// ---------- Sidebar (burger) ----------
function setNav(open) {
  document.body.classList.toggle("nav-open", open);
  burger.setAttribute("aria-expanded", open);
}
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
function showMsg(text, type = "error") {
  msg.hidden = false;
  msg.className = "msg " + type;
  void msg.offsetWidth;                // para umulit ang animation
  msg.textContent = text;
  msg.scrollIntoView({ behavior: "smooth", block: "center" });
  clearTimeout(msg._timer);
  msg._timer = setTimeout(() => (msg.hidden = true), 5000);
}

// Ipakita ang success message na itinabi bago mag-reload
const saved = sessionStorage.getItem(KEY);
if (saved) { showMsg(saved, "ok"); sessionStorage.removeItem(KEY); }

// ---------- Profile photo ----------
const fileInput = $("pfFile"), img = $("pfImg"), initial = $("pfInitial");
const removeBtn = $("pfRemove"), removeFlag = form.elements.remove_image;
let blobUrl = null;

function showPhoto(src) {
  img.src = src;
  img.hidden = false;
  initial.hidden = true;
  removeBtn.hidden = false;
}
function showInitial() {
  img.removeAttribute("src");
  img.hidden = true;
  initial.hidden = false;
  removeBtn.hidden = true;
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (!IMG_TYPES.includes(file.type)) {
    fileInput.value = "";
    return showMsg(ERRORS.invalid_image);
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    fileInput.value = "";
    return showMsg(ERRORS.image_big);
  }
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(file);
  removeFlag.value = "0";
  showPhoto(blobUrl);
});

removeBtn.addEventListener("click", () => {
  fileInput.value = "";
  removeFlag.value = "1";
  showInitial();
});

// ---------- I-save ----------
form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!$("full_name").value.trim() || !$("contact").value.trim()) {
    return showMsg(ERRORS.missing_fields);
  }

  const btn = $("pfSave");
  btn.disabled = true;
  btn.classList.add("loading");

  try {
    const res = await fetch(form.dataset.url, { method: "POST", body: new FormData(form) });
    const data = await res.json();
    if (data.ok) {
      sessionStorage.setItem(KEY, "Profile updated successfully.");
      location.reload();                // para ma-refresh ang pangalan at avatar sa header
      return;
    }
    showMsg(ERRORS[data.error] || ERRORS.network);
    if (data.error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
  } catch {
    showMsg(ERRORS.network);
  }
  btn.disabled = false;
  btn.classList.remove("loading");
});

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  setMenu(false);
  if (mobile.matches) setNav(false);
});