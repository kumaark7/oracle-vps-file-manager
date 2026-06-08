#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-oracle-vps-file-manager}"
REPO_URL="${REPO_URL:?Set REPO_URL to your Git repository URL}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/${APP_NAME}}"
SOURCE_DIR="${SOURCE_DIR:-/usr/local/src/${APP_NAME}}"
ENV_FILE="${ENV_FILE:-/etc/${APP_NAME}.env}"
SERVICE_FILE="${SERVICE_FILE:-/etc/systemd/system/${APP_NAME}.service}"
NGINX_FILE="${NGINX_FILE:-/etc/nginx/sites-available/${APP_NAME}}"
NGINX_LINK="${NGINX_LINK:-/etc/nginx/sites-enabled/${APP_NAME}}"
PUBLIC_URL="${PUBLIC_URL:-http://YOUR_SERVER_IP}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

apt-get update
apt-get install -y git nginx rsync

mkdir -p "$(dirname "$SOURCE_DIR")"

if [[ -d "${SOURCE_DIR}/.git" ]]; then
  git -C "$SOURCE_DIR" remote set-url origin "$REPO_URL"
  git -C "$SOURCE_DIR" fetch origin "$BRANCH" --prune
  git -C "$SOURCE_DIR" checkout -B "$BRANCH" "origin/${BRANCH}"
  git -C "$SOURCE_DIR" reset --hard "origin/${BRANCH}"
  git -C "$SOURCE_DIR" clean -fd
else
  rm -rf "$SOURCE_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$SOURCE_DIR"
fi

mkdir -p "$APP_DIR"
rsync -a --delete \
  --exclude android \
  --exclude node_modules \
  --exclude tools \
  --exclude .git \
  --exclude dist \
  "${SOURCE_DIR}/" "$APP_DIR/"

cd "$APP_DIR"
npm ci
npm run build

if [[ ! -f "$ENV_FILE" ]]; then
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  ADMIN_PASSWORD="$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"
  cat > "$ENV_FILE" <<EOF
PORT=4174
HOST=127.0.0.1
FILE_ROOT=/home/ubuntu
ADMIN_USER=admin
ADMIN_PASSWORD=${ADMIN_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE"
  echo "Login username: admin"
  echo "Login password: ${ADMIN_PASSWORD}"
else
  echo "Using existing $ENV_FILE"
fi

cp "$APP_DIR/deploy/${APP_NAME}.service" "$SERVICE_FILE"
cp "$APP_DIR/deploy/nginx-ip.conf" "$NGINX_FILE"
ln -sfn "$NGINX_FILE" "$NGINX_LINK"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl daemon-reload
systemctl enable "$APP_NAME"
systemctl restart "$APP_NAME"
systemctl enable nginx
systemctl restart nginx

echo
echo "Installed ${APP_NAME}"
echo "Open: ${PUBLIC_URL}"
echo "Settings: ${ENV_FILE}"
echo "Source checkout: ${SOURCE_DIR}"
