const $ = id => document.getElementById(id);


// ---------- Header: anino kapag nag-scroll ----------
const topbar = $("topbar");
function onScroll() { topbar.classList.toggle("scrolled", window.scrollY > 8); }
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();


// ---------- Menu ng header (mobile) ----------
const burger = $("burger"), nav = $("nav");
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

// ---------- Messages ----------
const DONE = "Your account has been verified. You can now log in.";
const RESENT = "A new code has been sent.";
const ERRORS = {
  missing_fields: "Please fill in all fields.",
  invalid_email: "Invalid email.",
  invalid_contact: "Invalid contact number.",
  invalid_gender: "Please select a gender.",
  password_short: "Password must be at least 6 characters.",
  password_mismatch: "Passwords do not match.",
  email_taken: "An account with this email already exists.",
  email_not_configured: "System email is not set up yet.",
  email_failed: "Unable to send the code. Please try again.",
  code_invalid: "Enter the 6-digit code.",
  code_expired: "The code has expired. Request a new one.",
  code_wrong: "Incorrect code. Please try again.",
  too_many_attempts: "Too many incorrect attempts. Request a new code.",
  no_pending: "No pending registration found. Please register again.",
  resend_wait: "Please wait a moment before requesting another code.",
  invalid_credentials: "Incorrect email or password.",
  account_disabled: "This account is disabled.",
  network: "Unable to reach the server. Please try again."
};

const timers = new Map();
function showMsg(el, text, type = "error") {
  el.hidden = false;
  el.className = "msg " + type;
  void el.offsetWidth;                 // para umulit ang animation
  el.textContent = text;
  clearTimeout(timers.get(el));
  timers.set(el, setTimeout(() => (el.hidden = true), 6000));
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

// ---------- Mga modal ----------
const regModal = $("regModal"), verModal = $("verModal");
function openModal(m) {
  m.classList.add("show");
  document.body.classList.add("modal-open");
}
function closeModal(m) {
  m.classList.remove("show");
  if (!document.querySelector(".modal.show")) document.body.classList.remove("modal-open");
}

// ---------- Login ----------
const loginForm = $("loginForm");
loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(loginForm);
  fd.set("next", loginForm.dataset.next);

  const btn = $("loginBtn");
  busy(btn, true);
  const data = await post(loginForm.dataset.url, fd);
  if (data.ok) {
    location.href = data.redirect;     // babalik sa establishment na pinili
    return;
  }
  showMsg($("msg"), ERRORS[data.error] || ERRORS.network);
  busy(btn, false);
});

// ---------- Registration ----------
let pendingEmail = "";

$("openReg").addEventListener("click", () => {
  $("regForm").reset();
  $("rMsg").hidden = true;
  openModal(regModal);
  setTimeout(() => $("r_name").focus(), 300);
});
$("rCancel").addEventListener("click", () => closeModal(regModal));
regModal.addEventListener("click", e => { if (e.target === regModal) closeModal(regModal); });

const regForm = $("regForm");
regForm.addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("rOk");
  busy(btn, true);
  const data = await post(regForm.dataset.url, new FormData(regForm));
  busy(btn, false);

  if (!data.ok) return showMsg($("rMsg"), ERRORS[data.error] || ERRORS.network);

  pendingEmail = $("r_email").value.trim();
  $("v_email").textContent = pendingEmail;
  $("v_code").value = "";
  $("vMsg").hidden = true;
  closeModal(regModal);
  openModal(verModal);
  startCooldown(30);
  setTimeout(() => $("v_code").focus(), 300);
});

// ---------- Verification code ----------
const verForm = $("verForm");
$("v_code").addEventListener("input", e => {
  e.target.value = e.target.value.replace(/\D/g, "");   // numero lang
});

verForm.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData();
  fd.set("email", pendingEmail);
  fd.set("code", $("v_code").value.trim());

  const btn = $("vOk");
  busy(btn, true);
  const data = await post(verForm.dataset.url, fd);
  busy(btn, false);

  if (!data.ok) return showMsg($("vMsg"), ERRORS[data.error] || ERRORS.network);

  // Tama ang code: balik sa login
  clearInterval(cdTimer);
  closeModal(verModal);
  regForm.reset();
  $("l_email").value = pendingEmail;
  $("l_password").value = "";
  showMsg($("msg"), DONE, "ok");
  $("l_password").focus();
});

// Ipadala ulit ang code (may 30 segundong hintay)
let cdTimer;
function startCooldown(sec) {
  const b = $("resendBtn");
  clearInterval(cdTimer);
  b.disabled = true;
  let left = sec;
  const tick = () => {
    if (left <= 0) {
      clearInterval(cdTimer);
      b.disabled = false;
      b.textContent = "Resend code";
      return;
    }
    b.textContent = `Resend code (${left}s)`;
    left--;
  };
  tick();
  cdTimer = setInterval(tick, 1000);
}

$("resendBtn").addEventListener("click", async () => {
  const fd = new FormData();
  fd.set("email", pendingEmail);
  const data = await post(verForm.dataset.resend, fd);
  if (data.ok) {
    showMsg($("vMsg"), RESENT, "ok");
    startCooldown(30);
  } else {
    showMsg($("vMsg"), ERRORS[data.error] || ERRORS.network);
  }
});

$("vCancel").addEventListener("click", () => {
  clearInterval(cdTimer);
  closeModal(verModal);
});

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  closeModal(regModal);
  closeModal(verModal);
  setNav(false);
});