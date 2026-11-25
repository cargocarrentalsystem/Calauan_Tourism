import os, re, time, secrets, smtplib, ssl
from datetime import date, datetime
from werkzeug.utils import secure_filename
from email.message import EmailMessage
from flask import (Blueprint, render_template, request, redirect,
                   url_for, session, jsonify, current_app)
from werkzeug.security import check_password_hash, generate_password_hash
from ..db import query
from .admin_side import MAIL_USER, MAIL_APP_PASSWORD, mail_ready

user = Blueprint("user", __name__)



#####################
# helpers
#####################
def ok(**data):
    return jsonify(ok=True, **data)


def err(code, status=400):
    """Code lang ang ibinabalik. Ang JS ng page ang may hawak ng mensahe."""
    return jsonify(ok=False, error=code), status


def safe_next(url):
    """Loob lang ng site ang pinapayagang babalikan (iwas phishing)."""
    if url and url.startswith("/") and not url.startswith("//") and "\\" not in url:
        return url
    return url_for("user.home")


def new_code():
    return f"{secrets.randbelow(1000000):06d}"


def next_code(table, column, prefix):
    """Gumagawa ng susunod na code, hal. user-0000-0001."""
    row = query(f"SELECT MAX({column}) AS last FROM {table}", one=True)
    n = 0
    if row and row["last"]:
        _, hi, lo = row["last"].split("-")
        n = int(hi) * 10000 + int(lo)
    n += 1
    return f"{prefix}-{n // 10000:04d}-{n % 10000:04d}"


OPEN_HOUR, CLOSE_HOUR = 6, 22      # bookable hours: 6:00 AM - 10:00 PM
MAX_DAYS = 30                      # longest booking, in days


def send_mail(to_email, subject, body):
    """Sends a plain-text email using Gmail."""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = MAIL_USER
    msg["To"] = to_email
    msg.set_content(body)
    with smtplib.SMTP_SSL("smtp.gmail.com", 465,
                          context=ssl.create_default_context(), timeout=15) as s:
        s.login(MAIL_USER, MAIL_APP_PASSWORD)
        s.send_message(msg)


def send_verification(to_email, code):
    """Nagpapadala ng 6-digit verification code para sa registration."""
    send_mail(to_email, "Calauan Tourism - Verification Code",
              f"Ang 6-digit verification code mo para sa Calauan Tourism ay: {code}\n\n"
              "Valid ito sa loob ng 10 minuto. Kung hindi ikaw ang gumawa ng account, "
              "huwag pansinin ang email na ito.")


def send_booking_code(to_email, code, place):
    send_mail(to_email, "Calauan Tourism - Booking Verification Code",
              f"Your 6-digit code to confirm your booking at {place} is: {code}\n\n"
              "It is valid for 10 minutes. If you did not make this booking, "
              "you can ignore this email.")


def mask_email(email):
    name, _, domain = email.partition("@")
    return f"{name[:1]}***@{domain}"


def get_establishment(bid):
    """Active establishment (at active ang partner) lang ang pwedeng i-book."""
    return query("SELECT e.business_id, e.business_name, e.owner_id FROM establishments e "
                 "JOIN partners p ON p.id = e.owner_id "
                 "WHERE e.business_id=%s AND e.status='active' AND p.status='active'",
                 (bid,), one=True)


def parse_day(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def parse_hour(value):
    """'09:00' -> 9 (whole hours lang)."""
    try:
        h, m = str(value).split(":")[:2]
        return int(h) if int(m) == 0 else None
    except ValueError:
        return None


def slot_taken(bid, sd, ed, sh, eh):
    """True kung may active booking na sumasagasa sa dates AT oras."""
    row = query("SELECT id FROM bookings WHERE business_id=%s "
                "AND status IN ('pending','approved','arrived','confirmed','paid') "
                "AND start_date <= %s AND end_date >= %s "
                "AND HOUR(start_time) < %s AND HOUR(end_time) > %s LIMIT 1",
                (bid, ed, sd, eh, sh), one=True)
    return bool(row)


ALLOWED_IMG = {"png", "jpg", "jpeg", "webp"}


def fmt_hour(h):
    return f"{h % 12 or 12}:00 {'PM' if h >= 12 else 'AM'}"


def fmt_day(d):
    return d.strftime("%b %d, %Y")


def booking_view(r):
    sd = r["start_date"] or r["booking_date"]
    ed = r["end_date"] or sd
    r["dates"] = fmt_day(sd) if sd == ed else f"{fmt_day(sd)} – {fmt_day(ed)}"
    if r["sh"] is not None and r["eh"] is not None:
        r["time"] = f"{fmt_hour(r['sh'])} – {fmt_hour(r['eh'])}"
    else:
        r["time"] = "—"
    r["amount"] = float(r["amount"] or 0)
    return r


def save_receipt(file):
    """Ibinabalik ang (filename, error_code)."""
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMG:
        return None, "invalid_image"
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > 5 * 1024 * 1024:
        return None, "image_big"
    name = f"receipt_{int(time.time())}_{secrets.token_hex(4)}.{ext}"
    folder = os.path.join(current_app.static_folder, "uploads")
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, name))
    return name, None



