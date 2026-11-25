const $ = id => document.getElementById(id);

const KEY = "admin-announcements-msg";   // para sa page na ito lang
const msg = $("msg"), formMsg = $("formMsg");
const modal = $("modal"), form = $("form");
const title = $("modalTitle"), btnSave = $("btnSave");
const preview = $("preview"), fileInput = $("f_image");

const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");

// Lahat ng mensahe ng page na ito
// All page messages
const MESSAGES = {
  added: "Announcement posted successfully.",
  edited: "Announcement updated successfully.",
  deleted: "Announcement deleted.",
  confirm_delete: "This action cannot be undone.",
  title_required: "Please enter an announcement title.",
  image_type: "Only JPG, PNG, or WEBP images are accepted.",
  invalid_image: "Only JPG, PNG, or WEBP images are accepted.",
  image_big: "Image is too large. Maximum size is 5MB.",
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

// ---------- Mga mensahe ----------
function show(el, text, type = "error") {
  el.hidden = false;
  el.className = "msg " + type;
  void el.offsetWidth;                 // para umulit ang animation
  el.textContent = text;
}

let msgTimer = null;
function showMsg(text, type = "error") {
  show(msg, text, type);
  msg.scrollIntoView({ behavior: "smooth", block: "center" });
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (msg.hidden = true), 5000);
}

const saved = sessionStorage.getItem(KEY);
if (saved) { showMsg(saved, "ok"); sessionStorage.removeItem(KEY); }

function reloadWith(text) {
  sessionStorage.setItem(KEY, text);
  location.reload();
}

async function post(url, body) {
  try {
    const res = await fetch(url, { method: "POST", body });
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

function handleLogout(error) {
  if (error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
}

// ---------- Modal ng form ----------
function showPreview(src) {
  preview.hidden = !src;
  if (src) preview.src = src;
}

function openModal(titleText) {
  title.textContent = titleText;
  formMsg.hidden = true;
  modal.classList.add("show");
  setTimeout(() => $("f_title").focus(), 350);
}

function closeModal() { modal.classList.remove("show"); }

$("btnAdd").addEventListener("click", () => {
  form.reset();
  $("f_id").value = "";
  showPreview("");
  openModal("Bagong Announcement");
});

document.querySelectorAll(".btn-edit").forEach(btn => {
  btn.addEventListener("click", () => {
    const d = btn.dataset;
    form.reset();
    $("f_id").value = d.id;
    $("f_title").value = d.title;
    $("f_body").value = d.body;
    $("f_status").value = d.status;
    showPreview(d.image);
    openModal("I-edit ang Announcement");
  });
});

// Preview ng napiling larawan
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file && /^image\//.test(file.type)) showPreview(URL.createObjectURL(file));
  else if (!file) showPreview("");
});

$("btnCancel").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });

// ---------- I-save ----------
form.addEventListener("submit", async e => {
  e.preventDefault();
  formMsg.hidden = true;

  const t = $("f_title").value.trim();
  const file = fileInput.files[0];

  if (!t) { show(formMsg, MESSAGES.title_required); return $("f_title").focus(); }
  if (file) {
    if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return show(formMsg, MESSAGES.image_type);
    if (file.size > 5 * 1024 * 1024) return show(formMsg, MESSAGES.image_big);
  }

  btnSave.disabled = true;
  btnSave.classList.add("loading");
  const data = await post(form.action, new FormData(form));
  if (data.ok) {
    reloadWith(data.mode === "edit" ? MESSAGES.edited : MESSAGES.added);
  } else {
    show(formMsg, MESSAGES[data.error] || MESSAGES.network);
    handleLogout(data.error);
    btnSave.disabled = false;
    btnSave.classList.remove("loading");
  }
});

// ---------- Modal ng kumpirmasyon (burahin) ----------
const confirmModal = $("confirmModal"), cmOk = $("cmOk"), cmCancel = $("cmCancel");

function askDelete(name) {
  return new Promise(resolve => {
    $("cmText").textContent = `${name}: ${MESSAGES.confirm_delete}`;
    confirmModal.classList.add("show");
    setTimeout(() => cmCancel.focus(), 300);

    const done = value => {
      confirmModal.classList.remove("show");
      cmOk.onclick = cmCancel.onclick = confirmModal.onclick = null;
      resolve(value);
    };
    cmOk.onclick = () => done(true);
    cmCancel.onclick = () => done(false);
    confirmModal.onclick = e => { if (e.target === confirmModal) done(false); };
  });
}

document.querySelectorAll(".btn-delete").forEach(btn => {
  btn.addEventListener("click", async () => {
    if (!(await askDelete(btn.dataset.name))) return;
    btn.disabled = true;
    btn.classList.add("loading");
    const data = await post(btn.dataset.url);
    if (data.ok) reloadWith(MESSAGES.deleted);
    else {
      showMsg(MESSAGES[data.error] || MESSAGES.network);
      handleLogout(data.error);
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  });
});

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  closeModal();
  confirmModal.classList.remove("show");
  setMenu(false);
  if (mobile.matches) setNav(false);
});