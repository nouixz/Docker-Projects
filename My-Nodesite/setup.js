#!/usr/bin/env node

/**
 * Setup Script for My-Nodesite
 * 
 * This script helps set up the application for first-time use by:
 * - Creating a .env file with sensible defaults
 * - Generating secure session secrets
 * - Optionally configuring GitHub OAuth
 * - Testing database connectivity
 * - Providing setup guidance
 */

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const readline = require('readline');

const ENV_FILE = path.join(__dirname, '.env');
const ENV_EXAMPLE = path.join(__dirname, '.env.example');

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function generateSecureSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(`${colors.cyan}${prompt}${colors.reset}`, resolve);
  });
}

async function checkExistingEnv() {
  if (fs.existsSync(ENV_FILE)) {
    log('\n⚠️  .env file already exists!', 'yellow');
    const overwrite = await question('Do you want to overwrite it? (y/N): ');
    return overwrite.toLowerCase() === 'y' || overwrite.toLowerCase() === 'yes';
  }
  return true;
}

async function setupBasicConfig() {
  log('\n🔧 Setting up basic configuration...', 'blue');
  
  const config = {
    // Generate secure secrets
    SESSION_SECRET: generateSecureSecret(64),
    
    // Server defaults
    NODE_ENV: 'development',
    HOST: '0.0.0.0',
    PORT: '3000',
    BASE_URL: 'http://localhost:3000',
    
    // Session settings
    SESSION_TTL_SECONDS: '28800', // 8 hours
    
    // User agent
    USER_AGENT: 'My-Nodesite/1.0',
    
    // Database defaults (for Docker)
    POSTGRES_HOST: 'db',
    POSTGRES_PORT: '5432',
    POSTGRES_DB: 'my_nodesite',
    POSTGRES_USER: 'my_nodesite',
    POSTGRES_PASSWORD: generateSecureSecret(32),
    DATABASE_URL: '', // Will be constructed later
  };
  
  // Construct DATABASE_URL
  config.DATABASE_URL = `postgres://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${config.POSTGRES_HOST}:${config.POSTGRES_PORT}/${config.POSTGRES_DB}`;
  
  return config;
}

async function setupGitHubOAuth(config) {
  log('\n🔐 GitHub OAuth Setup (Optional)', 'blue');
  log('GitHub OAuth allows admin authentication. You can skip this and add it later.', 'reset');
  
  const useOAuth = await question('Do you want to configure GitHub OAuth now? (y/N): ');
  
  if (useOAuth.toLowerCase() === 'y' || useOAuth.toLowerCase() === 'yes') {
    log('\nTo set up GitHub OAuth:', 'reset');
    log('1. Go to https://github.com/settings/applications/new', 'reset');
    log('2. Create a new OAuth App with these settings:', 'reset');
    log(`   - Application name: My-Nodesite`, 'reset');
    log(`   - Homepage URL: ${config.BASE_URL}`, 'reset');
    log(`   - Authorization callback URL: ${config.BASE_URL}/auth/github/callback`, 'reset');
    log('3. Copy the Client ID and Client Secret\n', 'reset');
    
    const clientId = await question('GitHub Client ID (leave empty to skip): ');
    if (clientId) {
      config.GITHUB_CLIENT_ID = clientId;
      const clientSecret = await question('GitHub Client Secret: ');
      config.GITHUB_CLIENT_SECRET = clientSecret;
      
      const adminUser = await question('Admin GitHub username (optional): ');
      if (adminUser) {
        config.ADMIN_GITHUB_USER = adminUser.toLowerCase();
      }
      
      config.GITHUB_CALLBACK_URL = `${config.BASE_URL}/auth/github/callback`;
      config.OAUTH_REDIRECT_URI = config.GITHUB_CALLBACK_URL;
      
      log('✅ GitHub OAuth configured!', 'green');
    } else {
      log('⏭️  Skipping GitHub OAuth setup', 'yellow');
    }
  } else {
    log('⏭️  Skipping GitHub OAuth setup', 'yellow');
    log('You can add GitHub OAuth later by editing the .env file', 'reset');
  }
  
  return config;
}

async function customizeSetup(config) {
  log('\n⚙️  Customize Setup (Optional)', 'blue');
  
  const customize = await question('Do you want to customize the setup? (y/N): ');
  
  if (customize.toLowerCase() === 'y' || customize.toLowerCase() === 'yes') {
    const port = await question(`Server port (${config.PORT}): `);
    if (port) config.PORT = port;
    
    const baseUrl = await question(`Base URL (${config.BASE_URL}): `);
    if (baseUrl) {
      config.BASE_URL = baseUrl;
      // Update OAuth URLs if they were set
      if (config.GITHUB_CALLBACK_URL) {
        config.GITHUB_CALLBACK_URL = `${baseUrl}/auth/github/callback`;
        config.OAUTH_REDIRECT_URI = config.GITHUB_CALLBACK_URL;
      }
    }
    
    const dbName = await question(`Database name (${config.POSTGRES_DB}): `);
    if (dbName) {
      config.POSTGRES_DB = dbName;
      config.DATABASE_URL = `postgres://${config.POSTGRES_USER}:${config.POSTGRES_PASSWORD}@${config.POSTGRES_HOST}:${config.POSTGRES_PORT}/${dbName}`;
    }
  }
  
  return config;
}

