# Docker-Projects Repository

Docker-Projects is a collection of containerized applications, primarily featuring **My-Nodesite** - a Node.js portfolio website with GitHub OAuth authentication, PostgreSQL database integration, and modern glassmorphism UI design.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

### Bootstrap and Build
- Navigate to the My-Nodesite project: `cd My-Nodesite`
- Copy environment configuration: `cp .env.example .env`
- **Docker Compose Method (Recommended)**:
  - `docker compose build` -- NEVER CANCEL: Build takes 75 seconds (1 minute 15 seconds). Set timeout to 120+ seconds.
  - `docker compose up -d` -- starts services in 10 seconds
  - `docker compose logs -f app` -- view application logs
- **Direct Node.js Method**:
  - `npm install` -- installs dependencies in 5 seconds
  - `npm start` -- starts server on http://localhost:3000

### Environment Configuration
- **CRITICAL**: Edit `.env` file with proper values for full functionality:
  - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for OAuth (optional for basic testing)
  - `ADMIN_GITHUB_USER` for admin access control
  - `DATABASE_URL` automatically configured for Docker Compose
  - PostgreSQL credentials in Docker Compose: username `app`, password `app`, database `appdb`

### Testing and Validation
- Application runs successfully on `http://localhost:3000`
- **ALWAYS test functionality** after making changes:
  - Load homepage and verify UI renders correctly
  - Test navigation between different sections
  - Verify API endpoints at `/api/projects` and `/api/me`
  - For OAuth features: test GitHub authentication flow (requires valid OAuth credentials)
- No existing test framework - manual validation is required
- No linting configuration exists - follow existing code style

## Timing and Performance Expectations
- **Docker build**: 75 seconds (NEVER CANCEL - set 120+ second timeout)
- **Docker startup**: 10 seconds after build
- **npm install**: 5 seconds  
- **Application startup**: Immediate after dependencies loaded
- **Database connection**: Auto-retry with exponential backoff (up to 30 seconds)

## Application Architecture

### My-Nodesite Structure
```
My-Nodesite/
├── server.js          # Main Node.js server with OAuth, API, database
├── package.json       # Dependencies: dotenv, pg
├── docker-compose.yml # App + PostgreSQL services
├── Dockerfile        # Node.js 18 Alpine container
├── .env.example      # Environment template
├── public/           # Static frontend assets
│   ├── index.html    # Main portfolio page
│   ├── admin.html    # Admin interface (OAuth protected)
│   ├── styles.css    # Glassmorphism CSS themes
│   └── script.js     # Client-side JavaScript
└── data/            # JSON data storage (when not using PostgreSQL)
```

### Key Features
- **GitHub OAuth Integration**: Authentication and admin access control
- **PostgreSQL Database**: User sessions, analytics, project data
- **Multi-Theme UI**: Glassmorphism design with theme switching
- **Projects API**: CRUD operations for portfolio projects
- **Analytics**: Page views and user metrics tracking
- **Responsive Design**: Modern CSS with Tailwind integration

## Development Commands

### Docker Operations
- `docker compose up -d` -- start services in background
- `docker compose down` -- stop and remove containers  
- `docker compose logs app` -- view application logs
- `docker compose ps` -- check running services
- `docker compose build --no-cache` -- force rebuild

### Direct Node.js Operations  
- `npm install` -- install dependencies
- `npm start` -- start development server
- `node server.js` -- direct server execution

### Database Access
- PostgreSQL runs on `localhost:5432` when using Docker Compose
- Connect using: username `app`, password `app`, database `appdb`
- Tables auto-created on first run: `views`, `sessions`

## Common Issues and Solutions

### Build Problems
- If Docker build fails: `docker compose down && docker compose build --no-cache`
- If npm install fails: delete `node_modules` and `package-lock.json`, then retry
- If ports are busy: change PORT in `.env` or stop conflicting services

### Runtime Issues
- Database connection failures: Check PostgreSQL container status with `docker compose ps`
- OAuth errors: Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env`
- Missing dependencies: Run `npm install` in My-Nodesite directory

### Development Workflow
1. Always start with `cd My-Nodesite`
2. Copy and configure `.env` from `.env.example`
3. Use Docker Compose for full-stack development (recommended)
4. Use direct Node.js for quick backend-only testing
5. Test manually by loading http://localhost:3000
6. Check logs with `docker compose logs app` for debugging

## Important Notes
- **NEVER CANCEL Docker builds** - they take 75+ seconds and interruption causes incomplete images
- **Always validate changes** by loading the application and testing core functionality
- **Database persistence** - Docker volumes maintain data between restarts
- **No test automation** exists - rely on manual validation and functional testing
- **External CDN dependencies** - some UI features require internet access (fonts, Tailwind, icons)
- **Single project focus** - this repository primarily contains My-Nodesite with potential for additional Docker projects

## Quick Reference

### Essential File Contents
```bash
# View repository structure
ls -la
# Result: .git, .gitignore, My-Nodesite/

# View My-Nodesite structure  
ls -la My-Nodesite/
# Result: server.js, package.json, docker-compose.yml, Dockerfile, public/, data/, .env.example

# View package.json
cat My-Nodesite/package.json
# Dependencies: dotenv@^16.6.1, pg@^8.11.5
# Scripts: start -> node server.js
```

### Environment Variables Reference
- `PORT=3000` (default)
- `DATABASE_URL=postgres://app:app@db:5432/appdb` (Docker Compose default)
- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` (for OAuth)
- `ADMIN_GITHUB_USER` (username for admin access)
- `SESSION_TTL_SECONDS=28800` (8 hour default)