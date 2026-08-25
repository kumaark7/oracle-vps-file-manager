# Oracle VPS File Manager

A lightweight, self-hosted React and Node.js file manager for one local VPS and additional Ubuntu servers over OpenSSH. It supports browsing, streamed uploads and downloads, text editing, bulk actions, comments, and storage summaries without a database or server-management console.

## Project Structure

```text
src/
  api/                 Browser API client and streaming helpers
  components/          Shared application UI
  features/files/      File browser, rows, dialogs, and path helpers
  features/storage/    Storage usage view
  hooks/               Session and server discovery hooks
  App.jsx              Application state and feature orchestration
  main.jsx             React mount only
server/
  adapters/            Shared local and OpenSSH adapter interface
  remote/file-agent.py Remote filesystem agent executed through SSH
  routes/              Auth, files, and storage HTTP routes
  services/            Comments, file normalization, and storage scanning
  auth/                 Session, recovery-code, and auth storage helpers
  auth.cjs             Password and recovery-code authentication
  config.cjs           Validated environment configuration
  servers.cjs          Local and remote server configuration
  index.cjs            HTTP server and static file serving
deploy/                systemd, Nginx, environment, and installer files
android/               Optional Android WebView wrapper
public/                PWA manifest, service worker, and icons
```

`server.cjs` remains as a compatibility entry point. New startup commands use `server/index.cjs`.

## Local Development

Install dependencies and build the frontend:

```powershell
npm ci
npm run build
```

Start the complete file manager with a password that exists only in the current PowerShell session:

```powershell
$env:ADMIN_PASSWORD = "choose-a-local-password"
.\start-manager.ps1
```

Open `http://127.0.0.1:4174`. By default, local development protects the project directory as its file root. Set `$env:FILE_ROOT` before startup to use another directory.

For frontend-only development, run `npm run dev`. API features still require the Node backend.

## Authenticator Login

The login form has one credential field. It accepts either the configured administrator password or a current six-digit code from any standards-compatible TOTP authenticator app.

Create or replace the authenticator account from the server console:

```bash
node scripts/auth-totp.cjs setup
```

The command displays an account key and an `otpauth://` URI. Add the account to Google Authenticator, Microsoft Authenticator, Aegis, Authy, or another TOTP app by entering the displayed key. Keep the setup output private.

Check or disable the authenticator account:

```bash
node scripts/auth-totp.cjs status
node scripts/auth-totp.cjs disable
```

Authenticator codes use SHA-1, six digits, and a 30-second period for broad app compatibility. A small clock-skew window is accepted, but each accepted time counter is persisted and cannot be replayed.

## Recovery Codes

Recovery codes remain a separate emergency mechanism. Select `Use recovery code` below the main password/authenticator form to enter one.

Generate a new set of recovery codes from the server console:

```bash
node scripts/auth-recovery.cjs generate
```

Store the displayed plaintext codes outside the VPS. They are shown only once. The application persists only unique salts and scrypt hashes in `~/.oracle-vps-file-manager/auth/recovery.json`.

Check how many unused codes remain:

```bash
node scripts/auth-recovery.cjs count
```

Password authentication remains available as the migration fallback. Recovery-code attempts are rate-limited per client, and the same code can never authenticate twice.

## Configuration

Production settings live outside the repository, normally at `/etc/oracle-vps-file-manager.env`:

```dotenv
PORT=4174
HOST=127.0.0.1
FILE_ROOT=/home/ubuntu
ADMIN_USER=admin
ADMIN_PASSWORD=change-this-long-password
SESSION_SECRET=change-this-random-value-with-at-least-32-characters
OVFM_SERVERS_PATH=/etc/oracle-vps-file-manager-servers.json
OVFM_COMMENTS_PATH=/home/ubuntu/.oracle-vps-file-manager-comments.json
OVFM_PUBLIC_HOST=files.example.com
TRUST_PROXY=true
MAX_UPLOAD_BYTES=157286400
MAX_EDIT_BYTES=5242880
```

`SESSION_TTL_MS`, `MAX_JSON_BYTES`, and `MAX_PROCESS_BYTES` are also configurable. Invalid numeric or boolean values fail during startup with a clear error.

## Adding Another Server

Additional servers are configured on the Primary VPS. The application stays on the Primary VPS and manages every remote server through OpenSSH. Adding an entry does not require frontend changes or a frontend rebuild.

Keep private keys in `/home/ubuntu/.ssh/`, never in Git, the browser, or a browser-accessible folder.

1. Install the new server's private key for the service user:

```bash
sudo install -d -m 700 -o ubuntu -g ubuntu /home/ubuntu/.ssh
sudo install -m 600 -o ubuntu -g ubuntu new-server.key /home/ubuntu/.ssh/minecraft
```

2. Test the SSH connection from the Primary VPS:

```bash
ssh -i /home/ubuntu/.ssh/minecraft ubuntu@SERVER_IP
```

3. Add another object to `/etc/oracle-vps-file-manager-servers.json`:

```json
{
  "servers": [
    {
      "id": "dark",
      "name": "Dark",
      "kind": "ssh",
      "host": "10.0.0.10",
      "port": 22,
      "username": "ubuntu",
      "rootPath": "/home/ubuntu",
      "keyPath": "/home/ubuntu/.ssh/dark",
      "description": "Remote Ubuntu server managed over SSH"
    },
    {
      "id": "minecraft",
      "name": "Minecraft",
      "kind": "ssh",
      "host": "SERVER_IP",
      "port": 22,
      "username": "ubuntu",
      "rootPath": "/home/ubuntu",
      "keyPath": "/home/ubuntu/.ssh/minecraft",
      "description": "Minecraft VPS managed over SSH"
    }
  ]
}
```

