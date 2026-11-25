from werkzeug.security import generate_password_hash
from blueprint.db import query

EMAIL = "cargocarrentalsystem@gmail.com"
PASSWORD = "admin123"          # pansamantala lang, palitan sa Profile page
NAME = "Admin"

existing = query("SELECT id FROM admins WHERE email=%s", (EMAIL,), one=True)

if existing:
    print("May admin na ganitong email. Hindi na gumawa ng bago.")
else:
    query("INSERT INTO admins (full_name, email, password_hash) VALUES (%s, %s, %s)",
          (NAME, EMAIL, generate_password_hash(PASSWORD)), commit=True)
    print(f"Na-create ang admin: {EMAIL} / {PASSWORD}")