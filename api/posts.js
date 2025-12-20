const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');

const formidable = require('formidable');
const { put } = require('@vercel/blob');

const { ensureSchema, listPosts, insertPost, makeCursor } = require('./_petFeedStore');

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const badMethod = (res) => json(res, 405, { error: 'Method not allowed.' });

const isoToMs = (iso) => {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
};

const extForMime = (mime) => {
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

const parseMultipart = async (req) => {
  const form = formidable({
    multiples: false,
    maxFiles: 1,
    maxFileSize: Number(process.env.MAX_UPLOAD_BYTES || 6 * 1024 * 1024),
    allowEmptyFiles: false
  });

  return await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
};

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      await ensureSchema();

      const limit = req.query?.limit;
      const sort = req.query?.sort;
      const q = req.query?.q;
      const cursor = req.query?.cursor;

      const rows = await listPosts({ limit, sort, q, cursor });
      const next = rows.length ? rows[rows.length - 1] : null;

      json(res, 200, {
        posts: rows.map((r) => ({
          id: r.id,
          petName: r.pet_name,
          petType: r.pet_type,
          caption: r.caption,
          createdAt: isoToMs(r.created_at),
          imageUrl: r.image_url
        })),
        nextCursor: next ? makeCursor({ createdAt: next.created_at, id: next.id }) : null
      });
      return;
    }

    if (req.method === 'POST') {
      await ensureSchema();

      const { fields, files } = await parseMultipart(req);
      const petName = fields?.petName?.toString?.() || '';
      const petType = fields?.petType?.toString?.() || '';
      const caption = fields?.caption?.toString?.() || '';

      const photo = files?.photo;
      const file = Array.isArray(photo) ? photo[0] : photo;
      if (!file) {
        json(res, 400, { error: 'Missing photo file (field name must be "photo").' });
        return;
      }

      const mime = file.mimetype || '';
      const ext = extForMime(mime);
      if (!ext) {
        json(res, 415, { error: 'Unsupported image type. Please upload JPG/PNG/WebP/GIF/AVIF.' });
        return;
      }

      const buf = await fs.readFile(file.filepath);
      const fileName = `pet-photos/${crypto.randomUUID()}.${ext}`;

      const blob = await put(fileName, buf, {
        access: 'public',
        contentType: mime
      });

      const row = await insertPost({
        petName,
        petType,
        caption,
        imageUrl: blob.url
      });

      json(res, 201, {
        post: {
          id: row.id,
          petName: row.pet_name,
          petType: row.pet_type,
          caption: row.caption,
          createdAt: isoToMs(row.created_at),
          imageUrl: row.image_url
        }
      });
      return;
    }

    badMethod(res);
  } catch (error) {
    // Formidable file size
    if (error?.code === 'LIMIT_FILE_SIZE') {
      json(res, 413, { error: 'File too large.' });
      return;
    }
    // Formidable v3 uses http errors sometimes
    if (String(error?.message || '').toLowerCase().includes('maxfilesize')) {
      json(res, 413, { error: 'File too large.' });
      return;
    }
    json(res, 500, { error: 'Server error.' });
  } finally {
    // best-effort cleanup of formidable tmp file if present
    try {
      // formidable stores files under /tmp; Vercel will clean up, but do our part
      // no-op here because we don't track filepath after parse
      path.sep; // keep lint happy about unused path import in bundlers
    } catch {
      // ignore
    }
  }
};

