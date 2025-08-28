# My-Nodesite 🚀

A modern, lightweight Node.js portfolio website with GitHub OAuth authentication, project management, and PostgreSQL support. Perfect for showcasing your projects with a clean, professional interface.

## ✨ Features

- 🎨 **Modern UI** - Clean, responsive design with glass morphism effects
- 🔐 **GitHub OAuth** - Secure admin authentication (optional)
- 📊 **Project Management** - CRUD operations for your portfolio projects
- 🗄️ **Flexible Storage** - File-based or PostgreSQL database
- 🐳 **Docker Ready** - One-command deployment with Docker Compose
- ⚡ **Zero Config** - Works out of the box with sensible defaults
- 🔒 **Secure** - Auto-generated session secrets and security headers

## 🚀 Quick Start

### Option 1: Automatic Setup (Recommended)

```bash
# Clone the repository
git clone <your-repo-url>
cd My-Nodesite

# Install dependencies
npm install

# Run interactive setup
npm run setup

# Start the application
npm start
```

Visit `http://localhost:3000` - that's it! 🎉

### Option 2: Manual Configuration

```bash
# Clone and install
git clone <your-repo-url>
cd My-Nodesite
npm install

# Create configuration
cp .env.example .env
# Edit .env with your settings

# Start the application
npm start
```

### Option 3: Docker Deployment

```bash
# Clone the repository
git clone <your-repo-url>
cd My-Nodesite

# Start with Docker (includes PostgreSQL)
npm run docker:up

# View logs
npm run logs
```

## 📋 Commands

| Command | Description |
|---------|-------------|
| `npm run setup` | Interactive setup wizard |
| `npm start` | Start the application |
| `npm run dev` | Start in development mode |
| `npm run docker:up` | Start with Docker Compose |
| `npm run docker:down` | Stop Docker services |
| `npm run logs` | View application logs |

## ⚙️ Configuration

The application works with minimal configuration but can be fully customized:

### Required (Auto-generated if missing)
- `SESSION_SECRET` - Session security key

### Optional Enhancements
- **GitHub OAuth** - Admin authentication
- **PostgreSQL** - Persistent database storage
- **Custom Domain** - Production deployment

### Environment Variables

```bash
# Server Configuration
NODE_ENV=development          # Environment mode
HOST=0.0.0.0                 # Server host
PORT=3000                    # Server port
BASE_URL=http://localhost:3000 # Application URL

# Security
SESSION_SECRET=auto-generated  # Session encryption key
SESSION_TTL_SECONDS=28800     # Session timeout (8 hours)

# GitHub OAuth (Optional)
GITHUB_CLIENT_ID=             # Your GitHub OAuth App ID
GITHUB_CLIENT_SECRET=         # Your GitHub OAuth App Secret
ADMIN_GITHUB_USER=            # Restrict admin to specific user

# Database (Optional - file storage used if not configured)
DATABASE_URL=postgres://user:pass@host:5432/db
```

## 🔐 GitHub OAuth Setup

GitHub OAuth enables admin features for project management. It's optional but recommended.

### Step 1: Create GitHub OAuth App

1. Go to [GitHub OAuth Apps](https://github.com/settings/applications/new)
2. Fill in the details:
   - **Application name**: My-Nodesite (or your preferred name)
   - **Homepage URL**: `http://localhost:3000` (or your domain)
   - **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
3. Click "Register application"

### Step 2: Configure Application

Run the setup wizard:
```bash
npm run setup
```

Or manually add to `.env`:
```bash
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
ADMIN_GITHUB_USER=your_github_username  # Optional: restrict admin access
```

### Step 3: Test Authentication

1. Start the application: `npm start`
2. Visit `http://localhost:3000`
3. Click "Login with GitHub"
4. Authorize the application

## 🗄️ Database Setup

The application supports both file-based storage and PostgreSQL:

### File Storage (Default)
- ✅ **No setup required**
- ✅ **Perfect for development**
- ✅ **Portable data files**
- ❌ Limited concurrent access

### PostgreSQL (Recommended for Production)

#### Option 1: Docker (Easiest)
```bash
npm run docker:up
```

#### Option 2: Local PostgreSQL
```bash
# Install PostgreSQL locally
# Create database and user
# Configure DATABASE_URL in .env

DATABASE_URL=postgres://username:password@localhost:5432/my_nodesite
```

#### Option 3: Hosted PostgreSQL
```bash
# Use services like:
# - Heroku Postgres
# - AWS RDS
# - Google Cloud SQL
# - DigitalOcean Managed Databases

DATABASE_URL=postgres://user:pass@your-host:5432/dbname
```

## 🐳 Docker Deployment

### Development with Docker

```bash
# Start all services (app + database)
npm run docker:up

# View logs
npm run logs

# Stop services
npm run docker:down
```

### Production Docker

```bash
# Build for production
NODE_ENV=production npm run docker:build

# Deploy with custom environment
cp .env.example .env.prod
# Edit .env.prod with production values

docker-compose --env-file .env.prod up -d
```

## 📁 Project Structure

```
My-Nodesite/
├── 📄 server.js           # Main application server
├── 🔧 setup.js            # Interactive setup wizard  
├── 📦 package.json        # Node.js dependencies
├── 🐳 docker-compose.yml  # Docker services
├── 🔒 .env.example        # Configuration template
├── 📂 public/             # Static web files
├── 📂 data/               # File-based storage
└── 📚 README.md           # This file
```

## 🎨 Customization

### Adding Projects

1. **Via Web Interface** (requires GitHub OAuth):
   - Login with GitHub
   - Use the project management interface

2. **Via API**:
   ```bash
   curl -X POST http://localhost:3000/api/projects \
     -H "Content-Type: application/json" \
     -d '{"name":"My Project","description":"Cool project"}'
   ```

3. **Via File** (file storage mode):
   - Edit `data/projects.json` directly

### Styling

- Edit files in the `public/` directory
- CSS is in `public/styles/`
- JavaScript in `public/scripts/`

## 🔧 API Endpoints

| Endpoint | Method | Description | Auth Required |
|----------|--------|-------------|---------------|
| `/api/me` | GET | Current user info | No |
| `/api/config` | GET | App configuration | No |
| `/api/setup` | GET | Setup status | No |
| `/api/projects` | GET | List projects | No |
| `/api/projects` | POST | Create project | Yes |
| `/api/projects/:id` | PUT | Update project | Yes |
| `/api/projects/:id` | DELETE | Delete project | Yes |

## 🚨 Troubleshooting

### Common Issues

**App won't start:**
```bash
# Check configuration
npm run setup

# View detailed logs
DEBUG=* npm start
```

**GitHub OAuth not working:**
- Verify CLIENT_ID and CLIENT_SECRET in `.env`
- Check callback URL in GitHub app settings
- Ensure BASE_URL is correct

**Database connection issues:**
```bash
# Test PostgreSQL connection
npm run docker:up
npm run logs

# Reset database
npm run docker:down
docker volume rm my-nodesite_pgdata
npm run docker:up
```

**Port already in use:**
```bash
# Change port in .env
PORT=3001

# Or kill process using port 3000
lsof -ti:3000 | xargs kill -9
```

### Getting Help

1. **Check the logs**: `npm run logs`
2. **Run setup again**: `npm run setup`
3. **Review configuration**: Check `.env` file
4. **Test with Docker**: `npm run docker:up`

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🌟 Features in Development

- [ ] Theme customization
- [ ] Advanced analytics
- [ ] Email notifications
- [ ] Multi-language support
- [ ] Plugin system

---

**Made with ❤️ for developers who want a simple, powerful portfolio site**
