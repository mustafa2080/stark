const fs = require('fs');
const uri = 'data:image/jpeg;base64,' + fs.readFileSync('C:/Users/musta/Desktop/pro/stark/stark/artifacts/caprina/public/logo.jpg').toString('base64');
fs.writeFileSync('C:/Users/musta/Desktop/pro/stark/stark/logo_caprina_uri.txt', uri);
console.log('size:', uri.length);
