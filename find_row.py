path=r'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\shipping-manifest.tsx'
with open(path,'r',encoding='utf-8') as f:
    lines = f.readlines()
for i,l in enumerate(lines,1):
    if 'OrderDelivery' in l:
        print(i, l.rstrip())
