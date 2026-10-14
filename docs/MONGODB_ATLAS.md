# Using MongoDB Atlas with the CMS

The CMS keeps its records (websites, categories, authors, articles, image records, activity log) in MongoDB when a connection is configured. Uploaded image files still live in the local `data/uploads` folder; moving them to an image host is a separate, later task.

**Connecting to Atlas does not make the CMS ready for the internet.** There is still no sign-in and no per-website permissions. Anyone who can open the dashboard can edit everything. Keep it on this computer until authentication is built.

## Status

| | |
| --- | --- |
| MongoDB store, indexes, migration script | Built and tested against a real MongoDB 8.2 server running on this computer |
| Connection to an actual MongoDB Atlas cluster | **Tested on 13 October 2026** with the connection in `.env.local`, database `blog_cms`: connection, write permission, indexes, slug uniqueness, the migration, and a full create / edit / publish / restart / clean-up run through the CMS (`npm run test:live`). |
| Database user | Currently has the `atlasAdmin` role. That works but is far more than the CMS needs; see step 2 below. |

## What you need to set up in Atlas

Nothing here costs money on the free tier, but check the tier before creating anything.

1. A cluster (the free tier is enough for testing). Choose a region close to where the CMS will run.
2. A database user for the CMS only:
   - its own strong, generated password;
   - the built-in role **readWrite** on the one database the CMS uses (for example `blog_cms_dev`), and nothing else. Not `atlasAdmin`, not "read and write to any database".
3. Network access:
   - for testing from this computer, add this computer's current IP address only;
   - do **not** add `0.0.0.0/0` (allow from anywhere) unless the host has no fixed outbound address, and if you must, treat the password as the only protection and rotate it regularly.
4. Use a separate database (and ideally a separate user) for each environment, for example `blog_cms_dev` and `blog_cms_production`.

## Connect the CMS

1. Copy `.env.example` to `.env.local` in the project folder.
2. In `.env.local`, set `MONGODB_URI` to the connection string from Atlas (**Database > Connect > Drivers**) and `MONGODB_DB` to the database name.
3. Check the connection:

   ```
   npm run check:mongodb
   ```

   It reports whether the server answers, whether the user can write, and whether the database refuses duplicate slugs. It never prints the connection string.
4. Copy the existing content across (see below). A running `npm run dev` picks up `.env.local` changes by itself; a CMS started with `npm run start:local` must be restarted. `http://127.0.0.1:3100/api/health` shows `"store":"mongodb"` when the connection is in use.

`.env.local` is ignored by git. Do not paste the connection string into chats, tickets, screenshots or code.

If `MONGODB_URI` is empty, the CMS uses the JSON file `data/db.json` exactly as before. `CMS_STORE=json` forces that even when a connection string is present.

## Copy existing content from the JSON file

```
npm run migrate:mongodb -- --dry-run     # shows what would be copied; writes nothing
npm run migrate:mongodb                  # copies
```

- `data/db.json` is only read. It is never changed or deleted; the script compares its checksum before and after.
- A record is inserted only when no record with the same id exists. Records already in MongoDB are never overwritten, so running it again adds nothing and cannot undo later edits.
- If a different record already uses the same website and slug, that one record is refused and listed; everything else continues.
- Image files are not moved. Keep the `data/uploads` folder: the article records point at files in it.

Stop the CMS, or at least stop editing, while the migration runs, so the file and the database do not drift apart.

## How records are stored

| Collection | Holds | Rules enforced by the database |
| --- | --- | --- |
| `sites` | Website configurations | `key` is unique |
| `categories` | Categories, each belonging to one website | `siteId` + `slug` is unique |
| `authors` | Authors, with the websites they can write for | |
| `posts` | Articles, each belonging to one website | `siteId` + `slug` is unique (index `site_slug_unique`) |
| `media` | A record per uploaded image (not the file) | |
| `audit` | Activity log; only ever added to | |

A record's `id` is stored as MongoDB's `_id`. The public API returns `id`, as before; `_id` never appears in a response.

The application checks slugs before saving so it can give a clear message. The unique index is the guarantee: if two saves race, or two copies of the CMS run at once, the database refuses the second and the editor is told the slug has just been taken.

Scheduled articles need no background job: an article is public when its status is published and its publish time has passed, and that is evaluated on every read.

## Errors and privacy

- The connection string and database name are read on the server only. They are not in any `NEXT_PUBLIC_` variable and never reach the browser.
- When the database cannot be reached, the public API answers `503` with a generic message. The server log records only the kind of error (for example `MongoServerSelectionError`), never the address, user name or driver message.
- The dashboard's own API answers with an empty `500` in that situation; the editor sees a generic "could not be saved" message.

## Testing without Atlas

```
npm run mongo:local
```

starts a real MongoDB server on this computer (127.0.0.1 only, no password, data in `data/mongo-local`). The first run downloads the server program, about 780 MB, into this project's `node_modules/.cache`. Point the CMS at it with:

```
MONGODB_URI=mongodb://127.0.0.1:27018
MONGODB_DB=blog_cms_local_test
```

This is for testing the code. It says nothing about Atlas credentials, network rules or latency.

## Testing against the real services

```
npm run test:live                 # creates one clearly named test article and image per website
npm run test:live -- --verify     # after restarting the CMS: are they still there?
npm run test:live -- --cleanup    # removes exactly those articles, records and images again
```

The test names everything `ZZ LIVE TEST …` / `zz-live-test-…`, records the ids it created in `data/live-test.json`, and cleans up only those. Activity-log lines about the test stay.

`npm run test:workflow` refuses to run when images go to Cloudinary, so it cannot leave test images on a real account. To run it, start a CMS with `CMS_IMAGES=local` (and preferably the local test database).

## Known limits of this step

- **No sign-in or permissions.** Unchanged, and still required before any public deployment.
- **Whole data set per request.** The store loads every collection for each request and writes back only the records that changed. That kept this change small and every rule in one place. It is fine for tens or hundreds of articles; before the content grows large, reads should become targeted queries.
- **No multi-document transactions.** A save writes the record first and its activity-log line second. If the log write fails, the save still stands and the log line is missing.
- **Images are still local files.** A database on Atlas with images on one computer means the CMS still cannot be moved to a host without also moving `data/uploads`, or without the image host planned for later.
- **No backups configured.** Atlas backup options depend on the tier and have not been reviewed.
