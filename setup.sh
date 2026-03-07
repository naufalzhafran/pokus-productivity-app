#!/bin/bash

set -e

echo "🚀 Pokus Deployment Script"
echo "=============================="

# Get original user who called sudo
ORIGINAL_USER="${SUDO_USER:-$(whoami)}"
ORIGINAL_HOME=$(getent passwd "$ORIGINAL_USER" | cut -d: -f6)

# Configuration
DOMAIN="${1:-$2}"
if [ -z "$DOMAIN" ]; then
    DOMAIN="pokus.madebynz.xyz"
fi

SOURCE_DIR="${2:-$ORIGINAL_HOME/pokus}"
if [ -z "$SOURCE_DIR" ]; then
    SOURCE_DIR="$ORIGINAL_HOME/pokus"
fi

APP_DIR="/var/www/pokus"
NODE_VERSION="22"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}📍 Domain: $DOMAIN${NC}"
echo -e "${BLUE}📍 Source Directory: $SOURCE_DIR${NC}"
echo -e "${BLUE}📍 App Directory: $APP_DIR${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run as root (sudo ./setup.sh domain.com)${NC}"
    exit 1
fi

# Check if source directory exists
if [ ! -d "$SOURCE_DIR" ]; then
    echo -e "${RED}❌ Source directory not found: $SOURCE_DIR${NC}"
    echo -e "${YELLOW}Please clone your repo first:${NC}"
    echo -e "${YELLOW}   git clone <your-repo-url> $SOURCE_DIR${NC}"
    exit 1
fi

# Check if dist folder exists
if [ ! -d "$SOURCE_DIR/dist" ]; then
    echo -e "${YELLOW}🔨 Building app first...${NC}"
    cd $SOURCE_DIR
    sudo -u $ORIGINAL_USER npm install
    sudo -u $ORIGINAL_USER npm run build
fi

# Update system (only first time)
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}📦 Updating system packages...${NC}"
    apt update && apt upgrade -y

    # Install Node.js
    echo -e "${YELLOW}📦 Installing Node.js $NODE_VERSION...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs

    # Install Nginx
    echo -e "${YELLOW}📦 Installing Nginx...${NC}"
    apt install -y nginx
fi

echo -e "${GREEN}✅ Node.js version: $(node -v)${NC}"

# Navigate to source directory
cd $SOURCE_DIR

# Pull latest changes (if git exists)
if [ -d ".git" ]; then
    echo -e "${YELLOW}📥 Pulling latest changes...${NC}"
    sudo -u $ORIGINAL_USER git pull origin main 2>/dev/null || sudo -u $ORIGINAL_USER git pull origin master 2>/dev/null || true
fi

# Install dependencies and build
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
sudo -u $ORIGINAL_USER npm install

echo -e "${YELLOW}🔨 Building production app...${NC}"
sudo -u $ORIGINAL_USER npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build successful${NC}"

# Create app directory and copy files
echo -e "${YELLOW}📁 Copying build to $APP_DIR...${NC}"
mkdir -p $APP_DIR

# Remove old files and copy new ones
rm -rf $APP_DIR/*
cp -r $SOURCE_DIR/dist/* $APP_DIR/

# Also copy manifest if exists
if [ -f "$SOURCE_DIR/public/manifest.webmanifest" ]; then
    cp $SOURCE_DIR/public/manifest.webmanifest $APP_DIR/
fi

# Set proper permissions
chmod -R 755 $APP_DIR

# Verify files were copied
if [ ! -f "$APP_DIR/index.html" ]; then
    echo -e "${RED}❌ Failed to copy files!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Files copied successfully${NC}"

# Configure Nginx - Simple HTTP only (don't auto-configure HTTPS)
echo -e "${YELLOW}⚙️  Configuring Nginx...${NC}"

# Remove any existing certbot configs for this domain
rm -f /etc/nginx/sites-available/pokus-*

cat > /etc/nginx/sites-available/pokus << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    root $APP_DIR;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json application/javascript;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # PWA Service Worker
    location /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /manifest.webmanifest {
        add_header Content-Type "application/manifest+json";
    }

    # SPA fallback - all routes go to index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/pokus /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload nginx
nginx -t
systemctl reload nginx

echo ""
echo "=============================="
echo -e "${GREEN}🎉 Deployment completed!${NC}"
echo "=============================="
echo ""
echo -e "${GREEN}🌐 App URL: http://$DOMAIN${NC}"
echo ""
echo "To enable HTTPS later, run:"
echo "  sudo apt install certbot python3-certbot-nginx"
echo "  sudo certbot --nginx -d $DOMAIN"
