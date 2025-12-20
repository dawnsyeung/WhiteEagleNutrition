# Happy Pet Photos (Vercel deployment)

This repo is a static website plus an installable PWA (`pet-photos-app.html`) with a **public photo feed** powered by:

- **Vercel Serverless Functions** (`/api/*`)
- **Vercel Postgres** (stores post metadata)
- **Vercel Blob** (stores uploaded images)

## Deploy on Vercel (same domain)

### 1) Import the GitHub repo into Vercel
- In Vercel: **Add New → Project → Import Git Repository**
- Framework preset: **Other**

### 2) Add Vercel Postgres
- In your project: **Storage → Create Database → Postgres**
- Attach it to this project/environment(s)

Vercel will add the required Postgres env vars to the project (for example `POSTGRES_URL` / `POSTGRES_PRISMA_URL` etc.).

### 3) Add Vercel Blob
- In your project: **Storage → Create → Blob**
- Attach it to this project/environment(s)

Vercel will add `BLOB_READ_WRITE_TOKEN` to the project env vars.

### 4) Deploy
Deploy as usual. The public feed API routes will be available at:
- `GET /api/posts`
- `POST /api/posts`

And the app UI is at:
- `/pet-photos-app.html`

## Admin delete (optional)

To enable deleting public posts:
- Add an env var in Vercel: `ADMIN_TOKEN = <some long random string>`
- Then call: `DELETE /api/posts/:id` with header `Authorization: Bearer <ADMIN_TOKEN>`

If `ADMIN_TOKEN` is not set, delete is disabled.

## Notes

- The database table is created automatically on first API call (`/api/posts`).
- The older filesystem-based server in `backend/` is **not used on Vercel** (Vercel storage replaces it).

