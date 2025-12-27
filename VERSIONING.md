# Versioning

## Current Version: 2.3.0

## How to Update the Version

The application version is displayed in the footer of the web interface.

### To release a new version:

1. Update the version in `frontend/package.json`:
   ```json
   {
     "name": "custom-tonie-manager-frontend",
     "version": "X.Y.Z",
     ...
   }
   ```

2. Rebuild the frontend:
   ```bash
   cd frontend
   npm run build
   ```

3. Rebuild the Docker container:
   ```bash
   docker-compose build --no-cache
   docker-compose up -d
   ```

### Version Format

We use semantic versioning (SemVer): `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes or significant new features
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, minor improvements

### How it Works

The version is injected at build time via Vite's `define` feature (see `frontend/vite.config.js`). The version from `package.json` is read and made available as `__APP_VERSION__` throughout the application.
