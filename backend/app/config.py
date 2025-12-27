"""
Configuration management for Custom Tag Helper
Loads settings from config.yaml and environment variables

Priority (highest to lowest):
1. config.yaml (user's explicit configuration)
2. Environment variables (only if config.yaml has default value)
3. Default values
"""

import os
import yaml
import logging
from pathlib import Path
from typing import Optional, Dict, Any, Set
from pydantic import BaseModel
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)

# Track which config keys were set via environment variables
_env_sourced_keys: Set[str] = set()

# Default values for comparison
DEFAULT_TEDDYCLOUD_URL = "http://docker"
DEFAULT_DATA_PATH = "/data"


class TeddyCloudConfig(BaseModel):
    """TeddyCloud connection settings"""
    url: str = "http://docker"
    api_base: str = "/api"
    timeout: int = 30


class VolumesConfig(BaseModel):
    """Docker volume mount settings"""
    data_path: str = "/data"

    @property
    def config_path(self) -> Path:
        """Path to TeddyCloud config directory"""
        return Path(self.data_path) / "config"

    @property
    def library_path(self) -> Path:
        """Path to TeddyCloud library directory"""
        return Path(self.data_path) / "library"

    @property
    def content_path(self) -> Path:
        """Path to TeddyCloud content directory"""
        return Path(self.data_path) / "content" / "default"

    @property
    def custom_img_path(self) -> Path:
        """Path to store custom cover images (filesystem path)"""
        return Path(self.data_path) / "library" / "own" / "pics"

    @property
    def custom_img_json_path(self) -> str:
        """Path to use in tonie JSON pic field (relative to TeddyCloud)"""
        return "/library/own/pics"


class AppConfig(BaseModel):
    """Application behavior settings"""
    auto_parse_taf: bool = True
    confirm_before_save: bool = True
    auto_reload_config: bool = True
    default_language: str = "en-us"
    selected_box: Optional[str] = None
    max_image_size_mb: int = 5
    allowed_image_formats: list[str] = ["jpg", "jpeg", "png", "webp"]
    show_hidden_files: bool = False
    recursive_scan: bool = True


