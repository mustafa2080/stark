import re, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

p = r"C:\Users\musta\Desktop\pro\stark\stark\artifacts\api-server\src\routes\shipments.ts"
t = open(p, encoding="utf-8").read()

# find any array-like list of status strings near "STATUS" or similar
for m in re.finditer(r'(const|let)\s+\w*[Ss]tatus\w*\s*=\s*\[[^\]]{0,400}\]', t):
    print(m.group(0))
    print("---")
