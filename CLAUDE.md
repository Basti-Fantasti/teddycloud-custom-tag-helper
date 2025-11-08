# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TeddyCloud Custom Tag Helper is a web-based tool for managing custom Toniebox audio files (tonies) through TeddyCloud. The application provides three perspectives for managing content:

1. **TAF Files View** - Content-centric: shows all TAF files and which tonies they're linked to
2. **Tonies View** - Traditional tonie metadata management
3. **RFID Tags View** - Hardware-centric: shows physical RFID tags and their assignments

## Architecture

### Key Architectural Decisions

**TAF-Centric Workflow**: The application inverts the traditional tonie-first approach. TAF (Tonie Audio Format) files are the primary entities, with tonies serving as metadata overlays. This design reflects the reality that content (TAF files) exists independently of tonie configurations.

**Three-Way Linking System**: Tonies can be linked via:
1. `audio_id` - For standard Tonies from official library
2. `hash` - For content verification
3. **RFID Tag Source Paths** - For custom tonies (e.g., "lib://Wilma_Wolkenkopf/wilmawolkenkopf.taf")

The linking logic is in `backend/app/api/taf_library.py:153-172` and must check all three methods sequentially.

**Direct File Write for TeddyCloud**: TeddyCloud's API does not support HTTP POST/PUT for `toniesCustomJson`. All writes to `tonies.custom.json` must be done via direct filesystem access (`/data/config/tonies.custom.json`). See `backend/app/services/teddycloud_client.py:72-107`.

**Volume Scanner for Subdirectories**: TeddyCloud API's `fileIndexV2` endpoint does not support recursive directory listing. To find TAF files in subdirectories, the app uses direct filesystem scanning via `VolumeScanner` when `volumes.enabled=true`. This is critical for the recursive TAF file discovery.

### Data Flow

```
User selects TAF file
  ↓
Frontend → POST /api/taf-metadata/parse
  ↓
Backend parses filename → FilenameParser extracts series/episode
  ↓
Backend searches metadata → MetadataSearchService (MusicBrainz, iTunes)
  ↓
Backend returns pre-populated form with suggested covers
  ↓
User reviews/edits → Preview dialog shows generated JSON
  ↓
User confirms → Cover downloaded → JSON saved to file → TeddyCloud reload triggered
```

### Critical Services

**VolumeScanner** (`backend/app/services/volume_scanner.py`):
- Recursively scans `/data/library/` for TAF files including subdirectories
- Reads RFID tag mappings from `/data/content/default/*/500304E0.json`
- Auto-assigns next custom model number (900001, 900002, etc.)
- Essential for TAF files in subdirectories and RFID tag detection

**FilenameParser** (`backend/app/services/filename_parser.py`):
- Parses two TAF filename patterns:
  - `Author - Series - Category - Episode - Title`
  - `Series - Episode Number - Title`
- Normalizes series names (removes "Die/Der/Das" articles, special chars)
- Example: `Margit_Auer_-_Die_Schule_der_magischen_Tiere_-_Hoerspiel_-_Folge_01` → series: "Die Schule der magischen Tiere", episode: "Folge 01"

**MetadataSearchService** (`backend/app/services/metadata_search.py`):
- Searches MusicBrainz (with Cover Art Archive) - 90% confidence
- Searches iTunes API (audiobooks + music) - 85% confidence
- **Must respect MusicBrainz rate limit**: 1 request/second
- Returns high-res covers (600x600+) with deduplication

**TeddyCloudClient** (`backend/app/services/teddycloud_client.py`):
- API URL construction removes `/web` prefix for API calls
- `fileIndexV2` requires `special=library` parameter
- `save_tonies_custom_json()` writes directly to file (no HTTP API available)
- `trigger_config_reload()` calls `triggerWriteConfig` endpoint

## Deployment Architecture

### Single Container Design

The application uses a **combined single-container architecture**:
- Frontend (React) served by nginx on port 80
- Backend (FastAPI) running on localhost:8000
- nginx proxies `/api/*` requests to the backend
- All exposed through a single container port

**CRITICAL nginx Configuration** (`nginx.conf:12-13`):
```nginx
location /api/ {
    proxy_pass http://localhost:8000/api/;
```
The trailing slashes are **required** for proper API routing. Without them, requests like `/api/taf-library/` will return 404.

### Two Access Modes for TeddyCloud Data

**Mode 1: Direct Volume Mount (Recommended)**
- Fastest performance
- Direct filesystem access
- Requires `volumes.enabled: true` in config.yaml
- Set `TEDDYCLOUD_DATA_PATH=/path/to/teddycloud/data` in environment
- Enables recursive TAF scanning and RFID tag detection

**Mode 2: SMB Network Share**
- Network-based access
- Fallback when direct mount not possible
- Set `smb.enabled: true` in config.yaml
- Configure SMB credentials
- Limited to root-level TAF files (no subdirectory scanning)

## Development Commands

### Production Deployment (Single Container)

