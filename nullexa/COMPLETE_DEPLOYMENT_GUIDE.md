# Nullexa Complete Deployment Guide

This comprehensive guide provides detailed instructions for deploying Nullexa on an Ubuntu VPS using either Docker or direct installation methods.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [VPS Configuration](#vps-configuration)
3. [Docker Deployment](#docker-deployment)
4. [Direct Deployment (Without Docker)](#direct-deployment-without-docker)
5. [Domain Configuration](#domain-configuration)
6. [Security Considerations](#security-considerations)
7. [Maintenance](#maintenance)
8. [Troubleshooting](#troubleshooting)
9. [WebRTC Considerations](#webrtc-considerations)

## Prerequisites

- Ubuntu 20.04 or newer VPS
- SSH access to your VPS
- Domain name (optional but recommended)

## VPS Configuration

### 1. Update System Packages

```bash
sudo apt update
sudo apt upgrade -y
```

### 2. Configure Firewall

```bash
sudo apt install -y ufw
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## Docker Deployment

This method uses Docker and Docker Compose for easy deployment and management.

### 1. Install Docker and Docker Compose

```bash
# Update package index
sudo apt update
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# Add Docker repository
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.18.1/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add your user to the docker group
sudo usermod -aG docker ${USER}
```

Log out and log back in for the group changes to take effect.

### 2. Clone or Upload the Application

```bash
# Clone from repository (if applicable)
git clone https://github.com/yourusername/nullexa.git
cd nullexa

# Or upload your local files using SCP/SFTP
```

### 3. Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Update the `.env` file with appropriate values, especially setting a strong `FLASK_SECRET_KEY`:

```
# Environment variables for Nullexa

# Flask configuration
FLASK_SECRET_KEY=your_secure_random_key_here
FLASK_DEBUG=False

# Server configuration
HOST=0.0.0.0
PORT=3000

# File upload configuration
MAX_CONTENT_LENGTH=1073741824  # 1GB in bytes
```

You can generate a secure key using the provided script:

```bash
python generate_secret_key.py
```

### 4. Build and Run with Docker Compose

```bash
docker-compose up -d --build
```

This will build the Docker image and start the container in detached mode.

### 5. Set Up Nginx as a Reverse Proxy

```bash
sudo apt install -y nginx
```

Create an Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/nullexa
```

Add the following configuration (replace `yourdomain.com` with your actual domain or server IP):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/nullexa /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 6. Set Up HTTPS with Let's Encrypt (Recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts to complete the certificate setup.

### 7. Docker Maintenance Commands

```bash
# View logs
docker-compose logs -f

# Restart the application
docker-compose restart

# Stop the application
docker-compose down

# Update the application
git pull  # If you cloned from a repository
docker-compose down
docker-compose up -d --build
```

## Direct Deployment (Without Docker)

This method installs the application directly on the server using Python, Gunicorn, Supervisor, and Nginx.

### 1. Install Required Packages

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv nginx supervisor
```

### 2. Create a User for the Application

```bash
sudo adduser --system --group nullexa
sudo mkdir -p /var/www/nullexa
sudo chown -R nullexa:nullexa /var/www/nullexa
```

### 3. Clone or Upload the Application

```bash
# Clone from repository
sudo -u nullexa git clone https://github.com/yourusername/nullexa.git /var/www/nullexa

# Or upload using SCP/SFTP and copy to the destination
scp -r /path/to/local/nullexa user@your_server_ip:/tmp/nullexa
sudo cp -r /tmp/nullexa /var/www/
sudo chown -R nullexa:nullexa /var/www/nullexa
```

### 4. Set Up Python Virtual Environment

```bash
sudo -u nullexa bash -c "cd /var/www/nullexa && python3 -m venv venv"
sudo -u nullexa bash -c "cd /var/www/nullexa && source venv/bin/activate && pip install -r requirements.txt"
sudo -u nullexa bash -c "cd /var/www/nullexa && source venv/bin/activate && pip install gunicorn"
```

### 5. Configure Environment Variables

```bash
sudo -u nullexa bash -c "cd /var/www/nullexa && cp .env.example .env"
sudo -u nullexa nano /var/www/nullexa/.env
```

Update the `.env` file with appropriate values, especially setting a strong `FLASK_SECRET_KEY`.

You can generate a secure key using the provided script:

```bash
sudo -u nullexa bash -c "cd /var/www/nullexa && source venv/bin/activate && python generate_secret_key.py"
```

### 6. Create Upload Directory

```bash
sudo -u nullexa mkdir -p /var/www/nullexa/static/uploads
```

### 7. Configure Supervisor

```bash
sudo nano /etc/supervisor/conf.d/nullexa.conf
```

Add the following configuration:

```ini
[program:nullexa]
directory=/var/www/nullexa
command=/var/www/nullexa/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:3000 --timeout 120 app:app
user=nullexa
autostart=true
autorestart=true
stdout_logfile=/var/log/nullexa/gunicorn.log
stderr_logfile=/var/log/nullexa/gunicorn_error.log
environment=PYTHONPATH='/var/www/nullexa'
```

Create log directory:

```bash
sudo mkdir -p /var/log/nullexa
sudo chown -R nullexa:nullexa /var/log/nullexa
```

Reload supervisor:

```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start nullexa
```

### 8. Configure Nginx as a Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/nullexa
```

Add the following configuration (replace `yourdomain.com` with your actual domain or server IP):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /static/ {
        alias /var/www/nullexa/static/;
    }
}
```

Enable the site and restart Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/nullexa /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 9. Set Up HTTPS with Let's Encrypt (Recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Follow the prompts to complete the certificate setup.

### 10. Maintenance Commands

```bash
# View application logs
sudo tail -f /var/log/nullexa/gunicorn.log
sudo tail -f /var/log/nullexa/gunicorn_error.log

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Restart the application
sudo supervisorctl restart nullexa

# Update the application
sudo -u nullexa bash -c "cd /var/www/nullexa && git pull"
sudo -u nullexa bash -c "cd /var/www/nullexa && source venv/bin/activate && pip install -r requirements.txt"
sudo supervisorctl restart nullexa
```

## Domain Configuration

For the domain `nullexa.com` pointing to the VPS at `69.62.85.60`, ensure the following DNS records are set:

1. A record: `nullexa.com` → `69.62.85.60`
2. A record: `www.nullexa.com` → `69.62.85.60`

After DNS propagation (which can take up to 24-48 hours), you can access your application at `http://nullexa.com` or `https://nullexa.com` (if HTTPS is configured).

## Security Considerations

1. **Keep your system updated**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

2. **Set up fail2ban to protect against brute force attacks**:
   ```bash
   sudo apt install -y fail2ban
   sudo systemctl enable fail2ban
   sudo systemctl start fail2ban
   ```

3. **Regularly backup your application data**:
   ```bash
   # For Docker deployment
   tar -czf nullexa_backup_$(date +%Y%m%d).tar.gz -C /path/to/nullexa .
   
   # For direct deployment
   sudo -u nullexa bash -c "tar -czf /tmp/nullexa_backup_$(date +%Y%m%d).tar.gz -C /var/www nullexa"
   ```

4. **Monitor your server resources**:
   ```bash
   sudo apt install -y htop
   htop
   ```

5. **Set a strong SECRET_KEY in the .env file**

6. **Keep system packages updated**

7. **Use a firewall to restrict access to necessary ports only**

## Maintenance

### Docker Deployment

```bash
# View logs
docker-compose logs -f

# Restart the application
docker-compose restart

# Stop the application
docker-compose down

# Update the application
git pull  # If you cloned from a repository
docker-compose down
docker-compose up -d --build
```

### Direct Deployment

```bash
# View application logs
sudo tail -f /var/log/nullexa/gunicorn.log
sudo tail -f /var/log/nullexa/gunicorn_error.log

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Restart the application
sudo supervisorctl restart nullexa

# Update the application
sudo -u nullexa bash -c "cd /var/www/nullexa && git pull"
sudo -u nullexa bash -c "cd /var/www/nullexa && source venv/bin/activate && pip install -r requirements.txt"
sudo supervisorctl restart nullexa
```

## Troubleshooting

### WebRTC Connection Issues

If users are having trouble establishing WebRTC connections, you may need to set up a TURN server. WebRTC requires direct peer-to-peer connections, which can be problematic with certain NAT configurations.

### Application Not Starting

Check the logs for errors:

```bash
# For Docker deployment
docker-compose logs

# For direct deployment
sudo tail -f /var/log/nullexa/gunicorn_error.log
```

### Nginx Proxy Issues

Ensure your Nginx configuration has the correct WebSocket settings as shown in the configuration examples above.

```bash
sudo nginx -t
sudo systemctl status nginx
```

## WebRTC Considerations

Since Nullexa uses WebRTC for peer-to-peer connections, users behind certain NAT configurations might have trouble establishing direct connections. Consider setting up a TURN server for better connectivity in restrictive network environments.

## Automated Deployment Script

For easier deployment, you can use the included `deploy_nullexa.sh` script:

```bash
chmod +x deploy_nullexa.sh
./deploy_nullexa.sh
```

This script will guide you through the deployment process, offering both Docker and direct deployment options.

## Specific VPS Configuration for srv898188.hstgr.cloud

For deploying on your specific VPS at `srv898188.hstgr.cloud` (IP: `69.62.85.60`) with the domain `nullexa.com`:

1. **Connect to your VPS**

   ```bash
   ssh username@srv898188.hstgr.cloud
   # or
   ssh username@69.62.85.60
   ```

2. **Follow either the Docker or Direct Deployment instructions above**

3. **When configuring Nginx, use your specific domain and IP**:

   ```nginx
   server {
       listen 80;
       server_name nullexa.com www.nullexa.com;
       # ... rest of the configuration
   }
   ```

4. **When setting up HTTPS with Let's Encrypt**:

   ```bash
   sudo certbot --nginx -d nullexa.com -d www.nullexa.com
   ```

After deployment, your application will be accessible at:
- http://nullexa.com (if HTTPS is not configured)
- https://nullexa.com (if HTTPS is configured)