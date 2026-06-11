const fs = require('fs');

const logoUri = fs.readFileSync('C:/Users/musta/Desktop/pro/stark/stark/logo_caprina_uri.txt', 'utf8').trim();
const filePath = 'C:/Users/musta/Desktop/pro/stark/stark/artifacts/caprina/src/pages/shipment-detail.tsx';
let c = fs.readFileSync(filePath, 'utf8');

// 1. استبدل const starkLogoB64 بـ logoB64 من logo.jpg
c = c.replace(
  /const starkLogoB64 = "data:image\/jpeg;base64,[^"]+";/,
  `const logoB64 = "${logoUri}";`
);

// 2. صلح html,body عشان تظهر في النص مش على الجانب
c = c.replace(
  'html,body{width:210mm;font-family:\'Cairo\',sans-serif;background:#fff;color:#1a1a1a;direction:rtl;}',
  'html,body{width:100%;max-width:210mm;margin:0 auto;font-family:\'Cairo\',sans-serif;background:#fff;color:#1a1a1a;direction:rtl;}'
);

// 3. كبّر اللوجو وخليه مدور
c = c.replace(
  '.logo-img{width:72px;height:72px;object-fit:contain;}',
  '.logo-img{width:100px;height:100px;object-fit:cover;border-radius:50%;border:3px solid #e5e7eb;}'
);

// 4. استبدل starkLogoB64 في الـ img src بـ logoB64
c = c.replace('src="${starkLogoB64}"', 'src="${logoB64}"');

// 5. شيل brand-name وbrand-sub من الهيدر (نص STARK و Shipping & Logistics)
c = c.replace(
  '<div><div class="brand-name">STARK</div><div class="brand-sub">Shipping &amp; Logistics</div></div>',
  ''
);

// 6. صلح @media print عشان يطبع صح
c = c.replace(
  '@media print{html,body{width:210mm;}@page{size:A4;margin:0;}.page{min-height:297mm;}}',
  '@media print{html,body{width:210mm;max-width:210mm;}@page{size:A4;margin:10mm;}.page{min-height:297mm;}}'
);

fs.writeFileSync(filePath, c, 'utf8');
console.log('DONE');
