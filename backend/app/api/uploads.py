"""
API routes for file uploads
"""

import logging
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from PIL import Image
from io import BytesIO

from ..config import get_settings, Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/cover")
async def upload_cover_image(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings)
):
    """
    Upload a cover image

    Args:
        file: Image file (JPG, PNG, WEBP)

    Returns:
        Filename and path of saved image
    """
    try:
        # Validate file type
        file_ext = Path(file.filename).suffix.lower().lstrip(".")
        if file_ext not in settings.app.allowed_image_formats:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid format. Allowed: {', '.join(settings.app.allowed_image_formats)}"
            )

        # Read file
        content = await file.read()

        # Check size
        size_mb = len(content) / (1024 * 1024)
        if size_mb > settings.app.max_image_size_mb:
            raise HTTPException(
                status_code=400,
                detail=f"File too large ({size_mb:.1f}MB). Max: {settings.app.max_image_size_mb}MB"
            )

        # Validate it's a real image
        try:
            img = Image.open(BytesIO(content))
            img.verify()
            logger.info(f"Valid image: {img.size}, {img.format}")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image file: {e}")

        # Generate unique filename
        import uuid
        unique_filename = f"{uuid.uuid4().hex[:8]}_{file.filename}"

        # Save to custom_img directory
        save_path = Path(settings.volumes.custom_img_path) / unique_filename
        save_path.parent.mkdir(parents=True, exist_ok=True)

        with open(save_path, 'wb') as f:
            f.write(content)

        logger.info(f"Saved cover image: {unique_filename}")

        # Return path for TeddyCloud JSON (use configured path)
        # Remove /data prefix if present to get the relative path for JSON
        json_path = settings.volumes.custom_img_json_path
        if json_path.startswith("/data"):
            json_path = json_path[5:]  # Remove "/data" prefix

        return {
            "success": True,
            "filename": unique_filename,
            "path": f"{json_path}/{unique_filename}" if not json_path.endswith("/") else f"{json_path}{unique_filename}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to upload cover image: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/covers")
async def list_cover_images(settings: Settings = Depends(get_settings)):
    """
    List all available cover images

    Returns:
        List of cover image filenames
    """
    try:
        custom_img_path = Path(settings.volumes.custom_img_path)

        if not custom_img_path.exists():
            return {"images": []}

        images = []
        for img_file in custom_img_path.iterdir():
            # Skip hidden files, macOS metadata files, and SMB temp files
            if img_file.name.startswith('.'):
                continue

            try:
                # Check if it's a valid image file
                if img_file.is_file() and img_file.suffix.lower().lstrip(".") in settings.app.allowed_image_formats:
                    # Use configured JSON path
                    json_path = settings.volumes.custom_img_json_path
                    if json_path.startswith("/data"):
                        json_path = json_path[5:]  # Remove "/data" prefix

                    images.append({
                        "filename": img_file.name,
                        "path": f"{json_path}/{img_file.name}" if not json_path.endswith("/") else f"{json_path}{img_file.name}",
                        "size": img_file.stat().st_size
                    })
            except (OSError, PermissionError) as e:
                # Skip files that can't be accessed (permission errors, etc.)
                logger.debug(f"Skipping file {img_file.name}: {e}")
                continue

        images.sort(key=lambda x: x["filename"])

        return {"images": images}

    except Exception as e:
        logger.error(f"Failed to list cover images: {e}")
        raise HTTPException(status_code=500, detail=str(e))
