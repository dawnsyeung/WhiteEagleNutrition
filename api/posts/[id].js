const { del } = require('@vercel/blob');
const { ensureSchema, deletePostById } = require('../_petFeedStore');

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const getBearerToken = (req) => {
  const auth = String(req.headers?.authorization || '');
  if (!auth.startsWith('Bearer ')) return '';
  return auth.slice('Bearer '.length).trim();
};

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'DELETE') {
      json(res, 405, { error: 'Method not allowed.' });
      return;
    }

    const adminToken = String(process.env.ADMIN_TOKEN || '').trim();
    if (!adminToken) {
      json(res, 403, { error: 'Delete is disabled (ADMIN_TOKEN not set).' });
      return;
    }

    const token = getBearerToken(req);
    if (token !== adminToken) {
      json(res, 401, { error: 'Unauthorized.' });
      return;
    }

    const id = String(req.query?.id || '').trim();
    if (!id) {
      json(res, 400, { error: 'Missing id.' });
      return;
    }

    await ensureSchema();
    const removed = await deletePostById(id);
    if (!removed) {
      json(res, 404, { error: 'Not found.' });
      return;
    }

    // Best-effort delete of blob object.
    if (removed.image_url) {
      del(removed.image_url).catch(() => {});
    }

    json(res, 200, { ok: true });
  } catch {
    json(res, 500, { error: 'Server error.' });
  }
};

