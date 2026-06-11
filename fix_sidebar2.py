path = r'C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\components\layout.tsx'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('href: "/orders/new",        label: "شحنة جديدة"', 'href: "/orders?new=1",      label: "شحنة جديدة"')
with open(path, 'w', encoding='utf-8') as f:
    f.write(c)
print('done')
