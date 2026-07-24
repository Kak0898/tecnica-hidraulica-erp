#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/desarrollo/intranet}"
BRANCH="${BRANCH:-main}"
SERVICE="${SERVICE:-intranet}"

cd "$APP_DIR"

echo "Actualizando $APP_DIR desde rama $BRANCH..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Instalando dependencias..."
npm ci

echo "Compilando aplicacion..."
npm run build

echo "Probando conexion y esquema de base de datos..."
npm run db:smoke

echo "Reiniciando servicio $SERVICE..."
sudo systemctl restart "$SERVICE"
sudo systemctl --no-pager --full status "$SERVICE"

echo "Deploy de desarrollo listo."
