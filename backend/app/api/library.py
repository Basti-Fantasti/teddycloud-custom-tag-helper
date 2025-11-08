"""
API routes for browsing the library
"""

import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from pathlib import Path
from io import BytesIO

from ..models.schemas import LibraryBrowseResponse, ParseTAFRequest, ParseTAFResponse, TAFMetadata
from ..services.taf_parser import TAFParser
from ..config import get_settings, Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/library", tags=["library"])


@router.get("/browse", response_model=LibraryBrowseResponse)
async def browse_library(
    path: str = Query("", description="Path relative to library root"),
    settings: Settings = Depends(get_settings)
):
    """
    Browse the library directory via TeddyCloud API

    Args:
        path: Directory path to browse

    Returns:
        List of files and directories
    """
    try:
        from ..services.teddycloud_client import TeddyCloudClient
        from ..models.schemas import LibraryFile

        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)

        # Get file index from TeddyCloud API
        file_index = await client.get_file_index(path)
        await client.close()

        # Parse the response and convert to our format
        items = []

        # Process directories
        for dir_item in file_index.get("directories", []):
            items.append(LibraryFile(
                name=dir_item.get("name", ""),
                path=dir_item.get("path", ""),
                is_directory=True,
                size=None,
                is_taf=False
            ))

        # Process files
        for file_item in file_index.get("files", []):
            filename = file_item.get("name", "")
            file_size = file_item.get("size")

            # TeddyCloud API sometimes marks directories as files
            # Detect by size (4096 bytes is typical directory size) and lack of extension
            is_probably_dir = (
                file_size == 4096 and
                not filename.lower().endswith(('.taf', '.jpg', '.png', '.json', '.txt', '.log')) and
                not (filename.startswith('.') and '.' in filename[1:])  # Exclude hidden files like ._.DS_Store
            )

            items.append(LibraryFile(
                name=filename,
                path=file_item.get("path", ""),
                is_directory=is_probably_dir,
                size=file_size if not is_probably_dir else None,
                is_taf=filename.lower().endswith('.taf')
            ))

        # Sort: directories first, then files
        items.sort(key=lambda x: (not x.is_directory, x.name.lower()))

        # Determine parent path
        parent_path = None
        if path:
            parent = str(Path(path).parent)
            parent_path = "" if parent == "." else parent

        return LibraryBrowseResponse(
            current_path=path,
            parent_path=parent_path,
            items=items
        )

    except Exception as e:
        logger.error(f"Failed to browse library via TeddyCloud API: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/parse-taf", response_model=ParseTAFResponse)
async def parse_taf_file(
    request: ParseTAFRequest,
    settings: Settings = Depends(get_settings)
):
    """
    Parse a TAF file to extract metadata

    Args:
        request: TAF file path

    Returns:
        Extracted metadata including audio_id, hash, tracks, etc.
    """
    try:
        logger.info(f"Parsing TAF file: {request.path}")

        # Read TAF file from local filesystem
        taf_path = Path(settings.volumes.library_path) / request.path.lstrip("/")
        if not taf_path.exists():
            raise HTTPException(status_code=404, detail="TAF file not found")
        parser = TAFParser(file_path=str(taf_path))

        # Parse
        metadata = parser.parse()

        # Extract cover if present
        cover_filename = None
        cover_extracted = False

        if metadata.get("cover_image") and settings.advanced.parse_cover_from_taf:
            # Save cover image
            cover_data = metadata.pop("cover_image")
            cover_filename = f"taf_{metadata['audio_id']}.jpg"

            cover_path = Path(settings.volumes.custom_img_path) / cover_filename
            cover_path.parent.mkdir(parents=True, exist_ok=True)

            with open(cover_path, 'wb') as f:
                f.write(cover_data)

            cover_extracted = True
            logger.info(f"Extracted cover image: {cover_filename}")

        # Convert to response model
        taf_metadata = TAFMetadata(
            audio_id=metadata.get("audio_id", 0),
            hash=metadata.get("hash", ""),
            size=metadata.get("size", 0),
            tracks=metadata.get("tracks", 1),
            confidence=metadata.get("confidence", 0),
            filename=metadata.get("filename", Path(request.path).name),
            has_cover=cover_extracted
        )

        return ParseTAFResponse(
            success=True,
            metadata=taf_metadata,
            cover_extracted=cover_extracted,
            cover_filename=cover_filename
        )

    except Exception as e:
        logger.error(f"Failed to parse TAF file: {e}")
        return ParseTAFResponse(
            success=False,
            error=str(e)
        )