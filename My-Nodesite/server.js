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

// Env laden (nur wenn lokal/.env vorhanden)
require('dotenv').config();

// Fallback-DB-Init bereitstellen, falls im Code initDatabase() aufgerufen wird
let initDatabase = global.initDatabase;
if (typeof initDatabase !== 'function') {
  const useDb = process.env.DATABASE_URL || process.env.POSTGRES_HOST;
  initDatabase = async () => {
    if (!useDb) {
      console.warn('[db] Keine DB-Config gefunden. Überspringe DB-Init.');
      return;
    }
    const { Client } = require('pg');
    const connStr =
      process.env.DATABASE_URL ||
      `postgres://${process.env.POSTGRES_USER || 'postgres'}:${process.env.POSTGRES_PASSWORD || ''}` +
      `@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || 5432}` +
      `/${process.env.POSTGRES_DB || 'postgres'}`;

    const client = new Client({ connectionString: connStr });
    try {
      await client.connect();
      await client.query('SELECT 1');
      console.log('[db] Verbindung erfolgreich.');
    } catch (err) {
      console.error('[db] Verbindung fehlgeschlagen:', err.message);
    } finally {
      try { await client.end(); } catch {}
    }
  };
}

// Bestehende app nutzen oder neue erstellen
const app = typeof module !== 'undefined' && module.exports?.app ? module.exports.app : express();

app.set('trust proxy', true);

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Akzeptiere beide ENV-Namen
const CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL ||
  process.env.OAUTH_REDIRECT_URI ||
  `${BASE_URL}/auth/github/callback`;

app.use(session({
  secret: process.env.SESSION_SECRET || 'change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: 'lax', secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: CALLBACK_URL,
      scope: ['read:user', 'user:email']
    },
    (accessToken, refreshToken, profile, done) => {
      const user = {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        avatar: profile.photos?.[0]?.value
      };
      done(null, user);
    }
  ));
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  app.get('/auth/github', passport.authenticate('github'));
  app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/login.html' }),
    (req, res) => res.redirect('/')
  );
  app.post('/auth/logout', (req, res) => {
    req.logout(() => req.session.destroy(() => res.status(204).end()));
  });
  app.get('/api/me', (req, res) => {
    if (!req.user) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, user: req.user });
  });
} else {
  console.warn('GITHUB_CLIENT_ID/SECRET fehlen. GitHub-Login deaktiviert.');
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

server.listen(PORT, '0.0.0.0', () => console.log(`Server läuft auf ${BASE_URL}`));