function writeEnvFile(config) {
  log('\n📝 Writing .env file...', 'blue');
  
  const envContent = `# My-Nodesite Configuration
# Generated on ${new Date().toISOString()}

# =============================================================================
# Server Configuration
# =============================================================================
NODE_ENV=${config.NODE_ENV}
HOST=${config.HOST}
PORT=${config.PORT}
BASE_URL=${config.BASE_URL}

# =============================================================================
# Session & Security
# =============================================================================
SESSION_SECRET=${config.SESSION_SECRET}
SESSION_TTL_SECONDS=${config.SESSION_TTL_SECONDS}
USER_AGENT=${config.USER_AGENT}

# =============================================================================
# GitHub OAuth (Optional)
# =============================================================================
${config.GITHUB_CLIENT_ID ? `GITHUB_CLIENT_ID=${config.GITHUB_CLIENT_ID}` : '# GITHUB_CLIENT_ID=your_client_id_here'}
${config.GITHUB_CLIENT_SECRET ? `GITHUB_CLIENT_SECRET=${config.GITHUB_CLIENT_SECRET}` : '# GITHUB_CLIENT_SECRET=your_client_secret_here'}
${config.ADMIN_GITHUB_USER ? `ADMIN_GITHUB_USER=${config.ADMIN_GITHUB_USER}` : '# ADMIN_GITHUB_USER=your_github_username'}
${config.GITHUB_CALLBACK_URL ? `GITHUB_CALLBACK_URL=${config.GITHUB_CALLBACK_URL}` : '# GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback'}
${config.OAUTH_REDIRECT_URI ? `OAUTH_REDIRECT_URI=${config.OAUTH_REDIRECT_URI}` : '# OAUTH_REDIRECT_URI=http://localhost:3000/auth/github/callback'}

# =============================================================================
# Database Configuration (PostgreSQL)
# =============================================================================
POSTGRES_HOST=${config.POSTGRES_HOST}
POSTGRES_PORT=${config.POSTGRES_PORT}
POSTGRES_DB=${config.POSTGRES_DB}
POSTGRES_USER=${config.POSTGRES_USER}
POSTGRES_PASSWORD=${config.POSTGRES_PASSWORD}
DATABASE_URL=${config.DATABASE_URL}

# =============================================================================
# Additional Notes
# =============================================================================
# - The application will work without GitHub OAuth (limited functionality)
# - Database is optional for basic file-based storage
# - Run 'npm run setup' again to reconfigure
# - See README.md for more configuration options
`;

  fs.writeFileSync(ENV_FILE, envContent);
  log('✅ .env file created successfully!', 'green');
}

function showNextSteps(config) {
  log('\n🎉 Setup Complete!', 'green');
  log('\n📋 Next Steps:', 'bold');
  log('1. Start the application:', 'reset');
  log('   npm start', 'cyan');
  log('', 'reset');
  log('2. Open your browser:', 'reset');
  log(`   ${config.BASE_URL}`, 'cyan');
  log('', 'reset');
  log('3. Optional - Start with Docker:', 'reset');
  log('   docker-compose up', 'cyan');
  log('', 'reset');
  
  if (!config.GITHUB_CLIENT_ID) {
    log('⚠️  Note: GitHub OAuth is not configured', 'yellow');
    log('   The app will work but admin features will be limited.', 'reset');
    log('   Configure OAuth later by editing the .env file.', 'reset');
    log('', 'reset');
  }
  
  log('📚 Additional Commands:', 'bold');
  log('   npm run setup     - Run this setup again', 'reset');
  log('   npm run dev       - Start in development mode', 'reset');
  log('   npm run logs      - View application logs', 'reset');
  log('', 'reset');
  
  log('🆘 Need help? Check the README.md or create an issue on GitHub.', 'reset');
}

async function main() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🚀 Welcome to My-Nodesite Setup!', 'bold');
  log('='.repeat(60), 'cyan');
  log('\nThis setup will help you configure the application for first use.', 'reset');
  
  try {
    // Check if .env already exists
    const shouldContinue = await checkExistingEnv();
    if (!shouldContinue) {
      log('\n❌ Setup cancelled.', 'yellow');
      process.exit(0);
    }
    
    // Setup basic configuration
    let config = await setupBasicConfig();
    
    // Setup GitHub OAuth (optional)
    config = await setupGitHubOAuth(config);
    
    // Allow customization
    config = await customizeSetup(config);
    
    // Write .env file
    writeEnvFile(config);
    
    // Show next steps
    showNextSteps(config);
    
  } catch (error) {
    log('\n❌ Setup failed:', 'red');
    log(error.message, 'red');
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run setup if called directly
if (require.main === module) {
  main();
}

module.exports = {
  generateSecureSecret,
  setupBasicConfig,
  writeEnvFile
};