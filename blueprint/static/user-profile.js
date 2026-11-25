const byId = id => document.getElementById(id);

// ---------- Header: anino kapag nag-scroll ----------
const topbar = byId("topbar");
function onScroll() { topbar.classList.toggle("scrolled", window.scrollY > 8); }
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

// ---------- Header menu (mobile) ----------
const burger = byId("burger"), nav = byId("nav");
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

// ---------- Profile menu ----------
const profileBtn = byId("profileBtn"), profileMenu = byId("profileMenu");
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

// ---------- Helpers ----------
const page = byId("main");
const UPLOADS = page.dataset.uploads;
const MAX_MB = 5;
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
let curImage = page.dataset.image || "";
let curName = page.dataset.name || "";

const ERRORS = {
  missing_fields: "Please fill in all fields.",
  too_long: "One of the fields is too long.",
  invalid_contact: "Invalid contact number.",
  invalid_gender: "Please select a gender.",
  wrong_password: "Your current password is incorrect.",
  password_short: "New password must be at least 6 characters.",
  password_mismatch: "New passwords do not match.",
  same_password: "Your new password must be different from the current one.",
  photo_required: "Please choose an image.",
  invalid_image: "The photo must be a PNG, JPG, JPEG, or WEBP image.",
  image_big: `The photo must be ${MAX_MB}MB or smaller.`,
  not_logged_in: "Your session expired. Please log in again.",
  network: "Can't reach the server. Please try again."
};

const timers = new Map();
function say(box, text, type = "error") {
  box.hidden = false;
  box.className = "msg " + type;
  void box.offsetWidth;                // restart animation
  box.textContent = text;
  clearTimeout(timers.get(box));
  timers.set(box, setTimeout(() => (box.hidden = true), 6000));
}

function fail(box, code) {
  say(box, ERRORS[code] || ERRORS.network);
  if (code === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
}

async function post(url, body) {
  try {
    const res = await fetch(url, { method: "POST", body });
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

function busy(btn, on) {
  btn.disabled = on;
  btn.classList.toggle("loading", on);
}

// Larawan o unang letra (sa profile card at sa header)
function renderAvatar(box) {
  box.replaceChildren();
  if (curImage) {
    const img = document.createElement("img");
    img.src = UPLOADS + curImage;
    img.alt = box.id === "av_box" ? "Profile photo" : "";
    box.appendChild(img);
  } else {
    box.textContent = (curName.trim().charAt(0) || "U").toUpperCase();
  }
}

function refreshAvatars() {
  renderAvatar(byId("av_box"));
  document.querySelectorAll(".topbar .avatar").forEach(renderAvatar);
  byId("av_remove").hidden = !curImage;
}

function refreshName() {
  byId("pf_title").textContent = curName;
  document.querySelectorAll(".topbar .pname").forEach(n => (n.textContent = curName));
  document.querySelectorAll(".topbar .menu-head b").forEach(n => (n.textContent = curName));
  refreshAvatars();
}

// ---------- Personal details ----------
const pfForm = byId("pfForm");
pfForm.addEventListener("submit", async e => {
  e.preventDefault();
  const box = byId("pfMsg"), btn = byId("pfOk");

  busy(btn, true);
  const data = await post(pfForm.dataset.url, new FormData(pfForm));
  busy(btn, false);

  if (!data.ok) return fail(box, data.error);

  curName = data.name;
  refreshName();
  say(box, "Your details have been saved.", "ok");
});

// ---------- Change password ----------
const pwForm = byId("pwForm");
pwForm.addEventListener("submit", async e => {
  e.preventDefault();
  const box = byId("pwMsg"), btn = byId("pwOk");
  const cur = byId("pw_current").value;
  const nw = byId("pw_new").value;
  const cf = byId("pw_confirm").value;

  if (!cur || !nw || !cf) return say(box, ERRORS.missing_fields);
  if (nw.length < 6) return say(box, ERRORS.password_short);
  if (nw !== cf) return say(box, ERRORS.password_mismatch);

  busy(btn, true);
  const data = await post(pwForm.dataset.url, new FormData(pwForm));
  busy(btn, false);

  if (!data.ok) return fail(box, data.error);

  pwForm.reset();
  say(box, "Your password has been updated.", "ok");
});

// ---------- Profile photo ----------
const side = document.querySelector(".pf-side");
const avFile = byId("av_file");
const avMsg = byId("avMsg");

avFile.addEventListener("change", async () => {
  const file = avFile.files[0];
  if (!file) return;

  if (!IMG_TYPES.includes(file.type)) {
    avFile.value = "";
    return say(avMsg, ERRORS.invalid_image);
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    avFile.value = "";
    return say(avMsg, ERRORS.image_big);
  }

  const pick = byId("av_pick");
  pick.classList.add("is-busy");

  const fd = new FormData();
  fd.set("photo", file);
  const data = await post(side.dataset.photoUrl, fd);

  pick.classList.remove("is-busy");
  avFile.value = "";

  if (!data.ok) return fail(avMsg, data.error);

  curImage = data.image;
  refreshAvatars();
  say(avMsg, "Profile photo updated.", "ok");
});

byId("av_remove").addEventListener("click", async () => {
  if (!confirm("Remove your profile photo?")) return;

  const btn = byId("av_remove");
  btn.disabled = true;
  const data = await post(side.dataset.removeUrl, new FormData());
  btn.disabled = false;

  if (!data.ok) return fail(avMsg, data.error);

  curImage = "";
  refreshAvatars();
  say(avMsg, "Profile photo removed.", "ok");
});

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  setMenu(false);
  setNav(false);
});