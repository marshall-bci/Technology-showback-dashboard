// Finance update script — run this after the VBA macro completes.
// Usage: node push-data.js "path/to/Cost Management.xlsm" [http://localhost:3001]
//
// Requires Node 18+ (uses built-in fetch). For older Node: npm install node-fetch
// and add: const fetch = require('node-fetch');

const XLSX = require('xlsx');
const path = require('path');

const filePath = process.argv[2];
const apiUrl = (process.argv[3] || 'http://localhost:3001').replace(/\/$/, '');

if (!filePath) {
  console.error('Usage: node push-data.js "path/to/Cost Management.xlsm" [api-url]');
  process.exit(1);
}

const absPath = path.resolve(filePath);
console.log(`Reading: ${absPath}`);

let workbook;
try {
  workbook = XLSX.readFile(absPath);
} catch (err) {
  console.error(`Cannot read file: ${err.message}`);
  process.exit(1);
}

const sheetName = workbook.SheetNames.find(n => n.endsWith('Management Tab'));
if (!sheetName) {
  console.error(`No sheet ending with "Management Tab" found.`);
  console.error(`Available sheets: ${workbook.SheetNames.join(', ')}`);
  process.exit(1);
}

console.log(`Parsing sheet: "${sheetName}"`);
const sheet = workbook.Sheets[sheetName];
const rows = parseManagementTab(sheet);
console.log(`Parsed ${rows.length} rows (skipped zero-value rows)`);

fetch(`${apiUrl}/api/cost-data`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rows, sheetName }),
})
  .then(async res => {
    const body = await res.json();
    if (res.ok) {
      console.log(`Done. ${body.rowCount} rows stored. Dashboard will update within 30s.`);
    } else {
      console.error(`Server error: ${body.error}`);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error(`Cannot reach API at ${apiUrl}: ${err.message}`);
    console.error('Is the server running? Run: node index.js');
    process.exit(1);
  });

function parseManagementTab(sheet) {
  const rows = [];
  const ref = sheet['!ref'];
  if (!ref) return rows;
  const range = XLSX.utils.decode_range(ref);

  for (let r = 10; r <= range.e.r; r++) {
    const get = (c) => {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      return cell !== undefined ? cell.v : '';
    };
    const num = (c) => { const v = get(c); return typeof v === 'number' ? v : (parseFloat(String(v)) || 0); };
    const str = (c) => String(get(c) || '').trim();

    const actuals = num(13), f1 = num(14), f2 = num(15), budget = num(16);
    if (actuals === 0 && f1 === 0 && f2 === 0 && budget === 0) continue;
    if (!str(1)) continue;

    rows.push({
      branch: str(1), glCode: str(2), branchCode: str(3), pid: str(4),
      glCategory: str(5), costModelCategory: str(6), description: str(7),
      required: str(8), currentCostModel: str(9), allocation: str(10),
      futureCostModel: str(11), showbackType: str(12),
      actuals, forecast1: f1, forecast2: f2, budget,
      ceo: num(17), legal: num(18), hr: num(19), audit: num(20),
      cdoCorpOps: num(21), finance: num(22), technology: num(23),
      io: num(24), irr: num(25), isr: num(26), cmci: num(27), pe: num(28),
      comments: str(29),
    });
  }
  return rows;
}
