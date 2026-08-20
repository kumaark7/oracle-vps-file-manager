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

## Do You Need The Private Key On The VPS?

No. Do not upload the private key to the VPS.

The private key is only needed from your computer to log in and upload the project:

```text
D:\path\to\your-key.pem
```

Once this app runs on the VPS, it manages files directly from the VPS filesystem.

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
```

To change the file root or password:

```bash
sudo nano /etc/oracle-vps-file-manager.env
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
- Nginx reverse proxy config
- Systemd service config


