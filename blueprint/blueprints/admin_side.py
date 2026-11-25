import os, re, time, secrets, smtplib, ssl
from email.message import EmailMessage
from functools import wraps
from flask import (Blueprint, render_template, request, redirect,
                   url_for, session, jsonify, current_app)
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from ..db import query

admin = Blueprint("admin", __name__, subdomain="admin")

#####################
# email settings
#####################
MAIL_USER = "cargocarrentalsystem@gmail.com"
MAIL_APP_PASSWORD = "liix mtcn qwqf mclu"      # i-paste dito ang 16-character Gmail App Password

ALLOWED_IMG = {"png", "jpg", "jpeg", "webp"}


# Calauan, Laguna lang ang sakop ng website
BARANGAYS = [
    "Balayhangin", "Bangyas", "Dayap", "Hanggan", "Imok", "Kanluran (Poblacion)",
    "Lamot 1", "Lamot 2", "Limao", "Mabacan", "Masiit", "Paliparan", "Perez",
    "Prinza", "San Isidro", "Santo Tomas", "Silangan (Poblacion)",
]
# Maluwag na kahon sa paligid ng Calauan (pangalawang tsek lang; ang eksaktong boundary ay sa mapa)
CALAUAN_LAT = (14.00, 14.30)
CALAUAN_LNG = (121.20, 121.50)


#####################
# helpers
#####################
def ok(**data):
    return jsonify(ok=True, **data)


def err(code, status=400):
    """Code lang ang ibinabalik. Ang JS ng page ang may hawak ng mensahe."""
    return jsonify(ok=False, error=code), status