def save_avatar(file):
    """Ibinabalik ang (filename, error_code) para sa profile picture."""
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMG:
        return None, "invalid_image"
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    if size > 5 * 1024 * 1024:
        return None, "image_big"
    name = f"avatar_{int(time.time())}_{secrets.token_hex(4)}.{ext}"
    folder = os.path.join(current_app.static_folder, "uploads")
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, name))
    return name, None


def delete_upload(name):
    """Binubura ang lumang larawan sa uploads (basename lang, para ligtas)."""
    if not name:
        return
    path = os.path.join(current_app.static_folder, "uploads", os.path.basename(name))
    try:
        os.remove(path)
    except OSError:
        pass


#####################
# homepage
#####################
@user.route("/")
def home():
    announcements = query(
        "SELECT id, title, body, image, created_at FROM announcements "
        "WHERE status='published' ORDER BY created_at DESC LIMIT 10")

    destinations = query(
        "SELECT id, name, category, location, barangay, landmark, latitude, longitude, "
        "description, entrance_fee, opening_hours, contact, image FROM destinations "
        "WHERE status='published' ORDER BY created_at DESC")

    establishments = query(
        "SELECT e.business_id, e.business_name, e.category, e.address, e.contact, e.description "
        "FROM establishments e JOIN partners p ON p.id = e.owner_id "
        "WHERE e.status='active' AND p.status='active' ORDER BY e.business_name")

    # Mga larawan ng establishments (nauuna ang front)
    imgs = query("SELECT business_id, image FROM establishment_images "
                 "ORDER BY is_front DESC, id")
    gallery = {}
    for i in imgs:
        gallery.setdefault(i["business_id"], []).append(i["image"])
    for e in establishments:
        e["images"] = gallery.get(e["business_id"], [])

    return render_template("user-homepage.html", announcements=announcements,
                           destinations=destinations, establishments=establishments)


#####################
# establishments page
#####################
@user.route("/establishments")
def establishments():
    rows = query("SELECT e.business_id, e.business_name, e.category, e.address, e.barangay, "
                 "e.landmark, e.latitude, e.longitude, e.contact, e.description "
                 "FROM establishments e JOIN partners p ON p.id = e.owner_id "
                 "WHERE e.status='active' AND p.status='active' ORDER BY e.business_name")

    # Mga larawan (nauuna ang front)
    imgs = query("SELECT business_id, image FROM establishment_images ORDER BY is_front DESC, id")
    gallery = {}
    for i in imgs:
        gallery.setdefault(i["business_id"], []).append(i["image"])
    for r in rows:
        r["images"] = gallery.get(r["business_id"], [])

    return render_template("user-establishments.html", rows=rows)

#####################
# mga page na gagawin pa lang (placeholder)
#####################
@user.route("/contact")
def contact():
    info = query("SELECT mobile, landline, email, facebook, instagram "
                 "FROM contact_info WHERE id=1", one=True) or {}
    return render_template("user-contact.html", info=info)


@user.route("/destinations")
def destinations():
    rows = query("SELECT id, name, category, location, barangay, landmark, latitude, longitude, "
                 "description, entrance_fee, opening_hours, contact, image FROM destinations "
                 "WHERE status='published' ORDER BY created_at DESC")
    return render_template("user-destinations.html", rows=rows)


