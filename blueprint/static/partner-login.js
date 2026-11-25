const $ = id => document.getElementById(id);

const loginForm = $("loginForm"), loginMsg = $("loginMsg");
const registerForm = $("registerForm"), regMsg = $("regMsg");
const modal = $("registerModal");

// Mga mensahe para sa bawat error code galing sa server
// Messages for each server error code
const MESSAGES = {
  missing_fields: "Please fill in all fields.",
  invalid_credentials: "Incorrect email or password.",
  account_pending: "Your account is still awaiting admin approval.",
  account_rejected: "Your registration was not approved.",
  account_disabled: "Your account is disabled. Please contact the admin.",
  invalid_email: "Invalid email format.",
  password_short: "Password must be at least 6 characters.",
  password_mismatch: "Passwords do not match.",
  email_taken: "An account already uses this email.",
  network: "Unable to connect to the server. Please try again.",
  registered: "Your registration has been submitted. Please wait for admin approval before logging in."
};

// ---------- Mensahe ----------
function showMsg(el, type, code) {
  el.className = "msg " + type;
  el.textContent = MESSAGES[code] || "Something went wrong. Please try again.";
  el.hidden = false;
}

// ---------- Modal ----------
function openModal() {
  regMsg.hidden = true;
  modal.classList.add("show");
  document.body.style.overflow = "hidden";
  setTimeout(() => registerForm.elements.full_name.focus(), 200);
}

function closeModal() {
  modal.classList.remove("show");
  document.body.style.overflow = "";
}

$("openRegister").addEventListener("click", openModal);
$("closeRegister").addEventListener("click", closeModal);
$("cancelRegister").addEventListener("click", closeModal);
modal.addEventListener("click", e => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

// Kapag galing sa "Become a Partner" (?register=1), bukas agad ang modal
if (new URLSearchParams(location.search).get("register") === "1") {
  openModal();
  history.replaceState(null, "", location.pathname);
}

// ---------- Submit ----------
async function submitForm(form) {
  const btn = form.querySelector("button[type=submit]");
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    const res = await fetch(form.action, { method: "POST", body: new FormData(form) });
    return await res.json();
  } catch (e) {
    return { ok: false, error: "network" };
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
}

// Login
loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  loginMsg.hidden = true;
  const data = await submitForm(loginForm);
  if (data.ok) {
    location.href = data.redirect;
  } else {
    showMsg(loginMsg, "error", data.error);
  }
});

// Registration
registerForm.addEventListener("submit", async e => {
  e.preventDefault();
  regMsg.hidden = true;
  const data = await submitForm(registerForm);
  if (data.ok) {
    registerForm.reset();
    closeModal();
    showMsg(loginMsg, "ok", "registered");
  } else {
    showMsg(regMsg, "error", data.error);
  }
});