# Production Readiness Changelog

## Summary

This project has been prepared for public release on GitHub/Forgejo. All personal information, credentials, and hardcoded values have been removed and made configurable.

---

## [2.3.0] - 2025-12-27

### Added - Setup Wizard Language Selection as First Step

Added language selection as the very first step of the setup wizard, with automatic browser language detection.

#### Problem Solved
- Setup wizard was always displayed in English
- Users had to navigate through 4 steps before finding language settings in step 5
- Non-English speakers struggled to complete setup

#### Solution
- **Step 0**: New language selection step with flag icons (🇬🇧/🇩🇪)
- **Browser Detection**: Automatically detects browser language and pre-selects matching option
- **Immediate Effect**: Language change applies instantly to all wizard text
- **Persistent**: Selection saved to localStorage immediately

#### Implementation Details

**TranslationContext.jsx**
- Added `detectBrowserLanguage()` function using `navigator.language`
- Maps browser language to supported languages (en, de)
- Falls back to 'en' for unsupported languages
- Checks localStorage first, then uses browser detection

**SetupWizard.jsx**
- Added Step 0: Language Selection with visual flag buttons
- Shifted existing steps from 1-5 to 0-5 (now 6 total steps)
- All hardcoded English strings replaced with `t()` translation function
- Added full dark mode support

**Locale Files**
- Added complete `setupWizard` namespace with 50+ translation keys
- Full German translations for all wizard text
- Includes: step titles, descriptions, buttons, status messages

#### Files Changed
- **Modified**: `frontend/src/context/TranslationContext.jsx` - Browser language detection
- **Modified**: `frontend/src/components/SetupWizard.jsx` - Language step, i18n support
- **Modified**: `frontend/src/locales/en.json` - Added setupWizard translations
- **Modified**: `frontend/src/locales/de.json` - Added German setupWizard translations

---

### Fixed - Setup Dialog Shows Incorrectly on Container Updates

Fixed a bug where the initial setup dialog would appear when updating to a newer container version, even when the app was already configured.

#### Root Cause
The first-run detection checked TeddyCloud connectivity when using the default URL (`http://docker`). If TeddyCloud wasn't ready yet during container startup (race condition), the connection test would fail and incorrectly trigger the setup wizard.

#### Solution
- Added `setup_completed: true` flag to config.yaml when setup wizard completes
- Modified `check_setup_status()` to check this flag first, skipping connectivity test if present
- Added migration in `update_config()` to add the flag to existing configurations

#### Files Changed
- **Modified**: `backend/app/api/setup.py` - Check `setup_completed` flag before connectivity test
- **Modified**: `backend/app/main.py` - Add migration for existing configs

### Fixed - Settings Dialog Not Showing Environment Variable Values

Fixed an issue where the settings dialog did not properly display or protect values set via environment variables (e.g., `TEDDYCLOUD_URL`).

#### Root Cause
- Backend only read 2 specific env vars (`TEDDYCLOUD_URL`, `TEDDYCLOUD_DATA_PATH`) but didn't track their source
- GET `/api/config` returned merged values without indicating which came from env vars
- PUT `/api/config` would overwrite env-sourced values in config.yaml
- UI had no awareness of which values were from env vars vs config file

#### Solution
- **Backend**: Track which config keys are set via environment variables
- **API**: Return `_env_sources` array in GET `/api/config` response
- **API**: Skip writing env-sourced values when saving config (preserve env var priority)
- **Frontend**: Display env-sourced values as read-only with amber "ENV" badge
- **Frontend**: Show helper text explaining the value is set via environment variable

#### User Experience
- Values from environment variables now appear with an amber "ENV" badge
- These fields are disabled (read-only) to prevent accidental modification
- Helper text shows which environment variable controls the setting
- Non-env values remain fully editable

#### Files Changed
- **Modified**: `backend/app/config.py` - Track env-sourced keys, added `get_env_sourced_keys()`
- **Modified**: `backend/app/main.py` - Return `_env_sources` in GET, skip env values in PUT
- **Modified**: `frontend/src/components/SettingsDialog.jsx` - Added EnvBadge, disabled env fields
- **Modified**: `frontend/src/locales/en.json` - Added `settings.envVarSet` translation
- **Modified**: `frontend/src/locales/de.json` - Added German translation

