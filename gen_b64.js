const fs = require('fs');
const data = fs.readFileSync('C:/Users/musta/Desktop/pro/stark/stark/artifacts/caprina/public/tracking_opt.jpeg');
const b64 = data.toString('base64');
const content = 'export const trackingImg = "data:image/jpeg;base64,' + b64 + '";';
fs.writeFileSync('C:/Users/musta/Desktop/pro/stark/stark/artifacts/caprina/src/trackingImg.ts', content);
console.log('done KB:', Math.round(content.length / 1024));
