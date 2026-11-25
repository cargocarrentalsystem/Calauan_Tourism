const $ = id => document.getElementById(id);

const form = $("loginForm"), msg = $("msg");
const email = $("email"), password = $("password"), btn = $("btnLogin");
const emailModal = $("emailModal"), resetModal = $("resetModal");
const emailForm = $("emailForm"), resetForm = $("resetForm");
const fpEmail = $("fp_email"), fpMsg1 = $("fp_msg1"), fpMsg2 = $("fp_msg2");
const btnSend = $("btnSend"), btnReset = $("btnReset"), resend = $("linkResend");

const CODE_LIFETIME = 10 * 60;   // segundo; dapat kapareho ng server (10 minuto)
const RESEND_WAIT = 30;          // segundo bago makapag-resend

let resetEmail = "";             // email na pinadalhan ng code
let expiresAt = 0, resendAt = 0, timerId = null;

// All page messages
const MESSAGES = {
  // Login
  email_required: "Please enter your email.",
  email_invalid: "Invalid email address.",
  password_required: "Please enter your password.",
  missing_fields: "Please fill in your email and password.",
  invalid_credentials: "Incorrect email or password.",
  account_disabled: "This account is disabled.",
  // Forgot password
  email_not_found: "No admin account found with this email.",
  email_not_configured: "Email is not configured on the server (see admin_side.py).",
  email_failed: "Failed to send the email. Check the App Password and the terminal.",
  code_sent: "A 6-digit code has been sent to ",
  code_resent: "A new code has been resent.",
  code_required: "Please enter the 6-digit code.",
  code_invalid: "The code must be 6 digits.",
  code_wrong: "Incorrect code. Please try again.",
  code_expired: "The code has expired. Please request a new one.",
  too_many_attempts: "Too many incorrect attempts. Please request a new code.",
  session_expired: "The process has expired. Please start again.",
  password_short: "Password must be at least 6 characters.",
  password_mismatch: "Passwords do not match.",
  new_password_required: "Please enter the new password.",
  network: "Unable to reach the server. Make sure Flask is running."
};

// ---------- Mga helper ----------
function show(el, text, type = "error") {
  el.hidden = false;
  el.className = "msg " + type;
  void el.offsetWidth;                 // para umulit ang animation
  el.textContent = text;
}

function fail(el, text, input) {
  show(el, text);
  if (input) input.focus();
}

function setLoading(button, on) {
  button.classList.toggle("loading", on);
  button.disabled = on;
}

