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

const getModeratorPassword = (req) => {
  const fromHeader = String(req.headers?.['x-moderator-password'] || '').trim();
  if (fromHeader) return fromHeader;
  return getBearerToken(req);
};

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'DELETE') {
      json(res, 405, { error: 'Method not allowed.' });
      return;
    }

    // Keep moderation intentionally simple: shared password, no usernames.
    const moderatorPassword = String(process.env.MODERATOR_PASSWORD || 'Remove').trim();
    const password = getModeratorPassword(req);
    if (!password || password !== moderatorPassword) {
      json(res, 401, { error: 'Unauthorized.' });
      return;
    }

    const rawId = req.query?.id;
    const id = String(Array.isArray(rawId) ? rawId[0] : rawId || '').trim();
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

