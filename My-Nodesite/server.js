// server.js - simple static server with minimal auth, projects API, and GitHub OAuth login
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const { Client } = (() => {
  try { return require('pg'); } catch { return { Client: null }; }
})();
const path = require("path");
const fsp = fs.promises;

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const DATABASE_URL = process.env.DATABASE_URL || "";
let pgClient = null;

// OAuth and session config (set via environment variables)
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const ADMIN_GITHUB_USER = (process.env.ADMIN_GITHUB_USER || "").toLowerCase();
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 60 * 60 * 8); // 8h default
const USER_AGENT = process.env.USER_AGENT || "My-Nodesite/1.0";
// In-memory session and state stores (sufficient for single-instance, demo-scale)
const sessions = new Map(); // sid -> { user, exp }
const oauthStates = new Set();

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

function parseCookies(req) {
  const header = req.headers["cookie"] || "";
  return header.split(/;\s*/).reduce((acc, cur) => {
    const [k, v] = cur.split("=");
    if (k) acc[k.trim()] = decodeURIComponent(v || "");
    return acc;
  }, {});
}

function redirect(res, location, cookies = []) {
  res.writeHead(302, { Location: location, "Set-Cookie": cookies });
  res.end();
}

function serveLogin(res) {
  const loginPath = path.join(PUBLIC_DIR, "login.html");
  fs.readFile(loginPath, (e, data) => {
    if (e) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end("Login page missing");
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
    res.end(data);
  });
}

async function ensureDataFile() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.access(PROJECTS_FILE, fs.constants.F_OK);
  } catch {
    const now = new Date().toISOString();
    const seed = [
      {
        id: "sample-website",
        name: "Sample Portfolio Site",
        description: "A demo personal website template with Tailwind and glass UI.",
        repoUrl: "https://github.com/you/portfolio",
        websiteUrl: "https://example.com",
        type: "web",
        tags: ["tailwind", "vanilla", "ui"],
        status: "active",
        createdAt: now,
        updatedAt: now,
        featured: true
      }
    ];
    await fsp.writeFile(PROJECTS_FILE, JSON.stringify(seed, null, 2), "utf8");
  }
}