#####################
# login / logout
#####################
@user.route("/login", methods=["GET", "POST"])
def login():
    nxt = safe_next(request.values.get("next"))

    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        if not email or not password:
            return err("missing_fields")

        u = query("SELECT * FROM users WHERE email=%s", (email,), one=True)
        if not u or not check_password_hash(u["password_hash"], password):
            return err("invalid_credentials")
        if u["status"] != "active":
            return err("account_disabled")

        session.clear()
        session["user_id"] = u["id"]
        session["role"] = "user"
        session["name"] = u["full_name"]
        return ok(redirect=nxt)

    if session.get("role") == "user":
        return redirect(nxt)
    return render_template("user-login.html", nxt=nxt)


@user.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("user.home"))


#####################
# registration (may email verification)
#####################
@user.route("/register", methods=["POST"])
def register():
    f = request.form
    full_name = f.get("full_name", "").strip()
    address = f.get("address", "").strip()
    contact = f.get("contact", "").strip()
    email = f.get("email", "").strip()
    gender = f.get("gender", "").strip()
    password = f.get("password", "")
    confirm = f.get("confirm_password", "")

    if not all([full_name, address, contact, email, gender, password]):
        return err("missing_fields")
    if "@" not in email or "." not in email.split("@")[-1]:
        return err("invalid_email")
    if len([c for c in contact if c.isdigit()]) < 7:
        return err("invalid_contact")
    if gender not in ("male", "female", "other"):
        return err("invalid_gender")
    if len(password) < 6:
        return err("password_short")
    if password != confirm:
        return err("password_mismatch")
    if query("SELECT id FROM users WHERE email=%s", (email,), one=True):
        return err("email_taken")
    if not mail_ready():
        return err("email_not_configured")

    code = new_code()
    query("INSERT INTO pending_registrations (email, full_name, address, contact, gender, "
          "password_hash, code_hash, attempts, expires_at, sent_at) "
          "VALUES (%s,%s,%s,%s,%s,%s,%s,0,DATE_ADD(NOW(), INTERVAL 10 MINUTE),NOW()) "
          "ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), address=VALUES(address), "
          "contact=VALUES(contact), gender=VALUES(gender), password_hash=VALUES(password_hash), "
          "code_hash=VALUES(code_hash), attempts=0, "
          "expires_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE), sent_at=NOW()",
          (email, full_name, address, contact, gender, generate_password_hash(password),
           generate_password_hash(code)), commit=True)
    try:
        send_verification(email, code)
    except Exception:
        current_app.logger.exception("Hindi na-send ang verification email")
        query("DELETE FROM pending_registrations WHERE email=%s", (email,), commit=True)
        return err("email_failed")
    return ok()


@user.route("/register/resend", methods=["POST"])
def register_resend():
    email = request.form.get("email", "").strip()
    p = query("SELECT email, (sent_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)) AS too_soon "
              "FROM pending_registrations WHERE email=%s", (email,), one=True)
    if not p:
        return err("no_pending")
    if p["too_soon"]:
        return err("resend_wait")
    if not mail_ready():
        return err("email_not_configured")

    code = new_code()
    query("UPDATE pending_registrations SET code_hash=%s, attempts=0, "
          "expires_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE), sent_at=NOW() WHERE email=%s",
          (generate_password_hash(code), email), commit=True)
    try:
        send_verification(email, code)
    except Exception:
        current_app.logger.exception("Hindi na-send ang verification email")
        return err("email_failed")
    return ok()


@user.route("/register/verify", methods=["POST"])
def register_verify():
    email = request.form.get("email", "").strip()
    code = request.form.get("code", "").strip()

    if not (code.isdigit() and len(code) == 6):
        return err("code_invalid")

    p = query("SELECT *, (expires_at > NOW()) AS valid FROM pending_registrations "
              "WHERE email=%s", (email,), one=True)
    if not p:
        return err("no_pending")
    if not p["valid"]:
        return err("code_expired")
    if p["attempts"] >= 5:
        return err("too_many_attempts")
    if not check_password_hash(p["code_hash"], code):
        query("UPDATE pending_registrations SET attempts=attempts+1 WHERE email=%s",
              (email,), commit=True)
        return err("code_wrong")

    if query("SELECT id FROM users WHERE email=%s", (email,), one=True):
        query("DELETE FROM pending_registrations WHERE email=%s", (email,), commit=True)
        return err("email_taken")

    query("INSERT INTO users (user_code, full_name, email, password_hash, address, contact, "
          "gender, status) VALUES (%s,%s,%s,%s,%s,%s,%s,'active')",
          (next_code("users", "user_code", "user"), p["full_name"], email, p["password_hash"],
           p["address"], p["contact"], p["gender"]), commit=True)
    query("DELETE FROM pending_registrations WHERE email=%s", (email,), commit=True)
    return ok()