Each remote entry requires a unique `id`, display `name`, `kind: "ssh"`, hostname, valid SSH port, username, private-key path, and absolute remote root path. The existing object-with-`servers` format and the legacy top-level array format are both accepted.

4. Validate the configuration and key files:

```bash
sudo chown ubuntu:ubuntu /etc/oracle-vps-file-manager-servers.json
sudo chmod 600 /etc/oracle-vps-file-manager-servers.json
cd /home/ubuntu/MainDashboard/VPS_Manager
npm run servers:check

# Optional: also test each SSH connection.
npm run servers:check -- --connect
```

5. Restart VPS Manager and verify the server selector:

```bash
sudo systemctl restart oracle-vps-file-manager
sudo systemctl status oracle-vps-file-manager --no-pager
```

The backend loads every valid entry and the existing selector displays it automatically. A remote host is contacted only when it is selected or when the optional checker connectivity test is requested. One offline remote server does not prevent the local server or other remotes from being used.

The browser receives server labels, hosts, ports, usernames, and protected roots. It never receives `keyPath` or private-key content. See `.ovfm-servers.example.json` for a multi-server example.

## Uploads And Downloads

Uploads use raw request bodies and are written as streams. Downloads stream directly from the selected local or SSH server to the browser. Files are no longer Base64-encoded into JSON for transfer.

Browser text editing is intentionally bounded by `MAX_EDIT_BYTES` because an editor must hold the text in memory. Uploads are bounded separately by `MAX_UPLOAD_BYTES`. Folder upload sends each contained file as an individual streamed request while preserving its relative path.

Folder `Zip` creates a conflict-safe archive beside the source folder. Folder `Download` streams a ZIP to the browser without keeping a permanent download archive on the selected server.

The toolbar copies `cd '/absolute/path'` for an existing SSH session and `ssh USER@HOST -p PORT -t "cd '/absolute/path' && exec bash -l"` for Windows OpenSSH. Server-side private-key paths are never included.

## Security Model

- The administrator can sign in through one field with the configured password or a six-digit TOTP authenticator code.
- TOTP secrets are generated with secure randomness, stored in the protected auth directory, and never returned by status or browser APIs.
- Accepted TOTP counters are atomically persisted so a code cannot be replayed during its validity window.
- Recovery codes use secure randomness, unique salts, scrypt hashes, timing-safe comparison, and atomic consumption.
- Recovery-code attempts are rate-limited per client; submitted codes are never logged or returned.
- Session IDs are random, HMAC-signed, expire, and are compared with timing-safe checks.
- Cookies use `HttpOnly` and `SameSite=Strict`.
- Cookies also use `Secure` when HTTPS is detected directly or through a trusted local Nginx proxy.
- State-changing browser requests are restricted to the same origin.
- Every local and remote path is restricted to its configured root.
- Root deletion is refused and symbolic links are not followed by storage scans.
- SSH uses the system OpenSSH client with key authentication, `BatchMode`, a connection timeout, and configurable host, port, username, and root.

`TRUST_PROXY=true` trusts `X-Forwarded-Proto` only when the direct connection comes from loopback. The supplied Nginx configurations set that header. Set `TRUST_PROXY=false` if Node is directly exposed without a local reverse proxy.

## Production Startup

The systemd service runs:

```bash
/usr/bin/node /home/ubuntu/MainDashboard/VPS_Manager/server/index.cjs
```

Useful commands:

```bash
sudo systemctl restart oracle-vps-file-manager
sudo systemctl status oracle-vps-file-manager
journalctl -u oracle-vps-file-manager -f
sudo nginx -t
sudo systemctl reload nginx
```

## Deployment And Updates

From Windows, configure the deployment session and run the helper:

```powershell
$env:OVFM_SERVER = "ubuntu@YOUR_SERVER_IP"
$env:OVFM_KEY_PATH = "D:\path\to\your-oracle-key.pem"
$env:OVFM_REPO_URL = "git@github.com:YOUR_GITHUB_USERNAME/oracle-vps-file-manager.git"
$env:OVFM_PUBLIC_URL = "https://files.example.com"
.\deploy-to-oracle.ps1
```

Because this repository is private, the VPS must have read access to it. The recommended setup is a read-only GitHub deploy key attached to this repository and installed for the account performing the clone. Do not put a GitHub token in this repository or the deployment script.

Normal update flow:

1. Build and test locally.
2. Commit and push to the private GitHub repository.
3. Run `deploy-to-oracle.ps1` from Windows.
4. Verify the service, Nginx, login, local server, and remote server.

The installer preserves the environment file, remote-server configuration, comments file, and SSH keys outside `/opt/oracle-vps-file-manager`.

## Nginx

The supplied Nginx configuration proxies to `127.0.0.1:4174`, sets `X-Forwarded-Proto`, and permits request bodies up to 150 MB. Keep Nginx's `client_max_body_size` aligned with `MAX_UPLOAD_BYTES`.

For HTTPS, point a DNS `A` record at the VPS and use Certbot. The application itself remains bound to loopback behind Nginx.
