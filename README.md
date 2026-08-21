# Oracle VPS File Manager

A self-hosted file manager for your Oracle VPS.

Project name:

```text
oracle-vps-file-manager
```

Recommended VPS folder:

```text
/opt/oracle-vps-file-manager
```

Public URL without buying a domain:

```text
http://YOUR_SERVER_IP
```

## Do You Need A Domain?

No. You can host this directly on your Oracle VPS public IP.

A domain is optional. Buy one only if you want a cleaner address such as:

```text
https://files.yourdomain.com
```

## SSH Keys And Remote Servers

Your Windows SSH key is only for connecting to the Primary VPS to deploy or administer it. Do not commit it, upload it to GitHub, or expose it in the browser.

To manage a second server from this file manager, its own private key must be stored only on the Primary VPS, with owner-only access:

```bash
sudo install -d -m 700 /home/ubuntu/.ssh
sudo install -m 600 -o ubuntu -g ubuntu /tmp/second-server.key /home/ubuntu/.ssh/second-server.key
```

Never put a remote-server private key in this repository or upload it through the public file-manager UI.

## Deploy From Windows

From this project folder on your PC:

```powershell
.\deploy-to-oracle.ps1
```

The script connects to your VPS, pulls the latest code from GitHub, rebuilds the app, and restarts the running service.

GitHub repo:

```text
https://github.com/YOUR_GITHUB_USERNAME/oracle-vps-file-manager
```

The running app is installed into:

```text
/opt/oracle-vps-file-manager
```

## Run Locally

Set a local-only password in PowerShell, then start the manager:

```powershell
$env:ADMIN_PASSWORD = "choose-a-local-password"
.\start-manager.ps1
```

The password stays in that PowerShell session and is not saved to the repository.

The VPS keeps a source checkout here:

```text
/usr/local/src/oracle-vps-file-manager
```

After install, open:

```text
http://YOUR_SERVER_IP
```

The installer prints the generated admin password the first time it runs.

If the page does not open, allow inbound TCP port `80` in your Oracle Cloud instance security list or network security group.

Important: using only the IP address usually means plain HTTP. For the safest public setup, add a domain later and enable HTTPS with Certbot.

## Update Flow

For normal future updates:

1. Commit and push your latest changes to GitHub.
2. Run the deploy script from Windows:

```powershell
.\deploy-to-oracle.ps1
```

That is enough for most releases.

If you ever want to update directly from the VPS terminal instead:

```bash
sudo APP_NAME=oracle-vps-file-manager REPO_URL=https://github.com/YOUR_GITHUB_USERNAME/oracle-vps-file-manager.git BRANCH=main bash /usr/local/src/oracle-vps-file-manager/deploy/install-on-vps.sh
```

## Server Settings

After installation, settings live here:

```text
/etc/oracle-vps-file-manager.env
```

Default settings:

```text
PORT=4174
HOST=127.0.0.1
FILE_ROOT=/home/ubuntu
ADMIN_USER=admin
ADMIN_PASSWORD=generated-during-install
SESSION_SECRET=generated-during-install
OVFM_SERVERS_PATH=/etc/oracle-vps-file-manager-servers.json
```

To change the file root or password:

```bash
sudo nano /etc/oracle-vps-file-manager.env
sudo systemctl restart oracle-vps-file-manager
```

## Manage Multiple Servers

The Primary VPS is always available. Additional SSH servers are defined outside the repository at:

```text
/etc/oracle-vps-file-manager-servers.json
```

Example configuration:

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

Keep this file owned by the service user and restart the app after changing it:

```bash
sudo chown ubuntu:ubuntu /etc/oracle-vps-file-manager-servers.json
sudo chmod 600 /etc/oracle-vps-file-manager-servers.json
sudo systemctl restart oracle-vps-file-manager
```

## Useful VPS Commands

Check app status:

```bash
sudo systemctl status oracle-vps-file-manager
```

Restart app:

```bash
sudo systemctl restart oracle-vps-file-manager
```

View logs:

```bash
journalctl -u oracle-vps-file-manager -f
```

Restart Nginx:

```bash
sudo systemctl restart nginx
```

## Domain Later

If you later buy a domain:

1. Point an `A` record to `YOUR_SERVER_IP`.
2. Copy `deploy/nginx-domain.conf` to Nginx.
3. Replace `files.example.com` with your domain.
4. Install HTTPS with Certbot.

## Features

- Login-protected web UI
- Browse files and folders
- Search inside the current folder
- Upload files
- Download files
- Create folders
- Create and edit text files
- Rename files and folders
- Delete files and folders
- Configurable protected file root
- Manage the Primary VPS and additional SSH servers from one server selector
- Bulk copy, move, and delete on the selected server
- File details and private comments
- Storage dashboard for the selected server
- Nginx reverse proxy config
- Systemd service config


