import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

try:
    import pymysql
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "pymysql", "--break-system-packages", "--quiet"])
    import pymysql

conn = pymysql.connect(
    host="lavender-armadillo-743548.hostingersite.com",
    user="u144001284_caprina",
    password="Capitan@123456",
    database="u144001284_caprina",
    port=3306,
    connect_timeout=15,
)
cur = conn.cursor()

print("== status distribution (all shipments, not deleted) ==")
cur.execute("SELECT status, COUNT(*) FROM shipments WHERE deleted_at IS NULL GROUP BY status ORDER BY COUNT(*) DESC")
for row in cur.fetchall():
    print(row)

print()
print("== total shipments ==")
cur.execute("SELECT COUNT(*) FROM shipments WHERE deleted_at IS NULL")
print(cur.fetchone())

print()
print("== date range of created_at ==")
cur.execute("SELECT MIN(created_at), MAX(created_at) FROM shipments WHERE deleted_at IS NULL")
print(cur.fetchone())

print()
print("== shipments in last 7 days ==")
cur.execute("SELECT COUNT(*) FROM shipments WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 7 DAY")
print(cur.fetchone())

print()
print("== status distribution in last 7 days ==")
cur.execute("SELECT status, COUNT(*) FROM shipments WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 7 DAY GROUP BY status ORDER BY COUNT(*) DESC")
for row in cur.fetchall():
    print(row)

cur.close()
conn.close()