def admin_required(f):
    """Bantay: kung hindi naka-login bilang admin, ibabalik sa login."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if session.get("role") != "admin":
            if request.method == "POST":
                return err("not_logged_in", 401)
            return redirect(url_for("admin.login"))
        return f(*args, **kwargs)
    return wrapper


def save_image(file):
    """Ibinabalik ang (filename, error_code)."""
    if not file or not file.filename:
        return None, None
    ext = file.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_IMG:
        return None, "invalid_image"
    name = f"{int(time.time())}_{secure_filename(file.filename)}"
    folder = os.path.join(current_app.static_folder, "uploads")
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, name))
    return name, None


def login_session(a):
    session.clear()
    session["user_id"] = a["id"]
    session["role"] = "admin"
    session["name"] = a["full_name"]


def next_code(table, column, prefix):
    """Gumagawa ng susunod na code, hal. part-0000-0001 o bus-0000-0001."""
    row = query(f"SELECT MAX({column}) AS last FROM {table}", one=True)
    n = 0
    if row and row["last"]:
        _, hi, lo = row["last"].split("-")
        n = int(hi) * 10000 + int(lo)
    n += 1
    return f"{prefix}-{n // 10000:04d}-{n % 10000:04d}"


def mail_ready():
    return bool(MAIL_USER and MAIL_APP_PASSWORD)


def send_code(to_email, code):
    """Nagpapadala ng 6-digit code gamit ang Gmail."""
    msg = EmailMessage()
    msg["Subject"] = "Calauan Tourism - Password Reset Code"
    msg["From"] = MAIL_USER
    msg["To"] = to_email
    msg.set_content(
        f"Ang 6-digit code mo para sa pag-reset ng password ay: {code}\n\n"
        "Valid ito sa loob ng 10 minuto. Kung hindi ikaw ang humiling nito, "
        "huwag pansinin ang email na ito."
    )
    with smtplib.SMTP_SSL("smtp.gmail.com", 465,
                          context=ssl.create_default_context(), timeout=15) as s:
        s.login(MAIL_USER, MAIL_APP_PASSWORD)
        s.send_message(msg)


#####################
# login page
#####################
@admin.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        if not email or not password:
            return err("missing_fields")

        a = query("SELECT * FROM admins WHERE email=%s", (email,), one=True)
        if a and check_password_hash(a["password_hash"], password):
            if a["status"] != "active":
                return err("account_disabled")
            login_session(a)
            return ok(redirect=url_for("admin.dashboard"))
        return err("invalid_credentials")
    return render_template("admin-login.html")


#####################
# logout
#####################
@admin.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("admin.login"))


#####################
# forgot password
#####################
@admin.route("/forgot/send", methods=["POST"])
def forgot_send():
    """Hakbang 1: i-check ang email sa database at mag-send ng 6-digit code."""
    email = request.form.get("email", "").strip()
    if not email:
        return err("email_required")

    a = query("SELECT id FROM admins WHERE email=%s AND status='active'", (email,), one=True)
    if not a:
        return err("email_not_found")
    if not mail_ready():
        return err("email_not_configured")

    code = f"{secrets.randbelow(1000000):06d}"
    query("UPDATE admins SET reset_code_hash=%s, reset_attempts=0, "
          "reset_expires=DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id=%s",
          (generate_password_hash(code), a["id"]), commit=True)
    try:
        send_code(email, code)
    except Exception:
        current_app.logger.exception("Hindi na-send ang reset email")
        return err("email_failed")

    session["reset_admin_id"] = a["id"]
    return ok()


@admin.route("/forgot/reset", methods=["POST"])
def forgot_reset():
    """Hakbang 2: i-verify ang code, palitan ang password, at diretso sa dashboard."""
    aid = session.get("reset_admin_id")
    if not aid:
        return err("session_expired")

    code = request.form.get("code", "").strip()
    new_pw = request.form.get("new_password", "")
    confirm = request.form.get("confirm_password", "")

    if not (code.isdigit() and len(code) == 6):
        return err("code_invalid")
    if len(new_pw) < 6:
        return err("password_short")
    if new_pw != confirm:
        return err("password_mismatch")

    a = query("SELECT *, (reset_expires IS NOT NULL AND reset_expires > NOW()) AS valid "
              "FROM admins WHERE id=%s", (aid,), one=True)
    if not a or not a["reset_code_hash"] or not a["valid"]:
        return err("code_expired")
    if a["reset_attempts"] >= 5:
        return err("too_many_attempts")
    if not check_password_hash(a["reset_code_hash"], code):
        query("UPDATE admins SET reset_attempts=reset_attempts+1 WHERE id=%s", (aid,), commit=True)
        return err("code_wrong")

    query("UPDATE admins SET password_hash=%s, reset_code_hash=NULL, reset_expires=NULL, "
          "reset_attempts=0 WHERE id=%s", (generate_password_hash(new_pw), aid), commit=True)
    login_session(a)
    return ok(redirect=url_for("admin.dashboard"))


#####################
# dashboard page
#####################
@admin.route("/")
@admin.route("/dashboard")
@admin_required
def dashboard():
    def count(sql):
        return query(sql, one=True)["c"]

    stats = {
        "users": count("SELECT COUNT(*) c FROM users"),
        "partners": count("SELECT COUNT(*) c FROM partners WHERE status='active'"),
        "pending": count("SELECT COUNT(*) c FROM partners WHERE status='pending'"),
        "bookings": count("SELECT COUNT(*) c FROM bookings"),
        "destinations": count("SELECT COUNT(*) c FROM destinations"),
        "announcements": count("SELECT COUNT(*) c FROM announcements"),
    }
    monthly = query(
        "SELECT CONCAT(YEAR(created_at),'-',LPAD(MONTH(created_at),2,'0')) AS m, COUNT(*) AS c "
        "FROM bookings GROUP BY m ORDER BY m DESC LIMIT 6")[::-1]
    biggest = max([r["c"] for r in monthly], default=1)
    for r in monthly:
        r["pct"] = r["c"] / biggest * 100

    pending = query("SELECT full_name, business_name, created_at FROM partners "
                    "WHERE status='pending' ORDER BY created_at DESC LIMIT 5")
    return render_template("admin-dashboard.html", stats=stats, monthly=monthly, pending=pending)


#####################
# profile page
#####################
@admin.route("/profile", methods=["GET", "POST"])
@admin_required
def profile():
    uid = session["user_id"]
    me = query("SELECT * FROM admins WHERE id=%s", (uid,), one=True)

    if request.method == "POST":
        full_name = request.form.get("full_name", "").strip()
        new_pw = request.form.get("new_password", "")
        if not full_name:
            return err("name_required")
        if new_pw:
            if len(new_pw) < 6:
                return err("password_short")
            if not check_password_hash(me["password_hash"], request.form.get("current_password", "")):
                return err("wrong_current_password")
            query("UPDATE admins SET password_hash=%s WHERE id=%s",
                  (generate_password_hash(new_pw), uid), commit=True)
        query("UPDATE admins SET full_name=%s WHERE id=%s", (full_name, uid), commit=True)
        session["name"] = full_name
        return ok()
    return render_template("admin-profile.html", me=me)


#####################
# manage partners page
#####################
@admin.route("/partners")
@admin_required
def partners():
    status = request.args.get("status", "pending")
    q = request.args.get("q", "").strip()

    sql = ("SELECT id, partner_code, full_name, email, status, created_at, business_name, "
           "category, address, contact, gcash_qr FROM partners WHERE status=%s")
    args = [status]
    if q:
        sql += " AND (business_name LIKE %s OR full_name LIKE %s)"
        args += [f"%{q}%", f"%{q}%"]
    rows = query(sql + " ORDER BY created_at DESC", tuple(args))

    counts = {r["status"]: r["c"] for r in
              query("SELECT status, COUNT(*) c FROM partners GROUP BY status")}
    return render_template("admin-partners.html", rows=rows, status=status, q=q, counts=counts)


@admin.route("/partners/<int:pid>/<action>", methods=["POST"])
@admin_required
def partner_action(pid, action):
    new_status = {"approve": "active", "reject": "rejected", "disable": "disabled"}.get(action)
    if not new_status:
        return err("invalid_action")

    p = query("SELECT * FROM partners WHERE id=%s", (pid,), one=True)
    if not p:
        return err("invalid_action", 404)

    # Unang approval lang: bibigyan ng partner_code at ilalagay ang business sa establishments
    if action == "approve" and not p["partner_code"]:
        query("UPDATE partners SET partner_code=%s WHERE id=%s",
              (next_code("partners", "partner_code", "part"), pid), commit=True)
        query("INSERT INTO establishments (business_id, owner_id, business_name, category, "
              "address, contact, gcash_qr) VALUES (%s,%s,%s,%s,%s,%s,%s)",
              (next_code("establishments", "business_id", "bus"), pid, p["business_name"],
               p["category"], p["address"], p["contact"], p["gcash_qr"]), commit=True)

    query("UPDATE partners SET status=%s WHERE id=%s", (new_status, pid), commit=True)
    return ok()


#####################
# manage users page
#####################
@admin.route("/users")
@admin_required
def users():
    q = request.args.get("q", "").strip()
    sql = "SELECT id, full_name, email, status, created_at FROM users"
    args = ()
    if q:
        sql += " WHERE full_name LIKE %s OR email LIKE %s"
        args = (f"%{q}%", f"%{q}%")
    rows = query(sql + " ORDER BY created_at DESC", args)
    return render_template("admin-users.html", rows=rows, q=q)


@admin.route("/users/<int:uid>/toggle", methods=["POST"])
@admin_required
def user_toggle(uid):
    query("UPDATE users SET status=IF(status='active','disabled','active') WHERE id=%s",
          (uid,), commit=True)
    return ok()


@admin.route("/users/<int:uid>/delete", methods=["POST"])
@admin_required
def user_delete(uid):
    try:
        query("DELETE FROM users WHERE id=%s", (uid,), commit=True)
    except Exception:
        current_app.logger.exception("Hindi na-delete ang user")
        return err("delete_failed")
    return ok()


#####################
# booking history page
#####################
@admin.route("/bookings")
@admin_required
def bookings():
    status = request.args.get("status", "all")
    sql = ("SELECT b.*, u.full_name AS tourist, p.business_name FROM bookings b "
           "JOIN users u ON u.id=b.user_id JOIN partners p ON p.id=b.partner_id")
    args = ()
    if status != "all":
        sql += " WHERE b.status=%s"
        args = (status,)
    rows = query(sql + " ORDER BY b.created_at DESC", args)
    total = sum(r["amount"] for r in rows if r["payment_status"])
    return render_template("admin-bookings.html", rows=rows, status=status, total=total)


#####################
# destinations page
#####################
@admin.route("/destinations")
@admin_required
def destinations():
    rows = query("SELECT * FROM destinations ORDER BY created_at DESC")
    return render_template("admin-destinations.html", rows=rows, barangays=BARANGAYS)


@admin.route("/destinations/save", methods=["POST"])
@admin_required
def destination_save():
    f = request.form
    name = f.get("name", "").strip()
    if not name:
        return err("name_required")
    try:
        fee = float(f.get("entrance_fee") or 0)
    except ValueError:
        return err("invalid_fee")
    if fee < 0:
        return err("invalid_fee")

    barangay = f.get("barangay", "").strip()
    landmark = f.get("landmark", "").strip()
    location = f.get("location", "").strip()      # complete address
    if not barangay:
        return err("barangay_required")
    if barangay not in BARANGAYS:
        return err("invalid_barangay")

    # Pin sa mapa (kailangan, at dapat nasa loob ng Calauan)
    try:
        lat = round(float(f.get("latitude", "")), 7)
        lng = round(float(f.get("longitude", "")), 7)
    except ValueError:
        return err("pin_required")
    if not (CALAUAN_LAT[0] <= lat <= CALAUAN_LAT[1] and CALAUAN_LNG[0] <= lng <= CALAUAN_LNG[1]):
        return err("out_of_area")

    img, img_error = save_image(request.files.get("image"))
    if img_error:
        return err(img_error)

    data = (name, f.get("category", ""), location, barangay, landmark, lat, lng,
            f.get("description", ""), fee, f.get("opening_hours", ""),
            f.get("contact", ""), f.get("status", "published"))

    if f.get("dest_id"):
        query("UPDATE destinations SET name=%s, category=%s, location=%s, barangay=%s, "
              "landmark=%s, latitude=%s, longitude=%s, description=%s, entrance_fee=%s, "
              "opening_hours=%s, contact=%s, status=%s, "
              "image=COALESCE(%s, image) WHERE id=%s",
              data + (img, f["dest_id"]), commit=True)
        return ok(mode="edit")
    query("INSERT INTO destinations (name, category, location, barangay, landmark, latitude, "
          "longitude, description, entrance_fee, opening_hours, contact, status, image) "
          "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
          data + (img,), commit=True)
    return ok(mode="add")


@admin.route("/destinations/<int:did>/toggle", methods=["POST"])
@admin_required
def destination_toggle(did):
    query("UPDATE destinations SET status=IF(status='published','hidden','published') WHERE id=%s",
          (did,), commit=True)
    return ok()


@admin.route("/destinations/<int:did>/delete", methods=["POST"])
@admin_required
def destination_delete(did):
    query("DELETE FROM destinations WHERE id=%s", (did,), commit=True)
    return ok()


#####################
# announcements page
#####################
@admin.route("/announcements")
@admin_required
def announcements():
    rows = query("SELECT * FROM announcements ORDER BY created_at DESC")
    return render_template("admin-announcements.html", rows=rows)


@admin.route("/announcements/save", methods=["POST"])
@admin_required
def announcement_save():
    f = request.form
    title = f.get("title", "").strip()
    if not title:
        return err("title_required")

    img, img_error = save_image(request.files.get("image"))
    if img_error:
        return err(img_error)

    if f.get("ann_id"):
        query("UPDATE announcements SET title=%s, body=%s, status=%s, image=COALESCE(%s, image) "
              "WHERE id=%s", (title, f.get("body", ""), f.get("status", "published"), img, f["ann_id"]),
              commit=True)
        return ok(mode="edit")
    query("INSERT INTO announcements (title, body, status, image, author_id) VALUES (%s,%s,%s,%s,%s)",
          (title, f.get("body", ""), f.get("status", "published"), img, session["user_id"]), commit=True)
    return ok(mode="add")


@admin.route("/announcements/<int:aid>/delete", methods=["POST"])
@admin_required
def announcement_delete(aid):
    query("DELETE FROM announcements WHERE id=%s", (aid,), commit=True)
    return ok()


#####################
# contact page
#####################
def social_url(value, base):
    """Ginagawang buong link ang username (hal. @calauan -> https://facebook.com/calauan)."""
    v = value.strip()
    if not v:
        return ""
    if re.match(r"^https?://", v, re.I):
        return v
    return f"{base}/{v.lstrip('@/')}"


def valid_phone(v):
    return bool(re.fullmatch(r"[0-9 +()\-]{7,50}", v)) and len(re.sub(r"\D", "", v)) >= 7


@admin.route("/contact")
@admin_required
def contact():
    info = query("SELECT * FROM contact_info WHERE id=1", one=True) or {}
    return render_template("admin-contact.html", info=info)


@admin.route("/contact/save", methods=["POST"])
@admin_required
def contact_save():
    f = request.form
    mobile = f.get("mobile", "").strip()
    landline = f.get("landline", "").strip()
    email = f.get("email", "").strip()
    facebook = social_url(f.get("facebook", ""), "https://facebook.com")
    instagram = social_url(f.get("instagram", ""), "https://instagram.com")

    if mobile and not valid_phone(mobile):
        return err("invalid_mobile")
    if landline and not valid_phone(landline):
        return err("invalid_landline")
    if email and (len(email) > 150 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email)):
        return err("invalid_email")
    if len(facebook) > 255 or len(instagram) > 255:
        return err("too_long")

    query("INSERT INTO contact_info (id, mobile, landline, email, facebook, instagram) "
          "VALUES (1,%s,%s,%s,%s,%s) "
          "ON DUPLICATE KEY UPDATE mobile=VALUES(mobile), landline=VALUES(landline), "
          "email=VALUES(email), facebook=VALUES(facebook), instagram=VALUES(instagram)",
          (mobile, landline, email, facebook, instagram), commit=True)
    return ok(facebook=facebook, instagram=instagram)