async function initDatabase() {
  if (!DATABASE_URL || !Client) return false;
  if (!pgClient) {
    pgClient = new Client({ connectionString: DATABASE_URL });
    await pgClient.connect();
  }
  await pgClient.query(`
    create table if not exists projects (
      id text primary key,
      name text not null,
      description text default '',
      repo_url text default '',
      website_url text default '',
      type text default 'other',
      tags text default '',
      status text default 'active',
      featured boolean default false,
      image text default '',
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
  await pgClient.query(`
    create table if not exists metrics_daily (
      day date not null,
      page text not null,
      views integer not null default 0,
      uniques integer not null default 0,
      primary key (day, page)
    );
  `);
  await pgClient.query(`
    create table if not exists metrics_uniques (
      day date not null,
      page text not null,
      vid text not null,
      primary key (day, page, vid)
    );
  `);
  return true;
}

async function readProjects() {
  if (pgClient) {
    const { rows } = await pgClient.query('select id, name, description, repo_url as "repoUrl", website_url as "websiteUrl", type, status, featured, image, created_at as "createdAt", updated_at as "updatedAt", tags from projects order by created_at desc');
    return rows.map(r => ({ ...r, tags: r.tags ? r.tags.split(/[,\s]+/).filter(Boolean) : [] }));
  }
  await ensureDataFile();
  const text = await fsp.readFile(PROJECTS_FILE, 'utf8');
  return JSON.parse(text || '[]');
}

async function writeProjects(list) {
  if (pgClient) {
    // Not used with SQL path
    return;
  }
  await fsp.writeFile(PROJECTS_FILE, JSON.stringify(list, null, 2), 'utf8');
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 5e6) { reject(new Error("Body too large")); req.destroy(); } });
    req.on("end", () => {
      const type = req.headers["content-type"] || "";
      try {
        if (type.includes("application/json")) {
          resolve(JSON.parse(body || "{}"));
        } else if (type.includes("application/x-www-form-urlencoded")) {
          resolve(Object.fromEntries(new URLSearchParams(body)));
        } else {
          resolve({ raw: body });
        }
      } catch (e) { reject(e); }
    });
  });
}

// --- Simple session helpers ---
function makeSid() {
  return crypto.randomBytes(16).toString("hex");
}
function cookie(name, val, opts = {}) {
  const parts = [
    `${name}=${encodeURIComponent(val)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  // Don't set Secure by default to allow local http; enable via proxy/https in production
  return parts.join("; ");
}
function getSession(req) {
  const cookies = parseCookies(req);
  if (cookies.sid) {
    const s = sessions.get(cookies.sid);
    if (s && s.exp > Date.now()) return s;
  }
  // Legacy fallback (simple password form)
  if (cookies.session === "1") return { user: { provider: "local", name: "admin" }, legacy: true };
  return null;
}

// --- Minimal HTTPS JSON helpers ---
function httpsPostJSON(host, pathName, payload, headers = {}) {
  const body = JSON.stringify(payload);
  const options = {
    host,
    method: "POST",
    path: pathName,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "User-Agent": USER_AGENT,
      ...headers,
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        try {
          const json = JSON.parse(data || "{}");
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
function httpsGetJSON(host, pathName, headers = {}) {
  const options = {
    host,
    method: "GET",
    path: pathName,
    headers: {
      "Accept": "application/json",
      "User-Agent": USER_AGENT,
      ...headers,
    },
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => {
        try {
          const json = JSON.parse(data || "{}");
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// Boot DB if configured
initDatabase().catch(err => console.error('DB init error', err));

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split("?")[0]);
  const cookies = parseCookies(req);
  const session = getSession(req);
  const isAuthed = Boolean(session);

  // Email/password login removed; use GitHub OAuth only

  // Logout clears cookies and server-side session
  if (req.method === "GET" && urlPath === "/logout") {
    const expired = `session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
    const expiredSid = `sid=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
    if (cookies.sid) sessions.delete(cookies.sid);
    return redirect(res, "/login", [expired, expiredSid]);
  }

  // Login route now redirects to home with a flag; client shows modal
  if (req.method === "GET" && (urlPath === "/login" || urlPath === "/login.html")) {
    if (isAuthed) return redirect(res, "/");
    return redirect(res, "/?login=1");
  }

  // --- GitHub OAuth: start login ---
  if (req.method === "GET" && urlPath === "/auth/github/login") {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      return res.end("GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
    }
    const state = crypto.randomBytes(8).toString("hex");
    oauthStates.add(state);
    const proto = (req.headers["x-forwarded-proto"] || "http").toString();
    const host = (req.headers.host || `localhost:${PORT}`);
    const redirectUri = process.env.OAUTH_REDIRECT_URI || `${proto}://${host}/auth/github/callback`;
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("read:user user:email")}&state=${encodeURIComponent(state)}`;
    return redirect(res, authUrl);
  }

  // --- GitHub OAuth: callback ---
  if (req.method === "GET" && urlPath === "/auth/github/callback") {
    (async () => {
      try {
      const qs = (req.url.split("?")[1] || "");
      const params = new URLSearchParams(qs);
      const code = params.get("code");
      const state = params.get("state");
      if (!code || !state || !oauthStates.has(state)) {
        return redirect(res, "/?login=1&error=oauth_state");
      }
      oauthStates.delete(state);

      const proto = (req.headers["x-forwarded-proto"] || "http").toString();
      const host = (req.headers.host || `localhost:${PORT}`);
      const redirectUri = process.env.OAUTH_REDIRECT_URI || `${proto}://${host}/auth/github/callback`;

      // Exchange code for access token
  const tokenResp = await httpsPostJSON(
        "github.com",
        "/login/oauth/access_token",
        {
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
        },
        { Accept: "application/json" }
      );
      const accessToken = tokenResp.access_token;
      if (!accessToken) return redirect(res, "/?login=1&error=oauth_token");

      // Fetch GitHub user
  const ghUser = await httpsGetJSON(
        "api.github.com",
        "/user",
        { Authorization: `Bearer ${accessToken}` }
      );
      const username = (ghUser && ghUser.login) ? String(ghUser.login) : "";
      if (!username) return redirect(res, "/?login=1&error=oauth_user");

      if (ADMIN_GITHUB_USER && username.toLowerCase() !== ADMIN_GITHUB_USER) {
        return redirect(res, "/?login=1&error=unauthorized");
      }

      // Create session
      const sid = makeSid();
      sessions.set(sid, {
        user: { provider: "github", username, id: ghUser.id, avatar: ghUser.avatar_url || "" },
        exp: Date.now() + SESSION_TTL_SECONDS * 1000,
      });
      const sidCookie = cookie("sid", sid, { maxAge: SESSION_TTL_SECONDS });
      return redirect(res, "/", [sidCookie]);
    } catch (e) {
      return redirect(res, "/?login=1&error=oauth_error");
    }
    })();
    return; // prevent fall-through while async IIFE runs
  }

  // --- Current user session info ---
  if (req.method === "GET" && urlPath === "/api/me") {
    if (!session) return json(res, 200, { authed: false });
    const user = session.user || null;
    return json(res, 200, { authed: true, user });
  }

  // --- Website analytics (simple daily counters) ---
  if (req.method === "POST" && urlPath === "/api/metrics/view") {
    (async () => {
      try {
        const body = await parseBody(req);
        const page = (body.page || 'home').toString().slice(0, 64);
        const vidCookie = parseCookies(req).vid;
        const vid = vidCookie && vidCookie.length > 0 ? vidCookie : crypto.randomBytes(12).toString('hex');
        const today = new Date();
        const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
        const dayStr = day.toISOString().slice(0,10);
        let setCookies = [];
        if (!vidCookie) setCookies.push(cookie('vid', vid, { maxAge: 60*60*24*365 }));
        if (pgClient) {
          await pgClient.query('insert into metrics_daily(day,page,views,uniques) values ($1,$2,0,0) on conflict (day,page) do nothing', [dayStr, page]);
          await pgClient.query('update metrics_daily set views = views + 1 where day=$1 and page=$2', [dayStr, page]);
          const u = await pgClient.query('insert into metrics_uniques(day,page,vid) values ($1,$2,$3) on conflict do nothing', [dayStr, page, vid]);
          if (u.rowCount > 0) {
            await pgClient.query('update metrics_daily set uniques = uniques + 1 where day=$1 and page=$2', [dayStr, page]);
          }
        }
        res.writeHead(204, { 'Set-Cookie': setCookies });
        res.end();
      } catch (e) {
        json(res, 500, { error: 'metrics_failed' });
      }
    })();
    return;
  }
  if (req.method === "GET" && urlPath === "/api/metrics/summary") {
    (async () => {
      try {
        const q = new URL('http://x' + (req.url || '')).searchParams;
        const days = Math.max(1, Math.min(365, Number(q.get('days')||60)));
        const end = new Date();
        const start = new Date();
        start.setUTCDate(end.getUTCDate() - (days-1));
        const labels = [];
        for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); d <= end; d.setUTCDate(d.getUTCDate()+1)) {
          labels.push(d.toISOString().slice(0,10));
        }
        let views = new Array(labels.length).fill(0);
        let uniques = new Array(labels.length).fill(0);
        let pages = {};
        if (pgClient) {
          const { rows } = await pgClient.query('select day, page, views, uniques from metrics_daily where day between $1 and $2', [labels[0], labels[labels.length-1]]);
          rows.forEach(r => {
            const i = labels.indexOf(r.day.toISOString().slice(0,10));
            if (i >= 0) {
              views[i] += Number(r.views||0);
              uniques[i] += Number(r.uniques||0);
            }
            pages[r.page] = (pages[r.page]||0) + Number(r.views||0);
          });
        }
        const topPages = Object.entries(pages).sort((a,b)=>b[1]-a[1]).slice(0,6);
        return json(res, 200, { labels, views, uniques, pages: topPages });
      } catch (e) {
        return json(res, 200, { labels: [], views: [], uniques: [], pages: [] });
      }
    })();
    return;
  }

  // API routes for projects
  if (urlPath.startsWith("/api/projects")) {
    const parts = urlPath.split("/").filter(Boolean); // ["api","projects",":id?"]
    const id = parts[2];
    if (req.method === "GET" && !id) {
      return readProjects().then(list => json(res, 200, list)).catch(err => json(res, 500, { error: err.message }));
    }
    if (req.method === "GET" && id) {
      return readProjects().then(list => {
        const item = list.find(p => p.id === id);
        if (!item) return json(res, 404, { error: "Not found" });
        return json(res, 200, item);
      }).catch(err => json(res, 500, { error: err.message }));
    }
    // Mutations require auth
    if (!isAuthed) {
      return json(res, 401, { error: "Unauthorized" });
    }
    if (req.method === "POST" && !id) {
      return parseBody(req).then(async (data) => {
        const now = new Date().toISOString();
        const newItem = {
          id: (data.id || `${Date.now()}`).toString().toLowerCase().replace(/[^a-z0-9-_]/g, "-"),
          name: data.name || "Untitled",
          description: data.description || "",
          repoUrl: data.repoUrl || "",
          websiteUrl: data.websiteUrl || "",
          type: data.type || "other",
          tags: Array.isArray(data.tags) ? data.tags : (data.tags ? String(data.tags).split(/[\,\s]+/).filter(Boolean) : []),
          status: data.status || "active",
          createdAt: now,
          updatedAt: now,
          featured: Boolean(data.featured),
          image: data.image || ""
        };
        if (pgClient) {
          await pgClient.query(
            'insert into projects (id,name,description,repo_url,website_url,type,tags,status,featured,image,created_at,updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict (id) do nothing',
            [newItem.id,newItem.name,newItem.description,newItem.repoUrl,newItem.websiteUrl,newItem.type,(newItem.tags||[]).join(','),newItem.status,newItem.featured,newItem.image,newItem.createdAt,newItem.updatedAt]
          );
        } else {
          const list = await readProjects();
          list.push(newItem);
          await writeProjects(list);
        }
        return json(res, 201, newItem);
      }).catch(err => json(res, 400, { error: err.message }));
    }
    if ((req.method === "PUT" || req.method === "PATCH") && id) {
      return parseBody(req).then(async (data) => {
        if (pgClient) {
          const now = new Date().toISOString();
          const fields = { ...data };
          // Normalize tags
          let tags = fields.tags;
          if (Array.isArray(tags)) tags = tags.join(',');
          else if (typeof tags === 'string') tags = tags;
          else tags = undefined;
          const q = `update projects set 
            name=coalesce($2,name), description=coalesce($3,description), repo_url=coalesce($4,repo_url), website_url=coalesce($5,website_url),
            type=coalesce($6,type), tags=coalesce($7,tags), status=coalesce($8,status), featured=coalesce($9,featured), image=coalesce($10,image),
            updated_at=$11 where id=$1 returning id, name, description, repo_url as "repoUrl", website_url as "websiteUrl", type, status, featured, image, created_at as "createdAt", updated_at as "updatedAt", tags`;
          const vals = [id, fields.name ?? null, fields.description ?? null, fields.repoUrl ?? null, fields.websiteUrl ?? null, fields.type ?? null, (tags ?? null), fields.status ?? null, (typeof fields.featured === 'boolean' ? fields.featured : null), fields.image ?? null, now];
          const r = await pgClient.query(q, vals);
          if (!r.rows.length) return json(res, 404, { error: 'Not found' });
          const row = r.rows[0];
          row.tags = row.tags ? row.tags.split(/[\,\s]+/).filter(Boolean) : [];
          return json(res, 200, row);
        } else {
          const list = await readProjects();
          const idx = list.findIndex(p => p.id === id);
          if (idx === -1) return json(res, 404, { error: 'Not found' });
          list[idx] = { ...list[idx], ...data, id, updatedAt: new Date().toISOString() };
          await writeProjects(list);
          return json(res, 200, list[idx]);
        }
      }).catch(err => json(res, 400, { error: err.message }));
    }
    if (req.method === "DELETE" && id) {
      if (pgClient) {
        return pgClient.query('delete from projects where id=$1', [id])
          .then(() => json(res, 204, {}))
          .catch(err => json(res, 500, { error: err.message }));
      }
      return readProjects().then(async (list) => {
        const next = list.filter(p => p.id !== id);
        await writeProjects(next);
        return json(res, 204, {});
      }).catch(err => json(res, 500, { error: err.message }));
    }
    return json(res, 405, { error: "Method not allowed" });
  }

  // Legacy admin route now redirects to home where inline editing exists
  if (req.method === "GET" && urlPath === "/admin") {
    return redirect(res, "/");
  }

  // Static file handling for authenticated users
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
