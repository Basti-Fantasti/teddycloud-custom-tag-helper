"""
API routes for TAF metadata extraction and cover search
"""

import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional

from ..services.filename_parser import FilenameParser
from ..services.metadata_search import MetadataSearchService
from ..services.teddycloud_client import TeddyCloudClient
from ..config import get_settings, Settings
from pathlib import Path
import hashlib

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/taf-metadata", tags=["taf-metadata"])


class CoverImage(BaseModel):
    """Cover image search result"""
    url: str
    thumbnail: str
    title: str
    score: float = 0.0
    width: int = 0
    height: int = 0


class TAFMetadataResponse(BaseModel):
    """Response for TAF metadata extraction"""
    # TAF metadata
    audio_id: Optional[int] = None
    hash: Optional[str] = None
    size: int = 0
    track_count: Optional[int] = None
    track_seconds: Optional[List[int]] = None

    # Parsed from filename
    series: Optional[str] = None
    episode: Optional[str] = None
    author: Optional[str] = None
    category: Optional[str] = None

    # Cover search
    search_term: str
    suggested_covers: List[CoverImage] = []
    cover_confidence: float = 0.0  # 0-100, how confident we are about the top result


class CoverSearchRequest(BaseModel):
    """Request to search for covers"""
    search_term: str
    limit: int = 5


class CoverDownloadRequest(BaseModel):
    """Request to download and save a cover"""
    image_url: str


class CoverDownloadResponse(BaseModel):
    """Response for cover download"""
    success: bool
    filename: Optional[str] = None
    path: Optional[str] = None
    error: Optional[str] = None


