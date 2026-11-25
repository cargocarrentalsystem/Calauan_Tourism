const $ = id => document.getElementById(id);

const KEY = "admin-users-msg";   // para sa page na ito lang
const msg = $("msg");

const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");

const MESSAGES = {
  disabled: "User disabled.",
  enabled: "User enabled.",
  deleted: "User deleted.",
  confirm_disable_title: "Disable this user?",
  confirm_disable: "This user will no longer be able to log in. You can re-enable them at any time.",
  confirm_delete_title: "Delete this user?",
  confirm_delete: "This action is permanent and cannot be undone.",
  cancel: "Cancel",
  not_logged_in: "Your session has expired. Please log in again.",
  delete_failed: "Cannot delete this user because they have related records (e.g., bookings). Disable them instead.",
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
function showMsg(text, type = "error") {
  msg.hidden = false;
  msg.className = "msg " + type;
  void msg.offsetWidth;                // para umulit ang animation
  msg.textContent = text;
  msg.scrollIntoView({ behavior: "smooth", block: "center" });
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => (msg.hidden = true), 5000);
}

const saved = sessionStorage.getItem(KEY);
if (saved) { showMsg(saved, "ok"); sessionStorage.removeItem(KEY); }

// ---------- Modal ng kumpirmasyon ----------
const modal = $("confirmModal"), cmOk = $("cmOk"), cmCancel = $("cmCancel");

function ask({ title, text, okText, danger }) {
  return new Promise(resolve => {
    $("cmTitle").textContent = title;
    $("cmText").textContent = text;
    cmOk.textContent = okText;
    cmCancel.textContent = MESSAGES.cancel;
    cmOk.classList.toggle("bad", danger);
    $("cmIcon").classList.toggle("danger", danger);
    $("cmUse").setAttribute("href", danger ? "#i-trash" : "#i-ban");
    modal.classList.add("show");
    setTimeout(() => cmCancel.focus(), 300);

    const done = value => {
      modal.classList.remove("show");
      cmOk.onclick = cmCancel.onclick = modal.onclick = null;
      document.removeEventListener("keydown", onKey);
      resolve(value);
    };
    const onKey = e => { if (e.key === "Escape") done(false); };

    cmOk.onclick = () => done(true);
    cmCancel.onclick = () => done(false);
    modal.onclick = e => { if (e.target === modal) done(false); };
    document.addEventListener("keydown", onKey);
  });
}

// Isara ang sidebar at profile menu gamit ang Esc
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  setMenu(false);
  if (mobile.matches) setNav(false);
});

// ---------- Mga aksyon (toggle at delete) ----------
async function run(btn, successText) {
  const row = btn.closest("tr");
  const buttons = row.querySelectorAll("button");
  buttons.forEach(b => (b.disabled = true));
  btn.classList.add("loading");

  try {
    const res = await fetch(btn.dataset.url, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      sessionStorage.setItem(KEY, successText);
      location.reload();
      return;
    }
    showMsg(MESSAGES[data.error] || MESSAGES.network);
    if (data.error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
  } catch {
    showMsg(MESSAGES.network);
  }
  btn.classList.remove("loading");
  buttons.forEach(b => (b.disabled = false));
}

document.querySelectorAll(".toggle").forEach(btn => {
  btn.addEventListener("click", async () => {
    const wasActive = btn.dataset.state === "active";
    if (wasActive) {
      const yes = await ask({
      title: MESSAGES.confirm_disable_title,
      text: `${btn.dataset.name}: ${MESSAGES.confirm_disable}`,
      okText: "Disable",
      danger: false
    });
      if (!yes) return;
    }
    run(btn, wasActive ? MESSAGES.disabled : MESSAGES.enabled);
  });
});

document.querySelectorAll(".delete").forEach(btn => {
  btn.addEventListener("click", async () => {
    const yes = await ask({
      title: MESSAGES.confirm_delete_title,
      text: `${btn.dataset.name}: ${MESSAGES.confirm_delete}`,
      okText: "Delete",
      danger: true
    });
    if (yes) run(btn, MESSAGES.deleted);
  });
});