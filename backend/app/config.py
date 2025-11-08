"""
Configuration management for Custom Tag Helper
Loads settings from config.yaml and environment variables
"""

import os
import yaml
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from pydantic import BaseModel
from pydantic_settings import BaseSettings

logger = logging.getLogger(__name__)


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

    class Config:
        env_prefix = ""
        case_sensitive = False


def load_config(config_path: str = "/config/config.yaml") -> Settings:
    """
    Load configuration from YAML file and environment variables

    Priority (highest to lowest):
    1. Environment variables
    2. config.yaml
    3. Default values

    Args:
        config_path: Path to config.yaml file

    Returns:
        Settings object with merged configuration
    """
    settings_dict = {}

    # Load from YAML if it exists
    config_file = Path(config_path)
    if config_file.exists():
        try:
            with open(config_file, 'r') as f:
                yaml_config = yaml.safe_load(f)
                if yaml_config:
                    settings_dict = yaml_config

                    # Migrate old config structure (from SMB era)
                    if "volumes" in settings_dict:
                        volumes = settings_dict["volumes"]
                        # Remove old fields
                        for old_field in ["enabled", "config_path", "library_path", "custom_img_path", "custom_img_json_path"]:
                            if old_field in volumes:
                                del volumes[old_field]
                        # Ensure data_path exists
                        if "data_path" not in volumes:
                            volumes["data_path"] = "/data"

                    # Remove SMB section
                    if "smb" in settings_dict:
                        del settings_dict["smb"]

                    logger.info(f"Loaded configuration from {config_path}")
        except Exception as e:
            logger.warning(f"Failed to load config from {config_path}: {e}")

    # Override with environment variables
    if os.getenv('TEDDYCLOUD_URL'):
        if 'teddycloud' not in settings_dict:
            settings_dict['teddycloud'] = {}
        settings_dict['teddycloud']['url'] = os.getenv('TEDDYCLOUD_URL')

    if os.getenv('TEDDYCLOUD_DATA_PATH'):
        if 'volumes' not in settings_dict:
            settings_dict['volumes'] = {}
        settings_dict['volumes']['data_path'] = os.getenv('TEDDYCLOUD_DATA_PATH')

    # Create Settings object
    try:
        settings = Settings(**settings_dict)
        logger.info("Configuration loaded successfully")
        logger.debug(f"TeddyCloud URL: {settings.teddycloud.url}")
        logger.debug(f"Data Path: {settings.volumes.data_path}")
        return settings
    except Exception as e:
        logger.error(f"Failed to create settings: {e}")
        # Return defaults if parsing fails
        return Settings()


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
