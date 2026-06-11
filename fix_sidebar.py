path = r'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\components\layout.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('label: "طلب جديد"', 'label: "شحنة جديدة"')
c = c.replace('label: "الفواتير"', 'label: "فواتير الشحن"')
c = c.replace('label: "متابعة الشحن"', 'label: "متابعة الشحنات"')
with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('done')
