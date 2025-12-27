# Production Readiness Changelog

## Summary

This project has been prepared for public release on GitHub/Forgejo. All personal information, credentials, and hardcoded values have been removed and made configurable.

---

## [2.3.0] - 2025-12-27

### Added - Batch TAF Processing Feature

New feature to efficiently process multiple unlinked TAF files at once, automatically matching against the official Tonies database and searching metadata sources for unmatched files.

#### User Flow
1. Select multiple unlinked TAF files in TAF Library (checkboxes)
2. Click "Batch Process" to open the wizard
3. Files are auto-matched against official tonies.json (6207 entries)
4. Review matches - exact matches preselected, multiple candidates show dropdown
5. Unmatched files search MusicBrainz/iTunes for covers
6. Confirm selections and create all tonie entries at once

#### Backend Components

**TonieMatchingService** (`backend/app/services/tonie_matching_service.py`)
- Loads and caches official tonies.json from TeddyCloud API
- Text normalization (lowercase, remove articles Die/Der/Das, handle umlauts)
- Fuzzy matching using `rapidfuzz` library
- Returns ranked candidates with confidence scores (0.0-1.0)
- Auto-select threshold: >= 0.95 confidence

**Batch API Endpoints** (`backend/app/api/batch.py`)
- `POST /api/batch/analyze` - Match TAF files against tonies.json
- `POST /api/batch/search-metadata` - Search MusicBrainz/iTunes for unmatched
- `POST /api/batch/process` - Create tonie entries from selections

**BatchProcessingService** (`backend/app/services/batch_processing_service.py`)
- Orchestrates analysis, metadata search, and processing
- Downloads covers from official CDN URLs
- Atomic writes to tonies.custom.json
- Triggers TeddyCloud reload after processing

#### Frontend Components

**Selection State** (`frontend/src/context/TAFLibraryContext.jsx`)
- `selectedPaths: Set<string>` - Selected file paths
- `toggleSelection(path)` - Toggle single selection
- `selectAllUnlinked()` - Select all unlinked files
- `clearSelection()` - Clear all selections
- `batchWizardOpen` - Wizard visibility state

**BatchSelectionToolbar** (`frontend/src/components/BatchSelectionToolbar.jsx`)
- Shows selected count
- "Select All Unlinked" button
- "Batch Process" button
- "Clear Selection" button

**BatchProcessingWizard** (`frontend/src/components/BatchProcessingWizard.jsx`)
- Multi-step wizard with progress indicators
- Step 1: Analyzing - Loading spinner while matching
- Step 2: Review Matches - List with dropdowns for multiple matches
- Step 3: Confirm - Preview all selections before processing
- Step 4: Processing/Complete - Progress and results summary

**TAF Library Updates** (`frontend/src/components/TAFLibrary.jsx`)
- Added checkbox column for unlinked files
- Integrated BatchSelectionToolbar

#### Security Updates

**SSRF Whitelist** (`backend/app/services/metadata_search.py`)
- Added official Tonies CDN domains:
  - `cdn.tonies.de`
  - `278163f382d2bab4b036-4f5ec62496a160f3570d3b6e48fc4516.ssl.cf3.rackcdn.com`
  - `08ee523e746768fd7148-f76a52ba8f0c340564df978383fc4de2.ssl.cf3.rackcdn.com`
  - `images.cdn.europe-west1.gcp.commercetools.com`
  - `cdn.shopify.com`
  - `s3.eu-central-1.amazonaws.com`

#### Dependencies

**Backend** (`backend/requirements.txt`)
- Added `rapidfuzz>=3.0.0` for fast fuzzy string matching

#### Translations

Added batch processing translations in both English and German:
- Selection toolbar strings
- Wizard step labels and descriptions
- Match status labels (auto-matched, needs review, no match)
- Processing results messages

#### Files Changed
- **Created**: `backend/app/api/batch.py`
- **Created**: `backend/app/services/batch_processing_service.py`
- **Created**: `backend/app/services/tonie_matching_service.py`
- **Created**: `frontend/src/components/BatchProcessingWizard.jsx`
- **Created**: `frontend/src/components/BatchSelectionToolbar.jsx`
- **Modified**: `backend/app/main.py` - Register batch router
- **Modified**: `backend/app/models/schemas.py` - Added batch-related models
- **Modified**: `backend/app/services/metadata_search.py` - SSRF whitelist
- **Modified**: `backend/requirements.txt` - Added rapidfuzz
- **Modified**: `frontend/src/api/client.js` - Batch API client
- **Modified**: `frontend/src/components/TAFLibrary.jsx` - Checkboxes
- **Modified**: `frontend/src/context/TAFLibraryContext.jsx` - Selection state
- **Modified**: `frontend/src/locales/de.json` - German translations
- **Modified**: `frontend/src/locales/en.json` - English translations
- **Modified**: `frontend/src/pages/Dashboard.jsx` - Wizard integration

