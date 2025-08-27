// server.js - simple static server for the glassmorphism site
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function safeJoin(base, target) {
  const resolved = path.join(base, target);
  if (!resolved.startsWith(base)) return null; // prevent path traversal
  return resolved;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let filePath = urlPath === "/" ? path.join(PUBLIC_DIR, "index.html") : safeJoin(PUBLIC_DIR, urlPath);

  if (!filePath) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    return res.end("Bad request");
  }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      // Fallback to index.html for unknown routes (SPA-like)
      const fallback = path.join(PUBLIC_DIR, "index.html");
      return fs.readFile(fallback, (e2, data) => {
        if (e2) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(data);
      });
    }

    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || "application/octet-stream";
    const stream = fs.createReadStream(filePath);
    stream.on("open", () => {
      res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=300" });
    });
    stream.on("error", () => {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    });
    stream.pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
