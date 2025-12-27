"""
Batch processing API endpoints for TAF files.
Enables efficient creation of multiple tonie entries.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException

from ..config import get_settings, Settings
from ..models.schemas import (
    BatchAnalyzeRequest,
    BatchAnalyzeResponse,
    TAFMatchResultModel,
    MatchCandidateModel,
    MetadataSearchRequest,
    MetadataSearchResponse,
    MetadataSearchResultItem,
    BatchProcessRequest,
    BatchProcessResponse,
    ProcessedItemResult,
)
from ..services.teddycloud_client import TeddyCloudClient
from ..services.batch_processing_service import BatchProcessingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/batch", tags=["batch"])


async def get_batch_service(settings: Settings = Depends(get_settings)) -> BatchProcessingService:
    """Dependency to get batch processing service."""
    client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)
    return BatchProcessingService(client, settings)


@router.post("/analyze", response_model=BatchAnalyzeResponse)
async def analyze_batch(
    request: BatchAnalyzeRequest,
    service: BatchProcessingService = Depends(get_batch_service)
):
    """
    Analyze TAF files and match against official tonies.json database.

    This is the first step in batch processing:
    1. Parse TAF filenames to extract series/episode
    2. Get TAF headers (audio_id, hash) from TeddyCloud
    3. Match against official tonies.json database
    4. Return candidates ranked by confidence

    Files with confidence >= 95% are auto-selected.
    Files with no matches will need metadata search via /batch/search-metadata.
    """
    try:
        if not request.taf_paths:
            raise HTTPException(status_code=400, detail="No TAF paths provided")

        if len(request.taf_paths) > 100:
            raise HTTPException(status_code=400, detail="Maximum 100 files per batch")

        result = await service.analyze_batch(request.taf_paths)

        # Convert to response models
        results = []
        for r in result['results']:
            candidates = [
                MatchCandidateModel(**c) for c in r.get('candidates', [])
            ]
            best_match = None
            if r.get('best_match'):
                best_match = MatchCandidateModel(**r['best_match'])

            results.append(TAFMatchResultModel(
                taf_path=r['taf_path'],
                taf_name=r.get('taf_name', ''),
                audio_id=r.get('audio_id'),
                hash=r.get('hash'),
                parsed_series=r.get('parsed_series'),
                parsed_episode=r.get('parsed_episode'),
                candidates=candidates,
                best_match=best_match,
                auto_selected=r.get('auto_selected', False),
            ))

        return BatchAnalyzeResponse(
            results=results,
            total=result['total'],
            auto_matched=result['auto_matched'],
            needs_review=result['needs_review'],
            unmatched=result['unmatched'],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search-metadata", response_model=MetadataSearchResponse)
async def search_metadata_batch(
    request: MetadataSearchRequest,
    service: BatchProcessingService = Depends(get_batch_service)
):
    """
    Search MusicBrainz/iTunes for unmatched TAF files.

    Called for files that didn't match tonies.json.
    Respects MusicBrainz rate limit (1 req/sec).

    Returns cover art candidates from:
    1. MusicBrainz + Cover Art Archive
    2. iTunes Search API
    """
    try:
        if not request.items:
            return MetadataSearchResponse(results={}, searched=0, found=0)

        if len(request.items) > 50:
            raise HTTPException(status_code=400, detail="Maximum 50 items per search")

        # Convert to dicts for service
        items = [
            {
                'taf_path': item.taf_path,
                'series': item.series,
                'episode': item.episode,
            }
            for item in request.items
        ]

        result = await service.search_metadata_batch(items)

        # Convert to response models
        results = {}
        for taf_path, r in result['results'].items():
            results[taf_path] = MetadataSearchResultItem(
                taf_path=r['taf_path'],
                covers=r.get('covers', []),
                best_cover=r.get('best_cover'),
                confidence=r.get('confidence', 0.0),
            )

        return MetadataSearchResponse(
            results=results,
            searched=result['searched'],
            found=result['found'],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Metadata search failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process", response_model=BatchProcessResponse)
async def process_batch(
    request: BatchProcessRequest,
    service: BatchProcessingService = Depends(get_batch_service)
):
    """
    Process confirmed batch selections and create tonie entries.

    For each selection:
    1. Download cover image (CDN or external URL)
    2. Create tonie entry with auto-assigned model number
    3. Write to tonies.custom.json
    4. Trigger TeddyCloud config reload

    Uses atomic file writes for safety.
    Returns detailed results per item.
    """
    try:
        if not request.selections:
            return BatchProcessResponse(total=0, successful=0, failed=0, items=[])

        if len(request.selections) > 100:
            raise HTTPException(status_code=400, detail="Maximum 100 items per batch")

        # Convert to dicts for service
        selections = [
            {
                'taf_path': s.taf_path,
                'source': s.source,
                'tonie_index': s.tonie_index,
                'series': s.series,
                'episodes': s.episodes,
                'pic_url': s.pic_url,
                'audio_id': s.audio_id,
                'hash': s.hash,
                'language': s.language,
            }
            for s in request.selections
        ]

        result = await service.process_batch(selections)

        # Convert to response models
        items = [
            ProcessedItemResult(
                taf_path=item['taf_path'],
                success=item['success'],
                error=item.get('error'),
                model_number=item.get('model_number'),
                cover_path=item.get('cover_path'),
                tonie_entry=item.get('tonie_entry'),
            )
            for item in result['items']
        ]

        return BatchProcessResponse(
            total=result['total'],
            successful=result['successful'],
            failed=result['failed'],
            items=items,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_batch_stats(
    service: BatchProcessingService = Depends(get_batch_service)
):
    """
    Get statistics about the tonies.json matching database.
    """
    return service.matching_service.get_stats()
