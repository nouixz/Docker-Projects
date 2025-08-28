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

// Load environment variables from .env file
require('dotenv').config();

// Auto-generate SESSION_SECRET if not provided
if (!process.env.SESSION_SECRET) {
  console.warn('⚠️  WARNING: SESSION_SECRET not set! Using auto-generated secret.');
  console.warn('   For production, set SESSION_SECRET in .env file.');
  console.warn('   Run "npm run setup" to configure properly.\n');
  process.env.SESSION_SECRET = require('crypto').randomBytes(64).toString('hex');
}

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
const SESSION_SECRET = process.env.SESSION_SECRET; // Now guaranteed to exist

// Configuration validation and warnings
const config = {
  hasGitHubOAuth: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
  hasDatabase: !!DATABASE_URL,
  hasAdminUser: !!ADMIN_GITHUB_USER,
  isProduction: process.env.NODE_ENV === 'production'
};

// Show configuration status on startup
function showConfigStatus() {
  console.log('\n' + '='.repeat(50));
  console.log('🚀 My-Nodesite Configuration Status');
  console.log('='.repeat(50));
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`🔐 Session: ${SESSION_SECRET ? '✅ Configured' : '❌ Missing'}`);
  console.log(`👤 GitHub OAuth: ${config.hasGitHubOAuth ? '✅ Configured' : '⚠️  Not configured (limited features)'}`);
  console.log(`🗄️  Database: ${config.hasDatabase ? '✅ PostgreSQL' : '⚠️  File storage only'}`);
  console.log(`👮 Admin User: ${config.hasAdminUser ? `✅ ${ADMIN_GITHUB_USER}` : '⚠️  Any GitHub user'}`);
  console.log(`🏷️  Environment: ${process.env.NODE_ENV || 'development'}`);
  
  if (!config.hasGitHubOAuth) {
    console.log('\n💡 To enable GitHub OAuth admin features:');
    console.log('   1. Run: npm run setup');
    console.log('   2. Or manually configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env');
  }
  
  if (!config.hasDatabase) {
    console.log('\n💡 To enable PostgreSQL database:');
    console.log('   1. Configure DATABASE_URL in .env');
    console.log('   2. Or use Docker: docker-compose up');
  }
  
  console.log('='.repeat(50) + '\n');
}
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
  try {
    const result = path.join(base, target);
    const relative = path.relative(base, result);
    return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? result : null;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie;
  if (header) {
    header.split(';').forEach((cookie) => {
      let [name, ...rest] = cookie.split('=');
      name = name?.trim();
      if (name) {
        const value = rest.join('=').trim();
        if (value[0] === '"') {
          value = value.slice(1, -1);
        }
        cookies[name] = decodeURIComponent(value);
      }
    });
  }
  return cookies;
}

function redirect(res, location, cookies = []) {
  res.writeHead(302, {
    Location: location,
    'Set-Cookie': cookies,
  });
  res.end();
}

function serveLogin(res) {
  res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <!DOCTYPE html>
    <html>
    <head><title>Login Required</title></head>
    <body>
      <h1>Login Required</h1>
      <p><a href="/auth/github">Login with GitHub</a></p>
    </body>
    </html>
  `);
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
  try {
    pgClient = new Client({ connectionString: DATABASE_URL });
    await pgClient.connect();
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        repo_url TEXT,
        website_url TEXT,
        type TEXT,
        tags TEXT,
        status TEXT DEFAULT 'active',
        featured BOOLEAN DEFAULT false,
        image TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS views (
        day DATE NOT NULL,
        page TEXT NOT NULL,
        vid TEXT NOT NULL,
        PRIMARY KEY (day, page, vid)
      );
    `);
    console.log("[DB] Connected and tables ensured");
  } catch (err) {
    console.error("[DB] Error:", err);
    pgClient = null;
  }
}