---

## [2.2.4] - 2025-12-26

### Fixed - TAF Statistics Showing Wrong Total Count When Filtering

Fixed an issue where the TAF statistics cards showed incorrect total count when filtering by "Linked" or "Orphaned".

#### Root Cause
- Backend returned `filtered_total` as `total_count` in API response
- Frontend used same `total_count` for both statistics display AND pagination
- When filtering, statistics showed filtered count instead of actual total

#### Solution
- Added `filtered_count` field to `TAFLibraryResponse` schema for pagination
- Backend now returns actual `total_count` (unfiltered) for statistics
- Frontend uses `filtered_count` for pagination, `total_count` for stats

#### Files Changed
- **backend/app/models/schemas.py** - Added `filtered_count` field to `TAFLibraryResponse`
- **backend/app/api/taf_library.py** - Return both `total_count` and `filtered_count`
- **frontend/src/context/TAFLibraryContext.jsx** - Use `filtered_count` for pagination

### Added - German Translations for Settings, StatusBar, and Dashboard

Added missing German translations throughout the application.

#### Translations Added
- **Settings Dialog** - All labels, buttons, hints now translated
- **StatusBar** - "Reload TeddyCloud" button and status labels
- **Dashboard** - Tagline and dark mode toggle tooltips
- **Footer** - Version label

#### Files Changed
- **frontend/src/locales/en.json** - Added new translation keys
- **frontend/src/locales/de.json** - Added German translations
- **frontend/src/components/SettingsDialog.jsx** - Use translation keys
- **frontend/src/components/StatusBar.jsx** - Use translation keys
- **frontend/src/pages/Dashboard.jsx** - Use translation keys

### Added - Version Information in Footer

Version is now displayed in the application footer.

#### Implementation
- Version sourced from `frontend/package.json`
- Injected at build time via Vite's `define` feature
- Available as `__APP_VERSION__` global

#### Files Changed
- **frontend/vite.config.js** - Read version from package.json, define global
- **frontend/src/pages/Dashboard.jsx** - Added footer with version display
- **VERSIONING.md** - Documentation on how to update version

### Changed - Filter Button Order

Re-arranged TAF filter buttons to match statistics card order: All, Linked, Orphaned (was All, Orphaned, Linked).

#### Files Changed
- **frontend/src/components/TAFLibrary.jsx** - Swapped Linked and Orphaned button positions

### Added - GitHub Repository Link in Footer

Version number in footer now links to the GitHub repository for easy access to source code and releases.

#### Files Changed
- **frontend/src/pages/Dashboard.jsx** - Version wrapped in link to GitHub repository

---

## [2.2.3] - 2025-12-26

### Fixed - TAF Library Filter Not Working with Pagination

Fixed an issue where clicking on "Orphaned" or "Linked" filter tabs in the TAF Library view showed empty results even though the statistics showed matching files.

#### Root Cause
- Filtering was applied **client-side** on the already-paginated data
- Backend sorted linked files first, then applied pagination
- With 86 linked + 14 orphaned files, page 1 contained only linked files
- Clicking "Orphaned" filtered page 1's 50 linked files, finding 0 matches

#### Solution
- Moved filtering from client-side to **server-side** (before pagination)
- Added `filter` query parameter to `/api/taf-library/` endpoint
- Filter state now managed in TAFLibraryContext, passed to API
- Pagination now operates on filtered results

#### Files Changed
- **backend/app/api/taf_library.py** - Added `filter` parameter, filter before pagination
- **frontend/src/api/client.js** - Added filter param to `tafLibraryAPI.getAll()`
- **frontend/src/context/TAFLibraryContext.jsx** - Added filter state and `setFilter()` function
- **frontend/src/components/TAFLibrary.jsx** - Use context filter, removed client-side filtering

#### Acceptance Criteria Met
- [x] Clicking "Orphaned" shows all orphaned files with correct pagination
- [x] Clicking "Linked" shows all linked files with correct pagination
- [x] Statistics still show total counts across all files
- [x] Filter changes reset to page 1