```bash
# Set environment variables (see .env.example)
export TEDDYCLOUD_DATA_PATH=/docker/appdata/teddycloud
export PORT=3000

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f tag-helper

# Rebuild after code changes
docker-compose build --no-cache
docker-compose up -d

# Stop services
docker-compose down
```

### Backend Development (FastAPI)

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run with hot reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Access API docs
open http://localhost:8000/docs
```

### Frontend Development (React + Vite)

```bash
cd frontend

# Install dependencies
npm install

# Run dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Volume Setup for Direct Access (CRITICAL for full functionality)

The `teddycloud-data` volume must be populated with TeddyCloud data:

```bash
# Option 1: Use provided script (requires SMB mount)
bash setup-teddycloud-volume.sh

# Option 2: Manual copy from SMB share
docker run --rm \
  -v teddycloud-custom-tonie-manager_teddycloud-data:/data \
  -v /Volumes/docker-appdata/teddycloud:/source:ro \
  alpine cp -r /source/* /data/

# Option 3: Edit docker-compose.yml to use local path
# Replace: - teddycloud-data:/data
# With: - /Volumes/docker-appdata/teddycloud:/data:ro
```

## Configuration Management

### Environment Variables (docker-compose.yml)

Set these in your deployment environment (Portainer, .env file, or shell):

**Required:**
- `TEDDYCLOUD_DATA_PATH` - Path to TeddyCloud data directory
  - Example: `/docker/appdata/teddycloud`
  - Must contain `/library`, `/config`, `/content` subdirectories
  - Mounted to `/data` inside container

**Optional:**
- `TEDDYCLOUD_URL` - TeddyCloud server URL (default: `http://docker`)
- `PORT` - External port to expose (default: `3000`)
- `CONFIG_PATH` - Config directory path (default: `./data`)

### Runtime Configuration (config.yaml)

All runtime configuration is in `config.yaml`:

```yaml
volumes:
  data_path: /data  # Single path - all subdirectories derived automatically

teddycloud:
  url: http://docker
  api_base: "/api"  # TeddyCloud API is at /api (not /web/api)

app:
  auto_parse_taf: true  # Auto-extract metadata when TAF selected
  auto_reload_config: true  # Trigger TeddyCloud reload after save
  default_language: de-de
```

Configuration is loaded via Pydantic Settings in `backend/app/config.py` with this priority:
1. Environment variables (highest)
2. config.yaml values
3. Pydantic defaults (lowest)

## Component Organization

### Backend API Routes (`backend/app/api/`)

- `tonies.py` - CRUD for custom tonies, **includes preview endpoint** for confirmation dialog
- `taf_library.py` - TAF-centric view with **three-way linking logic**
- `taf_metadata.py` - TAF parsing and **automatic cover search**
- `rfid_tags.py` - RFID tag enumeration, status, and **last played tag detection**
- `images.py` - Image proxy from TeddyCloud to frontend (uses path parameters)

### Frontend Components (`frontend/src/components/`)

- `TAFLibrary.jsx` - Main TAF files view with statistics and filtering
- `RFIDTagsView.jsx` - RFID tags perspective with status badges
- `TagStatusField.jsx` - **Live tag detection** showing currently playing tag with cover
- `TonieEditor.jsx` - Form with **auto-parsing, auto-cover search, optional RFID**
- `ConfirmationDialog.jsx` - JSON preview before save (shows cover + what will happen)
- `CoverSelector.jsx` - Cover search results with confidence indicators

### State Management Pattern

The app uses lifting state up pattern:
- `Dashboard.jsx` manages view mode (`taf` | `tonies` | `rfid`)
- Each view component loads its own data independently
- `TonieEditor` receives `tafFile` prop for auto-population

## Data Models

### TonieModel (`backend/app/models/schemas.py`)

```python
{
  "no": "0",                    # Sequential ID
  "model": "900001",            # RFID model number (optional - auto-assigned)
  "audio_id": ["1768543459"],   # From TAF header
  "hash": ["e5e46329..."],      # SHA1 from TAF header
  "series": "Series Name",
  "episodes": "Description",
  "tracks": [],                 # Optional track names
  "release": "0",
  "language": "de-de",
  "category": "custom",
  "pic": "/library/own/pics/cover.jpg"
}
```

### TAF File Structure

TAF files contain a header with:
- `audioId` (integer)
- `sha1Hash` (hex string)
- `trackSeconds` (array of cumulative seconds)

The header is read via TeddyCloud API's `fileIndexV2` response under `tafHeader` key.

### RFID Tag Mapping (`/data/content/default/{UID}/500304E0.json`)

```json
{
  "tonie_model": "900001",
  "source": "lib://Wilma_Wolkenkopf/wilmawolkenkopf.taf",
  "nocloud": true,
  "claimed": true
}
```

The `source` field links RFID tags to TAF files. This is how custom tonies are connected.

## Common Patterns

### Adding a New API Endpoint

1. Create route in `backend/app/api/your_module.py`
2. Register router in `backend/app/main.py`: `app.include_router(your_module.router, prefix="/api")`
3. Add Pydantic models in `backend/app/models/schemas.py`
4. Create service logic in `backend/app/services/`
5. Frontend API client in `frontend/src/api/client.js`

