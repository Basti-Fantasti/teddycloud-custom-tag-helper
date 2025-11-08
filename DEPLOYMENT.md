# Deployment Guide

This guide explains how to deploy TeddyCloud Custom Tag Helper to different environments.

## Prerequisites

- Docker and Docker Compose installed
- TeddyCloud instance running and accessible
- Access to TeddyCloud data directory (via SMB or local filesystem)

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd teddycloud-custom-tonie-manager
```

### 2. Configure Your Environment

Copy the example configuration files:

```bash
cp config.example.yaml config.yaml
cp .env.example .env
```

### 3. Edit Configuration

Edit `config.yaml` with your settings:

```yaml
teddycloud:
  url: "http://your-teddycloud-host"  # Your TeddyCloud URL (without /web)
  api_base: "/api"
  timeout: 30

smb:
  enabled: true
  host: "your-smb-host"
  share: "your-share-name"
  base_path: "/teddycloud"
  username: "your-username"  # Leave empty for anonymous access
  password: "your-password"  # Leave empty for anonymous access

volumes:
  enabled: true
  config_path: "/data/config"
  custom_img_path: "/data/www/custom_img"  # Filesystem path for images
  custom_img_json_path: "/www/custom_img"  # Path used in tonie JSON
  library_path: "/data/library"

app:
  auto_parse_taf: true
  auto_reload_config: true
  default_language: "de-de"  # or "en-us"
```

### 4. Configure Volume Access

Choose one of the following options:

#### Option A: Named Docker Volume (Recommended)

This requires manually populating the volume with TeddyCloud data.

```bash
# The docker-compose.yml is already configured for this
docker-compose up -d

# Populate the volume (one-time setup)
# You'll need to copy data from your TeddyCloud instance
```

#### Option B: Direct Path Mount

If TeddyCloud data is on the same host, edit `docker-compose.yml`:

```yaml
volumes:
  - ./config.yaml:/app/config.yaml
  - /path/to/your/teddycloud/data:/data  # Replace with actual path
```

#### Option C: SMB Access Only

Keep the named volume but rely on SMB for all file operations:

```yaml
# In config.yaml
smb:
  enabled: true
  host: "your-nas-or-server"
  share: "teddycloud-data"
  username: "your-username"
  password: "your-password"
```

## Deployment Scenarios

### Local Development (Mac/Linux/Windows)

```bash
# Start services
docker-compose up -d

# Check logs
docker-compose logs -f

# Access the application
open http://localhost:3000
```

### Proxmox LXC Container

1. **Create LXC Container**:
   - Ubuntu 22.04 or Debian 11
   - Privileged container (for Docker)
   - At least 2GB RAM, 20GB disk

2. **Install Docker**:
```bash
# Inside LXC
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

3. **Deploy Application**:
```bash
git clone <repository-url>
cd teddycloud-custom-tonie-manager
cp config.example.yaml config.yaml
cp .env.example .env

# Edit config.yaml with your settings
nano config.yaml

# Start services
docker-compose up -d
```

4. **Access from Network**:
```bash
# Get container IP
ip addr show

# Access from browser
http://<lxc-ip>:3000
```

### Synology NAS

1. **Enable Docker** in Package Center

2. **Upload Files**:
   - Upload project to `/docker/teddycloud-tonie-manager`

3. **Configure Paths**:
```yaml
# In docker-compose.yml
volumes:
  - /volume1/docker/teddycloud/data:/data
```

4. **Deploy**:
```bash
# SSH into NAS
cd /volume1/docker/teddycloud-tonie-manager
sudo docker-compose up -d
```

### Production Server (Ubuntu/Debian)

1. **Install Dependencies**:
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y
```

2. **Create Deployment Directory**:
```bash
sudo mkdir -p /opt/teddycloud-tonie-manager
cd /opt/teddycloud-tonie-manager
```

3. **Clone and Configure**:
```bash
git clone <repository-url> .
cp config.example.yaml config.yaml
cp .env.example .env

# Secure configuration files
chmod 600 config.yaml .env

# Edit configuration
sudo nano config.yaml
```

4. **Deploy with Auto-Restart**:
```bash
docker-compose up -d
```

5. **Setup Reverse Proxy (Optional)**:

Using nginx:
```nginx
server {
    listen 80;
    server_name tonies.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Environment Variables

You can override config.yaml settings with environment variables:

```bash
# In .env file
TEDDYCLOUD_URL=http://teddycloud.local
SMB_HOST=nas.local
SMB_SHARE=teddycloud
SMB_USERNAME=your-user
SMB_PASSWORD=your-pass
```

## Security Considerations

1. **Protect Configuration Files**:
```bash
chmod 600 config.yaml .env
```

2. **Use Strong Passwords**:
   - Change default SMB credentials
   - Use unique passwords

3. **Network Security**:
   - Run on trusted network only
   - Consider VPN for remote access
   - Use reverse proxy with SSL/TLS

4. **Regular Updates**:
```bash
cd /path/to/teddycloud-tonie-manager
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

## Troubleshooting

### Cannot Connect to TeddyCloud

```bash
# Test connectivity
docker-compose exec backend curl http://your-teddycloud-host/api/toniesCustomJson

# Check logs
docker-compose logs backend | grep -i error
```

### SMB Connection Issues

```bash
# Test SMB access
docker-compose exec backend ls -la /data/library

# Check credentials in config.yaml
```

### Volume Not Populating

```bash
# Check volume exists
docker volume ls | grep teddycloud

# Inspect volume
docker volume inspect teddycloud-custom-tonie-manager_teddycloud-data

# Manually populate if needed
docker run --rm -v teddycloud-custom-tonie-manager_teddycloud-data:/data \
  alpine sh -c "mkdir -p /data/config /data/library /data/www/custom_img"
```

## Backup and Restore

### Backup Configuration

```bash
# Backup config files
tar -czf backup-$(date +%Y%m%d).tar.gz config.yaml .env

# Backup TeddyCloud data volume
docker run --rm -v teddycloud-custom-tonie-manager_teddycloud-data:/data \
  -v $(pwd):/backup alpine tar -czf /backup/teddycloud-data-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore Configuration

```bash
# Restore config
tar -xzf backup-20241102.tar.gz

# Restore volume
docker run --rm -v teddycloud-custom-tonie-manager_teddycloud-data:/data \
  -v $(pwd):/backup alpine tar -xzf /backup/teddycloud-data-20241102.tar.gz -C /data
```

## Monitoring

### Check Service Status

```bash
docker-compose ps
docker-compose logs -f --tail=100
```

### Health Checks

```bash
# Backend API
curl http://localhost:8000/api/status

# Frontend
curl http://localhost:3000
```

## Updating

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build
docker-compose up -d

# Check logs
docker-compose logs -f
```

## Support

- Check logs: `docker-compose logs -f`
- Review configuration: `cat config.yaml`
- Test connectivity: `docker-compose exec backend curl http://teddycloud/api/toniesCustomJson`
- Report issues with full logs and configuration (remove sensitive data)
