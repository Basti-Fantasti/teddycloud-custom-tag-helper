"""
HTTP client for TeddyCloud API
"""

import json
import logging
from typing import Dict, Any, Optional, List

import httpx

logger = logging.getLogger(__name__)


class TeddyCloudClient:
    """Client for interacting with TeddyCloud API"""

    def __init__(self, base_url: str, api_base: str = "/api", timeout: int = 30):
        self.base_url = base_url.rstrip("/")
        self.api_base = api_base
        self.timeout = timeout
        self.client = httpx.AsyncClient(timeout=timeout)

    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()

    def _build_url(self, endpoint: str) -> str:
        """Build full API URL"""
        endpoint = endpoint.lstrip("/")
        # TeddyCloud API is at /api/ (without /web prefix)
        # If base_url contains /web, remove it for API calls
        base = self.base_url.rstrip("/")
        if base.endswith("/web"):
            base = base[:-4]
        return f"{base}{self.api_base}/{endpoint}"

    async def check_connection(self) -> bool:
        """
        Check if TeddyCloud is accessible

        Returns:
            True if connection successful
        """
        try:
            # TeddyCloud web UI is at /web, so check that endpoint
            # If base_url already has /web, use it as is
            # Otherwise append /web
            base = self.base_url.rstrip("/")
            if not base.endswith("/web"):
                url = f"{base}/web"
            else:
                url = base

            response = await self.client.get(url, timeout=5)
            logger.info(f"TeddyCloud connection check: {response.status_code}")
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"TeddyCloud not accessible: {e}")
            return False

    async def get_tonies_custom_json(self) -> List[Dict[str, Any]]:
        """
        Fetch tonies.custom.json via API

        Returns:
            List of custom tonie dictionaries
        """
        try:
            url = self._build_url("toniesCustomJson")
            response = await self.client.get(url)
            response.raise_for_status()

            data = response.json()
            logger.info(f"Fetched {len(data)} custom tonies from TeddyCloud")
            return data

        except Exception as e:
            logger.error(f"Failed to fetch tonies.custom.json: {e}")
            return []

    async def get_tonies_json(self) -> List[Dict[str, Any]]:
        """
        Fetch tonies.json (official tonies database) via API

        Returns:
            List of official tonie dictionaries
        """
        try:
            url = self._build_url("toniesJson")
            response = await self.client.get(url)
            response.raise_for_status()

            data = response.json()
            logger.info(f"Fetched {len(data)} official tonies from TeddyCloud")
            return data

        except Exception as e:
            logger.warning(f"Failed to fetch tonies.json (official tonies database): {e}")
            return []

    async def save_tonies_custom_json(self, tonies_data: List[Dict[str, Any]], config_path: str = None) -> bool:
        """
        Save tonies.custom.json via direct file write with atomic write protection

        Note: TeddyCloud API doesn't support writing via HTTP, so we write directly to file

        Args:
            tonies_data: List of custom tonie dictionaries
            config_path: Path to config directory (default: /data/config)

        Returns:
            True if successful
        """
        try:
            import tempfile
            import os
            from pathlib import Path

            # SECURITY: Validate config_path against whitelist
            allowed_paths = ["/data/config", "/config"]
            if not config_path:
                config_path = "/data/config"

            # Resolve and validate path
            resolved_path = str(Path(config_path).resolve())
            if not any(resolved_path.startswith(allowed) or resolved_path == allowed for allowed in allowed_paths):
                logger.error(f"Rejected invalid config path: {config_path}")
                return False

            config_file = Path(config_path) / "tonies.custom.json"

            # Create config directory if it doesn't exist
            config_file.parent.mkdir(parents=True, exist_ok=True)

            # Prepare JSON data
            json_str = json.dumps(tonies_data, indent=2, ensure_ascii=False)

            # SECURITY: Atomic write using temp file + rename
            # This prevents partial writes from corrupting the config
            try:
                # Create temp file in same directory for atomic rename
                fd, tmp_path = tempfile.mkstemp(
                    dir=config_file.parent,
                    prefix=".tonies.custom.",
                    suffix=".tmp"
                )
                try:
                    with os.fdopen(fd, 'w', encoding='utf-8') as f:
                        f.write(json_str)
                    # Atomic rename (on POSIX systems)
                    os.replace(tmp_path, config_file)
                except Exception:
                    # Clean up temp file on error
                    if os.path.exists(tmp_path):
                        os.unlink(tmp_path)
                    raise
            except OSError as e:
                # Fallback to direct write if temp file creation fails
                logger.warning(f"Atomic write failed, falling back to direct write: {e}")
                with open(config_file, 'w', encoding='utf-8') as f:
                    f.write(json_str)

            logger.info(f"Saved {len(tonies_data)} custom tonies to {config_file}")
            return True

        except Exception as e:
            logger.error(f"Failed to save tonies.custom.json: {e}")
            return False

    def _sanitize_string(self, s: str) -> str:
        """
        Sanitize a string to ensure it's valid UTF-8.
        Handles surrogate characters and invalid sequences.
        """
        if not isinstance(s, str):
            return s
        # Encode to UTF-8 with surrogateescape, then decode back
        # This replaces any surrogate characters with the replacement character
        try:
            return s.encode('utf-8', errors='surrogatepass').decode('utf-8', errors='replace')
        except (UnicodeEncodeError, UnicodeDecodeError):
            # Last resort: replace all non-ASCII with ?
            return ''.join(c if ord(c) < 128 else '?' for c in s)

    def _sanitize_dict(self, d: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively sanitize all strings in a dictionary.
        """
        result = {}
        for key, value in d.items():
            sanitized_key = self._sanitize_string(key) if isinstance(key, str) else key
            if isinstance(value, dict):
                result[sanitized_key] = self._sanitize_dict(value)
            elif isinstance(value, list):
                result[sanitized_key] = [
                    self._sanitize_dict(item) if isinstance(item, dict)
                    else self._sanitize_string(item) if isinstance(item, str)
                    else item
                    for item in value
                ]
            elif isinstance(value, str):
                result[sanitized_key] = self._sanitize_string(value)
            else:
                result[sanitized_key] = value
        return result

    async def get_file_index(self, path: str = "") -> Dict[str, Any]:
        """
        Get file index (library browser)

        Args:
            path: Path to browse (relative to library root)

        Returns:
            File index data with files and optional directories
        """
        try:
            url = self._build_url("fileIndexV2")
            # TeddyCloud API uses 'special=library' for library browsing
            # and 'path' for subdirectories
            params = {"special": "library"}
            if path:
                params["path"] = path

            response = await self.client.get(url, params=params)
            response.raise_for_status()

            # Handle potential encoding issues from TeddyCloud API
            # Some filenames may contain non-UTF-8 characters (e.g., German umlauts in Latin-1)
            try:
                # First try normal JSON parsing
                data = response.json()
            except (UnicodeDecodeError, ValueError) as e:
                logger.warning(f"JSON decode failed, trying alternative encoding: {e}")
                # Try decoding response bytes with different encodings
                content = response.content
                decoded_text = None

                # Try common encodings
                for encoding in ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
                    try:
                        decoded_text = content.decode(encoding)
                        break
                    except (UnicodeDecodeError, LookupError):
                        continue

                if decoded_text is None:
                    # Last resort: decode with replacement
                    decoded_text = content.decode('utf-8', errors='replace')

                data = json.loads(decoded_text)

            # Sanitize all strings in the response to ensure valid UTF-8
            data = self._sanitize_dict(data)

            # Ensure directories key exists (API may not always include it)
            if "directories" not in data:
                data["directories"] = []

            return data

        except Exception as e:
            logger.error(f"Failed to get file index: {e}")
            return {"files": [], "directories": []}

    async def trigger_config_reload(self) -> bool:
        """
        Trigger TeddyCloud to reload configuration

        Returns:
            True if successful
        """
        try:
            # First write config, then reload tonies JSON
            # Step 1: Trigger write config (ensures file is written)
            write_url = self._build_url("triggerWriteConfig")
            write_response = await self.client.get(write_url)  # Changed to GET!

            if write_response.status_code != 200:
                logger.warning(f"triggerWriteConfig returned status: {write_response.status_code}")

            # Step 2: Update/reload tonies JSON
            reload_url = self._build_url("toniesJsonUpdate")
            reload_response = await self.client.get(reload_url)  # This reloads tonies.json!

            if reload_response.status_code == 200:
                logger.info("Successfully triggered config write and tonies.json reload")
                return True
            else:
                logger.warning(f"toniesJsonUpdate returned status: {reload_response.status_code}")
                return False

        except Exception as e:
            logger.error(f"Failed to trigger config reload: {e}")
            return False

    async def upload_file(self, file_data: bytes, filename: str, path: str = "") -> bool:
        """
        Upload a file to TeddyCloud

        Args:
            file_data: File content bytes
            filename: Name of file
            path: Target path

        Returns:
            True if successful
        """
        try:
            url = self._build_url("fileUpload")

            files = {"file": (filename, file_data)}
            data = {"path": path} if path else {}

            response = await self.client.post(url, files=files, data=data)
            response.raise_for_status()

            logger.info(f"Uploaded file: {filename} to {path}")
            return True

        except Exception as e:
            logger.error(f"Failed to upload file: {e}")
            return False

    async def get_tag_index(self, box_id: str) -> List[Dict[str, Any]]:
        """
        Get all tags for a specific Toniebox from TeddyCloud

        Args:
            box_id: Toniebox ID (certificate ID from config.overlay.ini)

        Returns:
            List of tag dictionaries with complete info
        """
        try:
            url = self._build_url(f"getTagIndex?overlay={box_id}")
            response = await self.client.get(url)

            if response.status_code == 200:
                data = response.json()
                tags = data.get('tags', [])
                logger.info(f"Got {len(tags)} tags for box {box_id} from TeddyCloud")
                return tags
            else:
                logger.warning(f"Failed to get tag index for box {box_id}: {response.status_code}")
                return []

        except Exception as e:
            logger.error(f"Failed to get tag index for box {box_id}: {e}")
            return []

    async def get_last_ruid(self, box_id: str, content_path: str = None) -> Optional[str]:
        """
        Get the last played tag RUID for a specific Toniebox

        Tries multiple methods:
        1. internal.last_ruid API (seems to work without auth)
        2. Check filesystem modification times (fallback)

        Args:
            box_id: Toniebox ID (certificate ID from config.overlay.ini)
            content_path: Path to TeddyCloud content directory (default: /data/content/default)

        Returns:
            Last played RUID string or None if not available
        """
        try:
            # Method 1: Try internal.last_ruid API
            # Previous testing showed this returns 200 OK without authentication
            try:
                url = self._build_url(f"settings/get/internal.last_ruid?overlay={box_id}")
                response = await self.client.get(url, timeout=5)

                if response.status_code == 200:
                    ruid = response.text.strip().strip('"').lower()

                    # Validate it's a proper RUID (16 hex chars)
                    if ruid and len(ruid) == 16 and all(c in '0123456789abcdef' for c in ruid):
                        # Skip placeholders
                        if not ruid.startswith('00000001') and ruid != '0000000000000000':
                            logger.info(f"Found RUID from internal.last_ruid API: {ruid}")
                            return ruid

                logger.debug(f"internal.last_ruid returned invalid or empty: {response.status_code}")
            except Exception as e:
                logger.debug(f"internal.last_ruid API failed: {e}, trying filesystem")

            # Method 2: Filesystem fallback
            from pathlib import Path

            # Default content path
            if not content_path:
                content_path = "/data/content/default"

            content_dir = Path(content_path)

            if not content_dir.exists():
                logger.warning(f"Content directory not found: {content_path}")
                return None

            # Find all RFID tag config files (500304E0.json)
            latest_mtime = 0
            latest_ruid = None

            for uid_dir in content_dir.iterdir():
                if not uid_dir.is_dir():
                    continue

                # Check if this is a valid RFID UID directory (hex format)
                uid_name = uid_dir.name.upper()
                if not all(c in '0123456789ABCDEF' for c in uid_name):
                    continue

                # Skip placeholder UIDs
                if uid_name.startswith('00000001') or uid_name == '0000000000000000':
                    continue

                # Look for the tag config file
                tag_file = uid_dir / "500304E0.json"
                if not tag_file.exists():
                    continue

                # Get modification time
                mtime = tag_file.stat().st_mtime

                # Track the most recent one
                if mtime > latest_mtime:
                    latest_mtime = mtime
                    # RUID = directory name (8 chars) + "500304E0" (8 chars) = 16 chars total
                    latest_ruid = (uid_name + "500304E0").lower()

            if latest_ruid:
                logger.info(f"Found most recent tag from filesystem: {latest_ruid} (mtime: {latest_mtime})")
                return latest_ruid
            else:
                logger.info(f"No valid tags found")
                return None

        except Exception as e:
            logger.error(f"Failed to get last RUID for box {box_id}: {e}")
            return None
