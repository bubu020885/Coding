// ============================================
// FreizeitKarriere – CMS Backend Server
// ============================================
const express    = require('express');
const session    = require('express-session');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const cors       = require('cors');

const app  = express();
const PORT = 3001;
const ROOT = path.join(__dirname, '..');   // freizeitberufe/
const DATA = path.join(__dirname, 'data'); // freizeitberufe/backend/data/
const UPLOADS = path.join(ROOT, 'uploads');

// ── Credentials ─────────────────────────────
const ADMIN_USER = 'StefanBurian';
const ADMIN_PASS = 'JobsErleben2000';

// ── Ensure directories exist ─────────────────
[DATA, UPLOADS].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ── Middleware ───────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'freizeitkarriere-cms-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 8 * 60 * 60 * 1000 } // 8h
}));

// ── Static files ─────────────────────────────
app.use('/uploads', express.static(UPLOADS));
app.use('/admin',   express.static(path.join(ROOT, 'admin')));
app.use(express.static(ROOT)); // main website at /

// ── Multer (file uploads) ────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename:    (req, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /image\/(jpeg|jpg|png|gif|webp|svg\+xml)/.test(file.mimetype);
    cb(ok ? null : new Error('Nur Bilddateien erlaubt'), ok);
  }
});

// ── Data helpers ─────────────────────────────
function readData(file) {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) { fs.writeFileSync(p, '[]'); return []; }
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return []; }
}
function writeData(file, data) {
  fs.writeFileSync(path.join(DATA, file), JSON.stringify(data, null, 2), 'utf8');
}
function nextId(arr) {
  const max = arr.reduce((m, i) => Math.max(m, parseInt(i.id) || 0), 0);
  return String(max + 1);
}
function slugify(str) {
  return str.toLowerCase().replace(/[äöü]/g, c => ({ ä:'ae',ö:'oe',ü:'ue' }[c]))
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Auth middleware ──────────────────────────
function auth(req, res, next) {
  if (req.session?.authenticated) return next();
  res.status(401).json({ error: 'Nicht angemeldet' });
}

// ═══════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.authenticated = true;
    req.session.username = username;
    return res.json({ success: true, username });
  }
  res.status(401).json({ error: 'Ungültiger Benutzername oder Passwort' });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

app.get('/api/auth/check', (req, res) => {
  res.json({
    authenticated: !!req.session?.authenticated,
    username: req.session?.username || null
  });
});

// ═══════════════════════════════════════════
// UPLOAD ROUTE
// ═══════════════════════════════════════════
app.post('/api/upload', auth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Keine Datei hochgeladen' });
  res.json({ url: `/uploads/${req.file.filename}`, filename: req.file.filename });
});

app.delete('/api/upload/:filename', auth, (req, res) => {
  const file = path.join(UPLOADS, path.basename(req.params.filename));
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ success: true });
});

// ═══════════════════════════════════════════
// GENERIC CRUD FACTORY
// ═══════════════════════════════════════════
function crudRoutes(router, file) {
  // GET all
  router.get('/', auth, (req, res) => {
    res.json(readData(file));
  });

  // GET one
  router.get('/:id', auth, (req, res) => {
    const items = readData(file);
    const item = items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(item);
  });

  // POST create
  router.post('/', auth, (req, res) => {
    const items = readData(file);
    const body  = req.body;
    if (!body.title && !body.name) return res.status(400).json({ error: 'Titel erforderlich' });
    const newItem = {
      id:         slugify(body.title || body.name) + '-' + Date.now(),
      createdAt:  new Date().toISOString(),
      updatedAt:  new Date().toISOString(),
      ...body
    };
    items.push(newItem);
    writeData(file, items);
    res.status(201).json(newItem);
  });

  // PUT update
  router.put('/:id', auth, (req, res) => {
    const items = readData(file);
    const idx   = items.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Nicht gefunden' });
    items[idx] = { ...items[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
    writeData(file, items);
    res.json(items[idx]);
  });

  // DELETE
  router.delete('/:id', auth, (req, res) => {
    let items = readData(file);
    const item = items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Nicht gefunden' });
    // cleanup image if exists
    if (item.image) {
      const imgPath = path.join(ROOT, item.image.startsWith('/') ? item.image.slice(1) : item.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    items = items.filter(i => i.id !== req.params.id);
    writeData(file, items);
    res.json({ success: true });
  });

  // PATCH reorder (send array of ids)
  router.patch('/reorder', auth, (req, res) => {
    const { order } = req.body; // array of ids
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order[] erforderlich' });
    const items  = readData(file);
    const sorted = order.map(id => items.find(i => i.id === id)).filter(Boolean);
    // append any not in order
    items.forEach(i => { if (!order.includes(i.id)) sorted.push(i); });
    writeData(file, sorted);
    res.json({ success: true });
  });

  return router;
}

// Register routes
app.use('/api/berufe',     crudRoutes(express.Router(), 'berufe.json'));
app.use('/api/geschichten',crudRoutes(express.Router(), 'geschichten.json'));
app.use('/api/ausbildung', crudRoutes(express.Router(), 'ausbildung.json'));
app.use('/api/tags',       crudRoutes(express.Router(), 'tags.json'));

// ── SPA fallback for admin ───────────────────
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(ROOT, 'admin', 'index.html'));
});

// ── Error handler ────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: err.message || 'Serverfehler' });
});

app.listen(PORT, () => {
  console.log(`\n🎡 FreizeitKarriere CMS läuft auf http://localhost:${PORT}`);
  console.log(`   Admin-Panel: http://localhost:${PORT}/admin/`);
  console.log(`   Website:     http://localhost:${PORT}/\n`);
});
