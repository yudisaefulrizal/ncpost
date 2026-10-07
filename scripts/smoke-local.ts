import assert from "node:assert/strict";
const origin = "http://127.0.0.1:8072";
const credentials = {
  email: process.env.NCPOST_EMAIL || "admin@gmail.com",
  password: process.env.NCPOST_PASSWORD || "admin123",
};
let r = await fetch(origin);
assert.equal(r.status, 200);
r = await fetch(origin + "/api/chapters");
assert.equal(r.status, 401);
r = await fetch(origin + "/api/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: "https://malicious.invalid",
  },
  body: JSON.stringify(credentials),
});
assert.equal(r.status, 403);
r = await fetch(origin + "/api/login", {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin },
  body: JSON.stringify(credentials),
});
assert.equal(r.status, 200);
const session = r.headers.get("set-cookie")?.split(";")[0];
assert(session);
const headers = { Cookie: session, Origin: origin };
r = await fetch(origin + "/api/chapters", { headers });
assert.equal(r.status, 200);
const rows = await r.json();
assert(Array.isArray(rows));
r = await fetch(origin + "/api/templates", { headers });
assert.equal(r.status, 200);
const templates = await r.json();
assert.deepEqual(
  templates.map((t: any) => t.id),
  ["1", "2", "4", "4B", "6"],
);
r = await fetch(origin + "/api/settings", { headers });
assert.equal(r.status, 200);
const settings = await r.json();
assert.equal(settings.tts.enabled, false);
assert(!JSON.stringify(settings).includes(credentials.password));
console.log(
  JSON.stringify(
    {
      home: 200,
      unauthenticated: 401,
      foreignOrigin: 403,
      authenticated: 200,
      chapters: rows.length,
      templates: templates.map((t: any) => t.id),
      tts: settings.tts,
      ncwa: settings.ncwa,
      reels: settings.reels,
      codex: settings.codex,
    },
    null,
    2,
  ),
);
