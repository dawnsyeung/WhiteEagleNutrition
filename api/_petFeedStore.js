const crypto = require('node:crypto');
const { sql } = require('@vercel/postgres');

const safeText = (value, maxLen) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));

const parseCursor = (cursor) => {
  if (!cursor) return null;
  try {
    const json = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    // createdAt stored as ISO string
    if (Number.isNaN(Date.parse(parsed.createdAt))) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
};

const makeCursor = ({ createdAt, id }) =>
  Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url');

const ensureSchema = async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS pet_photo_posts (
      id TEXT PRIMARY KEY,
      pet_name TEXT NOT NULL DEFAULT '',
      pet_type TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS pet_photo_posts_created_at_id_idx ON pet_photo_posts (created_at DESC, id DESC);`;
};

const listPosts = async ({ limit, sort, q, cursor }) => {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const safeSort = sort === 'oldest' ? 'oldest' : 'newest';
  const query = safeText(q, 80).toLowerCase();
  const parsedCursor = parseCursor(cursor);

  // Use tuple comparisons for stable pagination.
  if (safeSort === 'oldest') {
    const rows = await sql`
      SELECT id, pet_name, pet_type, caption, image_url, created_at
      FROM pet_photo_posts
      WHERE
        (${query} = '' OR (LOWER(pet_name || ' ' || pet_type || ' ' || caption) LIKE ${'%' + query + '%'}))
        AND (
          ${parsedCursor === null} OR
          (created_at, id) > (${parsedCursor?.createdAt || '1970-01-01T00:00:00.000Z'}::timestamptz, ${parsedCursor?.id || ''})
        )
      ORDER BY created_at ASC, id ASC
      LIMIT ${safeLimit};
    `;
    return rows.rows;
  }

  const rows = await sql`
    SELECT id, pet_name, pet_type, caption, image_url, created_at
    FROM pet_photo_posts
    WHERE
      (${query} = '' OR (LOWER(pet_name || ' ' || pet_type || ' ' || caption) LIKE ${'%' + query + '%'}))
      AND (
        ${parsedCursor === null} OR
        (created_at, id) < (${parsedCursor?.createdAt || '9999-12-31T23:59:59.999Z'}::timestamptz, ${parsedCursor?.id || 'zzzzzzzz'})
      )
    ORDER BY created_at DESC, id DESC
    LIMIT ${safeLimit};
  `;
  return rows.rows;
};

const insertPost = async ({ petName, petType, caption, imageUrl }) => {
  const id = uid();
  const safePetName = safeText(petName, 40);
  const safePetType = safeText(petType, 24) || 'Other';
  const safeCaption = safeText(caption, 240);

  const result = await sql`
    INSERT INTO pet_photo_posts (id, pet_name, pet_type, caption, image_url)
    VALUES (${id}, ${safePetName}, ${safePetType}, ${safeCaption}, ${imageUrl})
    RETURNING id, pet_name, pet_type, caption, image_url, created_at;
  `;

  return result.rows[0];
};

const deletePostById = async (id) => {
  const result = await sql`
    DELETE FROM pet_photo_posts
    WHERE id = ${id}
    RETURNING id, image_url;
  `;
  return result.rows[0] || null;
};

module.exports = {
  ensureSchema,
  listPosts,
  insertPost,
  deletePostById,
  makeCursor
};

