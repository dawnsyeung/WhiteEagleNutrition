const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const PORT = Number(process.env.PORT || 8787);
const WEB_ROOT = process.env.WEB_ROOT || path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, 'uploads');
const POSTS_FILE = process.env.POSTS_FILE || path.join(DATA_DIR, 'posts.json');
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''); // optional
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '').trim(); // optional
const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || '').trim(); // optional
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 6 * 1024 * 1024); // 6MB

const ensureDirs = async () => {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
  try {
    await fsp.access(POSTS_FILE, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(POSTS_FILE, JSON.stringify({ posts: [] }, null, 2), 'utf8');
  }
};

const safeText = (value, maxLen) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
};

const now = () => Date.now();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `post_${now()}_${crypto.randomBytes(6).toString('hex')}`);

const mimeToExt = (mime) => {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    default:
      return '';
  }
};

const absoluteUrl = (req, relativePath) => {
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}${relativePath}`;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
  return `${proto}://${host}${relativePath}`;
};

const parseCursor = (cursor) => {
  if (!cursor) return null;
  try {
    const json = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.createdAt !== 'number' || typeof parsed.id !== 'string') return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
};

const makeCursor = ({ createdAt, id }) =>
  Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');

const createStore = () => {
  let writeChain = Promise.resolve();

  const readAll = async () => {
    const raw = await fsp.readFile(POSTS_FILE, 'utf8');
    const data = JSON.parse(raw || '{}');
    const posts = Array.isArray(data.posts) ? data.posts : [];
    return posts;
  };

  const writeAll = async (posts) => {
    // serialize writes to avoid clobbering
    writeChain = writeChain.then(() =>
      fsp.writeFile(POSTS_FILE, JSON.stringify({ posts }, null, 2), 'utf8')
    );
    return writeChain;
  };

  const add = async (post) => {
    const posts = await readAll();
    posts.push(post);
    await writeAll(posts);
    return post;
  };

  const remove = async (id) => {
    const posts = await readAll();
    const idx = posts.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const [removed] = posts.splice(idx, 1);
    await writeAll(posts);
    return removed;
  };

  const clear = async () => {
    await writeAll([]);
  };

  return { readAll, writeAll, add, remove, clear };
};

const createApp = async () => {
  await ensureDirs();
  const store = createStore();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );
  app.use(compression());

  if (CORS_ORIGIN) {
    app.use(
      cors({
        origin: CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
        credentials: false
      })
    );
  } else {
    app.use(cors());
  }

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-8',
      legacyHeaders: false
    })
  );

  // Uploads are public.
  app.use(
    '/uploads',
    express.static(UPLOADS_DIR, {
      fallthrough: true,
      maxAge: '30d',
      etag: true
    })
  );

  // Serve the static website from the same origin (same domain deployment).
  // Block accidental exposure of backend source/data via the static server.
  app.use((req, res, next) => {
    if (req.path === '/backend' || req.path.startsWith('/backend/')) {
      res.status(404).end();
      return;
    }
    next();
  });
  app.use(
    express.static(WEB_ROOT, {
      extensions: ['html'],
      maxAge: '1h',
      etag: true
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/posts', async (req, res) => {
    const limitRaw = Number(req.query.limit || 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 20;
    const sort = String(req.query.sort || 'newest');
    const q = safeText(req.query.q, 80).toLowerCase();
    const cursor = parseCursor(req.query.cursor);

    const posts = await store.readAll();

    let items = posts.map((p) => ({
      id: p.id,
      petName: p.petName || '',
      petType: p.petType || '',
      caption: p.caption || '',
      createdAt: p.createdAt || 0,
      imagePath: p.imagePath || ''
    }));

    if (q) {
      items = items.filter((p) => {
        const haystack = `${p.petName} ${p.petType} ${p.caption}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    if (sort === 'oldest') items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
    else items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || b.id.localeCompare(a.id));

    if (cursor) {
      items = items.filter((p) => {
        if (sort === 'oldest') return p.createdAt > cursor.createdAt || (p.createdAt === cursor.createdAt && p.id > cursor.id);
        return p.createdAt < cursor.createdAt || (p.createdAt === cursor.createdAt && p.id < cursor.id);
      });
    }

    const slice = items.slice(0, limit);
    const next = slice.length === limit ? slice[slice.length - 1] : null;

    res.json({
      posts: slice.map((p) => ({
        id: p.id,
        petName: p.petName,
        petType: p.petType,
        caption: p.caption,
        createdAt: p.createdAt,
        imageUrl: absoluteUrl(req, p.imagePath)
      })),
      nextCursor: next ? makeCursor({ createdAt: next.createdAt, id: next.id }) : null
    });
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES }
  });

  const postLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false
  });

  app.post('/api/posts', postLimiter, upload.single('photo'), async (req, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Missing photo file.' });
      return;
    }

    const ext = mimeToExt(file.mimetype);
    if (!ext) {
      res.status(415).json({ error: 'Unsupported image type. Please upload JPG/PNG/WebP/GIF/AVIF.' });
      return;
    }

    // Basic payload sanitation.
    const petName = safeText(req.body.petName, 40);
    const petType = safeText(req.body.petType, 24) || 'Other';
    const caption = safeText(req.body.caption, 240);

    const id = uid();
    const createdAt = now();
    const fileName = `${id}.${ext}`;
    const relPath = `/uploads/${fileName}`;
    const absPath = path.join(UPLOADS_DIR, fileName);

    await fsp.writeFile(absPath, file.buffer);

    const record = {
      id,
      petName,
      petType,
      caption,
      createdAt,
      imagePath: relPath
    };

    await store.add(record);

    res.status(201).json({
      post: {
        id,
        petName,
        petType,
        caption,
        createdAt,
        imageUrl: absoluteUrl(req, relPath)
      }
    });
  });

  app.delete('/api/posts/:id', async (req, res) => {
    if (!ADMIN_TOKEN) {
      res.status(403).json({ error: 'Delete is disabled (ADMIN_TOKEN not set).' });
      return;
    }
    const auth = String(req.headers.authorization || '');
    const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    if (token !== ADMIN_TOKEN) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }

    const id = String(req.params.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'Missing id.' });
      return;
    }

    const removed = await store.remove(id);
    if (!removed) {
      res.status(404).json({ error: 'Not found.' });
      return;
    }

    if (removed.imagePath) {
      const fileName = removed.imagePath.split('/').pop();
      if (fileName) {
        const absPath = path.join(UPLOADS_DIR, fileName);
        fsp.unlink(absPath).catch(() => {});
      }
    }

    res.json({ ok: true });
  });

  // Multer errors (file size etc.)
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `File too large. Max is ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.` });
      return;
    }
    res.status(500).json({ error: 'Server error.' });
  });

  return app;
};

if (require.main === module) {
  createApp()
    .then((app) => {
      app.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`Happy Pet Photos API listening on http://localhost:${PORT}`);
      });
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start server', error);
      process.exit(1);
    });
}

module.exports = { createApp };