@router.post("/parse", response_model=TAFMetadataResponse)
async def parse_taf_metadata(
    taf_filename: str,
    settings: Settings = Depends(get_settings)
):
    """
    Parse TAF file metadata and search for cover images

    Args:
        taf_filename: Name of the TAF file

    Returns:
        Parsed metadata with suggested cover images
    """
    try:
        # Normalize Unicode to NFC (composed form) to handle umlauts consistently
        import unicodedata
        taf_filename = unicodedata.normalize('NFC', taf_filename)

        logger.info(f"Parsing TAF metadata for: {taf_filename}")

        # Parse directory from filename if it contains a path
        from pathlib import Path
        file_path = Path(taf_filename)
        directory = str(file_path.parent) if file_path.parent != Path(".") else ""
        filename_only = file_path.name

        # Get TAF file metadata from TeddyCloud API
        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)

        # If file is in subdirectory, search in that directory
        file_index = await client.get_file_index(directory)
        await client.close()

        # Find the TAF file in the index
        # Normalize both forms to handle umlauts and special characters correctly
        taf_data = None
        filename_only_nfc = unicodedata.normalize('NFC', filename_only)
        filename_only_nfd = unicodedata.normalize('NFD', filename_only)

        for file_item in file_index.get("files", []):
            file_name = file_item.get("name", "")
            file_name_nfc = unicodedata.normalize('NFC', file_name)
            file_name_nfd = unicodedata.normalize('NFD', file_name)

            # Match by filename only (not full path), try both Unicode normalizations
            if (file_name == filename_only or
                file_name == taf_filename or
                file_name_nfc == filename_only_nfc or
                file_name_nfd == filename_only_nfd or
                file_name_nfc == filename_only_nfd or
                file_name_nfd == filename_only_nfc):
                taf_data = file_item
                break

        if not taf_data:
            # List available files for debugging
            available_files = [f.get("name") for f in file_index.get("files", [])][:10]
            logger.error(f"TAF file not found: {taf_filename}. Available files: {available_files}")
            raise HTTPException(status_code=404, detail=f"TAF file not found: {taf_filename}")

        # Extract TAF metadata
        taf_header = taf_data.get("tafHeader", {})
        audio_id = taf_header.get("audioId")
        hash_value = taf_header.get("sha1Hash")
        track_seconds = taf_header.get("trackSeconds", [])

        # Parse filename (use only the filename without directory path)
        parser = FilenameParser()
        parsed = parser.parse_filename(filename_only)

        logger.info(f"Parsed filename: {parsed}")

        # Search for covers using proper metadata services (MusicBrainz, iTunes)
        metadata_service = MetadataSearchService()

        series = parsed.get('series') or ''
        episode = parsed.get('episode') or ''

        # Normalize series name for better matching
        if series:
            series = parser.normalize_series_name(series)

        logger.info(f"Searching covers for: series='{series}', episode='{episode}'")

        # Search using series and episode
        covers = await metadata_service.search_covers(series, episode, limit=5)

        # Calculate confidence based on source quality
        cover_confidence = 0.0
        if covers:
            # MusicBrainz and iTunes results are high quality
            top_source = covers[0].get('source', '')
            if 'MusicBrainz' in top_source:
                cover_confidence = 90.0
            elif 'iTunes' in top_source:
                cover_confidence = 85.0
            else:
                cover_confidence = 70.0

            # Adjust based on number of results
            if len(covers) >= 3:
                cover_confidence = min(cover_confidence + 5, 95)

        # Generate fallback search term for manual refinement
        search_terms = parser.extract_search_terms(filename_only, parsed)
        primary_search_term = search_terms[0] if search_terms else f"{series} {episode}"

        # Normalize series name
        series = parsed.get('series')
        if series:
            series = parser.normalize_series_name(series)

        return TAFMetadataResponse(
            audio_id=audio_id,
            hash=hash_value,
            size=taf_data.get("size", 0),
            track_count=len(track_seconds) if track_seconds else None,
            track_seconds=track_seconds,
            series=series,
            episode=parsed.get('episode'),
            author=parsed.get('author'),
            category=parsed.get('category'),
            search_term=primary_search_term,
            suggested_covers=[CoverImage(**c) for c in covers],
            cover_confidence=cover_confidence
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to parse TAF metadata: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search-covers", response_model=List[CoverImage])
async def search_covers(request: CoverSearchRequest):
    """
    Search for cover images with a custom search term

    Args:
        request: Search parameters

    Returns:
        List of cover image results
    """
    try:
        logger.info(f"Searching covers: {request.search_term}")

        metadata_service = MetadataSearchService()

        # Parse search term to extract series and episode if possible
        parts = request.search_term.split()
        series = " ".join(parts[:-1]) if len(parts) > 1 else request.search_term
        episode = parts[-1] if len(parts) > 1 and parts[-1].isdigit() else None

        covers = await metadata_service.search_covers(series, episode, limit=request.limit)

        return [CoverImage(**c) for c in covers]

    except Exception as e:
        logger.error(f"Failed to search covers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download-cover", response_model=CoverDownloadResponse)
async def download_cover(
    request: CoverDownloadRequest,
    settings: Settings = Depends(get_settings)
):
    """
    Download a cover image and save it to the custom images directory

    Args:
        request: Image URL to download

    Returns:
        Filename and path of saved image
    """
    try:
        logger.info(f"Downloading cover from: {request.image_url}")

        metadata_service = MetadataSearchService()
        image_data = await metadata_service.download_image(request.image_url)

        if not image_data:
            return CoverDownloadResponse(
                success=False,
                error="Failed to download image"
            )

        # Generate unique filename based on URL hash
        url_hash = hashlib.md5(request.image_url.encode()).hexdigest()[:8]
        filename = f"cover_{url_hash}.jpg"

        # Save directly to library/own/pics (accessible via TeddyCloud web UI)
        save_path = settings.volumes.custom_img_path / filename
        save_path.parent.mkdir(parents=True, exist_ok=True)

        with open(save_path, 'wb') as f:
            f.write(image_data)

        logger.info(f"Cover saved: {filename}")

        # Return path with leading slash for TeddyCloud compatibility
        json_path = settings.volumes.custom_img_json_path

        return CoverDownloadResponse(
            success=True,
            filename=filename,
            path=f"{json_path}/{filename}" if not json_path.endswith("/") else f"{json_path}{filename}"
        )

    except Exception as e:
        logger.error(f"Failed to download cover: {e}")
        return CoverDownloadResponse(
            success=False,
            error=str(e)
        )
