"""
Direct volume scanner for TAF files and RFID tags
Fallback when TeddyCloud API doesn't respond properly
"""

import logging
import json
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class VolumeScanner:
    """Scan TeddyCloud volumes directly via filesystem"""

    def __init__(self, data_path: str):
        """
        Initialize volume scanner

        Args:
            data_path: Path to TeddyCloud data directory (e.g., /data)
        """
        self.data_path = Path(data_path)
        self.config_path = self.data_path / "config"
        self.library_path = self.data_path / "library"
        self.content_path = self.data_path / "content" / "default"

    def scan_taf_files_recursive(self) -> List[Dict[str, Any]]:
        """
        Recursively scan for all TAF files in library

        Returns:
            List of TAF file info dictionaries
        """
        taf_files = []

        if not self.library_path.exists():
            logger.warning(f"Library path not found: {self.library_path}")
            return []

        # Find all .taf files recursively
        try:
            taf_paths = list(self.library_path.rglob("*.taf"))
        except (PermissionError, OSError) as e:
            logger.warning(f"Permission error scanning library: {e}")
            taf_paths = []

        for taf_path in taf_paths:
            if taf_path.name.startswith("."):
                continue  # Skip hidden files

            # Get relative path from library root
            rel_path = taf_path.relative_to(self.library_path)

            # Determine folder (everything except filename)
            folder = str(rel_path.parent) if rel_path.parent != Path(".") else ""

            taf_files.append({
                "name": str(rel_path),  # Full path with folder prefix
                "path": str(rel_path),
                "filename": taf_path.name,
                "folder": folder,
                "size": taf_path.stat().st_size if taf_path.exists() else 0,
                # TAF metadata would need to be parsed from file - for now leave empty
                # This will be filled by TeddyCloud API if available
            })

        logger.info(f"Found {len(taf_files)} TAF files via volume scan")
        return sorted(taf_files, key=lambda x: x['name'].lower())

    def get_available_rfid_tags(self) -> List[Dict[str, Any]]:
        """
        Get list of all known RFID tags from content directory

        Returns:
            List of RFID tag info dictionaries with box_id
        """
        tags = []

        if not self.content_path.exists():
            logger.warning(f"Content path not found: {self.content_path}")
            return []

        # Each subdirectory in content/default is a Toniebox ID
        try:
            box_dirs = list(self.content_path.iterdir())
        except (PermissionError, OSError) as e:
            logger.warning(f"Permission error scanning content: {e}")
            return []

        for box_dir in box_dirs:
            try:
                if not box_dir.is_dir() or box_dir.name.startswith("."):
                    continue

                box_id = box_dir.name

                # Find all .json files in box directory (each file represents a tag)
                try:
                    json_files = list(box_dir.glob("*.json"))
                except (PermissionError, OSError) as e:
                    logger.debug(f"Cannot list files in {box_id}: {e}")
                    continue

                # Process each tag file
                for json_file in json_files:
                    if json_file.name.startswith("."):
                        continue

                    try:
                        with open(json_file) as f:
                            data = json.load(f)

                            # Extract UID from cloud_ruid (last 16 chars, format: 8ca9161f500304e0)
                            cloud_ruid = data.get("cloud_ruid", "")
                            uid = cloud_ruid[-16:].upper() if cloud_ruid else ""

                            # Validate RFID tag UID format
                            # Valid UIDs are 16 hex characters and typically end with E0
                            if not uid or len(uid) != 16:
                                logger.debug(f"Skipping invalid UID length: {uid}")
                                continue

                            # Check if UID is valid hex
                            try:
                                int(uid, 16)
                            except ValueError:
                                logger.debug(f"Skipping non-hex UID: {uid}")
                                continue

                            # Filter out config files like "box-en-gb-00-00000006"
                            # Real RFID tags end with E0
                            if not uid.endswith("E0"):
                                logger.debug(f"Skipping non-RFID file (UID doesn't end with E0): {uid}")
                                continue

                            model = data.get("tonie_model", "")
                            source = data.get("source", "")
                            nocloud = data.get("nocloud", False)

                            # Get file modification time to determine active tag
                            last_modified = json_file.stat().st_mtime

                            # Determine status
                            if not model:
                                status = "unconfigured"  # Creative Tonie not configured yet
                            elif not source:
                                status = "unassigned"  # Has model but no content
                            else:
                                status = "assigned"  # Has model and content

                            tags.append({
                                "uid": uid,
                                "box_id": box_id,
                                "model": model,
                                "source": source,
                                "nocloud": nocloud,
                                "status": status,
                                "is_custom": model.startswith("9000") if model else False,
                                "last_modified": last_modified
                            })
                    except (PermissionError, OSError, json.JSONDecodeError) as e:
                        logger.debug(f"Skipping tag file {json_file.name}: {e}")
                        continue
                    except Exception as e:
                        logger.error(f"Failed to read tag {json_file.name} in box {box_id}: {e}")
                        continue

            except Exception as e:
                logger.error(f"Failed to process box {box_dir.name}: {e}")
                continue

        logger.info(f"Found {len(tags)} RFID tags across all boxes")
        return tags

    def get_next_custom_model_number(self) -> str:
        """
        Get the next available custom tonie model number

        Returns:
            Next model number (e.g., "900002")
        """
        try:
            custom_json = self.config_path / "tonies.custom.json"
            if not custom_json.exists():
                return "900001"

            with open(custom_json) as f:
                tonies = json.load(f)

            # Find highest model number starting with 9000
            max_num = 900000
            for tonie in tonies:
                model = tonie.get("model", "")
                if model.startswith("9000"):
                    try:
                        num = int(model)
                        max_num = max(max_num, num)
                    except ValueError:
                        pass

            return str(max_num + 1)

        except Exception as e:
            logger.error(f"Failed to get next model number: {e}")
            return "900001"

    def update_rfid_tag(self, box_id: str, uid: str, model: str, source: str, nocloud: bool = True) -> bool:
        """
        Update or create RFID tag JSON file

        Args:
            box_id: Toniebox ID
            uid: Tag UID (used to find existing file if no JSON file exists yet)
            model: Tonie model number
            source: TAF file source path (e.g., "lib://path/to/file.taf")
            nocloud: Whether to mark as no-cloud mode

        Returns:
            True if successful, False otherwise
        """
        try:
            # Build tag directory path
            tag_dir = self.content_path / box_id

            if not tag_dir.exists():
                logger.error(f"Box directory not found: {tag_dir}")
                return False

            # TeddyCloud always uses 500304E0.json for the tag file
            tag_file = tag_dir / "500304E0.json"

            # Read existing data if file exists
            if tag_file.exists():
                with open(tag_file) as f:
                    data = json.load(f)
            else:
                # Create new tag data
                # We need a cloud_ruid - construct one with the UID
                data = {
                    "cloud_ruid": f"00000000{uid.lower()}",
                    "claimed": True
                }

            # Update fields
            data["tonie_model"] = model
            data["source"] = source
            data["nocloud"] = nocloud

            # Write updated data
            with open(tag_file, 'w') as f:
                json.dump(data, f, indent=2)

            logger.info(f"Updated RFID tag {uid} in box {box_id}: model={model}, source={source}")
            return True

        except Exception as e:
            logger.error(f"Failed to update RFID tag {uid} in box {box_id}: {e}")
            return False
