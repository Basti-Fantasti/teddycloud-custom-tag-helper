"""
API routes for managing custom tonies
"""

import logging
from typing import List
from fastapi import APIRouter, HTTPException, Depends

from ..models.schemas import TonieModel, TonieCreateRequest, TonieUpdateRequest
from ..services.tonies_manager import ToniesManager
from ..config import get_settings, Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tonies", tags=["tonies"])


def get_tonies_manager(settings: Settings = Depends(get_settings)) -> ToniesManager:
    """Dependency to get ToniesManager instance"""
    return ToniesManager(settings.volumes.config_path)


@router.get("/", response_model=List[TonieModel])
async def list_tonies(settings: Settings = Depends(get_settings)):
    """
    Get all custom tonies via TeddyCloud API

    Returns:
        List of custom tonies
    """
    try:
        from ..services.teddycloud_client import TeddyCloudClient

        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)
        tonies_data = await client.get_tonies_custom_json()
        await client.close()

        # Convert to TonieModel objects
        tonies = [TonieModel(**item) for item in tonies_data]
        logger.info(f"Loaded {len(tonies)} custom tonies from TeddyCloud API")
        return tonies
    except Exception as e:
        logger.error(f"Failed to list tonies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{no}", response_model=TonieModel)
async def get_tonie(no: str, manager: ToniesManager = Depends(get_tonies_manager)):
    """
    Get a specific tonie by ID

    Args:
        no: Tonie identifier

    Returns:
        Tonie data
    """
    tonie = manager.get_tonie_by_no(no)
    if not tonie:
        raise HTTPException(status_code=404, detail=f"Tonie with no '{no}' not found")
    return tonie


@router.post("/preview", response_model=TonieModel)
async def preview_tonie(
    tonie_data: TonieCreateRequest,
    manager: ToniesManager = Depends(get_tonies_manager),
    settings: Settings = Depends(get_settings)
):
    """
    Preview what the tonie JSON will look like without saving

    Args:
        tonie_data: Tonie metadata

    Returns:
        Preview of the tonie (not saved)
    """
    try:
        # Auto-assign model number if not provided
        model = tonie_data.model
        if not model or model.strip() == "":
            from ..services.volume_scanner import VolumeScanner
            scanner = VolumeScanner(settings.volumes.data_path)
            model = scanner.get_next_custom_model_number()
            logger.info(f"Auto-assigned model number for preview: {model}")

        # Create tonie object without saving
        preview_tonie = TonieModel(
            no=manager._get_next_no(),
            model=model,
            audio_id=[tonie_data.audio_id] if isinstance(tonie_data.audio_id, str) else tonie_data.audio_id,
            hash=[tonie_data.hash] if isinstance(tonie_data.hash, str) else tonie_data.hash,
            title=tonie_data.title or tonie_data.series,
            series=tonie_data.series,
            episodes=tonie_data.episodes,
            tracks=tonie_data.tracks,
            release="0",
            language=tonie_data.language,
            category="custom",
            pic=tonie_data.pic or ""
        )

        return preview_tonie

    except Exception as e:
        logger.error(f"Failed to preview tonie: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/", response_model=TonieModel, status_code=201)
async def create_tonie(
    tonie_data: TonieCreateRequest,
    settings: Settings = Depends(get_settings)
):
    """
    Create a new custom tonie

    Args:
        tonie_data: Tonie metadata

    Returns:
        Created tonie
    """
    try:
        from ..services.teddycloud_client import TeddyCloudClient

        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)

        # Get current tonies
        tonies_data = await client.get_tonies_custom_json()

        # Get next no
        next_no = "0"
        if tonies_data:
            try:
                max_no = max(int(t.get('no', 0)) for t in tonies_data if str(t.get('no', '')).isdigit())
                next_no = str(max_no + 1)
            except (ValueError, AttributeError):
                next_no = str(len(tonies_data))

        # Auto-assign model number if not provided
        if not tonie_data.model or tonie_data.model.strip() == "":
            from ..services.volume_scanner import VolumeScanner
            scanner = VolumeScanner(settings.volumes.data_path)
            tonie_data.model = scanner.get_next_custom_model_number()
            logger.info(f"Auto-assigned model number: {tonie_data.model}")

        # Check if model already exists (after auto-assignment)
        for existing in tonies_data:
            if existing.get('model') == tonie_data.model:
                await client.close()
                raise HTTPException(status_code=400, detail=f"Tonie with model '{tonie_data.model}' already exists")

        # Create new tonie
        new_tonie = {
            "no": next_no,
            "model": tonie_data.model,
            "audio_id": [tonie_data.audio_id] if isinstance(tonie_data.audio_id, str) else tonie_data.audio_id,
            "hash": [tonie_data.hash] if isinstance(tonie_data.hash, str) else tonie_data.hash,
            "title": tonie_data.title or tonie_data.series,
            "series": tonie_data.series,
            "episodes": tonie_data.episodes,
            "tracks": tonie_data.tracks if tonie_data.tracks else [],
            "release": "0",
            "language": tonie_data.language,
            "category": "custom",
            "pic": tonie_data.pic or ""
        }

        # Add to list
        tonies_data.append(new_tonie)

        # Save via direct file write
        success = await client.save_tonies_custom_json(tonies_data, settings.volumes.config_path)

        if not success:
            await client.close()
            raise HTTPException(status_code=500, detail="Failed to save tonies.custom.json")

        # Trigger config reload
        if settings.app.auto_reload_config:
            await client.trigger_config_reload()

        await client.close()

        logger.info(f"Created new tonie: {new_tonie['model']} (no: {new_tonie['no']})")
        return TonieModel(**new_tonie)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create tonie: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{no}", response_model=TonieModel)
async def update_tonie(
    no: str,
    update_data: TonieUpdateRequest,
    manager: ToniesManager = Depends(get_tonies_manager),
    settings: Settings = Depends(get_settings)
):
    """
    Update an existing tonie

    Args:
        no: Tonie identifier
        update_data: Fields to update

    Returns:
        Updated tonie
    """
    try:
        tonie = manager.update_tonie(no, update_data)

        # Trigger config reload if enabled
        if settings.app.auto_reload_config:
            manager.reload_teddycloud_config(settings.teddycloud.url)

        return tonie

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to update tonie: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{no}", status_code=204)
async def delete_tonie(
    no: str,
    manager: ToniesManager = Depends(get_tonies_manager),
    settings: Settings = Depends(get_settings)
):
    """
    Delete a tonie

    Args:
        no: Tonie identifier
    """
    success = manager.delete_tonie(no)
    if not success:
        raise HTTPException(status_code=404, detail=f"Tonie with no '{no}' not found")

    # Trigger config reload if enabled
    if settings.app.auto_reload_config:
        manager.reload_teddycloud_config(settings.teddycloud.url)

    return None