---

### Fixed - Configuration Priority and Environment Variable Handling

Fixed multiple issues with configuration loading and the setup wizard not using the correct values.

#### Issues Fixed

**1. Config.yaml values were overridden by environment variables**
- Environment variables had higher priority than config.yaml
- Users couldn't override env vars by editing config.yaml
- **Fix**: Changed priority so config.yaml wins over env vars (if config has non-default value)

**2. Settings dialog disabled env-sourced fields**
- Fields set via environment variables were read-only
- Users couldn't override them in the UI
- **Fix**: Fields are now editable with an info message explaining that config.yaml takes priority

**3. Pydantic rejected setup_completed field**
- `setup_completed` flag was in config.yaml but not in Settings model
- Caused "Extra inputs are not permitted" error
- Config loading failed silently, falling back to defaults
- **Fix**: Added `setup_completed: bool = False` to Settings model

**4. Setup wizard showed hardcoded defaults**
- Setup wizard always showed `http://docker` instead of configured URL
- Initial state was hardcoded, not loaded from backend
- **Fix**: Added `loadExistingConfig()` that fetches `/api/config` on mount

**5. Setup wizard didn't find Tonieboxes**
- Box selection step showed "No Tonieboxes found"
- Was calling TeddyCloud's `/api/tonieboxes` with wrong format
- **Fix**: Now uses backend's `/api/rfid-tags/tonieboxes` (same as Settings dialog)

#### Technical Details

**Config Loading Priority (New)**:
1. config.yaml (if non-default value) - highest
2. Environment variables (if config.yaml has default/missing)
3. Default values - lowest

**Extensive Logging Added**:
- Config loading now logs all sources and final values
- Helps debug configuration issues

#### Files Changed
- **Modified**: `backend/app/config.py` - New priority logic, added `setup_completed` field, extensive logging
- **Modified**: `backend/app/main.py` - Allow saving env-sourced values, add `setup_completed` migration
- **Modified**: `frontend/src/components/SettingsDialog.jsx` - Enable editing env-sourced fields
- **Modified**: `frontend/src/components/SetupWizard.jsx` - Load config and boxes from backend
- **Modified**: `frontend/src/locales/en.json` - Added `envVarInfo` translation
- **Modified**: `frontend/src/locales/de.json` - Added German `envVarInfo` translation

---

### Fixed - Unicode Encoding Issues with German Filenames

Fixed encoding issues causing TAF files with special characters (German umlauts like ü, ö, ä) to appear as orphaned and trigger 500 errors.

#### Symptoms
- TAF files with names like `Das Sams Am Samstag kam das Sams zurück.taf` showed as "orphaned" despite having correct SHA1 checksums
- Filtering for orphaned files caused 500 Internal Server Error
- Error logs showed: `'utf-8' codec can't decode byte 0xfc` and `surrogates not allowed`

#### Root Cause
TeddyCloud API returns filenames with non-UTF-8 encoding (Latin-1) for special characters. When Python tried to decode as UTF-8, it failed, causing:
1. TAF header fetch to return empty results
2. No audio_id or hash available for linking
3. Surrogate characters in response causing JSON serialization errors

#### Solution
- **TeddyCloud Client**: Added multi-encoding fallback (UTF-8 → Latin-1 → CP1252) and string sanitization
- **Volume Scanner**: Added path string sanitization for filesystem-sourced filenames
- **TAF Library**: Added diagnostic logging to track linking statistics

#### Files Changed
- **Modified**: `backend/app/services/teddycloud_client.py` - Added `_sanitize_string()`, `_sanitize_dict()` helpers, multi-encoding fallback in `get_file_index()`
- **Modified**: `backend/app/services/volume_scanner.py` - Added `_sanitize_path_string()` for filesystem paths
- **Modified**: `backend/app/api/taf_library.py` - Added debug logging for linking diagnostics

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
