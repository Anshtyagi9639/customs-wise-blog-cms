// A stand-in for Cloudinary's upload API, for automated tests only. It stores nothing and talks to nobody.
// The CMS is pointed at it with made-up account details: see the top of test-cloudinary-mock.mjs.
import { createServer } from "node:http";

/** Made-up values. They are not real account details and open nothing. */
export const MOCK = { cloudName: "cms-mock-not-real", apiKey: "123456789012345", apiSecret: "mock-secret-for-tests-only-0000", port: 3199 };

export function startMockCloudinary() {
  const state = { mode: "ok", delayMs: 0, uploads: [], destroyed: [] };

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const send = (status, body) =>
        setTimeout(() => {
          res.writeHead(status, { "Content-Type": "application/json" });
          res.end(JSON.stringify(body));
        }, state.delayMs);
      const boundary = /boundary=(.+)$/.exec(req.headers["content-type"] ?? "")?.[1];
      const fields = {};
      let fileBytes = 0;
      let format = "jpg";
      if (boundary) {
        for (const part of raw.toString("latin1").split(`--${boundary}`)) {
          const name = /name="([^"]+)"/.exec(part)?.[1];
          if (!name) continue;
          const value = part.slice(part.indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
          if (name === "file") {
            fileBytes = value.length;
            if (value.startsWith("\x89PNG")) format = "png";
          } else fields[name] = value;
        }
      } else Object.assign(fields, Object.fromEntries(new URLSearchParams(raw.toString("utf8"))));

      const cloud = /^\/v1_1\/([^/]+)\/image\/(upload|destroy)$/.exec(req.url ?? "");
      if (!cloud) return send(404, { error: { message: "unknown endpoint" } });
      if (cloud[2] === "destroy") {
        state.destroyed.push(fields.public_id);
        return send(200, { result: "ok" });
      }

      state.uploads.push({ cloud: cloud[1], fields, fileBytes, rawContainsSecret: raw.includes(MOCK.apiSecret) });
      // Error bodies deliberately contain account details, to prove the CMS does not pass Cloudinary's wording on.
      if (state.mode === "401") return send(401, { error: { message: `Invalid Signature abc. String to sign - 'x'. api_key ${fields.api_key} cloud ${cloud[1]}` } });
      if (state.mode === "500") return send(500, { error: { message: `General Error for cloud ${cloud[1]} api_key ${fields.api_key}` } });
      if (state.mode === "429") return send(420, { error: { message: "Rate Limit Exceeded" } });
      // "same-id": answers with one fixed public ID every time, so the second record collides in the database.
      if (state.mode === "same-id") fields.public_id = `${fields.public_id.split("/").slice(0, 2).join("/")}/fixed-id-for-collision-test`;
      const base = { asset_id: "mock", public_id: fields.public_id, version: 1, format, resource_type: "image", type: "upload", created_at: new Date().toISOString(), bytes: fileBytes, asset_folder: fields.asset_folder };
      const address = `res.cloudinary.com/${cloud[1]}/image/upload/v1/${fields.public_id}.${format}`;
      if (state.mode === "existing") return send(200, { ...base, existing: true, url: `http://${address}`, secure_url: `https://${address}` });
      if (state.mode === "no-https") return send(200, { ...base, url: `http://${address}`, secure_url: `http://${address}` });
      return send(200, { ...base, url: `http://${address}`, secure_url: `https://${address}` });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(MOCK.port, "127.0.0.1", () => resolve({ state, stop: () => new Promise((done) => server.close(done)) }));
  });
}
