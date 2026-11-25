import os, time, secrets
from decimal import Decimal, InvalidOperation
from functools import wraps
from flask import (Blueprint, render_template, request, redirect,
                   url_for, session, jsonify, current_app)
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
from ..db import query
partner = Blueprint("partner", __name__, subdomain="partner")



# Calauan, Laguna lang ang sakop ng website
BARANGAYS = [
    "Balayhangin", "Bangyas", "Dayap", "Hanggan", "Imok", "Kanluran (Poblacion)",
    "Lamot 1", "Lamot 2", "Limao", "Mabacan", "Masiit", "Paliparan", "Perez",
    "Prinza", "San Isidro", "Santo Tomas", "Silangan (Poblacion)",
]
# Maluwag na kahon sa paligid ng Calauan (pangalawang tsek lang ito; ang eksaktong boundary ay sa mapa)
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


def partner_required(f):
    """Bantay: kung hindi naka-login bilang partner, ibabalik sa login."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if session.get("role") != "partner":
            if request.method == "POST":
                return err("not_logged_in", 401)
            return redirect(url_for("partner.login"))
        return f(*args, **kwargs)
    return wrapper


# error code kapag hindi pa "active" ang partner
STATUS_ERRORS = {
    "pending": "account_pending",
    "rejected": "account_rejected",
    "disabled": "account_disabled",
}


ALLOWED_IMG = {"png", "jpg", "jpeg", "webp"}


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

MAX_IMAGES = 10

MAX_PROFILE_MB = 5


@partner.context_processor
def inject_me_img():
    """Profile image ng naka-login na partner (para sa avatar sa header)."""
    if session.get("role") == "partner":
        row = query("SELECT profile_image FROM partners WHERE id=%s",
                    (session["user_id"],), one=True)
        return {"me_img": row["profile_image"] if row else None}
    return {"me_img": None}


def valid_image(file):
    """True kung may file at tama ang uri (png, jpg, jpeg, webp)."""
    return bool(file and file.filename
                and file.filename.rsplit(".", 1)[-1].lower() in ALLOWED_IMG)


def save_gallery_image(file):
    """Nagse-save ng larawan ng establishment na may unique na pangalan."""
    fname = f"{int(time.time())}_{secrets.token_hex(3)}_{secure_filename(file.filename)}"
    folder = os.path.join(current_app.static_folder, "uploads")
    os.makedirs(folder, exist_ok=True)
    file.save(os.path.join(folder, fname))
    return fname


def delete_upload(fname):
    """Binubura ang file sa uploads (kung nandoon pa)."""
    try:
        os.remove(os.path.join(current_app.static_folder, "uploads", fname))
    except OSError:
        pass


def next_code(table, column, prefix):
    """Gumagawa ng susunod na code, hal. bus-0000-0001."""
    row = query(f"SELECT MAX({column}) AS last FROM {table}", one=True)
    n = 0
    if row and row["last"]:
        _, hi, lo = row["last"].split("-")
        n = int(hi) * 10000 + int(lo)
    n += 1
    return f"{prefix}-{n // 10000:04d}-{n % 10000:04d}"


def fmt_hour(h):
    return f"{h % 12 or 12}:00 {'PM' if h >= 12 else 'AM'}"


def fmt_day(d):
    return d.strftime("%b %d, %Y")


def booking_view(r):
    """Inihahanda ang booking row para sa table."""
    sd = r["start_date"] or r["booking_date"]
    ed = r["end_date"] or sd
    r["dates"] = fmt_day(sd) if sd == ed else f"{fmt_day(sd)} – {fmt_day(ed)}"
    if r["sh"] is not None and r["eh"] is not None:
        r["time"] = f"{fmt_hour(r['sh'])} – {fmt_hour(r['eh'])}"
    else:
        r["time"] = "—"
    r["amount"] = float(r["amount"] or 0)
    return r


def booking_json(b):
    """Maliit na data na ibabalik sa JS pagkatapos ng aksyon."""
    return {"status": b["status"], "amount": float(b["amount"] or 0),
            "pay": int(b["payment_status"] or 0),
            "ref": b["payment_ref"] or "", "receipt": b["payment_receipt"] or ""}


#####################
# login page
#####################
@partner.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        if not email or not password:
            return err("missing_fields")

        p = query("SELECT * FROM partners WHERE email=%s", (email,), one=True)
        if not p or not check_password_hash(p["password_hash"], password):
            return err("invalid_credentials")
        if p["status"] != "active":
            return err(STATUS_ERRORS.get(p["status"], "account_disabled"))

        session.clear()
        session["user_id"] = p["id"]
        session["role"] = "partner"
        session["name"] = p["full_name"]
        return ok(redirect=url_for("partner.dashboard"))

    if session.get("role") == "partner":
        return redirect(url_for("partner.dashboard"))
    return render_template("partner-login.html")


#####################
# registration (papasok sa partners table bilang "pending")
#####################
@partner.route("/register", methods=["POST"])
def register():
    f = request.form
    full_name = f.get("full_name", "").strip()
    email = f.get("email", "").strip()
    business_name = f.get("business_name", "").strip()
    category = f.get("category", "").strip()
    address = f.get("address", "").strip()
    contact = f.get("contact", "").strip()
    password = f.get("password", "")
    confirm = f.get("confirm_password", "")

    if not all([full_name, email, business_name, category, address, contact, password]):
        return err("missing_fields")
    if "@" not in email or "." not in email.split("@")[-1]:
        return err("invalid_email")
    if len(password) < 6:
        return err("password_short")
    if password != confirm:
        return err("password_mismatch")
    if query("SELECT id FROM partners WHERE email=%s", (email,), one=True):
        return err("email_taken")

    query("INSERT INTO partners (full_name, email, password_hash, business_name, "
          "category, address, contact, status) VALUES (%s,%s,%s,%s,%s,%s,%s,'pending')",
          (full_name, email, generate_password_hash(password),
           business_name, category, address, contact), commit=True)
    return ok()


#####################
# logout
#####################
@partner.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("partner.login"))


#####################
# dashboard page
#####################
@partner.route("/")
@partner.route("/dashboard")
@partner_required
def dashboard():
    pid = session["user_id"]

    def one(sql):
        return query(sql, (pid,), one=True)["c"]

    stats = {
        "establishments": one("SELECT COUNT(*) c FROM establishments WHERE owner_id=%s"),
        "bookings": one("SELECT COUNT(*) c FROM bookings WHERE partner_id=%s"),
        "pending": one("SELECT COUNT(*) c FROM bookings WHERE partner_id=%s AND status='pending'"),
        "revenue": float(one("SELECT COALESCE(SUM(amount),0) c FROM bookings "
                             "WHERE partner_id=%s AND payment_status=1")),
    }

    monthly = query(
        "SELECT CONCAT(YEAR(created_at),'-',LPAD(MONTH(created_at),2,'0')) AS m, COUNT(*) AS c "
        "FROM bookings WHERE partner_id=%s GROUP BY m ORDER BY m DESC LIMIT 6", (pid,))[::-1]
    biggest = max([r["c"] for r in monthly], default=1)
    for r in monthly:
        r["pct"] = r["c"] / biggest * 100

    recent = query("SELECT b.amount, b.status, b.created_at, u.full_name AS tourist "
                   "FROM bookings b JOIN users u ON u.id=b.user_id "
                   "WHERE b.partner_id=%s ORDER BY b.created_at DESC LIMIT 5", (pid,))

    return render_template("partner-dashboard.html", stats=stats, monthly=monthly, recent=recent)


#####################
# bookings page
#####################
BOOKING_TABS = ["pending", "approved", "arrived", "completed", "rejected"]


@partner.route("/bookings")
@partner_required
def bookings():
    pid = session["user_id"]
    status = request.args.get("status", "all")
    if status != "all" and status not in BOOKING_TABS:
        status = "all"
    q = request.args.get("q", "").strip()

    sql = ("SELECT b.id, b.booking_code, b.booking_date, b.start_date, b.end_date, "
           "HOUR(b.start_time) AS sh, HOUR(b.end_time) AS eh, b.guests, b.amount, b.status, "
           "b.payment_status, b.payment_ref, b.payment_receipt, b.created_at, "
           "u.full_name AS tourist, u.email, u.contact, e.business_name "
           "FROM bookings b JOIN users u ON u.id=b.user_id "
           "LEFT JOIN establishments e ON e.business_id=b.business_id "
           "WHERE b.partner_id=%s")
    args = [pid]
    if status != "all":
        sql += " AND b.status=%s"
        args.append(status)
    if q:
        sql += " AND (b.booking_code LIKE %s OR u.full_name LIKE %s)"
        args += [f"%{q}%", f"%{q}%"]
    rows = [booking_view(r) for r in query(sql + " ORDER BY b.created_at DESC", tuple(args))]

    counts = {r["status"]: r["c"] for r in
              query("SELECT status, COUNT(*) c FROM bookings WHERE partner_id=%s GROUP BY status", (pid,))}
    counts["all"] = sum(counts.values())

    return render_template("partner-bookings.html", rows=rows, status=status, q=q, counts=counts)


@partner.route("/bookings/<int:bid>/<action>", methods=["POST"])
@partner_required
def booking_action(bid, action):
    pid = session["user_id"]
    b = query("SELECT * FROM bookings WHERE id=%s AND partner_id=%s", (bid, pid), one=True)
    if not b:
        return err("not_found", 404)
    st = b["status"]

    if action == "approve":
        if st != "pending":
            return err("invalid_state")
        query("UPDATE bookings SET status='approved' WHERE id=%s", (bid,), commit=True)

    elif action == "reject":
        if st != "pending":
            return err("invalid_state")
        query("UPDATE bookings SET status='rejected' WHERE id=%s", (bid,), commit=True)

    elif action == "arrived":
        if st != "approved":
            return err("invalid_state")
        query("UPDATE bookings SET status='arrived' WHERE id=%s", (bid,), commit=True)

    elif action == "bill":
        # Pwedeng itakda o baguhin hangga't wala pang naisusumiting payment
        if st != "arrived" or b["payment_status"] or b["payment_ref"]:
            return err("invalid_state")
        try:
            amt = Decimal(request.form.get("amount", "").strip())
            if not amt.is_finite() or amt <= 0 or amt > Decimal("10000000"):
                return err("invalid_amount")
        except InvalidOperation:
            return err("invalid_amount")
        query("UPDATE bookings SET amount=%s WHERE id=%s",
              (amt.quantize(Decimal("0.01")), bid), commit=True)

    elif action == "paid":
        if st != "arrived" or b["payment_status"] or not b["payment_receipt"]:
            return err("invalid_state")
        query("UPDATE bookings SET payment_status=1 WHERE id=%s", (bid,), commit=True)

    elif action == "completed":
        if st != "arrived" or not b["payment_status"]:
            return err("invalid_state")
        query("UPDATE bookings SET status='completed' WHERE id=%s", (bid,), commit=True)

    else:
        return err("invalid_action")

    fresh = query("SELECT * FROM bookings WHERE id=%s", (bid,), one=True)
    return ok(booking=booking_json(fresh))


#####################
# manage establishments page
#####################
@partner.route("/establishments")
@partner_required
def establishments():
    pid = session["user_id"]
    q = request.args.get("q", "").strip()
    sql = ("SELECT business_id, business_name, category, address, barangay, landmark, "
           "latitude, longitude, contact, description, gcash_qr "
           "FROM establishments WHERE owner_id=%s")
    args = [pid]
    if q:
        sql += " AND business_name LIKE %s"
        args.append(f"%{q}%")
    rows = query(sql + " ORDER BY created_at DESC", tuple(args))

    # Mga larawan ng bawat establishment (nauuna ang front)
    imgs = query("SELECT id, business_id, image, is_front FROM establishment_images "
                 "WHERE business_id IN (SELECT business_id FROM establishments WHERE owner_id=%s) "
                 "ORDER BY is_front DESC, id", (pid,))
    gallery = {}
    for i in imgs:
        gallery.setdefault(i["business_id"], []).append(
            {"id": i["id"], "image": i["image"], "front": bool(i["is_front"])})
    for r in rows:
        r["images"] = gallery.get(r["business_id"], [])

    return render_template("partner-establishments.html", rows=rows, q=q, barangays=BARANGAYS)

@partner.route("/establishments/save", methods=["POST"])
@partner_required
def establishment_save():
    pid = session["user_id"]
    f = request.form
    name = f.get("business_name", "").strip()
    category = f.get("category", "").strip()
    address = f.get("address", "").strip()
    barangay = f.get("barangay", "").strip()
    landmark = f.get("landmark", "").strip()
    contact = f.get("contact", "").strip()
    description = f.get("description", "").strip()
    bid = f.get("est_id", "").strip()      # business_id kapag nag-e-edit
    editing = bool(bid)

    if not all([name, category, address, barangay, contact]):
        return err("missing_fields")
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

    # Sa edit: siguraduhing pag-aari ng partner ang establishment
    if editing:
        e = query("SELECT business_id FROM establishments WHERE business_id=%s AND owner_id=%s",
                  (bid, pid), one=True)
        if not e:
            return err("not_found", 404)

    # Suriin muna ang lahat ng file bago mag-save ng kahit ano
    qr_file = request.files.get("qr")
    has_qr = bool(qr_file and qr_file.filename)
    if has_qr and not valid_image(qr_file):
        return err("invalid_image")
    if not editing and not has_qr:
        return err("qr_required")

    files = [x for x in request.files.getlist("images") if x and x.filename]
    if not all(valid_image(x) for x in files):
        return err("invalid_image")

    # Mga lumang larawan na aalisin (kung sa partner na ito lang)
    remove = [int(x) for x in f.getlist("remove") if x.isdigit()]
    removed_rows = []
    old_total = 0
    if editing:
        old_total = query("SELECT COUNT(*) c FROM establishment_images WHERE business_id=%s",
                          (bid,), one=True)["c"]
        if remove:
            marks = ",".join(["%s"] * len(remove))
            removed_rows = query("SELECT id, image FROM establishment_images "
                                 f"WHERE business_id=%s AND id IN ({marks})", (bid, *remove))
    if old_total - len(removed_rows) + len(files) > MAX_IMAGES:
        return err("too_many_images")

    # QR
    qr = save_image(qr_file)[0] if has_qr else None

    # Establishment
    if editing:
        # COALESCE: kung walang bagong QR, mananatili ang luma
        query("UPDATE establishments SET business_name=%s, category=%s, address=%s, "
              "barangay=%s, landmark=%s, latitude=%s, longitude=%s, "
              "contact=%s, description=%s, gcash_qr=COALESCE(%s, gcash_qr) "
              "WHERE business_id=%s AND owner_id=%s",
              (name, category, address, barangay, landmark, lat, lng,
               contact, description, qr, bid, pid), commit=True)
    else:
        bid = next_code("establishments", "business_id", "bus")
        query("INSERT INTO establishments (business_id, owner_id, business_name, category, "
              "address, barangay, landmark, latitude, longitude, contact, description, gcash_qr) "
              "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
              (bid, pid, name, category, address, barangay, landmark, lat, lng,
               contact, description, qr), commit=True)

    # Alisin ang mga napiling lumang larawan
    if removed_rows:
        ids = [r["id"] for r in removed_rows]
        marks = ",".join(["%s"] * len(ids))
        query(f"DELETE FROM establishment_images WHERE business_id=%s AND id IN ({marks})",
              (bid, *ids), commit=True)
        for r in removed_rows:
            delete_upload(r["image"])

    # I-save ang mga bagong larawan
    saved = []
    for x in files:
        fname = save_gallery_image(x)
        saved.append(fname)
        query("INSERT INTO establishment_images (business_id, image) VALUES (%s,%s)",
              (bid, fname), commit=True)

    # Front image: "new:<bilang>" para sa bago, "old:<id>" para sa luma
    front = f.get("front", "")
    if front.startswith("new:") and front[4:].isdigit() and int(front[4:]) < len(saved):
        query("UPDATE establishment_images SET is_front=(image=%s) WHERE business_id=%s",
              (saved[int(front[4:])], bid), commit=True)
    elif front.startswith("old:") and front[4:].isdigit():
        query("UPDATE establishment_images SET is_front=(id=%s) WHERE business_id=%s",
              (int(front[4:]), bid), commit=True)

    # Siguraduhing may front kung may larawan
    has_front = query("SELECT COUNT(*) c FROM establishment_images "
                      "WHERE business_id=%s AND is_front=1", (bid,), one=True)["c"]
    if not has_front:
        query("UPDATE establishment_images SET is_front=1 WHERE business_id=%s "
              "ORDER BY id LIMIT 1", (bid,), commit=True)

    return ok(mode="edit" if editing else "add")


@partner.route("/establishments/<bid>/delete", methods=["POST"])
@partner_required
def establishment_delete(bid):
    pid = session["user_id"]
    e = query("SELECT business_id FROM establishments WHERE business_id=%s AND owner_id=%s",
              (bid, pid), one=True)
    if not e:
        return err("not_found", 404)

    imgs = query("SELECT image FROM establishment_images WHERE business_id=%s", (bid,))
    try:
        query("DELETE FROM establishment_images WHERE business_id=%s", (bid,), commit=True)
        query("DELETE FROM establishments WHERE business_id=%s AND owner_id=%s",
              (bid, pid), commit=True)
    except Exception:
        current_app.logger.exception("Hindi na-delete ang establishment")
        return err("delete_failed")

    for i in imgs:
        delete_upload(i["image"])
    return ok()


@partner.route("/profile")
@partner_required
def profile():
    pid = session["user_id"]
    me = query("SELECT id, partner_code, full_name, email, business_name, category, "
               "address, contact, status, profile_image, created_at "
               "FROM partners WHERE id=%s", (pid,), one=True)
    if not me:
        session.clear()
        return redirect(url_for("partner.login"))

    ests = query("SELECT business_id, business_name, category, barangay, status "
                 "FROM establishments WHERE owner_id=%s ORDER BY created_at DESC", (pid,))
    return render_template("partner-profile.html", me=me, ests=ests)


@partner.route("/profile/save", methods=["POST"])
@partner_required
def profile_save():
    pid = session["user_id"]
    f = request.form
    full_name = f.get("full_name", "").strip()
    contact = f.get("contact", "").strip()

    if not full_name or not contact:
        return err("missing_fields")
    if len(full_name) > 100 or len(contact) > 50:
        return err("too_long")

    me = query("SELECT profile_image FROM partners WHERE id=%s", (pid,), one=True)
    if not me:
        return err("not_found", 404)
    old_img = me["profile_image"]
    new_img = old_img

    # Suriin muna ang larawan bago mag-save ng kahit ano
    photo = request.files.get("image")
    has_photo = bool(photo and photo.filename)
    if has_photo:
        if not valid_image(photo):
            return err("invalid_image")
        photo.seek(0, os.SEEK_END)
        too_big = photo.tell() > MAX_PROFILE_MB * 1024 * 1024
        photo.seek(0)
        if too_big:
            return err("image_big")

    if has_photo:
        new_img = save_gallery_image(photo)
    elif f.get("remove_image") == "1":
        new_img = None

    query("UPDATE partners SET full_name=%s, contact=%s, profile_image=%s WHERE id=%s",
          (full_name, contact, new_img, pid), commit=True)

    # Burahin ang lumang larawan kung napalitan o inalis
    if old_img and old_img != new_img:
        delete_upload(old_img)

    session["name"] = full_name
    return ok(name=full_name)