#####################
# book now (kailangan naka-login)
#####################
@user.route("/book/<bid>")
def book(bid):
    if session.get("role") != "user":
        # Pagkatapos mag-login, babalik sa modal ng establishment na pinili
        return redirect(url_for("user.login", next=url_for("user.establishments", open=bid)))
    # Naka-login: bubuksan ng page ang booking modal
    return redirect(url_for("user.establishments", book=bid))


@user.route("/book/<bid>/availability")
def book_availability(bid):
    """Mga booking na hawak na (para i-disable ang dates at oras sa form)."""
    if not get_establishment(bid):
        return err("not_found", 404)
    rows = query("SELECT start_date, end_date, HOUR(start_time) AS h1, HOUR(end_time) AS h2 "
                 "FROM bookings WHERE business_id=%s "
                 "AND status IN ('pending','approved','arrived','confirmed','paid') "
                 "AND end_date >= CURDATE()",
                 (bid,))
    return ok(booked=[{"s": r["start_date"].isoformat(), "e": r["end_date"].isoformat(),
                       "from": r["h1"], "to": r["h2"]} for r in rows])


@user.route("/book/<bid>/submit", methods=["POST"])
def book_submit(bid):
    if session.get("role") != "user":
        return err("not_logged_in", 401)
    est = get_establishment(bid)
    if not est:
        return err("not_found", 404)

    f = request.form
    sd, ed = parse_day(f.get("start_date")), parse_day(f.get("end_date"))
    sh, eh = parse_hour(f.get("start_time")), parse_hour(f.get("end_time"))
    try:
        guests = int(f.get("guests", "1"))
    except ValueError:
        guests = 0

    today = date.today()
    if not sd or not ed or ed < sd:
        return err("invalid_date")
    if sd < today:
        return err("past_date")
    if (ed - sd).days + 1 > MAX_DAYS:
        return err("range_too_long")
    if sh is None or eh is None or sh < OPEN_HOUR or eh > CLOSE_HOUR or sh >= eh:
        return err("invalid_time")
    if sd == today and sh <= datetime.now().hour:
        return err("past_time")
    if not 1 <= guests <= 100:
        return err("invalid_guests")
    if slot_taken(bid, sd, ed, sh, eh):
        return err("slot_taken")
    if not mail_ready():
        return err("email_not_configured")

    uid = session["user_id"]
    u = query("SELECT email FROM users WHERE id=%s AND status='active'", (uid,), one=True)
    if not u:
        return err("not_logged_in", 401)

    # Itabi muna hanggang ma-verify ang code
    code = new_code()
    query("INSERT INTO pending_bookings (user_id, business_id, partner_id, start_date, end_date, "
          "start_time, end_time, guests, code_hash, attempts, expires_at, sent_at) "
          "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,0,DATE_ADD(NOW(), INTERVAL 10 MINUTE),NOW()) "
          "ON DUPLICATE KEY UPDATE business_id=VALUES(business_id), partner_id=VALUES(partner_id), "
          "start_date=VALUES(start_date), end_date=VALUES(end_date), "
          "start_time=VALUES(start_time), end_time=VALUES(end_time), guests=VALUES(guests), "
          "code_hash=VALUES(code_hash), attempts=0, "
          "expires_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE), sent_at=NOW()",
          (uid, bid, est["owner_id"], sd, ed, f"{sh:02d}:00:00", f"{eh:02d}:00:00",
           guests, generate_password_hash(code)), commit=True)
    try:
        send_booking_code(u["email"], code, est["business_name"])
    except Exception:
        current_app.logger.exception("Could not send the booking code")
        query("DELETE FROM pending_bookings WHERE user_id=%s", (uid,), commit=True)
        return err("email_failed")
    return ok(email=mask_email(u["email"]))


