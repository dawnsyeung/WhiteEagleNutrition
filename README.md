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

## Moderator delete

Public posts are permanent by default and can be removed only by moderators using a shared password.

- Default moderator password: `Remove`
- Optional override in Vercel env vars: `MODERATOR_PASSWORD = <your password>`
- Delete endpoint: `DELETE /api/posts/:id`
- Send moderator password in header:
  - `x-moderator-password: <password>`
  - (or `Authorization: Bearer <password>`)

## Notes

- The database table is created automatically on first API call (`/api/posts`).
- The older filesystem-based server in `backend/` is **not used on Vercel** (Vercel storage replaces it).

