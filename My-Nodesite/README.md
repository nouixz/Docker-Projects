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
