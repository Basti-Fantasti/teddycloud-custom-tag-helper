"""
API routes for TAF-centric library view
Shows all TAF files and which tonies (if any) they're linked to
"""

import logging
from fastapi import APIRouter, Depends
from typing import List, Dict, Any

from ..models.schemas import TAFLibraryResponse, TAFFileWithTonie, TonieModel
from ..services.teddycloud_client import TeddyCloudClient
from ..services.volume_scanner import VolumeScanner
from ..config import get_settings, Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/taf-library", tags=["taf-library"])


async def get_all_taf_files_recursive(client: TeddyCloudClient, path: str = "") -> List[Dict]:
    """
    Recursively get all TAF files from library and subdirectories

    Args:
        client: TeddyCloudClient instance
        path: Current path to scan

    Returns:
        List of all TAF files with their paths
    """
    all_files = []

    file_index = await client.get_file_index(path)

    # Get TAF files in current directory
    for file_item in file_index.get("files", []):
        if file_item.get("name", "").lower().endswith(".taf"):
            # Add folder prefix if in subdirectory
            full_path = f"{path}/{file_item['name']}" if path else file_item['name']
            file_item['full_path'] = full_path
            file_item['folder'] = path if path else ""
            all_files.append(file_item)

    # Recursively scan subdirectories
    for dir_item in file_index.get("directories", []):
        dir_name = dir_item.get("name", "")
        if dir_name and not dir_name.startswith('.'):  # Skip hidden folders
            subdir_path = f"{path}/{dir_name}" if path else dir_name
            subdir_files = await get_all_taf_files_recursive(client, subdir_path)
            all_files.extend(subdir_files)

    return all_files


@router.get("/", response_model=TAFLibraryResponse)
async def get_taf_library(settings: Settings = Depends(get_settings)):
    """
    Get TAF-centric library view: all TAF files with their linked tonies

    This is the primary view for managing content. Shows:
    - All TAF files in the library (including subdirectories)
    - Which custom tonie (if any) is linked to each TAF
    - Orphaned TAF files (not linked to any tonie)

    Returns:
        TAF files with linkage information
    """
    try:
        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)

        # Scan TAF files from mounted volume
        logger.info("Scanning TAF files from mounted volumes (includes subdirectories)...")
        scanner = VolumeScanner(settings.volumes.data_path)
        all_taf_files = scanner.scan_taf_files_recursive()

        # Fallback to API scanning if volume scan returns no files
        if not all_taf_files:
            logger.info("No files found via volume scan, falling back to TeddyCloud API (root level only)...")
            all_taf_files = await get_all_taf_files_recursive(client)

        # Get all tonies (both custom and official)
        tonies_custom_data = await client.get_tonies_custom_json()
        tonies_official_data = await client.get_tonies_json()

        # Combine both, with custom tonies taking precedence
        tonies_data = tonies_custom_data + tonies_official_data

        logger.info(f"Loaded {len(tonies_custom_data)} custom + {len(tonies_official_data)} official tonies")

        # Build tonie lookup by audio_id, hash, and model
        tonie_by_audio_id: Dict[int, TonieModel] = {}
        tonie_by_hash: Dict[str, TonieModel] = {}
        tonie_by_model: Dict[str, TonieModel] = {}

        for tonie_data in tonies_data:
            tonie = TonieModel(**tonie_data)

            # Index by audio_id (handle both list and single values)
            if tonie.audio_id:
                for aid in tonie.audio_id:
                    # Convert string to int if needed
                    try:
                        aid_int = int(aid) if isinstance(aid, str) else aid
                        tonie_by_audio_id[aid_int] = tonie
                    except (ValueError, TypeError):
                        pass

            # Index by hash
            if tonie.hash:
                for h in tonie.hash:
                    tonie_by_hash[h.lower()] = tonie

            # Index by model (for custom tonies linked via RFID tags)
            if tonie.model:
                tonie_by_model[tonie.model] = tonie

        # Enrich TAF files with metadata from TeddyCloud API
        # We need to get TAF headers from TeddyCloud
        logger.info("Enriching TAF files with metadata from TeddyCloud API...")
        enriched_taf_files = []
        for file_item in all_taf_files:
            try:
                # Extract directory from path
                file_path = file_item.get("name", "")
                if "/" in file_path:
                    directory = "/".join(file_path.split("/")[:-1])
                else:
                    directory = ""

                # Get file index for this directory from TeddyCloud
                file_index = await client.get_file_index(directory)
                filename = file_path.split("/")[-1]

                # Find matching file in index
                for api_file in file_index.get("files", []):
                    if api_file.get("name") == filename:
                        # Merge volume scanner data with API metadata
                        file_item["tafHeader"] = api_file.get("tafHeader", {})
                        break

                enriched_taf_files.append(file_item)
            except Exception as e:
                logger.warning(f"Failed to enrich {file_item.get('name')}: {e}")
                enriched_taf_files.append(file_item)

        all_taf_files = enriched_taf_files

        await client.close()

        # Process TAF files
        taf_files: List[TAFFileWithTonie] = []

        for file_item in all_taf_files:
            # Extract TAF metadata from TeddyCloud API response
            taf_header = file_item.get("tafHeader", {})
            audio_id = taf_header.get("audioId")
            hash_value = taf_header.get("sha1Hash", "").lower()
            track_seconds = taf_header.get("trackSeconds", [])

            # Find linked tonie via audio_id or hash
            linked_tonie = None

            if audio_id and audio_id in tonie_by_audio_id:
                linked_tonie = tonie_by_audio_id[audio_id]
            elif hash_value and hash_value in tonie_by_hash:
                linked_tonie = tonie_by_hash[hash_value]

            # Get display name and paths
            # Volume scanner provides: name (full path), filename (just file), folder (parent dir)
            # API scanner provides: name (filename), folder (parent dir path), full_path (combined)
            display_name = file_item.get("name", "")  # Volume scanner already has full path here
            path = file_item.get("path", display_name)
            folder = file_item.get("folder", "")

            # If folder is provided but display_name doesn't include it, combine them
            if folder and not "/" in display_name:
                display_name = f"{folder}/{display_name}"

            # Create TAF file entry
            taf_file = TAFFileWithTonie(
                name=display_name,
                path=path,
                size=file_item.get("size", 0),
                audio_id=audio_id,
                hash=hash_value if hash_value else None,
                track_count=len(track_seconds) if track_seconds else None,
                track_seconds=track_seconds if track_seconds else None,
                linked_tonie=linked_tonie,
                is_linked=linked_tonie is not None
            )

            taf_files.append(taf_file)

        # Sort: linked files first, then alphabetically
        taf_files.sort(key=lambda x: (not x.is_linked, x.name.lower()))

        # Calculate statistics
        total_count = len(taf_files)
        linked_count = sum(1 for f in taf_files if f.is_linked)
        orphaned_count = total_count - linked_count

        logger.info(f"TAF Library: {total_count} files, {linked_count} linked, {orphaned_count} orphaned")

        return TAFLibraryResponse(
            taf_files=taf_files,
            total_count=total_count,
            linked_count=linked_count,
            orphaned_count=orphaned_count
        )

    except Exception as e:
        logger.error(f"Failed to get TAF library: {e}")
        # Return empty response on error
        return TAFLibraryResponse(
            taf_files=[],
            total_count=0,
            linked_count=0,
            orphaned_count=0
        )
