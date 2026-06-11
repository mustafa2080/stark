const fs = require('fs');
const filePath = 'C:/Users/musta/Desktop/pro/stark/stark/artifacts/caprina/src/pages/shipment-detail.tsx';
let c = fs.readFileSync(filePath, 'utf8');

const replacements = [
  // inv-row
  ['.inv-row{font-size:11px;color:#6b7280;line-height:1.9;}', '.inv-row{font-size:13px;color:#6b7280;line-height:2;}'],
  ['.inv-row strong{color:#111827;font-weight:700;}', '.inv-row strong{color:#111827;font-weight:800;}'],
  // inv-title
  ['.inv-title{font-size:20px;font-weight:900;color:#111827;margin-bottom:5px;}', '.inv-title{font-size:24px;font-weight:900;color:#111827;margin-bottom:6px;}'],
  // status strip
  ['.st-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 14px;border-radius:20px;font-weight:700;font-size:11px;border:1.5px solid;}', '.st-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 16px;border-radius:20px;font-weight:800;font-size:13px;border:2px solid;}'],
  ['.pay-chip{font-size:11px;font-weight:700;color:#374151;background:#f3f4f6;padding:4px 12px;border-radius:6px;border:1px solid #e5e7eb;}', '.pay-chip{font-size:13px;font-weight:800;color:#374151;background:#f3f4f6;padding:5px 14px;border-radius:6px;border:1px solid #e5e7eb;}'],
  // parties
  ['.party-lbl{font-size:8px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;margin-bottom:7px;}', '.party-lbl{font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:8px;}'],
  ['.party-name{font-size:14px;font-weight:800;color:#111827;margin-bottom:4px;}', '.party-name{font-size:17px;font-weight:900;color:#111827;margin-bottom:5px;}'],
  ['.party-row{font-size:11px;color:#6b7280;margin-top:2px;}', '.party-row{font-size:13px;color:#6b7280;margin-top:3px;}'],
  ['.party-row strong{color:#374151;}', '.party-row strong{color:#374151;font-weight:700;}'],
  // table
  ['.tbl{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:11px;}', '.tbl{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:13px;}'],
  ['.tbl thead th{padding:8px 12px;font-weight:700;font-size:10px;letter-spacing:.3px;}', '.tbl thead th{padding:10px 14px;font-weight:800;font-size:12px;letter-spacing:.3px;}'],
  ['.tbl tbody td{padding:8px 12px;color:#374151;}', '.tbl tbody td{padding:10px 14px;color:#374151;}'],
  // summary
  ['.sum-row{display:flex;justify-content:space-between;padding:7px 14px;font-size:11px;border-bottom:1px solid #f3f4f6;}', '.sum-row{display:flex;justify-content:space-between;padding:9px 16px;font-size:13px;border-bottom:1px solid #f3f4f6;}'],
  ['.sum-total-lbl{font-size:11px;font-weight:600;}', '.sum-total-lbl{font-size:13px;font-weight:700;}'],
  ['.sum-total-val{font-size:17px;font-weight:900;}', '.sum-total-val{font-size:20px;font-weight:900;}'],
  // COD
  ['.cod-lbl{font-size:11px;color:#92400e;font-weight:700;}', '.cod-lbl{font-size:13px;color:#92400e;font-weight:800;}'],
  ['.cod-val{font-size:15px;font-weight:900;color:#d97706;}', '.cod-val{font-size:18px;font-weight:900;color:#d97706;}'],
  // notes label
  ['.notes-lbl{font-size:8px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#ca8a04;margin-bottom:5px;}', '.notes-lbl{font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#ca8a04;margin-bottom:6px;}'],
  // tracking
  ['.trk-num{font-size:14px;font-weight:900;letter-spacing:3px;color:#111827;}', '.trk-num{font-size:17px;font-weight:900;letter-spacing:3px;color:#111827;}'],
  // footer
  ['.inv-footer{border-top:1px solid #e5e7eb;padding:10px 30px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#9ca3af;margin-top:auto;}', '.inv-footer{border-top:1px solid #e5e7eb;padding:12px 30px;display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#9ca3af;margin-top:auto;}'],
  ['.footer-brand{color:#374151;font-weight:700;font-size:11px;}', '.footer-brand{color:#374151;font-weight:800;font-size:13px;}'],
];

let count = 0;
for (const [from, to] of replacements) {
  if (c.includes(from)) { c = c.replace(from, to); count++; }
  else console.log('NOT FOUND:', from.substring(0, 60));
}

fs.writeFileSync(filePath, c, 'utf8');
console.log(`DONE — ${count}/${replacements.length} replacements`);
