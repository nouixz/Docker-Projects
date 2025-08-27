# My-Nodesite

Static portfolio with a tiny Node server, JSON projects API, and optional GitHub OAuth for admin access.

## GitHub Login (optional)
Set these environment variables before starting:

- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET
- ADMIN_GITHUB_USER (GitHub username allowed to access /admin)
- SESSION_TTL_SECONDS (optional, default 28800 = 8h)
- OAUTH_REDIRECT_URI (optional, defaults to http://localhost:3000/auth/github/callback)

Create an OAuth app at https://github.com/settings/developers, set Authorization callback URL to your redirect URI.

## Run

```powershell
$env:GITHUB_CLIENT_ID = "<id>"; $env:GITHUB_CLIENT_SECRET = "<secret>"; $env:ADMIN_GITHUB_USER = "<your-username>"; npm start
```

Then open http://localhost:3000 and click Sign In → Continue with GitHub.
# My-Nodesite (Glassmorphism)

A minimal Node.js static server that hosts a glassmorphism demo site. Built to run in Docker.

## Run with Docker

Build the image and run a container mapping port 3000:

```powershell
# from My-Nodesite folder
docker build -t my-nodesite .
docker run --rm -p 3000:3000 my-nodesite
```

Then open http://localhost:3000 in your browser.

## Notes
- Uses `npm ci` when `package-lock.json` is present, else falls back to `npm install`.
- Static files live in `public/` and are served by `server.js`.
- See `.dockerignore` for build context hygiene.
