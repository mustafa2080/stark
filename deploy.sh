#!/bin/bash
set -e

echo "[1/5] Pulling latest from GitHub..."
cd /root/caprina
git reset --hard HEAD
git clean -fd artifacts/caprina/dist/public/assets/
git pull

echo "[2/5] Building API Server..."
cd /root/caprina/artifacts/api-server
node build.mjs

echo "[3/5] Building Frontend..."
cd /root/caprina/artifacts/caprina
pnpm run build

echo "[4/5] Setting permissions..."
chmod -R 755 /root/caprina/artifacts/caprina/dist/public

echo "[4.5/5] Copying build to starkvector webroot..."
rm -rf /root/starkvector/artifacts/caprina/dist/public/*
\cp -rf /root/caprina/artifacts/caprina/dist/public/* /root/starkvector/artifacts/caprina/dist/public/
chmod -R 755 /root/starkvector/artifacts/caprina/dist/public

echo "[5/5] Restarting API Server..."
pm2 restart caprina-api
pm2 restart starkvector-api

echo "[6/6] Patching nginx client_max_body_size..."
NGINX_CONF="/etc/nginx/sites-available/caprina"
if [ -f "$NGINX_CONF" ]; then
  if ! grep -q "client_max_body_size" "$NGINX_CONF"; then
    sed -i 's/location \/ {/client_max_body_size 50m;\n\n    location \/ {/' "$NGINX_CONF"
    nginx -t && systemctl reload nginx && echo "nginx patched OK."
  else
    sed -i 's/client_max_body_size [^;]*/client_max_body_size 50m/' "$NGINX_CONF"
    nginx -t && systemctl reload nginx && echo "nginx limit updated OK."
  fi
else
  echo "nginx config not found at $NGINX_CONF — skipping."
fi

echo "Done! Deploy successful."
pm2 status
