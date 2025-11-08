# TeddyCloud Custom Tag Helper

A web-based tool for managing TeddyCloud custom tonies with automatic TAF file parsing, metadata search, and RFID tag management.

## Features

- **Three Perspectives**: TAF Library (content-first), Tonies (metadata), RFID Tags (hardware)
- **Live tag detection**: Shows currently playing tag with cover image
- **Auto-parse TAF files** to extract audio-id, hash, and track information
- **Automatic metadata search** via MusicBrainz and iTunes APIs
- **Smart cover selection** with confidence scoring
- **RFID tag detection** from TeddyCloud content files
- **Recursive subdirectory scanning** for TAF files
- **Single container deployment** with nginx + FastAPI + React

## Quick Start

### Prerequisites

- Docker and Docker Compose installed
- TeddyCloud running and accessible
- Access to TeddyCloud data directory

### Deployment

The Tag Helper needs access to your TeddyCloud data directory. **How you provide this access is up to you:**

#### Option 1: Direct Local Path (Same Machine)

```bash
# Set environment variable
TEDDYCLOUD_DATA_PATH=/docker/appdata/teddycloud

# Deploy
docker-compose up -d
```

#### Option 2: Network Share Mounted on Host

```bash
# First, mount the share on your host
mount -t cifs //server/teddycloud /mnt/teddycloud -o credentials=/root/.smbcreds

# Or for NFS
mount -t nfs server:/export/teddycloud /mnt/teddycloud

# Then deploy, pointing to the mount
TEDDYCLOUD_DATA_PATH=/mnt/teddycloud docker-compose up -d
```

#### Option 3: Portainer (Recommended for Proxmox/TrueNAS)

1. Navigate to: **Stacks** → **Add Stack**
2. Paste the docker-compose.yml
3. Add **Environment Variables**:
   ```
   TEDDYCLOUD_DATA_PATH=/path/to/teddycloud/data
   TEDDYCLOUD_URL=http://docker
   PORT=3000
   ```
4. Deploy stack

### Verification

```bash
# Check if container is running
docker ps | grep teddycloud-tag-helper

# Verify data access
docker exec teddycloud-tag-helper ls -la /data/library/
docker exec teddycloud-tag-helper find /data/library -name "*.taf" | head -5

# Check logs
docker logs teddycloud-tag-helper --tail 50
```

Access the web interface at: `http://<your-server>:3000`

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TEDDYCLOUD_DATA_PATH` | **Yes** | `/data` | Absolute path to TeddyCloud data directory |
| `TEDDYCLOUD_URL` | No | `http://docker` | TeddyCloud server URL |
| `PORT` | No | `3000` | External port to expose |
| `CONFIG_PATH` | No | `./data` | Config directory for persistent settings |

### Expected Directory Structure

The `TEDDYCLOUD_DATA_PATH` must contain:

```
/data/
├── config/
│   ├── tonies.custom.json
│   └── config.overlay.ini
├── library/
│   ├── *.taf files
│   └── subdirectories with more TAF files
└── content/
    └── default/
        └── {BOX_ID}/
            └── 500304E0.json (RFID tag mappings)
```

---

## Usage

### Creating a Custom Tonie

1. **Navigate to TAF Library** view
2. **Find an orphaned TAF file** (not linked to a tonie)
3. **Click the file** → "Create Tonie" button appears
4. **Auto-parse triggers**:
   - Series/episode extracted from filename
   - Metadata searched from MusicBrainz + iTunes
   - Suggested covers displayed with confidence scores
5. **Review and edit**:
   - Series name, episode description
   - Select cover (or upload custom)
   - RFID tag (auto-detected if available)
6. **Preview** → Shows generated JSON
7. **Save** → Cover downloaded, tonie created, TeddyCloud reloaded

### Managing RFID Tags

1. **Navigate to RFID Tags** view
2. See all detected RFID tags from content directory
3. **Status badges**:
   - 🟢 Assigned + Content = Ready to use
   - 🟡 Assigned but no content linked
   - 🔴 Unassigned
