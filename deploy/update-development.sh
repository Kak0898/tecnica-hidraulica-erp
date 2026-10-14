#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-$HOME/intranet}"
APP_DIR="${APP_DIR:-/var/www/desarrollo/intranet}"
BRANCH="${BRANCH:-main}"
SERVICE_LABEL="${SERVICE_LABEL:-cl.tecnicahidraulica.intranet}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"

if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  echo "No se encontro el repositorio Git en $SOURCE_DIR." >&2
  exit 1
fi

if [[ -n "$(git -C "$SOURCE_DIR" status --porcelain)" ]]; then
  echo "El repositorio $SOURCE_DIR tiene cambios sin guardar. Revisa git status antes de desplegar." >&2
  exit 1
fi

echo "Actualizando $SOURCE_DIR desde la rama $BRANCH..."
git -C "$SOURCE_DIR" fetch origin "$BRANCH"
git -C "$SOURCE_DIR" checkout "$BRANCH"
git -C "$SOURCE_DIR" pull --ff-only origin "$BRANCH"

echo "Validando la version nueva..."
npm --prefix "$SOURCE_DIR" ci --no-progress --no-audit
npm --prefix "$SOURCE_DIR" test
npm --prefix "$SOURCE_DIR" run build

echo "Publicando en $APP_DIR sin reemplazar configuracion ni archivos..."
mkdir -p "$APP_DIR"
rsync -a \
  --exclude=.git \
  --exclude=.env \
  --exclude=node_modules \
  --exclude=uploads \
  "$SOURCE_DIR/" "$APP_DIR/"

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "Falta $APP_DIR/.env; se cancela el reinicio." >&2
  exit 1
fi

npm --prefix "$APP_DIR" ci --no-progress --no-audit

echo "Probando conexion y esquema de base de datos..."
npm --prefix "$APP_DIR" run db:smoke

echo "Reiniciando $SERVICE_LABEL con launchd..."
launchctl kickstart -k "gui/$(id -u)/$SERVICE_LABEL"

echo "Verificando el servicio..."
curl --fail --silent --show-error "$HEALTH_URL"
printf '\nDeploy de desarrollo listo.\n'
