# My-Nodesite

Static portfolio with a tiny Node server, JSON projects API, and optional GitHub OAuth for admin access.

## Features

### 🎨 Multi-Theme System
- **Glassmorphism**: Dark gradient backgrounds with frosted glass effects and smooth animations
- **Neumorphism**: Light backgrounds with soft, extruded surfaces and subtle shadows  
- **Neo-Brutalism**: Bold, harsh aesthetics with sharp contrasts and geometric shapes
- Theme persistence across browser sessions
- Enhanced visual effects and custom animations for each theme

### 🔒 GitHub OAuth Authentication
Create an OAuth app at https://github.com/settings/developers and configure:
- **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
- Update `.env` file with your credentials

### 🗄️ Database Persistence
- PostgreSQL database with persistent storage
- Data survives container restarts and recreations
- Automatic table initialization

## Environment Variables

Set these in your `.env` file (copy from `.env.example`):

- `GITHUB_CLIENT_ID` - Your GitHub OAuth app client ID
- `GITHUB_CLIENT_SECRET` - Your GitHub OAuth app client secret  
- `ADMIN_GITHUB_USER` - GitHub username allowed to access /admin
- `SESSION_TTL_SECONDS` - Session timeout (default: 28800 = 8h)
- `OAUTH_REDIRECT_URI` - OAuth callback URL (default: http://localhost:3000/auth/github/callback)

## Quick Start

### With Docker Compose (Recommended)
```bash
# Copy and configure environment variables
cp .env.example .env
# Edit .env with your GitHub OAuth credentials

# Build and start services
docker compose up -d

# View logs
docker compose logs -f app
```

### Direct Node.js
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env as needed

# Start server
npm start
```

Then open http://localhost:3000 and click Sign In → Continue with GitHub.

## Theme System

The website supports three distinct visual themes:

1. **Glassmorphism** (Default)
   - Dark gradient backgrounds
   - Frosted glass effects with backdrop blur
   - Smooth hover animations and transitions
   - Purple/blue color scheme

2. **Neumorphism** 
   - Light gray backgrounds
   - Soft shadows and extruded surfaces
   - Gentle hover effects
   - Minimalist aesthetic

3. **Neo-Brutalism**
   - High contrast white/black design
   - Bold geometric shapes
   - Sharp shadows and harsh transitions
   - Vibrant accent colors

Themes can be switched using the theme selector in the top navigation and persist across browser sessions.

## Database Features

- **Persistent Storage**: Uses Docker volumes to maintain data across container restarts
- **Automatic Setup**: Tables are created automatically on first run
- **Projects API**: Full CRUD operations for project management
- **Metrics Tracking**: Page views and user analytics storage

## Development

The application structure:
```
My-Nodesite/
├── server.js          # Main server with OAuth, API, and database
├── public/            # Static assets
│   ├── index.html     # Main page with theme system
│   ├── styles.css     # Enhanced multi-theme CSS
│   ├── script.js      # Client-side theme switching
│   └── admin.html     # Admin interface (requires OAuth)
├── docker-compose.yml # PostgreSQL + App services  
├── Dockerfile        # App container definition
└── .env              # Environment configuration
```

## Docker Services

- **app**: Node.js application server
- **db**: PostgreSQL 16 with persistent volume
- **pgdata**: Named volume for database persistence

## Notes
- Uses `npm ci` when `package-lock.json` is present, else falls back to `npm install`
- Static files are served by `server.js`
- Theme switching works without JavaScript frameworks
- Database initialization is automatic and safe for restarts
