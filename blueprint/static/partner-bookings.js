const $ = id => document.getElementById(id);

const burger = $("burger"), overlay = $("overlay");
const profileBtn = $("profileBtn"), profileMenu = $("profileMenu");
const mobile = window.matchMedia("(max-width:900px)");
const dModal = $("dModal"), rModal = $("rModal"), confirmModal = $("confirmModal");
const UPLOADS = dModal.dataset.uploads;

const DONE = {
  approve: "Booking approved.",
  reject: "Booking rejected.",
  arrived: "Marked as arrived.",
  bill: "Bill saved.",
  paid: "Payment marked as paid.",
  completed: "Booking completed."
};
const CONFIRM = {
  reject: { title: "Reject this booking?", text: "The tourist will see it as rejected and the dates will open up again.", ok: "Reject", danger: true },
  paid: { title: "Mark as paid?", text: "Confirm that you checked the receipt and received the payment.", ok: "Mark as paid", danger: false },
  completed: { title: "Complete this booking?", text: "This is the final step and can't be undone.", ok: "Complete", danger: false }
};
const ERRORS = {
  invalid_state: "That action isn't available for this booking's current status. Please refresh the page.",
  invalid_amount: "Enter a valid bill amount greater than 0.",
  invalid_action: "Unknown action.",
  not_found: "Booking not found.",
  not_logged_in: "Your session expired. Please log in again.",
  network: "Can't reach the server. Please try again."
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

// ---------- Clock ----------
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

// ---------- Helpers ----------
const peso = n => "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  timers.set(box, setTimeout(() => (box.hidden = true), 5000));
}

async function post(url, body) {
  try {
    const res = await fetch(url, { method: "POST", body });
    return await res.json();
  } catch {
    return { ok: false, error: "network" };
  }
}

// ---------- Details modal ----------
let cur = null;       // the table row that is open
let dirty = false;    // something changed -> reload the table when the modal closes

function steps(status, pay) {
  const done = [
    true,
    ["approved", "arrived", "completed", "confirmed"].includes(status),
    ["arrived", "completed"].includes(status),
    pay || status === "completed",
    status === "completed"
  ];
  const labels = ["Submitted", "Approved", "Arrived", "Paid", "Completed"];
  const box = $("d_steps");
  box.replaceChildren();
  box.hidden = ["rejected", "cancelled"].includes(status);

  const now = done.indexOf(false);
  labels.forEach((l, i) => {
    box.appendChild(el("li", done[i] ? "done" : i === now ? "now" : "", l));
  });
}

function render() {
  const d = cur.dataset;
  const status = d.status, pay = d.pay === "1", amt = parseFloat(d.amount) || 0;

  $("d_code").textContent = d.code;
  const st = $("d_status");
  st.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  st.className = "badge " + status;
  const pb = $("d_pay");
  pb.textContent = pay ? "Paid" : "Unpaid";
  pb.className = "badge " + (pay ? "paid" : "unpaid");

  $("d_tourist").textContent = d.tourist;
  $("d_email").textContent = d.email || "-";
  $("d_contact").textContent = d.contact || "-";
  $("d_place").textContent = d.place || "-";
  $("d_dates").textContent = d.dates;
  $("d_time").textContent = d.time;
  $("d_guests").textContent = d.guests;
  $("d_bill").textContent = amt > 0 ? peso(amt) : "Not billed yet";

  steps(status, pay);
  renderActions();
}

function button(label, cls, fn) {
  const b = el("button", "btn sm " + cls, label);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
}

