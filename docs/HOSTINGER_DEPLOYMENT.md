# Deploying the CMS as a Node.js app (Hostinger)

> **Do not deploy the CMS publicly yet.** It has no sign-in. Anyone who finds the address could edit or publish articles in MongoDB Atlas and upload images to the Cloudinary account. Sign-in and per-website permissions must be built first, or the app must be kept unreachable from the internet.

This guide records what the app needs from a Node.js host. It has not been deployed, and Hostinger's support for a second Node.js app on the current plan has not been confirmed.

## What the app is

A Next.js 16 server application (TypeScript, React 19) with server-side API routes, MongoDB Atlas through the official driver, and server-side Cloudinary uploads. It must run as a Node.js app. It cannot be a static website: there is no static export, and none should be added.

## Settings for the host

| Setting | Value |
| --- | --- |
| Framework / app type | Next.js (Node.js app), not "static website" |
| Repository root | The repository root (`package.json` is there) |
| Node.js version | 20.19 or newer (22 LTS is fine). Required by the MongoDB driver; recorded in `package.json` `engines`. |
| Install command | `npm ci` (uses the committed `package-lock.json`; development packages are needed for the build) |
| Build command | `npm run build` (runs `next build --webpack`; Turbopack is avoided on purpose, it failed on Hostinger for the website) |
| Start command | `npm run start` (runs `next start`, which listens on the `PORT` the host provides; 3000 if none) |
| Output directory | Leave empty / default. Do not set `out`. |

## Environment variables to set in the host's panel

Never commit these. Enter them in the hosting panel only.

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | The Atlas connection string (a database user with only `readWrite` on the CMS database is recommended) |
| `MONGODB_DB` | `blog_cms` |
| `CMS_STORE` | `mongodb`. Makes the app fail clearly if the database settings are missing, instead of quietly starting an empty JSON store on the server. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | From Cloudinary, Settings > API Keys |
| `CMS_PUBLIC_URL` | The CMS's own public address, for example `https://cms.example.com` (used for absolute image addresses in structured data) |

Atlas must allow connections from the host: add its outbound IP address under Atlas **Network Access**. If the host has no fixed outbound address, the alternatives and their risks are in `docs/MONGODB_ATLAS.md`.

After deploying, `https://<cms address>/api/health` should show `"store":"mongodb"` and `"images":"cloudinary"`.

## Known problems before a deployment is useful

- **No sign-in** (see the top of this page).
- **Images of the 20 imported Customs Wise articles are local files** in `data/uploads`, which is not in the repository and would not exist on the server. Those articles would show broken images until their images are moved to Cloudinary. New uploads go to Cloudinary and are unaffected.
- **Local uploads are not persistent on most hosts.** With Cloudinary configured nothing new is written locally, but `CMS_IMAGES=local` must not be used on a server.
- **The install includes development tools** (TypeScript, Tailwind, ESLint, and a test-database package whose 780 MB download is switched off in `package.json`). They are needed for the build.