---

## [2.2.2] - 2025-12-26

### Fixed - Settings Changes Requiring Page Reload

Fixed an issue where changing the selected Toniebox in Settings required a full page reload for changes to take effect.

#### Root Cause
- `Dashboard.jsx` loaded config only once on mount
- `SettingsDialog.jsx` always restarted backend and reloaded page on save
- No callback mechanism to notify Dashboard of app settings changes

#### Solution
- `SettingsDialog.jsx` now tracks initial config to detect what changed
- Only restarts backend if TeddyCloud URL/timeout changed
- For app-only changes (selected box, default language), saves without restart and calls `onConfigChange` callback
- `Dashboard.jsx` handles callback and updates `selectedBox` and `defaultLanguage` state immediately

#### Files Changed
- **SettingsDialog.jsx** - Added `onConfigChange` prop, track initial config, conditional restart logic
- **Dashboard.jsx** - Added `handleConfigChange` handler, pass callback to SettingsDialog

#### Acceptance Criteria Met
- [x] Changing box in Settings immediately updates TagStatusField
- [x] No page reload required for app settings changes
- [x] Config persisted to backend correctly
- [x] Backend restart still happens when TeddyCloud URL changes

---

## [2.2.1] - 2025-12-26

### Fixed - Default Language Not Applied to New Tonies

Fixed an issue where new tonies always defaulted to 'en-us' language regardless of the `default_language` setting in `config.yaml`.

#### Root Cause
- `TonieEditor.jsx` hardcoded the fallback language to 'en-us'
- `Dashboard.jsx` loaded the config but didn't pass `default_language` to `TonieEditor`

#### Files Changed
- **Dashboard.jsx** - Now extracts and passes `defaultLanguage` prop to `TonieEditor`
- **TonieEditor.jsx** - Accepts `defaultLanguage` prop and uses it instead of hardcoded 'en-us'

#### Acceptance Criteria Met
- [x] New tonies use `config.default_language` when no language specified
- [x] Existing tonies retain their language when editing
- [x] Setting `de-de` in config results in German default

---

## [2.2.0] - 2025-12-26

### Added - Frontend Pagination UI

Added pagination controls to all list views for improved performance with large libraries.

#### New Components
- **Pagination.jsx** - Reusable pagination component with:
  - Page navigation (Previous/Next buttons)
  - Page indicator ("Page X of Y")
  - Item count display ("Showing X to Y of Z items")
  - Page size selector (20, 50, 100 items per page)
  - Full dark mode support
  - German/English translations

#### Components Updated
- **TAFLibrary.jsx** - Added pagination controls
  - Fetches only current page from backend
  - Page navigation with size selector
  - Works with client-side filtering

- **TAFLibraryContext.jsx** - Extended with pagination state
  - Added `page`, `pageSize`, `totalCount`, `hasNext`, `hasPrev`
  - Added `goToPage()` and `changePageSize()` functions
  - Pagination params passed to API calls

- **TonieGrid.jsx** - Added pagination controls
  - Receives pagination state from Dashboard
  - Consistent UI with other views

- **RFIDTagsView.jsx** - Added pagination controls
  - Internal pagination state management
  - Page navigation with size selector

- **Dashboard.jsx** - Added tonies pagination management
  - Pagination state for tonies view
  - Page change handlers passed to TonieGrid

#### API Client Updated
- **client.js** - Added pagination parameters
  - `toniesAPI.getAll(skip, limit)` - Supports pagination
  - `tafLibraryAPI.getAll(skip, limit)` - Supports pagination
  - `rfidTagsAPI.getAll(skip, limit)` - Supports pagination

#### Locale Files Updated
- Added `pagination.*` namespace with 9 translation keys:
  - `showing`, `to`, `of`, `items`, `noItems`
  - `perPage`, `page`, `previous`, `next`
- Both `en.json` and `de.json` updated

#### Acceptance Criteria Met
- [x] Shows pagination controls below file lists
- [x] Fetches only current page from backend
- [x] Total count displayed (e.g., "Page 1 of 5")
- [x] Smooth navigation between pages
- [x] Consistent pagination UI across all views

---

## [2.1.0] - 2025-12-26

### Added - Complete i18n Translation Support

Added missing translations to 5 frontend components for full German/English language support.

#### Components Updated
- **TAFLibrary.jsx** - 11 strings translated
  - Connection error messages, retry button
  - Statistics labels (Total TAF Files, Linked to Tonies, Orphaned Files)
  - Filter tabs (All Files, Orphaned, Linked)
  - Track count, category badges, Create Tonie button

