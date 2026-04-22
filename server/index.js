const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const { save, load } = require('./storage');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Finance script pushes parsed rows here after running the VBA macro
app.post('/api/cost-data', (req, res) => {
  const { rows, sheetName } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be an array' });
  save({ rows, sheetName, updatedAt: new Date().toISOString() });
  console.log(`[${new Date().toISOString()}] Updated: ${rows.length} rows from "${sheetName}"`);
  res.json({ ok: true, rowCount: rows.length });
});

// Frontend polls this endpoint
app.get('/api/cost-data', (req, res) => {
  const data = load();
  if (!data) return res.json({ rows: [], updatedAt: null, sheetName: null });
  res.json(data);
});

// Testing: upload XLSM directly to server for parsing
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames.find(n => n.endsWith('Management Tab')) || workbook.SheetNames[0];
    const rows = parseManagementTab(workbook.Sheets[sheetName]);
    save({ rows, sheetName, updatedAt: new Date().toISOString() });
    console.log(`[${new Date().toISOString()}] Upload: ${rows.length} rows from "${sheetName}"`);
    res.json({ ok: true, rowCount: rows.length, sheetName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// ─── Parser ───────────────────────────────────────────────────────────────────
// Column mapping (0-indexed): A=0, B=1, C=2 ... N=13, R=17, X=23, AD=29
function parseManagementTab(sheet) {
  const rows = [];
  const ref = sheet['!ref'];
  if (!ref) return rows;
  const range = XLSX.utils.decode_range(ref);

  for (let r = 10; r <= range.e.r; r++) { // row 11 in Excel = index 10
    const get = (c) => {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      return cell !== undefined ? cell.v : '';
    };
    const num = (c) => {
      const v = get(c);
      return typeof v === 'number' ? v : (parseFloat(String(v)) || 0);
    };
    const str = (c) => String(get(c) || '').trim();

    // Skip rows with no financial data
    const actuals = num(13), f1 = num(14), f2 = num(15), budget = num(16);
    if (actuals === 0 && f1 === 0 && f2 === 0 && budget === 0) continue;

    // Skip non-data rows (headers, empty branch)
    if (!str(1)) continue;

    rows.push({
      branch:           str(1),
      glCode:           str(2),
      branchCode:       str(3),
      pid:              str(4),
      glCategory:       str(5),
      costModelCategory: str(6),
      description:      str(7),
      required:         str(8),
      currentCostModel: str(9),
      allocation:       str(10),
      futureCostModel:  str(11),
      showbackType:     str(12),
      actuals,
      forecast1: f1,
      forecast2: f2,
      budget,
      ceo:        num(17),
      legal:      num(18),
      hr:         num(19),
      audit:      num(20),
      cdoCorpOps: num(21),
      finance:    num(22),
      technology: num(23),
      io:         num(24),
      irr:        num(25),
      isr:        num(26),
      cmci:       num(27),
      pe:         num(28),
      comments:   str(29),
    });
  }
  return rows;
}

app.listen(PORT, () => {
  console.log(`Cost dashboard API running on http://localhost:${PORT}`);
  console.log(`  GET  /api/cost-data   — frontend polls this`);
  console.log(`  POST /api/cost-data   — Finance script pushes here`);
  console.log(`  POST /api/upload      — file upload for testing`);
});
