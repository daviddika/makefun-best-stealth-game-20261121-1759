// GHOSTLINE — tiny static server for local play-testing.
// Serves game/ at http://localhost:8080 with no build step.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";

const ROOT = new URL("./game/", import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8080);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (rel === "") rel = "index.html";
  const file = join(ROOT, normalize(rel));
  if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found\n");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});

server.listen(PORT, () => {
  console.log(`GHOSTLINE serving game/ at http://localhost:${PORT}`);
});