4. Click tag to edit tonie assignment

---

## Troubleshooting

### "0 TAF files found"

**Cause**: Data path not properly mounted or incorrect

**Fix**:
```bash
# 1. Verify environment variable
docker exec teddycloud-tag-helper printenv | grep TEDDYCLOUD_DATA_PATH

# 2. Check if directory is accessible
docker exec teddycloud-tag-helper ls -la /data/

# 3. Look for TAF files
docker exec teddycloud-tag-helper find /data/library -name "*.taf"

# 4. If empty, check your TEDDYCLOUD_DATA_PATH points to correct directory
```

### "Failed to connect to TeddyCloud"

**Cause**: TeddyCloud URL incorrect or unreachable

**Fix**:
```bash
# Test from inside container
docker exec teddycloud-tag-helper curl -I http://docker/api/toniesJson

# If fails:
# - Use http://docker if on same Docker network
# - Use http://192.168.x.x:8080 if different machine
# - Ensure TeddyCloud is running
```

### "Permission denied" when accessing files

**Cause**: Volume mount has wrong permissions

**Fix**:
```bash
# Check ownership
ls -la /path/to/teddycloud/data

# Fix permissions (on host)
chown -R 1000:1000 /path/to/teddycloud/data

# Or if using mounted share, ensure mount options include proper uid/gid
mount -t cifs //server/share /mnt -o uid=1000,gid=1000
```

---

## Architecture

### Single Container Design

- **Frontend**: React + Vite (served by nginx on port 80)
- **Backend**: FastAPI (running on localhost:8000)
- **Reverse Proxy**: nginx routes `/api/*` → backend

### Critical nginx Configuration

The `nginx.conf` **must** have trailing slashes:

```nginx
location /api/ {
    proxy_pass http://localhost:8000/api/;
```

Without trailing slashes, API requests will return 404 errors.

### Data Flow

```
User → nginx:80 → /api/* → uvicorn:8000 → TeddyCloud API
                  ↓
                  /         → React SPA
```

---

## Development

### Local Development (without Docker)

**Backend**:
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Set environment variable
export TEDDYCLOUD_DATA_PATH=/path/to/teddycloud/data

# Run
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend**:
```bash
cd frontend
npm install
npm run dev
```

Access:
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:8000`
- API Docs: `http://localhost:8000/docs`

### Building for Production

```bash
# Build image
docker-compose build --no-cache

# Run
docker-compose up -d

# Check logs
docker-compose logs -f tag-helper
```

---

## Configuration Reference

See `config.yaml` for all options:

```yaml
teddycloud:
  url: http://docker          # TeddyCloud server
  api_base: /api              # API path
  timeout: 30                 # Request timeout

volumes:
  data_path: /data            # TeddyCloud data directory

app:
  auto_parse_taf: true        # Auto-extract metadata
  auto_reload_config: true    # Reload TeddyCloud after save
  default_language: de-de     # Default tonie language
  max_image_size_mb: 5        # Cover upload limit
  recursive_scan: true        # Scan subdirectories
```

---

## API Documentation

Access interactive API docs at: `http://localhost:3000/api/docs`

### Key Endpoints

- `GET /api/taf-library/` - TAF-centric view with linkage info
- `GET /api/tonies/` - List all custom tonies
- `POST /api/taf-metadata/parse?taf_filename=<name>` - Auto-parse TAF file
- `POST /api/tonies/preview` - Preview tonie JSON before save
- `GET /api/rfid-tags/` - List all detected RFID tags
- `POST /api/reload-teddycloud` - Trigger config reload

---

## License

MIT License - free to use and modify!

## Contributing

PRs welcome! Please ensure:
- Code follows existing patterns
- Update documentation
- Test with actual TeddyCloud setup

## Credits

Built for the [TeddyCloud](https://github.com/toniebox-reverse-engineering/teddycloud) project.

Special thanks to the TeddyCloud community for reverse-engineering the Toniebox protocol.