class AdvancedConfig(BaseModel):
    """Advanced settings"""
    parse_cover_from_taf: bool = True
    extract_track_names: bool = True
    log_level: str = "INFO"
    cache_taf_metadata: bool = True
    cache_ttl_seconds: int = 300


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables and config file
    """
    teddycloud: TeddyCloudConfig = TeddyCloudConfig()
    volumes: VolumesConfig = VolumesConfig()
    app: AppConfig = AppConfig()
    advanced: AdvancedConfig = AdvancedConfig()
    # Flag to track if setup wizard has been completed
    setup_completed: bool = False

    class Config:
        env_prefix = ""
        case_sensitive = False


def load_config(config_path: str = "/config/config.yaml") -> Settings:
    """
    Load configuration from YAML file and environment variables

    Priority (highest to lowest):
    1. config.yaml (user's explicit configuration)
    2. Environment variables (only if config.yaml has default/missing value)
    3. Default values

    Args:
        config_path: Path to config.yaml file

    Returns:
        Settings object with merged configuration
    """
    global _env_sourced_keys
    _env_sourced_keys = set()  # Reset on reload

    settings_dict = {}
    yaml_loaded = False

    logger.info("=" * 60)
    logger.info("CONFIGURATION LOADING - START")
    logger.info("=" * 60)

    # Log environment variables first
    env_teddycloud_url = os.getenv('TEDDYCLOUD_URL')
    env_data_path = os.getenv('TEDDYCLOUD_DATA_PATH')
    logger.info(f"Environment TEDDYCLOUD_URL: {env_teddycloud_url or '(not set)'}")
    logger.info(f"Environment TEDDYCLOUD_DATA_PATH: {env_data_path or '(not set)'}")

    # Load from YAML if it exists
    config_file = Path(config_path)
    logger.info(f"Looking for config file at: {config_path}")

    if config_file.exists():
        try:
            with open(config_file, 'r') as f:
                yaml_config = yaml.safe_load(f)
                if yaml_config:
                    settings_dict = yaml_config
                    yaml_loaded = True
                    logger.info(f"Successfully loaded config from {config_path}")

                    # Log what we found in YAML
                    yaml_tc_url = settings_dict.get('teddycloud', {}).get('url')
                    yaml_data_path = settings_dict.get('volumes', {}).get('data_path')
                    logger.info(f"YAML teddycloud.url: {yaml_tc_url or '(not set)'}")
                    logger.info(f"YAML volumes.data_path: {yaml_data_path or '(not set)'}")

                    # Legacy cleanup - migrate old config structure (pre-v1.1)
                    if "volumes" in settings_dict:
                        volumes = settings_dict["volumes"]
                        for old_field in ["enabled", "config_path", "library_path", "custom_img_path", "custom_img_json_path"]:
                            if old_field in volumes:
                                del volumes[old_field]
                                logger.debug(f"Removed deprecated volumes.{old_field} from config")
                        if "data_path" not in volumes:
                            volumes["data_path"] = DEFAULT_DATA_PATH

                    if "smb" in settings_dict:
                        del settings_dict["smb"]
                        logger.info("Removed deprecated SMB configuration section from config")
                else:
                    logger.warning(f"Config file {config_path} is empty")
        except Exception as e:
            logger.warning(f"Failed to load config from {config_path}: {e}")
    else:
        logger.warning(f"Config file not found at {config_path}")

    # Determine final values with proper priority
    # Priority: config.yaml > env vars (if yaml has non-default) OR env vars > defaults (if yaml missing/default)

    # TeddyCloud URL
    yaml_tc_url = settings_dict.get('teddycloud', {}).get('url')
    if yaml_tc_url and yaml_tc_url != DEFAULT_TEDDYCLOUD_URL:
        # YAML has explicit non-default value - use it, ignore env var
        logger.info(f"Using teddycloud.url from config.yaml: {yaml_tc_url}")
    elif env_teddycloud_url and env_teddycloud_url != DEFAULT_TEDDYCLOUD_URL:
        # YAML missing or has default, env var has non-default value - use env var
        if 'teddycloud' not in settings_dict:
            settings_dict['teddycloud'] = {}
        settings_dict['teddycloud']['url'] = env_teddycloud_url
        _env_sourced_keys.add('teddycloud.url')
        logger.info(f"Using teddycloud.url from environment variable: {env_teddycloud_url}")
    else:
        logger.info(f"Using default teddycloud.url: {DEFAULT_TEDDYCLOUD_URL}")

    # Data path
    yaml_data_path = settings_dict.get('volumes', {}).get('data_path')
    if yaml_data_path and yaml_data_path != DEFAULT_DATA_PATH:
        # YAML has explicit non-default value - use it
        logger.info(f"Using volumes.data_path from config.yaml: {yaml_data_path}")
    elif env_data_path and env_data_path != DEFAULT_DATA_PATH:
        # YAML missing or has default, env var has non-default value - use env var
        if 'volumes' not in settings_dict:
            settings_dict['volumes'] = {}
        settings_dict['volumes']['data_path'] = env_data_path
        _env_sourced_keys.add('volumes.data_path')
        logger.info(f"Using volumes.data_path from environment variable: {env_data_path}")
    else:
        logger.info(f"Using default volumes.data_path: {DEFAULT_DATA_PATH}")

    # Create Settings object
    try:
        settings = Settings(**settings_dict)
        logger.info("-" * 60)
        logger.info("FINAL CONFIGURATION:")
        logger.info(f"  TeddyCloud URL: {settings.teddycloud.url}")
        logger.info(f"  Data Path: {settings.volumes.data_path}")
        logger.info(f"  Env-sourced keys: {_env_sourced_keys or '(none)'}")
        logger.info("=" * 60)
        logger.info("CONFIGURATION LOADING - COMPLETE")
        logger.info("=" * 60)
        return settings
    except Exception as e:
        logger.error(f"Failed to create settings: {e}")
        return Settings()


def get_env_sourced_keys() -> Set[str]:
    """Get the set of config keys that were set via environment variables"""
    return _env_sourced_keys.copy()


# Global settings instance
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get or initialize global settings instance"""
    global _settings
    if _settings is None:
        _settings = load_config()
        # Configure logging
        logging.basicConfig(
            level=getattr(logging, _settings.advanced.log_level),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
    return _settings
