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
const KEY = "user-bookings-msg";
const UPLOADS = byId("bdModal").dataset.uploads;
const MAX_MB = 5;
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];

const ERRORS = {
  not_found: "Booking not found.",
  not_payable: "This booking isn't ready for payment.",
  already_paid: "A payment was already submitted for this booking.",
  invalid_ref: "Enter a valid reference number (6 to 40 letters or numbers).",
  ref_used: "This reference number was already used.",
  receipt_required: "Please upload your receipt.",
  invalid_image: "The receipt must be a PNG, JPG, JPEG, or WEBP image.",
  image_big: `The receipt must be ${MAX_MB}MB or smaller.`,
  not_logged_in: "Your session expired. Please log in again.",
  network: "Can't reach the server. Please try again."
};

const peso = n => "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
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

function openM(m) {
  m.classList.add("show");
  document.body.classList.add("modal-open");
}
function closeM(m) {
  m.classList.remove("show");
  if (!document.querySelector(".modal.show")) document.body.classList.remove("modal-open");
}

// Message saved before a reload
const saved = sessionStorage.getItem(KEY);
if (saved) { say(byId("msg"), saved, "ok"); sessionStorage.removeItem(KEY); }

// ---------- Booking details ----------
const bdModal = byId("bdModal"), payModal = byId("payModal");
let cur = null;

function note(d) {
  const amt = parseFloat(d.amount) || 0;
  const pay = d.pay === "1";
  switch (d.status) {
    case "pending": return "Waiting for the establishment to review your booking.";
    case "approved": return "Approved! Please arrive on your booked date and time.";
    case "arrived":
      if (pay) return "Your payment is confirmed. Thank you!";
      if (d.ref) return "Payment submitted. Waiting for the establishment to confirm it.";
      if (amt > 0) return "You've arrived. Your bill is ready, you can pay now.";
      return "You've arrived. The establishment will send your bill soon.";
    case "completed": return "This booking is completed. Thank you for visiting!";
    case "rejected": return "Sorry, this booking was rejected by the establishment.";
    case "cancelled": return "This booking was cancelled.";
    default: return "";
  }
}

function renderSteps(status, pay) {
  const done = [
    true,
    ["approved", "arrived", "completed", "confirmed"].includes(status),
    ["arrived", "completed"].includes(status),
    pay || status === "completed",
    status === "completed"
  ];
  const labels = ["Submitted", "Approved", "Arrived", "Paid", "Completed"];
  const box = byId("bd_steps");
  box.replaceChildren();
  box.hidden = ["rejected", "cancelled"].includes(status);

  const now = done.indexOf(false);
  labels.forEach((l, i) => box.appendChild(el("li", done[i] ? "done" : i === now ? "now" : "", l)));
}

function openDetails(item) {
  cur = item;
  const d = item.dataset;
  const amt = parseFloat(d.amount) || 0;
  const pay = d.pay === "1";

  byId("bd_code").textContent = d.code;
  byId("bd_place").textContent = d.place;
  const st = byId("bd_status");
  st.textContent = cap(d.status);
  st.className = "badge " + d.status;

  renderSteps(d.status, pay);
  byId("bd_note").textContent = note(d);

  const rows = [["Dates", d.dates], ["Time", d.time], ["Guests", d.guests]];
  if (amt > 0) rows.push(["Bill", peso(amt)]);
  rows.push(["Payment", pay ? "Paid" : d.ref ? "Submitted, waiting for confirmation" : "Unpaid"]);
  if (d.ref) rows.push(["Reference no.", d.ref]);

  const dl = byId("bd_sum");
  dl.replaceChildren();
  rows.forEach(([k, v]) => {
    const row = el("div");
    row.append(el("dt", "", k), el("dd", "", v));
    dl.appendChild(row);
  });

  // Pay now: arrived, has a bill, and nothing submitted yet
  byId("bd_pay").hidden = !(d.status === "arrived" && amt > 0 && !pay && !d.ref);

  openM(bdModal);
}

document.querySelectorAll(".bk-item").forEach(item => {
  item.querySelector(".btn-view").addEventListener("click", () => openDetails(item));
});
byId("bd_close").addEventListener("click", () => closeM(bdModal));
bdModal.addEventListener("click", e => { if (e.target === bdModal) closeM(bdModal); });

// ---------- Pay now ----------
const payForm = byId("payForm"), payFile = byId("pay_file");

function setPreview(src, name) {
  const img = byId("pay_prev");
  if (src) { img.src = src; img.hidden = false; }
  else { img.removeAttribute("src"); img.hidden = true; }
  byId("pay_fname").textContent = name || "";
}

byId("bd_pay").addEventListener("click", () => {
  const d = cur.dataset;
  payForm.reset();
  setPreview("", "");
  byId("payMsg").hidden = true;
  byId("pay_amount").textContent = peso(d.amount);

  const hasQr = !!d.qr;
  byId("pay_qr_wrap").hidden = !hasQr;
  byId("pay_noqr").hidden = hasQr;
  if (hasQr) byId("pay_qr").src = UPLOADS + d.qr;

  closeM(bdModal);
  openM(payModal);
  setTimeout(() => byId("pay_ref").focus(), 300);
});

byId("pay_close").addEventListener("click", () => closeM(payModal));
payModal.addEventListener("click", e => { if (e.target === payModal) closeM(payModal); });

payFile.addEventListener("change", () => {
  const file = payFile.files[0];
  if (!file) return setPreview("", "");
  if (!IMG_TYPES.includes(file.type)) {
    payFile.value = "";
    setPreview("", "");
    return say(byId("payMsg"), ERRORS.invalid_image);
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    payFile.value = "";
    setPreview("", "");
    return say(byId("payMsg"), ERRORS.image_big);
  }
  setPreview(URL.createObjectURL(file), file.name);
});

payForm.addEventListener("submit", async e => {
  e.preventDefault();
  const box = byId("payMsg");
  const ref = byId("pay_ref").value.trim();

  if (!/^[A-Za-z0-9\- ]{6,40}$/.test(ref)) return say(box, ERRORS.invalid_ref);
  if (!payFile.files.length) return say(box, ERRORS.receipt_required);

  const btn = byId("payOk");
  btn.disabled = true;
  btn.classList.add("loading");

  let data;
  try {
    const res = await fetch(cur.dataset.payUrl, { method: "POST", body: new FormData(payForm) });
    data = await res.json();
  } catch {
    data = { ok: false, error: "network" };
  }

  if (data.ok) {
    sessionStorage.setItem(KEY, "Payment submitted. The establishment will confirm it shortly.");
    location.reload();
    return;
  }
  say(box, ERRORS[data.error] || ERRORS.network);
  if (data.error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
  btn.disabled = false;
  btn.classList.remove("loading");
});

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  closeM(bdModal);
  closeM(payModal);
  setMenu(false);
  setNav(false);
});