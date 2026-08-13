import os, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

targets = ["warehouse_ready", "in_shipping", '"received"', "'received'", '"pending"', "'pending'"]
root_dir = r"C:\Users\musta\Desktop\pro\stark\stark\artifacts\api-server\src"

for root, dirs, files in os.walk(root_dir):
    for f in files:
        if not f.endswith(".ts"):
            continue
        p = os.path.join(root, f)
        try:
            t = open(p, encoding="utf-8").read()
        except Exception:
            continue
        for tgt in targets:
            if tgt in t:
                count = t.count(tgt)
                print(f"{p} :: {tgt} :: {count}")