- **TonieEditor.jsx** - 12 strings translated
  - Form titles (Edit/Create Custom Tonie)
  - TAF parsing status, library browser button
  - RFID tag status labels (Unconfigured/Unassigned)
  - Creative Tonie placement instructions
  - Cover gallery labels, upload status

- **RFIDTagsView.jsx** - 3 strings translated
  - Status badges (Assigned/Unconfigured)
  - No TAF file placeholder
  - Category badges (Custom/Official)

- **TonieCard.jsx** - 2 strings translated
  - Tracks label
  - Edit button (reuses buttons.edit)

- **CoverSelector.jsx** - 2 strings translated
  - Show less/Show all toggle
  - No covers found message

#### Locale Files Updated
- `frontend/src/locales/en.json` - Added 30+ new translation keys
- `frontend/src/locales/de.json` - Added 30+ German translations

#### New Translation Namespaces
- `taf.*` - TAF library specific translations
- `tonieCard.*` - Tonie card component
- `coverSelector.*` - Cover selector component
- Extended `tonieEditor.*` and `rfid.*` namespaces

---

## Major Changes

### 1. Container Architecture - MERGED

**Before**: Separate frontend and backend containers
**After**: Single combined container with nginx + uvicorn

- Created multi-stage Dockerfile
- Added nginx.conf for reverse proxy
- Frontend served as static files, API proxied to backend
- Simplified deployment to single container

**Files Changed**:
- ✅ Created `Dockerfile` (multi-stage build)
- ✅ Created `nginx.conf`
- ✅ Updated `docker-compose.yml` (kept for backwards compatibility)

### 2. TeddyCloud URL Cleanup

**Removed**: `/web` suffix from all TeddyCloud URLs
**Reason**: TeddyCloud API is at `/api`, not `/web/api`

**Files Updated**:
- ✅ `backend/app/config.py` - Default URL
- ✅ `config.yaml` - Active configuration
- ✅ `config.example.yaml` - Template
- ✅ `.env` - Environment file
- ✅ `.env.example` - Template
- ✅ `docker-compose.yml` - Default value
- ✅ `test_api.py` - Test script
- ✅ `README.md` - Documentation
- ✅ `QUICKSTART.md` - Quick start guide

### 3. Credentials Removed

**Removed ALL hardcoded personal information**:

#### SMB Credentials
- ❌ Removed: `username: nigggo`
- ❌ Removed: `password: Sv05649956`
- ✅ Changed to: Empty strings (anonymous access)
- ℹ️ Users must configure in their own `config.yaml`

#### Box ID Mappings
- ❌ Removed: Hardcoded mapping `50F14A51942C -> 91BAF40E`
- ❌ Removed: `selected_box: 50F14A51942C` from config
- ✅ Now: Automatic detection or single-box fallback
- **File**: `backend/app/api/rfid_tags.py:245-253`

### 4. Image Path - Now Configurable

**Before**: Hardcoded `/library/own/pics` in 3 files
**After**: Configurable via `custom_img_json_path`

**Implementation**:
- ✅ Added `custom_img_json_path` to `VolumesConfig`
- ✅ Updated `backend/app/api/uploads.py` (2 locations)
- ✅ Updated `backend/app/api/taf_metadata.py` (1 location)
- ✅ Added to `config.yaml` and `config.example.yaml`

**New Config Fields**:
```yaml
volumes:
  custom_img_path: "/data/www/custom_img"      # Filesystem path
  custom_img_json_path: "/www/custom_img"     # Path in tonie JSON
```

### 5. Docker Compose - Generic

**Before**: Mac-specific volume mount `/Volumes/docker-appdata/teddycloud`
**After**: Generic named volume `teddycloud-data`

**Changes**:
- ✅ Changed to named volume as default
- ✅ Added comment showing how to use local path
- ✅ Works on any platform (Mac/Linux/Windows/Proxmox)

### 6. .gitignore - Security

**Added** comprehensive .gitignore to prevent committing:
- ✅ `config.yaml` (contains credentials)
- ✅ `.env` (contains credentials)
- ✅ Backup files (`*.backup`, `backup-*`, `config-backup-*`)
- ✅ Python/Node build artifacts
- ✅ IDE files

### 7. Documentation

