#!/bin/bash
set -e

echo "[1/4] Pulling latest from GitHub..."
cd /root/starkvector
git pull origin main

echo "[2/4] Building API Server..."
cd /root/starkvector/artifacts/api-server
node build.mjs

echo "[3/4] Building Frontend..."
cd /root/starkvector/artifacts/caprina
pnpm run build

echo "[4/4] Setting permissions..."
chmod -R 755 /root/starkvector/artifacts/caprina/dist/public

echo "[5/5] Restarting API Server..."
pm2 restart starkvector-api

echo "Done! Deploy successful."
pm2 status
