#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-oracle-vps-file-manager}"
REPO_URL="${REPO_URL:?Set REPO_URL to your Git repository URL}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/${APP_NAME}}"
SOURCE_DIR="${SOURCE_DIR:-/usr/local/src/${APP_NAME}}"
ENV_FILE="${ENV_FILE:-/etc/${APP_NAME}.env}"
SERVERS_FILE="${SERVERS_FILE:-/etc/${APP_NAME}-servers.json}"
SERVICE_FILE="${SERVICE_FILE:-/etc/systemd/system/${APP_NAME}.service}"
NGINX_FILE="${NGINX_FILE:-/etc/nginx/sites-available/${APP_NAME}}"
NGINX_LINK="${NGINX_LINK:-/etc/nginx/sites-enabled/${APP_NAME}}"
PUBLIC_URL="${PUBLIC_URL:-http://YOUR_SERVER_IP}"
PUBLIC_HOST="$(printf '%s' "$PUBLIC_URL" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##')"

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
OVFM_SERVERS_PATH=${SERVERS_FILE}
EOF
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE"
  echo "Login username: admin"
  echo "Login password: ${ADMIN_PASSWORD}"
else
  echo "Using existing $ENV_FILE"
fi

# Keep the server list outside the source checkout so SSH keys and host settings
# survive application deployments.
if ! grep -q '^OVFM_SERVERS_PATH=' "$ENV_FILE"; then
  printf '\nOVFM_SERVERS_PATH=%s\n' "$SERVERS_FILE" >> "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Configured server list path: $SERVERS_FILE"
fi

cp "$APP_DIR/deploy/${APP_NAME}.service" "$SERVICE_FILE"

if [[ -n "$PUBLIC_HOST" && ! "$PUBLIC_HOST" =~ ^[0-9.]+$ ]] && [[ -f "/etc/letsencrypt/live/${PUBLIC_HOST}/fullchain.pem" ]] && [[ -f "/etc/letsencrypt/live/${PUBLIC_HOST}/privkey.pem" ]]; then
  cat > "$NGINX_FILE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${PUBLIC_HOST};

    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${PUBLIC_HOST};

    client_max_body_size 150M;

    ssl_certificate /etc/letsencrypt/live/${PUBLIC_HOST}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${PUBLIC_HOST}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:4174;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
else
  cp "$APP_DIR/deploy/nginx-ip.conf" "$NGINX_FILE"
fi

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