async function readProjects() {
  if (pgClient) {
    const result = await pgClient.query(
      'SELECT id, name, description, repo_url as "repoUrl", website_url as "websiteUrl", type, status, featured, image, created_at as "createdAt", updated_at as "updatedAt", tags FROM projects ORDER BY updated_at DESC'
    );
    return result.rows;
  }
  await ensureDataFile();
  const data = await fsp.readFile(PROJECTS_FILE, "utf8");
  return JSON.parse(data);
}

async function writeProjects(list) {
  if (pgClient) {
    // For DB mode, we don't bulk-write; use individual INSERT/UPDATE
    return list;
  }
  await fsp.writeFile(PROJECTS_FILE, JSON.stringify(list, null, 2), "utf8");
  return list;
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', reject);
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
  return parts.join("; ");
}

function getSession(req) {
  const cookies = parseCookies(req);
  if (cookies.sid) {
    const s = sessions.get(cookies.sid);
    if (s && s.exp > Date.now()) return s;
  }
  return null;
}

// --- Minimal HTTPS JSON helpers ---
function httpsPostJSON(host, pathName, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(payload);
    const options = {
      hostname: host,
      port: 443,
      path: pathName,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": USER_AGENT,
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

function httpsGetJSON(host, pathName, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port: 443,
      path: pathName,
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
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

  // Enable CORS for API routes
  if (urlPath.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
  }

  // API routes
  if (urlPath === "/api/me") {
    return json(res, 200, { authed: isAuthed, user: session?.user });
  }

  // Configuration status API
  if (urlPath === "/api/config") {
    return json(res, 200, {
      hasGitHubOAuth: config.hasGitHubOAuth,
      hasDatabase: config.hasDatabase,
      hasAdminUser: config.hasAdminUser,
      isProduction: config.isProduction,
      version: require('./package.json').version || '1.0.0'
    });
  }

  // Setup status and guidance
  if (urlPath === "/api/setup") {
    const setupIssues = [];
    const recommendations = [];
    
    if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
      setupIssues.push('Weak or missing session secret');
      recommendations.push('Run "npm run setup" to generate secure session secret');
    }
    
    if (!config.hasGitHubOAuth) {
      recommendations.push('Configure GitHub OAuth for admin features');
    }
    
    if (!config.hasDatabase) {
      recommendations.push('Configure PostgreSQL for persistent storage');
    }
    
    return json(res, 200, {
      isFullyConfigured: setupIssues.length === 0 && config.hasGitHubOAuth,
      issues: setupIssues,
      recommendations: recommendations,
      setupCommands: [
        'npm run setup - Interactive setup wizard',
        'npm run docker:up - Start with Docker & PostgreSQL',
        'npm run dev - Start in development mode'
      ]
    });
  }

  // GitHub OAuth routes
  if (urlPath === "/auth/github") {
    if (!GITHUB_CLIENT_ID) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(`
        <!DOCTYPE html>
        <html>
        <head><title>GitHub OAuth Not Configured</title></head>
        <body>
          <h1>⚠️ GitHub OAuth Not Configured</h1>
          <p>GitHub OAuth is not set up for this application.</p>
          <h3>To enable GitHub authentication:</h3>
          <ol>
            <li>Run: <code>npm run setup</code></li>
            <li>Or manually configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env</li>
          </ol>
          <p><a href="/">← Back to Home</a></p>
        </body>
        </html>
      `);
    }
    const state = makeSid();
    oauthStates.add(state);
    const proto = (req.headers["x-forwarded-proto"] || "http").toString();
    const host = (req.headers.host || `localhost:${PORT}`);
    const redirectUri = process.env.OAUTH_REDIRECT_URI || `${proto}://${host}/auth/github/callback`;
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=read:user`;
    return redirect(res, authUrl);
  }

  if (urlPath === "/auth/github/callback") {
    (async () => {
    try {
      const [, qs] = (req.url || "").split("?");
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
    return;
  }

  // Logout
  if (req.method === "POST" && urlPath === "/auth/logout") {
    const sidCookie = cookie("sid", "", { maxAge: 0 });
    res.writeHead(200, { "Set-Cookie": sidCookie });
    return res.end();
  }

  // Projects API
  if (urlPath.startsWith("/api/projects")) {
    const pathParts = urlPath.split("/");
    const id = pathParts[3] || "";

    if (req.method === "GET" && !id) {
      return readProjects().then(list => json(res, 200, list))
        .catch(err => json(res, 500, { error: err.message }));
    }
    if (req.method === "POST" && !id) {
      if (!isAuthed) return json(res, 401, { error: "Unauthorized" });
      return parseBody(req).then(async (body) => {
        const projectId = body.id || crypto.randomUUID();
        const now = new Date().toISOString();
        const project = {
          id: projectId,
          name: body.name || "Untitled",
          description: body.description || "",
          repoUrl: body.repoUrl || "",
          websiteUrl: body.websiteUrl || "",
          type: body.type || "other",
          tags: Array.isArray(body.tags) ? body.tags : (body.tags ? body.tags.split(",") : []),
          status: body.status || "active",
          featured: Boolean(body.featured),
          image: body.image || "",
          createdAt: now,
          updatedAt: now,
        };

        if (pgClient) {
          const q = `insert into projects (id, name, description, repo_url, website_url, type, tags, status, featured, image, created_at, updated_at) 
                     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
                     returning id, name, description, repo_url as "repoUrl", website_url as "websiteUrl", type, status, featured, image, created_at as "createdAt", updated_at as "updatedAt", tags`;
          const values = [project.id, project.name, project.description, project.repoUrl, 
                          project.websiteUrl, project.type, project.tags.join(','), project.status, 
                          project.featured, project.image, project.createdAt, project.updatedAt];
          const result = await pgClient.query(q, values);
          return json(res, 201, result.rows[0]);
        } else {
          const list = await readProjects();
          list.unshift(project);
          await writeProjects(list);
          return json(res, 201, project);
        }
      }).catch(err => json(res, 400, { error: err.message }));
    }
    if (req.method === "PUT" && id) {
      if (!isAuthed) return json(res, 401, { error: "Unauthorized" });
      return parseBody(req).then(async (fields) => {
        if (pgClient) {
          let tags = fields.tags;
          if (Array.isArray(tags)) tags = tags.join(',');
          else if (typeof tags === 'string') tags = tags;
          else tags = undefined;
          const q = `update projects set 
            name=coalesce($2,name), description=coalesce($3,description), repo_url=coalesce($4,repo_url), website_url=coalesce($5,website_url),
            type=coalesce($6,type), tags=coalesce($7,tags), status=coalesce($8,status), featured=coalesce($9,featured), image=coalesce($10,image),
            updated_at=$11 where id=$1 returning id, name, description, repo_url as "repoUrl", website_url as "websiteUrl", type, status, featured, image, created_at as "createdAt", updated_at as "updatedAt", tags`;
          const values = [id, fields.name, fields.description, fields.repoUrl, fields.websiteUrl, 
                          fields.type, tags, fields.status, fields.featured, fields.image, new Date().toISOString()];
          const result = await pgClient.query(q, values);
          return json(res, 200, result.rows[0] || {});
        } else {
          const list = await readProjects();
          const idx = list.findIndex(p => p.id === id);
          if (idx === -1) return json(res, 404, { error: "Not found" });
          const existing = list[idx];
          const updated = { ...existing, ...fields, id, updatedAt: new Date().toISOString() };
          list[idx] = updated;
          await writeProjects(list);
          return json(res, 200, updated);
        }
      }).catch(err => json(res, 400, { error: err.message }));
    }
    if (req.method === "DELETE" && id) {
      if (!isAuthed) return json(res, 401, { error: "Unauthorized" });
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

  // Static file handling
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

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("Not found");
      }
      res.writeHead(200, { "Content-Type": type });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  showConfigStatus();
  console.log(`✅ Server running on http://localhost:${PORT}`);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`🔧 Setup: npm run setup`);
    console.log(`🐳 Docker: npm run docker:up`);
    console.log(`📝 Logs: npm run logs\n`);
  }
});