@user.route("/booking/resend", methods=["POST"])
def booking_resend():
    if session.get("role") != "user":
        return err("not_logged_in", 401)
    uid = session["user_id"]

    p = query("SELECT e.business_name, (pb.sent_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)) AS too_soon "
              "FROM pending_bookings pb JOIN establishments e ON e.business_id = pb.business_id "
              "WHERE pb.user_id=%s", (uid,), one=True)
    if not p:
        return err("no_pending")
    if p["too_soon"]:
        return err("resend_wait")
    if not mail_ready():
        return err("email_not_configured")

    u = query("SELECT email FROM users WHERE id=%s", (uid,), one=True)
    code = new_code()
    query("UPDATE pending_bookings SET code_hash=%s, attempts=0, "
          "expires_at=DATE_ADD(NOW(), INTERVAL 10 MINUTE), sent_at=NOW() WHERE user_id=%s",
          (generate_password_hash(code), uid), commit=True)
    try:
        send_booking_code(u["email"], code, p["business_name"])
    except Exception:
        current_app.logger.exception("Could not send the booking code")
        return err("email_failed")
    return ok()


@user.route("/booking/verify", methods=["POST"])
def booking_verify():
    if session.get("role") != "user":
        return err("not_logged_in", 401)
    uid = session["user_id"]
    code = request.form.get("code", "").strip()

    if not (code.isdigit() and len(code) == 6):
        return err("code_invalid")

    p = query("SELECT *, HOUR(start_time) AS sh, HOUR(end_time) AS eh, "
              "(expires_at > NOW()) AS valid FROM pending_bookings WHERE user_id=%s",
              (uid,), one=True)
    if not p:
        return err("no_pending")
    if not p["valid"]:
        return err("code_expired")
    if p["attempts"] >= 5:
        return err("too_many_attempts")
    if not check_password_hash(p["code_hash"], code):
        query("UPDATE pending_bookings SET attempts=attempts+1 WHERE user_id=%s",
              (uid,), commit=True)
        return err("code_wrong")

    # May naka-una ba habang naghihintay ng code?
    if slot_taken(p["business_id"], p["start_date"], p["end_date"], p["sh"], p["eh"]):
        query("DELETE FROM pending_bookings WHERE user_id=%s", (uid,), commit=True)
        return err("slot_taken")

    try:
        bcode = next_code("bookings", "booking_code", "book")
        query("INSERT INTO bookings (booking_code, user_id, partner_id, business_id, booking_date, "
              "start_date, end_date, start_time, end_time, guests, status, payment_status) "
              "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending',0)",
              (bcode, uid, p["partner_id"], p["business_id"], p["start_date"], p["start_date"],
               p["end_date"], f"{p['sh']:02d}:00:00", f"{p['eh']:02d}:00:00", p["guests"]),
              commit=True)
    except Exception:
        current_app.logger.exception("Could not save the booking")
        return err("booking_failed")

    query("DELETE FROM pending_bookings WHERE user_id=%s", (uid,), commit=True)
    return ok(code=bcode)



#####################
# my bookings (kailangan naka-login)
#####################
@user.route("/my-bookings")
def my_bookings():
    if session.get("role") != "user":
        return redirect(url_for("user.login", next=url_for("user.my_bookings")))

    rows = query("SELECT b.id, b.booking_code, b.booking_date, b.start_date, b.end_date, "
                 "HOUR(b.start_time) AS sh, HOUR(b.end_time) AS eh, b.guests, b.amount, "
                 "b.status, b.payment_status, b.payment_ref, b.created_at, "
                 "e.business_name, e.gcash_qr "
                 "FROM bookings b LEFT JOIN establishments e ON e.business_id=b.business_id "
                 "WHERE b.user_id=%s ORDER BY b.created_at DESC", (session["user_id"],))
    rows = [booking_view(r) for r in rows]
    return render_template("user-bookings.html", rows=rows)


