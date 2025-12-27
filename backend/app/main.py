"""
Custom Tag Helper - Main FastAPI Application
"""

import os
import logging
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings, Settings, get_env_sourced_keys
from .models.schemas import StatusResponse
from .api import tonies, library, uploads, taf_library, images, taf_metadata, rfid_tags, setup
from .services.tonies_manager import ToniesManager
from .services.teddycloud_client import TeddyCloudClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Custom Tag Helper",
    description="Web interface for managing TeddyCloud custom tonies with TAF auto-parsing",
    version="1.0.0"
)

# CORS configuration - restrict to specific origins for security
# Set ALLOWED_ORIGINS env var for custom origins (comma-separated)
# Default allows same-origin only (empty list means browser enforces same-origin)
_allowed_origins = os.getenv("ALLOWED_ORIGINS", "").strip()
CORS_ORIGINS = [origin.strip() for origin in _allowed_origins.split(",") if origin.strip()] if _allowed_origins else []

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS else ["*"],  # Empty means same-origin; "*" for dev only
    allow_credentials=False,  # Don't send credentials cross-origin
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Include routers
app.include_router(tonies.router, prefix="/api")
app.include_router(library.router, prefix="/api")
app.include_router(uploads.router, prefix="/api")
app.include_router(taf_library.router, prefix="/api")
app.include_router(images.router, prefix="/api")
app.include_router(taf_metadata.router, prefix="/api")
app.include_router(rfid_tags.router, prefix="/api")
app.include_router(setup.router, prefix="/api")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Custom Tag Helper API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/api/status", response_model=StatusResponse)
async def status(settings: Settings = Depends(get_settings)):
    """
    Check status of all services

    Returns:
        Status of TeddyCloud connection, Library API, and Config
    """
    # Check TeddyCloud connection
    teddycloud_connected = False
    library_api_connected = False
    try:
        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)
        teddycloud_connected = await client.check_connection()

        # Check if we can access library via API
        if teddycloud_connected:
            try:
                file_index = await client.get_file_index("")
                library_api_connected = True
            except:
                pass

        await client.close()
    except Exception as e:
        logger.warning(f"TeddyCloud connection check failed: {e}")

    # Check config file (via TeddyCloud API)
    config_readable = False
    try:
        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)
        tonies = await client.get_tonies_custom_json()
        config_readable = True
        await client.close()
    except Exception as e:
        logger.warning(f"Config file check failed: {e}")

    return StatusResponse(
        status="ok" if all([teddycloud_connected, library_api_connected, config_readable]) else "degraded",
        teddycloud_connected=teddycloud_connected,
        library_api_connected=library_api_connected,
        config_readable=config_readable
    )


@app.get("/api/config")
async def get_config(settings: Settings = Depends(get_settings)):
    """
    Get application configuration

    Returns:
        Configuration settings including which values are set via environment variables
    """
    env_sources = get_env_sourced_keys()
    return {
        "teddycloud": {
            "url": settings.teddycloud.url,
            "timeout": settings.teddycloud.timeout
        },
        "app": {
            "auto_parse_taf": settings.app.auto_parse_taf,
            "default_language": settings.app.default_language,
            "selected_box": settings.app.selected_box
        },
        "_env_sources": list(env_sources)  # Keys that were set via environment variables
    }


