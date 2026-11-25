import mysql.connector

def query(sql, args=None, one=False, commit=False):
    conn = mysql.connector.connect(
        host="localhost", user="root", password="",
        database="calauan_tourism"
    )
    cur = conn.cursor(dictionary=True)      # row["email"] ang gamit
    try:
        cur.execute(sql, args)
        if commit:                          # INSERT / UPDATE / DELETE
            conn.commit()
            return cur.lastrowid
        return cur.fetchone() if one else cur.fetchall()   # SELECT
    finally:
        cur.close()
        conn.close()