### Auto-Parsing Workflow

When user selects a TAF file:
1. Frontend calls `POST /api/taf-metadata/parse?taf_filename=...`
2. Backend gets TAF header from TeddyCloud API
3. `FilenameParser` extracts series/episode from filename
4. `MetadataSearchService` searches for covers (MusicBrainz → iTunes)
5. Return pre-populated metadata + suggested covers with confidence score
6. Frontend auto-selects cover if confidence >= 80%

### Save Workflow with Confirmation

1. User clicks "Create Tonie"
2. Frontend calls `POST /api/tonies/preview` → returns JSON preview
3. `ConfirmationDialog` shows JSON + cover + what will happen
4. User clicks "Save" → `POST /api/tonies/`
5. Backend downloads cover (if URL selected)
6. Backend writes to `/data/config/tonies.custom.json`
7. Backend triggers `POST /api/triggerWriteConfig`

## TeddyCloud Integration

### API Endpoints Used

- `GET /api/toniesCustomJson` - Fetch custom tonies
- `GET /api/toniesJson` - Fetch official tonies database
- `GET /api/fileIndexV2?special=library&path={path}` - Browse library files
- `GET /api/getTagIndex?overlay={box_id}` - Get all RFID tags for a Toniebox
- `GET /api/settings/get/internal.last_ruid?overlay={box_id}` - Get last played tag RUID (works without auth!)
- `GET /api/triggerWriteConfig` - Write config to disk
- `GET /api/toniesJsonUpdate` - Reload tonies.json configuration

### File Paths

- Config: `/data/config/tonies.custom.json`
- Library: `/data/library/` (TAF files, can be in subdirectories)
- Content: `/data/content/default/{UID}/500304E0.json` (RFID tag mappings)
- Images: `/data/www/custom_img/` or `library/own/pics/`

### Known Limitations & Important Notes

- TeddyCloud API does not support recursive directory listing (use VolumeScanner)
- TeddyCloud API does not support writing tonies.custom.json via HTTP (use direct file write)
- Cover Art Archive may return 404 for releases without covers (handle gracefully)
- MusicBrainz requires 1 second delay between requests (implement rate limiting)

**Tag Detection:**
- `internal.last_ruid` endpoint works WITHOUT authentication despite the "internal" name
- Returns the actual last played RUID reliably
- Filesystem mtime is unreliable (files modified on config changes, not playback)
- `getTagIndex` API's `live` flag is unreliable (can show wrong tag)
- **Always use `internal.last_ruid` as primary method, filesystem as fallback**

## Debugging Tips

### Check Volume Mount

```bash
# Verify library is accessible
docker-compose exec backend ls -la /data/library/

# Check config directory
docker-compose exec backend ls -la /data/config/

# View current tonies
docker-compose exec backend cat /data/config/tonies.custom.json
```

### Test TeddyCloud Connectivity

```bash
# From container
docker-compose exec backend python3 -c "
import httpx
import asyncio
async def test():
    async with httpx.AsyncClient() as client:
        r = await client.get('http://docker/api/toniesCustomJson')
        print(r.status_code, len(r.json()))
asyncio.run(test())
"
```

### Enable Debug Logging

Edit `config.yaml`:
```yaml
advanced:
  log_level: "DEBUG"
```

Then: `docker-compose restart backend`

### Common Error: "Failed to save tonies.custom.json"

This means the volume is not properly mounted or writable:
1. Verify volume mount in docker-compose.yml
2. Check `TEDDYCLOUD_DATA_PATH` environment variable
3. Verify volume: `docker volume inspect teddycloud-custom-tonie-manager_teddycloud-data`
4. Check permissions: `docker exec <container> ls -la /data/config/`

### Common Error: "0 TAF files found"

This means volume scanning is not working:
1. Verify `TEDDYCLOUD_DATA_PATH` environment variable is set correctly
2. Check volume has data: `docker exec <container> find /data/library -name "*.taf"`
3. Check if volume is mounted: `docker exec <container> ls -la /data/`
4. Rebuild container: `docker-compose build && docker-compose up -d`

## Testing Strategy

The application currently has no automated tests. When adding tests:

**Backend**: Use pytest with FastAPI TestClient
- Test TAF parsing with sample files
- Test metadata search with mocked HTTP responses
- Test RFID tag detection with temporary directories
- Test linking logic with all three methods

**Frontend**: Use Vitest + React Testing Library
- Test view mode switching
- Test auto-parsing trigger
- Test confirmation dialog flow
- Test cover selection

## Performance Considerations

- **MusicBrainz Rate Limit**: Implement 1 second delay between requests or risk IP ban
- **TAF File Scanning**: For large libraries (100+ files), consider caching file list
- **Cover Downloads**: Download in background, show progress indicator
- **Config Reloads**: TeddyCloud reload can be slow, show user feedback

## Security Notes

- All TeddyCloud API calls are server-side (no CORS issues)
- No authentication implemented (assumes trusted local network)
- File paths are validated to prevent directory traversal
- Image uploads are validated by MIME type and size