async function post(url, body) {
  try {
    const res = await fetch(url, { method: "POST", body });
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

const isEmail = v => /^\S+@\S+\.\S+$/.test(v);

function openModal(m, focusEl) {
  m.classList.add("show");
  setTimeout(() => focusEl && focusEl.focus(), 350);
}
const closeModal = m => m.classList.remove("show");

// Ipakita o itago ang password (lahat ng may .eye)
document.querySelectorAll(".eye").forEach(b => {
  b.addEventListener("click", () => {
    const input = $(b.dataset.target);
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    b.querySelector("use").setAttribute("href", reveal ? "#i-eyeoff" : "#i-eye");
  });
});

// ---------- Login ----------
form.addEventListener("submit", async e => {
  e.preventDefault();
  msg.hidden = true;

  if (!email.value.trim()) return fail(msg, MESSAGES.email_required, email);
  if (!isEmail(email.value.trim())) return fail(msg, MESSAGES.email_invalid, email);
  if (!password.value) return fail(msg, MESSAGES.password_required, password);

  setLoading(btn, true);
  const data = await post(location.href, new FormData(form));
  if (data.ok) {
    location.href = data.redirect;     // tuloy-tuloy ang loading hanggang makalipat
  } else {
    show(msg, MESSAGES[data.error] || MESSAGES.network);
    setLoading(btn, false);
  }
});

// ---------- Forgot password: Modal 1 ----------
$("linkForgot").addEventListener("click", e => {
  e.preventDefault();
  fpMsg1.hidden = true;
  fpEmail.value = email.value.trim();
  openModal(emailModal, fpEmail);
});

$("cancel1").addEventListener("click", () => closeModal(emailModal));

async function sendCode(emailValue, messageEl, successText) {
  const fd = new FormData();
  fd.append("email", emailValue);
  const data = await post(emailForm.dataset.url, fd);
  if (data.ok) {
    resetEmail = emailValue;
    if (successText) show(messageEl, successText, "ok");
  } else {
    show(messageEl, MESSAGES[data.error] || MESSAGES.network);
  }
  return data.ok;
}

emailForm.addEventListener("submit", async e => {
  e.preventDefault();
  fpMsg1.hidden = true;
  const value = fpEmail.value.trim();

  if (!value) return fail(fpMsg1, MESSAGES.email_required, fpEmail);
  if (!isEmail(value)) return fail(fpMsg1, MESSAGES.email_invalid, fpEmail);

  setLoading(btnSend, true);
  const sent = await sendCode(value, fpMsg1, "");
  setLoading(btnSend, false);

  if (sent) {
    closeModal(emailModal);
    resetForm.reset();
    fpMsg2.hidden = true;
    $("sentTo").textContent = MESSAGES.code_sent + value + ".";
    startTimers();
    openModal(resetModal, $("fp_code"));
  }
});

// ---------- Countdown ng code ----------
function startTimers() {
  expiresAt = Date.now() + CODE_LIFETIME * 1000;
  resendAt = Date.now() + RESEND_WAIT * 1000;
  $("timerLabel").textContent = "Code expires in";
  btnReset.disabled = false;
  clearInterval(timerId);
  tick();
  timerId = setInterval(tick, 1000);
}

function tick() {
  const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
  const wait = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));

  $("countdown").textContent =
    String(Math.floor(left / 60)).padStart(2, "0") + ":" + String(left % 60).padStart(2, "0");
  $("barFill").style.width = (left / CODE_LIFETIME * 100) + "%";
  $("timer").classList.toggle("low", left <= 60);

  resend.disabled = wait > 0;
  resend.textContent = wait > 0 ? `Resend code (${wait}s)` : "Resend code";

  if (left === 0) {                     // expired
    clearInterval(timerId);
    $("timerLabel").textContent = "Code has expired";
    btnReset.disabled = true;
    resend.disabled = false;
    resend.textContent = "Resend code";
    show(fpMsg2, MESSAGES.code_expired);
  }
}

// ---------- Forgot password: Modal 2 ----------
$("cancel2").addEventListener("click", () => {
  clearInterval(timerId);
  closeModal(resetModal);
});

// Numero lang ang tatanggapin sa code
$("fp_code").addEventListener("input", e => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
});

resend.addEventListener("click", async () => {
  resend.disabled = true;
  fpMsg2.hidden = true;
  const sent = await sendCode(resetEmail, fpMsg2, MESSAGES.code_resent);
  if (sent) {
    $("fp_code").value = "";
    $("fp_code").focus();
    startTimers();
  } else {
    resend.disabled = false;
  }
});

resetForm.addEventListener("submit", async e => {
  e.preventDefault();
  fpMsg2.hidden = true;

  const code = $("fp_code").value.trim();
  const np = $("fp_new").value;
  const cp = $("fp_confirm").value;

  if (Date.now() >= expiresAt) return show(fpMsg2, MESSAGES.code_expired);
  if (!code) return fail(fpMsg2, MESSAGES.code_required, $("fp_code"));
  if (!/^\d{6}$/.test(code)) return fail(fpMsg2, MESSAGES.code_invalid, $("fp_code"));
  if (!np) return fail(fpMsg2, MESSAGES.new_password_required, $("fp_new"));
  if (np.length < 6) return fail(fpMsg2, MESSAGES.password_short, $("fp_new"));
  if (np !== cp) return fail(fpMsg2, MESSAGES.password_mismatch, $("fp_confirm"));

  setLoading(btnReset, true);
  const data = await post(resetForm.dataset.url, new FormData(resetForm));
  if (data.ok) {
    location.href = data.redirect;     // diretso sa dashboard ng admin
  } else {
    show(fpMsg2, MESSAGES[data.error] || MESSAGES.network);
    setLoading(btnReset, false);
    if (Date.now() >= expiresAt) btnReset.disabled = true;
  }
});