const crypto = require('node:crypto');
const { put, list } = require('@vercel/blob');
const { sql } = require('@vercel/postgres');

const safeText = (value, maxLen) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
const BLOB_STORE_PATH = 'pet-photos/store/posts.json';
let sqlEnabled = true;

const hasPostgresConfig = () =>
  Boolean(
    process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.POSTGRES_HOST
  );

const hasBlobConfig = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const createStorageUnavailableError = () => {
  const error = new Error('Public feed storage is not configured.');
  error.code = 'PET_FEED_STORAGE_UNAVAILABLE';
  return error;
};

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

const compareRows = (a, b, sort) => {
  const aMs = Date.parse(a.created_at || '') || 0;
  const bMs = Date.parse(b.created_at || '') || 0;
  if (sort === 'oldest') {
    return aMs - bMs || String(a.id || '').localeCompare(String(b.id || ''));
  }
  return bMs - aMs || String(b.id || '').localeCompare(String(a.id || ''));
};

const rowMatchesQuery = (row, query) => {
  if (!query) return true;
  const haystack = `${row.pet_name || ''} ${row.pet_type || ''} ${row.caption || ''}`.toLowerCase();
  return haystack.includes(query);
};

const rowPassesCursor = (row, parsedCursor, sort) => {
  if (!parsedCursor) return true;
  const rowMs = Date.parse(row.created_at || '') || 0;
  const cursorMs = Date.parse(parsedCursor.createdAt || '') || 0;
  if (sort === 'oldest') {
    return rowMs > cursorMs || (rowMs === cursorMs && String(row.id || '') > parsedCursor.id);
  }
  return rowMs < cursorMs || (rowMs === cursorMs && String(row.id || '') < parsedCursor.id);
};

const listStoreBlobs = async () => {
  if (!hasBlobConfig()) return [];
  const { blobs = [] } = await list({ prefix: BLOB_STORE_PATH });
  return blobs
    .filter((blob) => blob.pathname === BLOB_STORE_PATH)
    .sort((a, b) => new Date(b.uploadedAt || 0).getTime() - new Date(a.uploadedAt || 0).getTime());
};

const loadBlobRows = async () => {
  const blobs = await listStoreBlobs();
  const latest = blobs[0];
  if (!latest) return [];

  const response = await fetch(latest.url, { cache: 'no-store' });
  if (!response.ok) return [];

  const payload = await response.json().catch(() => ({}));
  const rows = Array.isArray(payload.posts) ? payload.posts : [];
  return rows
    .map((row) => ({
      id: safeText(row?.id),
      pet_name: safeText(row?.pet_name || row?.petName, 40),
      pet_type: safeText(row?.pet_type || row?.petType, 24) || 'Other',
      caption: safeText(row?.caption, 240),
      image_url: safeText(row?.image_url || row?.imageUrl),
      created_at:
        typeof row?.created_at === 'string' && !Number.isNaN(Date.parse(row.created_at))
          ? row.created_at
          : new Date().toISOString()
    }))
    .filter((row) => row.id && row.image_url);
};

const saveBlobRows = async (rows) => {
  if (!hasBlobConfig()) {
    throw createStorageUnavailableError();
  }
  const payload = JSON.stringify({ posts: rows }, null, 2);
  await put(BLOB_STORE_PATH, payload, {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false
  });
};

const withSqlFallback = async (sqlAction, blobAction) => {
  if (sqlEnabled && hasPostgresConfig()) {
    try {
      return await sqlAction();
    } catch (error) {
      sqlEnabled = false;
      console.warn('Postgres unavailable for pet feed; falling back to Blob metadata store.', error?.message || error);
    }
  }

  try {
    return await blobAction();
  } catch (error) {
    if (!hasBlobConfig()) {
      throw createStorageUnavailableError();
    }
    throw error;
  }
};

const ensureSchema = async () => {
  await withSqlFallback(
    async () => {
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
    },
    async () => {}
  );
};

const listPosts = async ({ limit, sort, q, cursor }) => {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const safeSort = sort === 'oldest' ? 'oldest' : 'newest';
  const query = safeText(q, 80).toLowerCase();
  const parsedCursor = parseCursor(cursor);

  return withSqlFallback(
    async () => {
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
    },
    async () => {
      const rows = await loadBlobRows();
      return rows
        .filter((row) => rowMatchesQuery(row, query))
        .sort((a, b) => compareRows(a, b, safeSort))
        .filter((row) => rowPassesCursor(row, parsedCursor, safeSort))
        .slice(0, safeLimit);
    }
  );
};

const insertPost = async ({ petName, petType, caption, imageUrl }) => {
  const id = uid();
  const safePetName = safeText(petName, 40);
  const safePetType = safeText(petType, 24) || 'Other';
  const safeCaption = safeText(caption, 240);
  const createdAtIso = new Date().toISOString();

  return withSqlFallback(
    async () => {
      const result = await sql`
        INSERT INTO pet_photo_posts (id, pet_name, pet_type, caption, image_url)
        VALUES (${id}, ${safePetName}, ${safePetType}, ${safeCaption}, ${imageUrl})
        RETURNING id, pet_name, pet_type, caption, image_url, created_at;
      `;

      return result.rows[0];
    },
    async () => {
      const rows = await loadBlobRows();
      const row = {
        id,
        pet_name: safePetName,
        pet_type: safePetType,
        caption: safeCaption,
        image_url: imageUrl,
        created_at: createdAtIso
      };
      rows.push(row);
      await saveBlobRows(rows);
      return row;
    }
  );
};

const deletePostById = async (id) => {
  return withSqlFallback(
    async () => {
      const result = await sql`
        DELETE FROM pet_photo_posts
        WHERE id = ${id}
        RETURNING id, image_url;
      `;
      return result.rows[0] || null;
    },
    async () => {
      const rows = await loadBlobRows();
      const idx = rows.findIndex((row) => row.id === id);
      if (idx === -1) return null;
      const [removed] = rows.splice(idx, 1);
      await saveBlobRows(rows);
      return { id: removed.id, image_url: removed.image_url };
    }
  );
};

module.exports = {
  ensureSchema,
  listPosts,
  insertPost,
  deletePostById,
  makeCursor
};

