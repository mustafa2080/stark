const fs = require('fs');
const uri = fs.readFileSync('C:/Users/musta/Desktop/pro/stark/stark/stark_uri_clean.txt', 'utf8').trim();
const filePath = 'C:/Users/musta/Desktop/pro/stark/stark/artifacts/caprina/src/pages/shipment-detail.tsx';
let content = fs.readFileSync(filePath, 'utf8');
const oldLine = 'const starkLogoB64 = "STARK_LOGO_PLACEHOLDER";';
const newLine = 'const starkLogoB64 = "' + uri + '";';
if (!content.includes(oldLine)) {
  console.log('PLACEHOLDER NOT FOUND');
  process.exit(1);
}
content = content.replace(oldLine, newLine);
fs.writeFileSync(filePath, content, 'utf8');
console.log('DONE - replaced placeholder with real base64');
