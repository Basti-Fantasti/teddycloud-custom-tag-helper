"""
API routes for RFID tag management
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from ..services.volume_scanner import VolumeScanner
from ..config import get_settings, Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rfid-tags", tags=["rfid-tags"])


class LinkedTonie(BaseModel):
    """Linked tonie information"""
    series: str
    title: Optional[str] = None
    episodes: Optional[str] = None
    pic: Optional[str] = None
    category: str


class RFIDTag(BaseModel):
    """RFID tag information"""
    uid: str
    box_id: str
    model: str
    source: str
    status: str  # "unconfigured", "unassigned", "assigned"
    is_custom: bool
    nocloud: bool = False
    linked_tonie: Optional[LinkedTonie] = None
    last_modified: Optional[float] = None


class RFIDTagsResponse(BaseModel):
    """Response with RFID tags (paginated)"""
    tags: List[RFIDTag]
    total_count: int
    unconfigured_count: int
    unassigned_count: int
    assigned_count: int
    # Active tag - the one currently placed on the Toniebox
    active_tag_uid: Optional[str] = None
    # Pagination fields
    page: int = 1
    page_size: int = 50
    has_next: bool = False
    has_prev: bool = False
    # Error handling - allows frontend to distinguish between empty data and error
    error: Optional[str] = None
    success: bool = True


@router.get("/", response_model=RFIDTagsResponse)
async def get_rfid_tags(
    skip: int = 0,
    limit: int = 50,
    settings: Settings = Depends(get_settings)
):
    """
    Get known RFID tags from TeddyCloud content directory with pagination

    Args:
        skip: Number of items to skip (offset for pagination)
        limit: Maximum number of items to return (page size)

    Returns:
        Paginated list of RFID tags with their status
    """
    try:
        scanner = VolumeScanner(settings.volumes.data_path)
        tags_data = scanner.get_available_rfid_tags()

        # Fetch both custom and official tonies to link with RFID tags
        from ..services.teddycloud_client import TeddyCloudClient
        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)
        tonies_custom_data = await client.get_tonies_custom_json()
        tonies_official_data = await client.get_tonies_json()
        await client.close()

        # Combine both, with custom tonies taking precedence
        tonies_data = tonies_custom_data + tonies_official_data

        logger.info(f"Loaded {len(tonies_custom_data)} custom + {len(tonies_official_data)} official tonies for RFID tags")

        # Build lookup of tonies by model number
        tonie_by_model = {}
        for tonie_data in tonies_data:
            model = tonie_data.get('model')
            if model:
                tonie_by_model[model] = tonie_data

        # Enrich tags with linked tonie information
        tags = []
        for tag_data in tags_data:
            tag_model = tag_data.get('model')
            linked_tonie = None

            # Find linked tonie by model number
            if tag_model and tag_model in tonie_by_model:
                tonie = tonie_by_model[tag_model]
                linked_tonie = LinkedTonie(
                    series=tonie.get('series', ''),
                    title=tonie.get('title'),
                    episodes=tonie.get('episodes'),
                    pic=tonie.get('pic'),
                    category=tonie.get('category', 'custom')
                )

            tags.append(RFIDTag(
                **tag_data,
                linked_tonie=linked_tonie
            ))

        # Calculate statistics (on full dataset before pagination)
        total = len(tags)
        unconfigured = sum(1 for t in tags if t.status == "unconfigured")
        unassigned = sum(1 for t in tags if t.status == "unassigned")
        assigned = sum(1 for t in tags if t.status == "assigned")

        # Apply pagination
        paginated_tags = tags[skip:skip + limit]

        # Calculate pagination metadata
        page = (skip // limit) + 1 if limit > 0 else 1
        has_next = skip + limit < total
        has_prev = skip > 0

        logger.info(f"Found {total} RFID tags: {unconfigured} unconfigured, {unassigned} unassigned, {assigned} assigned (page {page}, showing {len(paginated_tags)})")

        return RFIDTagsResponse(
            tags=paginated_tags,
            total_count=total,
            unconfigured_count=unconfigured,
            unassigned_count=unassigned,
            assigned_count=assigned,
            page=page,
            page_size=limit,
            has_next=has_next,
            has_prev=has_prev
        )

    except Exception as e:
        logger.error(f"Failed to get RFID tags: {e}")
        # Return error response with details for frontend debugging
        return RFIDTagsResponse(
            tags=[],
            total_count=0,
            unconfigured_count=0,
            unassigned_count=0,
            assigned_count=0,
            success=False,
            error=f"Failed to load RFID tags: {str(e)}"
        )


@router.get("/next-model-number")
async def get_next_model_number(settings: Settings = Depends(get_settings)):
    """
    Get the next available custom tonie model number

    Returns:
        Next model number (e.g., "900002")
    """
    try:
        scanner = VolumeScanner(settings.volumes.data_path)
        next_number = scanner.get_next_custom_model_number()

        return {"next_model_number": next_number}

    except Exception as e:
        logger.error(f"Failed to get next model number: {e}")
        # Return default on error
        return {"next_model_number": "900001"}


@router.get("/tonieboxes")
async def get_tonieboxes(settings: Settings = Depends(get_settings)):
    """
    Get list of registered Tonieboxes from config.overlay.ini
    Maps certificate-based IDs to content directory IDs

    Returns:
        List of Toniebox objects with id and name
    """
    try:
        config_overlay_path = settings.volumes.config_path / "config.overlay.ini"
        content_path = settings.volumes.content_path

        if not config_overlay_path.exists():
            logger.warning(f"Config overlay not found: {config_overlay_path}")
            return {"boxes": []}

        # Get all content directory box IDs (MAC-based)
        content_box_ids = set()
        if content_path.exists():
            for box_dir in content_path.iterdir():
                try:
                    if box_dir.is_dir() and not box_dir.name.startswith('.'):
                        content_box_ids.add(box_dir.name)
                except (OSError, PermissionError) as e:
                    logger.debug(f"Skipping {box_dir.name}: {e}")
                    continue

        # Parse config.overlay.ini to get registered boxes
        # Format: overlay.{CERT_ID}.boxName=Name
        boxes = []
        with open(config_overlay_path, 'r') as f:
            lines = f.readlines()

        current_cert_id = None
        current_name = None

        for line in lines:
            line = line.strip()

            # Look for boxName entries
            if '.boxName=' in line and line.startswith('overlay.'):
                parts = line.split('=', 1)
                if len(parts) == 2:
                    key_parts = parts[0].split('.')
                    if len(key_parts) >= 3:
                        current_cert_id = key_parts[1]
                        current_name = parts[1]

                        # Try to find matching content box ID
                        # The cert ID (from config) often doesn't match the MAC-based ID (from content directory)
                        # We need to find the active box for this registered Toniebox

                        actual_box_id = None

                        # Check if cert ID itself exists in content
                        if current_cert_id in content_box_ids:
                            actual_box_id = current_cert_id
                        elif current_cert_id.lower() in {bid.lower() for bid in content_box_ids}:
                            # Try case-insensitive match
                            for bid in content_box_ids:
                                if bid.lower() == current_cert_id.lower():
                                    actual_box_id = bid
                                    break
                        else:
                            # If no match found and only one registered box, use it
                            if not actual_box_id and len(content_box_ids) == 1:
                                actual_box_id = list(content_box_ids)[0]
                                logger.info(f"Single box mapping: {current_name} ({current_cert_id}) -> {actual_box_id}")
                            elif not actual_box_id:
                                # Use cert ID as fallback
                                actual_box_id = current_cert_id
                                logger.warning(f"No mapping found for {current_name} ({current_cert_id}), using cert ID")

                        # Use cert ID for TeddyCloud API calls (overlay parameter)
                        boxes.append({"id": current_cert_id, "name": current_name})

        boxes.sort(key=lambda x: x['name'])
        logger.info(f"Found {len(boxes)} registered Tonieboxes")

        return {"boxes": boxes}

    except Exception as e:
        logger.error(f"Failed to get Tonieboxes: {e}")
        return {"boxes": []}


class LinkTagRequest(BaseModel):
    """Request to link an RFID tag to a TAF file"""
    tag_uid: str
    box_id: str
    model: str
    taf_path: str  # Relative path from library root


@router.post("/link")
async def link_rfid_tag(request: LinkTagRequest, settings: Settings = Depends(get_settings)):
    """
    Link an RFID tag to a TAF file

    Args:
        request: Link request with tag UID, box ID, model, and TAF path

    Returns:
        Success message or error
    """
    try:
        scanner = VolumeScanner(settings.volumes.data_path)

        # The box_id might be a certificate ID, but we need the MAC-based directory ID
        # Find the actual directory where this tag exists by scanning for the UID
        content_path = settings.volumes.content_path

        actual_box_id = None
        # Search for a directory containing a file with this UID's cloud_ruid
        for box_dir in content_path.iterdir():
            if not box_dir.is_dir() or box_dir.name.startswith("."):
                continue

            try:
                # Check if this box has a tag file
                tag_file = box_dir / "500304E0.json"
                if tag_file.exists():
                    import json
                    with open(tag_file) as f:
                        data = json.load(f)
                        # Extract UID from cloud_ruid
                        cloud_ruid = data.get("cloud_ruid", "")
                        file_uid = cloud_ruid[-16:].upper() if cloud_ruid else ""

                        if file_uid == request.tag_uid.upper():
                            actual_box_id = box_dir.name
                            logger.info(f"Found tag {request.tag_uid} in box directory {actual_box_id}")
                            break
            except:
                continue

        if not actual_box_id:
            # If not found, try using the provided box_id as-is (might work if it's already the MAC ID)
            actual_box_id = request.box_id
            logger.warning(f"Could not find existing tag file for {request.tag_uid}, using provided box_id: {actual_box_id}")

        # Format source path as lib:// URL
        # TAF path should be relative to library root (e.g., "Wilma_Wolkenkopf/wilmawolkenkopf.taf")
        source = f"lib://{request.taf_path}"

        # Update RFID tag JSON file
        success = scanner.update_rfid_tag(
            box_id=actual_box_id,
            uid=request.tag_uid,
            model=request.model,
            source=source,
            nocloud=True
        )

        if not success:
            raise HTTPException(status_code=500, detail="Failed to update RFID tag file")

        logger.info(f"Successfully linked tag {request.tag_uid} to {source}")
        return {
            "success": True,
            "message": f"Tag {request.tag_uid} linked to {request.taf_path}",
            "source": source
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to link RFID tag: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to link tag: {str(e)}")


@router.get("/box/{box_id}/last-ruid")
async def get_box_last_ruid(box_id: str, settings: Settings = Depends(get_settings)):
    """
    Get the last played RUID for a specific Toniebox

    Args:
        box_id: Toniebox ID

    Returns:
        Last RUID string or empty string if none
    """
    try:
        from ..services.teddycloud_client import TeddyCloudClient
        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)

        last_ruid = await client.get_last_ruid(box_id, str(settings.volumes.content_path))
        await client.close()

        return {"last_ruid": last_ruid or ""}
    except Exception as e:
        logger.error(f"Failed to get last RUID for box {box_id}: {e}")
        return {"last_ruid": ""}


@router.get("/box/{box_id}")
async def get_box_rfid_tags(box_id: str, settings: Settings = Depends(get_settings)):
    """
    Get RFID tags for a specific Toniebox

    Args:
        box_id: Toniebox ID

    Returns:
        List of RFID tags for this box
    """
    import asyncio
    from collections import defaultdict

    try:
        # Use TeddyCloud's getTagIndex API to get all tags for this box
        from ..services.teddycloud_client import TeddyCloudClient
        client = TeddyCloudClient(settings.teddycloud.url, settings.teddycloud.api_base)

        # Get the last played RUID
        last_ruid = await client.get_last_ruid(box_id, str(settings.volumes.content_path))

        # Get all tags
        tc_tags = await client.get_tag_index(box_id)

        # Load our custom tonies to match against
        tonies_custom_data = await client.get_tonies_custom_json()
        tonies_official_data = await client.get_tonies_json()

        if not tc_tags:
            await client.close()
            return RFIDTagsResponse(
                tags=[],
                total_count=0,
                unconfigured_count=0,
                unassigned_count=0,
                assigned_count=0
            )

        all_tonies = tonies_custom_data + tonies_official_data

        # PERFORMANCE: Build ALL lookup maps ONCE before processing
        tonie_by_model = {}
        tonie_by_audio_id = {}  # O(1) lookup by audio_id
        tonie_by_hash = {}  # O(1) lookup by hash
        tonie_by_source = {}  # Maps "lib://filename.taf" -> tonie

        for tonie_data in all_tonies:
            model = tonie_data.get('model')
            if model:
                tonie_by_model[model] = tonie_data

            # Build audio_id lookup (handle both list and single values)
            audio_ids = tonie_data.get('audio_id', [])
            if not isinstance(audio_ids, list):
                audio_ids = [audio_ids] if audio_ids else []
            for aid in audio_ids:
                if aid:
                    tonie_by_audio_id[str(aid)] = tonie_data

            # Build hash lookup
            hashes = tonie_data.get('hash', [])
            if not isinstance(hashes, list):
                hashes = [hashes] if hashes else []
            for h in hashes:
                if h:
                    tonie_by_hash[h.lower()] = tonie_data

        # Load TAF library to map source paths to tonies via audio_id/hash
        if settings.volumes.data_path:
            try:
                from ..services.volume_scanner import VolumeScanner
                scanner = VolumeScanner(settings.volumes.data_path)
                taf_files = scanner.scan_taf_files_recursive()

                # PERFORMANCE: Group TAF files by directory to minimize API calls
                taf_by_dir = defaultdict(list)
                for taf_file in taf_files:
                    taf_name = taf_file.get('name', '')
                    if "/" in taf_name:
                        directory = "/".join(taf_name.split("/")[:-1])
                    else:
                        directory = ""
                    taf_by_dir[directory].append(taf_file)

                # PERFORMANCE: Fetch all directories in parallel using asyncio.gather
                directories = list(taf_by_dir.keys())
                if directories:
                    file_indices = await asyncio.gather(
                        *[client.get_file_index(d) for d in directories],
                        return_exceptions=True
                    )

                    # Process results and build tonie_by_source mapping
                    for directory, file_index in zip(directories, file_indices):
                        if isinstance(file_index, Exception):
                            logger.debug(f"Failed to get file index for {directory}: {file_index}")
                            continue

                        # Build filename -> tafHeader lookup for this directory
                        api_files_by_name = {
                            f.get("name"): f.get("tafHeader", {})
                            for f in file_index.get("files", [])
                        }

                        # Process each TAF file in this directory
                        for taf_file in taf_by_dir[directory]:
                            taf_name = taf_file.get('name', '')
                            filename = taf_name.split("/")[-1] if "/" in taf_name else taf_name

                            taf_header = api_files_by_name.get(filename, {})
                            if not taf_header:
                                continue

                            audio_id = taf_header.get("audioId")
                            hash_value = taf_header.get("sha1Hash", "").lower()

                            # PERFORMANCE: O(1) lookup instead of O(n) loop
                            matched_tonie = None
                            if audio_id:
                                matched_tonie = tonie_by_audio_id.get(str(audio_id))
                            if not matched_tonie and hash_value:
                                matched_tonie = tonie_by_hash.get(hash_value)

                            if matched_tonie:
                                source_key = f"lib://{taf_name}"
                                tonie_by_source[source_key] = matched_tonie
                                logger.debug(f"Mapped source {source_key} to tonie {matched_tonie.get('model')}")

            except Exception as e:
                logger.warning(f"Could not build TAF source mapping: {e}")

        # Convert TeddyCloud tags to our RFIDTag format
        all_tags = []
        for tc_tag in tc_tags:
            # Extract tonie info from the tag
            tonie_info = tc_tag.get('tonieInfo', {})
            tag_source = tc_tag.get('source', '')
            tag_model = tonie_info.get('model', '')
            tag_ruid = tc_tag.get('ruid', 'N/A')

            # Determine status based on whether it has content
            has_source = bool(tag_source)
            has_model = bool(tag_model)

            if not has_model:
                status = "unconfigured"
            elif not has_source:
                status = "unassigned"
            else:
                status = "assigned"

            # Try to find the actual tonie from our tonies.custom.json
            # Method 1: Match by model number
            actual_tonie = tonie_by_model.get(tag_model)

            # Method 2: If not found, try matching by source path
            if not actual_tonie and tag_source:
                actual_tonie = tonie_by_source.get(tag_source)

            # Build linked tonie info from actual tonie data (not TeddyCloud's potentially wrong info)
            linked_tonie = None
            if actual_tonie:
                linked_tonie = LinkedTonie(
                    series=actual_tonie.get('series', ''),
                    title=actual_tonie.get('series', ''),
                    episodes=actual_tonie.get('episodes', ''),
                    pic=actual_tonie.get('pic', ''),
                    category=actual_tonie.get('category', 'custom')
                )
                # Update status to "assigned" since we found the tonie
                status = "assigned"
                # Update model to actual model number
                tag_model = actual_tonie.get('model', tag_model)
            elif tonie_info:
                # Fallback to TeddyCloud's info if we couldn't find the actual tonie
                linked_tonie = LinkedTonie(
                    series=tonie_info.get('series', ''),
                    title=tonie_info.get('series', ''),
                    episodes=tonie_info.get('episode', ''),
                    pic=tonie_info.get('picture', ''),
                    category='custom' if tag_model.startswith('9000') else 'official'
                )

            # Create RFIDTag
            all_tags.append(RFIDTag(
                uid=tc_tag.get('ruid', '').upper(),
                box_id=box_id,
                model=tag_model,
                source=tag_source,
                status=status,
                is_custom=tag_model.startswith('9000') if tag_model else False,
                nocloud=tc_tag.get('nocloud', False),
                linked_tonie=linked_tonie,
                last_modified=None  # TeddyCloud doesn't provide this
            ))

        await client.close()

        # Filter tags to return:
        # 1. The last played tag (if exists)
        # 2. Any unconfigured or unassigned tags (for setup)
        tags = []

        if last_ruid:
            last_ruid_upper = last_ruid.upper()
            # Find the last played tag
            last_played_tag = next((t for t in all_tags if t.uid == last_ruid_upper), None)
            if last_played_tag:
                tags.append(last_played_tag)

        # Add any unconfigured or unassigned tags (for setup)
        setup_tags = [t for t in all_tags if t.status in ('unconfigured', 'unassigned')]
        for tag in setup_tags:
            if tag not in tags:  # Don't duplicate if it's also the last played
                tags.append(tag)

        # Calculate statistics
        total = len(tags)
        unconfigured = sum(1 for t in tags if t.status == "unconfigured")
        unassigned = sum(1 for t in tags if t.status == "unassigned")
        assigned = sum(1 for t in tags if t.status == "assigned")

        # Get active tag UID (uppercase for consistency)
        active_tag_uid = last_ruid.upper() if last_ruid else None

        return RFIDTagsResponse(
            tags=tags,
            total_count=total,
            unconfigured_count=unconfigured,
            unassigned_count=unassigned,
            assigned_count=assigned,
            active_tag_uid=active_tag_uid
        )

    except Exception as e:
        logger.error(f"Failed to get RFID tags for box {box_id}: {e}")
        return RFIDTagsResponse(
            tags=[],
            total_count=0,
            unconfigured_count=0,
            unassigned_count=0,
            assigned_count=0,
            success=False,
            error=f"Failed to load RFID tags for box {box_id}: {str(e)}"
        )
