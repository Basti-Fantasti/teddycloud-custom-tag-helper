# Quick Start Guide

## Prerequisites

- Docker and Docker Compose installed
- TeddyCloud running and accessible
- Access to TeddyCloud data directory (via SMB or volume mount)

## Installation

### 1. Clone/Download the Project

```bash
cd teddycloud-custom-tonie-manager
```

### 2. Configure Your Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
TEDDYCLOUD_URL=http://docker
TEDDYCLOUD_DATA_PATH=/path/to/your/teddycloud/data
SMB_HOST=docker
SMB_SHARE=docker-appdata
SMB_PATH=/teddycloud
```

**Note:** On Synology NAS, the path might be: `/volume1/docker/teddycloud`

### 3. Review config.yaml

The default `config.yaml` is pre-configured for:
- TeddyCloud at `http://docker`
- SMB share at `smb://docker/docker-appdata/teddycloud`
- Anonymous SMB access (change `username`/`password` if needed)

### 4. Start the Application

```bash
docker-compose up -d
```

First run will take a few minutes to build the images.

### 5. Access the Web Interface

Open your browser: **http://localhost:3000**

Check status at: **http://localhost:8000/api/status**

## First Use

### Creating Your First Custom Tonie

1. **Click "Add Custom Tonie"**

2. **Browse Library** - Click "Browse Library →"
   - Navigate to your TAF file
   - Click on a `.taf` file

3. **Auto-Parse** - The app will automatically:
   - Extract Audio ID
   - Extract Hash
   - Detect number of tracks
   - Extract cover image (if embedded)
   - Suggest series/episode names from filename

4. **Review Metadata**:
   - Series Name: e.g., "Die Schule der magischen Tiere"
   - Episode: e.g., "Folge 1"
   - Language: Select from dropdown

5. **Upload Cover** (optional):
   - Drag & drop an image
   - Or use the extracted cover from TAF

6. **Enter RFID Tag**:
   - Format: `E0:04:03:50:0E:F4:D8:EA`
   - Find this in TeddyCloud → Tonies (the unlinked tags)

7. **Click "Create Tonie"**

8. **Done!** The tonie will appear in your grid and in TeddyCloud

## Troubleshooting

### "Cannot connect to TeddyCloud"

Check if TeddyCloud is accessible:

```bash
curl http://docker
# or
curl http://localhost:8080  # adjust port
```

Update `TEDDYCLOUD_URL` in .env if needed.

### "SMB Connection Failed"

1. **Try anonymous first** (leave username/password empty)
2. **Check SMB share is accessible**:
   ```bash
   # On Mac:
   open smb://docker/docker-appdata

   # On Windows:
   \\docker\docker-appdata
   ```
3. **Add credentials** in config.yaml if required:
   ```yaml
   smb:
     username: "your_username"
     password: "your_password"
   ```

### "TAF Parsing Returns Zeros"

The TAF format may vary. If auto-parsing fails:

1. **Check logs**:
   ```bash
   docker-compose logs backend
   ```

2. **Manual entry fallback**:
   - Open the TAF in TeddyCloud web UI
   - Click the file to see header info
   - Copy audio_id and hash
   - Paste into the form

3. **Report the issue** with your TAF file structure

### "Cover Images Not Showing"

Check volume mounts:

```bash
docker-compose exec backend ls -la /data/www/custom_img/
```

Should list your uploaded images.

## Advanced Configuration

### Using Local Filesystem Instead of SMB

If TeddyCloud data is on the same host:

1. **Disable SMB** in config.yaml:
   ```yaml
   smb:
     enabled: false
   ```

2. **Set correct path** in .env:
   ```env
   TEDDYCLOUD_DATA_PATH=/actual/path/to/teddycloud/data
   ```

3. **Restart**:
   ```bash
   docker-compose restart
   ```

### Custom Port Configuration

Edit `.env`:

```env
BACKEND_PORT=9000
FRONTEND_PORT=8080
```

Then restart: `docker-compose up -d`

## Updating

```bash
git pull  # if using git
docker-compose down
docker-compose build
docker-compose up -d
```

## Backup

Your data is stored in:
- `tonies.custom.json` (backed up automatically before changes)
- Cover images in `/custom_img/`

Backups are created at: `/data/config/tonies.custom.backup.*.json`

## Getting Help

1. Check logs: `docker-compose logs -f`
2. Check status: http://localhost:8000/api/status
3. Review documentation: README.md
4. Report issues with:
   - Docker logs
   - Browser console errors
   - Sample TAF file (if parsing fails)

## Next Steps

- **Edit existing tonies**: Click any tonie card
- **Batch operations**: Create multiple tonies from library
- **Cover management**: Upload custom artwork
- **RFID organization**: Link all your custom tags

Enjoy your custom tonies! 🎵