@app.put("/api/config")
async def update_config(config_data: dict):
    """
    Update application configuration

    Args:
        config_data: New configuration values

    Returns:
        Success status

    Note:
        Config.yaml values take priority over environment variables.
        Saving here will persist the new value in config.yaml, which will
        override any environment variable setting on next reload.
    """
    import yaml
    from pathlib import Path
    from .config import load_config

    try:
        config_file = Path("/config/config.yaml")

        # Read current config
        with open(config_file) as f:
            config = yaml.safe_load(f) or {}

        logger.info(f"Updating config - received: {config_data}")

        # Legacy cleanup - migrate old config structure to new simplified one (pre-v1.1)
        if "volumes" in config:
            volumes = config["volumes"]
            # Remove deprecated multi-path volume fields
            deprecated_fields = ["enabled", "config_path", "library_path", "custom_img_path", "custom_img_json_path"]
            for field in deprecated_fields:
                if field in volumes:
                    del volumes[field]
                    logger.debug(f"Removed deprecated volumes.{field} from config during save")
            # Ensure data_path exists
            if "data_path" not in volumes:
                volumes["data_path"] = "/data"

        # Legacy cleanup - remove deprecated SMB configuration (SMB support removed in v1.1)
        if "smb" in config:
            del config["smb"]
            logger.info("Removed deprecated SMB section from config during save")

        # Update config with new values
        # Note: We no longer skip env-sourced values since config.yaml now takes priority
        if "teddycloud" in config_data:
            config.setdefault("teddycloud", {})
            for key, value in config_data["teddycloud"].items():
                config["teddycloud"][key] = value
                logger.info(f"Setting teddycloud.{key} = {value}")

        if "app" in config_data:
            config.setdefault("app", {})
            for key, value in config_data["app"].items():
                config["app"][key] = value
                logger.info(f"Setting app.{key} = {value}")

        # Migrate existing configs: add setup_completed flag if missing
        # This prevents the setup wizard from showing on container restarts
        if "setup_completed" not in config:
            config["setup_completed"] = True
            logger.info("Added setup_completed flag to existing configuration")

        # Write updated config
        with open(config_file, 'w') as f:
            yaml.dump(config, f, default_flow_style=False, allow_unicode=True)

        # Reload settings from file to update in-memory cache
        global _settings
        from . import config as config_module
        config_module._settings = load_config()

        logger.info("Configuration updated and reloaded successfully")
        skipped = [k for k in env_sources if any(k.startswith(p) for p in ['teddycloud.', 'app.'])]
        return {
            "status": "success",
            "message": "Configuration updated",
            "env_preserved": skipped  # Inform client which values were preserved
        }

    except Exception as e:
        logger.error(f"Failed to update configuration: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/restart")
async def restart_backend():
    """
    Restart the backend container

    Returns:
        Success status
    """
    import sys
    import asyncio

    logger.info("Restart requested - exiting process (Docker will restart)")

    # Schedule exit after response is sent
    async def delayed_exit():
        await asyncio.sleep(0.5)  # Give time for response to be sent
        sys.exit(0)

    # Start the delayed exit task
    asyncio.create_task(delayed_exit())

    # Return response first
    return {"status": "success", "message": "Backend restarting..."}


@app.post("/api/reload-teddycloud")
async def reload_teddycloud(settings: Settings = Depends(get_settings)):
    """
    Trigger TeddyCloud to reload configuration and tonies.json

    Returns:
        Success status
    """
    try:
        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)
        success = await client.trigger_config_reload()
        await client.close()

        if success:
            return {"status": "success", "message": "TeddyCloud configuration reloaded"}
        else:
            return {"status": "warning", "message": "Reload triggered but may have failed"}

    except Exception as e:
        logger.error(f"Failed to reload TeddyCloud: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/test-connection")
async def test_connection(config_data: dict):
    """
    Test TeddyCloud connection with provided configuration

    Args:
        config_data: Configuration to test

    Returns:
        Connection test results
    """
    results = {
        "teddycloud": {"status": "unknown", "message": ""}
    }

    # Test TeddyCloud connection
    try:
        teddycloud_url = config_data.get("teddycloud", {}).get("url", "http://docker")
        client = TeddyCloudClient(teddycloud_url, "/api")
        connected = await client.check_connection()
        await client.close()

        if connected:
            results["teddycloud"]["status"] = "success"
            results["teddycloud"]["message"] = f"Connected to {teddycloud_url}"
        else:
            results["teddycloud"]["status"] = "error"
            results["teddycloud"]["message"] = "Connection failed"
    except Exception as e:
        results["teddycloud"]["status"] = "error"
        results["teddycloud"]["message"] = str(e)

    return results


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc)}
    )


@app.on_event("startup")
async def startup_event():
    """Startup event"""
    settings = get_settings()
    logger.info("=" * 50)
    logger.info("Custom Tag Helper Starting")
    logger.info("=" * 50)
    logger.info(f"TeddyCloud URL: {settings.teddycloud.url}")
    logger.info(f"Data Path: {settings.volumes.data_path}")
    logger.info("=" * 50)


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event"""
    logger.info("Custom Tag Helper Shutting Down")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
