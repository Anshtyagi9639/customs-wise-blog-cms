# Multi-Site Blog CMS: local proof of concept

A locally runnable prototype of the Multi-Site Blog CMS. It exists to test the whole publishing workflow (write, upload an image, preview, save a draft, publish, edit, unpublish) before any database, image host or hosting is paid for or configured.

**It runs only on this computer.** It is not connected to the live Customs Wise website or to Hostinger. Nothing you do here changes www.customswise.ie.

Records can be kept in **MongoDB Atlas** (when `MONGODB_URI` is set in `.env.local`) or, with nothing configured, in a local JSON file. See [docs/MONGODB_ATLAS.md](docs/MONGODB_ATLAS.md).

New images can be stored on **Cloudinary** (when the three `CLOUDINARY_*` settings are in `.env.local`) or, with nothing configured, in a local folder. See [docs/CLOUDINARY.md](docs/CLOUDINARY.md). Images already stored locally keep working either way.

**There is no sign-in.** Do not put this prototype on the internet as it is.

## Run it

Requires Node.js 20 or newer.

```
npm install
npm run sample-image        # creates test images in samples/
npm run build
npm run start
```

Then open:

| What | Address |
| --- | --- |
| Start page | http://127.0.0.1:3100 |
| CMS dashboard, Customs Wise test configuration | http://127.0.0.1:3100/admin/customs-wise |
| CMS dashboard, Demo Website (fictional) | http://127.0.0.1:3100/admin/demo-website |
| Local blog preview, Customs Wise | http://127.0.0.1:3100/sites/customs-wise/blog |
| Local blog preview, Demo Website | http://127.0.0.1:3100/sites/demo-website/journal |
| Read-only public API | http://127.0.0.1:3100/api/public/v1/sites/customs-wise/posts |
| Health check | http://127.0.0.1:3100/api/health |

`npm run dev` also works (slower pages, reloads when code changes). Stop the app with Ctrl+C.

Optional: `npm run import:customs-wise` copies the 20 existing Customs Wise blog posts and their images into the local CMS so the preview looks realistic. It only reads the website folder (`../customs-wise` by default) and is safe to run twice.

## Create and publish an article

1. Open the dashboard and choose the website in the **Website** box at the top left.
2. Choose **Create New Post**.
3. Enter the **Blog title**. The **URL slug** is filled in for you and can be changed.
4. Write the **Short summary**.
5. Under **Main article content**, add blocks: Heading, Paragraph, list, Quote, Call-out, Image. In text, `**bold**` makes bold text and `[link text](/services)` makes a link.
6. Under **Featured image**, choose **Upload image** (use `samples/sample-cover.png` for a test) and fill in **Image alt text**.
7. Choose a **Category** and an **Author**. Tags, FAQ, sources, SEO fields and the publication time are optional.
8. Choose the **Preview** tab to see the article in the website's style. Nothing is published by previewing.
9. Choose **Save draft**. The article is stored but not public.
10. Choose **Publish**. It now appears on the local blog preview; **View on website preview** opens it.
11. To change it, edit and choose **Update**. To take it down, choose **Unpublish**; **Publish** puts it back.

A publication time in the future schedules the article: it becomes public by itself at that time.

## Where things are stored

| What | Where |
| --- | --- |
| Articles, categories, authors, website settings, activity log | MongoDB (the database named in `MONGODB_DB`) when `MONGODB_URI` is set; otherwise `data/db.json` |
| Uploaded images | Cloudinary (`<website>/blog/`) when configured; otherwise `data/uploads/<website>/`. Images uploaded locally earlier stay there. |

`http://127.0.0.1:3100/api/health` shows which store is in use (`mongodb` or `json-file`) and where new images go (`cloudinary` or `local-folder`). Everything survives refreshes and restarts. The `data` folder is ignored by git. Set `CMS_DATA_DIR` in `.env.local` to keep it somewhere else.

To copy the JSON file's content into MongoDB: `npm run migrate:mongodb` (the JSON file is left untouched).

## Checks

```
npm run typecheck
npm run lint
npm run build
npm run test:workflow       # the app must be running with local images (CMS_IMAGES=local); 61 checks through the real API
npm run check:mongodb       # connection, write permission, indexes and slug uniqueness in MongoDB
npm run check:cloudinary    # are the Cloudinary settings present and accepted? (never prints them)
npm run test:cloudinary-mock  # 49 checks of the upload path against a stand-in for Cloudinary
npm run test:live           # end-to-end against the REAL MongoDB and Cloudinary in .env.local; cleans up with -- --cleanup
```

`npm run test:workflow` creates test articles, checks every step, and removes them again. With `-- --keep` it leaves them in place and prints a command that confirms they are still there after you restart the app.

## What is real and what is not

Real in this prototype: every button saves through the API to the store; validation of required fields, slugs, links and images; per-website separation of articles, categories, images and settings; drafts, publishing, scheduling, unpublishing; copying an article to another website as an independent draft; the read-only public API; generated HTML, SEO metadata, canonical addresses and structured data; an activity log.

**Not implemented (deliberately left for later):**

| Missing | Used instead here | Needed for production |
| --- | --- | --- |
| Sign-in, roles, permissions | None. Anyone who can open the page can edit. Changes from other websites' pages are refused, nothing more. | Authentication with roles, per-website permissions, rate limiting |
| Database | MongoDB through the official driver (`src/server/store-mongo.ts`), tested against a local MongoDB server; JSON file fallback (`src/server/store-json.ts`). Tested against a real Atlas cluster on 13 October 2026. | A restricted database user (the current one is `atlasAdmin`), reviewed network access rules, backups |
| Image hosting | Cloudinary through the official SDK (`src/server/cloudinary.ts`), tested with mocked responses and against a real account on 13 October 2026; local folder fallback (`src/server/media.ts`). Images are stored as uploaded, with no resizing. | Resized delivery, clean-up of unused images, a dedicated API key |
| Telling the website about new articles | Nothing | A signed webhook so the website refreshes its cached pages |
| The real website's header, footer and pages | Simplified stand-ins in the same style | The real website reading from the public API |
| Backups, monitoring, error reporting | None | Required before launch |
| Version history, editorial approval, media library screen | None | As planned in the requirements |

## How it is organised

```
src/lib/        types and content rules shared by the server and the browser (slugs, HTML, SEO, structured data)
src/server/     store.ts (storage entry point), store-mongo.ts, store-json.ts, media.ts (image checks and storage), cloudinary.ts, posts.ts (article rules), taxonomy.ts, seed.ts
src/app/admin/  the dashboard screens
src/app/api/admin/      the dashboard's API
src/app/api/public/v1/  the read-only API a website would read from, one path per website
src/app/sites/  the local public preview of each website
scripts/        sample image maker, importer, workflow test, MongoDB migration, connection check and local test server
```

Planning documents and the hosting readiness notes are in the Customs Wise website repository under `docs/blog-cms/`.
