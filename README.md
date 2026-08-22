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
  auth.cjs             Signed sessions and secure cookies
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

## Remote Servers

Additional servers are configured outside the repository. Keep their keys on the Primary VPS, never in GitHub or browser-accessible folders.

```json
{
  "servers": [
    {
      "id": "second-server",
      "name": "Second Server",
      "kind": "ssh",
      "host": "SERVER_PUBLIC_IP",
      "port": 22,
      "username": "ubuntu",
      "rootPath": "/home/ubuntu",
      "keyPath": "/home/ubuntu/.ssh/second-server.key",
      "description": "Remote Ubuntu server managed over SSH"
    }
  ]
}
```

Secure the files for the service user:

```bash
sudo chown ubuntu:ubuntu /etc/oracle-vps-file-manager-servers.json
sudo chmod 600 /etc/oracle-vps-file-manager-servers.json
sudo install -d -m 700 -o ubuntu -g ubuntu /home/ubuntu/.ssh
sudo chmod 600 /home/ubuntu/.ssh/second-server.key
```

The browser receives server labels, hosts, ports, usernames, and protected roots. It never receives `keyPath` or private-key content.

## Uploads And Downloads

Uploads use raw request bodies and are written as streams. Downloads stream directly from the selected local or SSH server to the browser. Files are no longer Base64-encoded into JSON for transfer.

Browser text editing is intentionally bounded by `MAX_EDIT_BYTES` because an editor must hold the text in memory. Uploads are bounded separately by `MAX_UPLOAD_BYTES`. Folder upload sends each contained file as an individual streamed request while preserving its relative path.

Folder `Zip` creates a conflict-safe archive beside the source folder. Folder `Download` streams a ZIP to the browser without keeping a permanent download archive on the selected server.

The toolbar copies `cd '/absolute/path'` for an existing SSH session and `ssh USER@HOST -p PORT -t "cd '/absolute/path' && exec bash -l"` for Windows OpenSSH. Server-side private-key paths are never included.

## Security Model

- A single administrator username and password protect the API.
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
/usr/bin/node /opt/oracle-vps-file-manager/server/index.cjs
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