@user.route("/my-bookings/<int:bid>/pay", methods=["POST"])
def booking_pay(bid):
    if session.get("role") != "user":
        return err("not_logged_in", 401)
    uid = session["user_id"]

    b = query("SELECT * FROM bookings WHERE id=%s AND user_id=%s", (bid, uid), one=True)
    if not b:
        return err("not_found", 404)
    if b["status"] != "arrived" or not b["amount"] or b["amount"] <= 0:
        return err("not_payable")
    if b["payment_status"] or b["payment_ref"]:
        return err("already_paid")

    ref = request.form.get("reference", "").strip()
    if not re.fullmatch(r"[A-Za-z0-9\- ]{6,40}", ref):
        return err("invalid_ref")
    if query("SELECT id FROM bookings WHERE payment_ref=%s AND id<>%s", (ref, bid), one=True):
        return err("ref_used")

    receipt = request.files.get("receipt")
    if not receipt or not receipt.filename:
        return err("receipt_required")
    fname, error = save_receipt(receipt)
    if error:
        return err(error)

    query("UPDATE bookings SET payment_ref=%s, payment_receipt=%s, payment_sent_at=NOW() "
          "WHERE id=%s AND user_id=%s", (ref, fname, bid, uid), commit=True)
    return ok()


@user.route("/profile")
def profile():
    if session.get("role") != "user":
        return redirect(url_for("user.login", next=url_for("user.profile")))

    u = query("SELECT user_code, full_name, email, address, contact, gender, "
              "profile_image, created_at FROM users WHERE id=%s AND status='active'",
              (session["user_id"],), one=True)
    if not u:
        session.clear()
        return redirect(url_for("user.login"))
    return render_template("user-profile.html", u=u)


@user.route("/profile/update", methods=["POST"])
def profile_update():
    if session.get("role") != "user":
        return err("not_logged_in", 401)

    f = request.form
    full_name = f.get("full_name", "").strip()
    address = f.get("address", "").strip()
    contact = f.get("contact", "").strip()
    gender = f.get("gender", "").strip()

    if not all([full_name, address, contact, gender]):
        return err("missing_fields")
    if len(full_name) > 150 or len(address) > 255 or len(contact) > 50:
        return err("too_long")
    if len([c for c in contact if c.isdigit()]) < 7:
        return err("invalid_contact")
    if gender not in ("male", "female", "other"):
        return err("invalid_gender")

    query("UPDATE users SET full_name=%s, address=%s, contact=%s, gender=%s "
          "WHERE id=%s AND status='active'",
          (full_name, address, contact, gender, session["user_id"]), commit=True)
    session["name"] = full_name
    return ok(name=full_name)


@user.route("/profile/password", methods=["POST"])
def profile_password():
    if session.get("role") != "user":
        return err("not_logged_in", 401)

    f = request.form
    current = f.get("current_password", "")
    new = f.get("new_password", "")
    confirm = f.get("confirm_password", "")

    if not current or not new or not confirm:
        return err("missing_fields")

    u = query("SELECT password_hash FROM users WHERE id=%s AND status='active'",
              (session["user_id"],), one=True)
    if not u:
        return err("not_logged_in", 401)
    if not check_password_hash(u["password_hash"], current):
        return err("wrong_password")
    if len(new) < 6:
        return err("password_short")
    if new != confirm:
        return err("password_mismatch")
    if check_password_hash(u["password_hash"], new):
        return err("same_password")

    query("UPDATE users SET password_hash=%s WHERE id=%s",
          (generate_password_hash(new), session["user_id"]), commit=True)
    return ok()


@user.route("/profile/photo", methods=["POST"])
def profile_photo():
    if session.get("role") != "user":
        return err("not_logged_in", 401)

    file = request.files.get("photo")
    if not file or not file.filename:
        return err("photo_required")
    fname, error = save_avatar(file)
    if error:
        return err(error)

    uid = session["user_id"]
    old = query("SELECT profile_image FROM users WHERE id=%s", (uid,), one=True)
    query("UPDATE users SET profile_image=%s WHERE id=%s", (fname, uid), commit=True)
    if old:
        delete_upload(old["profile_image"])
    return ok(image=fname)


@user.route("/profile/photo/remove", methods=["POST"])
def profile_photo_remove():
    if session.get("role") != "user":
        return err("not_logged_in", 401)

    uid = session["user_id"]
    old = query("SELECT profile_image FROM users WHERE id=%s", (uid,), one=True)
    query("UPDATE users SET profile_image=NULL WHERE id=%s", (uid,), commit=True)
    if old:
        delete_upload(old["profile_image"])
    return ok()


@user.context_processor
def inject_me():
    """Para magamit ang profile picture sa header ng lahat ng user pages."""
    if session.get("role") != "user":
        return {}
    row = query("SELECT profile_image FROM users WHERE id=%s",
                (session["user_id"],), one=True)
    return {"me_img": row["profile_image"] if row else None}