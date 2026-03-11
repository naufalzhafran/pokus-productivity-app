# Deployment Guide

## Quick Deploy (Vercel - Recommended)

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

The `vercel.json` configuration is already set up for SPA routing.

## VPS Deployment

### Quick Deploy

1. **SSH into your VPS:**
```bash
ssh root@your-vps-ip
```

2. **Clone the repository (any directory):**
```bash
git clone <your-repo-url> ~/pokus
```

3. **Run the setup script:**
```bash
cd ~/pokus
chmod +x setup.sh
sudo ./setup.sh
```

That's it! 🎉

### How it works

- **Source directory**: `~/pokus` (or wherever you clone)
- **Build output**: Copied to `/var/www/pokus`
- **Default domain**: `pokus.madebynz.xyz`

### Arguments (optional)

```bash
# Custom domain
sudo ./setup.sh mydomain.com

# Custom domain and source directory
sudo ./setup.sh mydomain.com /path/to/source
```

### What the script does

1. Updates system packages
2. Installs Node.js 22
3. Installs Nginx
4. Pulls latest code from git
5. Installs npm dependencies
6. Builds the production app (`npm run build`)
7. Copies dist to `/var/www/pokus`
8. Configures Nginx with:
   - Gzip compression
   - Security headers
   - Static asset caching
   - SPA fallback for React Router

### After deployment

1. **Set DNS A record** pointing to your VPS IP (pokus.madebynz.xyz)
2. **Enable HTTPS** (optional):
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d pokus.madebynz.xyz
```

## Environment Variables

Ensure these environment variables are set in your production environment:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

For Vercel, add these in the Vercel Dashboard under Settings > Environment Variables.

For VPS deployment, you may need to rebuild after adding environment variables:
```bash
cd ~/pokus
export VITE_SUPABASE_URL=your_url
export VITE_SUPABASE_ANON_KEY=your_key
npm run build
sudo cp -r dist/* /var/www/pokus/
```
