const $ = id => document.getElementById(id);

const KEY = "admin-partners-msg";   // for this page only
const msg = $("msg");
const modal = $("modal");

const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");

// All page messages
const DONE = {
  approve: "Partner approved.",
  reject: "Partner rejected.",
  disable: "Partner disabled."
};
const CONFIRM = {
  approve: { title: "Approve this partner?", text: "Tourists will now be able to see this business.", ok: "Approve", danger: false },
  reject:  { title: "Reject this partner?",  text: "This business will not be accepted as a partner.", ok: "Reject", danger: true },
  disable: { title: "Disable this partner?", text: "This partner will no longer be visible and will not be able to log in.", ok: "Disable", danger: true }
};
const ERRORS = {
  invalid_action: "Unknown action.",
  not_logged_in: "Your session has expired. Please log in again.",
  network: "Unable to reach the server. Please try again."
};
const CANCEL = "Cancel";

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

// Ipakita ang success message na itinabi bago mag-reload
const saved = sessionStorage.getItem(KEY);
if (saved) { showMsg(saved, "ok"); sessionStorage.removeItem(KEY); }

// ---------- Modal ng kumpirmasyon ----------
const confirmModal = $("confirmModal"), cmOk = $("cmOk"), cmCancel = $("cmCancel");

function ask(action, name) {
  const c = CONFIRM[action];
  return new Promise(resolve => {
    $("cmTitle").textContent = c.title;
    $("cmText").textContent = `${name}: ${c.text}`;
    cmOk.textContent = c.ok;
    cmCancel.textContent = CANCEL;
    cmOk.classList.toggle("bad", c.danger);
    $("cmIcon").classList.toggle("danger", c.danger);
    $("cmUse").setAttribute("href", action === "approve" ? "#i-check" : action === "reject" ? "#i-x" : "#i-ban");
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

// ---------- Approve / Reject / Disable ----------
document.querySelectorAll(".act").forEach(btn => {
  btn.addEventListener("click", async () => {
    const action = btn.dataset.action;
    if (!(await ask(action, btn.dataset.name))) return;

    const buttons = btn.closest("tr").querySelectorAll("button");
    buttons.forEach(b => (b.disabled = true));
    btn.classList.add("loading");

    try {
      const res = await fetch(btn.dataset.url, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        sessionStorage.setItem(KEY, DONE[action]);
        location.reload();
        return;
      }
      showMsg(ERRORS[data.error] || ERRORS.network);
      if (data.error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
    } catch {
      showMsg(ERRORS.network);
    }
    btn.classList.remove("loading");
    buttons.forEach(b => (b.disabled = false));
  });
});

// ---------- Details ng partner ----------
document.querySelectorAll(".btn-view").forEach(btn => {
  btn.addEventListener("click", () => {
    const d = btn.dataset;
    $("m_business").textContent = d.business;
    $("m_owner").textContent = d.owner;
    $("m_email").textContent = d.email;
    $("m_category").textContent = d.category || "-";
    $("m_address").textContent = d.address || "-";
    $("m_contact").textContent = d.contact || "-";

    const wrap = $("m_qr_wrap");
    if (d.qr) {
      $("m_qr").src = modal.dataset.uploads + d.qr;
      wrap.hidden = false;
    } else {
      wrap.hidden = true;
    }
    modal.classList.add("show");
  });
});

function closeDetails() { modal.classList.remove("show"); }
$("m_close").addEventListener("click", closeDetails);
modal.addEventListener("click", e => { if (e.target === modal) closeDetails(); });

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  closeDetails();
  confirmModal.classList.remove("show");
  setMenu(false);
  if (mobile.matches) setNav(false);
});