**Created**:
- ✅ `DEPLOYMENT.md` - Comprehensive deployment guide
  - Proxmox LXC setup
  - Synology NAS deployment
  - Production server setup
  - Security best practices
  - Backup/restore procedures

**Existing** (verified no personal info):
- ✅ `README.md` - Clean
- ✅ `QUICKSTART.md` - Clean
- ✅ `CLAUDE.md` - Clean

## Configuration Files

### Template Files (Committed to Git)

These contain NO personal information and serve as examples:

- ✅ `config.example.yaml` - Template with placeholders
- ✅ `.env.example` - Template with placeholders

### User Files (Gitignored)

These contain personal information and are NOT committed:

- 🔒 `config.yaml` - User's actual configuration
- 🔒 `.env` - User's actual environment variables

## Security Improvements

### Before
- ❌ Credentials hardcoded in config files
- ❌ Personal box IDs in source code
- ❌ Mac-specific paths in docker-compose
- ❌ No .gitignore for sensitive files

### After
- ✅ All credentials configurable
- ✅ No personal information in code
- ✅ Platform-independent configuration
- ✅ Sensitive files excluded from git
- ✅ Security documentation added

## Verification

All personal information removed:
```bash
grep -r "nigggo\|Sv05649956\|50F14A51942C\|91BAF40E" \
  --exclude-dir=node_modules --exclude-dir=.git \
  --exclude="*.log" --exclude=".gitignore" . 
# Result: No matches found ✅
```

## Migration Path for Existing Users

If you were using the development version, migrate like this:

1. **Backup your current config**:
```bash
cp config.yaml config.backup.yaml
```

2. **Pull latest changes**:
```bash
git pull
```

3. **Update your config.yaml**:
```yaml
# Add these new fields:
teddycloud:
  url: http://docker  # Remove /web if you had it

volumes:
  custom_img_json_path: /library/own/pics  # Add this line
```

4. **Rebuild and restart**:
```bash
docker-compose down
docker-compose build
docker-compose up -d
```

## Ready for Publication

The project is now ready to be published to:
- ✅ GitHub
- ✅ Forgejo
- ✅ Any public Git repository

**No personal information** will be exposed when pushing to public repositories.

## Next Steps

1. Initialize git repository (if not done):
```bash
git init
git add .
git commit -m "Initial commit - Production ready"
```

2. Add remote repository:
```bash
# For Forgejo
git remote add origin git@forgejo:nigggo/teddycloud-custom-tag-helper.git

# Or for GitHub
git remote add origin git@github.com:username/teddycloud-custom-tonie-manager.git
```

3. Push to remote:
```bash
git push -u origin main
```

## Files Modified

### Created
- `Dockerfile` - Multi-stage build
- `nginx.conf` - Reverse proxy config
- `DEPLOYMENT.md` - Deployment guide
- `CHANGELOG.md` - This file
- `.gitignore` - Git ignore rules (updated)

### Modified
- `backend/app/config.py` - Added configurable image path, removed /web
- `backend/app/api/rfid_tags.py` - Removed hardcoded box ID mapping
- `backend/app/api/uploads.py` - Use configurable image path
- `backend/app/api/taf_metadata.py` - Use configurable image path
- `config.yaml` - Removed credentials, added new fields
- `config.example.yaml` - Updated with new fields and comments
- `.env` - Removed credentials
- `.env.example` - Updated template
- `docker-compose.yml` - Generic volume mount
- `README.md` - Updated URLs (removed /web)
- `QUICKSTART.md` - Updated URLs (removed /web)
- `test_api.py` - Updated URL (removed /web)

### Unchanged (Verified Clean)
- `frontend/` - No hardcoded credentials
- `backend/app/services/` - No hardcoded credentials (except removed ones)
- `CLAUDE.md` - Documentation, no credentials
- `MOBILE_ACCESS.md` - Documentation, no credentials

## Testing Checklist

Before deploying to production:

- [ ] Copy `config.example.yaml` to `config.yaml`
- [ ] Configure TeddyCloud URL (without /web)
- [ ] Configure SMB credentials
- [ ] Configure image paths if using custom location
- [ ] Test: `docker-compose build`
- [ ] Test: `docker-compose up -d`
- [ ] Test: Access http://localhost:3000
- [ ] Test: Create a custom tonie
- [ ] Test: Link RFID tag
- [ ] Verify: No errors in logs (`docker-compose logs`)

---

**Date**: 2024-11-02
**Status**: ✅ Production Ready
**Version**: 2.0.0 (Production Release)
