const fs = require('fs');
const imgPath = 'C:/Users/musta/Desktop/pro/stark/stark/artifacts/caprina/public/stark.jpg';
const b = fs.readFileSync(imgPath);
const uri = 'data:image/jpeg;base64,' + b.toString('base64');
// Write just the URI to inject
fs.writeFileSync('C:/Users/musta/Desktop/pro/stark/stark/stark_uri_clean.txt', uri);
console.log('URI length:', uri.length);