function renderActions() {
  const box = $("d_actions");
  box.replaceChildren();
  const d = cur.dataset;
  const status = d.status, pay = d.pay === "1", amt = parseFloat(d.amount) || 0, ref = d.ref;
  const row = el("div", "row-btns");

  if (status === "pending") {
    row.append(
      button("Approve", "", () => act("approve")),
      button("Reject", "bad", () => act("reject", null, true))
    );
  } else if (status === "approved") {
    row.append(button("Mark as arrived", "", () => act("arrived")));
  } else if (status === "arrived") {
    // The bill can be set or changed until the tourist submits a payment
    if (!ref && !pay) {
      const wrap = el("div", "bill");
      const label = el("label", "", amt > 0 ? "Update bill (₱)" : "Bill amount (₱)");
      label.htmlFor = "bill_input";
      const line = el("div", "bill-row");
      const input = el("input");
      input.id = "bill_input";
      input.type = "number";
      input.min = "0.01";
      input.step = "0.01";
      input.placeholder = "0.00";
      if (amt > 0) input.value = amt.toFixed(2);
      line.append(input, button(amt > 0 ? "Update" : "Save bill", "", () => act("bill", { amount: input.value })));
      wrap.append(label, line);
      box.appendChild(wrap);
      if (amt > 0) box.appendChild(el("p", "d-note", "Bill sent. Waiting for the tourist to pay."));
    }
    if (ref && d.receipt) row.append(button("View payment", "ghost", openReceipt));
    if (ref && !pay) row.append(button("Mark as paid", "", () => act("paid", null, true)));
    if (pay) row.append(button("Mark as completed", "", () => act("completed", null, true)));
  } else if (status === "completed") {
    if (ref && d.receipt) row.append(button("View payment", "ghost", openReceipt));
    box.appendChild(el("p", "d-note", "This booking is completed."));
  } else if (status === "rejected") {
    box.appendChild(el("p", "d-note", "This booking was rejected."));
  }

  if (row.children.length) box.prepend(row);
}

// ---------- Actions ----------
function applyBooking(row, b) {
  const d = row.dataset;
  d.status = b.status;
  d.amount = b.amount;
  d.pay = b.pay;
  d.ref = b.ref;
  d.receipt = b.receipt;

  const st = row.querySelector(".st-badge");
  st.className = "badge st-badge " + b.status;
  st.textContent = b.status.charAt(0).toUpperCase() + b.status.slice(1);
  const pb = row.querySelector(".pay-badge");
  pb.className = "badge pay-badge " + (b.pay ? "paid" : "unpaid");
  pb.textContent = b.pay ? "Paid" : "Unpaid";
  row.querySelector(".amt").textContent = b.amount > 0 ? peso(b.amount) : "—";
}

async function act(name, extra, confirm) {
  if (confirm && !(await ask(name))) return;

  const fd = new FormData();
  if (extra) Object.entries(extra).forEach(([k, v]) => fd.set(k, v));

  const buttons = $("d_actions").querySelectorAll("button");
  buttons.forEach(b => (b.disabled = true));
  const data = await post(cur.dataset.actionUrl.replace("ACTION", name), fd);

  if (data.ok) {
    applyBooking(cur, data.booking);
    dirty = true;
    render();
    say($("d_msg"), DONE[name], "ok");
    return;
  }
  buttons.forEach(b => (b.disabled = false));
  say($("d_msg"), ERRORS[data.error] || ERRORS.network);
  if (data.error === "not_logged_in") setTimeout(() => (location.href = "/login"), 1500);
}

document.querySelectorAll(".btn-view").forEach(btn => {
  btn.addEventListener("click", () => {
    cur = btn.closest("tr");
    $("d_msg").hidden = true;
    render();
    dModal.classList.add("show");
  });
});

function closeDetails() {
  dModal.classList.remove("show");
  if (dirty) location.reload();        // refresh counts and tabs
}
$("d_close").addEventListener("click", closeDetails);
dModal.addEventListener("click", e => { if (e.target === dModal) closeDetails(); });

// ---------- Payment / receipt ----------
function openReceipt() {
  const d = cur.dataset;
  $("r_ref").textContent = d.ref;
  $("r_amount").textContent = peso(d.amount);
  $("r_img").src = UPLOADS + d.receipt;
  $("r_link").href = UPLOADS + d.receipt;
  rModal.classList.add("show");
}
$("r_close").addEventListener("click", () => rModal.classList.remove("show"));
rModal.addEventListener("click", e => { if (e.target === rModal) rModal.classList.remove("show"); });

// ---------- Confirmation ----------
const cmOk = $("cmOk"), cmCancel = $("cmCancel");
function ask(kind) {
  const c = CONFIRM[kind];
  return new Promise(resolve => {
    $("cmTitle").textContent = c.title;
    $("cmText").textContent = c.text;
    cmOk.textContent = c.ok;
    cmOk.classList.toggle("bad", c.danger);
    $("cmIcon").classList.toggle("danger", c.danger);
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

// ---------- Esc ----------
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (confirmModal.classList.contains("show")) { confirmModal.classList.remove("show"); return; }
  if (rModal.classList.contains("show")) { rModal.classList.remove("show"); return; }
  if (dModal.classList.contains("show")) closeDetails();
  setMenu(false);
  if (mobile.matches) setNav(false);
});